# Incident Witness

**When infrastructure fails, evidence speaks.**

Incident Witness is a portable incident-evidence protocol for decentralized compute. It collects signed, bounded observations from a GPU host, a renter-side workload client and a separately operated platform probe; correlates them into a deterministic timeline; and seals the result into an offline-verifiable JSON evidence bundle. It is built for a world where a disconnect is visible, but the reason is not.

## 🚀 Try the Live Product (User Quickstart)

**Live app:** [https://incident-witness.vercel.app](https://incident-witness.vercel.app)

1. Click **Login** and enter your email to receive a Supabase magic link.
2. Inside the Workspace, click **Add a host** to register a GPU node. Publish the one-time DNS TXT challenge and serve the fixed HTTPS health endpoint.
3. Start an evidence session and invite a renter. The invitation is single-use and expires after 15 minutes.
4. Once the session is sealed, click **Download Bundle** on the incident page.
5. Go to the [`/verify`](https://incident-witness.vercel.app/verify) page and upload the bundle. Verification runs locally in your browser and checks the manifest digest, platform signature, source certificates, event signatures and ordering.

> **Staging note:** the hosted site runs against the staging Supabase project and requires a reachable Fastify API configured through `NEXT_PUBLIC_API_BASE_URL`. If the staging API is unavailable, use the local development flow below. The live site is a reference demo, not a production marketplace service.

## 🏗️ Architecture & How It Works

Incident Witness correlates three independent source categories during one bounded evidence session:

- **Host Agent:** a Linux service on the provider's GPU host polling NVIDIA telemetry, UPS state and signed heartbeats. Missing sensors are reported as unavailable, never as normal readings.
- **Renter SDK:** an incident-scoped TypeScript client running alongside the renter workload, recording workload-side reachability and heartbeats without collecting prompts, model data, files or credentials.
- **Platform Probe:** a separate, SSRF-safe external network check against the provider's verified HTTPS health endpoint. It is platform-operated, not an independent third party.

Every observation is signed with **Ed25519** over **RFC 8785 canonical JSON**, hashed with **SHA-256**, scoped to a source key and incident, and appended to an immutable evidence record. When the session is sealed, the platform produces one portable **`bundle.json`** containing the ordered events, source certificates, gaps, deterministic assessment, manifest digest and platform signature.

The browser verifier and offline CLI verify the same bundle against locally pinned platform public keys. A signature establishes integrity and provenance from a key; it does not establish that a sensor was truthful or that an inferred cause is correct.

Further detail: [Protocol v1](docs/PROTOCOL.md), [Architecture](docs/planning/ARCHITECTURE.md), [API reference](docs/API_REFERENCE.md), [Provider guide](docs/USER_GUIDE.md).

## 💻 Local Development (Developer Quickstart)

### Prerequisites

- Node.js **26.13.0** and npm 11.x (pinned in `.node-version` / `package.json`)
- A Supabase staging project with Postgres and Auth enabled
- Network access to the staging database for migrations

### Setup

```bash
git clone https://github.com/onyebuchidaniel60/incident-witness.git
cd incident-witness
cp .env.example .env
npm ci
```

Open `.env` and set the **staging** Supabase credentials, database URLs, token pepper and platform signing values. Never commit `.env`, private keys, database credentials or service-role material. Browser-visible configuration must stay limited to `NEXT_PUBLIC_*` values. See [Configuration](docs/CONFIGURATION.md) for the full variable contract.

### Database and signing key

```bash
npm run db:provision-roles
npm run db:migrate
npm run db:provision-platform-key
npm run db:migrate:status
```

`DATABASE_URL_MIGRATOR` is used only for migrations. The API uses `DATABASE_URL_IW_API`; the probe worker uses `DATABASE_URL_IW_WORKER`. Both runtime roles are non-superuser and do not bypass RLS.

### Run the stack

```bash
# Terminal 1 — Fastify API
npm run dev:api

# Terminal 2 — Next.js web app
npm run dev
```

The web app runs at `http://localhost:3000`; the API defaults to `http://localhost:4000`. Set `NEXT_PUBLIC_API_BASE_URL` and `IW_ALLOWED_WEB_ORIGINS` consistently. For deployment details, see [Deployment](docs/DEPLOYMENT.md) and [`render.yaml`](render.yaml).

## 🧪 Testing

```bash
npm test
npm run test:e2e
npm run test:integration --workspace @incident-witness/api
npm run test:integration --workspace @incident-witness/probe-worker
npm run test:integration --workspace @incident-witness/demo-harness
npm run verify -- path/to/bundle.json
```

The full unit suite covers the protocol, correlator, host agent, renter SDK, probe worker, API and database foundation. The Playwright suite exercises the provider journey, authentication boundaries, local verifier, valid/tampered bundles, responsive layout and public-link integrity. Integration suites require the approved staging secrets.

For a labelled end-to-end synthetic lifecycle:

```bash
npm run demo
```

It creates a disposable staging incident, seals a fully labelled evidence bundle and verifies both the original and a one-byte tampered copy with the offline CLI.

## ⚠️ Limitations & Trust Boundaries

> A valid signature proves that data has not changed after it was signed by a particular key. It does not prove that a sensor was truthful, a host was uncompromised, or an inferred cause is correct. Incident Witness reports evidence patterns and unknowns; it does not adjudicate a marketplace dispute.

- The platform probe is operated by Incident Witness, not by an independent third-party organisation.
- Missing UPS, GPU, renter or probe observations are represented as unavailable or as gaps, never as healthy defaults.
- Capture is bounded to an active session. Events before the session are not reconstructed, and a valid signature is not proof of physical root cause.
- Incident Witness does not change reliability scores, excuse downtime, move money, integrate with a marketplace, or provide AI-generated diagnosis.
- The MVP is provider-neutral. It does not assert marketplace integrations or production service-level commitments.

## 🔗 Hackathon Submission

Incident Witness was built for the **Decentralize AI Hackathon** organized by HackerNoon, Nosana, Arweave and MEXC.

- **Live App:** [https://incident-witness.vercel.app](https://incident-witness.vercel.app)
- **Demo Video:** `[INSERT YOUTUBE LINK]` — publication pending; the reproducible local pipeline is documented in [`scripts/demo/README.md`](scripts/demo/README.md).
- **HackerNoon Article:** `[INSERT HACKERNOON LINK]` — publication pending.
- **GitHub Repo:** [https://github.com/onyebuchidaniel60/incident-witness](https://github.com/onyebuchidaniel60/incident-witness)

> The hosted deployment uses staging data and public Supabase configuration. The Fastify API and probe worker are not deployed from this repository state; provider data pages require a reachable API origin via `NEXT_PUBLIC_API_BASE_URL`.

## Documentation

- In-app documentation and server guide: [`/docs`](https://incident-witness.vercel.app/docs)
- Repository documentation index: [`docs/README.md`](docs/README.md)
- Changelog: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)
- Planning and architecture: [`docs/planning/`](docs/planning/)
- Host agent: [`docs/HOST_AGENT.md`](docs/HOST_AGENT.md)
- Renter SDK: [`docs/RENTER_SDK.md`](docs/RENTER_SDK.md)
- Probe worker: [`docs/PROBE_WORKER.md`](docs/PROBE_WORKER.md)
- Privacy and security: [`docs/PRIVACY_SECURITY.md`](docs/PRIVACY_SECURITY.md)

For coding-agent and contribution rules, read [`AGENTS.md`](AGENTS.md). The repository is implemented one task/phase at a time; architecture, security, evidence-claim and state-machine changes require operator approval.
