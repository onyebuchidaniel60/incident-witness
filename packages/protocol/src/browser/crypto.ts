import { verifyAsync } from "@noble/ed25519";

import { base64UrlToBytes, bytesToBase64Url } from "../core/base64.js";
import { canonicalJsonBytes } from "../core/json.js";
import {
  bundleSchema,
  eventBodySchema,
  eventEnvelopeSchema,
  signedSourceKeyCertificateSchema,
  type BundleManifest,
  type EventBody,
  type EventEnvelope,
  type SignedSourceKeyCertificate,
} from "../core/schemas.js";
import type { BundleVerificationResult } from "../core/verification.js";

export type BrowserPublicKey = string | Uint8Array;

function publicKeyBytes(publicKey: BrowserPublicKey): Uint8Array {
  return typeof publicKey === "string" ? base64UrlToBytes(publicKey) : publicKey;
}

export async function sha256Base64Url(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is not available");
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function verifyRawEd25519(
  message: Uint8Array,
  signature: string,
  publicKey: BrowserPublicKey,
): Promise<boolean> {
  try {
    const signatureBytes = base64UrlToBytes(signature);
    if (signatureBytes.length !== 64) return false;
    return await verifyAsync(signatureBytes, message, publicKeyBytes(publicKey));
  } catch {
    return false;
  }
}

export async function verifyEvent(
  body: EventBody,
  signature: string,
  publicKey: BrowserPublicKey,
): Promise<boolean> {
  try {
    const parsed = eventBodySchema.parse(body);
    return await verifyRawEd25519(canonicalJsonBytes(parsed), signature, publicKey);
  } catch {
    return false;
  }
}

export async function verifyEventEnvelope(
  envelope: EventEnvelope,
  publicKey: BrowserPublicKey,
): Promise<boolean> {
  try {
    const parsed = eventEnvelopeSchema.parse(envelope);
    const { signature, ...body } = parsed;
    return await verifyEvent(body as EventBody, signature, publicKey);
  } catch {
    return false;
  }
}

export async function verifySourceKeyCertificate(
  signed: SignedSourceKeyCertificate,
  platformPublicKey: BrowserPublicKey,
): Promise<boolean> {
  try {
    const parsed = signedSourceKeyCertificateSchema.parse(signed);
    return await verifyRawEd25519(
      canonicalJsonBytes(parsed.certificate),
      parsed.signature,
      platformPublicKey,
    );
  } catch {
    return false;
  }
}

export async function verifyBundleManifest(
  bundle: unknown,
  platformPublicKey: BrowserPublicKey,
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
  const manifestDigestValid = (await sha256Base64Url(canonical)) === parsed.data.manifest_sha256;
  const platformSignatureValid = await verifyRawEd25519(
    canonical,
    parsed.data.platform_signature,
    platformPublicKey,
  );
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

export type { BundleManifest };
