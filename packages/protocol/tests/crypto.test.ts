import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";

import { verifyAsync } from "@noble/ed25519";
import { describe, expect, it } from "vitest";

import {
  base64UrlToBytes,
  bytesToBase64Url,
  canonicalJsonBytes,
  canonicalJsonString,
  eventBodySchema,
  parseCanonicalJson,
  type EventBody,
  type EventEnvelope,
  type HostHeartbeatPayload,
} from "../src/index.js";
import {
  createBundleManifest,
  createSourceKeyCertificate,
  exportPublicKeyBase64Url,
  publicKeyFingerprint,
  sha256Base64Url,
  signEvent,
  verifyBundleManifest as verifyBundleNode,
  verifyEvent as verifyEventNode,
  verifyEventEnvelope as verifyEventEnvelopeNode,
  verifySourceKeyCertificate as verifyCertificateNode,
} from "../src/node.js";
import {
  sha256Base64Url as browserSha256Base64Url,
  verifyBundleManifest as verifyBundleBrowser,
  verifyEvent as verifyEventBrowser,
  verifyEventEnvelope as verifyEventEnvelopeBrowser,
  verifyRawEd25519,
  verifySourceKeyCertificate as verifyCertificateBrowser,
} from "../src/browser.js";

const eventId = "00000000-0000-4000-8000-000000000001";
const incidentId = "00000000-0000-4000-8000-000000000002";
const sourceKeyId = "00000000-0000-4000-8000-000000000003";
const hostId = "00000000-0000-4000-8000-000000000004";
const observedAt = "2026-10-30T12:00:00.000Z";
const receivedAt = "2026-10-30T12:00:01.000Z";

// Published RFC 8032 test vector. This is not a real or generated secret.
const rfc8032Vector = {
  secretKey: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
  publicKey: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
  signature:
    "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
};

function makeBody(): EventBody {
  return eventBodySchema.parse({
    protocol_version: "1.0",
    event_id: eventId,
    incident_id: incidentId,
    source_key_id: sourceKeyId,
    source_type: "host_agent",
    event_type: "host_heartbeat",
    sequence: 1,
    observed_at: observedAt,
    payload: {
      agent_version: "0.1.0",
      os_family: "linux",
      os_version: "6.8",
      uptime_seconds: 3600,
      agent_health: "ok",
    },
    simulation_mode: false,
    canonicalization: "RFC8785-JCS",
    signature_algorithm: "Ed25519",
  });
}

function keyPair() {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKey: pair.privateKey,
    publicKey: exportPublicKeyBase64Url(pair.publicKey),
  };
}

describe("Ed25519 and source-event signing", () => {
  it("matches RFC 8032 Ed25519 test vector 1", async () => {
    const prefix = Buffer.from("302e020100300506032b657004220420", "hex");
    const privateKey = createPrivateKey({
      key: Buffer.concat([prefix, Buffer.from(rfc8032Vector.secretKey, "hex")]),
      format: "der",
      type: "pkcs8",
    });
    const signature = sign(null, Buffer.alloc(0), privateKey);
    const publicKey = exportPublicKeyBase64Url(createPublicKey(privateKey));

    expect(signature.toString("hex")).toBe(rfc8032Vector.signature);
    expect(publicKey).toBe(bytesToBase64Url(Buffer.from(rfc8032Vector.publicKey, "hex")));
    await expect(
      verifyRawEd25519(
        new Uint8Array(),
        bytesToBase64Url(Buffer.from(rfc8032Vector.signature, "hex")),
        publicKey,
      ),
    ).resolves.toBe(true);
    await expect(
      verifyAsync(
        Buffer.from(rfc8032Vector.signature, "hex"),
        new Uint8Array(),
        Buffer.from(rfc8032Vector.publicKey, "hex"),
      ),
    ).resolves.toBe(true);
  });

  it("produces the same signature in Node and noble Ed25519", async () => {
    const { privateKey, publicKey } = keyPair();
    const body = makeBody();
    const canonical = canonicalJsonBytes(body);
    const nodeSignature = sign(null, Buffer.from(canonical), privateKey).toString("base64url");
    const jwk = privateKey.export({ format: "jwk" }) as { d: string };
    const noble = await import("@noble/ed25519");
    const nobleSignatureBytes = await noble.signAsync(canonical, base64UrlToBytes(jwk.d));

    expect(bytesToBase64Url(nobleSignatureBytes)).toBe(nodeSignature);
    expect(publicKey).toHaveLength(43);
  });

  it("signs an event and verifies it in both runtime entries", async () => {
    const { privateKey, publicKey } = keyPair();
    const body = makeBody();
    const envelope = signEvent(body, privateKey);

    await expect(verifyEventNode(body, envelope.signature, publicKey)).resolves.toBe(true);
    await expect(verifyEventBrowser(body, envelope.signature, publicKey)).resolves.toBe(true);
    await expect(verifyEventEnvelopeNode(envelope, publicKey)).resolves.toBe(true);
    await expect(verifyEventEnvelopeBrowser(envelope, publicKey)).resolves.toBe(true);
  });

  it("fails when one byte of the signed event body or signature changes", async () => {
    const { privateKey, publicKey } = keyPair();
    const body = makeBody();
    const envelope = signEvent(body, privateKey);

    const payload = body.payload as HostHeartbeatPayload;
    const tamperedBody = {
      ...body,
      payload: { ...payload, agent_version: "0.1.1" },
    } as EventBody;
    const signatureBytes = base64UrlToBytes(envelope.signature);
    signatureBytes[0] = (signatureBytes[0] ?? 0) ^ 0x01;
    const tamperedSignature = bytesToBase64Url(signatureBytes);

    await expect(verifyEventNode(tamperedBody, envelope.signature, publicKey)).resolves.toBe(false);
    await expect(verifyEventBrowser(tamperedBody, envelope.signature, publicKey)).resolves.toBe(
      false,
    );
    await expect(verifyEventNode(body, tamperedSignature, publicKey)).resolves.toBe(false);
    await expect(verifyEventBrowser(body, tamperedSignature, publicKey)).resolves.toBe(false);
  });

  it("rejects an unknown verification key", async () => {
    const { privateKey } = keyPair();
    const { publicKey: unknownPublicKey } = keyPair();
    const body = makeBody();
    const envelope = signEvent(body, privateKey);

    await expect(verifyEventNode(body, envelope.signature, unknownPublicKey)).resolves.toBe(false);
    await expect(verifyEventBrowser(body, envelope.signature, unknownPublicKey)).resolves.toBe(false);
  });

  it("allows canonical wire serialization of the complete signed envelope", () => {
    const { privateKey } = keyPair();
    const envelope = signEvent(makeBody(), privateKey);
    const wire = canonicalJsonString(envelope);

    expect(parseCanonicalJson(wire)).toEqual(envelope);
  });

  it("rejects unknown fields, invalid signatures and algorithm changes", async () => {
    const { privateKey, publicKey } = keyPair();
    const body = makeBody();
    const envelope = signEvent(body, privateKey);

    expect(eventBodySchema.safeParse({ ...body, extra: "rejected" }).success).toBe(false);
    expect(
      eventBodySchema.safeParse({
        ...body,
        payload: {
          ...(body.payload as HostHeartbeatPayload),
          agent_version: "x".repeat(41),
        },
      }).success,
    ).toBe(false);
    await expect(verifyEventNode(body, "not-base64!", publicKey)).resolves.toBe(false);
    await expect(verifyEventBrowser(body, "not-base64!", publicKey)).resolves.toBe(false);
    await expect(
      verifyEventEnvelopeNode(
        { ...envelope, signature_algorithm: "none" } as unknown as EventEnvelope,
        publicKey,
      ),
    ).resolves.toBe(false);
  });

  it("creates and verifies a source-key certificate in both runtimes", async () => {
    const { privateKey: platformPrivateKey, publicKey: platformPublicKey } = keyPair();
    const { publicKey: sourcePublicKey } = keyPair();
    const certificate = {
      certificate_version: "1.0" as const,
      source_key_id: sourceKeyId,
      source_type: "host_agent" as const,
      public_key: sourcePublicKey,
      fingerprint: publicKeyFingerprint(sourcePublicKey),
      host_id: hostId,
      issued_at: observedAt,
      protocol_version: "1.0" as const,
    };
    const signed = createSourceKeyCertificate(certificate, platformPrivateKey);

    await expect(verifyCertificateNode(signed, platformPublicKey)).resolves.toBe(true);
    await expect(verifyCertificateBrowser(signed, platformPublicKey)).resolves.toBe(true);
    const certificateSignatureBytes = base64UrlToBytes(signed.signature);
    certificateSignatureBytes[0] = (certificateSignatureBytes[0] ?? 0) ^ 0x01;
    const tamperedCertificateSignature = bytesToBase64Url(certificateSignatureBytes);
    await expect(
      verifyCertificateBrowser(
        { ...signed, signature: tamperedCertificateSignature },
        platformPublicKey,
      ),
    ).resolves.toBe(false);
  });

  it("creates a bundle manifest and verifies it in Node and browser", async () => {
    const { privateKey: platformPrivateKey, publicKey: platformPublicKey } = keyPair();
    const { privateKey: sourcePrivateKey, publicKey: sourcePublicKey } = keyPair();
    const body = makeBody();
    const envelope = signEvent(body, sourcePrivateKey);
    const certificate = createSourceKeyCertificate(
      {
        certificate_version: "1.0",
        source_key_id: sourceKeyId,
        source_type: "host_agent",
        public_key: sourcePublicKey,
        fingerprint: publicKeyFingerprint(sourcePublicKey),
        host_id: hostId,
        issued_at: observedAt,
        protocol_version: "1.0",
      },
      platformPrivateKey,
    );
    const manifest = {
      incident_id: incidentId,
      host_alias: "test-host",
      endpoint_hostname: "host.example.invalid",
      capture_started_at: observedAt,
      capture_ends_at: "2026-10-30T12:30:00.000Z",
      sealed_at: "2026-10-30T12:31:00.000Z",
      protocol_version: "1.0" as const,
      schema_version: "1.0" as const,
      rule_version: "v1",
      events: [
        {
          event: envelope,
          received_at: receivedAt,
          event_sha256: sha256Base64Url(canonicalJsonBytes(envelope)),
        },
      ],
      source_certificates: [certificate],
      gaps: [],
      assessment: {
        code: "UNKNOWN" as const,
        explanation: "Insufficient evidence.",
        evidence_grade: "INSUFFICIENT" as const,
      },
      simulation_present: false,
      platform_key_id: "platform-test-key",
      limitations: "Signatures verify integrity, not sensor truth.",
    };
    const bundle = createBundleManifest(manifest, platformPrivateKey);

    await expect(verifyBundleNode(bundle, platformPublicKey, "platform-test-key")).resolves.toEqual({
      schemaValid: true,
      manifestDigestValid: true,
      platformSignatureValid: true,
      trustedKeyIdValid: true,
      valid: true,
    });
    await expect(verifyBundleBrowser(bundle, platformPublicKey, "platform-test-key")).resolves.toEqual({
      schemaValid: true,
      manifestDigestValid: true,
      platformSignatureValid: true,
      trustedKeyIdValid: true,
      valid: true,
    });

    const tampered = JSON.parse(JSON.stringify(bundle)) as typeof bundle;
    tampered.manifest.host_alias = "tampered";
    await expect(verifyBundleNode(tampered, platformPublicKey)).resolves.toMatchObject({
      manifestDigestValid: false,
      platformSignatureValid: false,
      valid: false,
    });
    await expect(verifyBundleNode(bundle, platformPublicKey, "other-key")).resolves.toMatchObject({
      trustedKeyIdValid: false,
      valid: false,
    });
  });

  it("hashes canonical bytes with the same SHA-256 in Node and browser", async () => {
    const bytes = canonicalJsonBytes({ b: 2, a: 1 });
    const expected = createHash("sha256").update(bytes).digest("base64url");

    expect(sha256Base64Url(bytes)).toBe(expected);
    await expect(browserSha256Base64Url(bytes)).resolves.toBe(expected);
  });
});
