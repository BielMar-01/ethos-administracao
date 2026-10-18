// Additional stage 0.6.7 checks; run with the same local server/CDP as browser-smoke.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const base = process.env.ETHOS_TEST_URL ?? "http://localhost:3066";
const cdp = process.env.ETHOS_CDP_URL ?? "http://127.0.0.1:9366";
const tab = (await (await fetch(`${cdp}/json`)).json()).find(
  (tab) => tab.type === "page",
);
assert.ok(tab);
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve) =>
  ws.addEventListener("open", resolve, { once: true }),
);
let id = 0;
const pending = new Map(),
  external = [],
  errors = [];
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const handler = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) handler.reject(message.error);
    else handler.resolve(message.result);
  }
  if (
    message.method === "Network.requestWillBeSent" &&
    /^https?:/.test(message.params.request.url) &&
    !message.params.request.url.startsWith(base)
  )
    external.push(message.params.request.url);
  if (message.method === "Runtime.exceptionThrown")
    errors.push(message.params.exceptionDetails.text);
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
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
async function goto(route) {
  await send("Page.navigate", { url: base + route });
  for (let i = 0; i < 100; i++) {
    await delay(50);
    if (
      await evaluate(
        `location.pathname === ${JSON.stringify(route)} && document.readyState === 'complete' && !!document.querySelector('h1')`,
      )
    )
      break;
  }
  await evaluate("document.fonts.ready.then(()=>true)");
  await delay(100);
}
async function screenshot(name) {
  const result = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    join(tmpdir(), `ethos-067-${name}.png`),
    Buffer.from(result.data, "base64"),
  );
}
async function key(key, code, virtualKey, modifiers = 0) {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    windowsVirtualKeyCode: virtualKey,
    modifiers,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: virtualKey,
    modifiers,
  });
}
try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await goto("/app/dashboard");
  assert.ok(
    await evaluate(
      "getComputedStyle(document.body).fontFamily.includes('nunito')",
    ),
  );
  assert.ok(
    await evaluate(
      "getComputedStyle(document.querySelector('h1')).fontFamily.includes('playfair')",
    ),
  );
  for (const theme of ["light", "dark"]) {
    await evaluate(
      `document.documentElement.setAttribute('data-theme','${theme}')`,
    );
    await screenshot(`dashboard-${theme}`);
  }
  await evaluate(
    `document.querySelector('button[aria-label="Recolher navegação"]').click()`,
  );
  await delay(300);
  assert.equal(
    await evaluate(`document.querySelector('.app-frame').dataset.collapsed`),
    "true",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('aside').getBoundingClientRect().width < 100",
    ),
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('aside nav a[aria-label]').length",
    ),
    13,
  );
  assert.equal(
    await evaluate("document.documentElement.scrollWidth > innerWidth"),
    false,
  );
  await screenshot("dashboard-collapsed");
  await evaluate(
    `document.querySelector('button[aria-label="Expandir navegação"]').click()`,
  );
  await delay(300);
  await goto("/app/properties");
  await evaluate("document.documentElement.setAttribute('data-theme','light')");
  await screenshot("properties-light");
  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  assert.ok(
    await evaluate(
      "parseFloat(getComputedStyle(document.querySelector('aside')).transitionDuration) <= 0.001",
    ),
  );
  await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await goto("/app/properties");
  await evaluate(
    `document.querySelector('button[aria-label="Abrir menu"]').focus();document.querySelector('button[aria-label="Abrir menu"]').click()`,
  );
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('.shell-content').inert"),
    true,
  );
  assert.ok(await evaluate("!!document.activeElement.closest('aside')"));
  for (let i = 0; i < 18; i++) {
    await key("Tab", "Tab", 9);
    assert.ok(await evaluate("!!document.activeElement.closest('aside')"));
  }
  await key("Escape", "Escape", 27);
  await delay(100);
  assert.equal(
    await evaluate("document.querySelector('.shell-content').inert"),
    false,
  );
  assert.equal(
    await evaluate("document.activeElement.getAttribute('aria-label')"),
    "Abrir menu",
  );
  await evaluate(`document.querySelector('.skip-link').click()`);
  assert.equal(await evaluate("document.activeElement.id"), "main-content");
  await evaluate(
    `[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Novo exemplo de')).click()`,
  );
  await delay(100);
  assert.ok(
    await evaluate(
      "parseFloat(getComputedStyle(document.querySelector('dialog input')).fontSize) >= 16",
    ),
  );
  await screenshot("mobile-form");
  await key("Escape", "Escape", 27);
  await goto("/");
  assert.deepEqual(
    await evaluate(
      "[...document.querySelectorAll('a')].map(a=>a.getAttribute('href'))",
    ),
    ["/app/dashboard", "/app/dashboard"],
  );
  assert.deepEqual(external, [], "no external font or data requests");
  assert.deepEqual(errors, [], "no browser exceptions");
  console.log(
    "Fontes locais, sidebar recolhível, navegação mobile com foco, skip link, reduced motion, controles de 16px e CTAs da Home: OK",
  );
} finally {
  ws.close();
}
