# Troubleshooting Guide (Planned)

This guide describes expected user-facing error categories. Exact UI copy and commands will be added after implementation and testing; do not run guessed install commands.

| Symptom | Likely cause | Safe action |
|---|---|---|
| OTP not received | Wrong email, resend cooldown, mail/auth provider issue | Check email/spam, wait for cooldown, request once more; do not share OTP |
| DNS challenge fails | TXT record not published exactly, propagation pending, challenge expired | Compare record name/value; allow DNS propagation; refresh challenge if expired |
| Host endpoint cannot verify | No public route, invalid TLS certificate, wrong health path/status, private DNS target | Confirm hostname/HTTPS 443 and fixed health path; NAT-only host is outside MVP |
| Unsafe endpoint rejected | Hostname resolves to private/reserved/metadata address | Do not bypass guard; use a dedicated public endpoint that meets policy |
| Enrollment code rejected | Expired, previously redeemed, wrong host or malformed code | Issue a new code; old one remains invalid |
| Host agent stays offline | API URL/network, credential revoked, agent stopped, local permission or clock issue | Check local agent status and safe error code; never paste credential/private key into support chat |
| GPU telemetry unavailable | `nvidia-smi` absent, device/driver not available or command timeout | Dashboard should show unavailable; this is not proof of a GPU fault |
| UPS telemetry unavailable | NUT not installed/configured or UPS unreachable | Dashboard should show unavailable; do not interpret as stable power |
| Agent spool is full | API unavailable for an extended period or local disk quota reached | Restore connectivity/check disk; agent reports data gap; do not delete spool manually unless user accepts evidence loss |
| Renter invitation expired | 15-minute TTL passed or invitation already redeemed | Provider issues a new invitation |
| Renter observations absent | SDK not joined, runtime stopped or API unavailable | Check renter SDK status and invitation; absence is a gap, not evidence of normal workload |
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
