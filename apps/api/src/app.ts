import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import type { FastifyError } from "fastify";
import { registerAuth } from "./auth/routes.js";
import type { AuthDependencies } from "./auth/types.js";
import { AuthError } from "./auth/security.js";
import { registerBusiness } from "./business/routes.js";
import { BusinessError } from "./business/service.js";
import { randomUUID } from "node:crypto";

export async function buildApp(
  options: {
    auth?: AuthDependencies;
    logger?: boolean;
    logStream?: { write: (message: string) => void };
  } = {},
) {
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            stream: options.logStream,
            redact: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers.set-cookie",
              "password",
              "token",
              "secret",
            ],
            serializers: {
              req: (req: { method: string; url: string }) => ({
                method: req.method,
                url: req.url.split("?")[0],
              }),
            },
          },
    requestIdHeader: false,
    genReqId: () => randomUUID(),
    bodyLimit: 65536,
    trustProxy: false,
  });
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({
      success: false,
      error: { code: "ROUTE_NOT_FOUND", message: "Recurso indisponível." },
    }),
  );

  // CORS: origens autorizadas
  const allowedOrigins = (
    process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
  });

  // Cabeçalhos de segurança
  await app.register(helmet);

  // Limite de requisições por IP
  await app.register(rateLimit, {
    max: 1000,
    timeWindow: "1 minute",
  });

  // Documentação OpenAPI
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Ethos Administração API",
        description: "API do SaaS de gestão de locações imobiliárias.",
        version: "0.1.0",
      },
      servers: [
        {
          url: "http://localhost:3333",
          description: "Ambiente local",
        },
      ],
      tags: [
        {
          name: "Health",
          description: "Monitoramento da API",
        },
      ],
    },
  });

  if (process.env.NODE_ENV !== "production")
    await app.register(swaggerUi, {
      routePrefix: "/docs",
      uiConfig: {
        docExpansion: "list",
        deepLinking: true,
      },
    });

  // Tratamento global de erros
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    request.log.error({
      event: "REQUEST_REJECTED",
      code: error instanceof AuthError ? error.code : "REQUEST_ERROR",
    });

    if (error instanceof BusinessError)
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message:
            error.statusCode === 503
              ? "Persistência temporariamente indisponível."
              : "Não foi possível concluir a operação neste estado ou contexto.",
        },
        requestId: request.id,
      });
    if (error instanceof AuthError)
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message:
            error.statusCode === 401
              ? "Não foi possível autenticar. Verifique os dados e tente novamente."
              : "Não foi possível concluir esta solicitação.",
        },
      });

    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos.",
          fields: Object.fromEntries(
            [
              ...new Set(
                error.issues.map((issue) => String(issue.path[0] ?? "form")),
              ),
            ].map((key) => [key, ["Confira o valor informado."]]),
          ),
        },
      });
    }

    const fastifyError = error as FastifyError;

    const statusCode =
      typeof fastifyError.statusCode === "number" &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 600
        ? fastifyError.statusCode
        : 500;

    return reply.status(statusCode).send({
      success: false,
      error: {
        code:
          statusCode === 429
            ? "RATE_LIMIT_EXCEEDED"
            : statusCode >= 500
              ? "INTERNAL_SERVER_ERROR"
              : (fastifyError.code ?? "REQUEST_ERROR"),
        message:
          statusCode >= 500
            ? "Erro interno do servidor."
            : "Não foi possível concluir esta solicitação.",
      },
    });
  });

  // Endpoint de saúde
  app.get(
    "/api/v1/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Verificar saúde da API",
        description: "Retorna o status operacional da API Ethos.",
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  status: { type: "string" },
                  service: { type: "string" },
                  version: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async () => ({
      success: true,
      data: {
        status: "ok",
        service: "ethos-api",
        version: "0.1.0",
      },
    }),
  );

  if (options.auth) {
    const auth = await registerAuth(app, options.auth);
    await registerBusiness(app, options.auth, auth);
    let maintenance: Promise<void> | undefined;
    let lastCleanup = 0;
    const timer = setInterval(() => {
      if (maintenance) return;
      maintenance = (async () => {
        try {
          await auth.drainMail();
          if (Date.now() - lastCleanup > 60_000) {
            await auth.cleanup();
            lastCleanup = Date.now();
          }
        } catch {
          app.log.error({ event: "AUTH_MAINTENANCE_FAILED" });
        }
      })().finally(() => {
        maintenance = undefined;
      });
    }, 5_000);
    timer.unref();
    app.addHook("preClose", async () => {
      clearInterval(timer);
      await maintenance;
    });
  } else {
    app.all("/api/v1/auth/*", async (_request, reply) =>
      reply.status(503).send({
        success: false,
        error: {
          code: "AUTH_UNAVAILABLE",
          message: "Acesso temporariamente indisponível.",
        },
      }),
    );
  }
  return app;
}
