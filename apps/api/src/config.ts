import { createPrivateKey, type KeyObject } from "node:crypto";

import { loadEnvironment } from "@incident-witness/db";
import { z } from "zod";

loadEnvironment();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  APP_BASE_URL: z.string().url(),
  IW_API_BASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWKS_URL: z.string().url(),
  SUPABASE_JWT_ISSUER: z.string().min(1),
  DATABASE_URL_IW_API: z.string().min(1),
  IW_TOKEN_PEPPER: z.string().min(16),
  IW_PLATFORM_SIGNING_PRIVATE_KEY: z.string().min(1),
  IW_PLATFORM_KEY_ID: z.string().min(1).max(80),
  IW_ALLOWED_WEB_ORIGINS: z.string().min(1),
  IW_HEALTHCHECK_TOKEN: z.string().min(16),
  IW_LOG_LEVEL: z.string().default("info"),
  IW_ENABLE_DEMO_SESSIONS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid API configuration; check: ${fields}`);
}

function parsePlatformSigningKey(encoded: string): KeyObject {
  let key: KeyObject;

  try {
    key = createPrivateKey({
      key: Buffer.from(encoded, "base64"),
      format: "der",
      type: "pkcs8",
    });
  } catch {
    throw new Error("Invalid API configuration; platform signing key is not valid PKCS8");
  }

  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("Invalid API configuration; platform signing key must be Ed25519");
  }

  return key;
}

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  appBaseUrl: string;
  apiBaseUrl: string;
  supabaseUrl: string;
  supabaseJwksUrl: string;
  supabaseJwtIssuer: string;
  databaseUrlIwApi: string;
  tokenPepper: string;
  platformSigningKey: KeyObject;
  platformKeyId: string;
  allowedWebOrigins: Set<string>;
  healthcheckToken: string;
  logLevel: string;
  enableDemoSessions: boolean;
};

const port = parsed.data.PORT;

export const config: AppConfig = {
  nodeEnv: parsed.data.NODE_ENV,
  port,
  appBaseUrl: parsed.data.APP_BASE_URL,
  apiBaseUrl: parsed.data.IW_API_BASE_URL ?? `http://localhost:${port}`,
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseJwksUrl: parsed.data.SUPABASE_JWKS_URL,
  supabaseJwtIssuer: parsed.data.SUPABASE_JWT_ISSUER,
  databaseUrlIwApi: parsed.data.DATABASE_URL_IW_API,
  tokenPepper: parsed.data.IW_TOKEN_PEPPER,
  platformSigningKey: parsePlatformSigningKey(parsed.data.IW_PLATFORM_SIGNING_PRIVATE_KEY),
  platformKeyId: parsed.data.IW_PLATFORM_KEY_ID,
  allowedWebOrigins: new Set(
    parsed.data.IW_ALLOWED_WEB_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
  healthcheckToken: parsed.data.IW_HEALTHCHECK_TOKEN,
  logLevel: parsed.data.IW_LOG_LEVEL,
  enableDemoSessions: parsed.data.IW_ENABLE_DEMO_SESSIONS,
};
