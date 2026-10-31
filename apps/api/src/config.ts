import { loadEnvironment } from "@incident-witness/db";
import { z } from "zod";

loadEnvironment();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  APP_BASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_JWKS_URL: z.string().url(),
  SUPABASE_JWT_ISSUER: z.string().min(1),
  DATABASE_URL_IW_API: z.string().min(1),
  IW_ALLOWED_WEB_ORIGINS: z.string().min(1),
  IW_HEALTHCHECK_TOKEN: z.string().min(16),
  IW_LOG_LEVEL: z.string().default("info"),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Invalid API configuration; check: ${fields}`);
}

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  appBaseUrl: string;
  supabaseUrl: string;
  supabaseJwksUrl: string;
  supabaseJwtIssuer: string;
  databaseUrlIwApi: string;
  allowedWebOrigins: Set<string>;
  healthcheckToken: string;
  logLevel: string;
};

export const config: AppConfig = {
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  appBaseUrl: parsed.data.APP_BASE_URL,
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseJwksUrl: parsed.data.SUPABASE_JWKS_URL,
  supabaseJwtIssuer: parsed.data.SUPABASE_JWT_ISSUER,
  databaseUrlIwApi: parsed.data.DATABASE_URL_IW_API,
  allowedWebOrigins: new Set(
    parsed.data.IW_ALLOWED_WEB_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
  healthcheckToken: parsed.data.IW_HEALTHCHECK_TOKEN,
  logLevel: parsed.data.IW_LOG_LEVEL,
};
