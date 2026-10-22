BEGIN;
CREATE SCHEMA IF NOT EXISTS "ethos_identity";
CREATE TABLE "ethos_identity"."AuthCredential" (
    "userId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "mfaSecretCipher" TEXT,
    "pendingMfaCipher" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastTotpCounter" BIGINT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthCredential_pkey" PRIMARY KEY ("userId")
);
CREATE TABLE "ethos_identity"."AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID,
    "accessHash" CHAR(64) NOT NULL,
    "csrfHash" CHAR(64) NOT NULL,
    "assurance" VARCHAR(20) NOT NULL DEFAULT 'PASSWORD',
    "accessExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "reauthenticatedAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceLabel" VARCHAR(120) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ethos_identity"."AuthRefreshToken" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRefreshToken_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ethos_identity"."AuthActionToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthActionToken_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ethos_identity"."AuthRecoveryCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AuthRecoveryCode_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ethos_identity"."AuthEvent" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "sessionId" UUID,
    "category" VARCHAR(60) NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ethos_identity"."AuthThrottle" (
    "key" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);
CREATE TABLE "ethos_identity"."AuthMailOutbox" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "recipient" VARCHAR(320) NOT NULL,
    "purpose" VARCHAR(20) NOT NULL,
    "payloadCipher" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthMailOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthSession_accessHash_key" ON "ethos_identity"."AuthSession"("accessHash");
CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_idx" ON "ethos_identity"."AuthSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "ethos_identity"."AuthSession"("expiresAt");
CREATE UNIQUE INDEX "AuthRefreshToken_tokenHash_key" ON "ethos_identity"."AuthRefreshToken"("tokenHash");
CREATE INDEX "AuthRefreshToken_sessionId_idx" ON "ethos_identity"."AuthRefreshToken"("sessionId");
CREATE INDEX "AuthRefreshToken_expiresAt_idx" ON "ethos_identity"."AuthRefreshToken"("expiresAt");
CREATE UNIQUE INDEX "AuthActionToken_tokenHash_key" ON "ethos_identity"."AuthActionToken"("tokenHash");
CREATE INDEX "AuthActionToken_userId_purpose_idx" ON "ethos_identity"."AuthActionToken"("userId", "purpose");
CREATE INDEX "AuthActionToken_expiresAt_idx" ON "ethos_identity"."AuthActionToken"("expiresAt");
CREATE UNIQUE INDEX "AuthRecoveryCode_tokenHash_key" ON "ethos_identity"."AuthRecoveryCode"("tokenHash");
CREATE INDEX "AuthRecoveryCode_userId_idx" ON "ethos_identity"."AuthRecoveryCode"("userId");
CREATE INDEX "AuthEvent_userId_createdAt_idx" ON "ethos_identity"."AuthEvent"("userId", "createdAt");
CREATE INDEX "AuthThrottle_windowStart_idx" ON "ethos_identity"."AuthThrottle"("windowStart");
CREATE INDEX "AuthMailOutbox_availableAt_deliveredAt_idx" ON "ethos_identity"."AuthMailOutbox"("availableAt", "deliveredAt");
ALTER TABLE "ethos_identity"."AuthCredential" ADD CONSTRAINT "AuthCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ethos_identity"."AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ethos_identity"."AuthSession" ADD CONSTRAINT "AuthSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "ethos"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ethos_identity"."AuthRefreshToken" ADD CONSTRAINT "AuthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ethos_identity"."AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ethos_identity"."AuthActionToken" ADD CONSTRAINT "AuthActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ethos_identity"."AuthRecoveryCode" ADD CONSTRAINT "AuthRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ethos_identity"."AuthEvent" ADD CONSTRAINT "AuthEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ethos_identity"."AuthMailOutbox" ADD CONSTRAINT "AuthMailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ethos"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
REVOKE ALL ON SCHEMA ethos_identity FROM PUBLIC;
ALTER TABLE ethos_identity."AuthCredential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_identity."AuthCredential" FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_runtime ON ethos_identity."AuthCredential" FOR ALL USING (current_user = 'ethos_auth_runtime') WITH CHECK (current_user = 'ethos_auth_runtime');
ALTER TABLE ethos_identity."AuthSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_identity."AuthSession" FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_runtime ON ethos_identity."AuthSession" FOR ALL USING (current_user = 'ethos_auth_runtime') WITH CHECK (current_user = 'ethos_auth_runtime');
ALTER TABLE ethos_identity."AuthRefreshToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_identity."AuthRefreshToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_runtime ON ethos_identity."AuthRefreshToken" FOR ALL USING (current_user = 'ethos_auth_runtime') WITH CHECK (current_user = 'ethos_auth_runtime');
ALTER TABLE ethos_identity."AuthActionToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_identity."AuthActionToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_runtime ON ethos_identity."AuthActionToken" FOR ALL USING (current_user = 'ethos_auth_runtime') WITH CHECK (current_user = 'ethos_auth_runtime');
ALTER TABLE ethos_identity."AuthRecoveryCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_identity."AuthRecoveryCode" FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_runtime ON ethos_identity."AuthRecoveryCode" FOR ALL USING (current_user = 'ethos_auth_runtime') WITH CHECK (current_user = 'ethos_auth_runtime');
ALTER TABLE ethos_identity."AuthEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_identity."AuthEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_runtime ON ethos_identity."AuthEvent" FOR ALL USING (current_user = 'ethos_auth_runtime') WITH CHECK (current_user = 'ethos_auth_runtime');
ALTER TABLE ethos_identity."AuthThrottle" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_identity."AuthThrottle" FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_runtime ON ethos_identity."AuthThrottle" FOR ALL USING (current_user = 'ethos_auth_runtime') WITH CHECK (current_user = 'ethos_auth_runtime');
ALTER TABLE ethos_identity."AuthMailOutbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE ethos_identity."AuthMailOutbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY identity_runtime ON ethos_identity."AuthMailOutbox" FOR ALL USING (current_user = 'ethos_auth_runtime') WITH CHECK (current_user = 'ethos_auth_runtime');
CREATE POLICY identity_metadata_read ON ethos."User" FOR SELECT USING (current_user = 'ethos_auth_runtime');
CREATE POLICY identity_metadata_read ON ethos."Organization" FOR SELECT USING (current_user = 'ethos_auth_runtime');
CREATE POLICY identity_metadata_read ON ethos."OrganizationMembership" FOR SELECT USING (current_user = 'ethos_auth_runtime');
CREATE POLICY identity_metadata_read ON ethos."Role" FOR SELECT USING (current_user = 'ethos_auth_runtime');
CREATE POLICY identity_metadata_read ON ethos."Permission" FOR SELECT USING (current_user = 'ethos_auth_runtime');
CREATE POLICY identity_metadata_read ON ethos."MembershipRole" FOR SELECT USING (current_user = 'ethos_auth_runtime');
CREATE POLICY identity_metadata_read ON ethos."RolePermission" FOR SELECT USING (current_user = 'ethos_auth_runtime');
CREATE POLICY identity_metadata_read ON ethos."PlatformAccessGrant" FOR SELECT USING (current_user = 'ethos_auth_runtime');
CREATE POLICY identity_registration ON ethos."User" FOR INSERT WITH CHECK (current_user = 'ethos_auth_runtime');
ALTER TABLE ethos_identity."AuthSession" ADD CONSTRAINT session_assurance CHECK (assurance IN ('PASSWORD','MFA_PENDING','MFA_SETUP','MFA'));
ALTER TABLE ethos_identity."AuthSession" ADD CONSTRAINT session_dates CHECK ("accessExpiresAt" <= "expiresAt");
ALTER TABLE ethos_identity."AuthActionToken" ADD CONSTRAINT action_purpose CHECK (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD'));
ALTER TABLE ethos_identity."AuthMailOutbox" ADD CONSTRAINT mail_purpose CHECK (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD'));
ALTER TABLE ethos_identity."AuthCredential" ADD CONSTRAINT mfa_secret_required CHECK (NOT "mfaEnabled" OR "mfaSecretCipher" IS NOT NULL);
CREATE FUNCTION ethos_identity.preserve_event() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='AUTH_EVENT_IMMUTABLE'; END; $$;
REVOKE ALL ON FUNCTION ethos_identity.preserve_event() FROM PUBLIC;
CREATE TRIGGER preserve_event BEFORE UPDATE OR DELETE ON ethos_identity."AuthEvent" FOR EACH ROW EXECUTE FUNCTION ethos_identity.preserve_event();
COMMIT;
