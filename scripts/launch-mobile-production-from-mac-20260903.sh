#!/usr/bin/env bash
set -Eeuo pipefail

REPO="prasshanthshankar-afk/desifaces_frontend"
RELEASE_BRANCH="release/mobile-production-20260903"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN="/tmp/desifaces-mobile-production-${STAMP}"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "FAIL: missing required command: $1" >&2; exit 2; }; }
for x in gh git node npm npx python3; do need "$x"; done

cleanup(){ :; }
trap cleanup EXIT

echo "============================================================"
echo " desifaces.ai MOBILE PRODUCTION STORE QUEUE"
echo "============================================================"
echo "release_branch=$RELEASE_BRANCH"
echo "run_dir=$RUN"

gh repo clone "$REPO" "$RUN" -- --branch "$RELEASE_BRANCH" --single-branch
cd "$RUN"

echo ""
echo "===== 1. CERTIFY FROZEN PRODUCTION SOURCE ====="
python3 scripts/test-v3-mobile-capability-parity.py
npx expo config --type public > /tmp/desifaces-mobile-expo-config.txt
grep -q 'ai.desifaces.app' /tmp/desifaces-mobile-expo-config.txt
grep -q 'desifaces.ai' /tmp/desifaces-mobile-expo-config.txt
if grep -Eq 'ai\.desifaces\.app\.dev|desifaces\.ai Dev|desifaces-dev' /tmp/desifaces-mobile-expo-config.txt; then
  echo "FAIL: development app identity detected" >&2
  exit 3
fi
echo "MOBILE_PRODUCTION_SOURCE=PASS"

echo ""
echo "===== 2. ENSURE EXPO/EAS AUTHENTICATION ====="
if ! npx --yes eas-cli@latest whoami >/tmp/desifaces-eas-whoami.txt 2>&1; then
  echo "Expo/EAS login is required once on this Mac."
  npx --yes eas-cli@latest login
fi
npx --yes eas-cli@latest whoami

echo ""
echo "===== 3. QUEUE IOS APP STORE BUILD + SUBMISSION ====="
set +e
npx --yes eas-cli@latest build \
  --platform ios \
  --profile production \
  --auto-submit \
  --non-interactive \
  --no-wait
IOS_RC=$?
set -e
if (( IOS_RC == 0 )); then
  echo "IOS_STORE_QUEUE=PASS"
else
  echo "IOS_STORE_QUEUE=FAIL rc=$IOS_RC"
fi

echo ""
echo "===== 4. QUEUE ANDROID PLAY STORE BUILD + SUBMISSION ====="
set +e
npx --yes eas-cli@latest build \
  --platform android \
  --profile production \
  --auto-submit \
  --non-interactive \
  --no-wait
ANDROID_RC=$?
set -e
if (( ANDROID_RC == 0 )); then
  echo "ANDROID_STORE_QUEUE=PASS"
else
  echo "ANDROID_STORE_QUEUE=FAIL rc=$ANDROID_RC"
fi

echo ""
echo "============================================================"
echo " MOBILE STORE QUEUE RESULT"
echo "============================================================"
echo "ios_rc=$IOS_RC"
echo "android_rc=$ANDROID_RC"
echo "release_branch=$RELEASE_BRANCH"
echo "run_dir=$RUN"

if (( IOS_RC != 0 || ANDROID_RC != 0 )); then
  exit 4
fi
exit 0
