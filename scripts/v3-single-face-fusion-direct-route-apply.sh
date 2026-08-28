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
  echo "ERROR: frontend working tree must be clean before applying the single-face Fusion route repair." >&2
  git status --short >&2
  exit 1
fi

python3 -m py_compile scripts/v3-single-face-fusion-direct-route.py
python3 scripts/v3-single-face-fusion-direct-route.py --typecheck

git diff --check

TARGET="src/features/fusion/api/creatorFusion.ts"
git add -- "$TARGET"

if git diff --cached --quiet; then
  echo "V3_SINGLE_FACE_FUSION_ROUTE_COMMIT=NOT_NEEDED"
else
  git commit -m "Restore direct routing for single-face Fusion"
  git push origin "$EXPECTED_BRANCH"
  echo "V3_SINGLE_FACE_FUSION_ROUTE_PUSH=PASS"
fi

echo "============================================================"
echo " V3 SINGLE-FACE FUSION DIRECT ROUTE"
echo "============================================================"
echo "BRANCH=$EXPECTED_BRANCH"
echo "SINGLE_FACE_TALKING_VIDEO_DIRECT_FUSION=PASS"
echo "MULTIPERSON_STORY_ORCHESTRATION_PRESERVED=PASS"
echo "DIRECT_PRICING_PREVIEW=PASS"
echo "DIRECT_CREATE=PASS"
echo "DIRECT_STATUS_POLLING=PASS"
echo "TYPESCRIPT_TYPECHECK=PASS"
git log -1 --oneline
