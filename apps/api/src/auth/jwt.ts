import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";
import { z } from "zod";

export const jwtClaimsSchema = z
  .object({
    sub: z.string().uuid(),
    iss: z.string().min(1),
    aud: z.union([z.string(), z.array(z.string())]),
    exp: z.number().int(),
    nbf: z.number().int().optional(),
    iat: z.number().int().optional(),
    role: z.string().optional(),
  })
  .passthrough();

export type VerifiedUser = {
  id: string;
  claims: z.infer<typeof jwtClaimsSchema>;
};

export type JwtVerifier = (token: string) => Promise<VerifiedUser>;

type KeyResolver = JWTVerifyGetKey;

function claimsFromPayload(payload: JWTPayload): VerifiedUser {
  const parsed = jwtClaimsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("JWT claims do not match the supported subject and issuer model");
  }

  return { id: parsed.data.sub, claims: parsed.data };
}

export function createJwtVerifier(
  keyResolver: KeyResolver,
  issuer: string,
  audience = "authenticated",
): JwtVerifier {
  return async (token) => {
    const { payload } = await jwtVerify(token, keyResolver, {
      issuer,
      audience,
      algorithms: ["ES256", "RS256"],
      clockTolerance: 5,
    });

    return claimsFromPayload(payload);
  };
}

export function createRemoteJwtVerifier(
  jwksUrl: string,
  issuer: string,
  audience = "authenticated",
): JwtVerifier {
  return createJwtVerifier(createRemoteJWKSet(new URL(jwksUrl)), issuer, audience);
}
