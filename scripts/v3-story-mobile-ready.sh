#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EXPECTED_BRANCH="feature/v3-multiperson-ui-20260818"
BUNDLE_ID="${BUNDLE_ID:-ai.desifaces.app.dev}"
URL_SCHEME="${URL_SCHEME:-exp+desifaces-mobile}"
METRO_PORT="${METRO_PORT:-8081}"
LOG_FILE="${TMPDIR:-/tmp}/desifaces-v3-story-metro.log"

fail() {
  echo "V3 STORY MOBILE: FAIL: $*" >&2
  exit 1
}

info() {
  echo
  echo "===== $* ====="
}

[[ "$(uname -s)" == "Darwin" ]] || fail "this helper is for the macOS iOS V3 development client"
[[ "$(git branch --show-current)" == "$EXPECTED_BRANCH" ]] || fail "expected branch $EXPECTED_BRANCH"
git diff --quiet || fail "working tree has unstaged changes"
git diff --cached --quiet || fail "working tree has staged changes"
command -v node >/dev/null || fail "Node.js is required"
command -v xcrun >/dev/null || fail "Xcode command-line tools are required"
command -v curl >/dev/null || fail "curl is required"

info "1. FRONTEND STATIC CERTIFICATION"
if [[ ! -x node_modules/.bin/eslint || ! -x node_modules/.bin/tsc ]]; then
  echo "Installing declared dependencies without creating a lockfile..."
  npm install --legacy-peer-deps --no-package-lock --no-audit --no-fund
fi
npm run certify:v3-story
echo "PASS: V3 Story frontend lint + TypeScript gates"

info "2. RESOLVE LAN ADDRESS"
IFACE="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
[[ -n "$IFACE" ]] || fail "unable to determine default network interface"
LAN_IP="$(ipconfig getifaddr "$IFACE" 2>/dev/null || true)"
[[ -n "$LAN_IP" ]] || fail "unable to determine LAN IP for interface $IFACE"
echo "Interface=$IFACE"
echo "LAN_IP=$LAN_IP"

info "3. CLEAN ONLY THE METRO PORT"
PIDS="$(lsof -ti tcp:"$METRO_PORT" 2>/dev/null || true)"
if [[ -n "$PIDS" ]]; then
  echo "$PIDS" | xargs kill 2>/dev/null || true
  sleep 1
fi
rm -f "$LOG_FILE"

info "4. START V3 EXPO DEV CLIENT"
env BROWSER=none npx expo start -c --lan --dev-client --port "$METRO_PORT" >"$LOG_FILE" 2>&1 &
METRO_PID=$!
cleanup() {
  if kill -0 "$METRO_PID" 2>/dev/null; then
    kill "$METRO_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 60); do
  if [[ "$(curl -fsS "http://$LAN_IP:$METRO_PORT/status" 2>/dev/null || true)" == "packager-status:running" ]]; then
    echo "PASS: Metro running at http://$LAN_IP:$METRO_PORT"
    break
  fi
  if ! kill -0 "$METRO_PID" 2>/dev/null; then
    cat "$LOG_FILE" >&2 || true
    fail "Metro exited before becoming ready"
  fi
  sleep 1
done
[[ "$(curl -fsS "http://$LAN_IP:$METRO_PORT/status" 2>/dev/null || true)" == "packager-status:running" ]] || fail "Metro did not become ready"

info "5. OPEN THE INSTALLED V3 DEVELOPMENT CLIENT"
SIM_ID="${SIMULATOR_ID:-}"
if [[ -z "$SIM_ID" ]]; then
  SIM_ID="$(xcrun simctl list devices booted -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next((x["udid"] for r in d.get("devices",{}).values() for x in r if x.get("state")=="Booted"), ""))')"
fi

if [[ -z "$SIM_ID" ]]; then
  SIM_ID="$(xcrun simctl list devices available -j | python3 -c 'import json,sys; d=json.load(sys.stdin); print(next((x["udid"] for r in d.get("devices",{}).values() for x in r if x.get("isAvailable") and "iPhone" in x.get("name", "")), ""))')"
  [[ -n "$SIM_ID" ]] || fail "no available iPhone simulator was found"
  open -a Simulator
  xcrun simctl boot "$SIM_ID" 2>/dev/null || true
  xcrun simctl bootstatus "$SIM_ID" -b
fi

xcrun simctl launch "$SIM_ID" "$BUNDLE_ID" >/dev/null || fail "V3 dev client $BUNDLE_ID is not installed in simulator $SIM_ID"
DEV_URL="$URL_SCHEME://expo-development-client/?url=http%3A%2F%2F${LAN_IP}%3A${METRO_PORT}"
xcrun simctl openurl "$SIM_ID" "$DEV_URL"

echo "PASS: V3 Story mobile client opened against $LAN_IP:$METRO_PORT"
echo "Simulator=$SIM_ID"
echo "Metro log=$LOG_FILE"
echo
echo "Press Ctrl-C when you are finished."
tail -f "$LOG_FILE"
