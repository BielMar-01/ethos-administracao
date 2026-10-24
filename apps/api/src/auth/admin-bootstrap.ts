// Operator-only library. It is never imported by routes, public signup or startup.
import type { PrismaClient, OrganizationTransaction } from "@ethos/database";
import { z } from "zod";
import {
  emailSchema,
  passwordSchema,
  hashPassword,
  randomToken,
  digest,
} from "./security.js";
import { rolePermissions } from "./rbac.js";
export const bootstrapRequest = z
  .strictObject({
    kind: z.enum(["FIRST_SUPER_ADMIN", "ORGANIZATION_USER"]),
    email: emailSchema,
    displayName: z.string().trim().min(2).max(200),
    password: passwordSchema,
    reason: z.string().trim().min(12).max(500),
    organizationId: z.uuid().optional(),
    role: z
      .enum([
        "ADMIN_ORGANIZACAO",
        "GESTOR",
        "FINANCEIRO",
        "PROPRIETARIO",
        "INQUILINO",
      ])
      .optional(),
  })
  .superRefine((v, c) => {
    if (v.kind === "FIRST_SUPER_ADMIN" && (v.organizationId || v.role))
      c.addIssue({
        code: "custom",
        message: "PLATFORM_AND_TENANT_ROLES_SEPARATE",
      });
    if (v.kind === "ORGANIZATION_USER" && (!v.organizationId || !v.role))
      c.addIssue({ code: "custom", message: "ORGANIZATION_AND_ROLE_REQUIRED" });
    if (v.reason.includes(v.password))
      c.addIssue({ code: "custom", message: "SECRET_IN_REASON_FORBIDDEN" });
  });
async function roleDefinition(
  tx: OrganizationTransaction,
  org: string,
  code: string,
) {
  const role = await tx.role.upsert({
    where: { organizationId_code: { organizationId: org, code } },
    create: { organizationId: org, code, name: code },
    update: {},
  });
  if (role.archivedAt) throw Error("ARCHIVED_ROLE_REQUIRES_REVIEW");
  for (const permissionCode of new Set(rolePermissions[code] ?? [])) {
    const permission = await tx.permission.upsert({
      where: { code: permissionCode },
      create: { code: permissionCode, description: permissionCode },
      update: {},
    });
    await tx.rolePermission.upsert({
      where: {
        organizationId_roleId_permissionId: {
          organizationId: org,
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      create: {
        organizationId: org,
        roleId: role.id,
        permissionId: permission.id,
      },
      update: {},
    });
  }
  return role;
}
export async function bootstrapAdministrativeUser(
  db: PrismaClient,
  input: unknown,
  writeHandoff?: (result: {
    userId: string;
    verificationToken: string;
    expiresAt: Date;
    kind: string;
    mfaRequired: boolean;
  }) => Promise<void>,
) {
  const value = bootstrapRequest.parse(input);
  const flags = await db.$queryRaw<
    { privileged: boolean }[]
  >`SELECT (rolsuper OR rolbypassrls) AS privileged FROM pg_roles WHERE rolname=current_user`;
  if (!flags[0]?.privileged) throw Error("ADMINISTRATIVE_CONNECTION_REQUIRED");
  const passwordHash = await hashPassword(value.password),
    token = randomToken();
  return db.$transaction(
    async (tx) => {
      // ReadCommitted: after waiting, the next query sees the previous bootstrap's commit.
      // Locks end with the transaction; no application runtime membership is granted.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('ethos:initial-admin-bootstrap',0))::text`;
      if (
        value.kind === "FIRST_SUPER_ADMIN" &&
        (await tx.platformAccessGrant.count({
          where: { role: "SUPER_ADMIN" },
        })) > 0
      )
        throw Error("INITIAL_SUPER_ADMIN_ALREADY_PROVISIONED");
      if (
        await tx.user.findUnique({
          where: { email: value.email },
          select: { id: true },
        })
      )
        throw Error("EXISTING_IDENTITY_REQUIRES_SEPARATE_AUTHORIZATION");
      if (value.kind === "ORGANIZATION_USER") {
        const org = await tx.organization.findUnique({
          where: { id: value.organizationId! },
          select: { status: true },
        });
        if (org?.status !== "ACTIVE")
          throw Error("ACTIVE_ORGANIZATION_REQUIRED");
      }
      const user = await tx.user.create({
        data: {
          email: value.email,
          displayName: value.displayName,
          credential: { create: { passwordHash } },
        },
        select: { id: true },
      });
      if (value.kind === "FIRST_SUPER_ADMIN")
        await tx.platformAccessGrant.create({
          data: { userId: user.id, role: "SUPER_ADMIN", reason: value.reason },
        });
      else {
        const membership = await tx.organizationMembership.create({
          data: {
            organizationId: value.organizationId!,
            userId: user.id,
            status: "ACTIVE",
          },
        });
        const role = await roleDefinition(
          tx,
          value.organizationId!,
          value.role!,
        );
        await tx.membershipRole.create({
          data: {
            organizationId: value.organizationId!,
            membershipId: membership.id,
            roleId: role.id,
          },
        });
      }
      const expiresAt = new Date(Date.now() + 24 * 3600000);
      await tx.authActionToken.create({
        data: {
          userId: user.id,
          purpose: "VERIFY_EMAIL",
          tokenHash: digest(token),
          expiresAt,
        },
      });
      await tx.authEvent.create({
        data: {
          userId: user.id,
          category: "OPERATOR_USER_PROVISIONED",
          success: true,
          reason: value.reason,
        },
      });
      // The caller must write token only to a protected handoff file, never logs/stdout.
      const result = {
        userId: user.id,
        verificationToken: token,
        expiresAt,
        kind: value.kind,
        mfaRequired: value.kind === "FIRST_SUPER_ADMIN",
      };
      if (writeHandoff) await writeHandoff(result);
      return result;
    },
    { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 },
  );
}
