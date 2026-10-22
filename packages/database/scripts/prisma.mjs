import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { redact } from "./redact.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: resolve(root, ".env"), quiet: true });
const require = createRequire(import.meta.url);
const entry = resolve(
  dirname(require.resolve("prisma/package.json")),
  "build/index.js",
);
const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
  timeout: 60_000,
});
let output = "";
child.stdout.on("data", (data) => {
  output += data;
});
child.stderr.on("data", (data) => {
  output += data;
});
child.on("error", () => {
  console.error(
    "Não foi possível executar o Prisma; verifique a instalação local.",
  );
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  process.stdout.write(redact(output));
  if (signal) console.error("Prisma interrompido pelo limite de execução.");
  process.exitCode = code ?? 1;
});
