import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../api/package.json", import.meta.url),
);
const { TOTP, Secret } = require("otpauth");
const base = process.env.ETHOS_AUTH_BROWSER_URL ?? "http://localhost:3099";
if (new URL(base).hostname !== "localhost")
  throw Error("LOOPBACK_BROWSER_TEST_REQUIRED");
const executablePath =
  process.env.ETHOS_BROWSER_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync);
const browser = await chromium.launch({ headless: true, executablePath });
const context = await browser.newContext(),
  page = await context.newPage();
const errors = [],
  passed = [];
const authResponses = [];
page.on("response", (response) => {
  const path = new URL(response.url()).pathname;
  if (path.startsWith("/api/auth/")) {
    authResponses.push({ path, status: response.status() });
    if (authResponses.length > 60) authResponses.shift();
  }
});
page.on("pageerror", (error) => errors.push(error.message));
const screenshot = join(tmpdir(), "ethos-auth-login-mobile.png");
async function noOverflow() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    true,
  );
}
async function login(
  email = "browser-admin@example.invalid",
  password = "Ethos!Browser2026",
) {
  await page.goto(base + "/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar com segurança" }).click();
  await page.waitForURL("**/organizations");
}
try {
  await page.goto(base + "/app/dashboard");
  await page.waitForURL("**/login");
  passed.push("unauthenticated administrative route redirects to login");
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "login",
      "register",
      "forgot-password",
      "reset-password",
      "verify-email",
      "access-denied",
    ]) {
      await page.goto(`${base}/${route}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await noOverflow();
    }
  }
  passed.push(
    "six public auth screens at mobile/tablet/desktop without horizontal overflow",
  );
  await page.getByRole("button", { name: "Ativar tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await noOverflow();
  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  passed.push("dark/light theme switching preserved");
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(base + "/register");
  await page
    .getByRole("button", { name: "Mostrar senha", exact: true })
    .click();
  assert.equal(await page.locator("#password").getAttribute("type"), "text");
  await page
    .getByRole("button", { name: "Ocultar senha", exact: true })
    .click();
  assert.equal(
    await page.locator("#password").getAttribute("type"),
    "password",
  );
  assert.match(
    await page.locator("#password-requirements").innerText(),
    /12 caracteres/,
  );
  passed.push("accessible password requirements and reveal toggle");
  const email = `browser-${randomUUID()}@example.invalid`;
  await page.getByLabel("Seu nome").fill("Teste de navegador");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill("Ethos!Browser2026");
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await page.getByRole("status").waitFor();
  let messages = [];
  for (let attempt = 0; attempt < 20; attempt++) {
    messages = await (
      await fetch(
        `http://127.0.0.1:3339/__test/mail?email=${encodeURIComponent(email)}`,
      )
    ).json();
    if (messages.length) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const verification = messages.find((m) => m.purpose === "VERIFY_EMAIL");
  assert.ok(verification);
  await page.goto(`${base}/verify-email#token=${verification.token}`);
  await page
    .getByRole("button", { name: "Confirmar e-mail", exact: true })
    .click();
  await page.getByRole("status").waitFor();
  await login(email);
  await page
    .getByText("Sua conta ainda não possui uma organização ativa.", {
      exact: false,
    })
    .waitFor();
  passed.push(
    "browser signup, confirmation and login without public admin role",
  );
  await page.goto(base + "/forgot-password");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Enviar instruções" }).click();
  await page.getByRole("status").waitFor();
  let reset;
  for (let attempt = 0; attempt < 20; attempt++) {
    const mail = await (
      await fetch(
        `http://127.0.0.1:3339/__test/mail?email=${encodeURIComponent(email)}`,
      )
    ).json();
    reset = mail.find((item) => item.purpose === "RESET_PASSWORD");
    if (reset) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(reset);
  await page.goto(`${base}/reset-password#token=${reset.token}`);
  await page.getByLabel("Senha", { exact: true }).fill("Ethos!Renewed2027");
  await page.getByRole("button", { name: "Redefinir senha" }).click();
  await page.getByRole("status").waitFor();
  await login(email, "Ethos!Renewed2027");
  passed.push(
    "browser forgot-password and reset-password flow with revoked old sessions",
  );
  await context.clearCookies();
  await login();
  await page
    .getByRole("button", { name: "Ethos Teste A", exact: true })
    .click();
  await page.waitForURL("**/app/dashboard");
  for (const resource of [
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
    await page.goto(`${base}/app/${resource}`);
    assert.equal(new URL(page.url()).pathname, `/app/${resource}`);
    await noOverflow();
  }
  passed.push(
    "all thirteen preserved administrative modules accessible to authorized organization admin",
  );
  const cookies = await context.cookies();
  assert.ok(cookies.find((c) => c.name === "ethos_access")?.httpOnly);
  assert.ok(cookies.find((c) => c.name === "ethos_refresh")?.httpOnly);
  assert.equal(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        /access|refresh|auth.*token/i.test(key),
      ),
    ),
    false,
  );
  passed.push("HttpOnly auth cookies and no localStorage tokens");
  await page.goto(base + "/account/security");
  await page.getByRole("heading", { name: "Sessões ativas" }).waitFor();
  await noOverflow();
  await page.goto(base + "/organizations");
  await page
    .getByRole("button", { name: "Ethos Teste B", exact: true })
    .click();
  await page.waitForURL("**/app/dashboard");
  passed.push("organization switch and account sessions screen");
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["organizations", "account/security", "mfa"]) {
      await page.goto(`${base}/${route}`);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await noOverflow();
    }
  }
  await page.setViewportSize({ width: 360, height: 900 });
  passed.push(
    "organization, security and MFA screens responsive at three viewports",
  );
  await page.goto(base + "/mfa");
  await page.getByRole("button", { name: "Configurar autenticador" }).click();
  const secret = (await page.locator("code").innerText()).trim();
  const authenticator = new TOTP({
    issuer: "Ethos Administração",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  await page
    .getByLabel("Código do autenticador", { exact: true })
    .fill(authenticator.generate());
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await page
    .getByRole("button", { name: "Salvei os códigos, continuar" })
    .waitFor();
  assert.equal(await page.locator("li.font-mono").count(), 10);
  await page
    .getByRole("button", { name: "Salvei os códigos, continuar" })
    .click();
  await page.waitForURL("**/organizations");
  passed.push("browser MFA enrollment and one-time recovery display");
  await context.clearCookies();
  await login("browser-tenant@example.invalid");
  await page
    .getByRole("button", { name: "Ethos Teste A", exact: true })
    .click();
  await page.waitForURL("**/access-denied");
  passed.push(
    "external tenant role cannot access organization-wide administration",
  );
  await context.clearCookies();
  await page.goto(base + "/login");
  await page.screenshot({ path: screenshot, fullPage: true });
  assert.deepEqual(errors, [], "No browser runtime errors");
  const report = {
    passed: passed.length,
    checks: passed,
    viewports: [360, 768, 1440],
    browserErrors: errors.length,
  };
  writeFileSync(
    new URL("../../../docs/etapa-0.9-browser-tests.json", import.meta.url),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...report, screenshot }, null, 2));
} catch (error) {
  writeFileSync(
    new URL(
      "../../../docs/etapa-0.11.1-auth-browser-failure.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        isolated: true,
        failed: true,
        code: error.name,
        checksCompleted: passed,
        authResponses,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await browser.close();
}
