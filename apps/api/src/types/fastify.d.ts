import type { VerifiedUser } from "../auth/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: VerifiedUser | null;
  }
}
