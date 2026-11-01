#!/usr/bin/env bash
# Generates the seven scene voiceover files, concatenates them with one second
# of breathing room after each scene, and normalizes the final voiceover.
# Uses Microsoft Edge's neural TTS (edge-tts) and requires an internet connection.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIO_DIR="$SCRIPT_DIR/audio"
VOICE="${IW_DEMO_VOICE:-en-US-GuyNeural}"
RATE="${IW_DEMO_TTS_RATE:--2%}"
SCENE_GAP_SECONDS=1

SCENE_TEXTS=(
  "When a rented GPU fails on a decentralized network, the marketplace sees a disconnect, but they don't know why. Was it a power outage, an ISP failure, or a hardware crash? Incident Witness solves this by providing portable, cryptographically verifiable evidence."
  "Welcome to the Incident Witness workspace. Here, providers can register their GPU nodes, verify their endpoints, and start a bounded evidence session before a workload begins."
  "During an incident, the system correlates signed observations from three sources. The Host Agent in emerald, the Renter SDK in blue, and a platform-operated probe in cyan. This creates a deterministic timeline of exactly what happened and when."
  "When the session ends, the evidence is sealed. This generates a single, portable JSON bundle. All the events are cryptographically signed using Ed25519, so any tampering after the fact is detectable."
  "Anyone can verify this bundle using our public web verifier. Notice that this runs entirely in the browser—the file is never uploaded to a server. The signatures are valid, and the evidence is completely intact."
  "But if someone tries to alter the evidence—even by changing a single byte—the cryptographic check fails. The verifier immediately flags the bundle as invalid, proving the record has been tampered with."
  "Incident Witness brings cryptographic accountability to decentralized compute. Check out the live demo and the open-source code on GitHub. Thanks for watching."
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
command -v node >/dev/null 2>&1 || {
  echo "node is required to read the FFmpeg loudnorm analysis." >&2
  exit 1
}

mkdir -p "$AUDIO_DIR"
rm -f "$AUDIO_DIR"/scene-*.wav "$AUDIO_DIR"/scene-*.mp3 "$AUDIO_DIR"/scene-*.txt \
  "$AUDIO_DIR"/concat.txt "$AUDIO_DIR"/silence-1s.wav \
  "$AUDIO_DIR"/voiceover-raw.wav "$AUDIO_DIR"/voiceover.wav "$AUDIO_DIR"/voiceover.mp3

for index in "${!SCENE_TEXTS[@]}"; do
  scene_number=$((index + 1))
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

  # Resample before filtering: Edge TTS produces 24 kHz MP3, and a 12 kHz
  # lowpass at that source rate sits at Nyquist and clips the signal. Trim only
  # non-speech tails so the deliberate one-second beat is not doubled by TTS
  # trailing silence.
  ffmpeg -hide_banner -loglevel error -y \
    -i "$raw_file" \
    -af "aresample=48000,highpass=f=80,lowpass=f=12000,silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB,areverse" \
    -ac 1 -ar 48000 -c:a pcm_s16le "$scene_file"

  narration_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$scene_file")"
  if awk -v actual="$narration_duration" 'BEGIN { exit !(actual <= 0.1) }'; then
    echo "Scene ${scene_number}: narration is empty." >&2
    exit 1
  fi

  printf 'Scene %s: %.2fs narration\n' "$scene_number" "$narration_duration"
done

# A deliberate one-second beat after every scene. The recorder waits for the
# same scene duration plus one second, so the separate video and audio
# segments stay aligned without any apad/tpad stretching.
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "anullsrc=r=48000:cl=mono" \
  -t "$SCENE_GAP_SECONDS" -c:a pcm_s16le "$AUDIO_DIR/silence-1s.wav"

: >"$AUDIO_DIR/concat.txt"
for index in "${!SCENE_TEXTS[@]}"; do
  scene_number=$((index + 1))
  printf "file '%s'\n" "$AUDIO_DIR/scene-${scene_number}.wav" >>"$AUDIO_DIR/concat.txt"
  printf "file '%s'\n" "$AUDIO_DIR/silence-1s.wav" >>"$AUDIO_DIR/concat.txt"
done

ffmpeg -hide_banner -loglevel error -y \
  -f concat -safe 0 -i "$AUDIO_DIR/concat.txt" \
  -c:a pcm_s16le -ar 48000 -ac 1 "$AUDIO_DIR/voiceover-raw.wav"

total_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$AUDIO_DIR/voiceover-raw.wav")"

echo "==> Normalizing final voiceover to -16 LUFS"
ANALYSIS_FILE="$AUDIO_DIR/loudnorm-analysis.json"
ffmpeg -hide_banner -nostats -i "$AUDIO_DIR/voiceover-raw.wav" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" \
  -f null - 2>"$ANALYSIS_FILE"

if ! read -r measured_i measured_tp measured_lra measured_thresh target_offset < <(
  node -e '
    const fs = require("fs");
    const text = fs.readFileSync(process.argv[1], "utf8");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) process.exit(1);
    const value = JSON.parse(match[0]);
    console.log(
      value.input_i,
      value.input_tp,
      value.input_lra,
      value.input_thresh,
      value.target_offset,
    );
  ' "$ANALYSIS_FILE"
); then
  echo "Could not measure the concatenated voiceover for loudness normalization." >&2
  cat "$ANALYSIS_FILE" >&2
  exit 1
fi

if [[ -z "$measured_i" || -z "$measured_tp" || -z "$measured_lra" || -z "$measured_thresh" || -z "$target_offset" ]]; then
  echo "The loudness analysis did not return all five required values." >&2
  cat "$ANALYSIS_FILE" >&2
  exit 1
fi

ffmpeg -hide_banner -loglevel error -y \
  -i "$AUDIO_DIR/voiceover-raw.wav" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${measured_i}:measured_TP=${measured_tp}:measured_LRA=${measured_lra}:measured_thresh=${measured_thresh}:offset=${target_offset}:linear=true" \
  -t "$total_duration" \
  -ac 1 -ar 48000 -c:a pcm_s16le "$AUDIO_DIR/voiceover.wav"

ffmpeg -hide_banner -loglevel error -y \
  -i "$AUDIO_DIR/voiceover.wav" \
  -c:a libmp3lame -b:a 192k "$AUDIO_DIR/voiceover.mp3"

rm -f "$AUDIO_DIR/voiceover-raw.wav" "$AUDIO_DIR/loudnorm-analysis.json" "$AUDIO_DIR/silence-1s.wav"

final_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$AUDIO_DIR/voiceover.mp3")"
echo "Voiceover ready (voice only, -16 LUFS): $AUDIO_DIR/voiceover.mp3 (${final_duration}s)"
