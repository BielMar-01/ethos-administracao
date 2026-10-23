import type { PrismaClient, Prisma } from "./generated/prisma/client.js";

/** Must come from a trusted server-side authorization decision, never request payload alone. */
export type OrganizationContext = {
  organizationId: string;
  userId: string;
};
export type OrganizationTransaction = Prisma.TransactionClient;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sets context only on this transaction's connection. Does not implement authentication or RBAC. */
export async function establishOrganizationContext(
  tx: OrganizationTransaction,
  context: OrganizationContext,
): Promise<void> {
  if (!uuid.test(context.organizationId) || !uuid.test(context.userId)) {
    throw new Error("INVALID_ORGANIZATION_CONTEXT");
  }
  const roles = await tx.$queryRaw<{ privileged: boolean }[]>`
    SELECT (rolsuper OR rolbypassrls) AS privileged FROM pg_roles WHERE rolname = current_user
  `;
  if (roles.length !== 1 || roles[0]?.privileged) {
    throw new Error("PRIVILEGED_DATABASE_ROLE_FORBIDDEN");
  }
  await tx.$queryRaw`
    SELECT set_config('ethos.organization_id', ${context.organizationId}, true),
           set_config('ethos.actor_membership_id', '', true)
  `;
  const memberships = await tx.organizationMembership.findMany({
    where: {
      organizationId: context.organizationId,
      userId: context.userId,
      status: "ACTIVE",
      organization: { status: "ACTIVE" },
    },
    select: { id: true },
    take: 1,
  });
  const membership = memberships[0];
  if (!membership) throw new Error("ORGANIZATION_ACCESS_DENIED");
  await tx.$queryRaw`
    SELECT set_config('ethos.actor_membership_id', ${membership.id}, true)
  `;
}

/** Use only tx inside callback; never retain it or access the root client there. */
export async function withOrganization<T>(
  prisma: PrismaClient,
  context: OrganizationContext,
  callback: (tx: OrganizationTransaction) => Promise<T>,
  options: { isolationLevel?: Prisma.TransactionIsolationLevel } = {},
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await establishOrganizationContext(tx, context);
      return callback(tx);
    },
    { maxWait: 10_000, timeout: 15_000, ...options },
  );
}
