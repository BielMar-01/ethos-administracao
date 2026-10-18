# Etapa 0.6.7 — Refinamento visual premium e UX

Entrega de 18/10/2026. Próxima fase planejada: **0.7**, sem implementação iniciada.

## Objetivos e escopo

Refinar a apresentação das 13 áreas administrativas, a experiência de navegação e o design system, preservando a carteira em memória, os formulários e a integridade implementados na etapa 0.6.6. Corrigir o frontend registrado como gitlink e publicar a entrega na branch `main` do GitHub.

Não foram acrescentados módulos de negócio, banco, autenticação, integração com API, persistência ou deploy. Nenhuma regra de cálculo financeiro ou de integridade foi alterada.

## Identidade visual e tokens

- Playfair Display variável 400–600 nos títulos principais e no logotipo textual.
- Nunito Sans variável 400–700 nos textos operacionais, navegação, formulários e tabelas.
- Dois arquivos WOFF2 latinos hospedados no projeto, total aproximado de 68 KiB, carregados por `next/font/local` com preload, `display: swap` e fallback. O subconjunto inclui caracteres do português. Licenças SIL OFL preservadas em `app/fonts`.
- Paleta dark: background `#0B0B0B`, surface `#161616`, gold `#D4AF37`, texto `#FDFDFD`, sand `#F5E6D3` e borda `#2E2E2E`.
- Paleta light: background `#FFFFFF`, surface `#F9F5ED`, gold `#C9A646`, texto `#1C1C1C` e borda `#E5E5E5`.
- Tokens consolidados para cores semânticas de sucesso, atenção, erro e informação, raios, elevação, duração de transições, fontes e largura da sidebar. A escala de espaçamento existente do Tailwind foi mantida.
- Dourado empregado como acento e fundo de ação. Textos pequenos de destaque no tema claro usam foreground para preservar contraste.

## Melhorias aplicadas

### Shell e navegação

Sidebar com identificação Ethos, grupos claros, ícones uniformes, indicador dourado do item ativo e recolhimento no desktop. Os 13 links mantêm nomes acessíveis quando seus textos ficam ocultos. O recolhimento existe somente em memória e não altera os dados da carteira.

Header contextual, breadcrumbs em tablet/desktop, ações alinhadas e identificação compacta no celular. O menu mobile gerencia foco, mantém o conteúdo de fundo inerte, bloqueia a rolagem, contém a navegação por Tab e restaura o foco ao fechar. Fecha por Escape, botão, sobreposição ou navegação. Há um link de salto para o conteúdo principal.

Os links institucionais da Home que levavam ao `/login` inexistente agora abrem a demonstração em `/app/dashboard`, com rótulos explícitos. Não foi criada autenticação.

### Dashboard e listagens

`MetricCard` padroniza indicadores com acento dourado discreto, numerais tabulares, espaçamento e alinhamento financeiro. É reutilizado pelo Dashboard e pelos indicadores dos demais módulos, sem acrescentar métricas.

Cards com elevação discreta, hierarquia de títulos e cabeçalhos com tipografia institucional. Toolbar de busca/filtros organizada em bloco próprio, linhas com hover, badges semânticos, paginação separada e menus com apresentação consistente. Configuração de colunas, ordenação numérica, busca normalizada, filtros e paginação foram preservados.

Desktop mantém tabelas, enquanto tablet/mobile utiliza cards. Campos e botões respeitam as larguras disponíveis, e botões podem quebrar texto quando necessário. Formulários mobile usam controles com fonte de 16 px, evitando zoom automático de entrada em navegadores móveis compatíveis.

### Formulários, feedback e estados

Input, Select, Textarea, Button, Dialog e ActionMenu receberam aparência consistente e estados de hover, foco, erro e disabled. Mensagens continuam associadas aos campos, com texto compreensível além da cor. Os diálogos mantêm foco inicial, contenção de Tab, retorno de foco, Escape e confirmação antes de descartar alterações.

LoadingState, EmptyState e ErrorState foram alinhados ao design system. O Dashboard passou a reutilizar EmptyState quando não há atividades. Toasts mantêm regiões acessíveis e distinguem o resultado das operações em memória. Não há sucesso sem mutação válida nem atraso artificial.

Transições curtas são aplicadas a controles, cards, sidebar, menus e diálogos. `prefers-reduced-motion` reduz animações e transições, inclusive o spinner de carregamento.

## Componentes e arquivos

Criados: `components/shared/metric-card.tsx`, `hooks/use-mobile.ts`, os arquivos de fontes/licenças em `app/fonts` e `tests/visual-smoke.mjs`.

Refinados:

```text
apps/web/app/globals.css
apps/web/app/layout.tsx
apps/web/app/page.tsx
apps/web/app/(dashboard)/app/dashboard/page.tsx
apps/web/components/layout/app-shell.tsx
apps/web/components/layout/header.tsx
apps/web/components/layout/sidebar.tsx
apps/web/components/shared/page-header.tsx
apps/web/components/shared/breadcrumbs.tsx
apps/web/components/shared/module-layout.tsx
apps/web/components/shared/empty-state.tsx
apps/web/components/shared/loading-state.tsx
apps/web/components/shared/error-state.tsx
apps/web/components/data-table/data-table.tsx
apps/web/components/forms/form-field.tsx
apps/web/components/providers/demo-provider.tsx
apps/web/components/ui/button.tsx
apps/web/components/ui/card.tsx
apps/web/components/ui/badge.tsx
apps/web/components/ui/input.tsx
apps/web/components/ui/select.tsx
apps/web/components/ui/textarea.tsx
apps/web/components/ui/dialog.tsx
apps/web/components/ui/action-menu.tsx
apps/web/package.json
apps/web/tests/browser-smoke.mjs
.gitignore
```

As mudanças nos componentes compartilhados atingem Dashboard, Imóveis, Proprietários, Inquilinos, Locações, Contratos, Financeiro, Vistorias, Manutenções, Agenda, Relatórios, Notificações e Configurações. A API não foi modificada. Nenhuma dependência npm foi acrescentada.

## Validações e resultados

Executadas na raiz com `pnpm.cmd`, compatível com a política local do PowerShell:

| Comando                                          | Resultado                                     |
| ------------------------------------------------ | --------------------------------------------- |
| `pnpm.cmd --filter @ethos/web exec tsc --noEmit` | Aprovado                                      |
| `pnpm.cmd --filter @ethos/web lint`              | Aprovado, sem erros ou avisos                 |
| `pnpm.cmd --filter @ethos/web build`             | Aprovado, todas as rotas geradas              |
| `pnpm.cmd --filter @ethos/web test`              | 21 testes aprovados                           |
| `pnpm.cmd --filter @ethos/web test:browser`      | Aprovado em Chrome contra o build de produção |
| `pnpm.cmd --filter @ethos/web test:visual`       | Aprovado em Chrome contra o build de produção |

O smoke funcional percorre 13 áreas em 390, 768 e 1440 px, nos temas claro e escuro: 78 combinações, sem overflow horizontal. Também abre os oito formulários nos mesmos tamanhos/temas e verifica labels, viewport e foco. Exercita validação, cadastro dos oito domínios, edição, exclusão, dependências, cancelamento, filtros, ordenação monetária, paginação, menus por teclado, atualização entre páginas e reinício da carteira após recarregar.

O smoke visual adicional verifica fontes aplicadas, ausência de requisições HTTP externas, recolhimento da sidebar com preservação dos 13 links, foco e fundo inerte no menu mobile, restauração de foco, link de salto, redução de movimento, controles mobile e links válidos da Home. Capturas temporárias do Dashboard nos dois temas, sidebar recolhida, listagem de imóveis e formulário mobile foram geradas para inspeção visual.

Foram conferidos foco visível, labels, mensagens associadas, contraste dos tokens semânticos e estados que não dependem apenas de cor. A verificação não constitui uma auditoria completa com leitores de tela nem uma matriz de todos os navegadores.

## Problemas encontrados e resolvidos

- Frontend continuava como gitlink, embora o commit anterior mencionasse integração: substituído por arquivos reais no índice do monorepo.
- O backup preexistente `apps/web/.git-backup-web` é um arquivo, e a regra antiga ignorava apenas um diretório com esse nome: corrigido o `.gitignore` para ambos os formatos e backups similares.
- `next-env.d.ts`, gerado pelo Next, passou a ser explicitamente ignorado, assim como builds, caches e metadados já ignorados.
- Primeiro alvo retornado pelo Chrome CDP podia ser uma extensão: o smoke agora seleciona explicitamente um alvo do tipo `page`.
- CTA institucional apontava para uma rota de autenticação inexistente: redirecionado para a demonstração disponível.
- Build e navegador deixaram de depender de download externo de fontes, usando WOFF2 locais com licenças.

## Git e publicação

Branch: `main`. Remoto existente preservado: `https://github.com/BielMar-01/ethos-administracao.git`.

Na auditoria inicial, HEAD local e remoto eram `279f44582dc2d2ec8fe6054e0eb880718458f2ab`. O índice registrava `apps/web` como modo `160000`, apontando para `87ce660fae529b6a172e2c0db2c786436df49c20`.

O `.git` interno foi realocado sem sobrescrever arquivos para:

```text
C:\Projetos\ethos-administracao-git-backups\web-20261018-115623-0eca5d7066de406fa270f4f3404b23f8
```

Os 48 arquivos de metadados foram verificados por SHA-256 antes e depois da realocação. O histórico interno foi preservado integralmente. O arquivo de backup preexistente no frontend foi mantido e ignorado. Somente o gitlink foi removido do índice; os arquivos reais do frontend foram incorporados, incluindo a implementação preexistente das etapas anteriores.

O staging foi revisado para excluir `.env`, credenciais, `node_modules`, `.next`, caches, builds e backups. A correção de versionamento não descarta alterações do frontend nem modifica o histórico anterior do monorepo.

Commit da entrega:

```text
feat(web): conclui etapa 0.6.7 com refinamento visual premium e UX
```

A publicação utiliza `git push origin main`, sem force push ou alteração do remoto. O resultado é conferido comparando HEAD com `git ls-remote origin refs/heads/main`. O hash completo e o resultado efetivo da publicação constam no relatório final da execução; o próprio commit deste documento é identificado por `git log -1`.

## Execução e pendências

```powershell
pnpm.cmd --filter @ethos/web dev
```

Acessar `http://localhost:3000` ou `/app/dashboard`. Para repetir os smokes, usar as instruções de servidor local e Chrome CDP documentadas em `docs/etapa-0.6.6.md` e executar também `pnpm.cmd --filter @ethos/web test:visual`.

Não há nova persistência: registros continuam somente em memória. A implementação da fase 0.7, serviços reais, autenticação e integrações permanecem fora desta entrega.
