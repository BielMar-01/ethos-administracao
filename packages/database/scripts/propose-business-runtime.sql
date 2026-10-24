-- PROPOSTA ETAPA 0.10: validada somente em PostgreSQL isolado; NAO aplicada no Supabase.
-- Aplicar administrativamente somente depois de testes isolados e verificacao do destino.
-- Nao modifica papeis, RLS, funcoes, ownership, usuarios ou tabelas de RBAC.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ethos_tenant_runtime' AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolinherit)
     OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
     OR EXISTS(SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
     OR EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
     OR EXISTS(SELECT 1 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
     OR EXISTS(SELECT 1 FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname='ethos_tenant_runtime'))
  THEN RAISE EXCEPTION 'UNSAFE_TENANT_RUNTIME_ROLE'; END IF;
END $$;
GRANT INSERT ("id", "organizationId", "name", "kind", "email", "phone", "taxIdentifier") ON ethos."Owner" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "name", "kind", "email", "phone", "taxIdentifier") ON ethos."Tenant" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "code", "name", "kind", "address") ON ethos."Property" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "propertyId", "code", "name", "isMain", "area") ON ethos."PropertyUnit" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "propertyId", "ownerId", "percentage", "startsOn", "endsOn") ON ethos."PropertyOwnership" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "unitId", "code", "startsOn", "endsOn", "baseRent", "currency", "dueDay") ON ethos."Lease" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "tenantId", "role", "startsOn", "endsOn") ON ethos."LeaseTenant" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "code") ON ethos."Contract" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "successorLeaseId", "startsOn", "endsOn", "newRent") ON ethos."LeaseRenewal" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "effectiveOn", "previousRent", "newRent", "percentage", "indexName") ON ethos."RentAdjustment" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "code", "kind", "competence", "amount") ON ethos."Charge" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "chargeId", "number", "dueOn", "amount") ON ethos."Installment" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "leaseId", "code", "amount", "method", "paidAt") ON ethos."Payment" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "paymentId", "number", "issuedAt", "snapshot") ON ethos."Receipt" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "unitId", "leaseId", "kind", "scheduledAt") ON ethos."Inspection" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "inspectionId", "version", "content") ON ethos."InspectionReport" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "unitId", "leaseId", "title", "description", "category", "priority", "estimatedCost", "actualCost") ON ethos."MaintenanceRequest" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "documentId", "unitId", "caption", "sortOrder", "takenAt") ON ethos."Photo" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "recipientMembershipId", "kind", "title", "message", "payload") ON ethos."Notification" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "timezone", "preferences") ON ethos."OrganizationSettings" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "contractId", "version", "content", "contentHash", "validFrom") ON ethos."ContractVersion" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "paymentId", "installmentId", "amount") ON ethos."PaymentAllocation" TO ethos_tenant_runtime;
GRANT INSERT ("id", "organizationId", "kind", "originalName", "mimeType", "storageProvider", "bucket", "objectKey", "sizeBytes", "sha256", "ownerId", "tenantId", "unitId", "contractVersionId", "receiptId", "inspectionReportId", "maintenanceRequestId") ON ethos."Document" TO ethos_tenant_runtime;
GRANT UPDATE ("name", "kind", "email", "phone", "taxIdentifier", "archivedAt") ON ethos."Owner" TO ethos_tenant_runtime;
GRANT UPDATE ("name", "kind", "email", "phone", "taxIdentifier", "archivedAt") ON ethos."Tenant" TO ethos_tenant_runtime;
GRANT UPDATE ("code", "name", "kind", "address", "archivedAt") ON ethos."Property" TO ethos_tenant_runtime;
GRANT UPDATE ("code", "name", "isMain", "area", "archivedAt") ON ethos."PropertyUnit" TO ethos_tenant_runtime;
GRANT UPDATE ("endsOn") ON ethos."PropertyOwnership" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "endedAt") ON ethos."Lease" TO ethos_tenant_runtime;
GRANT UPDATE ("endsOn") ON ethos."LeaseTenant" TO ethos_tenant_runtime;
GRANT UPDATE ("code", "status") ON ethos."Contract" TO ethos_tenant_runtime;
GRANT UPDATE ("status") ON ethos."LeaseRenewal" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "appliedAt") ON ethos."RentAdjustment" TO ethos_tenant_runtime;
GRANT UPDATE ("code", "kind", "competence", "amount", "status") ON ethos."Charge" TO ethos_tenant_runtime;
GRANT UPDATE ("number", "dueOn", "amount") ON ethos."Installment" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "reversedAt") ON ethos."Payment" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "voidedAt", "voidReason") ON ethos."Receipt" TO ethos_tenant_runtime;
GRANT UPDATE ("kind", "scheduledAt", "completedAt") ON ethos."Inspection" TO ethos_tenant_runtime;
GRANT UPDATE ("status", "content", "finalizedAt") ON ethos."InspectionReport" TO ethos_tenant_runtime;
GRANT UPDATE ("title", "description", "category", "status", "priority", "estimatedCost", "actualCost", "completedAt") ON ethos."MaintenanceRequest" TO ethos_tenant_runtime;
GRANT UPDATE ("caption", "sortOrder", "takenAt") ON ethos."Photo" TO ethos_tenant_runtime;
GRANT UPDATE ("readAt") ON ethos."Notification" TO ethos_tenant_runtime;
GRANT UPDATE ("timezone", "preferences") ON ethos."OrganizationSettings" TO ethos_tenant_runtime;
GRANT UPDATE ("name") ON ethos."Organization" TO ethos_tenant_runtime;
COMMIT;
