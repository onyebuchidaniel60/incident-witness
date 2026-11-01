# Automated demo video

This directory contains the local-only pipeline that records the Incident Witness hackathon demo. It uses the existing local Playwright/E2E setup, Microsoft Edge neural TTS (`edge-tts`) for the voiceover and FFmpeg for the mix and render. No paid video or TTS API is used.

## Prerequisites

```bash
sudo apt update
sudo apt install ffmpeg -y
python3 -m pip install --user edge-tts
```

`edge-tts` requires an internet connection. If `edge-tts` is not on `PATH` after installation, add `~/.local/bin` to `PATH` or install it with `pipx install edge-tts`.

The pipeline reads the repository `.env` for the staging database and platform signing key, exactly like the existing Playwright and demo-harness commands. It only runs against the gated local test API (`NODE_ENV=test`, `IW_E2E_TEST_AUTH=true`) and staging data. It does not run against production.

## Run

```bash
npm run demo:video
# or
bash scripts/demo/assemble.sh
```

The pipeline:

1. builds the shared protocol/correlator/db packages;
2. generates the seven scene voiceover files with Edge TTS and concatenates `audio/voiceover.mp3`;
3. starts a local test API on `127.0.0.1:4110` and a local web app on `127.0.0.1:3110`;
4. seeds a labelled, simulated incident with host, renter and platform-probe observations, then seals and downloads the signed bundle;
5. records the 1280×720 Playwright flow;
6. synthesizes a quiet ambient bed, ducks it under the voiceover, and renders the MP4.

To keep the seeded staging rows for inspection:

```bash
IW_DEMO_KEEP_DATA=1 npm run demo:video
```

## Outputs

- Final video: `scripts/demo/incident-witness-demo.mp4`
- Raw recording: `scripts/demo/raw/*.webm`
- Voiceover: `scripts/demo/audio/voiceover.mp3`
- Sealed demo bundle: `scripts/demo/assets/demo-bundle.json`
- Tampered copy: `scripts/demo/assets/demo-bundle-tampered.json`

Generated audio, video, logs, state and assets are gitignored. The scripts are committed; the media files are not.

## Demo honesty

The seeded incident is explicitly `demoMode: true`; all seeded source events are `simulation_mode: true`, and the UI displays the “Demo / simulated evidence” label. The recording demonstrates the real API sealing and the real local browser verifier, including a one-byte tamper failure. It does not claim real hardware telemetry, a production API deployment or a physical root cause.

## Overrides

| Variable | Default | Purpose |
| --- | --- | --- |
| `IW_DEMO_VOICE` | `en-US-GuyNeural` | Edge TTS neural voice |
| `IW_DEMO_TTS_RATE` | `-2%` | Edge TTS speaking rate |
| `IW_DEMO_API_PORT` | `4110` | local API port |
| `IW_DEMO_WEB_PORT` | `3110` | local web port |
| `IW_DEMO_KEEP_DATA` | `0` | keep staged demo rows after rendering |
