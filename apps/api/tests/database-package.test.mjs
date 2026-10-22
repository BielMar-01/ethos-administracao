import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseClient } from "@ethos/database";
import { buildApp } from "../dist/app.js";

test("Fastify aceita o cliente compartilhado e encerra seu ciclo sem abrir conexão antecipada", async () => {
  const database = createDatabaseClient({
    connectionString: "postgresql://user:fake-password@localhost:5432/ethos",
  });
  const app = await buildApp();
  app.decorate("database", database.prisma);
  let closed = false;
  app.addHook("onClose", async () => {
    await database.disconnect();
    closed = true;
  });
  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.status, "ok");
    assert.equal(typeof app.database.$queryRaw, "function");
  } finally {
    await app.close();
  }
  assert.equal(closed, true);
  await database.disconnect();
});
