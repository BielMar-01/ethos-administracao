BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ethos_technical";

-- CreateTable
CREATE TABLE "ethos_technical"."infrastructure_checks" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "infrastructure_checks_pkey" PRIMARY KEY ("id")
);

COMMIT;
