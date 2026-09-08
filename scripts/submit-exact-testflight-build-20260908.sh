#!/usr/bin/env bash
set -Eeuo pipefail

BUILD_ID="16b0ae77-8837-4e51-a3a3-d877cdf9c7c8"
EXPECTED_SOURCE_SHA="92007c5333eee2bfeeb01ebbc1016ea34cd91a1d"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "FAIL: missing required command: $1" >&2; exit 2; }; }
for x in node npx python3; do need "$x"; done
[[ "$(uname -s)" == "Darwin" ]] || { echo "FAIL: run from the Mac used for Expo/EAS releases" >&2; exit 2; }

echo "============================================================"
echo " desifaces.ai — EXACT TESTFLIGHT SUBMISSION"
echo "============================================================"
echo "build_id=$BUILD_ID"
echo "expected_source_sha=$EXPECTED_SOURCE_SHA"

echo
echo "===== 1. EAS AUTHENTICATION ====="
if ! npx --yes eas-cli@latest whoami >/tmp/desifaces-eas-whoami.txt 2>&1; then
  npx --yes eas-cli@latest login
fi
npx --yes eas-cli@latest whoami

echo
echo "===== 2. WAIT FOR EXACT BUILD ====="
START="$(date +%s)"
TIMEOUT=5400
while true; do
  JSON="$(npx --yes eas-cli@latest build:view "$BUILD_ID" --json --non-interactive 2>/dev/null)" || {
    echo "FAIL: unable to read EAS build $BUILD_ID" >&2
    exit 3
  }
  STATUS="$(printf '%s' "$JSON" | python3 -c 'import json,sys; print((json.load(sys.stdin).get("status") or "UNKNOWN").upper())')"
  GIT_SHA="$(printf '%s' "$JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("gitCommitHash") or d.get("gitCommitSha") or "")')"
  echo "BUILD_STATUS=$STATUS"
  if [[ -n "$GIT_SHA" ]]; then
    echo "BUILD_SOURCE_SHA=$GIT_SHA"
    [[ "$GIT_SHA" == "$EXPECTED_SOURCE_SHA" ]] || {
      echo "FAIL: build source SHA mismatch" >&2
      exit 3
    }
  fi

  case "$STATUS" in
    FINISHED)
      break
      ;;
    ERRORED|CANCELED)
      echo "FAIL: EAS build ended with status=$STATUS" >&2
      exit 4
      ;;
  esac

  NOW="$(date +%s)"
  (( NOW - START < TIMEOUT )) || {
    echo "FAIL: timed out waiting for EAS build completion" >&2
    exit 4
  }
  sleep 30
done

echo "EXACT_IOS_BUILD=PASS"

echo
echo "===== 3. SUBMIT EXACT BUILD TO TESTFLIGHT ====="
# Intentionally target the exact build id. Do not use --latest.
# Interactive mode is retained because the current EAS submit profile may still
# require one-time App Store Connect app resolution (ascAppId).
npx --yes eas-cli@latest submit --platform ios --id "$BUILD_ID" --profile production

echo
echo "============================================================"
echo " EXACT TESTFLIGHT SUBMISSION COMPLETE"
echo "============================================================"
echo "build_id=$BUILD_ID"
echo "source_sha=$EXPECTED_SOURCE_SHA"
echo "TESTFLIGHT_SUBMISSION=PASS"
