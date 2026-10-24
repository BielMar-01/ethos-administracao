import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
const root = new URL("../", import.meta.url);
if (process.env.CI !== "true" && process.env.ETHOS_ISOLATED_TESTS !== "1")
  throw Error("ISOLATED_TEST_OPT_IN_REQUIRED");
// No inherited database credentials: every child uses explicit disposable targets.
const env = {
  ...process.env,
  ETHOS_LOCAL_DATABASE: "1",
  DIRECT_DATABASE_URL:
    "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test",
  ETHOS_AUTH_TEST_DATABASE_URL:
    "postgresql://postgres:ethos-local-disposable@127.0.0.1:55439/ethos_auth_test",
};
delete env.DATABASE_URL;
delete env.AUTH_IDENTITY_DATABASE_URL;
const evidence = new URL(".artifacts/ci/", root);
mkdirSync(evidence, { recursive: true });
const reports = [
  "docs/etapa-0.11-database-state.json",
  "docs/etapa-0.11-consistency-provisioning.json",
  "docs/etapa-0.11-consistency-tests.json",
  "docs/etapa-0.11-security-tests.json",
  "docs/etapa-0.11-authorization-tests.json",
  "docs/etapa-0.10-api-tests.json",
];
const originals = new Map(
  reports
    .filter((file) => existsSync(new URL(file, root)))
    .map((file) => [file, readFileSync(new URL(file, root))]),
);
function run(file, args = [], cwd = root) {
  console.log(`Running ${file}`);
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd,
    env,
    stdio: "inherit",
    timeout: 300_000,
  });
  if (result.status !== 0) throw Error(`ISOLATED_CHECK_FAILED: ${file}`);
}
try {
  run("packages/database/scripts/setup-auth-test.mjs");
  run("packages/database/scripts/setup-consistency-test.mjs");
  run("packages/database/scripts/verify-consistency-state.mjs");
  for (const file of [
    "auth",
    "business",
    "security",
    "authorization",
    "consistency",
    "infrastructure",
  ])
    run(
      "--test",
      [`tests/${file}.integration.mjs`],
      new URL("apps/api/", root),
    );
} finally {
  for (const [file, bytes] of originals) {
    const path = new URL(file, root);
    if (existsSync(path))
      writeFileSync(
        new URL(file.split("/").at(-1), evidence),
        readFileSync(path),
      );
    writeFileSync(path, bytes);
  }
}
