import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import argon2 from "argon2";
import { Secret, TOTP } from "otpauth";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[A-Z]/)
  .regex(/[a-z]/)
  .regex(/[0-9]/)
  .regex(/[^A-Za-z0-9\s]/);
export const emailSchema = z.string().trim().toLowerCase().email().max(320);
export const tokenSchema = z.string().regex(/^[a-zA-Z0-9_-]{43}$/);
export const randomToken = () => randomBytes(32).toString("base64url");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export const hashPassword = (password: string) =>
  argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
export async function verifyPassword(hash: string, password: string) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
export class AuthError extends Error {
  constructor(
    public statusCode = 401,
    public code = "AUTHENTICATION_REQUIRED",
  ) {
    super(code);
  }
}
export function encryptSecret(value: string, key: Buffer, userId: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`ethos-mfa:${userId}`));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function decryptSecret(value: string, key: Buffer, userId: string) {
  const data = Buffer.from(value, "base64url"),
    decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(`ethos-mfa:${userId}`));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    decipher.update(data.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export const newTotpSecret = () => new Secret({ size: 20 }).base32;
export const totp = (secret: string, label = "Ethos") =>
  new TOTP({
    issuer: "Ethos Administração",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
export function totpCounter(secret: string, code: string, now: number) {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totp(secret).validate({
    token: code,
    timestamp: now,
    window: 1,
  });
  return delta === null ? null : BigInt(Math.floor(now / 30000) + delta);
}
