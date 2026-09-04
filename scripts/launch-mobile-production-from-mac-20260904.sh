#!/usr/bin/env bash
set -Eeuo pipefail

REPO="prasshanthshankar-afk/desifaces_frontend"
MOBILE_SHA="55f0856a4b5b99dd877b764d86b7b68f1ab77459"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN="/tmp/desifaces-mobile-production-${STAMP}"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "FAIL: missing required command: $1" >&2; exit 2; }; }
for x in gh git node npm npx python3; do need "$x"; done

[[ "$(uname -s)" == "Darwin" ]] || { echo "FAIL: run this launcher from the Mac used for Expo/EAS releases" >&2; exit 2; }

echo "============================================================"
echo " desifaces.ai MOBILE PRODUCTION — PARITY RELEASE"
echo "============================================================"
echo "mobile_sha=$MOBILE_SHA"
echo "run_dir=$RUN"

gh repo clone "$REPO" "$RUN" -- --filter=blob:none --no-checkout
cd "$RUN"
git checkout --detach "$MOBILE_SHA"
[[ "$(git rev-parse HEAD)" == "$MOBILE_SHA" ]] || { echo "FAIL: mobile source SHA mismatch" >&2; exit 3; }

echo ""
echo "===== 1. INSTALL + STATIC CERTIFICATION ====="
npm ci --legacy-peer-deps --no-audit --no-fund
python3 scripts/test-v3-mobile-capability-parity.py
npx tsc --noEmit --pretty false
grep -q 'country_code: deviceCountryCode()' src/core/auth/AuthContext.tsx
grep -q 'PikuMark' src/features/assistant/AssistantOverlay.tsx
! grep -q 'PIKU_AVATAR_DATA_URI' src/features/assistant/AssistantOverlay.tsx
grep -q 'Download PNG' 'src/app/(tabs)/media/viewer.tsx'
grep -q 'Download MP3' 'src/app/(tabs)/media/viewer.tsx'
grep -q 'Download MP4' 'src/app/(tabs)/media/viewer.tsx'
echo "MOBILE_PARITY_TESTS=PASS"

echo ""
echo "===== 2. PRODUCTION IDENTITY CERTIFICATION ====="
npx expo config --type public > "$RUN/expo-config.txt"
grep -q 'ai.desifaces.app' "$RUN/expo-config.txt"
grep -q 'desifaces.ai' "$RUN/expo-config.txt"
grep -q '7528bed0-9b75-42e4-a25a-bd088b6325af' "$RUN/expo-config.txt"
if grep -Eq 'ai\.desifaces\.app\.dev|desifaces\.ai Dev|desifaces-dev' "$RUN/expo-config.txt"; then
  echo "FAIL: development identity detected in production Expo config" >&2
  exit 3
fi
echo "MOBILE_PRODUCTION_SOURCE=PASS"

echo ""
echo "===== 3. EAS AUTHENTICATION ====="
if ! npx --yes eas-cli@latest whoami >/tmp/desifaces-eas-whoami.txt 2>&1; then
  echo "Expo/EAS login is required once on this Mac. Credentials stay on the Mac."
  npx --yes eas-cli@latest login
fi
npx --yes eas-cli@latest whoami

echo ""
echo "===== 4. IOS APP STORE BUILD + AUTO-SUBMIT ====="
set +e
npx --yes eas-cli@latest build --platform ios --profile production --auto-submit --non-interactive --no-wait
IOS_RC=$?
set -e
(( IOS_RC == 0 )) && echo "IOS_STORE_QUEUE=PASS" || echo "IOS_STORE_QUEUE=FAIL rc=$IOS_RC"

echo ""
echo "===== 5. ANDROID PLAY BUILD + AUTO-SUBMIT ====="
set +e
npx --yes eas-cli@latest build --platform android --profile production --auto-submit --non-interactive --no-wait
ANDROID_RC=$?
set -e
(( ANDROID_RC == 0 )) && echo "ANDROID_STORE_QUEUE=PASS" || echo "ANDROID_STORE_QUEUE=FAIL rc=$ANDROID_RC"

echo ""
echo "============================================================"
echo " MOBILE PRODUCTION RESULT"
echo "============================================================"
echo "mobile_sha=$MOBILE_SHA"
echo "ios_rc=$IOS_RC"
echo "android_rc=$ANDROID_RC"
echo "run_dir=$RUN"

(( IOS_RC == 0 && ANDROID_RC == 0 )) || exit 4
echo "MOBILE_PRODUCTION_QUEUE=PASS"
