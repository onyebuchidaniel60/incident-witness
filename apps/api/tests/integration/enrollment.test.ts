import { generateKeyPairSync, randomUUID } from "node:crypto";

import {
  verifySourceKeyCertificate,
  type SignedSourceKeyCertificate,
} from "@incident-witness/protocol/node";
import { describe, expect, it } from "vitest";

import { activateHost, createHost, createVerifiedHost, sendPresence } from "./helpers.js";
import {
  inject,
  migrator,
  platformPublicKey,
  presenceBody,
  publicKeyBase64Url,
  registerIntegrationHooks,
  tokenA,
  tokenB,
} from "./harness.js";

registerIntegrationHooks();

describe("host enrollment and operational presence", () => {
  it("enrolls a host, stores only hashes, and issues a verifiable certificate", async () => {
    const { hostId } = await createVerifiedHost(tokenA, "Enroll host", "enroll.example.com");
    const codeResponse = await inject("POST", `/v1/hosts/${hostId}/enrollment-codes`, tokenA);
    expect(codeResponse.statusCode).toBe(201);
    const code = codeResponse.json().data.enrollmentCode as string;

    const pair = generateKeyPairSync("ed25519");
    const response = await inject("POST", "/v1/agent/enroll", null, {
      enrollmentCode: code,
      publicKey: publicKeyBase64Url(pair.publicKey),
      agentVersion: "0.1.0-test",
      requestId: randomUUID(),
    });
    expect(response.statusCode).toBe(201);
    const data = response.json().data as {
      sourceKeyId: string;
      deviceCredential: string;
      certificate: SignedSourceKeyCertificate["certificate"];
      certificateSignature: string;
    };

    const certificate: SignedSourceKeyCertificate = {
      certificate: data.certificate,
      signature: data.certificateSignature,
      signature_algorithm: "Ed25519",
    };
    expect(await verifySourceKeyCertificate(certificate, platformPublicKey)).toBe(true);
    expect(data.certificate.source_key_id).toBe(data.sourceKeyId);
    expect(data.certificate.source_type).toBe("host_agent");
    if (data.certificate.source_type !== "host_agent") {
      throw new Error("expected host certificate");
    }
    expect(data.certificate.host_id).toBe(hostId);

    const host = await migrator.query<{ status: string; agent_version: string }>(
      `select status, agent_version from hosts where id = $1`,
      [hostId],
    );
    expect(host.rows[0]).toEqual({ status: "active", agent_version: "0.1.0-test" });

    const credential = await migrator.query<{ credential_hash: Buffer }>(
      `select credential_hash from source_credentials where source_key_id = $1`,
      [data.sourceKeyId],
    );
    expect(credential.rows[0]!.credential_hash.toString("utf8")).not.toBe(data.deviceCredential);
    expect(credential.rows[0]!.credential_hash.length).toBe(32);

    const token = await migrator.query<{ token_hash: Buffer }>(
      `select token_hash from enrollment_tokens where redeemed_key_id = $1`,
      [data.sourceKeyId],
    );
    expect(token.rows[0]!.token_hash.toString("utf8")).not.toBe(code);
  });

  it("allows exactly one of two concurrent enrollments with the same code", async () => {
    const { hostId } = await createVerifiedHost(
      tokenA,
      "Race host",
      "enroll-race.example.com",
    );
    const codeResponse = await inject("POST", `/v1/hosts/${hostId}/enrollment-codes`, tokenA);
    const code = codeResponse.json().data.enrollmentCode as string;

    const pairOne = generateKeyPairSync("ed25519");
    const pairTwo = generateKeyPairSync("ed25519");
    const responses = await Promise.all([
      inject("POST", "/v1/agent/enroll", null, {
        enrollmentCode: code,
        publicKey: publicKeyBase64Url(pairOne.publicKey),
        agentVersion: "0.1.0-test",
        requestId: randomUUID(),
      }),
      inject("POST", "/v1/agent/enroll", null, {
        enrollmentCode: code,
        publicKey: publicKeyBase64Url(pairTwo.publicKey),
        agentVersion: "0.1.0-test",
        requestId: randomUUID(),
      }),
    ]);

    expect(responses.filter((response) => response.statusCode === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 409)).toHaveLength(1);
  });

  it("rejects an expired enrollment code", async () => {
    const { hostId } = await createVerifiedHost(
      tokenA,
      "Expired code host",
      "expired-code.example.com",
    );
    const codeResponse = await inject("POST", `/v1/hosts/${hostId}/enrollment-codes`, tokenA);
    const code = codeResponse.json().data.enrollmentCode as string;
    await migrator.query(
      `update enrollment_tokens set expires_at = now() - interval '1 second' where host_id = $1`,
      [hostId],
    );

    const response = await inject("POST", "/v1/agent/enroll", null, {
      enrollmentCode: code,
      publicKey: publicKeyBase64Url(generateKeyPairSync("ed25519").publicKey),
      agentVersion: "0.1.0-test",
      requestId: randomUUID(),
    });
    expect(response.statusCode).toBe(409);
  });

  it("accepts fresh presence, reports exact retries, and rejects replay or stale timestamps", async () => {
    const host = await activateHost(tokenA, "Presence host", "presence.example.com");

    const fixedObservedAt = new Date().toISOString();
    const body = presenceBody({
      hostId: host.hostId,
      sequence: 2,
      observedAt: fixedObservedAt,
      privateKey: host.privateKey,
    });

    const first = await inject("POST", "/v1/agent/heartbeat", null, body, {
      authorization: `Bearer ${host.credential}`,
      "content-type": "application/vnd.incident-witness.presence+json",
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data).toMatchObject({ accepted: true, duplicate: false });

    const retry = await inject("POST", "/v1/agent/heartbeat", null, body, {
      authorization: `Bearer ${host.credential}`,
      "content-type": "application/vnd.incident-witness.presence+json",
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json().data).toMatchObject({ accepted: true, duplicate: true });

    const replay = await sendPresence({
      hostId: host.hostId,
      credential: host.credential,
      privateKey: host.privateKey,
      sequence: 1,
    });
    expect(replay.statusCode).toBe(409);
    expect(replay.json().error.code).toBe("PRESENCE_REPLAY");

    const future = await sendPresence({
      hostId: host.hostId,
      credential: host.credential,
      privateKey: host.privateKey,
      sequence: 3,
      observedAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(future.statusCode).toBe(422);
    expect(future.json().error.code).toBe("PRESENCE_STALE");

    const stale = await sendPresence({
      hostId: host.hostId,
      credential: host.credential,
      privateKey: host.privateKey,
      sequence: 4,
      observedAt: new Date(Date.now() - 120_000).toISOString(),
    });
    expect(stale.statusCode).toBe(422);
  });

  it("rejects presence for a different host and after key revocation", async () => {
    const host = await activateHost(tokenA, "Bound host", "bound.example.com");
    const other = await createHost(tokenA, "Other host", "bound-other.example.com");

    const wrongHost = await sendPresence({
      hostId: other.hostId,
      credential: host.credential,
      privateKey: host.privateKey,
      sequence: 2,
    });
    expect(wrongHost.statusCode).toBe(403);

    const revoke = await inject(
      "POST",
      `/v1/hosts/${host.hostId}/keys/${host.sourceKeyId}/revoke`,
      tokenA,
      { reasonCode: "USER_REQUEST" },
    );
    expect(revoke.statusCode).toBe(200);

    const afterRevoke = await sendPresence({
      hostId: host.hostId,
      credential: host.credential,
      privateKey: host.privateKey,
      sequence: 3,
    });
    expect([401, 403]).toContain(afterRevoke.statusCode);
  });

  it("does not expose a host credential to another owner", async () => {
    const host = await activateHost(tokenA, "Secret host", "secret-presence.example.com");
    const response = await sendPresence({
      hostId: host.hostId,
      credential: host.credential,
      privateKey: host.privateKey,
      sequence: 2,
    });
    expect(response.statusCode).toBe(200);

    const otherOwner = await inject("GET", `/v1/hosts/${host.hostId}`, tokenB);
    expect(otherOwner.statusCode).toBe(404);
  });
});
