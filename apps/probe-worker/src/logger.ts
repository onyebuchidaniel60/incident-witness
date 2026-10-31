export type LogFields = Record<string, string | number | boolean | null | undefined>;

export type Logger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

const SENSITIVE = /address|credential|hostname|ip|key|private|secret|token/i;

function clean(fields: LogFields | undefined): LogFields | undefined {
  if (!fields) return undefined;
  const output: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    output[key] = SENSITIVE.test(key) ? "[redacted]" : value;
  }
  return output;
}

export function createLogger(level: string = "info"): Logger {
  const weights: Record<string, number> = { debug: 10, info: 20, warn: 30, error: 40 };
  const minimum = weights[level] ?? 20;

  const emit = (kind: "debug" | "info" | "warn" | "error", message: string, fields?: LogFields) => {
    if ((weights[kind] ?? 0) < minimum) return;
    const suffix = fields ? ` ${JSON.stringify(clean(fields))}` : "";
    const line = `${new Date().toISOString()} ${kind.toUpperCase()} ${message}${suffix}`;
    if (kind === "error" || kind === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}
