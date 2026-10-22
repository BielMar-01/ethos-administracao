import { createDatabaseClient } from "@ethos/database";
import nodemailer from "nodemailer";
import type { AuthDependencies } from "./types.js";

export function authRuntime(environment: NodeJS.ProcessEnv = process.env) {
  const production = environment.NODE_ENV === "production";
  const identityUrl = environment.AUTH_IDENTITY_DATABASE_URL,
    tenantUrl = environment.DATABASE_URL;
  const cookieSecret = environment.AUTH_COOKIE_SECRET,
    encodedKey = environment.AUTH_ENCRYPTION_KEY;
  const origin = environment.WEB_ORIGIN,
    host = environment.SMTP_HOST,
    from = environment.SMTP_FROM;
  if (
    !identityUrl ||
    !tenantUrl ||
    !cookieSecret ||
    !encodedKey ||
    !origin ||
    !host ||
    !from
  )
    throw Error("AUTH_CONFIGURATION_REQUIRED");
  const encryptionKey = Buffer.from(encodedKey, "base64");
  if (
    cookieSecret.length < 32 ||
    encryptionKey.length !== 32 ||
    new URL(origin).origin !== origin ||
    (production && !origin.startsWith("https://")) ||
    (production && environment.ETHOS_LOCAL_DATABASE === "1")
  )
    throw Error("AUTH_CONFIGURATION_INVALID");
  const identity = createDatabaseClient({
    connectionString: identityUrl,
    allowLocalPlaintext: environment.ETHOS_LOCAL_DATABASE === "1",
  });
  const tenant = createDatabaseClient({
    connectionString: tenantUrl,
    allowLocalPlaintext: environment.ETHOS_LOCAL_DATABASE === "1",
  });
  const port = Number(environment.SMTP_PORT ?? 587);
  if (![465, 587].includes(port)) throw Error("SMTP_TLS_PORT_REQUIRED");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: true,
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
    ...(environment.SMTP_USER
      ? {
          auth: {
            user: environment.SMTP_USER,
            pass: environment.SMTP_PASSWORD,
          },
        }
      : {}),
  });
  const dependencies: AuthDependencies = {
    identity: identity.prisma,
    tenant: tenant.prisma,
    cookieSecret,
    encryptionKey,
    origin,
    production,
    deliver: async (message) => {
      const path =
        message.purpose === "VERIFY_EMAIL"
          ? "/verify-email"
          : "/reset-password";
      // Fragment prevents tokens entering HTTP request URLs, referers and access logs.
      const link = `${origin}${path}#token=${encodeURIComponent(message.token)}`;
      await transporter.sendMail({
        from,
        to: message.to,
        subject:
          message.purpose === "VERIFY_EMAIL"
            ? "Confirme seu e-mail — Ethos"
            : "Redefina sua senha — Ethos",
        text: `Use este link para continuar: ${link}\nSe não solicitou esta ação, ignore esta mensagem.`,
      });
    },
  };
  return {
    dependencies,
    close: async () => {
      transporter.close();
      await Promise.all([identity.disconnect(), tenant.disconnect()]);
    },
  };
}
