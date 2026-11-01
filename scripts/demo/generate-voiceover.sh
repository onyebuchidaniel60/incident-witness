#!/usr/bin/env bash
# Generates the seven scene voiceover files and the concatenated voiceover.mp3
# using Microsoft Edge's neural TTS (edge-tts). Requires an internet connection.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIO_DIR="$SCRIPT_DIR/audio"
VOICE="${IW_DEMO_VOICE:-en-US-GuyNeural}"
RATE="${IW_DEMO_TTS_RATE:--2%}"

SCENE_DURATIONS=(15 20 20 15 20 15 30)
SCENE_TEXTS=(
  "When a rented GPU node fails on a decentralized network, the marketplace sees a disconnect, but not the cause. Incident Witness solves this."
  "Here is the Incident Witness workspace. It correlates signed observations from three sources: a host agent, a renter client, and an external platform probe."
  "Here is the deterministic timeline. Host events are emerald, renter events are blue, and platform probes are cyan. It clearly shows what happened and exactly when."
  "When the incident is sealed, it generates a portable JSON evidence bundle, signed with Ed25519."
  "Anyone can go to the public verifier and upload the bundle. This runs entirely in the browser, proving the integrity of the evidence offline."
  "If anyone tries to alter the evidence, even by a single byte, the cryptographic check fails and shows INVALID."
  "Incident Witness brings cryptographic accountability to decentralized compute. Check out the code on GitHub."
)

command -v edge-tts >/dev/null 2>&1 || {
  echo "edge-tts is required. Install it with: python3 -m pip install --user edge-tts" >&2
  echo "Then ensure ~/.local/bin is on PATH, or install it with pipx." >&2
  exit 1
}
command -v ffmpeg >/dev/null 2>&1 || {
  echo "ffmpeg is required. Install it with: sudo apt install ffmpeg -y" >&2
  exit 1
}
command -v ffprobe >/dev/null 2>&1 || {
  echo "ffprobe is required (normally installed with ffmpeg)." >&2
  exit 1
}

mkdir -p "$AUDIO_DIR"
rm -f "$AUDIO_DIR"/scene-*.wav "$AUDIO_DIR"/scene-*.mp3 "$AUDIO_DIR"/scene-*.txt "$AUDIO_DIR"/concat.txt

for index in "${!SCENE_TEXTS[@]}"; do
  scene_number=$((index + 1))
  duration="${SCENE_DURATIONS[$index]}"
  text_file="$AUDIO_DIR/scene-${scene_number}.txt"
  raw_file="$AUDIO_DIR/scene-${scene_number}.raw.mp3"
  scene_file="$AUDIO_DIR/scene-${scene_number}.wav"

  printf '%s' "${SCENE_TEXTS[$index]}" >"$text_file"

  # Edge TTS uses the online Microsoft Edge read-aloud service. Retry a few
  # times so a transient network error does not abort the whole pipeline.
  generated=0
  for attempt in 1 2 3; do
    if edge-tts \
      --voice "$VOICE" \
      --rate="$RATE" \
      --text "${SCENE_TEXTS[$index]}" \
      --write-media "$raw_file"; then
      generated=1
      break
    fi
    echo "Scene ${scene_number}: edge-tts attempt ${attempt} failed; retrying..." >&2
    sleep 3
  done

  if [[ "$generated" -ne 1 || ! -s "$raw_file" ]]; then
    echo "Scene ${scene_number}: edge-tts did not produce audio." >&2
    echo "Check the internet connection and the voice name (${VOICE})." >&2
    exit 1
  fi

  raw_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$raw_file")"
  if awk -v actual="$raw_duration" -v limit="$duration" 'BEGIN { exit !(actual > limit) }'; then
    echo "Scene ${scene_number} narration is ${raw_duration}s, longer than its ${duration}s slot." >&2
    echo "Use a slightly faster IW_DEMO_TTS_RATE or shorten the scene text before rerunning." >&2
    exit 1
  fi

  # Light processing for a clear, consistent voice, then pad to the exact
  # scene slot so the concatenated voiceover follows 0:00–2:15.
  ffmpeg -hide_banner -loglevel error -y \
    -i "$raw_file" \
    -af "highpass=f=80,lowpass=f=12000,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-16:TP=-1.5:LRA=9,apad=whole_dur=${duration},atrim=0:${duration},aresample=48000" \
    -ac 1 -ar 48000 -c:a pcm_s16le "$scene_file"

  printf "file '%s'\n" "$scene_file" >>"$AUDIO_DIR/concat.txt"
  printf 'Scene %s: %.2fs narration in %ss slot\n' "$scene_number" "$raw_duration" "$duration"
done

ffmpeg -hide_banner -loglevel error -y \
  -f concat -safe 0 -i "$AUDIO_DIR/concat.txt" \
  -af "apad=whole_dur=135" \
  -c:a pcm_s16le -ar 48000 -ac 1 "$AUDIO_DIR/voiceover.wav"

ffmpeg -hide_banner -loglevel error -y \
  -i "$AUDIO_DIR/voiceover.wav" \
  -c:a libmp3lame -b:a 192k "$AUDIO_DIR/voiceover.mp3"

echo "Voiceover ready: $AUDIO_DIR/voiceover.mp3"
