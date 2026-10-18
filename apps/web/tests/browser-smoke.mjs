// Optional smoke checks against a locally running production build and Chrome CDP.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const base = process.env.ETHOS_TEST_URL ?? "http://localhost:3066";
const cdp = process.env.ETHOS_CDP_URL ?? "http://127.0.0.1:9366";
const routes = [
  "dashboard",
  "properties",
  "owners",
  "tenants",
  "leases",
  "contracts",
  "finance",
  "inspections",
  "maintenance",
  "calendar",
  "reports",
  "notifications",
  "settings",
];
const managed = [
  "properties",
  "owners",
  "tenants",
  "leases",
  "contracts",
  "finance",
  "inspections",
  "maintenance",
];
const tab = (await (await fetch(`${cdp}/json`)).json()).find(
  (target) => target.type === "page",
);
assert.ok(tab, "Chrome deve disponibilizar uma aba de página para o smoke.");
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve) =>
  ws.addEventListener("open", resolve, { once: true }),
);
let sequence = 0;
const pending = new Map();
const errors = [];
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const handler = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handler.reject(Error(JSON.stringify(message.error)));
    else handler.resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown")
    errors.push(message.params.exceptionDetails.text);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails)
    throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await delay(50);
  }
  throw Error(`Timed out: ${expression}`);
}
async function goto(route) {
  await send("Page.navigate", { url: `${base}/app/${route}` });
  await until(
    `location.pathname === '/app/${route}' && document.readyState === 'complete' && !!document.querySelector('h1')`,
  );
  await delay(100);
}
async function navigate(route) {
  await evaluate(
    `document.querySelector('aside a[href="/app/${route}"]').click()`,
  );
  await until(`location.pathname === '/app/${route}'`);
  await delay(150);
}
async function click(text) {
  await evaluate(
    `(() => {const scope=[...document.querySelectorAll('dialog[open]')].at(-1)??document;const button = [...scope.querySelectorAll('button')].find(e => e.getClientRects().length && e.textContent.trim() === ${JSON.stringify(text)}); if(!button) throw Error('Button missing: '+${JSON.stringify(text)}); button.focus();button.click();})()`,
  );
  await delay(80);
}
async function fill(values) {
  await evaluate(
    `(() => { const values=${JSON.stringify(values)}; for(const [name,value] of Object.entries(values)){const field=document.querySelector('dialog[open] [name="'+name+'"]');if(!field)throw Error('Field missing: '+name); const prototype=field.tagName==='SELECT'?HTMLSelectElement.prototype:field.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,String(value));field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));}})()`,
  );
  await delay(50);
}
async function search(value) {
  await evaluate(
    `(() => {const field=document.querySelector('input[type="search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await delay(100);
}
async function openNew() {
  await evaluate(
    `(() => {const button=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Novo exemplo de'));button.focus();button.click();})()`,
  );
  await until(`!!document.querySelector('dialog[open]')`);
}
async function create(values) {
  await openNew();
  await fill(values);
  await click("Salvar exemplo em memória");
  await until(`!document.querySelector('dialog[open]')`);
}
async function rowAction(text) {
  await evaluate(
    `[...document.querySelectorAll('summary[aria-haspopup="menu"]')].find(e=>e.getClientRects().length).click()`,
  );
  await click(text);
}
async function viewport(width) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

try {
  await send("Page.enable");
  await send("Runtime.enable");
  for (const route of [
    "/",
    ...routes.map((route) => `/app/${route}`),
    "/app/not-a-route",
    "/not-a-route",
  ])
    assert.equal(
      (await fetch(base + route)).status,
      route.includes("not-a-route") ? 404 : 200,
      route,
    );
  for (const width of [390, 768, 1440]) {
    await viewport(width);
    for (const route of routes) {
      await goto(route);
      for (const theme of ["light", "dark"]) {
        await evaluate(
          `document.documentElement.setAttribute('data-theme','${theme}')`,
        );
        assert.equal(
          await evaluate("document.documentElement.scrollWidth > innerWidth"),
          false,
          `${route}: overflow ${width}/${theme}`,
        );
        assert.equal(
          await evaluate(
            `document.querySelectorAll('a[aria-current="page"]').length`,
          ),
          1,
          route,
        );
        if (managed.includes(route)) {
          await openNew();
          assert.equal(
            await evaluate(
              `(() => {const dialog=document.querySelector('dialog[open]');return dialog.scrollWidth>dialog.clientWidth+1||dialog.getBoundingClientRect().width>innerWidth;})()`,
            ),
            false,
            `${route}: modal overflow ${width}/${theme}`,
          );
          assert.equal(
            await evaluate(`!!document.activeElement.closest('dialog[open]')`),
            true,
            "dialog initial focus",
          );
          assert.equal(
            await evaluate(
              `[...document.querySelectorAll('dialog[open] input,dialog[open] select,dialog[open] textarea')].every(field=>field.labels.length>0)`,
            ),
            true,
            "field labels",
          );
          await send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
            nativeVirtualKeyCode: 27,
          });
          await send("Input.dispatchKeyEvent", {
            type: "keyUp",
            key: "Escape",
            code: "Escape",
            windowsVirtualKeyCode: 27,
            nativeVirtualKeyCode: 27,
          });
          await until(`!document.querySelector('dialog[open]')`);
        }
      }
    }
    console.log(
      `13 áreas e 8 formulários · temas claro/escuro · ${width}px: OK`,
    );
  }

  await viewport(1440);
  await goto("properties");
  await openNew();
  await click("Salvar exemplo em memória");
  assert.ok(
    await evaluate(
      `document.querySelectorAll('dialog[open] [aria-invalid="true"]').length`,
    ),
    "invalid form",
  );
  assert.equal(
    await evaluate(`!!document.activeElement.closest('dialog[open]')`),
    true,
  );
  for (let i = 0; i < 18; i++) {
    await send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    await send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    assert.equal(
      await evaluate(`!!document.activeElement.closest('dialog[open]')`),
      true,
      "modal focus trap",
    );
  }
  await click("Cancelar");
  assert.ok(
    await evaluate(
      `document.activeElement.textContent.startsWith('Novo exemplo de')`,
    ),
    "focus restored to trigger",
  );
  await openNew();
  await fill({ name: "Descartar Exemplo" });
  await click("Cancelar");
  assert.equal(
    await evaluate(`document.querySelectorAll('dialog[open]').length`),
    2,
    "dirty form confirmation",
  );
  await click("Cancelar");
  assert.equal(
    await evaluate(`document.querySelectorAll('dialog[open]').length`),
    1,
    "return to dirty form",
  );
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
  });
  await click("Descartar alterações");
  assert.equal(
    await evaluate(`document.querySelectorAll('dialog[open]').length`),
    0,
  );
  assert.notEqual(
    await evaluate(`document.body.style.overflow`),
    "hidden",
    "scroll unlocked after nested dialogs",
  );

  const forms = {
    properties: {
      name: "Imóvel Teste UI",
      type: "Casa",
      address: "Rua Fictícia, s/n",
      region: "Bairro Exemplo",
      city: "Cidade Exemplo",
      state: "SP",
      rent: 2800,
      ownerId: "PRO-001",
      status: "Disponível",
    },
    owners: {
      name: "Proprietário Teste UI",
      type: "Pessoa física",
      email: "ui@example.com",
      phone: "",
      status: "Ativo",
    },
    tenants: {
      name: "Inquilino Teste UI",
      email: "ui@example.com",
      phone: "",
      status: "Ativo",
    },
    leases: {
      propertyId: "IMO-003",
      tenantId: "INQ-001",
      start: "2026-10-17",
      end: "2027-10-17",
      rent: 3000,
      dueDay: 12,
      status: "Ativa",
    },
    contracts: {
      leaseId: "LOC-001",
      number: "CTR-TESTE-UI",
      start: "2026-10-17",
      end: "2027-10-17",
      signature: "Rascunho",
      status: "Rascunho",
    },
    finance: {
      leaseId: "LOC-001",
      period: "Novembro/2026",
      due: "2026-11-10",
      value: 1000,
      status: "Pendente",
    },
    inspections: {
      propertyId: "IMO-003",
      type: "Entrada",
      date: "2026-10-25",
      responsible: "Equipe Teste UI",
      report: "Pendente",
      status: "Agendada",
    },
    maintenance: {
      propertyId: "IMO-003",
      category: "Teste UI",
      description: "Reparo fictício para validação da interface.",
      priority: "Média",
      status: "Aberta",
      opened: "2026-10-17",
      scheduled: "2026-10-26",
    },
  };
  await evaluate("window.__ethosDocument = 66");
  for (const [route, values] of Object.entries(forms)) {
    await navigate(route);
    await create(values);
    assert.equal(
      await evaluate("window.__ethosDocument"),
      66,
      "client navigation preserves document",
    );
    assert.ok(
      await evaluate(
        `document.body.textContent.includes('Exemplo salvo somente em memória')`,
      ),
    );
    console.log(`Cadastro em memória: ${route} OK`);
  }
  await navigate("dashboard");
  assert.ok(
    await evaluate(
      `document.querySelector('main').textContent.includes('8.600')`,
    ),
    "dashboard shared revenue",
  );
  await navigate("calendar");
  assert.ok(
    await evaluate(
      `document.querySelector('main').textContent.includes('25/10/2026')`,
    ),
    "calendar shared date",
  );
  await navigate("owners");
  await create({ ...forms.owners, name: "Pessoa Extra A" });
  await create({ ...forms.owners, name: "Pessoa Extra B" });
  await click("Próxima");
  assert.ok(
    await evaluate(
      `document.querySelector('main').textContent.includes('Página 2 de 2')`,
    ),
  );
  await search("PROPRIETARIO TESTE");
  assert.ok(
    await evaluate(
      `document.querySelector('main').textContent.includes('Página 1 de 1')`,
    ),
  );
  await rowAction("Editar exemplo");
  await fill({ name: "Nome Editado UI" });
  await click("Salvar exemplo em memória");
  await until(`!document.querySelector('dialog[open]')`);
  await search("Nome Editado UI");
  assert.ok(
    await evaluate(
      `document.querySelector('tbody').textContent.includes('Nome Editado UI')`,
    ),
  );
  await rowAction("Excluir exemplo");
  await click("Cancelar");
  assert.ok(
    await evaluate(
      `document.querySelector('tbody').textContent.includes('Nome Editado UI')`,
    ),
  );
  await rowAction("Excluir exemplo");
  await click("Confirmar exclusão demonstrativa");
  assert.ok(
    await evaluate(
      `document.querySelector('main').textContent.includes('Nenhum resultado encontrado')`,
    ),
  );
  await search("Helena");
  await rowAction("Excluir exemplo");
  assert.ok(
    await evaluate(`document.body.textContent.includes('Exclusão bloqueada')`),
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('dialog[open]').length`),
    0,
  );
  await search("sem-correspondencia");
  assert.ok(
    await evaluate(
      `document.querySelector('main').textContent.includes('Nenhum resultado encontrado')`,
    ),
  );
  await click("Limpar busca e filtros");
  await evaluate(
    `[...document.querySelectorAll('summary[aria-haspopup="menu"]')].find(e=>e.getClientRects().length).focus()`,
  );
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowDown",
    code: "ArrowDown",
    windowsVirtualKeyCode: 40,
  });
  assert.equal(
    await evaluate(`document.activeElement.textContent`),
    "Visualizar",
  );
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowUp",
    code: "ArrowUp",
    windowsVirtualKeyCode: 38,
  });
  assert.equal(
    await evaluate(`document.activeElement.textContent`),
    "Excluir exemplo",
  );
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  assert.equal(await evaluate(`document.activeElement.tagName`), "SUMMARY");

  await navigate("properties");
  await evaluate(
    `(() => {const label=[...document.querySelectorAll('label')].find(l=>l.textContent==='Status');label.control.value='Inativo';label.control.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await delay(100);
  assert.ok(
    await evaluate(
      `document.querySelector('tbody').textContent.includes('Casa do Lago')`,
    ),
  );
  assert.equal(
    await evaluate(
      `document.querySelector('tbody').textContent.includes('Apartamento Aurora')`,
    ),
    false,
  );
  await click("Limpar busca e filtros");
  await evaluate(
    `document.querySelector('label[for$="-size"]').control.value='50';document.querySelector('label[for$="-size"]').control.dispatchEvent(new Event('change',{bubbles:true}))`,
  );
  await delay(80);
  await evaluate(
    `[...document.querySelectorAll('thead button')].find(b=>b.textContent.includes('Valor mensal')).click()`,
  );
  await delay(80);
  const sortedAmounts = async () =>
    evaluate(
      `(() => {const headers=[...document.querySelectorAll('thead th')];const index=headers.findIndex(th=>th.textContent.includes('Valor mensal'));return [...document.querySelectorAll('tbody tr')].map(tr=>Number(tr.children[index].textContent.replace(/[^0-9,]/g,'').replace(',','.')));})()`,
    );
  const ascending = await sortedAmounts();
  assert.deepEqual(
    ascending,
    [...ascending].sort((a, b) => a - b),
  );
  await evaluate(
    `[...document.querySelectorAll('thead button')].find(b=>b.textContent.includes('Valor mensal')).click()`,
  );
  await delay(80);
  assert.deepEqual(await sortedAmounts(), [...ascending].reverse());

  await viewport(390);
  await navigate("owners");
  await evaluate(
    `document.querySelector('button[aria-label="Abrir menu"]').click()`,
  );
  await delay(80);
  assert.equal(
    await evaluate(
      `document.querySelector('button[aria-label="Abrir menu"]').getAttribute('aria-expanded')`,
    ),
    "true",
  );
  await navigate("tenants");
  assert.equal(
    await evaluate(
      `document.querySelector('button[aria-label="Abrir menu"]').getAttribute('aria-expanded')`,
    ),
    "false",
  );
  await openNew();
  await fill({ name: "Exemplo Mobile" });
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    join(tmpdir(), "ethos-066-mobile-form.png"),
    Buffer.from(screenshot.data, "base64"),
  );
  await click("Cancelar");
  await click("Descartar alterações");
  const theme = await evaluate(
    `document.documentElement.getAttribute('data-theme')`,
  );
  await evaluate(
    `document.querySelector('button[aria-label^="Ativar tema"]').click()`,
  );
  await delay(100);
  assert.notEqual(
    await evaluate(`document.documentElement.getAttribute('data-theme')`),
    theme,
  );
  assert.deepEqual(
    await evaluate(
      `Object.keys(localStorage).filter(key=>!/theme/i.test(key))`,
    ),
    [],
  );
  assert.deepEqual(await evaluate(`Object.keys(sessionStorage)`), []);
  await goto("owners");
  assert.equal(
    await evaluate(
      `document.querySelector('main').textContent.includes('Pessoa Extra A')`,
    ),
    false,
    "reload resets portfolio",
  );
  assert.deepEqual(errors, [], "uncaught browser exceptions");
  console.log(
    "Validação, cancelamento, cadastros, edição, exclusão, vínculos, paginação, filtros, estado compartilhado, tema, mobile e reset: OK",
  );
} finally {
  ws.close();
}
