import type { FastifyReply } from "fastify";
import { z } from "zod";

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string().uuid(),
    details: z.record(z.string(), z.unknown()).default({}),
  }),
});

export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "PERMISSION_DENIED"
  | "RESOURCE_NOT_FOUND"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "DEPENDENCY_UNAVAILABLE"
  | "INTERNAL_ERROR";

export function errorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
  details: Record<string, unknown> = {},
) {
  return {
    error: {
      code,
      message,
      request_id: requestId,
      details,
    },
  };
}

export function sendError(
  reply: FastifyReply,
  requestId: string,
  statusCode: number,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  return reply.code(statusCode).send(errorBody(code, message, requestId, details));
}
