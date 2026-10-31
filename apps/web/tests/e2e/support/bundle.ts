import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createPrivateKey, generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";

import {
  canonicalJsonBytes,
  type Bundle,
  type BundleManifest,
  type EventBody,
} from "@incident-witness/protocol";
import {
  createBundleManifest,
  createSourceKeyCertificate,
  publicKeyFingerprint,
  sha256Base64Url,
  signEvent,
} from "@incident-witness/protocol/node";
import { config as loadEnv } from "dotenv";

for (const candidate of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate, override: false, quiet: true });
    break;
  }
}

function publicKeyBase64Url(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("bundle fixture key has no public component");
  return jwk.x;
}

export function makeBundleFixture(options: { tampered?: boolean } = {}): Buffer {
  const platformPrivateKey = process.env.IW_PLATFORM_SIGNING_PRIVATE_KEY;
  const platformKeyId = process.env.IW_PLATFORM_KEY_ID;
  if (!platformPrivateKey || !platformKeyId) {
    throw new Error("Platform signing test configuration is missing");
  }

  const platformKey = createPrivateKey({
    key: Buffer.from(platformPrivateKey, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const source = generateKeyPairSync("ed25519");
  const sourcePublicKey = publicKeyBase64Url(source.publicKey);
  const incidentId = randomUUID();
  const sourceKeyId = randomUUID();

  const certificate = createSourceKeyCertificate(
    {
      certificate_version: "1.0",
      source_key_id: sourceKeyId,
      source_type: "host_agent",
      public_key: sourcePublicKey,
      fingerprint: publicKeyFingerprint(sourcePublicKey),
      host_id: randomUUID(),
      issued_at: new Date(Date.now() - 120_000).toISOString(),
      protocol_version: "1.0",
    },
    platformKey,
  );

  const body: EventBody = {
    protocol_version: "1.0",
    event_id: randomUUID(),
    incident_id: incidentId,
    source_key_id: sourceKeyId,
    source_type: "host_agent",
    event_type: "host_heartbeat",
    sequence: 1,
    observed_at: new Date(Date.now() - 30_000).toISOString(),
    payload: {
      agent_version: "0.1.0-e2e",
      os_family: "linux",
      os_version: "test-fixture",
      uptime_seconds: 120,
      agent_health: "ok",
    },
    simulation_mode: false,
    canonicalization: "RFC8785-JCS",
    signature_algorithm: "Ed25519",
  };
  const event = signEvent(body, source.privateKey);
  const { signature, ...signedBody } = event;
  void signature;

  const manifest: BundleManifest = {
    incident_id: incidentId,
    host_alias: options.tampered ? "Tampered fixture host" : "Valid fixture host",
    endpoint_hostname: "demo.incident-witness.dev",
    capture_started_at: new Date(Date.now() - 60_000).toISOString(),
    capture_ends_at: new Date(Date.now() - 10_000).toISOString(),
    sealed_at: new Date(Date.now() - 5_000).toISOString(),
    protocol_version: "1.0",
    schema_version: "1.0",
    rule_version: "iw-rules-v1",
    events: [
      {
        event,
        received_at: new Date(Date.now() - 20_000).toISOString(),
        event_sha256: sha256Base64Url(canonicalJsonBytes(signedBody)),
      },
    ],
    source_certificates: [certificate],
    gaps: [],
    assessment: {
      code: "UNKNOWN",
      explanation: "Available evidence is insufficient to classify this interruption.",
      evidence_grade: "INSUFFICIENT",
    },
    simulation_present: false,
    platform_key_id: platformKeyId,
    limitations:
      "Verification confirms integrity and signatures relative to trusted keys. It does not prove sensor truth or cause.",
  };

  const bundle: Bundle = createBundleManifest(manifest, platformKey);
  if (options.tampered) {
    bundle.manifest.host_alias = "Modified one-byte host alias";
  }
  return Buffer.from(JSON.stringify(bundle, null, 2));
}
