#!/usr/bin/env bash
# End-to-end demo pipeline:
#   1. build shared packages
#   2. generate the TTS voiceover
#   3. start a local test-mode API and web app
#   4. seed a labelled, signed demo incident
#   5. record the Playwright flow
#   6. mix voiceover + ducked ambient bed
#   7. render incident-witness-demo.mp4
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
AUDIO_DIR="$SCRIPT_DIR/audio"
ASSETS_DIR="$SCRIPT_DIR/assets"
RAW_DIR="$SCRIPT_DIR/raw"
LOG_DIR="$SCRIPT_DIR/logs"
TIMELINE_FILE="$SCRIPT_DIR/timeline.json"
OUTPUT="$SCRIPT_DIR/incident-witness-demo.mp4"

API_PORT="${IW_DEMO_API_PORT:-4110}"
WEB_PORT="${IW_DEMO_WEB_PORT:-3110}"
DNS_FILE="${IW_E2E_DNS_FILE:-/tmp/opencode/iw-demo-dns.json}"
DEMO_USER_ID="${IW_E2E_USER_ID:-d4444444-4444-4444-8444-444444444444}"
DEMO_TOKEN="${IW_E2E_TOKEN:-demo-provider-token}"
TOTAL_SECONDS=135

mkdir -p "$AUDIO_DIR" "$ASSETS_DIR" "$RAW_DIR" "$LOG_DIR"
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

echo "==> Building ambient background bed"
ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "sine=frequency=110:sample_rate=48000:duration=$TOTAL_SECONDS" \
  -f lavfi -i "sine=frequency=164.81:sample_rate=48000:duration=$TOTAL_SECONDS" \
  -f lavfi -i "sine=frequency=220:sample_rate=48000:duration=$TOTAL_SECONDS" \
  -filter_complex "[0:a]volume=0.14[a0];[1:a]volume=0.09[a1];[2:a]volume=0.06[a2];[a0][a1][a2]amix=inputs=3:normalize=0,lowpass=f=900,tremolo=f=0.11:d=0.12,aecho=0.8:0.6:120:0.22,volume=2.2,afade=t=in:st=0:d=4,afade=t=out:st=130:d=5[out]" \
  -map "[out]" -t "$TOTAL_SECONDS" -ar 48000 -ac 2 -c:a pcm_s16le "$ASSETS_DIR/bg.wav"

echo "==> Ducking music under the voiceover"
ffmpeg -hide_banner -loglevel error -y \
  -i "$ASSETS_DIR/bg.wav" \
  -i "$AUDIO_DIR/voiceover.wav" \
  -filter_complex "[0:a]volume=0.9[music];[1:a]asplit=2[voice][side];[music][side]sidechaincompress=threshold=0.025:ratio=8:attack=35:release=450[duck];[duck][voice]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95[out]" \
  -map "[out]" -t "$TOTAL_SECONDS" -c:a libmp3lame -b:a 192k "$AUDIO_DIR/mix.mp3"

echo "==> Rendering final video"
FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if [[ ! -f "$FONT" ]]; then FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"; fi

filter_complex="[0:v]trim=duration=$TOTAL_SECONDS,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=8,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,drawtext=fontfile=$FONT:text='LABELLED DEMO | SYNTHETIC OBSERVATIONS':x=36:y=h-86:fontsize=19:fontcolor=0xE8F5EE:box=1:boxcolor=0x0B0F0D@0.78:boxborderw=10:enable='between(t,1,8)',drawtext=fontfile=$FONT:text='THREE ATTRIBUTED SOURCES':x=36:y=h-86:fontsize=19:fontcolor=0x26D18C:box=1:boxcolor=0x0B0F0D@0.78:boxborderw=10:enable='between(t,36,53)',drawtext=fontfile=$FONT:text='PORTABLE JSON BUNDLE | ED25519':x=36:y=h-86:fontsize=19:fontcolor=0xE8F5EE:box=1:boxcolor=0x0B0F0D@0.78:boxborderw=10:enable='between(t,56,68)',drawtext=fontfile=$FONT:text='VERIFIED LOCALLY | NO UPLOAD':x=36:y=h-86:fontsize=19:fontcolor=0xE8F5EE:box=1:boxcolor=0x0B0F0D@0.78:boxborderw=10:enable='between(t,71,88)',drawtext=fontfile=$FONT:text='ONE-BYTE TAMPER DETECTED':x=36:y=h-86:fontsize=19:fontcolor=0xFF7A7A:box=1:boxcolor=0x0B0F0D@0.78:boxborderw=10:enable='between(t,91,103)',drawtext=fontfile=$FONT:text='github.com/onyebuchidaniel60/incident-witness':x=36:y=h-86:fontsize=19:fontcolor=0x26D18C:box=1:boxcolor=0x0B0F0D@0.78:boxborderw=10:enable='between(t,108,134)',fade=t=in:st=0:d=1,fade=t=out:st=132:d=3,format=yuv420p[v]"

ffmpeg -hide_banner -loglevel error -y \
  -i "$RAW_VIDEO" \
  -i "$AUDIO_DIR/mix.mp3" \
  -filter_complex "$filter_complex" \
  -map "[v]" -map 1:a \
  -t "$TOTAL_SECONDS" -r 30 \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -movflags +faststart \
  "$OUTPUT"

echo "==> Final video"
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height -of default=nw=1 "$OUTPUT"
echo "Video: $OUTPUT"
