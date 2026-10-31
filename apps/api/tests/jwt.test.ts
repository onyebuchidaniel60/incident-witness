import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { createJwtVerifier } from "../src/auth/jwt.js";

const issuer = "https://staging.example.invalid/auth/v1";
const audience = "authenticated";
const subject = "00000000-0000-4000-8000-000000000001";

async function fixture() {
  const keyPair = await generateKeyPair("ES256", { extractable: true });
  const publicJwk = await exportJWK(keyPair.publicKey);
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  publicJwk.kid = "test-key";
  const verifier = createJwtVerifier(createLocalJWKSet({ keys: [publicJwk] }), issuer, audience);

  return { keyPair, verifier };
}

async function signToken(
  privateKey: CryptoKey,
  overrides: {
    issuer?: string;
    audience?: string;
    subject?: string | null;
    expiration?: number | string;
  } = {},
) {
  const token = new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? audience)
    .setIssuedAt()
    .setExpirationTime(overrides.expiration ?? "5m");

  if (overrides.subject !== null) {
    token.setSubject(overrides.subject ?? subject);
  }

  return token.sign(privateKey);
}

describe("Supabase JWT verification", () => {
  it("accepts a valid ES256 token and returns the verified subject", async () => {
    const { keyPair, verifier } = await fixture();
    const token = await signToken(keyPair.privateKey);

    await expect(verifier(token)).resolves.toMatchObject({ id: subject });
  });

  it("rejects a token signed by an unknown key", async () => {
    const { verifier } = await fixture();
    const attacker = await generateKeyPair("ES256", { extractable: true });
    const token = await signToken(attacker.privateKey);

    await expect(verifier(token)).rejects.toThrow();
  });

  it("rejects the wrong issuer", async () => {
    const { keyPair, verifier } = await fixture();
    const token = await signToken(keyPair.privateKey, { issuer: "https://wrong.invalid/auth/v1" });

    await expect(verifier(token)).rejects.toThrow();
  });

  it("rejects the wrong audience", async () => {
    const { keyPair, verifier } = await fixture();
    const token = await signToken(keyPair.privateKey, { audience: "other-audience" });

    await expect(verifier(token)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const { keyPair, verifier } = await fixture();
    const token = await signToken(keyPair.privateKey, {
      expiration: Math.floor(Date.now() / 1000) - 60,
    });

    await expect(verifier(token)).rejects.toThrow();
  });

  it("rejects a token without a subject UUID", async () => {
    const { keyPair, verifier } = await fixture();
    const token = await signToken(keyPair.privateKey, { subject: null });

    await expect(verifier(token)).rejects.toThrow();
  });

  it("rejects an algorithm outside the allow-list", async () => {
    const { verifier } = await fixture();
    const token = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode("not-the-configured-key"));

    await expect(verifier(token)).rejects.toThrow();
  });
});
