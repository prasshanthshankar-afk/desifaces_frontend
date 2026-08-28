#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "src/features/fusion/FusionStudioScreen.tsx"

text = TARGET.read_text()

old_gate = '''  const canPrimaryAction =
    hasFaceArtifact &&
    hasAudio &&
    !busy &&
    hasMeaningfulPrompt &&
    (!isCinematic || hasMeaningfulCinematicIntent);
'''
new_gate = '''  const hasActiveFusionJob = !!jobId && !videoUrl;
  const canPrimaryAction =
    hasFaceArtifact &&
    hasAudio &&
    !busy &&
    !hasActiveFusionJob &&
    hasMeaningfulPrompt &&
    (!isCinematic || hasMeaningfulCinematicIntent);
'''

old_generate = '''  const generate = useCallback(async () => {
    if (!hasUsableFaceInput || !hasAudio || busy) return;
'''
new_generate = '''  const generate = useCallback(async () => {
    if (!hasUsableFaceInput || !hasAudio || busy) return;
    if (jobId && !videoUrl) {
      setBackgroundWatching(true);
      setStatusText(
        "Your current video is still generating. Wait for it to finish before starting another run."
      );
      return;
    }
'''

old_deps_tail = '''    openUpgradeScreen,
    videoMode,
    cinematicOutputProfile,
  ]);
'''
new_deps_tail = '''    openUpgradeScreen,
    videoMode,
    cinematicOutputProfile,
    jobId,
    videoUrl,
  ]);
'''

already = (
    "const hasActiveFusionJob = !!jobId && !videoUrl;" in text
    and "Your current video is still generating." in text
)

if already:
    print("SINGLE_FACE_ACTIVE_JOB_GUARD=ALREADY_APPLIED")
    raise SystemExit(0)

for label, old in (
    ("canPrimaryAction gate", old_gate),
    ("generate active-job guard", old_generate),
    ("generate dependency tail", old_deps_tail),
):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ACTIVE_JOB_GUARD_SOURCE_CONTRACT=FAIL label={label!r} count={count}")

text = text.replace(old_gate, new_gate, 1)
text = text.replace(old_generate, new_generate, 1)
text = text.replace(old_deps_tail, new_deps_tail, 1)
TARGET.write_text(text)

print("ACTIVE_JOB_GUARD_SOURCE_CONTRACT=PASS")
print("SINGLE_FACE_DUPLICATE_GENERATE_BLOCKED=PASS")
print("ACTIVE_RESERVATION_SECOND_SUBMIT_GUARD=PASS")
