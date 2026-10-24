// Local Linux rehearsal in the disposable PostgreSQL container's network namespace.
import { createServer, connect } from "node:net";
import { spawn } from "node:child_process";
if (
  process.platform !== "linux" ||
  process.env.ETHOS_CONTAINER_DB_BRIDGE !== "1"
)
  throw Error("DISPOSABLE_LINUX_REHEARSAL_REQUIRED");
const bridge = createServer((socket) => {
  const target = connect({ host: "127.0.0.1", port: 5432 });
  socket.pipe(target).pipe(socket);
  target.on("error", () => socket.destroy());
  socket.on("error", () => target.destroy());
});
await new Promise((resolve) => bridge.listen(55439, "127.0.0.1", resolve));
try {
  const child = spawn(
    process.execPath,
    [
      "--test",
      process.argv.includes("--auth")
        ? "tests/auth.integration.mjs"
        : "tests/infrastructure.integration.mjs",
    ],
    {
      cwd: new URL("../apps/api/", import.meta.url),
      stdio: "inherit",
      env: process.env,
    },
  );
  process.exitCode = await new Promise((resolve) =>
    child.once("exit", (code) => resolve(code ?? 1)),
  );
} finally {
  await new Promise((resolve) => bridge.close(resolve));
}
