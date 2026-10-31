import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";

import { bundleSchema, canonicalJsonBytes, type EventBody } from "@incident-witness/protocol";
import {
  createSourceKeyCertificate,
  publicKeyFingerprint,
  sha256Base64Url,
  signEvent,
  verifyEventEnvelope,
  verifySourceKeyCertificate,
} from "@incident-witness/protocol/node";
import { afterEach, describe, expect, it } from "vitest";

import { canonicalEventEntryBytes } from "../../src/domain/evidence.js";
import { activateHost, createIncident, sendSignedEvent } from "./helpers.js";
import {
  appConfig,
  inject,
  migrator,
  platformPublicKey,
  registerIntegrationHooks,
  tokenA,
} from "./harness.js";

registerIntegrationHooks();

let createdProbeKeyId: string | null = null;

afterEach(async () => {
  if (createdProbeKeyId) {
    await migrator.query("delete from evidence_events where source_key_id = $1", [
      createdProbeKeyId,
    ]);
    await migrator.query("delete from witness_keys where id = $1", [createdProbeKeyId]);
    createdProbeKeyId = null;
  }
});

describe("platform-probe evidence sealing", () => {
  it("seals platform-probe events and exposes timeline payloads", async () => {
    const host = await activateHost(
      tokenA,
      "Probe seal host",
      `probe-seal-${randomUUID()}.example.com`,
    );
    const incidentResponse = await createIncident(tokenA, host.hostId);
    expect(incidentResponse.statusCode).toBe(201);
    const incident = incidentResponse.json().data as {
      incidentId: string;
      captureStartedAt: string;
    };
    const captureStartedAt = Date.parse(incident.captureStartedAt);
    const observedAt = new Date(captureStartedAt + 100).toISOString();

    const unavailableGpu = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId: incident.incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "gpu_telemetry",
      payload: { collection_status: "unavailable" },
      sequence: 1,
      observedAt,
    });
    expect(unavailableGpu.response.statusCode).toBe(202);

    const probePair = generateKeyPairSync("ed25519");
    const probePublicKey = (probePair.publicKey.export({ format: "jwk" }) as { x?: string }).x;
    if (!probePublicKey) throw new Error("probe test key has no public component");
    const probeKeyId = randomUUID();
    createdProbeKeyId = probeKeyId;
    const certificate = createSourceKeyCertificate(
      {
        certificate_version: "1.0",
        source_key_id: probeKeyId,
        source_type: "platform_probe",
        public_key: probePublicKey,
        fingerprint: publicKeyFingerprint(probePublicKey),
        issued_at: new Date(captureStartedAt).toISOString(),
        protocol_version: "1.0",
      },
      appConfig.platformSigningKey,
    );

    const probeBody: EventBody = {
      protocol_version: "1.0",
      event_id: randomUUID(),
      incident_id: incident.incidentId,
      source_key_id: probeKeyId,
      source_type: "platform_probe",
      event_type: "platform_probe_result",
      sequence: 1,
      observed_at: observedAt,
      payload: {
        target_host_id: host.hostId,
        probe_status: "completed",
        dns_result: "resolved",
        tls_result: "valid",
        http_result: "expected",
        latency_ms: 12,
        response_class: "expected",
        observed_ip_class: "public",
      },
      simulation_mode: false,
      canonicalization: "RFC8785-JCS",
      signature_algorithm: "Ed25519",
    };
    const probeEvent = signEvent(probeBody, probePair.privateKey);
    const { signature, ...signedProbeBody } = probeEvent;
    void signature;
    const probeDigest = createHash("sha256").update(canonicalJsonBytes(signedProbeBody)).digest();
    const probeEventSha = sha256Base64Url(canonicalJsonBytes(signedProbeBody));
    const receivedAt = new Date();
    const entryBytes = canonicalEventEntryBytes(probeEvent, receivedAt, probeEventSha);

    await migrator.query(
      `insert into witness_keys
         (id, owner_user_id, host_id, incident_id, source_type, public_key, fingerprint,
          status, certificate_json, certificate_signature)
       values ($1, null, null, null, 'platform_probe', $2, $3, 'active', $4::jsonb, $5)`,
      [
        probeKeyId,
        Buffer.from(probePublicKey, "base64url"),
        publicKeyFingerprint(probePublicKey),
        JSON.stringify(certificate.certificate),
        Buffer.from(certificate.signature, "base64url"),
      ],
    );
    await migrator.query(
      `insert into evidence_events
         (id, incident_id, source_key_id, source_type, event_type, sequence, observed_at,
          received_at, canonical_event, canonical_sha256, signature, simulation_mode,
          validation_status)
       values ($1, $2, $3, 'platform_probe', 'platform_probe_result', 1, $4, $5, $6::jsonb, $7, $8, false, 'accepted')`,
      [
        probeEvent.event_id,
        incident.incidentId,
        probeKeyId,
        new Date(observedAt),
        receivedAt,
        JSON.stringify(signedProbeBody),
        probeDigest,
        Buffer.from(probeEvent.signature, "base64url"),
      ],
    );
    await migrator.query(
      `update incidents
          set accepted_event_count = accepted_event_count + 1,
              accepted_event_bytes = accepted_event_bytes + $1::bigint
        where id = $2`,
      [entryBytes, incident.incidentId],
    );

    const detail = await inject("GET", `/v1/incidents/${incident.incidentId}`, tokenA);
    expect(detail.statusCode).toBe(200);
    const detailData = detail.json().data as {
      timeline: Array<{
        eventType: string;
        payload: Record<string, unknown>;
        simulationMode: boolean;
      }>;
    };
    expect(
      detailData.timeline.find((event) => event.eventType === "gpu_telemetry")?.payload
        .collection_status,
    ).toBe("unavailable");
    expect(
      detailData.timeline.find((event) => event.eventType === "platform_probe_result")
        ?.simulationMode,
    ).toBe(false);

    const end = await inject("POST", `/v1/incidents/${incident.incidentId}/end`, tokenA);
    expect(end.statusCode).toBe(200);

    const seal = await inject("POST", `/v1/incidents/${incident.incidentId}/seal`, tokenA);
    expect(seal.statusCode).toBe(201);

    const download = await inject("GET", `/v1/incidents/${incident.incidentId}/bundle`, tokenA);
    expect(download.statusCode).toBe(200);
    const bundle = bundleSchema.parse(JSON.parse(download.body));
    expect(bundle.manifest.source_certificates).toHaveLength(2);
    const probeCertificate = bundle.manifest.source_certificates.find(
      (entry) => entry.certificate.source_key_id === probeKeyId,
    );
    expect(probeCertificate).toBeTruthy();
    expect(await verifySourceKeyCertificate(probeCertificate!, platformPublicKey)).toBe(true);
    const probeEntry = bundle.manifest.events.find(
      (entry) => entry.event.source_key_id === probeKeyId,
    );
    expect(probeEntry).toBeTruthy();
    expect(
      await verifyEventEnvelope(probeEntry!.event, probeCertificate!.certificate.public_key),
    ).toBe(true);
  });
});
