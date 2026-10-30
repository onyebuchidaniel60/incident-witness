# Provider Host Agent — Operator Guide (Planned)

**Status:** User guide specification; agent has not been implemented or released.

## What the agent does

The Incident Witness host agent runs on a provider-controlled Linux x86_64 machine. It collects a small allow-list of typed operational observations, signs them locally with an Ed25519 key and sends them to the API. It maintains a bounded SQLite queue so observations can be uploaded after temporary network loss.

It does not administer the host, schedule GPU jobs, execute remote commands, collect arbitrary system logs or certify that hardware readings are truthful.

## Prerequisites

- Linux x86_64.
- Node.js 26 LTS runtime or a released standalone package approved by maintainers. Some Linux distributions may require `libatomic` (commonly packaged as `libatomic1`) for the official Node.js binary; verify the host distribution package manager.
- Outbound HTTPS access to the Incident Witness API.
- Provider control over a public DNS hostname with a valid HTTPS endpoint on port 443.
- Local user permissions to run the agent and read supported telemetry.
- Optional: NVIDIA driver and `nvidia-smi` for GPU summary.
- Optional: Network UPS Tools (`upsc`) and configured UPS for power-state observations.

The first release excludes Windows, macOS, arm64 and hosts that cannot expose the approved public HTTPS endpoint. This is an MVP limitation, not a guarantee that other platforms are impossible.

## Setup sequence (when released)

1. Create a provider account in the Incident Witness dashboard.
2. Add a host alias and public hostname.
3. Publish the generated DNS TXT challenge exactly as shown.
4. Verify DNS ownership and TLS health endpoint in the dashboard.
5. Generate a one-time host enrollment code; it expires after 10 minutes and can be used once.
6. Install a signed/released agent package from the official project destination. Verify the release signature/checksum according to the eventual release procedure.
7. Run enrollment locally. The agent generates its private key on the host; the private key must never be sent to support or pasted into the dashboard.
8. Check dashboard status for the first signed heartbeat.
9. Restrict local config/private key/device credential file permissions to the service owner. Persist the operational heartbeat sequence separately from the incident evidence sequence so restart/retry cannot replay presence or collide with event order. Never commit or copy secrets into source code.

No install command or binary URL is published yet. Do not run a guessed shell command or download an unverified executable.

## Signal collection

- Operational presence heartbeat: sign and send to `POST /v1/agent/heartbeat` every 15 seconds using its own monotonic sequence. It updates last-seen state only and is not included in evidence bundles.
- Evidence `host_heartbeat`: every 30 seconds during an active evidence session, using the durable incident event sequence shared by all event types for that host source key.
- GPU summary: every 30 seconds, if available.
- UPS state: poll locally every 5 seconds if NUT is configured, but emit only state transitions and at most one unchanged-state summary per minute. Do not emit one event for every poll.
- Collapse offline/missed-sample intervals into bounded `source_gap` records rather than emitting an unbounded event per missed interval.
- Nominal four-hour budget: platform probe 15s (960 events), host evidence heartbeat 30s (480), optional GPU summary 30s (480), renter heartbeat 30s (480), renter endpoint result 60s (240), and UPS unchanged-state summary at most once per minute (240), for about 2,880 scheduled observations before state transitions and compressed gap records. Operational-presence heartbeats are separate and not evidence events. This leaves 1,120 slots below the 4,000-event cap for transitions and exceptional records; if the projected budget is exceeded, the client stops emitting low-priority periodic summaries and records a bounded gap rather than silently losing critical transitions.

Absent sensor means “not available.” It does not mean power/GPU is normal. The agent should use fixed, bounded collector commands; no shell expansion or arbitrary user-supplied command line.

## Evidence session

An evidence session must be started while the host is available and before the workload/job window that it is intended to observe. The MVP does not provide retroactive pre-session reconstruction or always-on incident-triggered sessions. The provider chooses a duration between 2 and 240 minutes (default 30) and may share a one-time renter invitation. After the capture window ends, the agent can sync local spool during a 24-hour ingestion grace period. The provider may then seal the record. A sealed record cannot be edited.

## Local storage and offline operation

- Private key and device credential remain on the host.
- Event spool limit: 50 MB.
- Sequence counter must persist through service restart.
- Events are retried with bounded exponential backoff.
- If local storage is full, agent reports a gap; it must not silently pretend evidence was captured.
- Never delete pending events because of a server-side validation error; stop and report the cause.

## Security and privacy

- Run as an unprivileged user.
- Do not run as root unless a later approved collector explicitly requires privilege; basic heartbeat mode must not require root.
- Do not expose private key or bearer credential in logs, process arguments or support messages.
- The provider controls the host and can modify telemetry. A valid signature is not proof of hardware truth.
- Do not collect workload contents, prompts, model output, datasets, environment variables or arbitrary logs.

## Troubleshooting

See `TROUBLESHOOTING.md`. Common states include endpoint not verified, enrollment code expired, API unreachable, device credential revoked, source key revoked, `nvidia-smi` unavailable, NUT unavailable, spool full and protocol version mismatch.
