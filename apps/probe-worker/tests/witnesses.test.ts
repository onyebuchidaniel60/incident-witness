import { generateKeyPairSync } from "node:crypto";

import { eventEnvelopeSchema } from "@incident-witness/protocol";
import { exportPublicKeyBase64Url, verifyEventEnvelope } from "@incident-witness/protocol/node";
import { RenterClient, type RenterApiTransport } from "@incident-witness/renter-sdk";
import { describe, expect, it } from "vitest";

import { buildWorkerEvent } from "../src/events.js";

const INCIDENT_ID = "11111111-1111-4111-8111-111111111111";
const RENTER_SOURCE_KEY_ID = "22222222-2222-4222-8222-222222222222";
const PROBE_SOURCE_KEY_ID = "33333333-3333-4333-8333-333333333333";
const HOST_ID = "44444444-4444-4444-8444-444444444444";
const RENTER_CREDENTIAL = "r".repeat(43);

describe("renter and probe witnesses", () => {
  it("sign independent observations for the same incident and verify both", async () => {
    const uploaded: string[] = [];
    let renterPublicKey = "";
    const transport: RenterApiTransport = {
      enroll: async (request) => {
        renterPublicKey = request.publicKey;
        return {
          sourceKeyId: RENTER_SOURCE_KEY_ID,
          certificate: {
            certificate_version: "1.0",
            source_key_id: RENTER_SOURCE_KEY_ID,
            source_type: "renter_client",
            public_key: request.publicKey,
            fingerprint: "renter-test-fingerprint",
            incident_id: INCIDENT_ID,
            issued_at: "2026-10-31T12:00:00.000Z",
            protocol_version: "1.0",
          },
          certificateSignature: "test-signature",
          ingestionCredential: RENTER_CREDENTIAL,
          incidentId: INCIDENT_ID,
          sessionEndsAt: "2026-10-31T12:30:00.000Z",
          protocolVersion: "1.0",
        };
      },
      postEvent: async (raw) => {
        uploaded.push(raw);
        return { kind: "accepted", status: 202 };
      },
    };

    const renter = await RenterClient.enroll({
      apiBaseUrl: "http://127.0.0.1:4000",
      invitationToken: "test-invitation",
      endpointHostname: "gpu.example.com",
      transport,
      endpointChecker: { check: async () => ({ result: "reachable", latencyMs: 5 }) },
      now: () => new Date("2026-10-31T12:00:00.000Z"),
    });

    renter.emitHeartbeatOnce();
    await renter.flushOnce();

    const { privateKey: probePrivateKey, publicKey: probePublicKey } =
      generateKeyPairSync("ed25519");
    const receivedAt = new Date("2026-10-31T12:00:05.000Z");
    const probe = buildWorkerEvent({
      jobId: "55555555-5555-4555-8555-555555555555",
      attempt: 1,
      incidentId: INCIDENT_ID,
      sourceKeyId: PROBE_SOURCE_KEY_ID,
      privateKey: probePrivateKey,
      eventType: "platform_probe_result",
      payload: {
        target_host_id: HOST_ID,
        probe_status: "completed",
        dns_result: "resolved",
        tls_result: "valid",
        http_result: "expected",
        latency_ms: 12,
        response_class: "expected",
        observed_ip_class: "public",
      },
      sequence: 1,
      observedAt: receivedAt,
      receivedAt,
    });

    expect(uploaded).toHaveLength(1);
    const renterEnvelope = eventEnvelopeSchema.parse(JSON.parse(uploaded[0] ?? "{}"));
    const probeEnvelope = eventEnvelopeSchema.parse(JSON.parse(probe.raw));

    expect(renterEnvelope.incident_id).toBe(INCIDENT_ID);
    expect(probeEnvelope.incident_id).toBe(INCIDENT_ID);
    expect(renterEnvelope.source_type).toBe("renter_client");
    expect(probeEnvelope.source_type).toBe("platform_probe");
    expect(renterEnvelope.source_key_id).not.toBe(probeEnvelope.source_key_id);

    expect(await verifyEventEnvelope(renterEnvelope, renterPublicKey)).toBe(true);
    expect(await verifyEventEnvelope(probeEnvelope, exportPublicKeyBase64Url(probePublicKey))).toBe(
      true,
    );
  });
});
