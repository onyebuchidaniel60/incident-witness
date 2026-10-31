import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  RenterApiTransport,
  RenterEnrollmentRequest,
  RenterEnrollmentResponse,
  RenterEventResult,
} from "../src/api.js";
import type { EndpointChecker, EndpointObservation } from "../src/endpoint.js";

export const INCIDENT_ID = "11111111-1111-4111-8111-111111111111";
export const SOURCE_KEY_ID = "22222222-2222-4222-8222-222222222222";
export const CREDENTIAL = "r".repeat(43);
export const SESSION_ENDS_AT = "2026-10-31T12:30:00.000Z";

export function makeTempDir(prefix = "iw-renter-"): string {
  const base = existsSync("/tmp/opencode") ? "/tmp/opencode" : tmpdir();
  return mkdtempSync(join(base, prefix));
}

export function removeTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

export function certificateFor(publicKey: string) {
  return {
    certificate_version: "1.0",
    source_key_id: SOURCE_KEY_ID,
    source_type: "renter_client",
    public_key: publicKey,
    fingerprint: "test-fingerprint",
    incident_id: INCIDENT_ID,
    issued_at: "2026-10-31T12:00:00.000Z",
    protocol_version: "1.0",
  };
}

export function enrollmentResponse(publicKey: string): RenterEnrollmentResponse {
  return {
    sourceKeyId: SOURCE_KEY_ID,
    certificate: certificateFor(publicKey),
    certificateSignature: "test-certificate-signature",
    ingestionCredential: CREDENTIAL,
    incidentId: INCIDENT_ID,
    sessionEndsAt: SESSION_ENDS_AT,
    protocolVersion: "1.0",
  };
}

export class FakeRenterTransport implements RenterApiTransport {
  readonly enrollRequests: RenterEnrollmentRequest[] = [];
  readonly uploaded: Array<{ raw: string; credential: string }> = [];
  eventResult: RenterEventResult = { kind: "accepted", status: 202 };
  enrollError: Error | null = null;

  async enroll(request: RenterEnrollmentRequest): Promise<RenterEnrollmentResponse> {
    this.enrollRequests.push(request);
    if (this.enrollError) throw this.enrollError;
    return enrollmentResponse(request.publicKey);
  }

  async postEvent(raw: string, credential: string): Promise<RenterEventResult> {
    this.uploaded.push({ raw, credential });
    return this.eventResult;
  }
}

export class FakeEndpointChecker implements EndpointChecker {
  result: EndpointObservation = { result: "reachable", latencyMs: 12 };
  calls = 0;

  async check(): Promise<EndpointObservation> {
    this.calls += 1;
    return this.result;
  }
}
