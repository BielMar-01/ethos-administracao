# Ambientes e segredos

Copiar os `.env.example` dos aplicativos somente para arquivos ignorados. Nunca
copiar `packages/database/.env` ou `.secrets/auth-runtime.env` para o frontend.

| Ambiente          | Banco                                                     | Origens     | Segredos                         |
| ----------------- | --------------------------------------------------------- | ----------- | -------------------------------- |
| development       | PostgreSQL descartável loopback, `ETHOS_LOCAL_DATABASE=1` | loopback    | fictícios, exclusivos dos testes |
| staging futuro    | projeto independente, referência explícita                | HTTPS exato | independentes da produção        |
| production futura | referência `wszrtvgjcgpgntsssbhd`, ativação ainda adiada  | HTTPS exato | cofre do provedor futuro         |

`APP_ENV` define o ambiente operacional; `NODE_ENV=production` define o modo do
framework e cookies seguros. Staging e production exigem ambos corretamente.
Builds locais de produção podem usar APP_ENV=development com fixtures loopback.

API: `DATABASE_URL` tenant e `AUTH_IDENTITY_DATABASE_URL` identidade com papéis
restritos; `AUTH_COOKIE_SECRET` >=32 caracteres; `AUTH_ENCRYPTION_KEY` 32 bytes base64;
`WEB_ORIGIN`/`CORS_ORIGINS` iguais e exatos; `SMTP_HOST`, `SMTP_FROM`, porta 465/587,
usuário e senha juntos quando usados. SMTP sempre TLS validado. Valores de MFA e
expiração permanecem constantes de código. Sem modo local que silencie e-mail.

`EXPECTED_DATABASE_PROJECT_REF` é obrigatório remotamente. A validação compara
host/usuário, banco e papéis. Desenvolvimento não aceita Supabase. Staging recusa
o projeto de produção. Produção só aceita o projeto previamente aprovado.
Adicionar outro projeto de produção exige revisão explícita do guard.

`API_HOST` default loopback (container: 0.0.0.0); `API_PORT` ou `PORT` 3333;
`DATABASE_POOL_SIZE` 1–20, default 5 por papel/processo (10 conexões por instância).
`TRUST_PROXY=false` obrigatório até aprovação da topologia/CIDRs. Não aceitar
X-Forwarded-For indiscriminadamente. Rate limits em memória exigem instância única
até aprovação de limitador distribuído. Worker de mail/limpeza permanece integrado;
separação/escala exige revisão de leases, concorrência e entrega pelo menos uma vez.

Web: apenas `APP_ENV`, `ETHOS_API_ORIGIN`, `ETHOS_WEB_ORIGIN`, `NODE_ENV`.
Nenhuma variável pública de segredo, URL de banco ou chave de assinatura no BFF.
Não há nova feature flag nesta etapa: política de segurança não é desligável por env.

Administração: DIRECT_DATABASE_URL somente em terminal operacional protegido,
fora do ambiente API/BFF. Nunca colocar credenciais reais no Actions. Pré-requisitos
de SMTP e ativação 0.11.1 continuam bloqueando uso real.

Rotação: cookie pode invalidar sessões; chave MFA/outbox não pode ser trocada sem
plano de recriptografia. Registrar inventário, proprietário, prazo e evidência de
rotação no cofre futuro; não registrar valores nos logs/documentos.
