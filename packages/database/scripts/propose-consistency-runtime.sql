-- Separate from the pinned 0.10.1 business grants. ISOLATED VALIDATION ONLY.
BEGIN;
REVOKE ALL ON ethos_technical."ResourceRevision", ethos_technical."MutationReceipt" FROM ethos_auth_runtime, ethos_tenant_runtime;
GRANT USAGE ON SCHEMA ethos_technical TO ethos_tenant_runtime;
GRANT SELECT ON ethos_technical."ResourceRevision", ethos_technical."MutationReceipt" TO ethos_tenant_runtime;
GRANT INSERT ("organizationId", resource, "recordId", revision) ON ethos_technical."ResourceRevision" TO ethos_tenant_runtime;
GRANT UPDATE (revision) ON ethos_technical."ResourceRevision" TO ethos_tenant_runtime;
GRANT INSERT ("organizationId", "membershipId", operation, "keyHash", "inputHash", resource, "recordId") ON ethos_technical."MutationReceipt" TO ethos_tenant_runtime;
COMMIT;
