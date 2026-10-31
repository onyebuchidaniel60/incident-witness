import { generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";

import { expect } from "vitest";

import {
  dns,
  idempotencyHeaders,
  inject,
  presenceBody,
  publicKeyBase64Url,
  tokenA,
} from "./harness.js";

export const PUBLIC_TEST_ADDRESS = "93.184.216.34";

export async function createHost(
  token: string,
  alias: string,
  hostname: string,
  idempotencyKey = randomUUID(),
) {
  const response = await inject(
    "POST",
    "/v1/hosts",
    token,
    { alias, hostname },
    idempotencyHeaders(idempotencyKey),
  );
  expect(response.statusCode).toBe(201);
  return {
    response,
    hostId: response.json().data.hostId as string,
  };
}

export async function createVerifiedHost(
  token: string,
  alias: string,
  hostname: string,
) {
  const { hostId } = await createHost(token, alias, hostname);
  const challenge = await inject("POST", `/v1/hosts/${hostId}/endpoint-challenge`, token);
  expect(challenge.statusCode).toBe(201);
  const challengeData = challenge.json().data as {
    challengeId: string;
    dnsRecordName: string;
    dnsRecordValue: string;
  };

  dns.txt.set(challengeData.dnsRecordName, [[challengeData.dnsRecordValue]]);
  dns.addresses.set(hostname, [{ address: PUBLIC_TEST_ADDRESS, family: 4 }]);

  const verify = await inject("POST", `/v1/hosts/${hostId}/endpoint-verify`, token, {
    challengeId: challengeData.challengeId,
  });
  expect(verify.statusCode).toBe(200);
  expect(verify.json().data.verified).toBe(true);

  return { hostId, challengeId: challengeData.challengeId };
}

export async function enrollHost(token: string, hostId: string) {
  const codeResponse = await inject("POST", `/v1/hosts/${hostId}/enrollment-codes`, token);
  expect(codeResponse.statusCode).toBe(201);
  const enrollmentCode = codeResponse.json().data.enrollmentCode as string;

  const pair = generateKeyPairSync("ed25519");
  const publicKey = publicKeyBase64Url(pair.publicKey);
  const enroll = await inject("POST", "/v1/agent/enroll", null, {
    enrollmentCode,
    publicKey,
    agentVersion: "0.1.0-test",
    requestId: randomUUID(),
  });
  expect(enroll.statusCode).toBe(201);
  const data = enroll.json().data as {
    sourceKeyId: string;
    deviceCredential: string;
    certificate: unknown;
    certificateSignature: string;
  };

  return {
    sourceKeyId: data.sourceKeyId,
    credential: data.deviceCredential,
    certificate: data.certificate,
    certificateSignature: data.certificateSignature,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
  };
}

export async function sendPresence(input: {
  hostId: string;
  credential: string;
  privateKey: KeyObject;
  sequence: number;
  observedAt?: string;
  signatureOverride?: string;
}) {
  return inject("POST", "/v1/agent/heartbeat", null, presenceBody(input), {
    authorization: `Bearer ${input.credential}`,
    "content-type": "application/vnd.incident-witness.presence+json",
  });
}

export async function activateHost(token: string, alias: string, hostname: string) {
  const { hostId } = await createVerifiedHost(token, alias, hostname);
  const enrolled = await enrollHost(token, hostId);
  const presence = await sendPresence({
    hostId,
    credential: enrolled.credential,
    privateKey: enrolled.privateKey,
    sequence: 1,
  });
  expect(presence.statusCode).toBe(200);
  expect(presence.json().data.accepted).toBe(true);

  return {
    hostId,
    ...enrolled,
  };
}

export async function createIncident(
  token: string,
  hostId: string,
  overrides: Partial<{
    title: string;
    durationMinutes: number;
    workloadRef: string;
    demoMode: boolean;
    idempotencyKey: string;
  }> = {},
) {
  const response = await inject(
    "POST",
    "/v1/incidents",
    token,
    {
      hostId,
      title: overrides.title ?? "Integration evidence session",
      durationMinutes: overrides.durationMinutes ?? 30,
      ...(overrides.workloadRef ? { workloadRef: overrides.workloadRef } : {}),
      ...(overrides.demoMode !== undefined ? { demoMode: overrides.demoMode } : {}),
    },
    idempotencyHeaders(overrides.idempotencyKey ?? randomUUID()),
  );
  return response;
}

export async function issueRenterInvitation(token: string, incidentId: string) {
  return inject("POST", `/v1/incidents/${incidentId}/renter-invitations`, token);
}

export async function enrollRenter(invitationToken: string) {
  const pair = generateKeyPairSync("ed25519");
  const response = await inject("POST", "/v1/renter/enroll", null, {
    invitationToken,
    publicKey: publicKeyBase64Url(pair.publicKey),
    requestId: randomUUID(),
    sdkVersion: "0.1.0-test",
  });
  return {
    response,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
  };
}

export { tokenA };
