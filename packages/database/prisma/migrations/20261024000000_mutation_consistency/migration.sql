-- Additive technical state only. Production activation requires separate approval.
BEGIN;
CREATE TABLE ethos_technical."ResourceRevision" (
  "organizationId" uuid NOT NULL,
  resource varchar(80) NOT NULL,
  "recordId" uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  CONSTRAINT "ResourceRevision_pkey" PRIMARY KEY ("organizationId", resource, "recordId"),
  CONSTRAINT "ResourceRevision_organizationId_fkey" FOREIGN KEY ("organizationId")
    REFERENCES ethos."Organization"(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE TABLE ethos_technical."MutationReceipt" (
  "organizationId" uuid NOT NULL,
  "membershipId" uuid NOT NULL,
  operation varchar(160) NOT NULL,
  "keyHash" char(64) NOT NULL CHECK ("keyHash" ~ '^[a-f0-9]{64}$'),
  "inputHash" char(64) NOT NULL CHECK ("inputHash" ~ '^[a-f0-9]{64}$'),
  resource varchar(80) NOT NULL,
  "recordId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MutationReceipt_pkey" PRIMARY KEY ("organizationId", "membershipId", operation, "keyHash"),
  CONSTRAINT "MutationReceipt_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId")
    REFERENCES ethos."OrganizationMembership"("organizationId", id) ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "MutationReceipt_organizationId_createdAt_idx" ON ethos_technical."MutationReceipt"("organizationId", "createdAt");
REVOKE ALL ON ethos_technical."ResourceRevision", ethos_technical."MutationReceipt" FROM PUBLIC;
ALTER TABLE ethos_technical."ResourceRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_technical."ResourceRevision" FORCE ROW LEVEL SECURITY;
ALTER TABLE ethos_technical."MutationReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_technical."MutationReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_revision ON ethos_technical."ResourceRevision"
  USING ("organizationId" = ethos.current_organization_id())
  WITH CHECK ("organizationId" = ethos.current_organization_id());
CREATE POLICY tenant_receipt ON ethos_technical."MutationReceipt"
  USING ("organizationId" = ethos.current_organization_id() AND EXISTS (
    SELECT 1 FROM ethos."OrganizationMembership" m WHERE m.id = "membershipId"
      AND m."organizationId" = ethos.current_organization_id()
      AND m.id::text = current_setting('ethos.actor_membership_id', true) AND m.status = 'ACTIVE'))
  WITH CHECK ("organizationId" = ethos.current_organization_id() AND EXISTS (
    SELECT 1 FROM ethos."OrganizationMembership" m WHERE m.id = "membershipId"
      AND m."organizationId" = ethos.current_organization_id()
      AND m.id::text = current_setting('ethos.actor_membership_id', true) AND m.status = 'ACTIVE'));
COMMIT;
