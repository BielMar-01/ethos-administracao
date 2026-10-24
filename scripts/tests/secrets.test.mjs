import test from "node:test";
import assert from "node:assert/strict";
import { suspicious } from "../check-secrets.mjs";
test("secret scan rejects credentialed remote URLs and private keys", () => {
  assert.equal(
    suspicious(["postgresql://user", ":password@remote.invalid/db"].join("")),
    true,
  );
  assert.equal(suspicious(["-----BEGIN ", "PRIVATE KEY-----"].join("")), true);
  assert.equal(
    suspicious("postgresql://fixture:test@127.0.0.1:5432/test"),
    false,
  );
});
