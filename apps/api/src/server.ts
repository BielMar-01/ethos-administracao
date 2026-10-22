import "dotenv/config";
import { buildApp } from "./app.js";
import { authRuntime } from "./auth/runtime.js";

const port = Number(process.env.API_PORT ?? 3333);
const host = process.env.API_HOST ?? "127.0.0.1";

async function start() {
  const runtime = authRuntime();
  const app = await buildApp({ auth: runtime.dependencies });
  app.addHook("onClose", runtime.close);
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => {
      void app.close();
    });

  try {
    await app.listen({ port, host });
  } catch {
    app.log.error({ event: "API_START_FAILED" });
    process.exit(1);
  }
}

start().catch(() => {
  console.error(
    "API_START_FAILED: verifique a configuração local; detalhes sensíveis omitidos.",
  );
  process.exit(1);
});
