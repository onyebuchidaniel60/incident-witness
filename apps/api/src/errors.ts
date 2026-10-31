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
  | "INTERNAL_ERROR"
  | "RESOURCE_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "HOST_NOT_READY"
  | "HOST_ALREADY_ENROLLED"
  | "HOST_HAS_ACTIVE_INCIDENT"
  | "ENDPOINT_CHALLENGE_EXPIRED"
  | "ENDPOINT_CHALLENGE_CONSUMED"
  | "ENDPOINT_CHALLENGE_ATTEMPTS_EXCEEDED"
  | "ENDPOINT_UNSAFE_TARGET"
  | "ENDPOINT_VERIFICATION_FAILED"
  | "ENROLLMENT_INVALID"
  | "ENROLLMENT_ALREADY_REDEEMED"
  | "INVITATION_INVALID"
  | "INVITATION_ALREADY_REDEEMED"
  | "INCIDENT_NOT_COLLECTING"
  | "INCIDENT_LIMIT_REACHED"
  | "RENTER_ALREADY_ENROLLED"
  | "KEY_SCOPE_MISMATCH"
  | "PRESENCE_REPLAY"
  | "PRESENCE_STALE";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

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
