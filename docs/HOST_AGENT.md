# Provider Host Agent — Operator Guide

**Status:** Phase 3D implementation in `packages/host-agent`, accepted on 2026-10-31. Linux x86_64
only. The agent is not a published binary or signed release yet; build it from this repository.

## What the agent does

The Incident Witness host agent runs on a provider-controlled Linux x86_64 machine as an
unprivileged OS user. It:

- keeps a signed operational-presence heartbeat with the API every 15 seconds;
- during an explicitly supplied evidence session, signs `host_heartbeat`, GPU and optional UPS
  observations into a local evidence spool every 30 seconds (UPS is polled every 5 seconds);
- uploads queued evidence with bounded exponential backoff and preserves the spool across restarts;
- generates and stores its Ed25519 key locally. The private key is never sent to the API.

It does not administer the host, schedule GPU jobs, execute remote commands, collect arbitrary
system logs or environment variables, or certify that hardware readings are truthful. A valid
signature proves integrity and provenance relative to the enrolled key; it does not prove sensor
truth.

## Prerequisites

- Linux x86_64.
- Node.js 26.13.0 (the repository pins this version in `.node-version`).
- Outbound HTTPS access to the Incident Witness API.
- A host already registered, DNS-verified and put into `pending_enrollment` by the provider.
- Local permissions to run the agent and read supported telemetry. Basic operation does **not**
  require root or sudo. The built CLI and spool have been exercised as an unprivileged account with
  an owner-only test configuration.
- Optional: NVIDIA driver and `nvidia-smi` for a GPU summary.
- Optional: Network UPS Tools (`upsc`) and a configured UPS device alias.

The first release excludes Windows, macOS, arm64 and hosts that cannot expose the approved public
HTTPS endpoint. This is an MVP limitation.

## Build

From the repository root:

```bash
npm ci
npm run build --workspace @incident-witness/protocol
npm run build --workspace @incident-witness/host-agent
```

The executable is `packages/host-agent/dist/cli.js`, linked as `node_modules/.bin/iw-agent` in the
workspace. The commands below use `iw-agent`; substitute the full path if the binary directory is
not on `PATH`.

## Enroll the host

Issue a one-time enrollment code in the provider dashboard (it expires after 10 minutes), then run:

```bash
iw-agent enroll --api-url https://<incident-witness-api>
```

The agent prompts for the enrollment code with terminal echo disabled. The code is never accepted as
a command-line argument or environment variable and is not written to shell history. It is not
logged. The agent:

1. generates an Ed25519 keypair locally with Node's built-in `crypto`;
2. sends only the public key, agent version and a random request ID to `POST /v1/agent/enroll`;
3. validates the returned source certificate against its local public key and host scope;
4. writes the private key, one-time device credential and public configuration to the private
   configuration directory.

If the server accepts enrollment but the local secret files cannot be written, the command fails and
the operator must revoke the new host key and issue a new enrollment code. Re-running the same
enrollment code after a successful redemption is not possible.

### Optional UPS configuration

Pass the local NUT device alias at enrollment or later at run time:

```bash
iw-agent enroll --api-url https://<incident-witness-api> --ups-device apc-1
iw-agent run --incident <uuid> --ups-device apc-1
```

The alias is restricted to letters, digits, dot, underscore and hyphen. It is passed as one fixed
`upsc` argument, never through a shell.

## Run the agent

Start the agent while the host is available and an evidence session is active:

```bash
iw-agent run --incident <incident-uuid>
```

Operational presence runs even without `--incident`. Evidence collectors are idle until an incident
ID is supplied. The current API does not expose an agent-scoped session-discovery endpoint, so the
incident ID is supplied explicitly by the operator. Dashboard integration that presents this command
is Phase 4 work; this limitation must not be hidden by the frontend.

Run `iw-agent status` for safe local status:

```bash
iw-agent status
```

It prints the host ID, source key ID, API origin, configured incident, next durable sequences, spool
usage, blocked incidents and safe halt flags. It never prints the device credential or private key.

### First heartbeat

After enrollment, the first successful operational-presence heartbeat updates the host's
`last_agent_seen_at` in the provider dashboard. This presence signal is **not** an evidence event and
is never included in a bundle.

## Configuration and key storage

The default directory is `~/.config/incident-witness/` (or `$XDG_CONFIG_HOME/incident-witness/`).
`--config-dir` overrides it.

| File | Mode | Contents |
|---|---|---|
| `config.json` | `0600` | API URL, host ID, source key ID, enrollment timestamp, optional UPS alias |
| `device-key.pem` | `0600` | Local Ed25519 private key (PKCS8 PEM); never transmitted |
| `device-credential` | `0600` | Revocable API device credential |
| `spool.sqlite` (+ WAL/SHM files) | `0600` | Local signed-event spool and durable counters |

The directory is `0700`. The agent refuses to overwrite existing local key material, rejects
symlinked secret paths, verifies file ownership, and repairs group/other-readable permissions on
load. Never copy the private key or device credential to another machine, a ticket, a chat message or
source control.

## Operational presence vs evidence

| Signal | Interval | Storage | Sequence | Evidence bundle? |
|---|---|---|---|---|
| Operational presence | 15 s | SQLite metadata counter only; never the event spool | Independent durable presence sequence | No |
| `host_heartbeat` | 30 s during an active incident | SQLite evidence spool | Shared durable event sequence | Yes |
| `gpu_telemetry` | 30 s for device index 0 | SQLite evidence spool | Shared durable event sequence | Yes |
| `host_power_state` | Poll 5 s; emit on state change and at most one unchanged summary per 60 s | SQLite evidence spool | Shared durable event sequence | Yes |

Presence messages use the domain-separated signature
`incident-witness-host-presence-v1\n` + RFC 8785 JCS bytes. The API rejects lower or reused presence
sequences. A failed presence send consumes its sequence; the next tick uses the next value.

## Safe telemetry collection

Collectors use `child_process.execFile` with fixed executables, fixed argument arrays, no shell,
a 2-second timeout and a 64 KiB output cap. They never read system logs, arbitrary files or
environment variables for telemetry.

- GPU: `nvidia-smi -i 0 --query-gpu=index,name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,driver_version --format=csv,noheader,nounits`.
  Only the first GPU (`-i 0`) is summarised in this phase. A missing binary, timeout, non-zero exit,
  malformed output or `[N/A]` fields produce `collection_status: "unavailable"` or `"partial"`.
  Absent values are omitted and never reported as normal.
- UPS: `upsc <configured-alias>`. Missing NUT, a failed command or malformed output produces
  `state: "unavailable"`. `OL` maps to `online`, `OB` to `on_battery`, and `LB` (including `OB LB`)
  to `low_battery`. Unrecognised status tokens map to `unknown`.
- Host heartbeat: OS family, kernel version string and uptime from Node's `node:os`; agent health is
  `degraded` while the spool is at its quota.

There is no arbitrary command execution, no remote shell, no file upload and no raw log ingestion.

## SQLite spool, quota and sequence durability

- SQLite runs in WAL mode with `synchronous=FULL`, a busy timeout and an `integrity_check` on every
  open. A failed integrity check stops the agent; it never resets counters or repairs by discarding
  evidence.
- The evidence quota is 50 MiB of serialised signed envelopes. When full, the oldest non-critical
  observations (heartbeats and periodic GPU summaries) are dropped first. Power-state transitions,
  agent start/stop status and other critical records are preserved. If a critical record still
  cannot fit, it is not queued; the agent logs a quota warning, reports degraded health and keeps the
  existing spool intact. No fabricated normal reading is written.
- The next event sequence is allocated in a committed SQLite transaction **before** the event is
  signed and inserted. A crash or failed insert leaves a gap, never a reused number. The counter is
  only initialised for a new database and is never rolled back or reset. Sequence allocation is
  shared across all host event types.
- The operational-presence counter uses the same durable mechanism but a separate key.
- Upload is FIFO by local insertion order. Accepted and exact-duplicate uploads are removed. Network
  errors, `429` and `5xx` are retried with jittered exponential backoff (1 second base, 5 minute
  cap). Validation errors, revoked credentials and other non-retryable `4xx` responses stop the
  uploader and log only the safe error code. Queued evidence is not deleted because of a server-side
  validation failure.
- `409 INCIDENT_CLOSED` blocks further uploads for that incident. Its local events are retained, not
  silently deleted.

## Retry and shutdown behaviour

- Transient failures leave the signed event at the front of the spool. The agent retries with
  jittered exponential backoff and resumes across restarts.
- A non-retryable upload response stops evidence collection so the spool does not fill with records
  the API will reject. Operational presence continues unless its credential is also rejected.
- On `SIGINT`/`SIGTERM`, the agent stops loops, queues a `host_agent_status: stopped` event when the
  incident is still open, attempts a bounded flush (default 3 seconds) and closes the spool. Sudden
  power loss may produce no local stop event; this is an evidence gap, not a cause finding.
- A server-side signature, scope, sequence or revoked-key rejection is reported by safe code only.
  Never paste the credential or private key into a support request.

## Limitations in this phase

- No published package, systemd unit or installer is included. Run the foreground command under the
  operator's process supervisor of choice.
- The agent does not discover active sessions. The operator supplies the incident ID; this is an
  integration gap for the Phase 4 provider UI, not an agent-side claim that a session exists.
- Only GPU index 0 is collected. Multi-GPU summarisation requires a later approved change.
- The local test harness uses an HTTP mock of the documented API contracts plus injected collectors.
  Real `nvidia-smi`/`upsc` execution and enrollment against a disposable staging host were not
  available in this environment and are not claimed as tested.
- The provider controls the host, kernel, clock and telemetry binaries. A signature does not prove
  that the host was uncompromised or that a reading is true.
