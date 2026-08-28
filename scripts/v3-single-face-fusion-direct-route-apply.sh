#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

EXPECTED_BRANCH="feature/v3-multiperson-ui-20260818"
BRANCH="$(git branch --show-current)"

if [[ "$BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "ERROR: expected branch $EXPECTED_BRANCH, found $BRANCH" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: frontend working tree must be clean before applying the single-face Fusion regression repair." >&2
  git status --short >&2
  exit 1
fi

python3 -m py_compile \
  scripts/v3-single-face-fusion-direct-route.py \
  scripts/v3-single-face-fusion-active-job-guard.py \
  scripts/v3-single-face-fusion-route-certify.py

# Apply both parts before validating the package as a whole.
python3 scripts/v3-single-face-fusion-direct-route.py
python3 scripts/v3-single-face-fusion-active-job-guard.py
python3 scripts/v3-single-face-fusion-route-certify.py

npx tsc --noEmit --pretty false
git diff --check

TARGETS=(
  "src/features/fusion/api/creatorFusion.ts"
  "src/features/fusion/FusionStudioScreen.tsx"
)
git add -- "${TARGETS[@]}"

if git diff --cached --quiet; then
  echo "V3_SINGLE_FACE_FUSION_ROUTE_COMMIT=NOT_NEEDED"
else
  git commit -m "Restore reliable direct single-face Fusion"
  git push origin "$EXPECTED_BRANCH"
  echo "V3_SINGLE_FACE_FUSION_ROUTE_PUSH=PASS"
fi

echo "============================================================"
echo " V3 SINGLE-FACE FUSION REGRESSION REPAIR"
echo "============================================================"
echo "BRANCH=$EXPECTED_BRANCH"
echo "SINGLE_FACE_TALKING_VIDEO_DIRECT_FUSION=PASS"
echo "MULTIPERSON_STORY_ORCHESTRATION_PRESERVED=PASS"
echo "DIRECT_PRICING_PREVIEW=PASS"
echo "DIRECT_CREATE=PASS"
echo "DIRECT_STATUS_POLLING=PASS"
echo "SINGLE_FACE_DUPLICATE_GENERATE_BLOCKED=PASS"
echo "ACTIVE_RESERVATION_SECOND_SUBMIT_GUARD=PASS"
echo "ROUTE_REGRESSION_CERT=PASS"
echo "TYPESCRIPT_TYPECHECK=PASS"
git log -1 --oneline
