# Troubleshooting Guide

This guide describes current user-facing error categories. Host-agent commands are documented in
`HOST_AGENT.md`; do not run guessed install commands or paste secrets into support threads.

| Symptom | Likely cause | Safe action |
|---|---|---|
| OTP not received | Wrong email, resend cooldown, mail/auth provider issue | Check email/spam, wait for cooldown, request once more; do not share OTP |
| DNS challenge fails | TXT record not published exactly, propagation pending, challenge expired | Compare record name/value; allow DNS propagation; refresh challenge if expired |
| Host endpoint cannot verify | No public route, invalid TLS certificate, wrong health path/status, private DNS target | Confirm hostname/HTTPS 443 and fixed health path; NAT-only host is outside MVP |
| Unsafe endpoint rejected | Hostname resolves to private/reserved/metadata address | Do not bypass guard; use a dedicated public endpoint that meets policy |
| Enrollment code rejected | Expired, previously redeemed, wrong host or malformed code | Issue a new code; old one remains invalid |
| Host agent stays offline | API URL/network, credential revoked, agent stopped, local permission or clock issue | Run `iw-agent status`; check the safe halt flag/error code; never paste credential/private key into support chat |
| Agent upload halted on a 4xx error | Signature/schema/scope validation failure, revoked key or closed incident | Read the safe code in the agent log; do not delete queued events or retry blindly; fix the cause or re-enroll |
| Presence sequence rejected | Local spool restored from an older copy, duplicated agent process or clock issue | Stop duplicate agents; do not reset the spool counter; revoke/re-enroll only if the key is compromised |
| GPU telemetry unavailable | `nvidia-smi` absent, device/driver not available or command timeout | Dashboard should show unavailable; this is not proof of a GPU fault |
| UPS telemetry unavailable | NUT not installed/configured or UPS unreachable | Dashboard should show unavailable; do not interpret as stable power |
| Agent spool is full | API unavailable for an extended period or local disk quota reached | Restore connectivity/check disk; the agent drops oldest non-critical observations first and reports degraded/spool-full state. Evidence from the dropped period is missing; do not delete the spool manually unless the user accepts evidence loss |
| Renter invitation expired | 15-minute TTL passed or invitation already redeemed | Provider issues a new invitation |
| Renter SDK cannot join | Invitation invalid, endpoint hostname missing, API URL wrong or state directory already enrolled | Check the safe code; supply `endpointHostname` from the invitation context; do not reuse the invitation token |
| Renter SDK queue full | API offline for an extended period or 5 MiB local cap reached | Restore connectivity; inspect `droppedEvents`; dropped observations are missing evidence, not normal operation |
| Renter observations absent | SDK not joined, runtime stopped or API unavailable | Check renter SDK status and invitation; absence is a gap, not evidence of normal workload |
| Probe worker cannot start | Missing/revoked platform-probe key, wrong DB role or configuration | Run `npm run db:provision-probe-key` with operator secrets; verify `IW_PLATFORM_PROBE_KEY_ID` matches the registered `witness_keys` row |
| Probe worker SSRF rejection | Target resolved to a private/reserved/metadata address or mixed public/private answers | Do not bypass; re-verify the provider endpoint. This is a policy/infrastructure error, not proof of host outage |
| Probe worker has no real observations | Worker not deployed, key missing, no active collecting job or probe-service error | Check worker logs, job ages and key status; probe-service failure is not a host outage |
| Probe is missing | Worker unavailable, DNS/TLS failure, lease backlog or target not reachable | Check platform worker health; service failure is not classified as host outage |
| Session cannot be created | Host inactive, old active session, max-three account limit or no fresh heartbeat | Resolve host state or finalize existing session |
| Seal fails | No accepted events, platform signing key unavailable, invalid event or DB transaction failure | Keep session awaiting finalization; retry only after cause fixed; do not mark sealed manually |
| Bundle verification fails | File changed, signature invalid, unknown/revoked platform key, unsupported version | Keep original file; check exact verification failure; do not edit signature/data |
| Bundle shows UNKNOWN | Evidence missing, conflicting or insufficient | This is an intentional outcome; do not infer cause from absent data |
| Preview URL unavailable | Deployment failure, missing env, Vercel project access or wrong deployed commit | Agent reports precise blocker/commit; do not use a made-up URL |

## Information to include when reporting a bug

- App/agent/SDK version and protocol version.
- Approximate timestamp with timezone.
- Safe request ID or event ID.
- Error code and exact non-sensitive message.
- Host/session ID only when appropriate and shared securely.
- Steps to reproduce and whether a source was simulated.

Do not include OTPs, raw enrollment/invitation tokens, credentials, private keys, `.env` values, workload content or unredacted evidence bundle in public issue trackers.
