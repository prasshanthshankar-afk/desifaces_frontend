#!/usr/bin/env bash
set -Eeuo pipefail

BRANCH="release/v3-production-web-mobile-parity-20260912"
EXPECTED_PARITY_COMMIT="d019cd573754c4b4b1f22836b32ac3cf5066a908"

command -v git >/dev/null || { echo "FAIL: git required"; exit 1; }
command -v npm >/dev/null || { echo "FAIL: npm required"; exit 1; }

HEAD_SHA="$(git rev-parse HEAD)"
git merge-base --is-ancestor "$EXPECTED_PARITY_COMMIT" HEAD || {
  echo "FAIL: expected mobile parity commit is not in current lineage"
  exit 1
}

echo "============================================================"
echo " desifaces V3 — MOBILE PRODUCTION PARITY CERTIFICATION"
echo "============================================================"
echo "branch=$BRANCH"
echo "head=$HEAD_SHA"
echo "store_submission=NONE"
echo "backend_change=NONE"
echo "production_touch=NONE"

echo
echo "===== 1. SOURCE PARITY CONTRACT ====="
python3 scripts/test-v3-mobile-capability-parity.py

echo
echo "===== 2. DEPENDENCY LOCK / TYPE / LINT ====="
npm ci
npm run certify:v3-story
npx eslint \
  src/features/assistant/AssistantOverlay.tsx \
  src/features/assistant/api/assistant.ts \
  src/features/story/RecentStoriesMobilePanel.tsx \
  src/features/face/api/multiPersonDirector.ts \
  src/features/audio/api/multiPersonStory.ts \
  'src/app/(tabs)/face/multi-person.tsx' \
  'src/app/(tabs)/media/viewer.tsx' \
  --max-warnings=0

echo "MOBILE_SOURCE_TYPE_LINT=PASS"

echo
echo "===== 3. EXPO DOCTOR ====="
npm run doctor
echo "MOBILE_EXPO_DOCTOR=PASS"

echo
echo "===== 4. PRODUCTION JS BUNDLE EXPORT ====="
OUT_BASE="${TMPDIR:-/tmp}/desifaces-mobile-prod-cert-${HEAD_SHA:0:12}"
rm -rf "$OUT_BASE"
mkdir -p "$OUT_BASE"
CI=1 npx expo export --platform ios --output-dir "$OUT_BASE/ios"
CI=1 npx expo export --platform android --output-dir "$OUT_BASE/android"

test -d "$OUT_BASE/ios" && test -d "$OUT_BASE/android"
echo "MOBILE_IOS_EXPORT=PASS"
echo "MOBILE_ANDROID_EXPORT=PASS"

echo
echo "===== 5. NATIVE BILLING / SHARED BACKEND GUARD ====="
for f in src/core/payments/appleIap.ts src/core/payments/googlePlayIap.ts src/core/payments/paymentRailApi.ts; do
  test -s "$f" || { echo "FAIL: missing native billing contract $f"; exit 1; }
done
! grep -RIE --include='*.ts' --include='*.tsx' \
  'INSERT INTO pricing_|UPDATE pricing_|credits_per_second|stripe_price_id\s*=' \
  src/features src/core/pricing src/app >/tmp/desifaces-mobile-parallel-pricing.$$ 2>/dev/null || {
    cat /tmp/desifaces-mobile-parallel-pricing.$$
    rm -f /tmp/desifaces-mobile-parallel-pricing.$$
    echo "FAIL: mobile-local pricing mutation/formula detected"
    exit 1
  }
rm -f /tmp/desifaces-mobile-parallel-pricing.$$
echo "MOBILE_SHARED_PRICING_AUTHORITY=PASS"
echo "MOBILE_NATIVE_BILLING_RAILS_PRESENT=PASS"

echo
echo "===== 6. DURABLE MEDIA / CUSTOMER CAPABILITY GUARD ====="
grep -Fq '/api/audio/assets/${encodeURIComponent(mediaAssetId)}/read-url' src/features/audio/api/multiPersonStory.ts
grep -Fq 'return hydrateDurableAudioUrl(result);' src/features/audio/api/multiPersonStory.ts
grep -Fq 'getStoryFinalMediaReadUrl' src/features/story/MultiPersonStoryFinalScreen.tsx
grep -Fq 'Download MP3' 'src/app/(tabs)/media/viewer.tsx'
grep -Fq 'Download MP4' 'src/app/(tabs)/media/viewer.tsx'
grep -Fq 'Download PNG' 'src/app/(tabs)/media/viewer.tsx'
echo "MOBILE_DURABLE_AUDIO_PARITY=PASS"
echo "MOBILE_FINAL_MEDIA_PARITY=PASS"
echo "MOBILE_DOWNLOAD_SHARE_PARITY=PASS"

echo
echo "============================================================"
echo " MOBILE PRODUCTION PARITY CERTIFICATION=PASS"
echo "============================================================"
echo "release_head=$HEAD_SHA"
echo "device_acceptance=PENDING"
echo "store_submission=NOT_PERFORMED"
echo "production_touch=NONE"
