#!/usr/bin/env bash
set -Eeuo pipefail

REPO="prasshanthshankar-afk/desifaces_frontend"
MOBILE_SHA="47da4e2d8776edffdec567ef068b3fe631d62f35"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUN="/tmp/desifaces-mobile-testflight-${STAMP}"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "FAIL: missing required command: $1" >&2; exit 2; }; }
for x in gh git node npm npx python3 grep; do need "$x"; done
[[ "$(uname -s)" == "Darwin" ]] || { echo "FAIL: run from the Mac used for Expo/EAS releases" >&2; exit 2; }

echo "============================================================"
echo " desifaces.ai MOBILE TESTFLIGHT — SYNC RELEASE"
echo "============================================================"
echo "mobile_sha=$MOBILE_SHA"
echo "backend_contract=production-synchronized-20260908"
echo "run_dir=$RUN"

gh repo clone "$REPO" "$RUN" -- --filter=blob:none --no-checkout
cd "$RUN"
git checkout --detach "$MOBILE_SHA"
[[ "$(git rev-parse HEAD)" == "$MOBILE_SHA" ]] || { echo "FAIL: mobile source SHA mismatch" >&2; exit 3; }

echo
echo "===== 1. STATIC + PARITY CERTIFICATION ====="
npm ci --legacy-peer-deps --no-audit --no-fund
python3 scripts/test-v3-mobile-capability-parity.py
npx tsc --noEmit --pretty false

grep -q 'country_code: deviceCountryCode()' src/core/auth/AuthContext.tsx
grep -q 'PikuMark' src/features/assistant/AssistantOverlay.tsx
! grep -q 'PIKU_AVATAR_DATA_URI' src/features/assistant/AssistantOverlay.tsx
grep -q 'Download PNG' 'src/app/(tabs)/media/viewer.tsx'
grep -q 'Download MP3' 'src/app/(tabs)/media/viewer.tsx'
grep -q 'Download MP4' 'src/app/(tabs)/media/viewer.tsx'

LAYOUT='src/app/(tabs)/_layout.tsx'
for tab in more settings billing media music retail; do
  grep -q "<Tabs.Screen name=\"$tab\" options={hiddenTabOptions} />" "$LAYOUT" || {
    echo "FAIL: hidden footer route not enforced: $tab" >&2
    exit 3
  }
done
for title in Home Face Voice Video; do
  grep -q "title: \"$title\"" "$LAYOUT" || {
    echo "FAIL: required persistent footer item missing: $title" >&2
    exit 3
  }
done
! grep -q 'title: "More"' "$LAYOUT"

echo "MOBILE_PARITY_TESTS=PASS"
echo "MOBILE_FOOTER_PARITY=PASS"

echo
echo "===== 2. PRODUCTION IDENTITY ====="
npx expo config --type public > "$RUN/expo-config.txt"
grep -q 'ai.desifaces.app' "$RUN/expo-config.txt"
grep -q 'desifaces.ai' "$RUN/expo-config.txt"
grep -q '7528bed0-9b75-42e4-a25a-bd088b6325af' "$RUN/expo-config.txt"
if grep -Eq 'ai\.desifaces\.app\.dev|desifaces\.ai Dev|desifaces-dev' "$RUN/expo-config.txt"; then
  echo "FAIL: development identity detected in production Expo config" >&2
  exit 3
fi
echo "MOBILE_PRODUCTION_SOURCE=PASS"

echo
echo "===== 3. EAS AUTHENTICATION ====="
if ! npx --yes eas-cli@latest whoami >/tmp/desifaces-eas-whoami.txt 2>&1; then
  npx --yes eas-cli@latest login
fi
npx --yes eas-cli@latest whoami

echo
echo "===== 4. IOS TESTFLIGHT BUILD ====="
npx --yes eas-cli@latest build --platform ios --profile production --non-interactive --no-wait

echo
echo "============================================================"
echo " MOBILE TESTFLIGHT BUILD QUEUED"
echo "============================================================"
echo "mobile_sha=$MOBILE_SHA"
echo "MOBILE_TESTFLIGHT_BUILD_QUEUE=PASS"
echo "NEXT_ACTION=SUBMIT_LATEST_IOS_BUILD"
