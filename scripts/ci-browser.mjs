import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
if (process.env.CI !== "true" && process.env.ETHOS_ISOLATED_TESTS !== "1")
  throw Error("ISOLATED_TEST_OPT_IN_REQUIRED");
const root = new URL("../", import.meta.url);
const env = {
  ...process.env,
  APP_ENV: "development",
  ETHOS_LOCAL_DATABASE: "1",
  ETHOS_API_ORIGIN: "http://127.0.0.1:3339",
  ETHOS_WEB_ORIGIN: "http://localhost:3099",
};
for (const key of [
  "DIRECT_DATABASE_URL",
  "DATABASE_URL",
  "AUTH_IDENTITY_DATABASE_URL",
  "AUTH_COOKIE_SECRET",
  "AUTH_ENCRYPTION_KEY",
])
  delete env[key];
const reports = [
  "docs/etapa-0.9-browser-tests.json",
  "docs/etapa-0.10-browser-tests.json",
  "docs/etapa-0.11.1-profile-browser-tests.json",
  "docs/etapa-0.11.1-auth-browser-failure.json",
];
const originals = new Map(
  reports.map((file) => [
    file,
    existsSync(new URL(file, root)) ? readFileSync(new URL(file, root)) : null,
  ]),
);
const artifacts = new URL(".artifacts/ci/", root);
mkdirSync(artifacts, { recursive: true });
let api, web;
const launch = (file, args, cwd) =>
  spawn(process.execPath, [file, ...args], {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
async function ready(url, child) {
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null || child.signalCode !== null) throw Error("TEST_SERVER_EXITED");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return;
    } catch {
      /* bounded startup wait */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw Error("TEST_SERVER_NOT_READY");
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
try {
  web = launch(
    "node_modules/next/dist/bin/next",
    ["start", "-p", "3099", "-H", "localhost"],
    new URL("apps/web/", root),
  );
  web.stdout.resume();
  web.stderr.resume();
  await ready("http://localhost:3099/login", web);
  for (const suite of [
    "auth-browser",
    "access-profiles-browser",
    "business-browser",
  ]) {
    // Each suite starts from its own reset of isolated sessions/MFA fixtures.
    api = launch(
      "scripts/auth-test-server.mjs",
      [],
      new URL("apps/api/", root),
    );
    api.stdout.resume();
    api.stderr.resume();
    await ready("http://127.0.0.1:3339/api/v1/health/ready", api);
    const result = spawnSync(process.execPath, [`tests/${suite}.mjs`], {
      cwd: new URL("apps/web/", root),
      env,
      stdio: "inherit",
      timeout: 180_000,
    });
    await stop(api);
    api = undefined;
    if (result.status !== 0) throw Error(`BROWSER_SUITE_FAILED: ${suite}`);
  }
} finally {
  await stop(api);
  await stop(web);
  for (const [file, original] of originals) {
    const path = new URL(file, root);
    if (existsSync(path))
      writeFileSync(
        new URL(file.split("/").at(-1), artifacts),
        readFileSync(path),
      );
    if (original) writeFileSync(path, original);
    else rmSync(path, { force: true });
  }
}
