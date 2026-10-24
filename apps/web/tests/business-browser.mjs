// Requires the loopback-only auth-test-server and disposable PostgreSQL fixture.
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
const base = "http://localhost:3099",
  checks = [],
  errors = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync),
});
const context = await browser.newContext(),
  page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
async function overflow() {
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
}
try {
  await page.goto(base + "/login");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("browser-admin@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("Ethos!Browser2026");
  await page.getByRole("button", { name: "Entrar com segurança" }).click();
  await page.waitForURL("**/organizations");
  await page
    .getByRole("button", { name: "Ethos Teste A", exact: true })
    .click();
  await page.waitForURL("**/app/dashboard");
  const name = `Browser Owner ${Date.now()}`;
  await page.goto(base + "/app/owners");
  await page
    .getByRole("button", { name: "Cadastrar proprietário", exact: true })
    .click();
  await page.getByLabel("Nome", { exact: false }).fill(name);
  await page.getByLabel("Pessoa", { exact: false }).selectOption("INDIVIDUAL");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("salvo");
  await page.reload();
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  checks.push(
    "owner creation persists after full reload through BFF/API/restricted PostgreSQL",
  );
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name, exact: true }) });
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Telefone", { exact: false }).fill("11999990000");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("salvo");
  await page.getByLabel("Buscar Proprietários", { exact: true }).fill(name);
  await expect(page.getByRole("row")).toHaveCount(2);
  checks.push("owner edit and server search work");
  await row.getByRole("button", { name: "Detalhes", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("11999990000");
  await page.keyboard.press("Escape");
  const stale = await context.newPage();
  await stale.goto(base + "/app/owners");
  const staleRow = stale
    .getByRole("row")
    .filter({ has: stale.getByRole("cell", { name, exact: true }) });
  await staleRow.getByRole("button", { name: "Editar", exact: true }).click();
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Telefone", { exact: false }).fill("11888880000");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("salvo");
  await stale.getByLabel("Telefone", { exact: false }).fill("11777770000");
  await stale.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(stale.getByRole("dialog").getByRole("alert")).toContainText(
    "alterado por outra pessoa",
  );
  await expect(stale.getByLabel("Telefone", { exact: false })).toHaveValue(
    "11777770000",
  );
  await stale.close();
  checks.push("concurrent browser edit rejected with unsaved input preserved");
  await row.getByRole("button", { name: "Arquivar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("concluída");
  await page.getByLabel("Arquivamento").selectOption("true");
  await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
  checks.push("details and archive preserve history");
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
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
    ]) {
      await page.goto(`${base}/app/${route}`);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await expect(
        page.getByText("Carregando", { exact: false }).first(),
      ).not.toBeVisible({ timeout: 15000 });
      await overflow();
      assert.equal(
        await page.getByText("Use DemoProvider", { exact: false }).count(),
        0,
      );
      assert.equal(
        (await page.getByRole("alert").allTextContents()).filter((t) =>
          t.trim(),
        ).length,
        0,
        `unexpected alert ${route}`,
      );
    }
    checks.push(`13 integrated modules render without overflow at ${width}px`);
  }
  await page.getByRole("button", { name: "Ativar tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  checks.push("light and dark themes preserved");
  await page.goto(base + "/organizations");
  await page
    .getByRole("button", { name: "Ethos Teste B", exact: true })
    .click();
  await page.waitForURL("**/app/dashboard");
  await page.goto(base + "/app/owners");
  await page.getByLabel("Buscar Proprietários", { exact: true }).fill(name);
  await expect(page.getByText("Nenhum registro encontrado")).toBeVisible();
  checks.push(
    "organization switch discards prior cache and cannot expose other organization record",
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    new URL("../../../docs/etapa-0.10-browser-tests.json", import.meta.url),
    JSON.stringify(
      { isolated: true, passed: checks.length, checks, consoleErrors: errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser.close();
}
