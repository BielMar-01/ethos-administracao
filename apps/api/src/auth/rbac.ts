import { withOrganization } from "@ethos/database";
import { SessionService, type Session } from "./sessions.js";
import { AuthError } from "./security.js";

export const resources = [
  "dashboard",
  "properties",
  "owners",
  "tenants",
  "leases",
  "contracts",
  "finance",
  "inspections",
  "maintenance",
  "calendar",
  "reports",
  "notifications",
  "settings",
] as const;
const read = (items: readonly string[]) => items.map((r) => `${r}.read`);
const write = (items: readonly string[]) =>
  items.flatMap((r) =>
    ["read", "create", "update", "archive"].map((a) => `${r}.${a}`),
  );
export const rolePermissions: Record<string, string[]> = {
  ADMIN_ORGANIZACAO: [...write(resources), "members.manage"],
  GESTOR: [
    ...read(resources.filter((r) => r !== "settings")),
    ...write([
      "properties",
      "owners",
      "tenants",
      "leases",
      "contracts",
      "inspections",
      "maintenance",
      "calendar",
    ]),
  ],
  FINANCEIRO: [
    ...write(["finance"]),
    ...read([
      "dashboard",
      "finance",
      "leases",
      "contracts",
      "owners",
      "tenants",
      "reports",
      "notifications",
    ]),
  ],
  PROPRIETARIO: [
    "properties",
    "leases",
    "contracts",
    "finance",
    "reports",
    "notifications",
  ].map((r) => `${r}.read_own`),
  INQUILINO: [
    "leases",
    "contracts",
    "finance",
    "inspections",
    "maintenance",
    "notifications",
  ].map((r) => `${r}.read_own`),
};
export class AuthorizationService extends SessionService {
  async organizations(session: Session) {
    const links = await this.db.organizationMembership.findMany({
      where: {
        userId: session.userId,
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
      select: { organization: { select: { id: true, name: true } } },
    });
    return links.map((l) => l.organization);
  }
  async selectOrganization(session: Session, organizationId: string) {
    const membership = await this.db.organizationMembership.findFirst({
      where: {
        userId: session.userId,
        organizationId,
        status: "ACTIVE",
        organization: { status: "ACTIVE" },
      },
    });
    if (!membership) throw new AuthError(403, "ACCESS_DENIED");
    // Session choice is server-validated; future business requests cannot override it.
    await this.db.authSession.update({
      where: { id: session.id },
      data: { organizationId },
    });
    await this.event("ORGANIZATION_SELECTED", true, session.userId, session.id);
  }
  async permissions(session: Session) {
    if (!session.organizationId)
      throw new AuthError(409, "ORGANIZATION_REQUIRED");
    const organizationId = session.organizationId;
    return withOrganization(
      this.dependencies.tenant,
      { organizationId, userId: session.userId },
      async (tx) => {
        const membership = await tx.organizationMembership.findUnique({
          where: {
            organizationId_userId: { organizationId, userId: session.userId },
          },
        });
        if (!membership || membership.status !== "ACTIVE")
          throw new AuthError(403, "ACCESS_DENIED");
        const assignments = await this.db.membershipRole.findMany({
          where: {
            organizationId,
            membershipId: membership.id,
            revokedAt: null,
            role: { archivedAt: null },
          },
          include: {
            role: {
              include: {
                rolePermission_role: {
                  where: { revokedAt: null },
                  include: { permission: true },
                },
              },
            },
          },
        });
        const allowed = new Set<string>();
        for (const { role } of assignments) {
          for (const grant of role.rolePermission_role) {
            if (rolePermissions[role.code]?.includes(grant.permission.code))
              allowed.add(grant.permission.code);
          }
        }
        return [...allowed];
      },
    ).catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "ORGANIZATION_ACCESS_DENIED"
      )
        throw new AuthError(403, "ACCESS_DENIED");
      throw error;
    });
  }
  async authorize(session: Session, permission: string) {
    if (!(await this.permissions(session)).includes(permission)) {
      await this.event(
        "AUTHORIZATION_DENIED",
        false,
        session.userId,
        session.id,
      );
      throw new AuthError(403, "ACCESS_DENIED");
    }
    return true;
  }
}
