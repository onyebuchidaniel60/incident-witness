import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

import { base64UrlToBytes, bytesToBase64Url } from "../core/base64.js";
import { canonicalJsonBytes } from "../core/json.js";
import {
  bundleManifestSchema,
  bundleSchema,
  eventBodySchema,
  eventEnvelopeSchema,
  signedSourceKeyCertificateSchema,
  sourceKeyCertificateSchema,
  type Bundle,
  type BundleManifest,
  type EventBody,
  type EventEnvelope,
  type SignedSourceKeyCertificate,
  type SourceKeyCertificate,
} from "../core/schemas.js";
import type { BundleVerificationResult } from "../core/verification.js";

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type NodePublicKey = KeyObject | string;
export type NodePrivateKey = KeyObject | string | Buffer;

function toPrivateKey(privateKey: NodePrivateKey): KeyObject {
  return privateKey instanceof Object && "type" in privateKey
    ? (privateKey as KeyObject)
    : createPrivateKey(privateKey);
}

function toPublicKey(publicKey: NodePublicKey): KeyObject {
  if (typeof publicKey !== "string") {
    return publicKey;
  }

  if (publicKey.includes("BEGIN PUBLIC KEY")) {
    return createPublicKey(publicKey);
  }

  const raw = base64UrlToBytes(publicKey);
  if (raw.length !== 32) {
    throw new Error("Ed25519 public key must decode to 32 bytes");
  }

  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(raw)]),
    format: "der",
    type: "spki",
  });
}

export function sha256Base64Url(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("base64url");
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function exportPublicKeyBase64Url(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  if (!jwk.x) {
    throw new Error("Public key does not contain a raw Ed25519 x coordinate");
  }
  return jwk.x;
}

export function publicKeyFingerprint(publicKey: NodePublicKey): string {
  const raw = toPublicKey(publicKey).export({ format: "jwk" }) as { x?: string };
  if (!raw.x) {
    throw new Error("Public key does not contain a raw Ed25519 x coordinate");
  }
  return sha256Base64Url(base64UrlToBytes(raw.x));
}

export function signEvent(body: EventBody, privateKey: NodePrivateKey): EventEnvelope {
  const parsed = eventBodySchema.parse(body);
  const signature = sign(null, Buffer.from(canonicalJsonBytes(parsed)), toPrivateKey(privateKey));

  return eventEnvelopeSchema.parse({
    ...parsed,
    signature: bytesToBase64Url(signature),
  });
}

export async function verifyEvent(
  body: EventBody,
  signature: string,
  publicKey: NodePublicKey,
): Promise<boolean> {
  try {
    const parsed = eventBodySchema.parse(body);
    const signatureBytes = base64UrlToBytes(signature);
    if (signatureBytes.length !== 64) return false;

    return verify(
      null,
      Buffer.from(canonicalJsonBytes(parsed)),
      toPublicKey(publicKey),
      Buffer.from(signatureBytes),
    );
  } catch {
    return false;
  }
}

export async function verifyEventEnvelope(
  envelope: EventEnvelope,
  publicKey: NodePublicKey,
): Promise<boolean> {
  try {
    const parsed = eventEnvelopeSchema.parse(envelope);
    const { signature, ...body } = parsed;
    return verifyEvent(body as EventBody, signature, publicKey);
  } catch {
    return false;
  }
}

export function createSourceKeyCertificate(
  certificate: SourceKeyCertificate,
  platformPrivateKey: NodePrivateKey,
): SignedSourceKeyCertificate {
  const parsed = sourceKeyCertificateSchema.parse(certificate);
  const signature = sign(
    null,
    Buffer.from(canonicalJsonBytes(parsed)),
    toPrivateKey(platformPrivateKey),
  );

  return signedSourceKeyCertificateSchema.parse({
    certificate: parsed,
    signature: bytesToBase64Url(signature),
    signature_algorithm: "Ed25519",
  });
}

export async function verifySourceKeyCertificate(
  signed: SignedSourceKeyCertificate,
  platformPublicKey: NodePublicKey,
): Promise<boolean> {
  try {
    const parsed = signedSourceKeyCertificateSchema.parse(signed);
    return verify(
      null,
      Buffer.from(canonicalJsonBytes(parsed.certificate)),
      toPublicKey(platformPublicKey),
      Buffer.from(base64UrlToBytes(parsed.signature)),
    );
  } catch {
    return false;
  }
}

export function createBundleManifest(
  manifest: BundleManifest,
  platformPrivateKey: NodePrivateKey,
): Bundle {
  const parsed = bundleManifestSchema.parse(manifest);
  const canonical = canonicalJsonBytes(parsed);
  const signature = sign(null, Buffer.from(canonical), toPrivateKey(platformPrivateKey));

  return bundleSchema.parse({
    bundle_version: "1.0",
    manifest: parsed,
    manifest_sha256: sha256Base64Url(canonical),
    platform_signature: bytesToBase64Url(signature),
  });
}

export async function verifyBundleManifest(
  bundle: unknown,
  platformPublicKey: NodePublicKey,
  expectedPlatformKeyId?: string,
): Promise<BundleVerificationResult> {
  const parsed = bundleSchema.safeParse(bundle);
  if (!parsed.success) {
    return {
      schemaValid: false,
      manifestDigestValid: false,
      platformSignatureValid: false,
      trustedKeyIdValid: false,
      valid: false,
    };
  }

  const canonical = canonicalJsonBytes(parsed.data.manifest);
  const manifestDigestValid = sha256Base64Url(canonical) === parsed.data.manifest_sha256;
  let platformSignatureValid = false;

  try {
    platformSignatureValid = verify(
      null,
      Buffer.from(canonical),
      toPublicKey(platformPublicKey),
      Buffer.from(base64UrlToBytes(parsed.data.platform_signature)),
    );
  } catch {
    platformSignatureValid = false;
  }

  const trustedKeyIdValid =
    expectedPlatformKeyId === undefined ||
    parsed.data.manifest.platform_key_id === expectedPlatformKeyId;

  return {
    schemaValid: true,
    manifestDigestValid,
    platformSignatureValid,
    trustedKeyIdValid,
    valid: manifestDigestValid && platformSignatureValid && trustedKeyIdValid,
  };
}
