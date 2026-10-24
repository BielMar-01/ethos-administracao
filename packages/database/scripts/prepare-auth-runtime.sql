-- Administrative execution ONLY after approval, after the three auth migrations.
-- Idempotent for these reserved application roles; never rotates passwords.
-- Existing memberships, ownership or elevated attributes require manual review.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Fail closed if this legacy read-only reconciliation would revoke approved writes.
-- The explicit business-profile builder reapplies the reviewed allowlist atomically.
DO $$
BEGIN
  IF coalesce(current_setting('ethos.provisioning_profile',true),'') NOT IN ('business-0.10.1','business-0.11-isolated')
    AND EXISTS (
      SELECT 1 FROM pg_roles r JOIN pg_attribute a ON a.attnum>0 AND NOT a.attisdropped
      JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE r.rolname='ethos_tenant_runtime' AND n.nspname='ethos' AND c.relkind='r'
      AND (has_column_privilege(r.oid,c.oid,a.attnum,'INSERT') OR has_column_privilege(r.oid,c.oid,a.attnum,'UPDATE'))
    ) THEN RAISE EXCEPTION 'EXPLICIT_BUSINESS_PROFILE_REQUIRED';
  END IF;
  IF current_setting('ethos.provisioning_profile',true) IS DISTINCT FROM 'business-0.11-isolated'
    AND to_regclass('ethos_technical."MutationReceipt"') IS NOT NULL
    AND EXISTS (SELECT 1 FROM information_schema.column_privileges
      WHERE grantee='ethos_tenant_runtime' AND table_schema='ethos_technical'
        AND table_name='MutationReceipt' AND privilege_type='INSERT') THEN
    RAISE EXCEPTION 'CONSISTENCY_PROFILE_REQUIRED';
  END IF;
END $$;
DO $$
DECLARE role_name text;
BEGIN
  IF to_regclass('ethos_identity."AuthCredential"') IS NULL THEN
    RAISE EXCEPTION 'AUTH_MIGRATIONS_REQUIRED';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['ethos_auth_runtime','ethos_tenant_runtime'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('CREATE ROLE %I LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION', role_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name AND
      (NOT rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))
      OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=role_name))
      OR EXISTS (SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=role_name))
      OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner=(SELECT oid FROM pg_roles WHERE rolname=role_name))
      OR EXISTS (SELECT 1 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=role_name))
      OR EXISTS (SELECT 1 FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname=role_name)) THEN
      RAISE EXCEPTION 'UNSAFE_RESERVED_RUNTIME_ROLE';
    END IF;
  END LOOP;
END $$;
-- Bound this reconciliation to application schemas and the two reserved roles.
REVOKE ALL ON ALL TABLES IN SCHEMA ethos, ethos_identity FROM ethos_auth_runtime, ethos_tenant_runtime;
REVOKE ALL ON SCHEMA ethos, ethos_identity FROM ethos_auth_runtime, ethos_tenant_runtime;
GRANT USAGE ON SCHEMA ethos, ethos_identity TO ethos_auth_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  ethos_identity."AuthCredential", ethos_identity."AuthSession", ethos_identity."AuthRefreshToken",
  ethos_identity."AuthActionToken", ethos_identity."AuthRecoveryCode", ethos_identity."AuthThrottle",
  ethos_identity."AuthMailOutbox" TO ethos_auth_runtime;
GRANT SELECT, INSERT ON ethos_identity."AuthEvent" TO ethos_auth_runtime;
GRANT SELECT ON ethos."User", ethos."Organization", ethos."OrganizationMembership", ethos."Role",
  ethos."Permission", ethos."MembershipRole", ethos."RolePermission", ethos."PlatformAccessGrant" TO ethos_auth_runtime;
GRANT INSERT ON ethos."User" TO ethos_auth_runtime;
GRANT USAGE ON SCHEMA ethos TO ethos_tenant_runtime;
GRANT SELECT ON
  ethos."Organization", ethos."OrganizationSettings", ethos."OrganizationMembership",
  ethos."Role", ethos."MembershipRole", ethos."RolePermission", ethos."Owner", ethos."Property",
  ethos."PropertyUnit", ethos."PropertyOwnership", ethos."Tenant", ethos."Lease", ethos."LeaseTenant",
  ethos."Contract", ethos."ContractVersion", ethos."LeaseRenewal", ethos."RentAdjustment",
  ethos."Charge", ethos."Installment", ethos."Payment", ethos."PaymentAllocation", ethos."Receipt",
  ethos."Inspection", ethos."InspectionReport", ethos."MaintenanceRequest", ethos."Document",
  ethos."Photo", ethos."Notification", ethos."AuditLog" TO ethos_tenant_runtime;
COMMIT;
