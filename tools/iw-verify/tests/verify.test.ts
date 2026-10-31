import { spawn } from "node:child_process";
import { generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalJsonBytes,
  type Bundle,
  type BundleManifest,
  type EventBody,
  type EventEnvelope,
} from "@incident-witness/protocol";
import {
  createBundleManifest,
  createSourceKeyCertificate,
  publicKeyFingerprint,
  sha256Base64Url,
  signEvent,
} from "@incident-witness/protocol/node";
import { verifyBundleManifest as verifyManifestInBrowser } from "@incident-witness/protocol/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { TrustSet, TrustedPlatformKey } from "../src/trust.js";
import { verifyBundle } from "../src/verify.js";

const cliPath = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

function publicKeyBase64Url(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("test key has no raw public key");
  return jwk.x;
}

function trustedKey(keyId: string, publicKey: KeyObject): TrustedPlatformKey {
  const encoded = publicKeyBase64Url(publicKey);
  return {
    platformKeyId: keyId,
    publicKey: encoded,
    fingerprint: publicKeyFingerprint(encoded),
    status: "active",
  };
}

function trustSet(keys: TrustedPlatformKey[], path = "test-trust.json"): TrustSet {
  return {
    version: 1,
    keys: new Map(keys.map((key) => [key.platformKeyId, key])),
    path,
  };
}

type Fixture = {
  bundle: Bundle;
  trust: TrustSet;
  bundlePath: string;
  trustPath: string;
  sourceKeyId: string;
};

type FixtureOptions = {
  reverseEvents?: boolean;
  protocolVersion?: string;
  bundleVersion?: string;
};

function makeEvent(input: {
  incidentId: string;
  sourceKeyId: string;
  privateKey: KeyObject;
  sequence: number;
  observedAt: string;
}): { envelope: EventEnvelope; digest: string } {
  const body: EventBody = {
    protocol_version: "1.0",
    event_id: randomUUID(),
    incident_id: input.incidentId,
    source_key_id: input.sourceKeyId,
    source_type: "host_agent",
    event_type: "host_heartbeat",
    sequence: input.sequence,
    observed_at: input.observedAt,
    payload: {
      agent_version: "0.1.0-test",
      os_family: "linux",
      os_version: "test",
      uptime_seconds: 120,
      agent_health: "ok",
    },
    simulation_mode: false,
    canonicalization: "RFC8785-JCS",
    signature_algorithm: "Ed25519",
  };
  const envelope = signEvent(body, input.privateKey);
  const { signature, ...signedBody } = envelope;
  void signature;
  return {
    envelope,
    digest: sha256Base64Url(canonicalJsonBytes(signedBody)),
  };
}

async function writeFixture(
  directory: string,
  options: FixtureOptions = {},
): Promise<Fixture> {
  const platform = generateKeyPairSync("ed25519");
  const source = generateKeyPairSync("ed25519");
  const platformKeyId = "test-platform-key";
  const incidentId = randomUUID();
  const sourceKeyId = randomUUID();
  const key = trustedKey(platformKeyId, platform.publicKey);

  const certificate = createSourceKeyCertificate(
    {
      certificate_version: "1.0",
      source_key_id: sourceKeyId,
      source_type: "host_agent",
      public_key: publicKeyBase64Url(source.publicKey),
      fingerprint: publicKeyFingerprint(publicKeyBase64Url(source.publicKey)),
      host_id: randomUUID(),
      issued_at: new Date(Date.now() - 60_000).toISOString(),
      protocol_version: "1.0",
    },
    platform.privateKey,
  );

  const first = makeEvent({
    incidentId,
    sourceKeyId,
    privateKey: source.privateKey,
    sequence: 1,
    observedAt: new Date(Date.now() - 30_000).toISOString(),
  });
  const second = makeEvent({
    incidentId,
    sourceKeyId,
    privateKey: source.privateKey,
    sequence: 2,
    observedAt: new Date(Date.now() - 20_000).toISOString(),
  });

  const events = [
    { event: first.envelope, received_at: new Date(Date.now() - 25_000).toISOString(), event_sha256: first.digest },
    { event: second.envelope, received_at: new Date(Date.now() - 15_000).toISOString(), event_sha256: second.digest },
  ];
  if (options.reverseEvents) events.reverse();

  const manifest: BundleManifest = {
    incident_id: incidentId,
    host_alias: "Synthetic test host",
    endpoint_hostname: "demo.incident-witness.dev",
    capture_started_at: new Date(Date.now() - 60_000).toISOString(),
    capture_ends_at: new Date(Date.now() - 10_000).toISOString(),
    sealed_at: new Date(Date.now() - 5_000).toISOString(),
    protocol_version: "1.0",
    schema_version: "1.0",
    rule_version: "iw-rules-v1",
    events,
    source_certificates: [certificate],
    gaps: [],
    assessment: {
      code: "UNKNOWN",
      explanation: "Available evidence is insufficient to classify this interruption.",
      evidence_grade: "INSUFFICIENT",
    },
    simulation_present: false,
    platform_key_id: platformKeyId,
    limitations: "Test fixture only.",
  };

  const bundle = createBundleManifest(manifest, platform.privateKey);
  const serialized = structuredClone(bundle) as Bundle;
  if (options.protocolVersion) {
    (serialized.manifest as unknown as Record<string, unknown>).protocol_version =
      options.protocolVersion;
  }
  if (options.bundleVersion) {
    (serialized as unknown as Record<string, unknown>).bundle_version = options.bundleVersion;
  }

  const bundlePath = join(directory, "bundle.json");
  const trustPath = join(directory, "trust.json");
  await writeFile(bundlePath, JSON.stringify(serialized, null, 2), "utf8");
  await writeFile(
    trustPath,
    JSON.stringify(
      {
        trust_set_version: 1,
        keys: [
          {
            platform_key_id: key.platformKeyId,
            public_key: key.publicKey,
            fingerprint: key.fingerprint,
            status: key.status,
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    bundle: serialized,
    trust: trustSet([key], trustPath),
    bundlePath,
    trustPath,
    sourceKeyId,
  };
}

function runCli(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("iw-verify", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "iw-verify-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("accepts a valid signed bundle", async () => {
    const fixture = await writeFixture(directory);
    const result = await runCli(["--trust", fixture.trustPath, fixture.bundlePath]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Result: VALID");
    expect(result.stdout).toContain("[PASS] Manifest SHA-256 digest");
    expect(result.stdout).toContain("[PASS] Source event signatures (2)");
    expect(result.stdout).not.toContain("[FAIL]");
  });

  it("detects a modified manifest", async () => {
    const fixture = await writeFixture(directory);
    const tampered = structuredClone(fixture.bundle) as Bundle;
    tampered.manifest.host_alias = "Modified host alias";
    const tamperedPath = join(directory, "tampered-manifest.json");
    await writeFile(tamperedPath, JSON.stringify(tampered, null, 2), "utf8");

    const result = await runCli(["--trust", fixture.trustPath, tamperedPath]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[FAIL] Manifest SHA-256 digest");
    expect(result.stdout).toContain("[FAIL] Platform Ed25519 manifest signature");
    expect(result.stdout).toContain("Result: INVALID");
  });

  it("detects a modified event signature", async () => {
    const fixture = await writeFixture(directory);
    const tampered = structuredClone(fixture.bundle) as Bundle;
    const signature = tampered.manifest.events[0]!.event.signature;
    const replacement = signature.startsWith("A") ? "B" : "A";
    tampered.manifest.events[0]!.event.signature = replacement + signature.slice(1);
    const tamperedPath = join(directory, "tampered-signature.json");
    await writeFile(tamperedPath, JSON.stringify(tampered, null, 2), "utf8");

    const result = await runCli(["--trust", fixture.trustPath, tamperedPath]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[FAIL] Source event signatures");
    expect(result.stdout).toContain("[PASS] Event SHA-256 digests");
  });

  it("rejects an unknown platform key", async () => {
    const fixture = await writeFixture(directory);
    const other = generateKeyPairSync("ed25519");
    const otherKey = trustedKey("unpinned-platform-key", other.publicKey);
    const otherTrust = trustSet([otherKey], join(directory, "other-trust.json"));
    await writeFile(
      otherTrust.path,
      JSON.stringify(
        {
          trust_set_version: 1,
          keys: [
            {
              platform_key_id: otherKey.platformKeyId,
              public_key: otherKey.publicKey,
              fingerprint: otherKey.fingerprint,
              status: "active",
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await runCli(["--trust", otherTrust.path, fixture.bundlePath]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[FAIL] Platform key is pinned and trusted");
  });

  it("rejects an unsupported bundle version", async () => {
    const fixture = await writeFixture(directory, { bundleVersion: "2.0" });
    const result = await runCli(["--trust", fixture.trustPath, fixture.bundlePath]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[FAIL] Bundle version is supported");
    expect(result.stdout).toContain("[FAIL] Bundle JSON schema");
  });

  it("rejects an unsupported protocol version", async () => {
    const fixture = await writeFixture(directory, { protocolVersion: "2.0" });
    const result = await runCli(["--trust", fixture.trustPath, fixture.bundlePath]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[FAIL] Protocol and schema versions are supported");
  });

  it("detects events that are not in deterministic order", async () => {
    const fixture = await writeFixture(directory, { reverseEvents: true });
    const result = await runCli(["--trust", fixture.trustPath, fixture.bundlePath]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("[FAIL] Event sequence uniqueness and deterministic ordering");
  });

  it("returns exit code 2 for a missing bundle", async () => {
    const fixture = await writeFixture(directory);
    const result = await runCli(["--trust", fixture.trustPath, join(directory, "missing.json")]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("cannot read bundle file");
  });

  it("returns exit code 2 for unparseable JSON", async () => {
    const fixture = await writeFixture(directory);
    const malformedPath = join(directory, "malformed.json");
    await writeFile(malformedPath, "{not json", "utf8");
    const result = await runCli(["--trust", fixture.trustPath, malformedPath]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("not valid JSON");
  });

  it("agrees with the browser manifest verifier on valid and tampered fixtures", async () => {
    const fixture = await writeFixture(directory);
    const trusted = [...fixture.trust.keys.values()][0]!;

    const browserValid = await verifyManifestInBrowser(
      fixture.bundle,
      trusted.publicKey,
      trusted.platformKeyId,
    );
    expect(browserValid.valid).toBe(true);
    expect(verifyBundle(fixture.bundle, fixture.trust).valid).toBe(true);

    const tampered = structuredClone(fixture.bundle) as Bundle;
    tampered.manifest.host_alias = "Browser parity tamper";
    const browserInvalid = await verifyManifestInBrowser(
      tampered,
      trusted.publicKey,
      trusted.platformKeyId,
    );
    expect(browserInvalid.valid).toBe(false);
    expect(verifyBundle(tampered, fixture.trust).valid).toBe(false);
  });

  it("returns a structured invalid report without throwing", async () => {
    const fixture = await writeFixture(directory);
    const tampered = structuredClone(fixture.bundle) as Bundle;
    tampered.manifest.events[0]!.event.payload = {
      agent_version: "0.1.0-test",
      os_family: "linux",
      os_version: "linux",
      uptime_seconds: 121,
      agent_health: "ok",
    };
    const report = verifyBundle(tampered, fixture.trust);
    expect(report.valid).toBe(false);
    expect(report.checks.some((check) => check.status === "fail")).toBe(true);
    expect(report.limitations).toContain("does not prove");
  });
});
