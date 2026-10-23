import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import cookie from "@fastify/cookie";
import { z } from "zod";
import type { AuthDependencies } from "./types.js";
import { AuthService } from "./mfa.js";
import { requestGuards, authCookieNames } from "./guards.js";
import {
  AuthError,
  emailSchema,
  passwordSchema,
  tokenSchema,
  randomToken,
} from "./security.js";

export async function registerAuth(
  app: FastifyInstance,
  deps: AuthDependencies,
) {
  if (deps.cookieSecret.length < 32 || deps.encryptionKey.length !== 32)
    throw Error("AUTH_SECRETS_INVALID");
  const service = new AuthService(deps),
    prefix = "/api/v1/auth";
  const names = authCookieNames(deps.production);
  const cookieOptions = {
    httpOnly: true,
    secure: deps.production,
    sameSite: "lax" as const,
    path: "/",
  };
  await app.register(cookie, { secret: deps.cookieSecret, hook: "onRequest" });
  app.addHook("onReady", async () => {
    for (const [client, expected] of [
      [deps.identity, "ethos_auth_runtime"],
      [deps.tenant, "ethos_tenant_runtime"],
    ] as const) {
      const [role] = await client.$queryRaw<
        { name: string; unsafe: boolean }[]
      >`
        SELECT current_user::text AS name, (current_user <> session_user OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication OR
          EXISTS(SELECT 1 FROM pg_roles powerful WHERE (powerful.rolsuper OR powerful.rolbypassrls OR powerful.rolcreaterole) AND pg_has_role(current_user,powerful.oid,'MEMBER')) OR
          EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('ethos','ethos_identity') AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) OR
          EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname IN ('ethos','ethos_identity','ethos_technical') AND n.nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) OR
          EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user))) AS unsafe
        FROM pg_roles WHERE rolname=current_user
      `;
      if (!role || role.unsafe || role.name !== expected)
        throw Error("UNSAFE_AUTH_DATABASE_ROLE");
    }
  });
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith(prefix))
      reply
        .header("Cache-Control", "no-store")
        .header("Pragma", "no-cache")
        .header("Referrer-Policy", "no-referrer");
    return payload;
  });
  const { csrfValue, requireCsrf, session } = requestGuards(deps, service);
  const setTokens = (
    reply: FastifyReply,
    tokens: { access: string; refresh: string },
  ) => {
    reply.setCookie(names.access, tokens.access, {
      ...cookieOptions,
      maxAge: 300,
    });
    reply.setCookie(names.refresh, tokens.refresh, {
      ...cookieOptions,
      maxAge: 7 * 86400,
    });
  };
  const clear = (reply: FastifyReply) => {
    for (const name of Object.values(names))
      reply.clearCookie(name, cookieOptions);
  };
  const post = (
    path: string,
    handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
    max = 10,
  ) => {
    app.post(
      prefix + path,
      {
        onRequest: requireCsrf,
        config: {
          rateLimit: {
            max: deps.rateLimitMax ?? max,
            timeWindow: "15 minutes",
          },
        },
      },
      handler,
    );
  };
  const accepted = {
    success: true,
    message:
      "Se os dados forem elegíveis, enviaremos as instruções por e-mail.",
  };
  app.get(prefix + "/csrf", async (request, reply) => {
    let value = csrfValue(request);
    if (!value) {
      value = randomToken();
      reply.setCookie(names.csrf, value, {
        ...cookieOptions,
        signed: true,
        maxAge: 30 * 86400,
      });
    }
    return { csrfToken: value };
  });
  post(
    "/register",
    async (request) => {
      const input = z
        .object({
          email: emailSchema,
          password: passwordSchema,
          displayName: z.string().trim().min(2).max(200),
        })
        .strict()
        .parse(request.body);
      await service.register(input.email, input.password, input.displayName);
      return accepted;
    },
    5,
  );
  post(
    "/forgot-password",
    async (request) => {
      const { email } = z
        .object({ email: emailSchema })
        .strict()
        .parse(request.body);
      await service.requestAction(email, "RESET_PASSWORD");
      return accepted;
    },
    5,
  );
  post(
    "/resend-verification",
    async (request) => {
      const { email } = z
        .object({ email: emailSchema })
        .strict()
        .parse(request.body);
      await service.requestAction(email, "VERIFY_EMAIL");
      return accepted;
    },
    5,
  );
  post("/verify-email", async (request) => {
    const { token } = z
      .object({ token: tokenSchema })
      .strict()
      .parse(request.body);
    await service.consume(token, "VERIFY_EMAIL");
    return { success: true };
  });
  post("/reset-password", async (request) => {
    const { token, password } = z
      .object({ token: tokenSchema, password: passwordSchema })
      .strict()
      .parse(request.body);
    await service.consume(token, "RESET_PASSWORD", password);
    return { success: true };
  });
  post("/login", async (request, reply) => {
    const { email, password } = z
      .object({ email: emailSchema, password: z.string().min(1).max(128) })
      .strict()
      .parse(request.body);
    const user = await service.checkPassword(email, password);
    const issued = await service.createSession(
      user.id,
      csrfValue(request)!,
      String(request.headers["user-agent"] ?? "Dispositivo")
        .replace(/[\r\n\x00-\x1f]/g, "")
        .slice(0, 120),
      user.credential!.passwordHash,
    );
    setTokens(reply, issued);
    return { success: true, assurance: issued.session.assurance };
  });
  post(
    "/refresh",
    async (request, reply) => {
      const refresh = request.cookies[names.refresh];
      if (!refresh || !tokenSchema.safeParse(refresh).success)
        throw new AuthError();
      try {
        const issued = await service.rotate(refresh, csrfValue(request)!);
        setTokens(reply, issued);
        return { success: true };
      } catch (error) {
        clear(reply);
        throw error;
      }
    },
    30,
  );
  post("/logout", async (request, reply) => {
    await service.revoke(await session(request, true));
    clear(reply);
    return { success: true };
  });
  post("/logout-all", async (request, reply) => {
    const current = await session(request);
    service.recent(current);
    await service.revoke(current, true);
    clear(reply);
    return { success: true };
  });
  post("/reauthenticate", async (request) => {
    const { password } = z
      .object({ password: z.string().min(1).max(128) })
      .strict()
      .parse(request.body);
    await service.reauthenticate(await session(request), password);
    return { success: true };
  });
  post(
    "/change-password",
    async (request, reply) => {
      const { currentPassword, password } = z
        .object({
          currentPassword: z.string().min(1).max(128),
          password: passwordSchema,
        })
        .strict()
        .parse(request.body);
      await service.changePassword(
        await session(request),
        currentPassword,
        password,
      );
      clear(reply);
      return { success: true };
    },
    5,
  );
  app.get(prefix + "/me", async (request) => {
    const current = await session(request, true);
    return {
      user: {
        id: current.userId,
        email: current.user.email,
        displayName: current.user.displayName,
      },
      organizationId: current.organizationId,
      assurance: current.assurance,
      mfaEnabled: current.user.credential!.mfaEnabled,
      superAdmin: await service.platform(current.userId),
      organizations: await service.organizations(current),
    };
  });
  app.get(prefix + "/sessions", async (request) => {
    const current = await session(request);
    const sessions = await deps.identity.authSession.findMany({
      where: {
        userId: current.userId,
        revokedAt: null,
        expiresAt: { gt: service.now() },
      },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        deviceLabel: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return { sessions, currentSessionId: current.id };
  });
  post("/sessions/revoke", async (request) => {
    const current = await session(request);
    service.recent(current);
    const { id } = z
      .object({ id: z.string().uuid() })
      .strict()
      .parse(request.body);
    await service.revoke(current, false, id);
    return { success: true };
  });
  post("/organization", async (request) => {
    const current = await session(request);
    const { organizationId } = z
      .object({ organizationId: z.string().uuid() })
      .strict()
      .parse(request.body);
    await service.selectOrganization(current, organizationId);
    return { success: true };
  });
  app.get(prefix + "/permissions", async (request) => ({
    permissions: await service.permissions(await session(request)),
  }));
  app.get(prefix + "/authorize", async (request) => {
    const { permission } = z
      .object({
        permission: z
          .string()
          .regex(/^[a-z]+\.(read|create|update|archive|manage|read_own)$/),
      })
      .strict()
      .parse(request.query);
    await service.authorize(await session(request), permission);
    return { allowed: true };
  });
  post(
    "/platform/access",
    async (request) => {
      const current = await session(request);
      service.recent(current);
      const { reason } = z
        .object({ reason: z.string().trim().min(10).max(500) })
        .strict()
        .parse(request.body);
      if (
        current.assurance !== "MFA" ||
        !(await service.platform(current.userId))
      )
        throw new AuthError(403, "ACCESS_DENIED");
      // Administrative authorization is explicit; it never grants an organization bypass.
      await deps.identity.authEvent.create({
        data: {
          category: "PLATFORM_ACCESS",
          success: true,
          userId: current.userId,
          sessionId: current.id,
          reason,
        },
      });
      return { authorized: true };
    },
    5,
  );
  post(
    "/mfa/setup",
    async (request) => service.setupMfa(await session(request, true)),
    5,
  );
  post("/mfa/enable", async (request) => {
    const { code } = z
      .object({ code: z.string().regex(/^\d{6}$/) })
      .strict()
      .parse(request.body);
    return service.verifyMfa(await session(request, true), code, true);
  });
  post("/mfa/verify", async (request) => {
    const { code } = z
      .object({ code: z.string().min(6).max(64) })
      .strict()
      .parse(request.body);
    return service.verifyMfa(await session(request, true), code);
  });
  return service;
}
