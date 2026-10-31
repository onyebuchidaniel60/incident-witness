import { describe, expect, it } from "vitest";

import { errorBody, errorResponseSchema } from "../src/errors.js";
import { jwtClaimsSchema } from "../src/auth/jwt.js";

const subject = "00000000-0000-4000-8000-000000000001";

describe("JWT claims schema", () => {
  it("accepts a valid subject and the authenticated audience", () => {
    const result = jwtClaimsSchema.safeParse({
      sub: subject,
      iss: "https://staging.example.invalid/auth/v1",
      aud: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
      role: "authenticated",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a missing or non-UUID subject", () => {
    expect(
      jwtClaimsSchema.safeParse({
        iss: "https://staging.example.invalid/auth/v1",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 300,
      }).success,
    ).toBe(false);

    expect(
      jwtClaimsSchema.safeParse({
        sub: "not-a-uuid",
        iss: "https://staging.example.invalid/auth/v1",
        aud: "authenticated",
        exp: Math.floor(Date.now() / 1000) + 300,
      }).success,
    ).toBe(false);
  });
});

describe("error response schema", () => {
  it("matches the documented error envelope", () => {
    const body = errorBody("AUTH_INVALID", "The authentication token is invalid.", subject);
    const parsed = errorResponseSchema.safeParse(body);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.error.request_id).toBe(subject);
      expect(parsed.data.error.details).toEqual({});
    }
  });
});
