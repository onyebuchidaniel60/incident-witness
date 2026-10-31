export const AGENT_VERSION = "0.1.0";
export const PROTOCOL_VERSION = "1.0" as const;

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null | undefined>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY = /authorization|credential|password|private|secret|signature|token|key/i;

function redactFields(fields: LogFields | undefined): LogFields | undefined {
  if (!fields) return undefined;

  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : value;
  }
  return safe;
}

function formatLine(level: LogLevel, message: string, fields?: LogFields): string {
  const timestamp = new Date().toISOString();
  const redacted = redactFields(fields);
  const suffix = redacted && Object.keys(redacted).length > 0 ? ` ${JSON.stringify(redacted)}` : "";
  return `${timestamp} ${level.toUpperCase()} ${message}${suffix}`;
}

export function createLogger(options: { level?: LogLevel; sink?: (line: string) => void } = {}): Logger {
  const minimum = LEVEL_WEIGHT[options.level ?? "info"];
  const sink = options.sink ?? ((line: string) => console.log(line));

  function emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_WEIGHT[level] < minimum) return;
    sink(formatLine(level, message, fields));
  }

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
