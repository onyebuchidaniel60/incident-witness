import type { FastifyRequest } from "fastify";
import type { PoolClient } from "pg";

import { ApiError } from "../errors.js";

export function requireProviderId(request: FastifyRequest): string {
  const user = request.authUser;
  if (!user) {
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }
  return user.id;
}

export async function ensureProfile(client: PoolClient, userId: string): Promise<void> {
  await client.query(`insert into profiles (id) values ($1) on conflict (id) do nothing`, [
    userId,
  ]);
}
