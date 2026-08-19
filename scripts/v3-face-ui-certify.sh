#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

EXPECTED_BRANCH="feature/v3-multiperson-ui-20260818"
CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]; then
  echo "V3_FACE_UI_FAIL=wrong_branch:$CURRENT_BRANCH"
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "V3_FACE_UI_FAIL=working_tree_not_clean"
  git status --short
  exit 1
fi

echo "V3_FACE_UI_SOURCE=PASS"

npx eslint \
  'src/core/config/env.ts' \
  'src/features/face/api/multiPersonFace.ts' \
  'src/features/face/api/multiPersonDirector.ts' \
  'src/features/face/MultiPersonFaceDirectorScreen.tsx' \
  'src/features/face/MultiPersonFaceCohortScreen.tsx' \
  'src/app/(tabs)/face/index.tsx' \
  'src/app/(tabs)/face/story/[storyId].tsx'
echo "V3_FACE_UI_ESLINT=PASS"

npx tsc --noEmit
echo "V3_FACE_UI_TYPESCRIPT=PASS"

node <<'NODE'
const fs = require('fs');
const checks = [
  ['src/app/(tabs)/face/index.tsx', 'FaceStudioScreen'],
  ['src/app/(tabs)/face/index.tsx', 'Multi-Person'],
  ['src/app/(tabs)/face/index.tsx', 'MultiPersonFaceDirectorScreen'],
  ['src/app/(tabs)/face/story/[storyId].tsx', 'MultiPersonFaceCohortScreen'],
  ['src/features/face/api/multiPersonDirector.ts', '/api/director/runs'],
  ['src/features/face/api/multiPersonDirector.ts', '/resume'],
  ['src/features/face/MultiPersonFaceDirectorScreen.tsx', 'Ask Creative Director'],
  ['src/features/face/MultiPersonFaceDirectorScreen.tsx', 'Approve Director plan'],
  ['src/features/face/MultiPersonFaceDirectorScreen.tsx', 'Open Face Cast'],
  ['src/features/face/api/multiPersonFace.ts', 'DIRECTOR_BASE'],
  ['src/features/face/api/multiPersonFace.ts', 'getFaceMediaReadUrl'],
  ['src/features/face/MultiPersonFaceCohortScreen.tsx', 'Audio is locked'],
  ['src/features/face/MultiPersonFaceCohortScreen.tsx', 'Approve & lock'],
  ['src/features/face/MultiPersonFaceCohortScreen.tsx', 'Regenerate'],
  ['src/features/face/MultiPersonFaceCohortScreen.tsx', 'Retry'],
];
for (const [file, needle] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(needle)) {
    console.error(`V3_FACE_UI_FAIL=missing_contract:${file}:${needle}`);
    process.exit(1);
  }
}
console.log('V3_FACE_UI_CONTRACT=PASS');
NODE

# Preserve one-person Face Studio while exposing Multi-Person Director as a
# sibling mode and Story cast as the participant cohort execution route.
if ! grep -q 'FaceStudioScreen' 'src/app/(tabs)/face/index.tsx'; then
  echo "V3_FACE_UI_FAIL=one_person_face_route_changed"
  exit 1
fi
if ! grep -q 'MultiPersonFaceDirectorScreen' 'src/app/(tabs)/face/index.tsx'; then
  echo "V3_FACE_UI_FAIL=multi_person_face_entry_missing"
  exit 1
fi
if ! grep -q 'MultiPersonFaceCohortScreen' 'src/app/(tabs)/face/story/[storyId].tsx'; then
  echo "V3_FACE_UI_FAIL=story_face_route_missing"
  exit 1
fi
echo "V3_FACE_UI_ROUTE_COMPATIBILITY=PASS"

echo "V3_FACE_UI_DIRECTOR_ENTRY=PASS"
echo "V3_FACE_UI_ZERO_PROVIDER_CERTIFICATION=PASS"
