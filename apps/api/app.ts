import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({
    logger: true,
    requestIdHeader: "x-request-id",
  });

  app.get("/api/v1/health", async () => {
    return {
      success: true,
      data: {
        status: "ok",
        service: "ethos-api",
        version: "0.1.0",
      },
    };
  });

  return app;
}
