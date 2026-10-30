# Research Findings, Assumptions and Validation Register

**Status:** Research snapshot and risk register; not a claim of complete market validation.  
**Underlying research:** “Decentralize AI Hackathon — Ideation and Concept Validation”, research initiated 30 October 2026.  
**Decision:** Operator selected Incident Witness for product design and implementation. The previous report's “do not advance yet” recommendation is superseded as a project-selection decision, but its caveats remain active risks.

## 1. Evidence-supported problem context

The initial research described a GPU host disappearing during an active rental. A marketplace can observe disconnection or outage but may not independently know whether the interruption was related to power, upstream network reachability, hardware/driver issues, a graceful workload/host exit, intentional shutdown or an unknown failure.

The research recorded a first-hand community account from a Vast.ai host who reported reliability penalties associated with power outages outside their control. Replies also raised the counterargument that power/network continuity is part of the provider's service responsibility. This is important: evidence of an external power event does not automatically mean marketplace reliability penalties should be removed. A service interruption can still matter to a renter even when the provider did not deliberately cause it.

Research summarized adjacent platform/tool behaviour:

| Product/tool | Research observation | Limitation relative to Incident Witness hypothesis |
|---|---|---|
| Vast.ai | Tracks host disconnects/outages/errors and reliability | Public evidence reviewed did not establish a portable provider+renter+probe evidence workflow |
| Auditmos | Fleet, power, earnings and operational management | Public case reviewed described fleet management, not independent incident adjudication |
| VerifyCompute | Hardware verification and signed telemetry | Not focused on correlating renter, provider and external reachability observations |
| NVIDIA Attribution | Reconstructs GPU workload failure chains | Research described it as designed for large GPU fleets rather than independent marketplace providers |
| NUT / Grafana | UPS status, runtime, telemetry and visualization | Not themselves a multi-party marketplace-ready incident record |
| Meshive | Documents maintenance/downtime policy treatment | Shows a policy approach, not independently verified market adoption or product traction |
| NiceGPU | Hosting agreement permits downtime to affect rankings/delisting | Shows the issue extends beyond one marketplace; not evidence of demand for Witness |

These are research notes, not a fresh re-audit of each competitor's product at implementation time. Recheck capabilities before making public comparative claims.

## 2. Conceptual mechanism

Incident Witness combines:

1. Provider-side observations from the Linux host agent (heartbeat, available UPS state, bounded GPU summary and agent status).
2. Renter-side observations from an incident-scoped SDK (heartbeat and workload endpoint result).
3. A platform-operated network probe checking a provider-verified HTTPS endpoint from a separate worker process.
4. Time correlation, source identity, data gaps, deterministic explanation and evidence grade.
5. A portable JSON bundle signed by platform and source keys and verifiable offline.

The differentiator is the specific multi-source, time-correlated portable evidence workflow—not any claim that UPS telemetry, network probes, Ed25519 or GPU monitoring are individually novel.

## 3. Critical epistemic limits

- Cryptographic signature means the bytes verify against a public key. It does not certify that the key holder is honest or that readings were accurate.
- Host-controlled telemetry can be spoofed by a malicious/compromised host.
- Renter-side observations are controlled by the renter workload/runtime.
- The platform probe is operated by Incident Witness. It is a separate process, not an independent third-party organisation.
- A failed probe can reflect probe infrastructure or upstream DNS/TLS issues. The system must distinguish its own probe failure from endpoint reachability loss.
- A single probe location cannot identify the exact ISP or upstream path.
- A temporal pattern can be consistent with power-related interruption without proving electrical root cause.
- A hardware/driver classification should not be emitted unless a supported, validated signal exists. A `nvidia-smi` read failure is not sufficient evidence of an XID fault.
- `UNKNOWN` is an important and successful outcome when evidence is insufficient.

## 4. Unvalidated adoption and commercial assumptions

| Assumption | Status | Why it matters | Validation action |
|---|---|---|---|
| Providers experience reliability/earnings consequences from outages | Some anecdotal evidence; not representative | Confirms possible pain but not its scale | Interview 5–8 hosts across independent marketplaces |
| Existing platform support accepts third-party evidence | Unknown | Without a review path, evidence may not change a marketplace decision | Ask platform support/operator and experienced hosts how appeals are handled |
| Providers will install a host agent | Unknown | Agent install/permissions are a key adoption cost | Observe installation with 3–5 hosts; measure friction |
| Renters will run an SDK/client | Unknown | Third perspective may be difficult to obtain | Test a minimal drop-in client with workload operators |
| Platform-operated probe is useful | Hypothesis | It is not a fully independent witness | Ask users whether separate vantage point adds value; explore later 3rd-party probe operators |
| Users will pay or marketplaces will integrate | No evidence found | Determines product viability after hackathon | Validate purchasing authority, willingness to pay and API/review process |
| Exact workflow is materially novel | Not proven | Prior-art coverage incomplete | Search complete hackathon archive, repositories, patents and incident attestation projects |

Suggested interview questions:

1. Have you experienced downtime that affected reliability score, earnings, listing position or customer trust?
2. How does the marketplace currently determine why a host disappeared?
3. Have you disputed an outage classification or penalty? What happened?
4. What telemetry, logs, UPS tools or monitoring do you already use?
5. Would an independently verifiable evidence package change anything financially or operationally? Who would need to accept it?
6. Would you install a lightweight Linux agent and/or add a renter SDK? What would stop you?

Do not lead interviews by pitching the solution; collect actual past incidents and current workarounds.

## 5. Implementation assumptions

- Linux x86_64 host is available for initial agent test.
- Host has a public HTTPS health endpoint on a domain the provider controls. This excludes hosts behind NAT with no reachable public endpoint from the MVP.
- Actual GPU and UPS telemetry are optional capabilities; absence must be explicit.
- A real containerized test endpoint can be executed for a demo; injected/simulated power and WAN events remain marked simulated.
- A platform-operated probe is a useful first step while third-party witness operators remain future scope.
- Supabase/Vercel/Render account availability, pricing and limits must be confirmed by operator before setup.
- Nosana access and participant credits are not presumed; no mandatory Nosana integration.
- Arweave is excluded due permanence/privacy concerns and because offline signature verification does not require a blockchain.

## 6. Hackathon context and caution

The project was considered in the Decentralize AI Hackathon organized by HackerNoon, Nosana, Arweave and MEXC. The research snapshot described the overall event as 1 June 2026 to 27 February 2027, Round 1 ending 31 October 2026 and Round 2 running November 2026 to February 2027. It identified themes including decentralized compute infrastructure, verifiable AI/provenance, open inference, data sovereignty and agent infrastructure. It also noted that a HackerNoon project/build story is part of submission—not merely a GitHub repo.

Before submission, verify current official rules, the exact Round 2 deadline/time zone, eligible tags, required working evidence, any demo requirements and credit eligibility. Do not rely on the research snapshot as a live rules page. A successful technical MVP does not by itself prove hackathon eligibility or novelty.

## 7. Prior research limitations retained

- The Round 1 submission archive could not be fully inspected.
- No comprehensive patent search was completed.
- No systematic full-repository audit of every adjacent tool was completed.
- No user interviews had been conducted at research time.
- No market acceptance or willingness-to-pay evidence was identified.
- No Nosana API key/credit claim or real job execution was tested.
- Private or unindexed implementations may exist.

## 8. Go-forward validation gates

The project can be technically implemented as selected, but the following must be checked before external claims or commercialization:

- [ ] Complete accessible Round 1 archive search and review nearest submissions.
- [ ] Search patent/publication material for multi-party incident attestation, signed infrastructure telemetry and outage attribution.
- [ ] Interview actual independent GPU providers and renters.
- [ ] Obtain evidence whether marketplaces accept, ignore or can integrate external records.
- [ ] Test a real agent deployment on a host with public HTTPS and available telemetry.
- [ ] Confirm whether the renter SDK integration is operationally realistic.
- [ ] Confirm current hackathon rules and submission timeline.

The operator's selection authorizes product blueprint and implementation; it does not authorize unsupported claims of novelty, demand or marketplace acceptance.
