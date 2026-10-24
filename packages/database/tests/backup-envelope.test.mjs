import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { encryptBackup, decryptBackup } from "../scripts/backup-envelope.mjs";
test("backup envelope authenticates bytes and requires the independently protected key", () => {
  const key = randomBytes(32),
    plain = Buffer.from("non-sensitive test archive"),
    encrypted = encryptBackup(plain, key);
  assert.deepEqual(decryptBackup(encrypted, key), plain);
  assert.notDeepEqual(encryptBackup(plain, key), encrypted);
  assert.throws(() => decryptBackup(encrypted, randomBytes(32)));
  const damaged = Buffer.from(encrypted);
  damaged[damaged.length - 1] ^= 1;
  assert.throws(() => decryptBackup(damaged, key));
  assert.throws(() => decryptBackup(encrypted.subarray(0, 10), key));
});
