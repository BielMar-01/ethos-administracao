import type { FastifyRequest } from "fastify";
import type { AuthDependencies } from "./types.js";
import type { AuthorizationService } from "./rbac.js";
import { AuthError, digest, safeEqual } from "./security.js";

export const authCookieNames = (production: boolean) => ({
  access: production ? "__Host-ethos_access" : "ethos_access",
  refresh: production ? "__Host-ethos_refresh" : "ethos_refresh",
  csrf: production ? "__Host-ethos_csrf" : "ethos_csrf",
});
export function requestGuards(
  deps: AuthDependencies,
  service: AuthorizationService,
) {
  const names = authCookieNames(deps.production);
  const csrfValue = (request: FastifyRequest) => {
    const signed = request.cookies[names.csrf];
    if (!signed) return null;
    const parsed = request.unsignCookie(signed);
    return parsed.valid && parsed.value ? parsed.value : null;
  };
  const requireCsrf = async (request: FastifyRequest) => {
    const header = request.headers["x-csrf-token"],
      value = csrfValue(request);
    if (
      request.headers.origin !== deps.origin ||
      typeof header !== "string" ||
      !value ||
      !safeEqual(header, value)
    )
      throw new AuthError(403, "CSRF_REJECTED");
  };
  const session = async (request: FastifyRequest, limited = false) => {
    const result = await service.authenticate(
      request.cookies[names.access],
      limited,
    );
    if (!["GET", "HEAD"].includes(request.method)) {
      const csrf = csrfValue(request);
      if (!csrf || result.csrfHash !== digest(csrf))
        throw new AuthError(403, "CSRF_REJECTED");
    }
    return result;
  };
  return { csrfValue, requireCsrf, session };
}
