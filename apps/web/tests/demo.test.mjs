import test from "node:test";
import assert from "node:assert/strict";
import { initialState } from "../lib/demo/model.ts";
import {
  saveRecord,
  removeRecord,
  deletionBlock,
  integrityIssues,
} from "../lib/demo/store.ts";
import { configs, defaults } from "../lib/demo/config.ts";
import { snapshot } from "../lib/demo/selectors.ts";
import { schemas } from "../lib/schemas/index.ts";
import { queryRows } from "../lib/demo/table.ts";
import { metrics } from "../lib/demo/metrics.ts";
import { agendaEvents } from "../lib/demo/agenda.ts";
import { portfolioNotices } from "../lib/demo/notices.ts";

function saved(state, domain, values, id) {
  const result = saveRecord(state, domain, values, id);
  assert.equal(result.ok, true, result.message);
  return result.state;
}
function values(state, domain, index = 0) {
  return defaults(configs(state)[domain], state[domain][index]);
}
const ownerValues = {
  name: "Pessoa Exemplo",
  type: "Pessoa física",
  email: "teste@example.com",
  phone: "",
  status: "Ativo",
};

test("a carteira inicial é íntegra e cada sessão recebe uma cópia independente", () => {
  const first = initialState(),
    second = initialState();
  assert.deepEqual(integrityIssues(first), []);
  first.owners[0].name = "Outra pessoa";
  assert.notEqual(first.owners[0].name, second.owners[0].name);
});

const rows = [
  {
    id: "a",
    name: "São JARDINS",
    rent: 100,
    date: "2026-10-20",
    status: "Ativo",
  },
  {
    id: "b",
    name: "Casa Azul",
    rent: 20,
    date: "2026-01-10",
    status: "Inativo",
  },
  {
    id: "c",
    name: "Casa Branca",
    rent: 2.5,
    date: "2027-02-01",
    status: "Ativo",
  },
];
const table = (overrides = {}) =>
  queryRows(rows, {
    search: "",
    searchText: (r) => r.name,
    page: 1,
    pageSize: 5,
    ...overrides,
  });
test("busca ignora caixa e acentos", () =>
  assert.deepEqual(
    table({ search: "SAO jardins" }).rows.map((r) => r.id),
    ["a"],
  ));
test("busca e filtros são combinados sem alterar a lista original", () => {
  const result = table({
    search: "casa",
    filters: [{ value: "Ativo", get: (r) => r.status }],
  });
  assert.deepEqual(
    result.rows.map((r) => r.id),
    ["c"],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["a", "b", "c"],
  );
});
test("ordena valores monetários numericamente nas duas direções", () => {
  assert.deepEqual(
    table({ sort: { get: (r) => r.rent, direction: "asc" } }).rows.map(
      (r) => r.rent,
    ),
    [2.5, 20, 100],
  );
  assert.deepEqual(
    table({ sort: { get: (r) => r.rent, direction: "desc" } }).rows.map(
      (r) => r.rent,
    ),
    [100, 20, 2.5],
  );
});
test("ordena datas estruturadas e texto", () => {
  assert.deepEqual(
    table({ sort: { get: (r) => r.date, direction: "asc" } }).rows.map(
      (r) => r.id,
    ),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    table({ sort: { get: (r) => r.name, direction: "asc" } }).rows.map(
      (r) => r.id,
    ),
    ["b", "c", "a"],
  );
});
test("pagina, limita a página após filtros e diferencia nenhum resultado", () => {
  assert.equal(table({ pageSize: 1, page: 2 }).rows[0].id, "b");
  assert.equal(table({ pageSize: 1, page: 3, search: "Azul" }).page, 1);
  assert.deepEqual(table({ search: "inexistente" }).rows, []);
  assert.equal(table({ search: "inexistente" }).totalPages, 1);
  for (const pageSize of [5, 10, 20, 50])
    assert.equal(table({ pageSize }).total, 3);
});

test("os oito formulários aceitam os registros iniciais", () => {
  const state = initialState();
  for (const domain of Object.keys(configs(state)))
    assert.equal(
      schemas(state)[domain].safeParse(values(state, domain)).success,
      true,
      domain,
    );
});
test("campos obrigatórios, tipos e status desconhecidos são rejeitados", () => {
  const state = initialState(),
    schema = schemas(state);
  for (const patch of [
    { name: "" },
    { type: "Outro" },
    { rent: -1 },
    { rent: "20" },
    { rent: 0.001 },
    { status: "Desconhecido" },
  ])
    assert.equal(
      schema.properties.safeParse({ ...values(state, "properties"), ...patch })
        .success,
      false,
    );
});
test("contatos opcionais são aceitos e e-mail/telefone inválidos são rejeitados", () => {
  const schema = schemas(initialState()).owners;
  assert.equal(schema.safeParse({ ...ownerValues, email: "" }).success, true);
  assert.equal(
    schema.safeParse({ ...ownerValues, email: "email-invalido" }).success,
    false,
  );
  assert.equal(
    schema.safeParse({ ...ownerValues, phone: "abc" }).success,
    false,
  );
});

test("erros de contato são apresentados em português", () => {
  const result = schemas(initialState()).tenants.safeParse({
    name: "Pessoa Exemplo",
    email: "incorreto",
    phone: "",
    status: "Ativo",
  });
  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].message, "Informe um e-mail válido.");
});
test("datas reais, ordem de vigência, dinheiro e vencimento são validados", () => {
  const state = initialState(),
    schema = schemas(state),
    lease = values(state, "leases");
  for (const patch of [
    { start: "2026-02-30" },
    { start: "2027-01-01", end: "2026-12-31" },
    { dueDay: 0 },
    { dueDay: 32 },
    { dueDay: 1.5 },
    { rent: 0 },
  ])
    assert.equal(
      schema.leases.safeParse({ ...lease, ...patch }).success,
      false,
    );
  assert.equal(
    schema.leases.safeParse({
      ...lease,
      start: "2028-02-29",
      end: "2028-02-29",
      dueDay: 31,
    }).success,
    true,
  );
  assert.equal(
    schema.contracts.safeParse({
      ...values(state, "contracts"),
      end: "2020-01-01",
    }).success,
    false,
  );
  assert.equal(
    schema.charges.safeParse({
      ...values(state, "charges"),
      period: "Outubro/2026",
    }).success,
    true,
  );
  assert.equal(
    schema.charges.safeParse({ ...values(state, "charges"), period: "13/2026" })
      .success,
    false,
  );
});
test("todos os vínculos são validados antes de salvar", () => {
  const state = initialState();
  for (const [domain, field] of [
    ["properties", "ownerId"],
    ["leases", "propertyId"],
    ["leases", "tenantId"],
    ["contracts", "leaseId"],
    ["charges", "leaseId"],
    ["inspections", "propertyId"],
    ["maintenance", "propertyId"],
  ])
    assert.equal(
      saveRecord(state, domain, {
        ...values(state, domain),
        [field]: "inexistente",
      }).ok,
      false,
      `${domain}.${field}`,
    );
  assert.deepEqual(integrityIssues(state), []);
});
test("criação e edição têm identificadores únicos, são imutáveis e recalculam indicadores", () => {
  const original = initialState();
  let state = original;
  for (let i = 0; i < 25; i++) state = saved(state, "owners", ownerValues);
  assert.equal(
    new Set(state.owners.map((r) => r.id)).size,
    state.owners.length,
  );
  assert.equal(original.owners.length, 3);
  assert.equal(metrics("owners", state)[0].value, 28);
  state = saved(
    state,
    "owners",
    { ...values(state, "owners"), name: "Nome Alterado" },
    "PRO-001",
  );
  assert.equal(
    snapshot(state).owner(snapshot(state).property("IMO-001").ownerId).name,
    "Nome Alterado",
  );
  assert.notEqual(original.owners[0].name, "Nome Alterado");
  assert.deepEqual(integrityIssues(state), []);
});
test("exclusão bloqueia proprietário, imóvel, inquilino e locação vinculados", () => {
  const state = initialState();
  for (const [domain, id] of [
    ["owners", "PRO-001"],
    ["properties", "IMO-001"],
    ["properties", "IMO-003"],
    ["tenants", "INQ-001"],
    ["leases", "LOC-001"],
  ]) {
    assert.ok(deletionBlock(state, domain, id));
    assert.equal(removeRecord(state, domain, id).ok, false);
  }
  assert.deepEqual(integrityIssues(state), []);
});
test("locações são protegidas separadamente por contratos e cobranças", () => {
  const state = initialState();
  assert.ok(deletionBlock({ ...state, contracts: [] }, "leases", "LOC-001"));
  assert.ok(deletionBlock({ ...state, charges: [] }, "leases", "LOC-001"));
});
test("exclusão sem dependências remove apenas o registro escolhido", () => {
  const state = saved(initialState(), "owners", ownerValues);
  const id = state.owners.at(-1).id;
  const result = removeRecord(state, "owners", id);
  assert.equal(result.ok, true);
  assert.equal(result.state.owners.length, 3);
  assert.equal(state.owners.length, 4);
});
test("cancelar um formulário não aplica os valores nem modifica a carteira", () => {
  const state = initialState(),
    before = structuredClone(state);
  const draft = values(state, "properties");
  draft.name = "Alteração descartada";
  assert.deepEqual(state, before);
  assert.equal(removeRecord(state, "owners", "inexistente").ok, false);
  assert.equal(
    saveRecord(state, "owners", ownerValues, "inexistente").ok,
    false,
  );
});
test("alterar locação recalcula ocupação e receita de toda a carteira", () => {
  let state = initialState();
  state = saved(
    state,
    "leases",
    { ...values(state, "leases"), status: "Encerrada" },
    "LOC-001",
  );
  assert.equal(snapshot(state).property("IMO-001").status, "Disponível");
  assert.equal(snapshot(state).contractedRevenue, 3200);
  state = saved(
    state,
    "leases",
    { ...values(state, "leases"), status: "Ativa", rent: 2500 },
    "LOC-001",
  );
  assert.equal(snapshot(state).contractedRevenue, 5700);
  assert.equal(metrics("properties", state)[1].value, 2);
  assert.deepEqual(integrityIssues(state), []);
});
test("impede ocupação duplicada, status de imóvel inconsistente e contrato duplicado", () => {
  const state = initialState();
  assert.equal(saveRecord(state, "leases", values(state, "leases")).ok, false);
  assert.equal(
    saveRecord(
      state,
      "properties",
      { ...values(state, "properties"), status: "Disponível" },
      "IMO-001",
    ).ok,
    false,
  );
  assert.equal(
    saveRecord(state, "contracts", values(state, "contracts")).ok,
    false,
  );
  assert.equal(
    saveRecord(
      state,
      "contracts",
      { ...values(state, "contracts"), signature: "Rascunho" },
      "CTR-001",
    ).ok,
    false,
  );
});
test("pagamento demonstrativo atualiza recebimentos e avisos com data fixa", () => {
  const before = initialState();
  const after = saved(
    before,
    "charges",
    { ...values(before, "charges"), status: "Pago" },
    "COB-001",
  );
  assert.equal(after.charges[0].paidOn, "2026-10-17");
  assert.equal(
    snapshot(after).sumCharges(
      snapshot(after).octoberCharges.filter((r) => r.status === "Pago"),
    ),
    2400,
  );
  assert.equal(
    portfolioNotices(after).some((r) => r.id === "payment-COB-001"),
    false,
  );
  assert.equal(before.charges[0].status, "Atrasado");
});
test("agenda acompanha edição e exclusão de operações sem vínculos órfãos", () => {
  const before = initialState();
  const after = saved(
    before,
    "inspections",
    { ...values(before, "inspections"), date: "2026-10-25" },
    "VIS-001",
  );
  assert.equal(
    agendaEvents(after).find((r) => r.id === "VIS-001").date,
    "2026-10-25",
  );
  const result = removeRecord(after, "inspections", "VIS-001");
  assert.equal(result.ok, true);
  assert.equal(
    agendaEvents(result.state).some((r) => r.id === "VIS-001"),
    false,
  );
  assert.deepEqual(integrityIssues(result.state), []);
});
