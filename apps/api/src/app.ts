import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ZodError } from "zod";
import type { FastifyError } from "fastify";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    requestIdHeader: "x-request-id",
    trustProxy: false,
  });

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
    max: 100,
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

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });

  // Tratamento global de erros
  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    request.log.error(error);

    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Dados inválidos.",
          details: error.issues,
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
          statusCode >= 500 ? "Erro interno do servidor." : error.message,
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

  return app;
}
