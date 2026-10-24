// Six profiles, loopback BFF/API and disposable PostgreSQL only. No real accounts.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(
    new URL("../../api/package.json", import.meta.url),
  ),
  { TOTP, Secret } = require("otpauth");
const base = "http://localhost:3099",
  checks = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].find(existsSync),
});
let organization;
try {
  for (const [label, account] of [
    ["ADMIN_ORGANIZACAO", "admin"],
    ["GESTOR", "manager"],
    ["FINANCEIRO", "finance"],
    ["PROPRIETARIO", "owner"],
    ["INQUILINO", "tenant"],
    ["SUPER_ADMIN", "super"],
  ]) {
    const context = await browser.newContext(),
      page = await context.newPage();
    try {
      await page.goto(base + "/login");
      await page
        .getByLabel("E-mail", { exact: true })
        .fill(`browser-${account}@example.invalid`);
      await page.getByLabel("Senha", { exact: true }).fill("Ethos!Browser2026");
      await page.getByRole("button", { name: "Entrar com segurança" }).click();
      const post = async (path, data) => {
        const challenge = await context.request.get(base + "/api/auth/csrf");
        assert.equal(challenge.status(), 200);
        const { csrfToken } = await challenge.json();
        return context.request.post(base + "/api/auth/" + path, {
          data,
          headers: { origin: base, "x-csrf-token": csrfToken },
        });
      };
      if (label === "SUPER_ADMIN") {
        await page.waitForURL("**/mfa");
        assert.equal(
          (
            await post("platform/access", {
              reason: "Isolated browser authorization test",
            })
          ).status(),
          403,
        );
        await page.goto(base + "/app/dashboard");
        await page.waitForURL("**/mfa");
        await page
          .getByRole("button", { name: "Configurar autenticador" })
          .click();
        const secret = await page.locator("code").textContent();
        const otp = new TOTP({
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: Secret.fromBase32(secret.trim()),
        });
        await page
          .getByLabel("Código do autenticador", { exact: true })
          .fill(otp.generate());
        await page.getByRole("button", { name: "Confirmar código" }).click();
        await page
          .getByRole("button", { name: "Salvei os códigos, continuar" })
          .click();
        await page.waitForURL("**/organizations");
        assert.equal(
          (
            await post("platform/access", {
              reason: "Isolated browser authorization test",
            })
          ).status(),
          200,
        );
        assert.equal(
          (
            await post("organization", { organizationId: organization })
          ).status(),
          403,
        );
        checks.push(
          "SUPER_ADMIN: MFA forced, explicit platform access audited, no implicit organization bypass",
        );
      } else {
        await page.waitForURL("**/organizations");
        await page
          .getByRole("button", { name: "Ethos Teste A", exact: true })
          .click();
        const external = ["PROPRIETARIO", "INQUILINO"].includes(label);
        await page.waitForURL(
          external ? "**/access-denied" : "**/app/dashboard",
        );
        const me = await (
          await context.request.get(base + "/api/auth/me")
        ).json();
        organization = me.organizationId;
        const get = (path) =>
          context.request.get(base + "/api/business/" + path, {
            headers: { "x-ethos-context": organization },
          });
        assert.equal((await get("owners")).status(), external ? 403 : 200);
        assert.equal(
          (await get("finance/summary")).status(),
          external ? 403 : 200,
        );
        assert.equal(
          (await get("settings")).status(),
          label === "ADMIN_ORGANIZACAO" ? 200 : 403,
        );
        if (label === "FINANCEIRO")
          assert.equal((await get("maintenance")).status(), 403);
        assert.equal((await post("refresh", {})).status(), 200);
        checks.push(
          `${label}: login, organization, permitted/forbidden modules and refresh validated`,
        );
      }
      await page.goto(base + "/organizations");
      await page.getByRole("button", { name: "Sair", exact: true }).click();
      await page.waitForURL("**/login");
      await page.goto(base + "/app/dashboard");
      await page.waitForURL("**/login");
      checks.push(`${label}: logout revokes access to protected route`);
    } finally {
      await context.close();
    }
  }
  writeFileSync(
    new URL(
      "../../../docs/etapa-0.11.1-profile-browser-tests.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        isolated: true,
        realAccountsUsed: false,
        passed: checks.length,
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  await browser.close();
}
