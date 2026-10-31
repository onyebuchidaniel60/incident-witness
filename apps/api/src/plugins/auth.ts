import type { FastifyReply, FastifyRequest } from "fastify";

import type { JwtVerifier } from "../auth/jwt.js";
import { sendError } from "../errors.js";

export function requireAuth(verifier: JwtVerifier) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      sendError(reply, request.id, 401, "AUTH_REQUIRED", "Authentication is required.");
      return;
    }

    try {
      request.authUser = await verifier(authorization.slice("Bearer ".length));
    } catch {
      request.log.warn({ request_id: request.id }, "jwt_verification_failed");
      sendError(reply, request.id, 401, "AUTH_INVALID", "The authentication token is invalid.");
    }
  };
}
