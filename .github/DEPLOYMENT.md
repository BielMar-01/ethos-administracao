# Publicação futura — desativada

O workflow Quality executa somente verificações, sem environments, credenciais
remotas, registry, deploy ou migrations reais. Não há workflow de publicação.
Actions fixadas por SHA, contents:read, checkout sem persistência de token,
concorrência por ref e cancelamento seguro porque recursos são descartáveis.

Após autorização específica: configurar branch protection com check Quality,
aprovar provedor da API e staging independente, concluir 0.11.1, testar recuperação,
criar environments separados e aprovação humana de produção. Preferir identidade
temporária/OIDC quando suportada; nunca reutilizar segredo de produção em PR.

Vercel: Root Directory `apps/web`, Node 24 compatível, incluir arquivos externos
ao root do monorepo, configurações em apps/web/vercel.json. Build Turbo inclui
contracts. Git deploymentEnabled=false: não conectar/publicar nesta etapa.
Origens HTTPS fixas por ambiente, sem curingas de preview para cookies/CSRF.
Publicar preview somente contra futura API/banco staging independente.

API persistente: avaliar Render, Railway ou VPS/container. Render/Railway reduzem
operação de processo/TLS; VPS exige patching, proxy, firewall, backups e monitoria
próprios. Não se decidiu provedor, plano, custo ou região. Confirmar IPv6/egress,
limites de conexões, TLS, retenção de logs e SIGTERM antes da contratação.

Imagem: `docker build -f apps/api/Dockerfile -t ethos-api:local .`; não publicar.
Runtime futuro recebe env exclusivo API e nenhum DIRECT_DATABASE_URL. Executar
read-only filesystem, cap-drop ALL, no-new-privileges, tmpfs /tmp, stop timeout >=35s.
Não executar provisioning/migrations como entrypoint. Docker contém Node/deps,
mas não scripts operacionais, credenciais ou backups. Patches exigem novo build.

Sequência futura: backup criptografado+segunda cópia e restauração isolada; aprovação
da migration/grants; conferir hashes e histórico; aplicar manualmente com credencial
administrativa; verificar RLS/privilégios; iniciar API candidata e readiness; smoke
staging; aprovação produção; publicar versões API/BFF compatíveis. Sem automação ativa.
Reversão de aplicação só para versão compatível com schema. Nunca down migration
destrutiva automática. Em corrupção, interromper escrita e aprovar recuperação
para banco separado a partir do backup; validar antes de redirecionar tráfego.

Fontes: [GitHub segurança](https://docs.github.com/en/actions/reference/security/secure-use),
[Vercel monorepo](https://vercel.com/docs/monorepos),
[Vercel Git](https://vercel.com/docs/project-configuration/git-configuration),
[Fastify servidor](https://fastify.dev/docs/latest/Reference/Server/),
[Render](https://render.com/docs/deploy-node-fastify-app),
[Railway](https://docs.railway.com/guides/fastify).
