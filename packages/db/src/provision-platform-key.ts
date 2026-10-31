import { createHash, createPrivateKey, createPublicKey } from "node:crypto";

import { Pool } from "pg";

import { requireEnvironment } from "./env.js";

/**
 * Registers the public half of the configured Ed25519 platform signing key in
 * platform_signing_keys. The private key is read only from the environment and
 * is never written to the database or printed.
 */
async function main(): Promise<void> {
  const encoded = requireEnvironment("IW_PLATFORM_SIGNING_PRIVATE_KEY");
  const keyId = requireEnvironment("IW_PLATFORM_KEY_ID");

  const privateKey = createPrivateKey({
    key: Buffer.from(encoded, "base64"),
    format: "der",
    type: "pkcs8",
  });

  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("IW_PLATFORM_SIGNING_PRIVATE_KEY must be an Ed25519 PKCS8 key");
  }

  const jwk = createPublicKey(privateKey).export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) {
    throw new Error("Platform key does not contain a raw Ed25519 public key");
  }

  const publicKey = Buffer.from(jwk.x, "base64url");
  const fingerprint = createHash("sha256").update(publicKey).digest("base64url");

  const pool = new Pool({
    connectionString: requireEnvironment("DATABASE_URL_MIGRATOR"),
    max: 1,
    application_name: "incident-witness-platform-key-provision",
  });

  try {
    await pool.query(
      `insert into platform_signing_keys
         (key_id, public_key, fingerprint, algorithm, status, not_before)
       values ($1, $2, $3, 'Ed25519', 'active', now())
       on conflict (key_id) do nothing`,
      [keyId, publicKey, fingerprint],
    );

    const existing = await pool.query<{ fingerprint: string; public_key: Buffer }>(
      `select fingerprint, public_key from platform_signing_keys where key_id = $1`,
      [keyId],
    );
    const row = existing.rows[0];

    if (!row || row.fingerprint !== fingerprint || !row.public_key.equals(publicKey)) {
      throw new Error(
        "platform_signing_keys already has a different public key for IW_PLATFORM_KEY_ID",
      );
    }

    console.log(JSON.stringify({ keyId, publicKey: jwk.x, fingerprint }));
  } finally {
    await pool.end();
  }
}

await main();
