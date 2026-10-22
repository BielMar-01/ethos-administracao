import { AuthorizationService } from "./rbac.js";
import type { Session } from "./sessions.js";
import {
  AuthError,
  encryptSecret,
  decryptSecret,
  newTotpSecret,
  totp,
  totpCounter,
  randomToken,
  digest,
} from "./security.js";

export class AuthService extends AuthorizationService {
  async setupMfa(session: Session) {
    this.recent(session);
    const secret = newTotpSecret();
    const result = await this.db.authCredential.updateMany({
      where: { userId: session.userId, mfaEnabled: false },
      data: {
        pendingMfaCipher: encryptSecret(
          secret,
          this.dependencies.encryptionKey,
          session.userId,
        ),
      },
    });
    if (result.count !== 1) throw new AuthError(409, "MFA_ALREADY_ENABLED");
    await this.event("MFA_SETUP", true, session.userId, session.id);
    // Shown once to this authenticated user; never logged or stored in plaintext.
    return { secret, uri: totp(secret, session.user.email).toString() };
  }
  async verifyMfa(session: Session, code: string, enroll = false) {
    if (enroll) this.recent(session);
    await this.throttle(`mfa:${session.userId}`);
    const recovery = enroll ? Array.from({ length: 10 }, randomToken) : [];
    const now = this.now();
    const valid = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "userId" FROM ethos_identity."AuthCredential" WHERE "userId"=${session.userId}::uuid FOR UPDATE`;
      const credential = await tx.authCredential.findUnique({
        where: { userId: session.userId },
      });
      if (!credential || (enroll && credential.mfaEnabled)) return false;
      const cipher = enroll
        ? credential.pendingMfaCipher
        : credential.mfaSecretCipher;
      if (!cipher) return false;
      let secret: string;
      try {
        secret = decryptSecret(
          cipher,
          this.dependencies.encryptionKey,
          session.userId,
        );
      } catch {
        return false;
      }
      const counter = totpCounter(secret, code, now.getTime());
      let accepted = false;
      if (
        counter !== null &&
        (credential.lastTotpCounter === null ||
          counter > credential.lastTotpCounter)
      ) {
        await tx.authCredential.update({
          where: { userId: session.userId },
          data: {
            lastTotpCounter: counter,
            ...(enroll
              ? {
                  mfaEnabled: true,
                  mfaSecretCipher: cipher,
                  pendingMfaCipher: null,
                }
              : {}),
          },
        });
        accepted = true;
      } else if (!enroll && credential.mfaEnabled) {
        const used = await tx.authRecoveryCode.updateMany({
          where: {
            userId: session.userId,
            tokenHash: digest(code),
            usedAt: null,
          },
          data: { usedAt: now },
        });
        accepted = used.count === 1;
      }
      if (!accepted) return false;
      if (enroll) {
        await tx.authRecoveryCode.deleteMany({
          where: { userId: session.userId },
        });
        await tx.authRecoveryCode.createMany({
          data: recovery.map((value) => ({
            userId: session.userId,
            tokenHash: digest(value),
          })),
        });
        await tx.authSession.updateMany({
          where: {
            userId: session.userId,
            id: { not: session.id },
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }
      // Revoked sessions cannot be resurrected by concurrent MFA verification.
      const updated = await tx.authSession.updateMany({
        where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
        data: { assurance: "MFA", reauthenticatedAt: now },
      });
      if (updated.count !== 1) throw new AuthError();
      await this.event(
        enroll ? "MFA_ENABLED" : "MFA_VERIFIED",
        true,
        session.userId,
        session.id,
        tx,
      );
      return true;
    });
    if (!valid) {
      await this.event("MFA_REJECTED", false, session.userId, session.id);
      throw new AuthError(401, "INVALID_MFA_CODE");
    }
    return { recoveryCodes: recovery };
  }
}
