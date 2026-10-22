BEGIN;
-- Privileged metadata changes revoke affected identity sessions immediately.
-- Trigger-only definer; runtime roles cannot call it or modify RBAC metadata.
CREATE FUNCTION ethos_identity.revoke_on_privilege_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE payload jsonb; previous jsonb; affected uuid[]; tenant_id uuid; reference_id uuid;
BEGIN
  payload := to_jsonb(NEW);
  previous := CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  IF TG_OP='UPDATE' AND payload=previous THEN RETURN NEW; END IF;
  reference_id := (payload->>'id')::uuid;
  tenant_id := (payload->>'organizationId')::uuid;
  IF TG_TABLE_NAME='User' THEN
    IF payload->>'disabledAt' IS NOT DISTINCT FROM previous->>'disabledAt' AND payload->>'email' IS NOT DISTINCT FROM previous->>'email' THEN RETURN NEW; END IF;
    affected := ARRAY[reference_id];
    IF payload->>'email' IS DISTINCT FROM previous->>'email' THEN
      UPDATE ethos_identity."AuthCredential" SET "emailVerifiedAt"=NULL WHERE "userId"=reference_id;
    END IF;
  ELSIF TG_TABLE_NAME='AuthCredential' THEN
    IF payload->>'passwordHash' IS NOT DISTINCT FROM previous->>'passwordHash' THEN RETURN NEW; END IF;
    affected := ARRAY[(payload->>'userId')::uuid];
  ELSIF TG_TABLE_NAME='PlatformAccessGrant' THEN
    affected := ARRAY[(payload->>'userId')::uuid];
  ELSIF TG_TABLE_NAME='Organization' THEN
    IF payload->>'status' IS NOT DISTINCT FROM previous->>'status' THEN RETURN NEW; END IF;
    SELECT array_agg("userId") INTO affected FROM ethos."OrganizationMembership" WHERE "organizationId"=reference_id;
  ELSIF TG_TABLE_NAME='OrganizationMembership' THEN
    affected := ARRAY[(payload->>'userId')::uuid];
  ELSIF TG_TABLE_NAME='MembershipRole' THEN
    SELECT array_agg("userId") INTO affected FROM ethos."OrganizationMembership" WHERE id=(payload->>'membershipId')::uuid AND "organizationId"=tenant_id;
  ELSIF TG_TABLE_NAME IN ('Role','RolePermission') THEN
    SELECT array_agg(m."userId") INTO affected FROM ethos."MembershipRole" mr JOIN ethos."OrganizationMembership" m ON m.id=mr."membershipId" AND m."organizationId"=mr."organizationId"
      WHERE mr."organizationId"=tenant_id AND mr."roleId"=CASE WHEN TG_TABLE_NAME='Role' THEN reference_id ELSE (payload->>'roleId')::uuid END;
  END IF;
  WITH revoked AS (
    UPDATE ethos_identity."AuthSession" SET "revokedAt"=clock_timestamp()
    WHERE "userId"=ANY(affected) AND "revokedAt" IS NULL RETURNING id,"userId"
  ) INSERT INTO ethos_identity."AuthEvent" (id,"userId","sessionId",category,success,reason)
    SELECT gen_random_uuid(),"userId",id,'SECURITY_PRIVILEGE_CHANGED',true,'Source: '||TG_TABLE_NAME||':'||coalesce(reference_id::text,payload->>'userId') FROM revoked;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION ethos_identity.revoke_on_privilege_change() FROM PUBLIC;
CREATE TRIGGER revoke_identity_sessions AFTER UPDATE ON ethos."User" FOR EACH ROW EXECUTE FUNCTION ethos_identity.revoke_on_privilege_change();
CREATE TRIGGER revoke_identity_sessions AFTER UPDATE ON ethos_identity."AuthCredential" FOR EACH ROW EXECUTE FUNCTION ethos_identity.revoke_on_privilege_change();
CREATE TRIGGER revoke_identity_sessions AFTER UPDATE ON ethos."Organization" FOR EACH ROW EXECUTE FUNCTION ethos_identity.revoke_on_privilege_change();
CREATE TRIGGER revoke_identity_sessions AFTER INSERT OR UPDATE ON ethos."PlatformAccessGrant" FOR EACH ROW EXECUTE FUNCTION ethos_identity.revoke_on_privilege_change();
CREATE TRIGGER revoke_identity_sessions AFTER INSERT OR UPDATE ON ethos."OrganizationMembership" FOR EACH ROW EXECUTE FUNCTION ethos_identity.revoke_on_privilege_change();
CREATE TRIGGER revoke_identity_sessions AFTER INSERT OR UPDATE ON ethos."MembershipRole" FOR EACH ROW EXECUTE FUNCTION ethos_identity.revoke_on_privilege_change();
CREATE TRIGGER revoke_identity_sessions AFTER UPDATE ON ethos."Role" FOR EACH ROW EXECUTE FUNCTION ethos_identity.revoke_on_privilege_change();
CREATE TRIGGER revoke_identity_sessions AFTER INSERT OR UPDATE ON ethos."RolePermission" FOR EACH ROW EXECUTE FUNCTION ethos_identity.revoke_on_privilege_change();
COMMIT;
