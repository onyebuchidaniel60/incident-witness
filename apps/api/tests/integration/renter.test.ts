import { randomUUID } from "node:crypto";

import {
  verifySourceKeyCertificate,
  type SignedSourceKeyCertificate,
} from "@incident-witness/protocol/node";
import { describe, expect, it } from "vitest";

import {
  activateHost,
  createIncident,
  enrollRenter,
  issueRenterInvitation,
} from "./helpers.js";
import {
  inject,
  migrator,
  platformPublicKey,
  registerIntegrationHooks,
  tokenA,
  tokenB,
} from "./harness.js";

registerIntegrationHooks();

async function activeIncident() {
  const host = await activateHost(tokenA, "Renter host", `renter-${randomUUID()}.example.com`);
  const created = await createIncident(tokenA, host.hostId);
  expect(created.statusCode).toBe(201);
  return {
    host,
    incidentId: created.json().data.incidentId as string,
  };
}

describe("renter invitations and scoped enrollment", () => {
  it("issues a 15-minute one-time invitation and stores only its hash", async () => {
    const { incidentId } = await activeIncident();
    const response = await issueRenterInvitation(tokenA, incidentId);
    expect(response.statusCode).toBe(201);
    const data = response.json().data as {
      invitationToken: string;
      expiresAt: string;
      joinUrl: string;
      oneTime: boolean;
    };
    expect(data.oneTime).toBe(true);
    expect(data.joinUrl).toContain(`/join#${data.invitationToken}`);
    const ttl = (Date.parse(data.expiresAt) - Date.now()) / 60_000;
    expect(ttl).toBeGreaterThan(14);
    expect(ttl).toBeLessThanOrEqual(15);

    const stored = await migrator.query<{ token_hash: Buffer }>(
      `select token_hash from renter_invitations where incident_id = $1`,
      [incidentId],
    );
    expect(stored.rows[0]!.token_hash.toString("utf8")).not.toBe(data.invitationToken);
    expect(stored.rows[0]!.token_hash.length).toBe(32);
  });

  it("enrolls a renter key scoped to one incident with a verifiable certificate", async () => {
    const { incidentId } = await activeIncident();
    const invitation = await issueRenterInvitation(tokenA, incidentId);
    const token = invitation.json().data.invitationToken as string;
    const enrolled = await enrollRenter(token);
    expect(enrolled.response.statusCode).toBe(201);
    const data = enrolled.response.json().data as {
      sourceKeyId: string;
      certificate: SignedSourceKeyCertificate["certificate"];
      certificateSignature: string;
      ingestionCredential: string;
      incidentId: string;
      sessionEndsAt: string;
    };
    expect(data.incidentId).toBe(incidentId);

    const certificate: SignedSourceKeyCertificate = {
      certificate: data.certificate,
      signature: data.certificateSignature,
      signature_algorithm: "Ed25519",
    };
    expect(await verifySourceKeyCertificate(certificate, platformPublicKey)).toBe(true);
    expect(data.certificate.source_type).toBe("renter_client");
    if (data.certificate.source_type !== "renter_client") {
      throw new Error("expected renter certificate");
    }
    expect(data.certificate.incident_id).toBe(incidentId);

    const key = await migrator.query<{
      source_type: string;
      incident_id: string;
      host_id: string | null;
    }>(
      `select source_type, incident_id, host_id from witness_keys where id = $1`,
      [data.sourceKeyId],
    );
    expect(key.rows[0]).toEqual({
      source_type: "renter_client",
      incident_id: incidentId,
      host_id: null,
    });

    const credential = await migrator.query<{ credential_hash: Buffer; expires_at: Date }>(
      `select credential_hash, expires_at from source_credentials where source_key_id = $1`,
      [data.sourceKeyId],
    );
    expect(credential.rows[0]!.credential_hash.toString("utf8")).not.toBe(
      data.ingestionCredential,
    );
    const incident = await migrator.query<{ ingestion_deadline: Date }>(
      `select ingestion_deadline from incidents where id = $1`,
      [incidentId],
    );
    expect(credential.rows[0]!.expires_at.toISOString()).toBe(
      incident.rows[0]!.ingestion_deadline.toISOString(),
    );
  });

  it("allows exactly one of two concurrent renter redemptions", async () => {
    const { incidentId } = await activeIncident();
    const invitation = await issueRenterInvitation(tokenA, incidentId);
    const token = invitation.json().data.invitationToken as string;

    const responses = await Promise.all([enrollRenter(token), enrollRenter(token)]);
    expect(
      responses.filter((entry) => entry.response.statusCode === 201),
    ).toHaveLength(1);
    expect(
      responses.filter((entry) => entry.response.statusCode === 409),
    ).toHaveLength(1);
  });

  it("rejects an expired invitation", async () => {
    const { incidentId } = await activeIncident();
    const invitation = await issueRenterInvitation(tokenA, incidentId);
    const token = invitation.json().data.invitationToken as string;
    await migrator.query(
      `update renter_invitations set expires_at = now() - interval '1 second' where incident_id = $1`,
      [incidentId],
    );

    const response = await enrollRenter(token);
    expect(response.response.statusCode).toBe(409);
  });

  it("revokes an older invitation when a new one is issued", async () => {
    const { incidentId } = await activeIncident();
    const first = await issueRenterInvitation(tokenA, incidentId);
    const firstToken = first.json().data.invitationToken as string;
    const second = await issueRenterInvitation(tokenA, incidentId);
    expect(second.statusCode).toBe(201);

    const old = await enrollRenter(firstToken);
    expect(old.response.statusCode).toBe(401);

    const current = await enrollRenter(second.json().data.invitationToken as string);
    expect(current.response.statusCode).toBe(201);
  });

  it("refuses a second renter key for the same incident", async () => {
    const { incidentId } = await activeIncident();
    const first = await issueRenterInvitation(tokenA, incidentId);
    const enrolled = await enrollRenter(first.json().data.invitationToken as string);
    expect(enrolled.response.statusCode).toBe(201);

    const second = await issueRenterInvitation(tokenA, incidentId);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("RENTER_ALREADY_ENROLLED");
  });

  it("revokes only incident-scoped renter keys through the incident route", async () => {
    const { incidentId } = await activeIncident();
    const invitation = await issueRenterInvitation(tokenA, incidentId);
    const enrolled = await enrollRenter(invitation.json().data.invitationToken as string);
    const sourceKeyId = enrolled.response.json().data.sourceKeyId as string;

    const wrongRoute = await inject(
      "POST",
      `/v1/hosts/${randomUUID()}/keys/${sourceKeyId}/revoke`,
      tokenA,
      { reasonCode: "USER_REQUEST" },
    );
    expect(wrongRoute.statusCode).toBe(404);

    const revoke = await inject(
      "POST",
      `/v1/incidents/${incidentId}/keys/${sourceKeyId}/revoke`,
      tokenA,
      { reasonCode: "KEY_COMPROMISE" },
    );
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().data.status).toBe("revoked");
    expect(revoke.json().data.revokedCredentials).toBe(1);

    const key = await migrator.query<{ status: string }>(
      `select status from witness_keys where id = $1`,
      [sourceKeyId],
    );
    expect(key.rows[0]!.status).toBe("revoked");

    const credential = await migrator.query<{ revoked_at: Date | null }>(
      `select revoked_at from source_credentials where source_key_id = $1`,
      [sourceKeyId],
    );
    expect(credential.rows[0]!.revoked_at).toBeTruthy();
  });

  it("returns 404 for another owner's invitation route", async () => {
    const { incidentId } = await activeIncident();
    const response = await issueRenterInvitation(tokenB, incidentId);
    expect(response.statusCode).toBe(404);
  });
});
