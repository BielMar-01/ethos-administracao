-- Run administratively in the intended environment; never from the API.
-- Stop if these reserved names already exist. Set independent passwords through a secret channel.
BEGIN;
CREATE ROLE ethos_auth_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE ROLE ethos_tenant_runtime LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT USAGE ON SCHEMA ethos, ethos_identity TO ethos_auth_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ethos_identity TO ethos_auth_runtime;
REVOKE UPDATE, DELETE ON ethos_identity."AuthEvent" FROM ethos_auth_runtime;
GRANT SELECT ON ethos."User",ethos."Organization",ethos."OrganizationMembership",ethos."Role",ethos."Permission",ethos."MembershipRole",ethos."RolePermission",ethos."PlatformAccessGrant" TO ethos_auth_runtime;
GRANT INSERT ON ethos."User" TO ethos_auth_runtime;
GRANT USAGE ON SCHEMA ethos TO ethos_tenant_runtime;
-- Global tables remain inaccessible under RLS; no write grants in 0.9.
GRANT SELECT ON ALL TABLES IN SCHEMA ethos TO ethos_tenant_runtime;
COMMIT;
