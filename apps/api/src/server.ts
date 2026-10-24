import "dotenv/config";
import { buildApp } from "./app.js";
import { authRuntime } from "./auth/runtime.js";
import { runtimeConfiguration } from "./config.js";

async function start() {
  const config = runtimeConfiguration(process.env);
  const runtime = authRuntime();
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;
  try {
    app = await buildApp({
      auth: runtime.dependencies,
      allowedOrigins: config.cors,
    });
    app.addHook("onClose", runtime.close);
    let stopping = false;
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.once(signal, () => {
        if (stopping) return;
        stopping = true;
        app!.log.info({ event: "API_DRAINING", signal });
        const deadline = setTimeout(() => {
          app!.log.error({ event: "API_SHUTDOWN_TIMEOUT" });
          process.exit(1);
        }, 30_000);
        deadline.unref();
        void app!
          .close()
          .then(() => {
            clearTimeout(deadline);
            app!.log.info({ event: "API_STOPPED" });
          })
          .catch(() => {
            process.exitCode = 1;
          });
      });
    await app.listen({ port: config.port, host: config.host });
  } catch {
    await app?.close().catch(() => {});
    await runtime.close();
    throw Error("API_START_FAILED");
  }
}

start().catch(() => {
  console.error(
    "API_START_FAILED: verifique a configuração local; detalhes sensíveis omitidos.",
  );
  process.exitCode = 1;
});
