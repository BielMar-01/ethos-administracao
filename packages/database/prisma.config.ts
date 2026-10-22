import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";
import { migrationUrl } from "./src/settings.ts";

config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
  quiet: true,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: process.env.DIRECT_DATABASE_URL
    ? { url: migrationUrl(process.env) }
    : undefined,
});
