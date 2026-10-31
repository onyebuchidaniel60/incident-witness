import { chmodSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  configPaths,
  ensureAgentConfigDirectory,
  hasAgentConfig,
  readAgentConfig,
  readDeviceCredential,
  UPS_DEVICE_PATTERN,
  validateApiBaseUrl,
  writeEnrollmentFiles,
  type AgentConfig,
} from "../src/config.js";
import { generateAgentKeyPair } from "../src/crypto.js";
import { makeTempDir, removeTempDir } from "./helpers.js";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_KEY_ID = "22222222-2222-4222-8222-222222222222";

function config(): AgentConfig {
  return {
    config_version: 1,
    api_base_url: "https://api.example.test",
    host_id: HOST_ID,
    source_key_id: SOURCE_KEY_ID,
    enrolled_at: "2026-10-31T12:00:00.000Z",
  };
}

describe("agent configuration", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      removeTempDir(directory);
    }
  });

  function newDirectory(): string {
    const directory = makeTempDir();
    directories.push(directory);
    return join(directory, "config");
  }

  it("writes configuration, private key and credential with owner-only permissions", () => {
    const directory = newDirectory();
    const keyPair = generateAgentKeyPair();
    const credential = "c".repeat(43);

    writeEnrollmentFiles(directory, {
      config: config(),
      privateKeyPem: keyPair.privateKeyPem,
      deviceCredential: credential,
    });

    expect(statSync(directory).mode & 0o777).toBe(0o700);
    for (const file of [
      configPaths(directory).configFile,
      configPaths(directory).privateKeyFile,
      configPaths(directory).credentialFile,
    ]) {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }

    expect(hasAgentConfig(directory)).toBe(true);
    expect(readAgentConfig(directory).host_id).toBe(HOST_ID);
    expect(readDeviceCredential(directory)).toBe(credential);
  });

  it("repairs group/other-readable permissions on load", () => {
    const directory = newDirectory();
    const keyPair = generateAgentKeyPair();
    writeEnrollmentFiles(directory, {
      config: config(),
      privateKeyPem: keyPair.privateKeyPem,
      deviceCredential: "d".repeat(43),
    });

    chmodSync(configPaths(directory).configFile, 0o644);
    readAgentConfig(directory);

    expect(statSync(configPaths(directory).configFile).mode & 0o777).toBe(0o600);
  });

  it("refuses to overwrite existing local key material", () => {
    const directory = newDirectory();
    const keyPair = generateAgentKeyPair();
    const files = {
      config: config(),
      privateKeyPem: keyPair.privateKeyPem,
      deviceCredential: "e".repeat(43),
    };

    writeEnrollmentFiles(directory, files);

    expect(() => writeEnrollmentFiles(directory, files)).toThrow(/already exists/i);
  });

  it("creates a private configuration directory when requested", () => {
    const directory = newDirectory();
    ensureAgentConfigDirectory(directory);

    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(hasAgentConfig(directory)).toBe(false);
  });
});

describe("API URL validation", () => {
  it("accepts HTTPS and local development HTTP only", () => {
    expect(validateApiBaseUrl("https://api.example.test/")).toBe("https://api.example.test");
    expect(validateApiBaseUrl("http://localhost:4000")).toBe("http://localhost:4000");
    expect(validateApiBaseUrl("http://127.0.0.1:4000")).toBe("http://127.0.0.1:4000");
  });

  it("rejects insecure, credential-bearing or malformed URLs", () => {
    for (const url of [
      "http://api.example.test",
      "ftp://api.example.test",
      "https://user:pass@api.example.test",
      "https://api.example.test/?token=1",
      "https://api.example.test/#fragment",
      "not a url",
    ]) {
      expect(() => validateApiBaseUrl(url)).toThrow();
    }
  });
});

describe("UPS device validation pattern", () => {
  it("accepts only plain device aliases", () => {
    expect(UPS_DEVICE_PATTERN.test("apc-1.local_ups")).toBe(true);
    expect(UPS_DEVICE_PATTERN.test("ups; rm -rf /")).toBe(false);
    expect(UPS_DEVICE_PATTERN.test("../ups")).toBe(false);
    expect(UPS_DEVICE_PATTERN.test("ups name")).toBe(false);
  });
});
