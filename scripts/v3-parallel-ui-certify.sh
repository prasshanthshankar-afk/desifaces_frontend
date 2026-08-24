#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

hold() { echo "V3 PARALLEL UI: HOLD: $*" >&2; exit 1; }
section() { echo; echo "===== $* ====="; }

section "1. SOURCE GATE"
BRANCH="$(git branch --show-current)"
[[ "$BRANCH" == "feature/v3-multiperson-ui-20260818" ]] || hold "wrong branch: $BRANCH"
[[ -z "$(git status --porcelain)" ]] || hold "working tree must be clean"
git --no-pager log -1 --oneline

section "2. STORY TYPE + LINT CERTIFICATION"
npm run certify:v3-story

section "3. PERFORMANCE + PRICING UX CONTRACT"
node <<'NODE'
const fs = require('fs');
const checks = {
  'fusion-api-parent-pricing': [
    'src/features/fusion/api/multiPersonStory.ts',
    ['parent_confirmation', 'child_confirmations', 'FusionProgress', 'billable_parent_quote_count'],
  ],
  'fusion-parallel-progress': [
    'src/features/fusion/MultiPersonFusionDenseScreen.tsx',
    ['dialogue clips in parallel', 'estimated_remaining_seconds', 'Included • no separate charge', 'one scene price'],
  ],
  'face-cohort-fanout': [
    'src/features/face/MultiPersonFaceCohortDenseScreen.tsx',
    ['Promise.all(', 'Create Faces in parallel', 'submitted together'],
  ],
  'audio-full-fanout': [
    'src/features/audio/MultiPersonAudioWorkspaceScreen.tsx',
    ['AUDIO_FANOUT_CONCURRENCY = 32', 'AUDIO_STATUS_CONCURRENCY = 32', 'Create in parallel'],
  ],
};
for (const [name, [path, needles]] of Object.entries(checks)) {
  const text = fs.readFileSync(path, 'utf8');
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length) {
    console.error(`${name}=FAIL missing=${missing.join(',')}`);
    process.exit(1);
  }
  console.log(`${name}=PASS`);
}
NODE

echo
echo "============================================================"
echo " V3 PARALLEL STORY UI = PASS"
echo " Face cohort fan-out present"
echo " Audio 32-way fan-out present"
echo " Fusion parent-pricing contract present"
echo " Fusion progress / ETA UX present"
echo "============================================================"
