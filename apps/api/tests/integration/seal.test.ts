import { randomUUID } from "node:crypto";

import { bundleSchema, canonicalJsonBytes } from "@incident-witness/protocol";
import {
  sha256Base64Url,
  verifyBundleManifest,
  verifyEventEnvelope,
  verifySourceKeyCertificate,
} from "@incident-witness/protocol/node";
import { describe, expect, it } from "vitest";

import { runLifecycleSweep } from "../../src/lifecycle/sweeper.js";
import {
  activateHost,
  createIncident,
  enrollRenter,
  issueRenterInvitation,
  sendSignedEvent,
} from "./helpers.js";
import {
  apiPool,
  appConfig,
  inject,
  migrator,
  platformPublicKey,
  registerIntegrationHooks,
  tokenA,
  tokenB,
} from "./harness.js";

registerIntegrationHooks();

const HOST_HEARTBEAT_PAYLOAD = {
  agent_version: "0.1.0-test",
  os_family: "linux",
  os_version: "6.8",
  uptime_seconds: 100,
  agent_health: "ok",
};

function at(base: number, offsetMs: number): string {
  return new Date(base + offsetMs).toISOString();
}

async function hostAndIncident() {
  const host = await activateHost(
    tokenA,
    "Seal host",
    `seal-${randomUUID()}.example.com`,
  );
  const incident = await createIncident(tokenA, host.hostId);
  expect(incident.statusCode).toBe(201);
  const data = incident.json().data as {
    incidentId: string;
    captureStartedAt: string;
    captureEndsAt: string;
  };
  return {
    host,
    incidentId: data.incidentId,
    captureStartedAt: Date.parse(data.captureStartedAt),
    captureEndsAt: Date.parse(data.captureEndsAt),
  };
}

async function hostHeartbeat(
  host: Awaited<ReturnType<typeof activateHost>>,
  incidentId: string,
  captureStartedAt: number,
  sequence = 1,
  offsetMs = 0,
) {
  const event = await sendSignedEvent("/v1/agent/events", host.credential, {
    incidentId,
    sourceKeyId: host.sourceKeyId,
    sourceType: "host_agent",
    privateKey: host.privateKey,
    eventType: "host_heartbeat",
    payload: HOST_HEARTBEAT_PAYLOAD,
    sequence,
    observedAt: at(captureStartedAt, offsetMs),
  });
  expect(event.response.statusCode).toBe(202);
  return event;
}

async function downloadBundle(incidentId: string, token = tokenA) {
  return inject("GET", `/v1/incidents/${incidentId}/bundle`, token);
}

describe("sealing and bundle download", () => {
  it("seals a host+renter incident, downloads it and verifies every signature", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    const invitation = await issueRenterInvitation(tokenA, incidentId);
    expect(invitation.statusCode).toBe(201);
    const renter = await enrollRenter(invitation.json().data.invitationToken as string);
    expect(renter.response.statusCode).toBe(201);
    const renterData = renter.response.json().data as {
      sourceKeyId: string;
      ingestionCredential: string;
    };

    await hostHeartbeat(host, incidentId, captureStartedAt);
    const power = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_power_state",
      payload: { ups_alias: "ups0", state: "on_battery", charge_percent: 42 },
      sequence: 2,
      observedAt: at(captureStartedAt, 0),
    });
    expect(power.response.statusCode).toBe(202);

    const renterEvent = await sendSignedEvent(
      "/v1/renter/events",
      renterData.ingestionCredential,
      {
        incidentId,
        sourceKeyId: renterData.sourceKeyId,
        sourceType: "renter_client",
        privateKey: renter.privateKey,
        eventType: "renter_endpoint_result",
        payload: { result: "unreachable", latency_ms: 3000, failure_category: "network" },
        sequence: 1,
        observedAt: at(captureStartedAt, 0),
      },
    );
    expect(renterEvent.response.statusCode).toBe(202);

    const end = await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);
    expect(end.statusCode).toBe(200);

    const seal = await inject("POST", `/v1/incidents/${incidentId}/seal`, tokenA);
    expect(seal.statusCode).toBe(201);
    const sealData = seal.json().data as {
      bundleId: string;
      bundleSha256: string;
      sealedAt: string;
      assessment: { code: string; explanation: string; evidenceGrade: string };
      eventCount: number;
      byteLength: number;
    };
    expect(sealData.assessment.code).toBe("POWER_RELATED");
    expect(sealData.assessment.evidenceGrade).toBe("MEDIUM");
    expect(sealData.eventCount).toBe(3);
    expect(sealData.byteLength).toBeLessThanOrEqual(10 * 1024 * 1024);

    const download = await downloadBundle(incidentId);
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toContain(
      "application/vnd.incident-witness.bundle+json",
    );
    expect(String(download.headers["content-disposition"])).toContain(
      `incident-witness-${incidentId}.json`,
    );
    expect(download.headers["cache-control"]).toBe("no-store");

    const bundle = bundleSchema.parse(JSON.parse(download.body));
    const verification = await verifyBundleManifest(
      bundle,
      platformPublicKey,
      "integration-platform-key",
    );
    expect(verification.valid).toBe(true);
    expect(bundle.manifest.events).toHaveLength(3);
    expect(bundle.manifest.source_certificates).toHaveLength(2);
    expect(bundle.manifest.rule_version).toBe("iw-rules-v1");
    expect(bundle.manifest.assessment.code).toBe("POWER_RELATED");
    expect(bundle.manifest.simulation_present).toBe(false);

    for (const entry of bundle.manifest.events) {
      const certificate = bundle.manifest.source_certificates.find(
        (candidate) => candidate.certificate.source_key_id === entry.event.source_key_id,
      );
      expect(certificate).toBeTruthy();
      expect(await verifySourceKeyCertificate(certificate!, platformPublicKey)).toBe(true);
      expect(await verifyEventEnvelope(entry.event, certificate!.certificate.public_key)).toBe(
        true,
      );

      const { signature, ...body } = entry.event;
      void signature;
      expect(entry.event_sha256).toBe(
        sha256Base64Url(canonicalJsonBytes(body)),
      );
    }

    const incident = await migrator.query<{
      status: string;
      sealed_at: Date | null;
      rule_version: string | null;
      assessment_code: string | null;
      evidence_grade: string | null;
    }>(
      `select status, sealed_at, rule_version, assessment_code, evidence_grade
         from incidents where id = $1`,
      [incidentId],
    );
    expect(incident.rows[0]).toMatchObject({
      status: "sealed",
      rule_version: "iw-rules-v1",
      assessment_code: "POWER_RELATED",
      evidence_grade: "MEDIUM",
    });
    expect(incident.rows[0]!.sealed_at).toBeTruthy();

    const otherOwner = await downloadBundle(incidentId, tokenB);
    expect(otherOwner.statusCode).toBe(404);
  });

  it("labels and caps a demo session at LOW even when its events are real", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    await migrator.query(`update incidents set demo_mode = true where id = $1`, [incidentId]);

    const invitation = await issueRenterInvitation(tokenA, incidentId);
    const renter = await enrollRenter(invitation.json().data.invitationToken as string);
    const renterData = renter.response.json().data as {
      sourceKeyId: string;
      ingestionCredential: string;
    };

    await hostHeartbeat(host, incidentId, captureStartedAt);
    await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_power_state",
      payload: { ups_alias: "ups0", state: "on_battery", charge_percent: 42 },
      sequence: 2,
      observedAt: at(captureStartedAt, 0),
    });
    await sendSignedEvent("/v1/renter/events", renterData.ingestionCredential, {
      incidentId,
      sourceKeyId: renterData.sourceKeyId,
      sourceType: "renter_client",
      privateKey: renter.privateKey,
      eventType: "renter_endpoint_result",
      payload: { result: "unreachable", latency_ms: 3000, failure_category: "network" },
      sequence: 1,
      observedAt: at(captureStartedAt, 0),
    });

    await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);
    const seal = await inject("POST", `/v1/incidents/${incidentId}/seal`, tokenA);
    expect(seal.statusCode).toBe(201);
    expect(seal.json().data.assessment.evidenceGrade).toBe("LOW");
    expect(seal.json().data.assessment.explanation).toContain("demo session");

    const download = await downloadBundle(incidentId);
    const bundle = bundleSchema.parse(JSON.parse(download.body));
    expect(bundle.manifest.simulation_present).toBe(true);
    expect(bundle.manifest.assessment.evidence_grade).toBe("LOW");
  });

  it("refuses to seal while a probe lease is active", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    await hostHeartbeat(host, incidentId, captureStartedAt);
    await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);

    const lease = randomUUID();
    await migrator.query(
      `insert into probe_jobs
         (id, incident_id, host_id, scheduled_at, lease_owner, lease_expires_at, attempt_count, status)
       values ($1, $2, $3, now(), 'integration-test', now() + interval '1 minute', 1, 'leased')`,
      [lease, incidentId, host.hostId],
    );

    const blocked = await inject("POST", `/v1/incidents/${incidentId}/seal`, tokenA);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("PROBE_LEASE_ACTIVE");

    await migrator.query(
      `update probe_jobs set lease_expires_at = now() - interval '1 second' where id = $1`,
      [lease],
    );
    const sealed = await inject("POST", `/v1/incidents/${incidentId}/seal`, tokenA);
    expect(sealed.statusCode).toBe(201);
  });

  it("rejects sealing an incident with no accepted events", async () => {
    const { incidentId } = await hostAndIncident();
    await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);

    const seal = await inject("POST", `/v1/incidents/${incidentId}/seal`, tokenA);
    expect(seal.statusCode).toBe(409);
    expect(seal.json().error.code).toBe("NO_EVIDENCE");
  });

  it("serializes seal against event ingestion and rejects post-seal events", async () => {
    const { host, incidentId, captureStartedAt } = await hostAndIncident();
    await hostHeartbeat(host, incidentId, captureStartedAt, 1, 100);
    await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);

    const concurrent = await Promise.all([
      sendSignedEvent("/v1/agent/events", host.credential, {
        incidentId,
        sourceKeyId: host.sourceKeyId,
        sourceType: "host_agent",
        privateKey: host.privateKey,
        eventType: "host_heartbeat",
        payload: HOST_HEARTBEAT_PAYLOAD,
        sequence: 2,
        observedAt: at(captureStartedAt, 0),
      }),
      inject("POST", `/v1/incidents/${incidentId}/seal`, tokenA),
    ]);

    const eventResponse = concurrent[0].response;
    const sealResponse = concurrent[1];
    expect([202, 409]).toContain(eventResponse.statusCode);
    expect(sealResponse.statusCode).toBe(201);

    const download = await downloadBundle(incidentId);
    expect(download.statusCode).toBe(200);
    const bundle = bundleSchema.parse(JSON.parse(download.body));
    expect(bundle.manifest.events).toHaveLength(
      eventResponse.statusCode === 202 ? 2 : 1,
    );

    const afterSeal = await sendSignedEvent("/v1/agent/events", host.credential, {
      incidentId,
      sourceKeyId: host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 3,
      observedAt: at(captureStartedAt, 0),
    });
    expect(afterSeal.response.statusCode).toBe(409);
    expect(afterSeal.response.json().error.code).toBe("INCIDENT_CLOSED");
  });

  it("auto-seals at ingestion_deadline and auto-cancels when no evidence exists", async () => {
    const withEvidence = await hostAndIncident();
    await migrator.query(
      `update incidents
          set capture_started_at = now() - interval '10 minutes',
              capture_ends_at = now() - interval '5 minutes',
              ingestion_deadline = now() + interval '1 hour'
        where id = $1`,
      [withEvidence.incidentId],
    );

    const event = await sendSignedEvent("/v1/agent/events", withEvidence.host.credential, {
      incidentId: withEvidence.incidentId,
      sourceKeyId: withEvidence.host.sourceKeyId,
      sourceType: "host_agent",
      privateKey: withEvidence.host.privateKey,
      eventType: "host_heartbeat",
      payload: HOST_HEARTBEAT_PAYLOAD,
      sequence: 1,
      observedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
    });
    expect(event.response.statusCode).toBe(202);

    await inject("POST", `/v1/incidents/${withEvidence.incidentId}/end`, tokenA);
    await migrator.query(
      `update incidents set ingestion_deadline = now() - interval '1 second' where id = $1`,
      [withEvidence.incidentId],
    );

    await runLifecycleSweep(apiPool, appConfig);

    const sealed = await migrator.query<{ status: string }>(
      `select status from incidents where id = $1`,
      [withEvidence.incidentId],
    );
    expect(sealed.rows[0]!.status).toBe("sealed");

    const bundle = await downloadBundle(withEvidence.incidentId);
    expect(bundle.statusCode).toBe(200);

    const withoutEvidence = await hostAndIncident();
    await migrator.query(
      `update incidents
          set capture_started_at = now() - interval '10 minutes',
              capture_ends_at = now() - interval '5 minutes',
              ingestion_deadline = now() + interval '1 hour'
        where id = $1`,
      [withoutEvidence.incidentId],
    );
    await inject("POST", `/v1/incidents/${withoutEvidence.incidentId}/end`, tokenA);
    await migrator.query(
      `update incidents set ingestion_deadline = now() - interval '1 second' where id = $1`,
      [withoutEvidence.incidentId],
    );

    await runLifecycleSweep(apiPool, appConfig);

    const cancelled = await migrator.query<{
      status: string;
      cancel_reason: string | null;
    }>(
      `select status, cancel_reason from incidents where id = $1`,
      [withoutEvidence.incidentId],
    );
    expect(cancelled.rows[0]).toEqual({
      status: "cancelled",
      cancel_reason: "NO_EVIDENCE",
    });

    const noBundle = await downloadBundle(withoutEvidence.incidentId);
    expect(noBundle.statusCode).toBe(409);
  });
});
