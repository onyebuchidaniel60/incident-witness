import { generateKeyPairSync, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  activateHost,
  createHost,
  createIncident,
  createVerifiedHost,
  PUBLIC_TEST_ADDRESS,
} from "./helpers.js";
import {
  dns,
  endpointChecker,
  idempotencyHeaders,
  inject,
  migrator,
  publicKeyBase64Url,
  registerIntegrationHooks,
  tokenA,
  tokenB,
  userA,
} from "./harness.js";

registerIntegrationHooks();

describe("host and endpoint APIs", () => {
  it("creates, lists, reads and updates an owned host", async () => {
    const { hostId } = await createHost(tokenA, "Primary host", "host-one.example.com");

    const list = await inject("GET", "/v1/hosts", tokenA);
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].id).toBe(hostId);

    const detail = await inject("GET", `/v1/hosts/${hostId}`, tokenA);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.status).toBe("pending_endpoint");
    expect(detail.json().data.hostname).toBe("host-one.example.com");

    const patch = await inject("PATCH", `/v1/hosts/${hostId}`, tokenA, {
      alias: "Renamed host",
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.alias).toBe("Renamed host");
  });

  it("returns 404 for every non-owned host operation", async () => {
    const { hostId } = await createHost(tokenA, "Private host", "private.example.com");

    const attempts = await Promise.all([
      inject("GET", `/v1/hosts/${hostId}`, tokenB),
      inject("PATCH", `/v1/hosts/${hostId}`, tokenB, { alias: "stolen" }),
      inject("POST", `/v1/hosts/${hostId}/endpoint-challenge`, tokenB),
      inject("POST", `/v1/hosts/${hostId}/enrollment-codes`, tokenB),
      inject("POST", `/v1/hosts/${hostId}/archive`, tokenB),
    ]);

    for (const response of attempts) {
      expect(response.statusCode).toBe(404);
    }

    const detail = await inject("GET", `/v1/hosts/${hostId}`, tokenA);
    expect(detail.json().data.alias).toBe("Private host");
  });

  it("rejects schemes, IP literals, single labels and invalid labels", async () => {
    const hostnames = [
      "https://example.com",
      "127.0.0.1",
      "localhost",
      "bad_host.example.com",
      "example.com:443",
    ];

    for (const hostname of hostnames) {
      const response = await inject(
        "POST",
        "/v1/hosts",
        tokenA,
        { alias: "Invalid host", hostname },
        idempotencyHeaders(),
      );
      expect(response.statusCode, hostname).toBe(422);
    }
  });

  it("rejects a duplicate active hostname for the same owner", async () => {
    await createHost(tokenA, "First", "duplicate.example.com");
    const second = await inject(
      "POST",
      "/v1/hosts",
      tokenA,
      { alias: "Second", hostname: "duplicate.example.com" },
      idempotencyHeaders(),
    );
    expect(second.statusCode).toBe(409);
  });

  it("replays an identical Idempotency-Key and rejects a changed body", async () => {
    const key = randomUUID();
    const first = await createHost(tokenA, "Idempotent host", "idempotent.example.com", key);
    const replay = await inject(
      "POST",
      "/v1/hosts",
      tokenA,
      { alias: "Idempotent host", hostname: "idempotent.example.com" },
      idempotencyHeaders(key),
    );
    expect(replay.statusCode).toBe(201);
    expect(replay.json().data.hostId).toBe(first.hostId);

    const changed = await inject(
      "POST",
      "/v1/hosts",
      tokenA,
      { alias: "Changed host", hostname: "idempotent.example.com" },
      idempotencyHeaders(key),
    );
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("rejects a missing Idempotency-Key", async () => {
    const response = await inject("POST", "/v1/hosts", tokenA, {
      alias: "No key",
      hostname: "no-key.example.com",
    });
    expect(response.statusCode).toBe(400);
  });

  it("issues a challenge, rejects a wrong TXT value and leaves the host pending", async () => {
    const { hostId } = await createHost(tokenA, "DNS host", "dns-wrong.example.com");
    const challenge = await inject("POST", `/v1/hosts/${hostId}/endpoint-challenge`, tokenA);
    expect(challenge.statusCode).toBe(201);
    const data = challenge.json().data as {
      challengeId: string;
      dnsRecordName: string;
      dnsRecordValue: string;
    };
    expect(data.dnsRecordName).toBe("_incident-witness.dns-wrong.example.com");
    expect(data.dnsRecordValue.startsWith("iw1=")).toBe(true);

    dns.txt.set(data.dnsRecordName, [["iw1=wrong-value"]]);
    dns.addresses.set("dns-wrong.example.com", [
      { address: PUBLIC_TEST_ADDRESS, family: 4 },
    ]);

    const verify = await inject("POST", `/v1/hosts/${hostId}/endpoint-verify`, tokenA, {
      challengeId: data.challengeId,
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().data.verified).toBe(false);
    expect(verify.json().data.reasonCode).toBe("DNS_TXT_MISMATCH");

    const detail = await inject("GET", `/v1/hosts/${hostId}`, tokenA);
    expect(detail.json().data.status).toBe("pending_endpoint");
  });

  it("rejects an expired challenge", async () => {
    const { hostId } = await createHost(tokenA, "Expired host", "expired.example.com");
    const challenge = await inject("POST", `/v1/hosts/${hostId}/endpoint-challenge`, tokenA);
    const challengeId = challenge.json().data.challengeId as string;

    await migrator.query(
      `update host_endpoint_challenges set expires_at = now() - interval '1 second' where id = $1`,
      [challengeId],
    );

    const verify = await inject("POST", `/v1/hosts/${hostId}/endpoint-verify`, tokenA, {
      challengeId,
    });
    expect(verify.statusCode).toBe(409);
    expect(verify.json().error.code).toBe("ENDPOINT_CHALLENGE_EXPIRED");
  });

  it("rejects a hostname resolving to a private address", async () => {
    const { hostId } = await createHost(tokenA, "Private target", "private-target.example.com");
    const challenge = await inject("POST", `/v1/hosts/${hostId}/endpoint-challenge`, tokenA);
    const data = challenge.json().data as {
      challengeId: string;
      dnsRecordName: string;
      dnsRecordValue: string;
    };
    dns.txt.set(data.dnsRecordName, [[data.dnsRecordValue]]);
    dns.addresses.set("private-target.example.com", [{ address: "10.0.0.5", family: 4 }]);

    const verify = await inject("POST", `/v1/hosts/${hostId}/endpoint-verify`, tokenA, {
      challengeId: data.challengeId,
    });
    expect(verify.statusCode).toBe(422);
    expect(verify.json().error.code).toBe("ENDPOINT_UNSAFE_TARGET");
    expect(endpointChecker.calls).toHaveLength(0);
  });

  it("verifies the exact TXT value and the fixed HTTPS health response", async () => {
    const { hostId } = await createVerifiedHost(tokenA, "Verified host", "verified.example.com");
    const detail = await inject("GET", `/v1/hosts/${hostId}`, tokenA);
    expect(detail.json().data.status).toBe("pending_enrollment");
    expect(detail.json().data.endpointVerifiedAt).toBeTruthy();
    expect(endpointChecker.calls[0]).toMatchObject({
      hostname: "verified.example.com",
      address: PUBLIC_TEST_ADDRESS,
    });
  });

  it("requires endpoint verification before issuing an enrollment code and revokes older codes", async () => {
    const { hostId } = await createHost(tokenA, "Enrollment host", "enrollment-code.example.com");
    const early = await inject("POST", `/v1/hosts/${hostId}/enrollment-codes`, tokenA);
    expect(early.statusCode).toBe(409);

    const challenge = await inject("POST", `/v1/hosts/${hostId}/endpoint-challenge`, tokenA);
    const data = challenge.json().data as {
      challengeId: string;
      dnsRecordName: string;
      dnsRecordValue: string;
    };
    dns.txt.set(data.dnsRecordName, [[data.dnsRecordValue]]);
    dns.addresses.set("enrollment-code.example.com", [
      { address: PUBLIC_TEST_ADDRESS, family: 4 },
    ]);
    await inject("POST", `/v1/hosts/${hostId}/endpoint-verify`, tokenA, {
      challengeId: data.challengeId,
    });

    const first = await inject("POST", `/v1/hosts/${hostId}/enrollment-codes`, tokenA);
    expect(first.statusCode).toBe(201);
    const firstCode = first.json().data.enrollmentCode as string;

    const second = await inject("POST", `/v1/hosts/${hostId}/enrollment-codes`, tokenA);
    expect(second.statusCode).toBe(201);
    const secondCode = second.json().data.enrollmentCode as string;

    const pair = generateKeyPairSync("ed25519");
    const enrolled = await inject("POST", "/v1/agent/enroll", null, {
      enrollmentCode: secondCode,
      publicKey: publicKeyBase64Url(pair.publicKey),
      agentVersion: "0.1.0-test",
      requestId: randomUUID(),
    });
    expect(enrolled.statusCode).toBe(201);

    const oldCode = await inject("POST", "/v1/agent/enroll", null, {
      enrollmentCode: firstCode,
      publicKey: publicKeyBase64Url(generateKeyPairSync("ed25519").publicKey),
      agentVersion: "0.1.0-test",
      requestId: randomUUID(),
    });
    expect(oldCode.statusCode).toBe(401);
  });

  it("blocks archive while an incident is active and succeeds afterwards", async () => {
    const host = await activateHost(tokenA, "Archive host", "archive.example.com");
    const incident = await createIncident(tokenA, host.hostId);
    expect(incident.statusCode).toBe(201);
    const incidentId = incident.json().data.incidentId as string;

    const blocked = await inject("POST", `/v1/hosts/${host.hostId}/archive`, tokenA);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("HOST_HAS_ACTIVE_INCIDENT");

    await inject("POST", `/v1/incidents/${incidentId}/end`, tokenA);
    await migrator.query(
      `update incidents set status = 'cancelled', cancel_reason = 'NO_EVIDENCE' where id = $1`,
      [incidentId],
    );
    const archived = await inject("POST", `/v1/hosts/${host.hostId}/archive`, tokenA);
    expect(archived.statusCode).toBe(200);
    expect(archived.json().data.status).toBe("archived");
    expect(archived.json().data.revokedCredentials).toBeGreaterThan(0);

    const detail = await inject("GET", `/v1/hosts/${host.hostId}`, tokenA);
    expect(detail.json().data.status).toBe("archived");
  });

  it("keeps owner B's host list empty", async () => {
    await createHost(tokenA, "Owner A host", "owner-a.example.com");
    const list = await inject("GET", "/v1/hosts", tokenB);
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(0);
  });

  it("records audit rows without secrets", async () => {
    const { hostId } = await createHost(tokenA, "Audit host", "audit.example.com");
    const audit = await migrator.query<{ action: string; metadata: unknown }>(
      `select action, metadata from audit_events where resource_id = $1 and owner_user_id = $2`,
      [hostId, userA],
    );
    expect(audit.rows.some((row) => row.action === "host.created")).toBe(true);
    expect(JSON.stringify(audit.rows)).not.toContain("idempotency");
  });
});
