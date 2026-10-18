# Etapa 0.6.6 — Componentes avançados e interatividade

Entrega de 17/10/2026. Escopo limitado à interatividade demonstrativa do frontend.

## Resumo e resultado dos blocos

| Bloco           | Resultado                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A — Listagens   | DataTable reutilizável com busca, filtros, ordenação, colunas configuráveis, paginação local, contagens e ações por registro |
| B — Formulários | Oito formulários com React Hook Form e Zod, criação e edição em memória, erros acessíveis e cancelamento protegido           |
| C — Ações       | Dialog, ConfirmDialog, ActionMenu e avisos de sucesso, erro, informação e alerta                                             |
| D — Estados     | Listas vazias, nenhum resultado, erros de validação, cancelamento, exclusão bloqueada e avisos de não persistência           |
| E — Integração  | Carteira única compartilhada entre as 13 áreas, indicadores derivados e testes de lógica e navegador                         |

Home, rotas, temas, AppShell, breadcrumbs, telas 404 e estados existentes de carregamento/erro foram preservados. Não houve alteração na API, nas dependências, no monorepo ou em arquivos de ambiente. Não foram executados commits, push ou deploy. A etapa 0.6.7 não foi iniciada.

## Listagens e módulos

Busca, ordenação, filtros, paginação e ações foram integrados em:

| Módulo        | Filtros locais                |
| ------------- | ----------------------------- |
| Imóveis       | Tipo, proprietário, status    |
| Proprietários | Tipo de pessoa, status        |
| Inquilinos    | Status                        |
| Locações      | Imóvel, status                |
| Contratos     | Assinatura, status            |
| Financeiro    | Competência, status           |
| Vistorias     | Tipo, status                  |
| Manutenções   | Categoria, prioridade, status |

A busca ignora caixa e acentos e inclui identificadores, campos e vínculos apresentados. A ordenação usa números para valores monetários, datas ISO para datas e comparação de texto em pt-BR. As listagens permitem 5, 10, 20 e 50 registros por página, ajustam a página aos resultados e informam a quantidade exibida. Alterar busca ou filtros retorna à primeira página.

Desktop utiliza tabela; mobile e tablet utilizam cards e controles próprios de ordenação. As colunas iniciais foram selecionadas por domínio para legibilidade. Demais campos podem ser exibidos pelo controle de colunas e estão disponíveis nos detalhes. Indicadores sempre consideram a carteira inteira, independentemente dos filtros.

O Dashboard e a visão de Relatórios acompanham os indicadores da carteira atual. Agenda deriva compromissos dos registros e permite filtrar categoria. Notificações deriva avisos da carteira e permite filtrar categoria/leitura e marcar avisos como lidos em memória. Configurações continua informativa; relatórios, exportações e configurações reais continuam indisponíveis.

## Formulários e validação

| Formulário    | Campos                                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| Imóveis       | Nome, tipo, endereço fictício, bairro, cidade, UF, valor mensal, proprietário, status |
| Proprietários | Nome, tipo de pessoa, e-mail/telefone fictícios opcionais, status                     |
| Inquilinos    | Nome, e-mail/telefone fictícios opcionais, status                                     |
| Locações      | Imóvel, inquilino, início, término, aluguel, dia de vencimento, status                |
| Contratos     | Locação, número, início, término, assinatura, status                                  |
| Financeiro    | Locação, competência, vencimento, valor, status                                       |
| Vistorias     | Imóvel, tipo, data, responsável, situação do laudo, status                            |
| Manutenções   | Imóvel, categoria, descrição, prioridade, status, abertura, atendimento opcional      |

Os esquemas ficam em `lib/schemas`, separados em pessoas, imóveis, acordos contratuais e operações. Validam obrigatoriedade, limites de texto, e-mail/telefone quando informados, datas reais, ordem de vigência, valores monetários, casas decimais, dia entre 1 e 31, status e referências existentes. Mensagens são apresentadas em português. O formulário e a função de mutação validam os dados antes de aplicar qualquer alteração.

Não há máscara monetária complexa: CurrencyInput usa campo numérico decimal, e os valores exibidos nas listagens e indicadores usam BRL/pt-BR. Não há validação documental ou regra jurídica definitiva.

## Estado em memória e integridade

`DemoProvider` envolve o AppShell no layout administrativo. React Context compartilha uma única carteira tipada, iniciada com cópias dos dados de `lib/mock-data`. `lib/demo/store.ts` contém as mutações puras, e os seletores calculam as visões sem duplicar dados entre páginas.

As alterações sobrevivem à navegação com Next Link dentro da administração. Recarregar o documento ou sair e retornar ao layout reinicia os exemplos. Não há gravação de registros em localStorage, sessionStorage, cookies ou serviços externos. A preferência de tema mantém seu mecanismo existente. A leitura dos avisos também fica somente em memória.

Os exemplos originais foram mantidos; foram acrescentados os campos necessários aos formulários, com contatos inicialmente vazios e endereço fictício. A referência temporal continua fixa em 17/10/2026. Novos identificadores são gerados com prefixos de domínio e UUIDs; a edição preserva o identificador.

Regras implementadas:

- Não excluir proprietário com imóveis vinculados.
- Não excluir inquilino com locações vinculadas.
- Não excluir imóvel com locações, vistorias ou manutenções vinculadas.
- Não excluir locação com contratos ou cobranças vinculadas.
- Não executar exclusão em cascata.
- Validar referências em criações e edições de todos os domínios relacionados.
- Impedir duas locações ativas no mesmo imóvel.
- Recalcular ocupação quando uma locação é ativada, encerrada, transferida ou removida.
- Impedir a edição isolada de status do imóvel em contradição com a locação ativa.
- Impedir números de contrato duplicados; contrato vigente precisa estar assinado no exemplo.
- Recalcular receita, recebimentos, indicadores, agenda e avisos a partir do estado atual.

As regras são demonstrativas e não constituem um modelo definitivo do domínio imobiliário.

## Componentes, acessibilidade e organização

Componentes novos:

- `DataTable`: toolbar, busca, filtros, seleção de colunas, ordenação, paginação e estados vazios.
- `Select`, `ActionMenu`, `Dialog` e `ConfirmDialog`.
- `FormField`, `DateInput`, `CurrencyInput`, `FormActions` e `DemoForm`.
- `DemoProvider`, `useDemo` e `useDemoSnapshot`, com feedback global acessível.
- `AdministrativeModule` e `ManagementPanel`, integrando a apresentação com as ações de cada domínio.
- `FinanceSummary`, `CalendarView`, `ReportOverview` e `NotificationCenter`.

Button, Input, Textarea, Label, Card, Badge, EmptyState, PageHeader, StatCards e SectionCard foram reutilizados. LoadingState e ErrorState foram preservados.

Dialog usa o elemento nativo `dialog` com `showModal`, nome acessível, controle de foco, contenção de Tab, restauração de foco, Escape e bloqueio de rolagem compatível com confirmações aninhadas. Clicar no fundo não descarta formulários. Formulários alterados exigem confirmação para descartar; confirmações destrutivas oferecem cancelamento com foco inicial seguro. ActionMenu suporta Tab, setas, Home, End e Escape. Inputs têm labels, indicação de obrigatoriedade, `aria-invalid` e mensagens associadas. Não há atraso artificial ou requisição simulada.

As rotas e os cabeçalhos continuam em Server Components sempre que possível. Tabelas, formulários, ações e visões que precisam acompanhar Context são Client Components. O Dashboard usa um Client Component para acompanhar os indicadores compartilhados. Configurações e o catálogo informativo de relatórios mantêm apresentação no servidor.

## Arquivos principais

Criados:

```text
apps/web/
  components/
    providers/demo-provider.tsx
    data-table/data-table.tsx
    forms/
      demo-form.tsx
      form-field.tsx
    ui/
      action-menu.tsx
      dialog.tsx
      select.tsx
    shared/
      administrative-module.tsx
      management-panel.tsx
      finance-summary.tsx
      calendar-view.tsx
      report-overview.tsx
      notification-center.tsx
  lib/
    demo/
      model.ts
      store.ts
      selectors.ts
      metrics.ts
      table.ts
      config.ts
      agenda.ts
      notices.ts
    schemas/
      shared.ts
      people.ts
      property.ts
      agreements.ts
      operations.ts
      index.ts
  tests/
    register.mjs
    demo.test.mjs
    browser-smoke.mjs
docs/etapa-0.6.6.md
```

Arquivos existentes modificados:

```text
apps/web/package.json
apps/web/app/(dashboard)/app/layout.tsx
apps/web/app/(dashboard)/app/dashboard/page.tsx
apps/web/components/shared/module-layout.tsx
apps/web/components/shared/portfolio-pages.tsx
apps/web/components/shared/operations-pages.tsx
apps/web/components/shared/system-pages.tsx
```

## Testes e validações

Nenhuma dependência foi adicionada. React Hook Form 7.90.0, Zod 4.6.7 e resolvers 5.9.1 já estavam instalados; a compatibilidade foi verificada com TypeScript, build, validações e submissões no navegador. Os testes de lógica usam o test runner nativo do Node e o TypeScript já instalado para carregar os módulos, sem instalar um framework de testes.

| Comando                                          | Resultado final                                            |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `pnpm.cmd --filter @ethos/web test`              | 21 testes aprovados                                        |
| `pnpm.cmd --filter @ethos/web exec tsc --noEmit` | Aprovado                                                   |
| `pnpm.cmd --filter @ethos/web lint`              | Aprovado, sem erros ou avisos                              |
| `pnpm.cmd --filter @ethos/web build`             | Aprovado, todas as rotas geradas                           |
| `pnpm.cmd --filter @ethos/web test:browser`      | Smoke de navegador aprovado contra build de produção local |

Os testes de lógica cobrem busca, normalização, ordenação textual/monetária/data, filtros, paginação, formulários, contatos, mensagens em português, datas, identificadores, referências, bloqueios de exclusão, imutabilidade, cancelamento, recálculo de indicadores, ocupação, recebimentos, agenda e avisos.

O smoke usa Chrome via CDP e APIs nativas do Node, sem Playwright ou infraestrutura E2E adicional. Foram verificados:

- Home e as 13 rotas administrativas com HTTP 200; duas rotas desconhecidas com HTTP 404.
- 13 áreas em 390, 768 e 1440 px nos dois temas, sem overflow horizontal e com item ativo correto.
- Oito formulários nas mesmas larguras e temas, sem overflow, com labels e foco inicial no diálogo.
- Campos inválidos, contenção de Tab, restauração de foco, Escape e cancelamento com descarte protegido.
- Cadastro dos oito domínios; edição, cancelamento de exclusão, exclusão em memória e bloqueio por dependência.
- Busca, filtros, ordenação monetária e paginação na interface.
- Indicadores no Dashboard e agenda atualizados após navegação sem recarregar o documento.
- Teclado nos menus de ação; menu mobile e troca de tema.
- Ausência de registros em localStorage/sessionStorage e restauração da carteira original após recarregar.
- Nenhuma exceção JavaScript não tratada nas verificações finais.

Houve inspeção visual de capturas desktop e de formulário mobile. O smoke não substitui uma auditoria completa com leitores de tela ou uma matriz de navegadores; foi executado no Chrome local.

## Execução local

Na raiz, com o Node 24 usado nesta entrega:

```powershell
pnpm.cmd --filter @ethos/web dev
```

Acessar `http://localhost:3000/app/dashboard`. Para visualizar a Home, acessar `/`. Não é necessário iniciar a API ou configurar credenciais.

Validações reproduzíveis:

```powershell
pnpm.cmd --filter @ethos/web test
pnpm.cmd --filter @ethos/web exec tsc --noEmit
pnpm.cmd --filter @ethos/web lint
pnpm.cmd --filter @ethos/web build
```

O smoke opcional espera o build servido na porta 3066 e um Chrome dedicado com CDP na porta 9366. Em terminais separados:

```powershell
pnpm.cmd --filter @ethos/web start --port 3066
```

```powershell
$testProfile = Join-Path $env:TEMP 'ethos-066-browser'
Start-Process -FilePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' -WindowStyle Hidden -ArgumentList @(
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9366',
  ('--user-data-dir="' + $testProfile + '"'), 'about:blank'
)
pnpm.cmd --filter @ethos/web test:browser
```

Se necessário, definir `ETHOS_TEST_URL` e `ETHOS_CDP_URL` no terminal para usar outras portas locais. No ambiente restrito desta execução, o Chrome precisou de flags adicionais de sandbox/GPU; isso não altera a aplicação nem suas dependências. As capturas do smoke ficam no diretório temporário do sistema.

## Limitações e pendências

Todos os dados e ações são demonstrativos e desaparecem ao recarregar. Paginação e filtros são exclusivamente locais. Não há filtro de período para locações; status e imóvel cobrem os filtros obrigatórios. Relatórios reais, exportações, autenticação, permissões, uploads, pagamentos, assinatura digital, API e banco de dados permanecem fora do escopo. Configurações não altera dados organizacionais.

Não há pendência de validação que impeça a entrega da etapa 0.6.6. Nenhum trabalho da etapa 0.6.7 foi iniciado.
