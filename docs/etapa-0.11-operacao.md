# Operação segura da etapa 0.11

Este documento prepara operação futura. Não representa deploy nem autorização de alteração do Supabase. Projeto de referência: `wszrtvgjcgpgntsssbhd`. Nenhuma conexão ao projeto real foi aberta nesta etapa.

## Concorrência e reenvios

Listagens e detalhes fornecem `_etag`; GET de detalhe também fornece o header ETag. O valor é opaco e específico da organização, recurso, registro e revisão. POST de criação exige `Idempotency-Key` de 16–128 caracteres ASCII alfanuméricos, hífen ou sublinhado. PATCH e ações exigem também `If-Match` obtido da leitura original. Não usar `If-Match: *`.

| Resultado                | Significado                                               | Ação do cliente                                                                            |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 428                      | Chave ou revisão ausente                                  | Obter a revisão antes da edição; fornecer chave da tentativa                               |
| 412                      | Edição baseada em revisão antiga                          | Preservar valores, reabrir e comparar; não repetir automaticamente                         |
| 409 IDEMPOTENCY_CONFLICT | Mesma chave/operação com entrada ou precondição diferente | Conferir o resultado anterior; iniciar outra tentativa somente para uma intenção diferente |
| 201/200 em replay        | Efeito já confirmado                                      | Referência existente, novamente autorizada; não há segundo efeito                          |

O recibo guarda hashes SHA-256 da chave e da entrada canônica, vínculo, organização, operação e referência do resultado. Não copia payload, senha, token ou documento. RBAC, sessão e vínculo são revalidados antes da consulta do recibo. O replay devolve o estado atual autorizado do recurso, não uma cópia histórica da resposta original. Recibos e efeito são atômicos, com lock consultivo transacional e Serializable; conflitos têm no máximo três tentativas internas. Nenhum lock de sessão permanece no pool.

As revisões são buscadas em lote por página. Escritas fora deste serviço não avançam o contador: qualquer integração futura ou rotina administrativa que altere registros deverá participar do protocolo. A marcação de notificação como lida é monotônica e naturalmente idempotente (`readAt` existente é preservado); não exige revisão. Operações históricas proibidas continuam retornando HISTORY_IMMUTABLE. Configurações usam revisão da organização; revalidação de cache não substitui a revisão de uma edição em andamento.

Não há expiração automática de chaves nem job de limpeza privilegiado. Definir retenção antes de ativar em produção: apagar recibos permitiria reutilização de chaves antigas. O tamanho do ledger deve ser monitorado. O registro polimórfico de revisão/resultado não substitui FKs das entidades de negócio; a API exige recurso e registro existentes na organização.

## Banco e implantação futura

Migration adicional: `20261024000000_mutation_consistency`. Cria somente ResourceRevision e MutationReceipt no schema técnico, com FKs restritivas, PKs compostas, índice por organização/data, CHECKs e RLS ENABLE/FORCE. Foi aplicada exclusivamente no PostgreSQL descartável. Os cinco arquivos de migration anteriores e o SQL de negócio aprovado em 0.10.1 permanecem intactos.

Os GRANTs técnicos estão separados em `packages/database/scripts/propose-consistency-runtime.sql`: SELECT nas duas tabelas; INSERT por coluna nas duas; UPDATE somente de revision; nenhum DELETE, UPDATE do recibo, identidade, RBAC ou privilégio administrativo. O perfil `business-0.11-isolated` exige banco ethos_auth_test e endereço privado, além da guarda loopback no executor local. Não é um perfil de produção. Os perfis antigos recusam downgrade quando encontram o ledger ativo.

O código novo depende da nova estrutura técnica. **Não fazer deploy antes de uma revisão e aprovação específicas da migration/RLS/GRANTs reais.** Os scripts de ativação anteriores que exigem cinco migrations não devem ser contornados. Preparar uma ativação nova com backup atual, identificação/TLS, comparação de ACLs e ensaio completo; nenhuma execução real está autorizada por este documento.

Reprodução exclusivamente local, após criar postgres:17.11 em 127.0.0.1:55439 com o banco descartável:

```text
pnpm --filter @ethos/database db:test:auth:setup
node packages/database/scripts/setup-consistency-test.mjs
pnpm --filter @ethos/api build
pnpm --filter @ethos/api test:consistency
pnpm --filter @ethos/api test:security
pnpm --filter @ethos/api test:business
```

O setup auth é bootstrap local. Não executá-lo como reconciliação de produção. A suíte antiga de reconciliação business-0.10.1 deve ser executada em um banco recém-criado antes de ativar o perfil técnico; depois disso, a recusa ao perfil antigo é esperada.

## Backup e recuperação

O snapshot protegido da 0.10.1 foi verificado e empacotado com o manifesto de recuperação. Duas cópias locais AES-256-GCM foram criadas em `.backups/encrypted-0.11/` e `.backups/secondary/encrypted-0.11/`. A chave fica separada em `.secrets/backup-0.11.key`, nunca no Git ou nos argumentos. ACLs restritas ao usuário atual e SYSTEM são aplicadas antes de gravar a chave e o envelope no Windows; modos 0600/0700 são usados em POSIX. A verificação inicial encontrou ACL herdada ampla; os artefatos novos foram restringidos e a chave do envelope renovada antes do ensaio final.

As duas cópias no mesmo computador não protegem contra perda da máquina. Destino e responsável externos ainda dependem de orientação; nenhum envio foi realizado. Enviar somente envelope criptografado, após aprovação explícita; custodiar a chave em canal separado e testar acesso por um responsável substituto. Não enviar `.env`, senhas de conexão, certificados privados ou arquivos de runtime junto com o backup.

Recomendação operacional a aprovar: backup diário dos três schemas e dados, mais snapshot antes de migrations/GRANTs; sete diários, quatro semanais e doze mensais, sujeitos à política de retenção/LGPD da organização; ensaio mensal e antes de ativação. RPO alvo de 24 horas e RTO alvo de quatro horas são objetivos propostos, não garantias medidas. O snapshot existente é histórico, não comprova a atualidade dos dados reais hoje. Atualizar backup antes de qualquer futura ativação.

O envelope contém dump e manifesto de funções, políticas, papéis e ACLs necessários à recuperação. Não contém senhas dos papéis de conexão. Dados de autenticação armazenados no banco, como hashes de senha, continuam sensíveis e só devem ser manipulados no ambiente protegido. Credenciais de conexão e chaves operacionais devem ser recuperadas por procedimento separado e rotacionadas conforme o incidente.

O ensaio usa PostgreSQL 17.11 sem rede e sem portas publicadas, recria papéis sem senhas, restaura com pg_restore --exit-on-error e compara hashes de dados por tabela, catálogo, RLS e privilégios efetivos. Só normaliza as duas equivalências textuais já testadas em 0.10.1. Não executar restore contra o Supabase como teste. Depois do ensaio, o container e seus volumes são removidos. O dump descriptografado circula em memória/pipe, sem nova cópia em claro no disco.

```text
node packages/database/scripts/rehearse-business-backup.mjs stage-0.10.1-b377f036-b23d-4c3c-b74d-9d6e76f2a9a8 --encrypted
```

O script de criptografia é deliberadamente vinculado ao snapshot revisado e recusa sobrescrita normal. `--renew-local-key` renova apenas esse envelope local; conservar os backups originais íntegros até validar a nova restauração. Não usar como agendador genérico de produção.

## Observabilidade e API

IDs de correlação UUID são gerados pelo servidor e retornados em x-request-id; o header recebido não decide a identidade do log. Logs estruturados omitem query string, headers de credenciais e payloads. O 404 personalizado evita que a mensagem padrão inclua a URL completa. Rejeições usam código e evento, sem erro bruto do driver; falhas de pool e manutenção usam eventos genéricos. Os eventos de autenticação/auditoria existentes permanecem no banco. /api/v1/health é liveness, não uma comprovação de prontidão do banco.

Swagger UI e sua rota JSON ficam disponíveis somente fora de NODE_ENV=production. O contrato operacional acima complementa o inventário OpenAPI; ainda não há schemas completos de resposta de negócio no Swagger. Payload geral limitado a 64 KiB, paginação máxima 100, ordenação por allowlist, Zod estrito, Helmet, CSRF e CORS permanecem ativos. Documentos continuam apenas metadados; não existe upload de conteúdo nesta etapa.

Sem contratar serviço: recomenda-se coletar taxas de 5xx/401/403/429, latência p95, falhas de pool/manutenção, tamanho do ledger e resultado/idade do backup; alertar falha repetida, backup com mais de 24h e falha de restauração. Responsável operacional e limiares de produção ainda devem ser definidos. Logs de aplicação: proposta de 30 dias com acesso restrito; auditoria e eventos de segurança seguem retenção própria a aprovar. Não enviar dados pessoais a coletores sem avaliação e autorização.

Rate limit por IP continua em memória por processo e trustProxy=false. Antes de múltiplas instâncias, definir proxy confiável e armazenamento compartilhado de quotas. Não alegar proteção distribuída já implantada. Não existe monitoramento externo ativo, alerta externo ou deploy nesta entrega.

## Dependências

Overrides delimitados corrigem lodash 4.18.1, fast-uri 3.1.9 e 4.2.3, preservando as majors. Prisma continua 7.10.1. A auditoria local anterior tinha 1 alerta alto, 6 moderados e 4 baixos; a posterior retornou zero. Isso é resultado do advisory registry consultado, não garantia de ausência de vulnerabilidades desconhecidas. Referências: [aviso de template lodash](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) e [aviso de prototype pollution](https://github.com/advisories/GHSA-f23m-r3pf-42rh).
