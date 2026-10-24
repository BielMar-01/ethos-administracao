// Real source audit returns booleans/counts and SQL-masked addresses only.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  sourceConnection,
  root,
  projectId,
} from "./access-preparation-common.mjs";
let c;
try {
  ({ client: c } = await sourceConnection());
  const users = (
    await c.query(`SELECT u.id,
 left(u.email,1)||'***@'||left(split_part(u.email,'@',2),1)||'***' AS "maskedEmail",
 u."disabledAt" IS NOT NULL AS disabled,
 coalesce(length(a."passwordHash")>0,false) AS "passwordConfigured",
 a."emailVerifiedAt" IS NOT NULL AS "emailConfirmed",
 coalesce(a."mfaEnabled" AND a."mfaSecretCipher" IS NOT NULL,false) AS "mfaConfigured",
 EXISTS(SELECT 1 FROM ethos."PlatformAccessGrant" p WHERE p."userId"=u.id AND p.role='SUPER_ADMIN' AND p."revokedAt" IS NULL) AS "superAdmin",
 (SELECT count(*)::integer FROM ethos_identity."AuthSession" s WHERE s."userId"=u.id AND s."revokedAt" IS NULL AND s."expiresAt">now()) AS "unexpiredUnrevokedSessions",
 (SELECT count(*)::integer FROM ethos_identity."AuthSession" s WHERE s."userId"=u.id AND s."revokedAt" IS NULL AND s."expiresAt">now() AND s."accessExpiresAt">now() AND s.assurance NOT IN ('MFA_SETUP','MFA_PENDING')) AS "unexpiredAccessSessions"
 FROM ethos."User" u LEFT JOIN ethos_identity."AuthCredential" a ON a."userId"=u.id ORDER BY u.id`)
  ).rows;
  const memberships = (
    await c.query(
      `SELECT m."userId",m."organizationId",m.status AS "membershipStatus",o.status AS "organizationStatus",coalesce(array_agg(r.code ORDER BY r.code) FILTER(WHERE r.id IS NOT NULL),'{}') AS roles FROM ethos."OrganizationMembership" m JOIN ethos."Organization" o ON o.id=m."organizationId" LEFT JOIN ethos."MembershipRole" mr ON mr."membershipId"=m.id AND mr."organizationId"=m."organizationId" AND mr."revokedAt" IS NULL LEFT JOIN ethos."Role" r ON r.id=mr."roleId" AND r."organizationId"=m."organizationId" AND r."archivedAt" IS NULL GROUP BY m.id,m."userId",m."organizationId",m.status,o.status ORDER BY m."organizationId",m."userId"`,
    )
  ).rows;
  const organizations = (
    await c.query('SELECT id,status FROM ethos."Organization" ORDER BY id')
  ).rows;
  const mail = (
    await c.query(
      'SELECT count(*)::integer AS pending FROM ethos_identity."AuthMailOutbox" WHERE "deliveredAt" IS NULL',
    )
  ).rows[0];
  let managedSupabaseAuthUsers = null;
  let managedAuthCountStatus = "not_available";
  await c.query("SAVEPOINT managed_auth_count");
  try {
    if (
      (await c.query("SELECT to_regclass('auth.users') IS NOT NULL AS present"))
        .rows[0].present
    ) {
      managedSupabaseAuthUsers = (
        await c.query("SELECT count(*)::int AS count FROM auth.users")
      ).rows[0].count;
      managedAuthCountStatus = "count_only";
    }
  } catch (error) {
    await c.query("ROLLBACK TO SAVEPOINT managed_auth_count");
    if (error.code !== "42501") throw error;
    managedAuthCountStatus = "permission_denied_no_grants_changed";
  }
  await c.query("RELEASE SAVEPOINT managed_auth_count");
  const report = {
    at: new Date().toISOString(),
    projectId,
    sourceReadOnly: true,
    sourceWrites: false,
    usersCount: users.length,
    managedSupabaseAuthUsers,
    managedAuthCountStatus,
    identitySystem:
      "own authentication in ethos.User and ethos_identity; no automatic Supabase Auth linkage",
    superAdmins: users.filter((u) => u.superAdmin).length,
    organizationAdmins: memberships.filter((m) =>
      m.roles.includes("ADMIN_ORGANIZACAO"),
    ).length,
    organizations,
    users: users.map((u) => ({
      ...u,
      loginBlockers: [
        ...(u.disabled ? ["USER_DISABLED"] : []),
        ...(!u.passwordConfigured ? ["PASSWORD_NOT_CONFIGURED"] : []),
        ...(!u.emailConfirmed ? ["EMAIL_NOT_CONFIRMED"] : []),
        ...(u.superAdmin && !u.mfaConfigured
          ? ["MFA_ENROLLMENT_REQUIRED_NOT_FULL_ACCESS"]
          : []),
      ],
    })),
    memberships,
    pendingMailCount: mail.pending,
    credentialValuesSelected: false,
    realLoginAttempted: false,
    limitations: [
      "password correctness is not tested without operator-held credentials",
      "an unexpired session count is not proof of a successful real login",
      "account/IP throttle and external email delivery are not exercised",
    ],
  };
  await c.query("ROLLBACK");
  writeFileSync(
    resolve(root, "docs/etapa-0.11.1-users.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      projectId,
      readOnly: true,
      users: report.usersCount,
      superAdmins: report.superAdmins,
      organizationAdmins: report.organizationAdmins,
      organizations: organizations.length,
      pendingMail: mail.pending,
      managedSupabaseAuthUsers,
      credentialValuesSelected: false,
    }),
  );
} catch (error) {
  if (c) await c.query("ROLLBACK").catch(() => {});
  console.error(
    JSON.stringify({ failed: true, code: error.code ?? error.name }),
  );
  process.exitCode = 1;
} finally {
  if (c) await c.end();
}
