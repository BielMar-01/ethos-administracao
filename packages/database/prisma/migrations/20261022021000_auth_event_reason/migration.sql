BEGIN;
ALTER TABLE ethos_identity."AuthEvent" ADD COLUMN "reason" VARCHAR(500);
COMMIT;
