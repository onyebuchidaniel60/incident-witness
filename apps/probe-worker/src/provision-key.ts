import { createPrivateKey, createPublicKey } from "node:crypto";

import { loadEnvironment, requireEnvironment } from "@incident-witness/db";
import { createSourceKeyCertificate, publicKeyFingerprint } from "@incident-witness/protocol/node";
import { Pool } from "pg";

loadEnvironment();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseKey(encoded: string, name: string) {
  try {
    const key = createPrivateKey({
      key: Buffer.from(encoded, "base64"),
      format: "der",
      type: "pkcs8",
    });
    if (key.asymmetricKeyType !== "ed25519") throw new Error("not Ed25519");
    return key;
  } catch {
    throw new Error(`${name} must be a base64-encoded Ed25519 PKCS8 private key`);
  }
}

async function main(): Promise<void> {
  const keyId = requireEnvironment("IW_PLATFORM_PROBE_KEY_ID");
  if (!UUID_PATTERN.test(keyId)) {
    throw new Error("IW_PLATFORM_PROBE_KEY_ID must be a UUID matching the witness_keys id");
  }

  const probePrivateKey = parseKey(
    requireEnvironment("IW_PLATFORM_PROBE_PRIVATE_KEY"),
    "IW_PLATFORM_PROBE_PRIVATE_KEY",
  );
  const platformPrivateKey = parseKey(
    requireEnvironment("IW_PLATFORM_SIGNING_PRIVATE_KEY"),
    "IW_PLATFORM_SIGNING_PRIVATE_KEY",
  );

  const jwk = createPublicKey(probePrivateKey).export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) throw new Error("Probe key has no public component");

  const publicKey = jwk.x;
  const publicKeyBytes = Buffer.from(publicKey, "base64url");
  const fingerprint = publicKeyFingerprint(publicKey);
  const issuedAt = new Date().toISOString();

  const signed = createSourceKeyCertificate(
    {
      certificate_version: "1.0",
      source_key_id: keyId,
      source_type: "platform_probe",
      public_key: publicKey,
      fingerprint,
      issued_at: issuedAt,
      protocol_version: "1.0",
    },
    platformPrivateKey,
  );

  const pool = new Pool({
    connectionString: requireEnvironment("DATABASE_URL_MIGRATOR"),
    max: 1,
    application_name: "incident-witness-probe-key-provision",
  });

  try {
    await pool.query(
      `insert into witness_keys
         (id, owner_user_id, host_id, incident_id, source_type, public_key, fingerprint,
          status, certificate_json, certificate_signature)
       values ($1, null, null, null, 'platform_probe', $2, $3, 'active', $4::jsonb, $5)
       on conflict (id) do nothing`,
      [
        keyId,
        publicKeyBytes,
        fingerprint,
        JSON.stringify(signed.certificate),
        Buffer.from(signed.signature, "base64url"),
      ],
    );

    const result = await pool.query<{
      source_type: string;
      public_key: Buffer;
      fingerprint: string;
      status: string;
    }>(
      `select source_type, public_key, fingerprint, status
         from witness_keys
        where id = $1`,
      [keyId],
    );
    const row = result.rows[0];
    if (
      !row ||
      row.source_type !== "platform_probe" ||
      row.status !== "active" ||
      !row.public_key.equals(publicKeyBytes) ||
      row.fingerprint !== fingerprint
    ) {
      throw new Error("witness_keys already has a different platform probe key for this ID");
    }

    console.log(JSON.stringify({ keyId, publicKey, fingerprint }));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "probe key provisioning failed";
  console.error(message);
  process.exitCode = 1;
});
