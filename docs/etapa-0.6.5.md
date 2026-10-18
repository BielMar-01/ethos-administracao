# Etapa 0.6.5 — Páginas administrativas e navegação funcional

Implementação concluída em 17/10/2026, limitada à apresentação e navegação do frontend.

## Resultado

As 13 áreas administrativas estão disponíveis. Foram criadas 12 páginas e o Dashboard foi alinhado aos mesmos dados demonstrativos. A Home institucional foi preservada. Não houve alteração no backend, nas dependências, no monorepo ou em arquivos de ambiente.

Os exemplos usam uma referência fixa em 17/10/2026: 5 imóveis, 3 proprietários, 3 inquilinos, 3 locações, 3 contratos, 5 cobranças, 4 vistorias e 4 manutenções. A receita mensal das duas locações ativas é R$ 5.600,00. Todos os vínculos utilizam identificadores compartilhados; os indicadores são calculados a partir dos registros exibidos. Histórico financeiro de setembro e cobranças canceladas são separados dos indicadores de outubro.

## Páginas

| Rota | Conteúdo |
| --- | --- |
| `/app/dashboard` | Visão geral existente, indicadores e referências ajustados à carteira fictícia |
| `/app/properties` | Indicadores, carteira completa e prévia desabilitada de busca e situação |
| `/app/owners` | Indicadores, titulares e respectivos imóveis vinculados |
| `/app/tenants` | Locatários, imóveis, locações e vencimentos mensais |
| `/app/leases` | Vínculos comerciais, participantes, vigência, aluguel e receita contratada |
| `/app/contracts` | Ciclo documental, assinatura, vigência e locação vinculada |
| `/app/finance` | Resumo de outubro, cobranças, recebimentos históricos e pendências |
| `/app/inspections` | Programação, tipos, responsáveis fictícios e situação dos laudos |
| `/app/maintenance` | Protocolos, descrições, categorias, prioridades e acompanhamento |
| `/app/calendar` | Agenda por data derivada das vistorias, manutenções, cobranças e locações |
| `/app/reports` | Catálogo de seis relatórios futuros e estado vazio para relatórios gerados |
| `/app/notifications` | Cinco categorias de avisos e indicação estática de leitura |
| `/app/settings` | Oito áreas de configuração, com disponibilidade explícita |

## Componentes

Criados em `components/shared/module-layout.tsx`:

- `ModuleLayout`: PageHeader e aviso demonstrativo comuns aos módulos.
- `DemoDataNotice`: identificação explícita dos dados fictícios e limites operacionais.
- `StatCards`: indicadores derivados dos registros.
- `SectionCard`: seções com título semântico e descrição opcional.
- `StatusBadge`: Badge existente com apresentação institucional e texto legível.
- `RecordList`: listagem tipada com pares de rótulo/valor, responsiva e estado vazio usando EmptyState.

As apresentações dos módulos estão agrupadas por domínio em `portfolio-pages.tsx`, `operations-pages.tsx` e `system-pages.tsx`. Todas são Server Components. Interatividade permanece no shell, nos breadcrumbs e no seletor de tema existentes.

Modificados: `PageHeader`, `AppShell`, `Header`, `Sidebar` e `ThemeToggle`. O Header abre a central de notificações; a Sidebar mantém o item ativo e oculta os links do foco quando fechada no celular. O shell fecha o menu por navegação, botão, sobreposição e Escape. O ThemeToggle utiliza `useSyncExternalStore` para distinguir servidor e navegador sem atualização de estado dentro de efeito, corrigindo o erro encontrado pelo lint.

Reutilizados: Card, Badge, Input, Label, PageHeader, EmptyState, Breadcrumbs e o ThemeProvider. A navegação centralizada já continha todas as rotas e não precisou mudar. LoadingState, ErrorState e os limites de carregamento/erro do Dashboard foram preservados.

## Estrutura e arquivos criados

```text
apps/web/
  app/
    not-found.tsx
    (dashboard)/app/
      not-found.tsx
      [...unmatched]/page.tsx
      properties/page.tsx
      owners/page.tsx
      tenants/page.tsx
      leases/page.tsx
      contracts/page.tsx
      finance/page.tsx
      inspections/page.tsx
      maintenance/page.tsx
      calendar/page.tsx
      reports/page.tsx
      notifications/page.tsx
      settings/page.tsx
  components/shared/
    module-layout.tsx
    portfolio-pages.tsx
    operations-pages.tsx
    system-pages.tsx
  lib/mock-data/
    portfolio.ts
    system.ts
docs/
  etapa-0.6.5.md
```

Arquivos existentes modificados:

```text
apps/web/app/(dashboard)/app/dashboard/page.tsx
apps/web/app/globals.css
apps/web/components/shared/page-header.tsx
apps/web/components/layout/app-shell.tsx
apps/web/components/layout/header.tsx
apps/web/components/layout/sidebar.tsx
apps/web/components/ui/theme-toggle.tsx
```

As classes de tema existentes foram preservadas. Foi acrescentado um token de texto de destaque: dourado no escuro e foreground no claro, mantendo a paleta original com melhor contraste em textos pequenos. Os elementos interativos têm foco visível. As listagens não dependem de tabelas largas ou rolagem horizontal.

## Validações executadas

Comandos na raiz, usando `pnpm.cmd` porque a política local do PowerShell bloqueia o shim `pnpm.ps1`:

| Comando | Resultado |
| --- | --- |
| `pnpm.cmd --filter @ethos/web exec tsc --noEmit` | Aprovado, sem erros |
| `pnpm.cmd --filter @ethos/web lint` | Aprovado, sem erros ou avisos |
| `pnpm.cmd --filter @ethos/web build` | Aprovado, todas as páginas geradas |

Não foi necessário regenerar tipos manualmente com `next typegen`.

Verificação do build de produção com `next start`, HTTP e Chrome headless, sem instalar bibliotecas:

- Home e todas as 13 rotas administrativas retornaram HTTP 200.
- Rota administrativa desconhecida e rota global desconhecida retornaram HTTP 404.
- As 13 áreas foram verificadas em 390, 768 e 1440 px, em ambos os temas: 78 combinações, sem rolagem horizontal e com exatamente um link ativo na Sidebar.
- Conferidos abertura do menu mobile, fechamento ao navegar, fechamento por Escape e atributo `aria-expanded`.
- Confirmada navegação com Next Link sem recarregar o documento.
- Confirmada troca de tema pelo botão e apresentação administrativa de página não encontrada.
- Nenhuma exceção JavaScript não tratada foi detectada nas verificações finais.
- Inspeção visual de captura da página Financeiro em 390 px no tema claro.

Os checks de navegador foram verificações pontuais desta entrega. Não foi adicionada uma infraestrutura permanente de testes E2E. Não houve auditoria automatizada completa de acessibilidade.

## Limites e próximas etapas

A leitura dos avisos é estática. A agenda e seus agrupamentos também são estáticos, com registros derivados da carteira demonstrativa. Os relatórios e as configurações futuras aparecem como conteúdo informativo, sem controles que simulem execução. A busca e o filtro de imóveis estão explicitamente desabilitados.

Ficaram para a etapa 0.6.6 os formulários, modais de cadastro e edição, validações de cadastro, paginação funcional e filtros operacionais. CRUD, persistência, autenticação, permissões, clientes de API, uploads, assinaturas, pagamentos, exportações e integrações permanecem fora desta entrega e dependem de etapas próprias. Nenhuma etapa posterior foi iniciada.

## Executar localmente

Na raiz do projeto:

```powershell
pnpm.cmd --filter @ethos/web dev
```

Acessar `http://localhost:3000` para a Home e `http://localhost:3000/app/dashboard` para a administração. Se a porta estiver ocupada, usar a porta indicada pelo Next no terminal.

Para executar o build já validado:

```powershell
pnpm.cmd --filter @ethos/web build
pnpm.cmd --filter @ethos/web start
```

Não é necessário iniciar a API nem configurar credenciais para visualizar estas páginas.
