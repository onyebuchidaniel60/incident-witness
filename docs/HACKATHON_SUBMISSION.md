# Decentralize AI Hackathon — Submission Workstream

**Status:** Planning notes only. Confirm current official rules before submission.

## Competition context from the research snapshot

The project was researched for the Decentralize AI Hackathon organized by HackerNoon, Nosana, Arweave and MEXC. The 30 October 2026 research snapshot described an overall competition period of 1 June 2026 through 27 February 2027, with Round 1 ending 31 October and Round 2 running November 2026 through 27 February 2027. It described the focus as open decentralized AI infrastructure, including compute, verifiable AI/provenance, data sovereignty, open inference and agent infrastructure.

The research snapshot noted that project/build documentation published on HackerNoon and eligible sponsored tags are part of submission; uploading a repository alone is not necessarily sufficient. Current rules and exact cutoff must be rechecked before planning a deadline.

## Evidence-driven submission story

Suggested technical story sequence:

1. Explain the evidence problem: a host disconnect is observable, cause is not necessarily known.
2. Explain current limitations and carefully qualified adjacent tooling.
3. Define the protocol's trust model and limitations.
4. Show host agent enrollment and a signed heartbeat.
5. Show renter-side observation and platform-operated probe result.
6. Show an event timeline with source labels, timestamps and gaps.
7. Demonstrate deterministic rule output with cautious language.
8. Export and verify bundle offline.
9. Change one byte and show verification failure.
10. Clearly separate actual collector measurements from simulated power/network signals.

## Automated demo video pipeline

The local pipeline at `scripts/demo/` records the demo with Playwright, generates the voiceover with the free Microsoft Edge neural TTS (`edge-tts`), and assembles the final MP4 with FFmpeg. It does not use a paid video or TTS API.

```bash
sudo apt install ffmpeg -y
python3 -m pip install --user edge-tts
npm run demo:video
```

The generated file is `scripts/demo/incident-witness-demo.mp4` (2:15, 1280×720). The final audio is the normalized voiceover only, at approximately −16 LUFS; there is no background music. Audio, raw recordings, bundles, logs and the final MP4 are gitignored. The pipeline runs against the local test-mode API and staging database with the gated E2E seam; it cleans up the disposable demo rows unless `IW_DEMO_KEEP_DATA=1` is set. See `scripts/demo/README.md` for prerequisites, overrides and outputs.

The recorded incident is a labelled demo: `demoMode: true`, every seeded event uses `simulation_mode: true`, and the UI shows “Demo / simulated evidence”. The video demonstrates the real API seal and the real local browser verifier, including the one-byte tamper failure. It does not claim real hardware telemetry, a deployed production API or a physical root cause.

## Demo honesty checklist

- [ ] Working web app and real deployed URL.
- [ ] Actual signed event ingestion, not a screenshot-only mock.
- [ ] Actual bundle seal and offline verifier.
- [ ] Actual tamper detection.
- [ ] A real containerized endpoint/workload where feasible.
- [ ] Any simulated UPS, power-loss, WAN or driver events marked simulated in the event, UI, bundle and article.
- [ ] Do not claim live Nosana/Arweave integration unless a real test is complete.
- [ ] Do not claim marketplace acceptance, reliability score improvements, commercial demand or global novelty.
- [ ] Show unknown/insufficient result as a valid system outcome.

## Rule verification before submission

Recheck:

- Round 2 submission deadline, exact time zone and date.
- Eligible sponsored tags and article publishing requirements.
- Required working proof (repository, deployed URL, metrics, demo, video or reproducible steps).
- Credit/compute eligibility and current availability.
- Whether the project may submit in both rounds and any prior-entry restrictions.
- Judge criteria and judging format.

Official starting points to verify at that time:

- https://decentralizeai.tech/
- https://decentralizeai.tech/faq
- https://hackernoon.com/tagged/decentralize-ai

This document is not an authoritative or current rulebook. Save the official rule version/date and any organizer clarification used for the final entry.
