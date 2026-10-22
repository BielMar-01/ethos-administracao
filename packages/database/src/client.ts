import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import { databaseSchema, poolConfiguration } from "./settings.js";

export type DatabaseClient = {
  prisma: PrismaClient;
  disconnect: () => Promise<void>;
};
export type DatabaseOptions = {
  allowLocalPlaintext?: boolean;
  connectionString?: string;
  maxConnections?: number;
  onPoolError?: (error: { code: string }) => void;
};

export function createDatabaseClient(
  options: DatabaseOptions = {},
): DatabaseClient {
  const pool = new Pool(
    poolConfiguration(
      options.connectionString ?? process.env.DATABASE_URL,
      options.maxConnections,
      options.allowLocalPlaintext,
    ),
  );
  pool.on("error", () => {
    // Never log driver error messages: they may contain connection information.
    if (options.onPoolError)
      options.onPoolError({ code: "DATABASE_POOL_ERROR" });
    else console.error("[ethos/database] DATABASE_POOL_ERROR");
  });
  const adapter = new PrismaPg(pool, {
    schema: databaseSchema,
    disposeExternalPool: false,
  });
  const prisma = new PrismaClient({
    adapter,
    log: [],
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });
  let disconnecting: Promise<void> | undefined;
  return {
    prisma,
    disconnect() {
      disconnecting ??= (async () => {
        try {
          await prisma.$disconnect();
        } finally {
          await pool.end();
        }
      })();
      return disconnecting;
    },
  };
}

const processScope = globalThis as typeof globalThis & {
  __ethosDatabase?: DatabaseClient;
};
export function getDatabaseClient(): DatabaseClient {
  processScope.__ethosDatabase ??= createDatabaseClient();
  return processScope.__ethosDatabase;
}
export async function disconnectDatabase(): Promise<void> {
  const database = processScope.__ethosDatabase;
  delete processScope.__ethosDatabase;
  await database?.disconnect();
}
