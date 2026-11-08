# Incident Witness — Product Specification

**Status:** Blueprint baseline — implementation has not started  
**Product name:** Incident Witness  
**Positioning:** Portable incident-evidence protocol for decentralized compute  
**Tagline:** When infrastructure fails, evidence speaks.  
**Specification version:** 1.0  
**Decision authority:** Product operator  
**Implementation authority:** Coding agent, limited by `AGENTS.md` and the approved phase  

---

## 1. Product definition

### 1.1 One-line description

Incident Witness collects signed observations from a GPU host, the renter's workload client, and a platform-operated external network probe; correlates those observations into a chronological incident record; and exports a portable evidence bundle whose integrity and signatures can be checked independently.

### 1.2 Problem

When a rented GPU host disappears, a compute marketplace can observe the interruption but may not have enough evidence to distinguish among a power transition, external reachability loss, host/agent failure, GPU/driver anomaly, intentional shutdown, or an unknown cause. This can leave providers, renters, and marketplace operators with incomplete and potentially conflicting accounts of what occurred.

The MVP collects evidence only while a bounded evidence session is active; it cannot reconstruct an outage that began before session creation. Providers start a session before the job/workload interval they want to observe. The product addresses the evidence gap. It does **not** decide whether a marketplace should excuse downtime, compensate a renter, change a reliability score, or reverse a penalty. A confirmed external cause can still represent a real service interruption.

### 1.3 Current alternatives and workarounds

- Marketplace-level availability, disconnect and reliability records.
- Provider monitoring tools, host dashboards, system logs and manual screenshots.
- UPS management tools such as Network UPS Tools (NUT), GPU telemetry such as `nvidia-smi`, and monitoring/visualization systems such as Grafana.
- Renter-side job logs, client retries and support tickets.
- External uptime monitors and manual network tests.
- Ad hoc communication among provider, renter and marketplace support.

The research found adjacent products and capabilities, including Vast.ai reliability tracking, Auditmos fleet/power operations, VerifyCompute hardware/telemetry verification, NVIDIA Attribution, NUT, Grafana, Meshive and NiceGPU. These are adjacent precedents, not proof that Incident Witness is globally novel or that the proposed workflow is commercially accepted. See `docs/RESEARCH_AND_ASSUMPTIONS.md`.

### 1.4 Target users

1. **GPU provider/operator:** operates one or more Linux GPU hosts and wants a more complete evidence record when a host becomes unreachable.
2. **GPU renter/developer:** runs a workload on a provider's host and can contribute limited, workload-side observations.
3. **Marketplace/support reviewer (future consumer):** may review an exported evidence bundle. The MVP has no marketplace integration or reviewer account.

### 1.5 Core value proposition

Give the provider and renter a common, time-ordered record of what each participating observation source reported, distinguish observed facts from inferred explanations, and let a recipient detect post-capture changes to the exported evidence.

### 1.6 Differentiator hypothesis

A provider-neutral format correlating provider-side telemetry, renter-side observations and an external reachability probe, with explicit source identity, timestamps, evidence gaps, rule version and confidence/evidence-quality grade. The mechanism is a hypothesis to demonstrate—not a claim of validated market demand or global novelty.

### 1.7 Primary use case

The MVP collects only while a bounded evidence session is active. The provider starts the session before the renter workload/job window it is intended to observe; events that happened before session creation cannot be reconstructed retroactively. There is no always-on incident-triggered recorder in v1.

A provider has a Linux GPU host serving a renter workload. Before or during the relevant operating window, the provider starts an evidence session and invites the renter's client. Incident Witness records host heartbeats and available UPS/GPU/system signals, renter-client observations and external endpoint probes. When the session ends, the provider allows the evidence to finish syncing and seals it. Incident Witness exports a signed JSON bundle. A recipient can verify the signatures and integrity using the web verifier or CLI without trusting the live dashboard.

### 1.8 Secondary use cases

- Investigate an unexplained endpoint/reachability interruption even if no GPU-specific failure is observed.
- Compare host-side and renter-side observations where their timelines differ.
- Preserve a bounded operational evidence record for internal provider support and post-incident review.

### 1.9 Product boundaries — what it does not do

Incident Witness does not:

- Operate a GPU marketplace, scheduler, inference gateway, compute broker or job orchestrator.
- Guarantee that an observed cause is the physical root cause.
- Prove that a host-controlled sensor, operating system or GPU driver is honest or uncompromised.
- Automatically excuse downtime, calculate financial damages, adjudicate disputes, change reliability ratings or impose penalties.
- Automatically submit evidence to Vast.ai, RunPod, Clore, Salad, Nosana or another marketplace.
- Collect arbitrary system logs, renter prompts, model inputs, model outputs, customer datasets, environment variables or credentials.
- Run arbitrary shell commands or accept user-provided probe URLs, ports, paths or HTTP methods.
- Provide a blockchain, token, payment, escrow, AI-classification or reputation system.
- Reconstruct pre-session incidents or continuously monitor all hosts when no evidence session is active.
- Claim a platform-operated probe is an independent third-party organisation.
- Claim that a cryptographic signature proves the truth of the signed observation.

---

## 2. MVP scope

### 2.1 MUST HAVE

1. Email one-time-password authentication for provider accounts.
2. Provider-owned host registration and lifecycle management.
3. DNS TXT challenge to prove control of a public hostname before probing it. The fixed health route is `GET https://<hostname>/.well-known/incident-witness/health`, HTTP 200, `text/plain`, exact body `incident-witness-health-v1\n`, no redirects. The provider's ingress must route it to the intended host service; this is a configuration assertion, not hardware identity proof.
4. Linux x86_64 host agent with local Ed25519 key generation, signed observations, bounded telemetry and offline event spool.
5. One-time host-agent enrollment code and revocable host credential.
6. Bounded evidence-session creation, end/finalize and seal lifecycle.
7. One-time renter invitation; a TypeScript renter SDK generates an incident-scoped key and sends signed observations. A session can be marked `demo_mode` only where the operator has enabled demos; synthetic events must be individually marked and the whole evidence record visibly labelled demo.
8. A separate platform-operated probe worker checking the fixed HTTPS health path from the probe service.
9. Append-only evidence-event ingestion with signature, key, sequence, schema, timestamp and incident-scope validation.
10. Deterministic correlation/rule engine with explicit `UNKNOWN` outcome and transparent evidence-quality grade.
11. Signed JSON evidence bundle with platform signature, source certificates, event data, rule version, missing-source/gap notices and verification instructions.
12. Offline-capable web verification and a Node CLI verification tool using the same protocol package.
13. Provider dashboard for hosts, sessions/incidents, timeline, source health, bundle download and key revocation.
14. Progressive functional UI, error/empty/loading/permission states, documentation, automated tests and staged deployment.

### 2.2 SHOULD HAVE (only after all MUST HAVE acceptance criteria)

- Optional NUT/UPS integration for a supported NUT `upsc` endpoint available locally to the agent.
- Real NVIDIA GPU summary via a fixed `nvidia-smi` query where the binary and device are available.
- A reproducible demo workload using a container and a real GPU where access is available.
- A clearly labelled synthetic-event generator for power-loss and reachability-loss demonstrations.
- Operator-controlled export warning and a local bundle inspection view before download.

### 2.3 NICE TO HAVE

- Additional probe region or provider, only if genuinely operated and disclosed separately.
- Additional Linux distributions and GPU vendors.
- A machine-readable JSON Schema publication site and signed protocol release notes.
- Marketplace-specific export adapters after a marketplace confirms a supported intake workflow.

### 2.4 FUTURE

- Marketplace APIs and support-review integrations.
- Multiple independently operated probe organisations and geographic vantage points.
- Hardware-rooted attestation (TPM/TEE) and trusted sensor paths.
- Fleet management and organisation/team roles.
- Additional operating systems, providers, workload types and agent package distribution.
- Long-term monitoring, incident analytics and paid plans—only after user validation.

### 2.5 OUT OF SCOPE

- AI interpretation or LLM-generated root-cause findings.
- Blockchain, Arweave permanent storage, tokens or on-chain attestations.
- Payments, billing, payouts, credits or escrow.
- Automatic marketplace reputation updates, downtime exemptions or dispute resolution.
- Public incident directory/search or public-by-default bundles.
- Arbitrary endpoint monitoring, arbitrary ports, raw IP endpoints or user-supplied URL paths.
- Windows/macOS host agent in MVP.
- Arbitrary log ingestion, command execution, SSH access or remote host administration.
- Multi-cloud/GPU orchestration or job failover.

Scope changes require operator approval and a written change to this specification before implementation.

---

## 3. User roles and permissions

| Role | Authentication | Can do | Cannot do |
|---|---|---|---|
| Provider account owner | Supabase email OTP session | Manage own hosts; issue/enroll/revoke agents; verify endpoint; create/manage own sessions; issue renter invitation; view/download own bundles; sign out | Read or change another provider's data; alter sealed observations; alter source signatures |
| Host agent | Per-host bearer credential + Ed25519 key | Submit signed observations for its enrolled host and active session; sync its local spool | Read dashboards, list other hosts, create sessions, change host ownership, seal or delete records |
| Renter client | One-time invitation redemption + incident-scoped Ed25519 key | Submit signed observations only for the invited incident | Read provider account, other incidents, host private settings or arbitrary evidence |
| Platform probe worker | Private worker DB role + platform signing key | Execute due approved probe jobs; append platform-probe observations; update job lease/result | Access user login credentials, download bundles, mutate host/provider ownership or alter source observations |
| Public verifier | No account; local file processing | Verify bundle structure, source signatures, platform signature, digests and supported protocol version | Upload the bundle, access provider records, assert sensor truth or adjudicate cause |
| Platform operator | No ordinary product UI role in MVP | Observe service health via deployment/provider monitoring; use controlled break-glass procedures | Edit evidence or impersonate provider/renter; no routine content access |

The MVP is single-owner per account: no organisation/team sub-roles. Admin UI is not included.

---

## 4. User flows

### 4.1 Provider registration and login

- **Entry:** `/login`.
- **Preconditions:** user can receive email; Supabase Auth configured for the approved preview/production domains.
- **Action:** enter email and request OTP; enter code from email.
- **System:** issue rate-limited OTP request; Supabase validates code; browser receives secure session cookie; API verifies access JWT and maps `sub` to the account.
- **State:** Supabase user and minimal `profiles` row are created idempotently. No password is stored by Incident Witness.
- **Validation:** valid email; OTP unexpired and unused; login/request rate limit; redirect URL allow-listed.
- **Success:** authenticated `/dashboard`.
- **Failure:** invalid/expired code, rate limit, mail/auth provider down, or session cookie failure; show specific safe recovery copy.
- **Edge cases:** repeated signup/login, duplicate callback, multiple tabs, expired session, account deleted, malicious redirect parameter.
- **Permissions:** public login page; protected dashboard/API.
- **Exit:** provider dashboard or safe login retry.

### 4.2 Add host and verify endpoint ownership

- **Entry:** `/hosts/new`.
- **Preconditions:** provider authenticated; Linux x86_64 host under provider's control; public DNS hostname; host can serve the fixed health endpoint over HTTPS.
- **Action:** enter alias and hostname. System creates a random TXT challenge.
- **System:** store challenge hash and expiry; display exact TXT name/value. Provider adds record to DNS. Provider clicks Verify.
- **Validation:** hostname normalized and valid; challenge unexpired; TXT value matches exactly; no IP literals; hostname resolves publicly; no private/reserved IP target. DNS checks fail closed.
- **State:** host begins `pending_endpoint`; on verified challenge and TLS health check becomes `pending_enrollment`.
- **Success:** user receives host install/enrolment instructions and a short-lived, single-use enrollment code.
- **Failure:** DNS propagation, wrong TXT, expired challenge, unsafe/private target, endpoint not reachable or TLS failure; user can refresh challenge or fix DNS.
- **Permissions:** provider can only create/modify own hosts.
- **Exit:** `/hosts/:hostId`.

### 4.3 Enroll host agent

- **Entry:** host detail install panel.
- **Preconditions:** host endpoint verified; enrollment code valid; supported Linux x86_64 host; user has shell access locally.
- **Action:** install signed/published agent release, run enrollment command and paste one-time code.
- **System:** agent generates Ed25519 key locally; sends public key + code; API validates and atomically consumes code; creates source key and certificate; issues random revocable host credential; agent writes private key and credential to owner-controlled config directory with restrictive permissions.
- **Validation:** code hash matches, unused, unexpired and host scope correct; key is valid; agent version/protocol supported.
- **Success:** host `active`; first signed operational-presence heartbeat appears in dashboard. This heartbeat updates freshness only and is not included in an evidence bundle.
- **Failure:** code expired/reused, wrong host, network unavailable, incompatible version or credential write failure. Do not mark active until server confirms and agent successfully writes local files.
- **Edge cases:** command rerun after server success but before local write; enrollment retries must be idempotent using enrollment request ID and key fingerprint; no duplicate active credential.
- **Permissions:** provider issues; agent only enrolls the specific host.
- **Exit:** host detail shows source health and last heartbeat.

### 4.4 Create evidence session and invite renter

- **Entry:** `/incidents/new`.
- **Preconditions:** authenticated owner; at least one active host with verified endpoint and a signed operational-presence heartbeat received by the API within the preceding 60 seconds; host has no other active session; owner has fewer than three active sessions.
- **Action:** select host, title/label, duration (default 30 minutes; range 2–240 minutes), and optional workload reference that contains no secret/customer payload. Create session.
- **System:** transactionally creates `collecting` session, schedules recurring platform probe, issues one single-use renter invitation expiring in 15 minutes, and records audit event.
- **Validation:** ownership, limits, allowed duration, safe label length/characters, active host and endpoint.
- **Success:** session detail with start/end, source status, invitation copy/share control and a clear notice that monitoring begins now.
- **Failure:** host became inactive, duplicate collecting session, limits reached, DB conflict or probe queue failure; creation rolls back or records a visible degraded state—never a falsely active session.
- **Edge cases:** double-submit; host agent goes offline immediately; renter does not join; owner navigates away; invitation copied multiple times but redeemed once.
- **Permissions:** only owner may create; renter invitation cannot view account.
- **Exit:** session detail.

### 4.5 Renter joins and submits observations

- **Entry:** one-time `/join#<token>` URL consumed by renter SDK or join page; token is in the URL fragment, never path/query, and the client clears the fragment before the API request.
- **Preconditions:** invitation unexpired/unused; session collecting or within defined join window; renter runtime can reach Witness API and the fixed workload endpoint.
- **Action:** SDK redeems invitation and generates an incident-scoped Ed25519 key locally.
- **System:** atomically consumes invitation, registers renter public key scoped to one incident, returns certificate and scoped ingestion credential. SDK sends typed heartbeat / endpoint-observation events.
- **Validation:** invitation hash, expiry, one-use, incident state, schema, sequence, key signature and incident scope.
- **Success:** renter source appears as joined and event observations are visible.
- **Failure:** expired/used invite, session closed, invalid certificate, network/API unavailable, schema/signature failure. SDK keeps bounded local queue and retries only during session ingestion window.
- **Edge cases:** duplicate redemption request, app restart, lost local credential, clock skew, duplicate sequence, renter workload ends early.
- **Permissions:** renter only writes to its scoped incident. No renter dashboard/account is needed for MVP.
- **Exit:** workload continues without blocking; SDK stops at session closure.

### 4.6 Capture and correlate observations

- **Entry:** automatic while session is collecting/awaiting finalization.
- **Preconditions:** active session, host agent key, optional renter key, verified endpoint.
- **Actions:** host agent sends signed `host_heartbeat` evidence events and scheduled typed telemetry; renter SDK sends workload/client observations; probe worker tests the fixed endpoint. The separate operational-presence heartbeat continues to update host freshness but is not bundled as evidence.
- **System:** validate and append signed events; record server receive time; detect expected heartbeat gaps; run deterministic rules for supported patterns. No source event is overwritten.
- **Success:** live timeline labels each source and separates direct observations from derived assessments.
- **Failure:** source offline, probe timeout, bad signature, stale event, clock skew, unsupported event, worker delay or DB failure. Display gap/unavailable state, not fabricated normal state.
- **Edge cases:** late uploads, out-of-order events, replay, duplicated request, events just before/after session end, partial outages.
- **Permissions:** owner reads own session only; event sources append only within scope.
- **Exit:** owner ends session or duration elapses.

### 4.7 End, finalize and seal

- **Entry:** session detail; automatic when duration limit reached.
- **Preconditions:** session collecting or awaiting finalization; owner authenticated for manual end/seal.
- **Action:** owner ends early or allows duration to elapse. Owner waits for agent spool to sync, then seals; system auto-seals after ingestion grace expires.
- **System:** `collecting → awaiting_finalize`; stop new probe scheduling at capture end but finish any active probe; accept delayed signed events until deadline; on seal take transaction lock, stop ingestion, sort events deterministically, calculate gaps/assessment, construct canonical manifest, sign manifest, persist immutable bundle and change status to sealed.
- **Validation:** source `observed_at` must fall inside the actual capture window; delayed `received_at` may extend through the 24-hour grace. No event accepted after seal; every source key/certificate valid; no unsupported protocol versions.
- **Success:** downloadable `.json` bundle, digest, signature status and assessment grade.
- **Failure:** signing key unavailable, DB transaction failure, malformed historic event, invalid source signature, no events, bundle size cap. Incident remains recoverable in `awaiting_finalize` with error status recorded; no partial sealed bundle is exposed.
- **Edge cases:** double seal; concurrent last event and seal; owner clicks twice; auto-seal races with manual seal; worker lease still active.
- **Permissions:** owner only.
- **Exit:** immutable sealed evidence detail.

### 4.8 Verify exported bundle

- **Entry:** public `/verify` or CLI `iw-verify <bundle.json>`.
- **Preconditions:** local file selected; browser app loaded with pinned trusted platform public keys and supported protocol schemas.
- **Action:** user selects bundle. Verification runs locally in browser or CLI; no network upload.
- **System:** validate schema/version, canonical JSON digest, platform signature, platform key pin, source key certificates, Ed25519 event signatures, sequence uniqueness and bundle consistency. Return separate results for integrity, signature validity, evidence completeness and assessment semantics.
- **Success:** show “cryptographically verified” only for the exact checks passed; show limitations prominently. This never means sensor truth or cause certainty.
- **Failure:** tampered bytes/data, invalid signature, unknown signing key, unsupported protocol, missing event, malformed JSON or unsupported algorithm. Show exactly what failed; do not silently repair.
- **Permissions:** public; client-side processing only.
- **Exit:** verification result or new file selection.

### 4.9 Revoke key and archive host; account deletion boundary

- **Entry:** host detail/settings.
- **Preconditions:** authenticated owner; explicit confirmation for destructive action.
- **Action:** revoke an agent/renter key or archive a host. Account deletion is not exposed as a v1 action.
- **System:** key revocation atomically marks the source key revoked and revokes all linked ingestion credentials; future ingestion is rejected but accepted historic signatures remain verifiable. Host archive atomically revokes host credentials, invalidates unused enrollment tokens and cancels due probes; it prevents new sessions.
- **Success:** state changes reflected in audit trail and UI.
- **Failure:** auth expiry, DB conflict, pending active session or dependent operation. Require active sessions to be sealed/cancelled before host archival.
- **Permissions:** owner only; no admin impersonation.
- **Exit:** refreshed host/settings screen.
- **Account deletion dependency:** before production, the operator must approve an exact account-data deletion process, backup-retention interval, audit-data treatment and effect on existing exported bundles. No route or CTA may imply self-service deletion until this is designed and implemented as a separately approved feature.

---

## 5. Functional requirements and acceptance criteria

| ID | Feature | Actor | Required behaviour | Acceptance criteria |
|---|---|---|---|---|
| FR-01 | OTP auth | Provider | Email OTP, secure session and logout | Valid OTP logs in; invalid/expired OTP rejected; logout invalidates session; protected API rejects missing/expired JWT |
| FR-02 | Host registration | Provider | Create host alias and hostname | Owner can create; another user cannot read/update it; invalid/IP hostname rejected |
| FR-02A | Operational host presence | Host agent | Signed operational heartbeat updates server-side last-seen and strict sequence | Valid fresh heartbeat updates presence; replay does not refresh presence; stale/future/invalid signature/wrong host rejected |
| FR-03 | Endpoint ownership | Provider/system | DNS TXT challenge + HTTPS health verification | Only exact current TXT challenge succeeds; expired/reused challenge fails; private/reserved DNS resolution fails |
| FR-04 | Host enrollment | Agent/provider | Single-use host enrollment and key registration | Code can be used once; public key registered; credential hash stored only; revocation blocks later uploads |
| FR-05 | Host observation | Host agent | Heartbeat and available typed power/GPU/system observations | Events signed; valid events accepted; invalid signature/sequence/schema rejected; missing UPS/GPU represented as unavailable |
| FR-06 | Session lifecycle | Provider | Create, end, finalize and seal bounded session | 2–240 minute limit enforced; one collecting session per host; max three per owner; sealed state immutable |
| FR-07 | Renter invitation | Provider/renter SDK | One-time incident-scoped join | Redeem once before expiry; key bound to one incident; cross-incident submission rejected |
| FR-08 | Renter observations | Renter SDK | Signed workload reachability/heartbeat observations | Valid scoped events accepted; duplicate sequence rejected; SDK queue bounded and retries safely |
| FR-09 | External probe | Worker | Fixed, safe HTTPS endpoint probe | Only verified host endpoint and fixed GET/path/443; no redirects; unsafe resolved addresses rejected; probe timeout recorded as observation/gap |
| FR-10 | Event ingestion | Agent/SDK/worker | Append-only, signature-verified events | Canonical bytes and signature verified; duplicate event id or key+sequence rejected idempotently; no updates/deletes from user roles |
| FR-11 | Correlation | System | Deterministic rules and evidence grade | Same input set/version always same assessment; insufficient evidence returns UNKNOWN; no probability invented |
| FR-12 | Evidence bundle | Provider/system | Portable signed JSON manifest | Contains events, source certificates, gap records, rule version, platform signature and digest; modification fails verification |
| FR-13 | Local verifier | Public user | Offline web and CLI verification | No bundle upload/network request; validates signatures/schema/digest; reports limitations distinctly |
| FR-14 | Provider dashboard | Provider | Hosts, sessions, timeline, source status, downloads | Only owned resources visible; all controls work; loading/empty/error/permission states shown |
| FR-15 | Key lifecycle | Provider | Revoke/rotate keys | Revoked key cannot append new events; historic signatures still verify; revocation metadata included where relevant |
| FR-16 | Documentation | All | Setup, protocol, privacy, usage and operations docs | README and required `docs/` files exist; deployed Docs destination resolves; no invented links |
| FR-17 | Staged deployment | Operator | Early route-complete preview, continuous checkpoints | Phase 1 preview URL and SHA reported; safe test config; each accepted phase updates same preview and reports test evidence |
| FR-18 | Final UI approval | Operator | References → mockups → explicit approval | Final style implementation cannot start without recorded operator approval |

### 5.1 Required evidence event types

- `host_heartbeat`
- `host_power_state` (only if UPS is configured and readable)
- `gpu_telemetry` (only when supported device/query succeeds)
- `host_agent_status` (start/stop/recovery; no arbitrary process logs)
- `renter_heartbeat`
- `renter_endpoint_result`
- `platform_probe_result`
- `source_gap` (system-derived, platform-signed; distinguish from source observation)

### 5.2 Event envelope

Each source-signed event contains exactly:

```json
{
  "protocol_version": "1.0",
  "event_id": "uuid",
  "incident_id": "uuid",
  "source_key_id": "uuid",
  "source_type": "host_agent | renter_client | platform_probe",
  "event_type": "one_supported_event_type",
  "sequence": 1,
  "observed_at": "RFC3339 UTC timestamp",
  "payload": {},
  "simulation_mode": false,
  "canonicalization": "RFC8785-JCS",
  "signature_algorithm": "Ed25519",
  "signature": "base64url"
}
```

The signature covers all fields except `signature`, using RFC 8785 JSON Canonicalization Scheme. The complete envelope is transmitted as exact canonical UTF-8 JSON; event requests use `application/vnd.incident-witness.event+json`, and the operational-presence heartbeat uses `application/vnd.incident-witness.presence+json`. The API preserves raw bytes and rejects any body not exactly equal to canonical serialization of its parsed object, including duplicate-property ambiguity. `sequence` is a positive safe integer and increases across all event types for one source key. Server-side `received_at` is appended after verification and is explicitly not source-signed. The server computes/stores the canonical payload digest. The exact schema is defined in `packages/protocol` and versioned; additional unrecognized fields are rejected in v1.

### 5.3 Payload allow-list

No free-form log body. The v1 schemas contain only bounded typed values:

- Incident `host_heartbeat` evidence event: agent version, OS family/version, uptime seconds and agent health. The event sequence is the outer envelope `sequence` field. Separate `/v1/agent/heartbeat` operational-presence message: `hostId`, `observedAt`, `heartbeatSequence`, `agentVersion`, signature; its sequence counter is independent and its server-received timestamp is used only for freshness.
- UPS: configured device alias, allowed state enum, charge percent, runtime seconds; absent values omitted, never fabricated as normal.
- GPU: device index, vendor/model identifier, temperature C, utilization %, memory used/total MiB, power draw W, driver version if safely available, collection status. Do not claim XID/driver fault unless a trusted permitted source actually provides that event.
- Renter: workload reference ID, SDK version, request/heartbeat state, latency ms, failure category enum; no prompt/output/job payload.
- Probe: target host ID, DNS/TLS/HTTP result categories, latency, observed IP classification only; private raw IP is not exported to the bundle.

---

## 6. Business logic and state machines

### 6.1 Host lifecycle

`pending_endpoint → pending_enrollment → active → archived`

- Failed endpoint verification leaves host in `pending_endpoint`.
- Enrollment timeout does not activate host.
- Agent credential/key revocation changes enrollment status to `revoked`; it does not rewrite host history.
- Archived host cannot start new sessions and cannot be unarchived in v1. To resume with the same hostname, provider must create a new host record, repeat DNS verification and enroll a new agent. Existing sealed evidence remains viewable by its owner.

### 6.2 Evidence-session lifecycle

`collecting → awaiting_finalize → sealed`

Alternative terminal path: `collecting → cancelled` only when there are no accepted source observations. A session with observations cannot be erased by “cancel”; owner must finalize/seal it.

- Default capture duration: 30 minutes.
- Allowed capture duration: 2–240 minutes.
- One collecting/awaiting session per host.
- Maximum three active sessions per provider account.
- Maximum one renter source key per session; at most 4,000 accepted signed events; each source-signed `payload` is at most 2 KiB, each event request at most 8 KiB, and canonical serialized event entries together at most 7 MiB. The complete bundle is separately capped at 10 MiB. Enforce both event-count and aggregate-byte budgets atomically in the same incident transaction. Reject an event that would exceed either budget. The final canonical bundle is measured again before seal; never truncate or partially seal evidence.
- Session ends at owner action or scheduled end time, whichever is earlier; `capture_ends_at` is set to actual end time.
- After end, allow a 24-hour ingestion grace period for delayed upload of events observed inside the capture window. A provider may seal earlier after observing that sources have synced.
- Auto-seal at grace expiry if at least one usable signed event exists; otherwise auto-cancel with `NO_EVIDENCE` and do not generate an empty evidence bundle.
- No event accepted after `sealed_at`.
- No reopening, editing, deleting or reclassifying sealed events/bundles through normal user APIs.
- A new session creates a new evidence record; no reset or extension of the old session.

### 6.3 Invitation lifecycle

`issued → redeemed` or `issued → expired/revoked`.

- Random 32-byte token; only HMAC/hash stored.
- Expiry: 15 minutes from issuance.
- Single successful redemption.
- Scope: one incident and renter source type only. A session can register one renter key total.
- Redemption creates one renter key/certificate and a separate ingestion credential.
- No permission to read host settings, other evidence, provider account or arbitrary session state.

### 6.4 Host enrollment lifecycle

`issued → redeemed` or `issued → expired/revoked`.

- Random 32-byte enrollment secret, displayed once.
- Expiry: 10 minutes.
- Single-use and bound to one host.
- Agent generates keypair locally; private key never goes to API.
- Agent credential stored only as a hash on server, revocable by owner.

### 6.5 Evidence event rules

1. Source key must exist, be active and be scoped to the correct host/incident/source type.
2. Signature must verify against registered public key.
3. Event ID must be unique; source-key plus sequence must be unique.
4. Duplicate request with the same event ID and identical verified canonical bytes returns the original accepted result (idempotent). Same ID with different content returns conflict and security audit event.
5. Sequence gaps are permitted but recorded; sequence rollback/reuse is rejected.
6. Events can arrive out of order during grace upload, but their source `observed_at` must remain within the capture window. Timeline order is `observed_at`, then source type, then source key ID, then sequence, then event ID for stable ordering.
7. `observed_at` more than five minutes in the future is rejected. Source `observed_at` must fall within `[capture_started_at,capture_ends_at]`; server `received_at` may fall within the 24-hour ingestion grace only. Grace permits delayed transmission, not post-capture observation. Server receive time remains separately recorded.
8. Clock offsets are assessed using server receive time and neighboring observations; do not silently rewrite source timestamp.
9. A source event with `simulation_mode=true` is accepted only when its incident is explicitly `demo_mode=true`; otherwise reject it. Simulated events and demo mode stay visibly marked in UI and bundle. A live session never accepts simulated events.
10. Event records are append-only to normal application roles.

### 6.6 Deterministic assessment rules (v1)

The system reports an **evidence pattern consistent with** a category; it does not declare absolute cause.

| Assessment | Minimum indicative pattern | Wording |
|---|---|---|
| `POWER_RELATED` | Host UPS reports transition to `ONBATT`/low battery before host heartbeat loss; supported by renter and/or probe reachability loss near the same time | “Evidence pattern consistent with a power-related interruption.” |
| `EXTERNAL_REACHABILITY_LOSS` | Platform probe cannot reach verified endpoint while a signed host heartbeat/agent-health event is received within 30 seconds of the probe failure; renter endpoint results may corroborate. UPS online alone is not sufficient. | “External reachability loss observed; evidence does not identify the precise upstream network cause.” |
| `HOST_OR_WORKLOAD_EXIT` | Host agent or renter explicitly reports graceful stop/exit and platform probe/client results support the timeline | “Host/workload exit signal observed; intent is not inferred.” |
| `UNKNOWN` | Evidence missing, contradictory, unsupported or insufficient. GPU/driver anomaly is not classified in v1 because the baseline collector does not provide a sufficiently validated fault signal. | “Available evidence is insufficient to classify this interruption.” |

Correlation window: 120 seconds around first relevant observed transition. A low-battery/shutdown chain may use a 180-second sequence only when the actual timestamps support it. The window is a deterministic rule parameter, documented in the rule version. These values are initial engineering constants, not empirically calibrated causal thresholds.

Evidence grades:

- `HIGH`: all relevant signatures valid, clock quality acceptable, three source categories present for the rule, rule-specific full pattern matched, and no simulation in the decisive evidence. This means high evidence completeness under the v1 rule—not proof of truth.
- `MEDIUM`: two valid source categories, at least one source external to the host, and a rule-specific partial pattern matched.
- `LOW`: one source category or material missing/clock-quality gaps; no strong cause label beyond UNKNOWN/observed event.
- `INSUFFICIENT`: zero usable signed observations or irreconcilable evidence.

Any simulated decisive event caps grade at `LOW` and adds `SIMULATED_EVIDENCE_PRESENT`. Demo sessions are visibly labelled as demo in the UI and manifest even if some events are real platform probes. No percentage probabilities or AI confidence scores.

### 6.7 Ownership and visibility

- Provider account owns hosts and sessions.
- Host source key belongs to one host; renter source key belongs to one incident; platform probe key is platform-controlled.
- Provider can see only owned hosts/incidents/events/bundles.
- Renter key can write events to one incident only; it has no read access to provider account data.
- Public verifier receives a local export and performs no upload.
- No public incident pages or indexed bundles.

### 6.8 Irreversible operations and confirmations

- Sealing an evidence bundle is irreversible in the MVP.
- Key revocation is irreversible for that key; a new enrollment is required.
- Host archive prevents new sessions and is terminal for that host record in v1; no unarchive endpoint or UI action exists. A provider may register a new host with a fresh endpoint challenge and agent enrollment.
- Self-service account deletion is not available in v1. Account and evidence retention/deletion policy must be approved before production; downloaded bundles remain outside platform control.
- Download/share flow warns that the bundle may include host alias, verified hostname, timestamps, telemetry and source metadata. User must inspect before sharing.

---

## 7. Data model summary

Full SQL-level table definitions, indexes, RLS and retention are in `ARCHITECTURE.md`.

| Entity | Purpose | Owner/visibility | Main lifecycle |
|---|---|---|---|
| `profiles` | Minimal user profile | Provider user only | Created with auth account |
| `hosts` | Provider's compute host and endpoint metadata | Provider owner only | pending_endpoint → pending_enrollment → active → archived |
| `host_endpoint_challenges` | DNS TXT challenge state | Host owner/API only | issued → verified/expired |
| `witness_keys` | Host/renter/probe public keys and source scope | Owner for its keys; platform key for worker | active → revoked |
| `enrollment_tokens` | Hashed one-time host enrolment tokens | Owner/API only | issued → redeemed/expired/revoked |
| `incidents` | Bounded evidence sessions | Provider owner only | collecting → awaiting_finalize → sealed/cancelled |
| `renter_invitations` | Hashed single-use renter join tokens | Provider owner/API; token holder can redeem | issued → redeemed/expired/revoked |
| `evidence_events` | Immutable signed source observations | Owner reads; source writes only through ingestion API | append-only |
| `probe_jobs` | Scheduled external probe tasks and lease state | Worker/API only | pending → leased → completed/retry/dead |
| `platform_signing_keys` | Trusted public keys/key metadata | Public keys embedded in verifier; private key secret-only | active → retired/revoked |
| `evidence_bundles` | Sealed immutable signed export and digest | Provider owner only; public only when exported by user | immutable sealed |
| `audit_events` | Security and lifecycle audit record | Owner may read limited self events; no edits | append-only |

### 7.1 Data classification

- **Never public by default:** account IDs/emails, host names/aliases, endpoint FQDN, raw network addresses, event payloads, source key metadata linked to provider, enrolment/invitation hashes, credentials, private keys, bundle storage paths.
- **Provider-only:** hosts, sessions, raw evidence, bundle, keys and audit history.
- **Renter access:** no stored account identity; only scoped source key and write permission for a single incident.
- **Platform operator access:** operational metrics/logs only by default; no content browsing. Break-glass access requires explicit, logged, time-bound authorization and is not part of routine admin UI.
- **Sensitive:** hostname, workload identifier, timestamps, GPU telemetry, network status, key material and incident contents. No customer workload data is intentionally collected.

---

## 8. MVP architecture and technology decisions

### 8.1 Components

1. **Web app:** provider dashboard, public Docs, local verifier and user flows.
2. **API service:** authentication/authorization, host/session management, event ingestion, sealing, bundle retrieval.
3. **Host agent:** local Linux telemetry collection, local signing and offline queue.
4. **Renter SDK:** workload-side heartbeat/endpoint observations and event signing.
5. **Probe worker:** periodic reachability probes from a separately deployed process.
6. **Shared protocol package:** schemas, canonicalization, signing, verification, deterministic correlation and bundle types.
7. **Postgres:** operational state and append-only evidence.

### 8.2 Stack

| Area | Decision | Reason |
|---|---|---|
| Runtime | Node.js 26 LTS + TypeScript strict | Common runtime across API, SDK, agent and worker; pin the current supported 26.x patch via `.node-version`/toolchain |
| Frontend | Next.js 16.4.x App Router (16.4.3 current stable checked 2026-10-30) | Product dashboard, public docs/verifier, SSR and route handling; Next 16 uses `proxy.ts` for auth-cookie refresh |
| UI styling | Tailwind CSS 4.x with small semantic component layer | Temporary consistent UI first; final style not approved until late phase |
| API | Fastify 5 | Separate, small typed API process; schema-based validation and plugin boundaries |
| Database | Supabase Postgres | Managed PostgreSQL and RLS; migrations tracked in repo |
| Auth | Supabase Auth email OTP | Avoid building password security/session lifecycle ourselves |
| Server DB | Drizzle ORM + `pg` | Explicit SQL/migrations/transactions; API and worker use restricted DB roles |
| JWT verification | `jose` against Supabase JWKS | Verify signature, issuer, audience and expiry in API |
| Canonical JSON | RFC 8785 implementation pinned in protocol package | Stable signed bytes across runtimes |
| Signatures | Node `crypto` Ed25519 for Node runtimes; `@noble/ed25519` 3.2.x for browser-only verification | Node signs source events/manifests; browser verifies offline without bundling Node modules or handling private keys |
| Agent spool | SQLite (`better-sqlite3`) | Bounded offline queue and durable local sequence counter |
| API validation | Zod shared domain schema + Fastify JSON Schema boundary | Typed internal contracts and strict external validation |
| Logging | Pino | Structured operational logs; redact tokens and sensitive payloads |
| Frontend deploy | Vercel Preview/Production | Early stable preview and branch/commit deploys |
| API/worker deploy | Render Web Service + Background Worker | Separate worker process without unnecessary queue infrastructure |
| Testing | Vitest, Playwright, pgTAP; testcontainers where suitable | Unit, API/database and real browser verification |

### 8.3 Not selected

- No microservices beyond the necessary web/API/worker/agent/SDK boundaries.
- No Kubernetes, Redis, Kafka, Temporal, Elasticsearch, GraphQL or message broker.
- No AI/LLM provider.
- No Arweave, blockchain or token.
- No object storage in v1; evidence bundle JSON is stored in Postgres up to a strict size limit. If this limit proves insufficient, file storage requires a separate ADR and operator approval.
- No marketplace-specific SDK or mandatory Nosana integration.

### 8.4 Architecture hard rules

- The host agent never sends private key material to the API.
- The web app never receives platform signing secrets, DB credentials or device credentials.
- All event data is bounded, typed and signed; no free-form log ingestion.
- The platform probe is described as platform-operated, not independent-third-party evidence.
- All assessment output is deterministic, versioned and explainable.
- Sealed data is immutable through user-facing routes and normal DB roles.
- No production secrets/data in preview environment.

---

## 9. API contract summary

All endpoints are under `/v1`, JSON request/response except bundle download. Authenticated endpoints require a valid Supabase access JWT; agent/renter ingestion endpoints use scoped credentials and event signatures. Full endpoint schemas and examples are in `ARCHITECTURE.md`.

| Method | Path | Actor | Purpose |
|---|---|---|---|
| GET | `/health/live` | Public | Liveness |
| GET | `/health/ready` | Internal/monitor | Readiness and DB dependency status |
| GET/POST | `/v1/hosts` | Provider | List/create hosts |
| GET/PATCH | `/v1/hosts/:hostId` | Provider | Read/update own host alias/state metadata |
| POST | `/v1/hosts/:hostId/endpoint-challenge` | Provider | Create DNS TXT proof |
| POST | `/v1/hosts/:hostId/endpoint-verify` | Provider | Verify DNS/TLS/fixed health endpoint |
| POST | `/v1/hosts/:hostId/enrollment-codes` | Provider | Issue one-time host enrollment code |
| POST | `/v1/agent/enroll` | Agent | Redeem code, register public key and return credential/certificate |
| POST | `/v1/agent/heartbeat` | Host agent | Signed operational-presence heartbeat used to establish host freshness; not an evidence event |
| POST | `/v1/agent/events` | Host agent | Append signed host event during an incident |
| POST | `/v1/incidents` | Provider | Create bounded evidence session |
| GET | `/v1/incidents` | Provider | List own sessions |
| GET | `/v1/incidents/:incidentId` | Provider | Read own session/timeline metadata |
| POST | `/v1/incidents/:incidentId/renter-invitations` | Provider | Issue one-time renter invitation |
| POST | `/v1/renter/enroll` | Renter SDK | Redeem invitation and register key |
| POST | `/v1/renter/events` | Renter SDK | Append scoped renter event |
| POST | `/v1/incidents/:incidentId/end` | Provider | End capture and enter finalization |
| POST | `/v1/incidents/:incidentId/seal` | Provider | Seal immutable evidence bundle |
| GET | `/v1/incidents/:incidentId/bundle` | Provider | Download sealed JSON bundle |
| POST | `/v1/hosts/:hostId/keys/:keyId/revoke` | Provider | Revoke host source key |
| POST | `/v1/hosts/:hostId/archive` | Provider | Archive host |

Error format:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found.",
    "request_id": "uuid",
    "details": {}
  }
}
```

Do not reveal whether another user's resource exists. Use 404 for out-of-scope IDs. Use 409 for duplicate/state conflicts, 422 for well-formed but invalid domain input, 401/403 for auth/authz as appropriate, 429 for rate limit, and 5xx for internal failures. Never return stack traces, DB errors or secret values.

---

## 10. UI/UX architecture

### 10.1 Route inventory

| Route | Access | Purpose and main content | Main actions |
|---|---|---|---|
| `/` | Public | Explain problem, three observation sources, limitations, how verification works and primary CTA | Sign in, Docs, Verify |
| `/login` | Public | Email OTP form and resend status | Request/submit OTP |
| `/dashboard` | Provider | Active sessions, host health summary, recent sealed records | Add host, create session, inspect record |
| `/hosts` | Provider | Owned host list and lifecycle/source status | Add, inspect, archive |
| `/hosts/new` | Provider | Host alias and public hostname capture | Create, begin DNS challenge |
| `/hosts/[hostId]` | Provider | Endpoint proof status, agent install/enrollment, heartbeat, key status | Refresh challenge, enroll/revoke, archive |
| `/incidents` | Provider | Own sessions with status/time/host/assessment | Create, open |
| `/incidents/new` | Provider | Select host, duration, safe label and optional workload reference | Create session |
| `/incidents/[incidentId]` | Provider | Timeline, source health, gaps, lifecycle, assessment and bundle | Copy renter invite, end, seal, download |
| `/verify` | Public | Local browser verification of JSON evidence bundle | Select file, verify, clear result |
| `/docs` | Public | Product, install, flow, protocol and limitations documentation | Navigate docs |
| `/privacy` | Public | Data collected, retention/deletion and local verification | Navigate docs/contact when configured |
| `/terms` | Public | Operator-approved terms and limitations | Navigate docs/contact when configured |
| `/settings` | Provider | Session information, display name and registered source-key status | Update display name, sign out, revoke a source key, archive a host |
| `not-found` | Public/auth-aware | Helpful missing route state | Home/Docs/login |

### 10.2 Shared components and behaviour patterns

- `AppShell`, `PublicHeader`, `DashboardSidebar`/mobile navigation, `Footer`.
- `AuthGuard`, `PermissionBoundary`, `RouteErrorBoundary`.
- `StatusPill` for host/session/source states; text label always included, not color alone.
- `HostCard`, `HostStatusPanel`, `EndpointChallengePanel`, `AgentEnrollmentPanel`.
- `SessionForm`, `SessionLifecycleBar`, `RenterInvitePanel`, `SourceHealthList`.
- `EvidenceTimeline`, `EvidenceEventDetails`, `GapNotice`, `AssessmentPanel`, `BundleDownloadPanel`.
- `FileDropzone`, `VerificationResult`, `VerificationCheckList`, `LocalFilePrivacyNotice`.
- Shared `ConfirmDialog`, `CopyControl`, `InlineNotice`, `Toast`, `LoadingState`, `EmptyState`, `RetryPanel`.

### 10.3 Structural states

Every data-backed screen needs loading, empty, error/retry, permission denied, and not-found handling where appropriate. Forms need invalid, submitting, success and server-error states. Session detail additionally needs `collecting`, `awaiting_finalize`, `sealing`, `sealed`, `cancelled`, source-missing, worker-delayed and stale-data states. The verifier needs no-file, parsing, verified, partially verified, failed, unsupported-version and oversized-file states.

### 10.4 Responsive/accessibility structure

- Mobile-first layouts, single-column content on narrow viewports, no horizontal-only evidence timeline; timeline entries stack vertically.
- All operations available with keyboard; visible focus; correct labels and descriptions; semantic headings/landmarks; status not conveyed by color only; accessible error messages.
- Tables convert to labelled cards/rows on narrow viewports.
- Copy and confirmation actions announce success to assistive technology.
- Respect reduced-motion preference; no essential animation.
- Contrast and touch targets to be evaluated in approved final design.

### 10.5 Early skeletal UI

Phase 1 includes all agreed routes, basic nav, responsive layout, plain typography/spacing, labelled placeholders and working navigation. Forms may be clearly labelled nonfunctional until backend phases; no fake data, fake host status, fake verified records or fake CTAs. Public `/verify` can initially be an explicit “verification UI not yet connected” state. The early preview must use test auth/data only and must not expose production provider records.

### 10.6 Final visual design is not approved

No color palette, typography, product personality, illustration direction or final component styling is approved by this document. These are decided only in the later reference/mockup phase and after operator approval.

### 10.7 Frontend completion checklist

- Real global navigation/footer and all routes.
- Actual Documentation link to reachable `/docs` or approved published docs destination.
- Actual GitHub repository link only after repository URL is confirmed public and operator approves disclosure.
- Privacy and Terms links to real, operator-approved content.
- No dead links, `href="#"`, inert buttons, false telemetry or unexplained placeholders.
- Titles, descriptions, favicon/app icon, social metadata where appropriate, robots/sitemap policy for public pages only.
- Loading/empty/error/success/not-found/permission states.
- Mobile/desktop behavior, keyboard/focus, labels, contrast and screen-reader semantics.
- Preview and production links smoke-tested.

---

## 11. Third-party integrations

### Mandatory

1. **Supabase Auth:** email OTP. Secrets stay server-side; redirect URLs are allow-listed; local/preview/prod environments separated.
2. **Supabase Postgres:** operational state, RLS and migrations.
3. **Vercel:** frontend preview/production deployment.
4. **Render:** API service and probe background worker.
5. **DNS/TLS resolution:** endpoint challenge and health verification. No external arbitrary fetch.

### Optional/conditional

- **NUT:** optional local UPS observation source. Not required for agent enrollment; absence is explicit.
- **NVIDIA `nvidia-smi`:** optional fixed GPU query. Missing binary/device is reported unavailable.
- **Nosana:** potential later demonstration/integration only after API credentials, credits and real job execution verified. Not a core dependency.
- **Arweave:** excluded from MVP; permanent data storage is inappropriate until privacy/consent and value are proven.

No webhook, payment provider, AI service, external mail service beyond Supabase Auth email or blockchain integration is required.

---

## 12. AI and payment architecture

**AI: none.** The assessment is a deterministic, versioned rule engine. No generative model is allowed to determine the cause, write the evidence bundle or override schema validation.

**Payments: none.** No fees, balances, payout, escrow, token, wallet or financial state exists in MVP.

---

## 13. Admin and operations

No admin product UI in MVP. Operations consist of health endpoints, structured logs, worker liveness/queue age, database health, error/latency monitoring and deployment provider alerts. Platform staff must not have routine access to evidence content. Break-glass content access is disabled by default; if ever needed, require operator approval, scoped time window, audit record and post-access review.

Operational limits: probe every 15 seconds while active; request timeout 3 seconds; worker concurrency 10; one probe job lease at a time per session; general API JSON body maximum 32 KiB, individual event-ingestion body maximum 8 KiB, source payload maximum 2 KiB, aggregate event-entry budget 7 MiB, complete bundle maximum 10 MiB; local agent spool maximum 50 MB; capture duration maximum 4 hours; at most 3 active sessions per owner.

---

## 14. Error and edge-case matrix

| Area | Edge/failure | Expected behaviour |
|---|---|---|
| Auth | Invalid/expired OTP, provider down | Safe message, rate limit and retry; no session created |
| Ownership | User changes `hostId`/`incidentId` to another account | 404; no data disclosure; security test proves isolation |
| DNS | TXT absent/incorrect/expired | Host remains pending; explain DNS propagation and retry |
| SSRF | DNS resolves to loopback/private/link-local/metadata/reserved address | Probe refuses; record unsafe endpoint configuration; no request sent |
| DNS rebinding | DNS answer changes after validation | Re-resolve and pin validated destination for connection; reject unsafe answer |
| TLS/HTTP | Certificate invalid, redirect, wrong status, timeout | Record category/latency and probe error; never follow redirect |
| Enrollment | Reused/expired code | Reject; no second credential; audit event |
| Key | Key revoked/invalid signature | Reject ingestion; retain historic observations |
| Event | Duplicate same bytes | Idempotent success with existing event ID |
| Event | Same ID, different bytes or reused sequence | 409 conflict; security audit event |
| Event | Sequence gap/out-of-order | Accept valid in-window event and record gap; stable timeline sort |
| Event | Future timestamp/old event | Reject/quarantine with reason; keep server receive timestamp for diagnostics |
| Session | Double create/race on same host | Partial unique index/transaction permits only one active session |
| Session | Seal races with event | Incident row lock and state check: event or seal wins atomically; no event after seal |
| Session | Auto-seal races with manual seal | Idempotent seal operation returns same bundle ID |
| Session | No accepted observations | Cannot seal a misleading empty evidence package; allow cancellation only if empty |
| Agent | Host offline | Spool locally within cap; UI shows stale/offline, not healthy |
| Agent | Spool full | Backpressure, drop oldest noncritical heartbeat only under documented policy; preserve critical transitions; raise visible gap |
| Agent | Process restarts | Persist sequence and pending signed records in SQLite; no sequence rollback |
| Renter | Invitation reused/expired | Reject; no key created twice except idempotent same redemption request |
| Worker | Crashes during probe | Lease expires; safe retry; unique probe observation ID prevents duplicate append |
| Worker | DNS/probe service failure | Show no result/gap; never turn probe infrastructure failure into host outage classification |
| DB | Transaction rollback/connection loss | No success response; client retries idempotently; no partial sealed bundle |
| Signing | Platform signing key unavailable | Sealing fails closed; session stays awaiting finalization; alert operator |
| Bundle | Modified event/signature/manifest | Verifier marks integrity/signature failure; no silent repair |
| Bundle | Unknown platform signing key | Verification reports untrusted key; no green verified badge |
| UI | Slow/stale API | Label last-updated/stale; retry; no fabricated status |
| Deployment | Preview config missing | Report exact deployment blocker; no claim of deployed preview |

### Retry and recovery policy

- Client ingestion retries exponential backoff with jitter (1s, 2s, 4s, 8s, capped at 60s) only within capture/grace window and only for network/5xx/429; respect `Retry-After`.
- Do not retry 400/401/403/409/422 without a corrected request or renewed credential.
- API ingestion is idempotent by event ID + source key sequence.
- Worker uses DB lease with expiry and bounded retry; dead-letter after five failed attempts and create an operator-visible operational alert. No Redis queue.
- Sealing uses one DB transaction and a unique bundle per incident. If response is lost, repeat returns same sealed result.

---

## 15. Test strategy and MVP acceptance gate

### Unit tests

- Canonical JSON consistency across supported runtime.
- Ed25519 sign/verify and corrupted signature failures.
- Schema validation and payload bounds for each event type.
- Correlation patterns, contradictions, gaps and unknown output.
- Clock skew rules, quality grade caps for simulation and missing sources.
- Bundle construction, deterministic event ordering and digest/signature.
- Token hashing/expiry/one-use helpers.
- Host/session state transition guards.

### Integration tests

- Supabase JWT verification and DB RLS boundaries.
- Enrollment redemption transaction and one-use semantics.
- Host/renter event ingestion, signature verification, key scope, sequence and idempotency.
- DNS challenge and safe probe target resolution.
- Worker lease and retry logic.
- Session end/seal transaction under concurrent event ingestion.
- Bundle retrieval and local verifier round trip.

### End-to-end tests

1. Register/login → add host → DNS verify (controlled test DNS) → enroll test agent → heartbeat visible.
2. Create session → renter invite → SDK join → host/renter/probe observations appear → end → seal → download bundle → verify offline.
3. Simulated power pattern: `ONBATT` → host heartbeat loss → renter/probe reachability loss → assessment wording and quality grade are deterministic and simulation-capped.
4. External reachability pattern: platform probe cannot reach the endpoint while a valid host-agent heartbeat arrives within 30 seconds; renter endpoint failure may corroborate. UPS online alone is insufficient. Output `EXTERNAL_REACHABILITY_LOSS`, not an ISP/root-cause claim.
5. Insufficient evidence → `UNKNOWN`.
6. Alter one signed event/manifest byte → verifier failure.
7. Revoked key submits an event → rejected.
8. Another user attempts to open/update an object ID → 404 and no disclosure.
9. Race: duplicate session creation; race: event ingest vs seal; verify exactly one consistent terminal outcome.
10. No renter source / no UPS source / probe infrastructure unavailable → explicit gaps and no invented normal state.

### Security tests

- IDOR across every resource endpoint.
- JWT issuer/audience/expiry/algorithm validation; session fixation and CSRF posture for cookie-auth flows.
- XSS from labels/hostname/event values.
- SQL injection through all string inputs; schema-based parameterized queries.
- SSRF/private address, IPv6 special ranges, DNS rebinding, redirect, proxy env, metadata endpoint and non-443 bypass tests.
- Brute-force/rate limit for OTP, enrollment, renter redemption and event ingestion.
- Token leakage from logs, URLs, errors and analytics (no analytics in MVP).
- Replay and duplicate event signatures; sequence rollback; old/revoked key.
- Oversized payload/bundle and malformed JSON attacks.
- Local verifier malformed bundle, unknown signing key and algorithm confusion.
- Secret scan and dependency audit in CI.

### Hard acceptance gate before final visual design

All MUST HAVE features pass tests above; the three core evidence patterns are demonstrated; offline verification succeeds and detects tampering; permission isolation and SSRF tests pass; there are no P0/P1 functional/security defects; critical journeys work on the deployed preview; operator receives deployed commit SHA and test evidence. Any exception must be explicitly accepted by operator in writing. Only then can reference/mockup phase begin.

---

## 16. Documentation and repository deliverables

Required root files: `PROJECT_SPEC.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_PLAN.md`, `AGENTS.md`, `AI_HANDOFF.md`, `README.md`.

Required `docs/`: research/assumptions, protocol and event schema, host-agent install/operator guide, renter SDK integration guide, privacy/data lifecycle, security model/threat register, API reference, deployment and environment guide, troubleshooting/runbook, design decision record and approved mockups after design approval.

The actual documentation destination for the website footer is `/docs` in the app unless operator approves a published docs site. GitHub link is not enabled until the real repository URL exists and is approved for public display.

---

## 17. Assumptions, decisions and open validation

### Fixed product/architecture decisions

The product name and MVP boundaries; provider/renter/platform-probe observation roles; deterministic signatures and rule engine; no AI/payments/blockchain; one Linux host agent; bounded evidence sessions; local verification; selected stack; early frontend and late design approval lifecycle.

### Assumptions that must be validated before or during early implementation

- A provider can expose a public HTTPS health endpoint on a controlled hostname.
- A platform-operated probe is useful even though it is not an independent third-party organisation.
- Target providers can install a Node-based Linux agent and grant access to `nvidia-smi`/NUT where available.
- A renter can incorporate a small SDK or invoke a small client process.
- The proposed three-source workflow is understandable and useful to actual providers/renters.
- Supabase, Vercel and Render account limits/pricing fit the user's budget.
- The selected DNS challenge and fixed endpoint path match the provider deployment environment.

### Questions not allowed to block the architecture unless they reveal a fatal constraint

- Exact project GitHub URL, existing repo, Vercel/Render/Supabase project IDs and user credentials are not provided. Coding agent must inspect current workspace and report; do not create/deploy to guessed resources.
- Actual public hostname/DNS provider and real GPU test machine are not yet specified.
- Market demand, willingness to pay, marketplace acceptance and full novelty status remain unverified.
- Production legal entity, jurisdiction-specific legal copy and contact details remain operator-supplied; placeholders must not be published as real terms.

---

## 18. Project success definition

The MVP is successful when a provider can configure a host, enroll the agent, start a bounded evidence session, invite a renter client, collect signed provider/renter/platform-probe observations, seal a deterministic evidence bundle, and verify that bundle locally—including detection of deliberate tampering. The system must accurately show missing/unknown evidence and must never overstate signatures as proof of sensor truth or inferred cause.

The MVP is **not** commercially validated simply because this technical flow works. User interviews and marketplace acceptance tests remain a separate validation workstream.
