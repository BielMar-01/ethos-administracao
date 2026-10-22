import type { Prisma, PrismaClient } from "@ethos/database";
import type { AuthDependencies } from "./types.js";
import { randomUUID } from "node:crypto";
import {
  AuthError,
  digest,
  randomToken,
  hashPassword,
  verifyPassword,
  encryptSecret,
  decryptSecret,
} from "./security.js";

export type Tx = Prisma.TransactionClient;
export class IdentityService {
  readonly db: PrismaClient;
  readonly dummyHash: Promise<string>;
  constructor(readonly dependencies: AuthDependencies) {
    this.db = dependencies.identity;
    this.dummyHash = hashPassword(randomToken());
  }
  now() {
    return this.dependencies.now?.() ?? new Date();
  }
  async event(
    category: string,
    success: boolean,
    userId?: string,
    sessionId?: string,
    tx: Tx = this.db,
  ) {
    await tx.authEvent.create({
      data: { category, success, userId, sessionId },
    });
  }
  async throttle(key: string, max = 10) {
    const now = this.now(),
      cutoff = new Date(now.getTime() - 15 * 60_000);
    const rows = await this.db.$queryRaw<{ attempts: number }[]>`
      INSERT INTO ethos_identity."AuthThrottle" (key,attempts,"windowStart") VALUES (${digest(key)},1,${now})
      ON CONFLICT (key) DO UPDATE SET attempts=CASE WHEN ethos_identity."AuthThrottle"."windowStart" < ${cutoff} THEN 1 ELSE ethos_identity."AuthThrottle".attempts+1 END,
      "windowStart"=CASE WHEN ethos_identity."AuthThrottle"."windowStart" < ${cutoff} THEN ${now} ELSE ethos_identity."AuthThrottle"."windowStart" END RETURNING attempts
    `;
    if ((rows[0]?.attempts ?? max + 1) > max)
      throw new AuthError(429, "RATE_LIMIT_EXCEEDED");
  }
  async action(
    userId: string,
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
    tx: Tx,
  ) {
    const token = randomToken(),
      now = this.now();
    await tx.authActionToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: now },
    });
    await tx.authActionToken.create({
      data: {
        userId,
        purpose,
        tokenHash: digest(token),
        expiresAt: new Date(
          now.getTime() +
            (purpose === "VERIFY_EMAIL" ? 24 * 3600_000 : 30 * 60_000),
        ),
      },
    });
    return token;
  }
  async enqueue(
    userId: string,
    recipient: string,
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
    token: string,
    tx: Tx,
  ) {
    const id = randomUUID();
    await tx.authMailOutbox.create({
      data: {
        id,
        userId,
        recipient,
        purpose,
        payloadCipher: encryptSecret(
          token,
          this.dependencies.encryptionKey,
          `mail:${id}`,
        ),
        availableAt: this.now(),
      },
    });
  }
  async drainMail() {
    const now = this.now();
    const jobs = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM ethos_identity."AuthMailOutbox" WHERE "deliveredAt" IS NULL AND "availableAt"<=${now} AND attempts<5 ORDER BY "createdAt" LIMIT 10 FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return [];
      await tx.authMailOutbox.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: {
          attempts: { increment: 1 },
          availableAt: new Date(now.getTime() + 5 * 60_000),
        },
      });
      return tx.authMailOutbox.findMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
    });
    for (const job of jobs) {
      try {
        if (job.purpose !== "VERIFY_EMAIL" && job.purpose !== "RESET_PASSWORD")
          continue;
        const token = decryptSecret(
          job.payloadCipher,
          this.dependencies.encryptionKey,
          `mail:${job.id}`,
        );
        await this.dependencies.deliver({
          to: job.recipient,
          purpose: job.purpose,
          token,
        });
        await this.db.authMailOutbox.update({
          where: { id: job.id },
          data: { deliveredAt: this.now(), payloadCipher: "DELIVERED" },
        });
      } catch {
        await this.event("MAIL_DELIVERY_FAILED", false);
      }
    }
  }
  async register(email: string, password: string, displayName: string) {
    await this.throttle(`register:${email}`, 5);
    const passwordHash = await hashPassword(password);
    let message: { userId: string; token: string } | undefined;
    try {
      message = await this.db.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (existing) return undefined;
        const user = await tx.user.create({ data: { email, displayName } });
        await tx.authCredential.create({
          data: { userId: user.id, passwordHash },
        });
        const token = await this.action(user.id, "VERIFY_EMAIL", tx);
        await this.enqueue(user.id, email, "VERIFY_EMAIL", token, tx);
        await this.event("REGISTER", true, user.id, undefined, tx);
        return { userId: user.id, token };
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
    void message;
  }
  async requestAction(
    email: string,
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
  ) {
    await this.throttle(`${purpose}:${email}`, 5);
    // Perform the same expensive operation regardless of account existence.
    await verifyPassword(await this.dummyHash, randomToken());
    const user = await this.db.user.findUnique({
      where: { email },
      include: { credential: true },
    });
    if (
      user &&
      !user.disabledAt &&
      user.credential &&
      (purpose !== "VERIFY_EMAIL" || !user.credential.emailVerifiedAt)
    ) {
      await this.db.$transaction(async (tx) => {
        const token = await this.action(user.id, purpose, tx);
        await this.enqueue(user.id, email, purpose, token, tx);
      });
    }
    await this.event(`${purpose}_REQUEST`, true);
  }
  async consume(
    token: string,
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
    password?: string,
  ) {
    const now = this.now(),
      passwordHash = password ? await hashPassword(password) : undefined;
    const result = await this.db.$transaction(async (tx) => {
      const action = await tx.authActionToken.findUnique({
        where: { tokenHash: digest(token) },
      });
      if (
        !action ||
        action.purpose !== purpose ||
        action.usedAt ||
        action.expiresAt <= now
      )
        return false;
      await tx.$queryRaw`SELECT "userId" FROM ethos_identity."AuthCredential" WHERE "userId"=${action.userId}::uuid FOR UPDATE`;
      const claimed = await tx.authActionToken.updateMany({
        where: { id: action.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;
      const user = await tx.user.findUnique({ where: { id: action.userId } });
      if (!user || user.disabledAt) return false;
      if (purpose === "VERIFY_EMAIL")
        await tx.authCredential.update({
          where: { userId: user.id },
          data: { emailVerifiedAt: now },
        });
      else {
        if (!passwordHash) return false;
        await tx.authCredential.update({
          where: { userId: user.id },
          data: { passwordHash },
        });
        await tx.authSession.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.authActionToken.updateMany({
          where: { userId: user.id, purpose, usedAt: null },
          data: { usedAt: now },
        });
      }
      await this.event(purpose, true, user.id, undefined, tx);
      return true;
    });
    if (!result) throw new AuthError(400, "INVALID_OR_EXPIRED_TOKEN");
  }
  async checkPassword(email: string, password: string) {
    await this.throttle(`login:${email}`);
    const user = await this.db.user.findUnique({
      where: { email },
      include: { credential: true },
    });
    const valid = await verifyPassword(
      user?.credential?.passwordHash ?? (await this.dummyHash),
      password,
    );
    if (
      !valid ||
      !user ||
      user.disabledAt ||
      !user.credential?.emailVerifiedAt
    ) {
      await this.event("LOGIN", false);
      throw new AuthError(401, "INVALID_CREDENTIALS");
    }
    return user;
  }
}
