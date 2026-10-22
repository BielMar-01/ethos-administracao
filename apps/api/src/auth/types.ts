import type { PrismaClient } from "@ethos/database";
export type MailMessage = {
  to: string;
  purpose: "VERIFY_EMAIL" | "RESET_PASSWORD";
  token: string;
};
export type AuthDependencies = {
  identity: PrismaClient;
  tenant: PrismaClient;
  cookieSecret: string;
  encryptionKey: Buffer;
  origin: string;
  production: boolean;
  deliver: (message: MailMessage) => Promise<void>;
  now?: () => Date;
  rateLimitMax?: number;
};
