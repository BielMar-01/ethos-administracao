import type { Prisma } from "@ethos/database";
import { IdentityService } from "./identity.js";
import {
  AuthError,
  digest,
  randomToken,
  verifyPassword,
  hashPassword,
} from "./security.js";

export type Session = Prisma.AuthSessionGetPayload<{
  include: { user: { include: { credential: true } } };
}>;
export class SessionService extends IdentityService {
  async platform(userId: string, tx = this.db) {
    return !!(await tx.platformAccessGrant.findFirst({
      where: { userId, role: "SUPER_ADMIN", revokedAt: null },
      select: { id: true },
    }));
  }
  async createSession(
    userId: string,
    csrf: string,
    deviceLabel: string,
    expectedPasswordHash?: string,
  ) {
    const access = randomToken(),
      refresh = randomToken(),
      now = this.now();
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "userId" FROM ethos_identity."AuthCredential" WHERE "userId"=${userId}::uuid FOR UPDATE`;
      const credential = await tx.authCredential.findUnique({
        where: { userId },
      });
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!credential?.emailVerifiedAt || !user || user.disabledAt)
        throw new AuthError();
      if (
        expectedPasswordHash &&
        credential.passwordHash !== expectedPasswordHash
      )
        throw new AuthError(401, "INVALID_CREDENTIALS");
      const superAdmin = !!(await tx.platformAccessGrant.findFirst({
        where: { userId, revokedAt: null },
      }));
      const assurance = credential.mfaEnabled
        ? "MFA_PENDING"
        : superAdmin
          ? "MFA_SETUP"
          : "PASSWORD";
      const session = await tx.authSession.create({
        data: {
          userId,
          assurance,
          csrfHash: digest(csrf),
          accessHash: digest(access),
          accessExpiresAt: new Date(now.getTime() + 5 * 60_000),
          expiresAt: new Date(now.getTime() + 30 * 86400_000),
          reauthenticatedAt: now,
          deviceLabel: deviceLabel.slice(0, 120),
        },
      });
      await tx.authRefreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: digest(refresh),
          expiresAt: new Date(now.getTime() + 7 * 86400_000),
        },
      });
      await this.event("LOGIN", true, userId, session.id, tx);
      return session;
    });
    return { session: result, access, refresh };
  }
  async authenticate(access: string | undefined, allowLimited = false) {
    if (!access || access.length > 200) throw new AuthError();
    const session = await this.db.authSession.findUnique({
      where: { accessHash: digest(access) },
      include: { user: { include: { credential: true } } },
    });
    const now = this.now();
    if (
      !session ||
      session.revokedAt ||
      session.accessExpiresAt <= now ||
      session.expiresAt <= now ||
      session.user.disabledAt ||
      !session.user.credential?.emailVerifiedAt
    )
      throw new AuthError();
    const isSuper = await this.platform(session.userId);
    if (
      !allowLimited &&
      ((session.assurance !== "PASSWORD" && session.assurance !== "MFA") ||
        (isSuper && session.assurance !== "MFA") ||
        (session.user.credential.mfaEnabled && session.assurance !== "MFA"))
    )
      throw new AuthError(403, "MFA_REQUIRED");
    return session;
  }
  async rotate(refresh: string, csrf: string) {
    const now = this.now(),
      access = randomToken(),
      replacement = randomToken();
    const result = await this.db.$transaction(async (tx) => {
      const token = await tx.authRefreshToken.findUnique({
        where: { tokenHash: digest(refresh) },
      });
      if (!token) return { denied: true };
      await tx.$queryRaw`SELECT id FROM ethos_identity."AuthSession" WHERE id=${token.sessionId}::uuid FOR UPDATE`;
      const current = await tx.authRefreshToken.findUnique({
        where: { id: token.id },
      });
      const session = await tx.authSession.findUnique({
        where: { id: token.sessionId },
        include: { user: { include: { credential: true } } },
      });
      if (!session || session.csrfHash !== digest(csrf))
        return { denied: true };
      if (current?.usedAt) {
        await tx.authSession.update({
          where: { id: session.id },
          data: { revokedAt: now },
        });
        await this.event(
          "REFRESH_REPLAY",
          false,
          session.userId,
          session.id,
          tx,
        );
        return { denied: true };
      }
      if (
        !current ||
        current.expiresAt <= now ||
        session.expiresAt <= now ||
        session.revokedAt ||
        session.user.disabledAt
      )
        return { denied: true };
      await tx.authRefreshToken.update({
        where: { id: current.id },
        data: { usedAt: now },
      });
      await tx.authSession.update({
        where: { id: session.id },
        data: {
          accessHash: digest(access),
          accessExpiresAt: new Date(
            Math.min(now.getTime() + 5 * 60_000, session.expiresAt.getTime()),
          ),
          lastSeenAt: now,
        },
      });
      await tx.authRefreshToken.create({
        data: {
          sessionId: session.id,
          tokenHash: digest(replacement),
          expiresAt: new Date(
            Math.min(
              now.getTime() + 7 * 86400_000,
              session.expiresAt.getTime(),
            ),
          ),
        },
      });
      await this.event("REFRESH", true, session.userId, session.id, tx);
      return { denied: false };
    });
    if (result.denied) throw new AuthError();
    return { access, refresh: replacement };
  }
  async revoke(session: Session, all = false, id?: string) {
    await this.db.$transaction(async (tx) => {
      await tx.authSession.updateMany({
        where: {
          userId: session.userId,
          ...(all ? {} : { id: id ?? session.id }),
          revokedAt: null,
        },
        data: { revokedAt: this.now() },
      });
      await this.event(
        all ? "LOGOUT_ALL" : "SESSION_REVOKED",
        true,
        session.userId,
        session.id,
        tx,
      );
    });
  }
  recent(session: Session) {
    if (session.reauthenticatedAt.getTime() < this.now().getTime() - 5 * 60_000)
      throw new AuthError(403, "REAUTHENTICATION_REQUIRED");
  }
  async reauthenticate(session: Session, password: string) {
    await this.throttle(`reauth:${session.userId}`);
    if (
      !(await verifyPassword(session.user.credential!.passwordHash, password))
    ) {
      await this.event("REAUTHENTICATE", false, session.userId, session.id);
      throw new AuthError(401, "INVALID_CREDENTIALS");
    }
    await this.db.authSession.update({
      where: { id: session.id },
      data: { reauthenticatedAt: this.now() },
    });
    await this.event("REAUTHENTICATE", true, session.userId, session.id);
  }
  async changePassword(
    session: Session,
    currentPassword: string,
    password: string,
  ) {
    this.recent(session);
    await this.throttle(`password:${session.userId}`, 5);
    const passwordHash = await hashPassword(password);
    const valid = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "userId" FROM ethos_identity."AuthCredential" WHERE "userId"=${session.userId}::uuid FOR UPDATE`;
      const credential = await tx.authCredential.findUnique({
        where: { userId: session.userId },
      });
      if (
        !credential ||
        !(await verifyPassword(credential.passwordHash, currentPassword))
      )
        return false;
      await tx.authCredential.update({
        where: { userId: session.userId },
        data: { passwordHash },
      });
      await tx.authSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: this.now() },
      });
      await tx.authActionToken.updateMany({
        where: {
          userId: session.userId,
          purpose: "RESET_PASSWORD",
          usedAt: null,
        },
        data: { usedAt: this.now() },
      });
      await this.event(
        "PASSWORD_CHANGED",
        true,
        session.userId,
        session.id,
        tx,
      );
      return true;
    });
    if (!valid) throw new AuthError(401, "INVALID_CREDENTIALS");
  }
  async cleanup() {
    const now = this.now();
    await this.db.authSession.updateMany({
      where: { expiresAt: { lte: now }, revokedAt: null },
      data: { revokedAt: now },
    });
    // Keep consumed refresh tokens for the entire family lifetime to detect replay.
    await this.db.authRefreshToken.deleteMany({
      where: {
        session: {
          expiresAt: { lt: new Date(now.getTime() - 30 * 86400_000) },
        },
      },
    });
    await this.db.authActionToken.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - 30 * 86400_000) } },
    });
    await this.db.authThrottle.deleteMany({
      where: { windowStart: { lt: new Date(now.getTime() - 86400_000) } },
    });
    await this.db.authMailOutbox.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 30 * 86400_000) } },
    });
    // Authentication audit keeps immutable session UUID references without a destructive FK.
    await this.db.authSession.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - 90 * 86400_000) } },
    });
  }
}
