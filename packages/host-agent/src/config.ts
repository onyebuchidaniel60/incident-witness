import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { z } from "zod";

export const CONFIG_FILE_NAME = "config.json";
export const PRIVATE_KEY_FILE_NAME = "device-key.pem";
export const CREDENTIAL_FILE_NAME = "device-credential";
export const SPOOL_FILE_NAME = "spool.sqlite";

export const UPS_DEVICE_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;

const timestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/, "Expected RFC3339 UTC timestamp");

export const agentConfigSchema = z
  .object({
    config_version: z.literal(1),
    api_base_url: z.string().url(),
    host_id: z.string().uuid(),
    source_key_id: z.string().uuid(),
    enrolled_at: timestampSchema,
    ups_device: z.string().regex(UPS_DEVICE_PATTERN).optional(),
  })
  .strict();

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export function defaultConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && isAbsolute(xdg) ? xdg : join(homedir(), ".config");
  return join(base, "incident-witness");
}

export function configPaths(configDir: string) {
  return {
    configDir,
    configFile: join(configDir, CONFIG_FILE_NAME),
    privateKeyFile: join(configDir, PRIVATE_KEY_FILE_NAME),
    credentialFile: join(configDir, CREDENTIAL_FILE_NAME),
    spoolFile: join(configDir, SPOOL_FILE_NAME),
  };
}

export class ConfigSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigSecurityError";
  }
}

function assertOwnedByCurrentUser(uid: number, label: string): void {
  const currentUid = process.getuid?.();
  if (currentUid === undefined) return;
  if (uid !== currentUid) {
    throw new ConfigSecurityError(`${label} is not owned by the current user`);
  }
}

function ensurePrivateDirectory(configDir: string): void {
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const stats = lstatSync(configDir);

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new ConfigSecurityError("The agent configuration path is not a directory");
  }

  assertOwnedByCurrentUser(stats.uid, "The agent configuration directory");

  if ((stats.mode & 0o077) !== 0 || (stats.mode & 0o700) !== 0o700) {
    chmodSync(configDir, 0o700);
  }
}

function assertSafePrivateFile(path: string): void {
  const stats = lstatSync(path);

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new ConfigSecurityError("An agent secret path is not a regular file");
  }

  assertOwnedByCurrentUser(stats.uid, "An agent secret file");

  if ((stats.mode & 0o077) !== 0) {
    chmodSync(path, 0o600);
  }
}

function readPrivateTextFile(path: string): string {
  assertSafePrivateFile(path);
  return readFileSync(path, "utf8");
}

function writePrivateFileExclusive(path: string, contents: string): void {
  const descriptor = openSync(path, "wx", 0o600);

  try {
    writeSync(descriptor, contents, null, "utf8");
    fsyncSync(descriptor);
  } catch (error) {
    closeSync(descriptor);
    try {
      unlinkSync(path);
    } catch {
      // Best-effort cleanup of a partially written secret file.
    }
    throw error;
  }

  closeSync(descriptor);
  chmodSync(path, 0o600);
}

export function validateApiBaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new ConfigSecurityError("The API base URL is not a valid URL");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigSecurityError("The API base URL must not contain credentials, query or fragment");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigSecurityError("The API base URL must use HTTPS");
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol === "http:" && !localHosts.has(url.hostname)) {
    throw new ConfigSecurityError("Plain HTTP is only permitted for a local development API");
  }

  return url.toString().replace(/\/$/, "");
}

export function hasAgentConfig(configDir: string): boolean {
  try {
    lstatSync(configPaths(configDir).configFile);
    return true;
  } catch {
    return false;
  }
}

export function readAgentConfig(configDir: string): AgentConfig {
  ensurePrivateDirectory(configDir);
  const paths = configPaths(configDir);
  const raw = readPrivateTextFile(paths.configFile);
  const parsed = agentConfigSchema.safeParse(JSON.parse(raw) as unknown);

  if (!parsed.success) {
    throw new ConfigSecurityError("The agent configuration file is invalid");
  }

  const config = parsed.data;
  const normalizedApiUrl = validateApiBaseUrl(config.api_base_url);

  if (config.ups_device && !UPS_DEVICE_PATTERN.test(config.ups_device)) {
    throw new ConfigSecurityError("The configured UPS device alias is invalid");
  }

  return { ...config, api_base_url: normalizedApiUrl };
}

export function readDevicePrivateKeyPem(configDir: string): string {
  return readPrivateTextFile(configPaths(configDir).privateKeyFile);
}

export function readDeviceCredential(configDir: string): string {
  const credential = readPrivateTextFile(configPaths(configDir).credentialFile).trim();

  if (credential.length < 32 || credential.length > 512 || !/^[A-Za-z0-9_-]+$/.test(credential)) {
    throw new ConfigSecurityError("The stored device credential is invalid");
  }

  return credential;
}

export type EnrollmentFiles = {
  config: AgentConfig;
  privateKeyPem: string;
  deviceCredential: string;
};

export function writeEnrollmentFiles(configDir: string, files: EnrollmentFiles): void {
  ensurePrivateDirectory(configDir);
  const paths = configPaths(configDir);

  for (const path of [paths.configFile, paths.privateKeyFile, paths.credentialFile]) {
    try {
      lstatSync(path);
      throw new ConfigSecurityError(
        "Agent configuration already exists; refusing to overwrite local key material",
      );
    } catch (error) {
      if (error instanceof ConfigSecurityError) throw error;
    }
  }

  const created: string[] = [];

  try {
    writePrivateFileExclusive(paths.privateKeyFile, files.privateKeyPem);
    created.push(paths.privateKeyFile);

    writePrivateFileExclusive(paths.credentialFile, `${files.deviceCredential}\n`);
    created.push(paths.credentialFile);

    writePrivateFileExclusive(paths.configFile, `${JSON.stringify(files.config, null, 2)}\n`);
    created.push(paths.configFile);
  } catch (error) {
    for (const path of created) {
      try {
        unlinkSync(path);
      } catch {
        // Best-effort rollback; the original error is more useful.
      }
    }
    throw error;
  }
}

export function ensureAgentConfigDirectory(configDir: string): void {
  ensurePrivateDirectory(configDir);
}
