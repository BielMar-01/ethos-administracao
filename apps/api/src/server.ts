import "dotenv/config";
import { buildApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 3333);
const host = process.env.API_HOST ?? "127.0.0.1";

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port, host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

start().catch((error) => {
  console.error("Falha ao iniciar a API:", error);
  process.exit(1);
});
