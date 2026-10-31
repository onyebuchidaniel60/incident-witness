import type { KeyObject } from "node:crypto";

import {
  base64UrlToBytes,
  type SignedSourceKeyCertificate,
  type SourceKeyCertificate,
} from "@incident-witness/protocol";
import {
  createSourceKeyCertificate,
  publicKeyFingerprint,
} from "@incident-witness/protocol/node";

export type RegisteredCertificate = {
  certificate: SourceKeyCertificate;
  signed: SignedSourceKeyCertificate;
  signatureBytes: Buffer;
  publicKeyBytes: Buffer;
  fingerprint: string;
};

function register(
  certificate: SourceKeyCertificate,
  platformSigningKey: KeyObject,
): RegisteredCertificate {
  const signed = createSourceKeyCertificate(certificate, platformSigningKey);
  return {
    certificate,
    signed,
    signatureBytes: Buffer.from(base64UrlToBytes(signed.signature)),
    publicKeyBytes: Buffer.from(base64UrlToBytes(certificate.public_key)),
    fingerprint: certificate.fingerprint,
  };
}

export function createHostCertificate(input: {
  sourceKeyId: string;
  hostId: string;
  publicKey: string;
  platformSigningKey: KeyObject;
}): RegisteredCertificate {
  const fingerprint = publicKeyFingerprint(input.publicKey);
  return register(
    {
      certificate_version: "1.0",
      source_key_id: input.sourceKeyId,
      source_type: "host_agent",
      public_key: input.publicKey,
      fingerprint,
      host_id: input.hostId,
      issued_at: new Date().toISOString(),
      protocol_version: "1.0",
    },
    input.platformSigningKey,
  );
}

export function createRenterCertificate(input: {
  sourceKeyId: string;
  incidentId: string;
  publicKey: string;
  platformSigningKey: KeyObject;
}): RegisteredCertificate {
  const fingerprint = publicKeyFingerprint(input.publicKey);
  return register(
    {
      certificate_version: "1.0",
      source_key_id: input.sourceKeyId,
      source_type: "renter_client",
      public_key: input.publicKey,
      fingerprint,
      incident_id: input.incidentId,
      issued_at: new Date().toISOString(),
      protocol_version: "1.0",
    },
    input.platformSigningKey,
  );
}
