// Administrative CLI only. Never register this module as a public route.
import type { PrismaClient } from "@ethos/database";
import { rolePermissions } from "./rbac.js";
export async function provisionRoles(
  db: PrismaClient,
  organizationId: string,
  adminMembershipId?: string,
) {
  const [role] = await db.$queryRaw<
    { privileged: boolean }[]
  >`SELECT (rolsuper OR rolbypassrls) AS privileged FROM pg_roles WHERE rolname=current_user`;
  if (!role?.privileged) throw new Error("ADMINISTRATIVE_CONNECTION_REQUIRED");
  await db.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) throw Error("ORGANIZATION_NOT_FOUND");
    for (const [code, permissions] of Object.entries(rolePermissions)) {
      const role = await tx.role.upsert({
        where: { organizationId_code: { organizationId, code } },
        create: { organizationId, code, name: code },
        update: {},
      });
      for (const code of new Set(permissions)) {
        const permission = await tx.permission.upsert({
          where: { code },
          create: { code, description: code },
          update: {},
        });
        await tx.rolePermission.upsert({
          where: {
            organizationId_roleId_permissionId: {
              organizationId,
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          create: {
            organizationId,
            roleId: role.id,
            permissionId: permission.id,
          },
          update: {},
        });
      }
      if (code === "ADMIN_ORGANIZACAO" && adminMembershipId) {
        const membership = await tx.organizationMembership.findFirst({
          where: { id: adminMembershipId, organizationId, status: "ACTIVE" },
        });
        if (!membership) throw Error("ACTIVE_MEMBERSHIP_REQUIRED");
        await tx.membershipRole.upsert({
          where: {
            organizationId_membershipId_roleId: {
              organizationId,
              membershipId: membership.id,
              roleId: role.id,
            },
          },
          create: {
            organizationId,
            membershipId: membership.id,
            roleId: role.id,
          },
          update: {},
        });
      }
    }
    await tx.authEvent.create({
      data: { category: "RBAC_PROVISIONED", success: true },
    });
  });
}
