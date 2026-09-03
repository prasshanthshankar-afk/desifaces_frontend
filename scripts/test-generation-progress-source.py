#!/usr/bin/env python3
from pathlib import Path

progress = Path("src/components/jobs/GenerationProgressCard.tsx").read_text()
face = Path("src/features/face/FaceStudioScreen.tsx").read_text()
fusion = Path("src/features/fusion/FusionStudioScreen.tsx").read_text()
fusion_api = Path("src/features/fusion/api/creatorFusion.ts").read_text()

assert 'accessibilityRole="progressbar"' in progress
assert "progress.percent" in progress
assert "progress.delay_message" in progress
assert "creditsPerSecond" not in progress
assert "credits/sec" not in progress

assert 'GenerationProgressCard' in face
assert "setGenerationProgress(last?.progress ?? null)" in face
assert 'kind="face"' in face

assert 'GenerationProgressCard' in fusion
assert "latestFusionJobStatus?.progress" in fusion
assert 'kind="video"' in fusion

# Both pricing and create must remain on the Fusion Extension boundary.
assert "resolveFusionExtensionBase" in fusion_api
assert "getLongformPreviewCandidates" in fusion_api
assert "getLongformCreateCandidates" in fusion_api
assert "pricing_confirmation" in fusion_api

print("MOBILE_GENERATION_PROGRESS_SOURCE_TEST=PASS")
