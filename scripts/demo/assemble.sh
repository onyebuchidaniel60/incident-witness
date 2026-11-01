#!/usr/bin/env bash
# End-to-end demo pipeline:
#   1. build shared packages
#   2. generate the TTS voiceover
#   3. start a local test-mode API and web app
#   4. seed a labelled, signed demo incident
#   5. record the Playwright flow
#   6. use the normalized voiceover only (no background music)
#   7. render incident-witness-demo.mp4
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUDIO_DIR="$SCRIPT_DIR/audio"
RAW_DIR="$SCRIPT_DIR/raw"
LOG_DIR="$SCRIPT_DIR/logs"
TIMELINE_FILE="$SCRIPT_DIR/timeline.json"
OUTPUT="$SCRIPT_DIR/incident-witness-demo.mp4"

API_PORT="${IW_DEMO_API_PORT:-4110}"
WEB_PORT="${IW_DEMO_WEB_PORT:-3110}"
DNS_FILE="${IW_E2E_DNS_FILE:-/tmp/opencode/iw-demo-dns.json}"
DEMO_USER_ID="${IW_E2E_USER_ID:-d4444444-4444-4444-8444-444444444444}"
DEMO_TOKEN="${IW_E2E_TOKEN:-demo-provider-token}"

mkdir -p "$AUDIO_DIR" "$RAW_DIR" "$LOG_DIR"
rm -f "$RAW_DIR"/*.webm

for command in ffmpeg ffprobe edge-tts curl node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    echo "Install FFmpeg with: sudo apt update && sudo apt install ffmpeg -y" >&2
    echo "Install Edge TTS with: python3 -m pip install --user edge-tts" >&2
    exit 1
  fi
done

API_PID=""
WEB_PID=""

stop_server() {
  local pid="${1:-}"
  if [[ -z "$pid" ]]; then return 0; fi
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 25); do
    if ! kill -0 "$pid" 2>/dev/null; then return 0; fi
    sleep 0.2
  done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

cleanup() {
  set +e
  stop_server "$WEB_PID"
  stop_server "$API_PID"
  WEB_PID=""
  API_PID=""
  if [[ "${IW_DEMO_KEEP_DATA:-0}" != "1" ]]; then
    "$ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/seed.ts" --cleanup >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "==> Building shared packages"
npm run build --workspace @incident-witness/protocol >/dev/null
npm run build --workspace @incident-witness/correlator >/dev/null
npm run build --workspace @incident-witness/db >/dev/null

echo "==> Generating voiceover"
bash "$SCRIPT_DIR/generate-voiceover.sh"

echo "==> Starting local test API on :$API_PORT"
(
  cd "$ROOT/apps/api"
  exec setsid env \
    NODE_ENV=test \
    PORT="$API_PORT" \
    APP_BASE_URL="http://127.0.0.1:$WEB_PORT" \
    IW_API_BASE_URL="http://127.0.0.1:$API_PORT" \
    IW_ALLOWED_WEB_ORIGINS="http://127.0.0.1:$WEB_PORT,http://localhost:$WEB_PORT" \
    IW_E2E_TEST_AUTH=true \
    IW_E2E_TOKEN="$DEMO_TOKEN" \
    IW_E2E_USER_ID="$DEMO_USER_ID" \
    IW_E2E_DNS_FILE="$DNS_FILE" \
    IW_ENABLE_DEMO_SESSIONS=true \
    IW_LOG_LEVEL=warn \
    "$ROOT/node_modules/.bin/tsx" src/server.ts
) >"$LOG_DIR/api.log" 2>&1 &
API_PID=$!

echo "==> Starting local web app on :$WEB_PORT"
(
  cd "$ROOT/apps/web"
  exec setsid env \
    NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:$API_PORT" \
    NEXT_PUBLIC_IW_E2E_TEST_AUTH=true \
    NEXT_PUBLIC_IW_E2E_TOKEN="$DEMO_TOKEN" \
    NEXT_PUBLIC_IW_ENABLE_DEMO_SESSIONS=true \
    IW_E2E_TEST_AUTH=true \
    IW_E2E_TOKEN="$DEMO_TOKEN" \
    "$ROOT/node_modules/.bin/next" dev --port "$WEB_PORT"
) >"$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!

wait_for_url() {
  local url="$1" label="$2" pid="$3"
  for _ in $(seq 1 180); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then return 0; fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$label exited before becoming ready. Last log lines:" >&2
      tail -n 30 "$LOG_DIR/$(basename "$label").log" 2>/dev/null || true
      return 1
    fi
    sleep 1
  done
  echo "$label did not become ready at $url" >&2
  return 1
}

wait_for_url "http://127.0.0.1:$API_PORT/health/live" "api" "$API_PID"
wait_for_url "http://127.0.0.1:$WEB_PORT/" "web" "$WEB_PID"

echo "==> Seeding labelled demo incident"
env \
  IW_DEMO_API_URL="http://127.0.0.1:$API_PORT" \
  IW_E2E_TOKEN="$DEMO_TOKEN" \
  IW_E2E_USER_ID="$DEMO_USER_ID" \
  IW_E2E_DNS_FILE="$DNS_FILE" \
  "$ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/seed.ts"

echo "==> Recording Playwright video"
env \
  DEMO_BASE_URL="http://127.0.0.1:$WEB_PORT" \
  IW_E2E_TOKEN="$DEMO_TOKEN" \
  "$ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/record.ts"

stop_server "$WEB_PID"
stop_server "$API_PID"
WEB_PID=""
API_PID=""

RAW_VIDEO="$(node -p "JSON.parse(require('fs').readFileSync('$TIMELINE_FILE','utf8')).rawVideo")"
if [[ ! -f "$RAW_VIDEO" ]]; then
  echo "Raw Playwright video not found: $RAW_VIDEO" >&2
  exit 1
fi

if [[ ! -f "$AUDIO_DIR/voiceover.mp3" ]]; then
  echo "Normalized voiceover not found: $AUDIO_DIR/voiceover.mp3" >&2
  exit 1
fi

echo "==> Using normalized voiceover only (no background music)"

echo "==> Cutting video segments to the recorded scene boundaries"
mapfile -t SCENE_ROWS < <(
  node -e '
    const fs = require("fs");
    const plan = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    for (const scene of plan.scenes) {
      console.log([
        scene.index,
        scene.startOffsetMs,
        scene.durationSeconds,
        scene.label,
      ].join("\t"));
    }
  ' "$TIMELINE_FILE"
)

if [[ "${#SCENE_ROWS[@]}" -eq 0 ]]; then
  echo "No scene boundaries found in $TIMELINE_FILE" >&2
  exit 1
fi

TOTAL_SECONDS="$(node -e '
  const fs = require("fs");
  const plan = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const total = plan.scenes.reduce((sum, scene) => sum + Number(scene.durationSeconds), 0);
  console.log(total.toFixed(3));
' "$TIMELINE_FILE")"

FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if [[ ! -f "$FONT" ]]; then FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; fi

SEGMENTS_LIST="$RAW_DIR/segments.txt"
: >"$SEGMENTS_LIST"
rm -f "$RAW_DIR"/segment-*.mp4 "$RAW_DIR"/video-only.mp4

for row in "${SCENE_ROWS[@]}"; do
  IFS=$'\t' read -r scene_index start_offset_ms scene_duration label <<<"$row"
  start_seconds="$(awk -v ms="$start_offset_ms" 'BEGIN { printf "%.3f", ms / 1000 }')"
  scene_duration="$(awk -v value="$scene_duration" 'BEGIN { printf "%.3f", value }')"
  segment="$RAW_DIR/segment-${scene_index}.mp4"

  overlay_text=""
  overlay_color="0xE8F5EE"
  overlay_start="0"
  case "$scene_index" in
    1) overlay_text="LABELLED DEMO | SYNTHETIC OBSERVATIONS" ;;
    3) overlay_text="THREE ATTRIBUTED SOURCES"; overlay_color="0x26D18C" ;;
    4) overlay_text="PORTABLE JSON BUNDLE | ED25519" ;;
    5) overlay_text="VERIFIED LOCALLY | NO UPLOAD"; overlay_start="1" ;;
    6) overlay_text="ONE-BYTE TAMPER DETECTED"; overlay_color="0xFF7A7A"; overlay_start="2" ;;
    7) overlay_text="github.com/onyebuchidaniel60/incident-witness"; overlay_color="0x26D18C" ;;
  esac

  vf="scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30"
  if [[ -n "$overlay_text" ]]; then
    vf="${vf},drawtext=fontfile=${FONT}:text='${overlay_text}':x=36:y=h-86:fontsize=19:fontcolor=${overlay_color}:box=1:boxcolor=0x0B0F0D@0.78:boxborderw=10:enable='between(t,${overlay_start},${scene_duration})'"
  fi
  vf="${vf},format=yuv420p"

  ffmpeg -hide_banner -loglevel error -y \
    -ss "$start_seconds" \
    -t "$scene_duration" \
    -i "$RAW_VIDEO" \
    -vf "$vf" -an \
    -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 \
    "$segment"

  actual_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$segment")"
  if awk -v actual="$actual_duration" -v expected="$scene_duration" 'BEGIN { exit !(actual < expected - 0.1) }'; then
    echo "Video segment ${scene_index} is ${actual_duration}s, shorter than the planned ${scene_duration}s." >&2
    exit 1
  fi

  printf "file '%s'\n" "$segment" >>"$SEGMENTS_LIST"
  printf 'Segment %s (%s): start %ss, duration %ss\n' "$scene_index" "$label" "$start_seconds" "$scene_duration"
done

ffmpeg -hide_banner -loglevel error -y \
  -f concat -safe 0 -i "$SEGMENTS_LIST" \
  -c copy "$RAW_DIR/video-only.mp4"

echo "==> Muxing voiceover with the aligned video segments"
ffmpeg -hide_banner -loglevel error -y \
  -i "$RAW_DIR/video-only.mp4" \
  -i "$AUDIO_DIR/voiceover.mp3" \
  -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k \
  -t "$TOTAL_SECONDS" -movflags +faststart \
  "$OUTPUT"

echo "==> Final video"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of default=nw=1 "$OUTPUT"
echo "Video: $OUTPUT"
