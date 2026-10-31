# Provider User Guide (MVP)

**Status:** Provider workflow guide for the implemented Phase 8 staging workspace.

## 1. Understand an evidence session

An evidence session is a time-bounded collection window. It must be started while the GPU host is available and before the workload/job period it is intended to observe. The MVP does not run an always-on incident recorder and cannot reconstruct observations from before session creation. It is not a claim that an incident has already happened. During the window, three source categories may contribute:

- Host agent: limited provider-side observations.
- Renter SDK: workload/client-side observations.
- Platform probe: a network reachability check run by Incident Witness infrastructure.

The platform probe is separate from the host agent but operated by Incident Witness. It is not an independent outside company. Evidence may be incomplete. A missing source is not a normal reading.

## 2. Add a host

1. Open Hosts and create an alias.
2. Enter a public hostname you control.
3. Publish the one-time TXT record shown by the dashboard.
4. Ensure the fixed HTTPS health route is available on port 443 at `/.well-known/incident-witness/health`.
5. The expected response is HTTP 200, `text/plain`, exact body `incident-witness-health-v1\n`; redirects are not accepted.
6. Verify the endpoint. Private/reserved/loopback/metadata destinations are rejected.

The DNS challenge proves control of the domain record. The endpoint configuration is an operator assertion linking that hostname to the intended host service; it is not proof of the physical GPU hardware identity.

## 3. Enroll the host agent

1. Issue a one-time enrollment code (10-minute expiry).
2. Install only a future official signed agent release; do not run a guessed command or unverified binary.
3. Run enrollment locally. The agent generates its signing key on the host.
4. Protect local private key and device credential files; never share them.
5. Wait for the first valid signed heartbeat in the dashboard.

Optional GPU/UPS telemetry appears only when available. The absence of a supported collector is clearly shown as unavailable.

## 4. Start an evidence session

1. Choose an active host with fresh heartbeat and verified endpoint.
2. Set a short title and optional opaque workload reference.
3. Choose a capture duration from 2 to 240 minutes (default 30).
4. Start the session before the workload/job begins, while the host is available. Incidents before the session starts are not captured retroactively.
5. Share a single-use renter invite only with the relevant renter. The token is in a URL fragment and expires after 15 minutes.
6. Review source status and timeline. It may show missing observations or probe-service gaps.

Only one active session per host is allowed; the provider account can have at most three active sessions.

## 5. End and seal

When the capture window ends, the session enters `awaiting_finalize`. The host agent can sync locally queued evidence for up to 24 hours after capture. The provider can seal earlier after verifying expected sources have synced. The system auto-seals at the grace deadline.

Sealing is irreversible. It creates an immutable signed bundle. If no usable observations exist, the session cannot be sealed as a misleading empty record. The provider may cancel only a session with no accepted observations.

## 6. Interpret the result

Assessment labels describe evidence patterns:

- Power-related: evidence pattern consistent with power interruption.
- External reachability loss: an endpoint could not be reached; this does not name the exact ISP/upstream cause.
- GPU/driver anomaly: not classified in v1; such cases remain `UNKNOWN`.
- Host/workload exit: an exit signal was observed; intent is not inferred.
- Unknown: evidence insufficient, contradictory or unsupported.

Evidence grades are completeness labels under a particular rule version, not probabilities. A high grade does not prove the cause.

## 7. Download and share

The bundle may include hostname, host alias, GPU/UPS telemetry, timestamps and source metadata. Review the local file before sharing. The dashboard does not publish bundles publicly. Once you share/download a copy, Incident Witness cannot recall copies held by others.

## 8. Verify

Open the public verifier and choose the bundle file. The web verifier is designed to process the file locally without upload. It checks schema, digest, signatures, key trust and internal consistency. A successful result verifies integrity/signatures relative to the verifier's trusted key list, not sensor truth or marketplace acceptance.
