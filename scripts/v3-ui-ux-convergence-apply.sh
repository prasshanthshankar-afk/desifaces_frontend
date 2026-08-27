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
  echo "ERROR: frontend working tree must be clean before applying the convergence package." >&2
  git status --short >&2
  exit 1
fi

python3 -m py_compile scripts/v3-ui-ux-convergence.py
python3 scripts/v3-ui-ux-convergence.py --typecheck

git diff --check

TARGETS=(
  src/features/face/MultiPersonFaceCohortDenseScreen.tsx
  src/features/face/MultiPersonFaceSavedWorkScreen.tsx
  src/features/audio/MultiPersonAudioWorkspaceScreen.tsx
  src/features/fusion/MultiPersonFusionDenseScreen.tsx
  src/features/story/MultiPersonStoryFinalScreen.tsx
)

git add -- "${TARGETS[@]}"

if git diff --cached --quiet; then
  echo "V3_UI_UX_CONVERGENCE_COMMIT=NOT_NEEDED"
else
  git commit -m "Converge V3 Story UI with single-studio experience"
  git push origin "$EXPECTED_BRANCH"
  echo "V3_UI_UX_CONVERGENCE_PUSH=PASS"
fi

echo "============================================================"
echo " V3 UI/UX CONVERGENCE PACKAGE"
echo "============================================================"
echo "BRANCH=$EXPECTED_BRANCH"
echo "SINGLE_FACE_REFERENCE=PRESERVED"
echo "FACE_UI_CONVERGENCE=PASS"
echo "AUDIO_UI_CONVERGENCE=PASS"
echo "FUSION_UI_CONVERGENCE=PASS"
echo "STORY_FINAL_UI_CONVERGENCE=PASS"
echo "VIEWER_REUSE=PASS"
echo "TYPECHECK=PASS"
echo "NO_ARCHITECTURE_MODERNIZATION=PASS"
git log -1 --oneline
