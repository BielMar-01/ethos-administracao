export {
  createDatabaseClient,
  getDatabaseClient,
  disconnectDatabase,
} from "./client.js";
export type { DatabaseClient, DatabaseOptions } from "./client.js";
export type { PrismaClient } from "./generated/prisma/client.js";
