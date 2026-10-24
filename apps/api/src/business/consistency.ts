import { createHash } from "node:crypto";
import type { OrganizationTransaction } from "@ethos/database";
import { AuthError } from "../auth/security.js";

export type MutationHeaders = { ifMatch?: string; idempotencyKey?: string };
export type Mutation = MutationHeaders & {
  resource: string;
  operation: string;
  id?: string;
  input: unknown;
};
export class ConsistencyError extends AuthError {}
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export const etag = (
  org: string,
  resource: string,
  id: string,
  revision: bigint,
) => `"${hash(`${org}/${resource}/${id}/${revision}`)}"`;

export async function revisions<T extends { id: string }>(
  tx: OrganizationTransaction,
  org: string,
  resource: string,
  rows: T[],
) {
  if (!rows.length) return [];
  const stored = await tx.resourceRevision.findMany({
    where: {
      organizationId: org,
      resource,
      recordId: { in: rows.map((r) => r.id) },
    },
  });
  const counters = new Map(stored.map((r) => [r.recordId, r.revision]));
  return rows.map((row) => ({
    ...row,
    _etag: etag(org, resource, row.id, counters.get(row.id) ?? 0n),
  }));
}

// Called only after current membership and operation-specific RBAC have been checked.
// Receipt and effect share the surrounding Serializable transaction. A unique-key
// race rolls back the entire loser; the caller retries serialization conflicts.
export async function beginMutation(
  tx: OrganizationTransaction,
  org: string,
  member: string,
  mutation: Mutation,
) {
  const key = mutation.idempotencyKey;
  if (!key) throw new ConsistencyError(428, "IDEMPOTENCY_KEY_REQUIRED");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
    throw new ConsistencyError(400, "INVALID_IDEMPOTENCY_KEY");
  const keyHash = hash(key);
  const inputHash = hash(
    canonical({ input: mutation.input, ifMatch: mutation.ifMatch ?? null }),
  );
  const identity = {
    organizationId: org,
    membershipId: member,
    operation: mutation.operation,
    keyHash,
  };
  // Transaction lock: never session-level, never shared outside this transaction.
  // Serializable snapshots taken before waiting may require the bounded retry.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${canonical(identity)}, 0))::text`;
  const existing = await tx.mutationReceipt.findUnique({
    where: { organizationId_membershipId_operation_keyHash: identity },
  });
  if (existing && existing.inputHash !== inputHash)
    throw new ConsistencyError(409, "IDEMPOTENCY_CONFLICT");
  if (!existing && mutation.id) {
    if (!mutation.ifMatch)
      throw new ConsistencyError(428, "PRECONDITION_REQUIRED");
    const revision = await tx.resourceRevision.findUnique({
      where: {
        organizationId_resource_recordId: {
          organizationId: org,
          resource: mutation.resource,
          recordId: mutation.id,
        },
      },
    });
    if (
      mutation.ifMatch !==
      etag(org, mutation.resource, mutation.id, revision?.revision ?? 0n)
    )
      throw new ConsistencyError(412, "PRECONDITION_FAILED");
  }
  return { existing, identity, inputHash };
}
export async function finishMutation(
  tx: OrganizationTransaction,
  org: string,
  mutation: Mutation,
  receipt: Awaited<ReturnType<typeof beginMutation>>,
  id: string,
) {
  await tx.resourceRevision.upsert({
    where: {
      organizationId_resource_recordId: {
        organizationId: org,
        resource: mutation.resource,
        recordId: id,
      },
    },
    create: {
      organizationId: org,
      resource: mutation.resource,
      recordId: id,
      revision: 1n,
    },
    update: { revision: { increment: 1n } },
  });
  await tx.$executeRaw`INSERT INTO ethos_technical."MutationReceipt"
    ("organizationId", "membershipId", operation, "keyHash", "inputHash", resource, "recordId")
    VALUES (${org}::uuid, ${receipt.identity.membershipId}::uuid, ${receipt.identity.operation},
      ${receipt.identity.keyHash}, ${receipt.inputHash}, ${mutation.resource}, ${id}::uuid)`;
}
