import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  passwordSchema,
  encryptSecret,
  decryptSecret,
  digest,
  randomToken,
  totpCounter,
  totp,
  newTotpSecret,
} from "../dist/auth/security.js";
test("Argon2id individual salt and password policy", async () => {
  const password = "Ethos!Secure2026";
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.match(a, /^\$argon2id\$/);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(a, password), true);
  assert.equal(await verifyPassword(a, "incorrect"), false);
  for (const bad of [
    "short",
    "lowercase!1234",
    "UPPERCASE!1234",
    "NoNumbers!Password",
    "NoSymbols12345",
    "Ethos1234567 ",
  ])
    assert.equal(passwordSchema.safeParse(bad).success, false);
});
test("tokens random and MFA encryption authenticated and bound to identity", () => {
  assert.notEqual(randomToken(), randomToken());
  assert.equal(digest(randomToken()).length, 64);
  const key = Buffer.alloc(32, 7),
    cipher = encryptSecret("test-secret", key, "user");
  assert.equal(decryptSecret(cipher, key, "user"), "test-secret");
  assert.throws(() => decryptSecret(cipher, key, "other"));
  const secret = newTotpSecret(),
    now = Date.now(),
    code = totp(secret).generate({ timestamp: now });
  assert.notEqual(totpCounter(secret, code, now), null);
  assert.equal(totpCounter(secret, "abcdef", now), null);
});
