export type LoggerRedaction = {
  paths: string[];
  censor: string;
};

/**
 * Pino redaction paths for API logs. Keep root-level and nested forms because
 * application code may log structured fields directly or inside request data.
 */
export const loggerRedaction: LoggerRedaction = {
  paths: [
    "authorization",
    "cookie",
    "set-cookie",
    "token",
    "password",
    "secret",
    "credential",
    "databaseUrl",
    "connectionString",
    "privateKey",
    "accessToken",
    "refreshToken",
    "apiKey",
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
    "req.headers['set-cookie']",
    "*.authorization",
    "*.cookie",
    "*.set-cookie",
    "*.token",
    "*.password",
    "*.secret",
    "*.credential",
    "*.databaseUrl",
    "*.connectionString",
    "*.privateKey",
    "*.accessToken",
    "*.refreshToken",
    "*.apiKey",
  ],
  censor: "[REDACTED]",
};
