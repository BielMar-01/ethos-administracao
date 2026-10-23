import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { definition, listQuery, resourceNames, uuid } from "@ethos/contracts";
import type { AuthDependencies } from "../auth/types.js";
import type { AuthService } from "../auth/mfa.js";
import { requestGuards } from "../auth/guards.js";
import { BusinessService, wire } from "./service.js";
import { AuthError } from "../auth/security.js";

export async function registerBusiness(
  app: FastifyInstance,
  deps: AuthDependencies,
  auth: AuthService,
) {
  const service = new BusinessService(deps),
    guards = requestGuards(deps, auth);
  const businessRoots = new Set<string>([
    ...resourceNames,
    "dashboard",
    "finance",
    "reports",
    "calendar",
    "notifications",
    "settings",
  ]);
  app.addHook("onRequest", async (request, reply) => {
    if (!businessRoots.has(request.url.split("?")[0]!.split("/")[3] ?? ""))
      return;
    const session = await guards.session(request);
    const expected = request.headers["x-ethos-context"];
    // This header detects stale tabs only. It never supplies the tenant to a query.
    if (expected !== undefined && expected !== session.organizationId)
      throw new AuthError(409, "ORGANIZATION_CHANGED");
    reply
      .header("Cache-Control", "no-store")
      .header("x-ethos-organization", session.organizationId ?? "");
  });
  for (const resource of resourceNames) {
    const base = `/api/v1/${resource}`;
    app.get(base, async (request) => ({
      success: true,
      ...(wire(
        await service.list(
          await guards.session(request),
          resource,
          listQuery.parse(request.query),
        ),
      ) as object),
    }));
    app.get(`${base}/:id`, async (request) => ({
      success: true,
      data: wire(
        await service.detail(
          await guards.session(request),
          resource,
          uuid.parse((request.params as { id: string }).id),
        ),
      ),
    }));
    app.post(
      base,
      { onRequest: guards.requireCsrf, bodyLimit: 65536 },
      async (request, reply) =>
        reply.status(201).send({
          success: true,
          data: wire(
            await service.create(
              await guards.session(request),
              resource,
              request.body,
            ),
          ),
        }),
    );
    app.patch(
      `${base}/:id`,
      { onRequest: guards.requireCsrf, bodyLimit: 65536 },
      async (request) => ({
        success: true,
        data: wire(
          await service.update(
            await guards.session(request),
            resource,
            uuid.parse((request.params as { id: string }).id),
            request.body,
          ),
        ),
      }),
    );
    for (const action of [
      ...(definition(resource).actions ?? []),
      ...(definition(resource).archive ? ["archive"] : []),
    ])
      app.post(
        `${base}/:id/${action}`,
        { onRequest: guards.requireCsrf },
        async (request) => ({
          success: true,
          data: wire(
            await service.action(
              await guards.session(request),
              resource,
              uuid.parse((request.params as { id: string }).id),
              action,
              request.body ?? {},
            ),
          ),
        }),
      );
  }
  const query = z.strictObject({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  });
  app.get("/api/v1/dashboard", async (request) => ({
    success: true,
    data: wire(
      await service.summary(
        await guards.session(request),
        "dashboard",
        query.parse(request.query),
      ),
    ),
  }));
  app.get("/api/v1/finance/summary", async (request) => ({
    success: true,
    data: wire(
      await service.summary(
        await guards.session(request),
        "finance",
        query.parse(request.query),
      ),
    ),
  }));
  app.get("/api/v1/reports/:type", async (request) => {
    const type = z
      .enum(["portfolio", "finance", "occupancy"])
      .parse((request.params as { type: string }).type);
    return {
      success: true,
      data: wire(
        await service.summary(
          await guards.session(request),
          "reports",
          query.parse(request.query),
          type,
        ),
      ),
    };
  });
  app.get("/api/v1/calendar", async (request) => ({
    success: true,
    data: wire(
      await service.calendar(
        await guards.session(request),
        z
          .strictObject({ from: z.iso.date(), to: z.iso.date() })
          .parse(request.query),
      ),
    ),
  }));
  app.get("/api/v1/notifications", async (request) => ({
    success: true,
    ...(wire(
      await service.notifications(
        await guards.session(request),
        listQuery.parse(request.query),
      ),
    ) as object),
  }));
  app.post(
    "/api/v1/notifications/:id/read",
    { onRequest: guards.requireCsrf },
    async (request) => ({
      success: true,
      data: wire(
        await service.readNotification(
          await guards.session(request),
          uuid.parse((request.params as { id: string }).id),
        ),
      ),
    }),
  );
  app.get("/api/v1/settings", async (request) => ({
    success: true,
    data: wire(await service.settings(await guards.session(request))),
  }));
  app.patch(
    "/api/v1/settings",
    { onRequest: guards.requireCsrf },
    async (request) => ({
      success: true,
      data: wire(
        await service.settings(await guards.session(request), request.body),
      ),
    }),
  );
}
