#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CREATOR = ROOT / "src/features/fusion/api/creatorFusion.ts"
STORY = ROOT / "src/features/fusion/MultiPersonFusionDenseScreen.tsx"


def fail(message: str) -> None:
    raise SystemExit(f"V3_SINGLE_FACE_FUSION_ROUTE_CERT=FAIL: {message}")


creator = CREATOR.read_text()
story = STORY.read_text()

# The direct helpers must remain available.
for token in (
    "function resolveFusionBase()",
    "function getFusionPreviewCandidates()",
    "function getFusionCreateCandidates()",
    "function getFusionStatusCandidates(jobId: string)",
    "function normalizeDirectCreate(req: FusionCreateRequest)",
):
    if token not in creator:
        fail(f"missing direct Fusion contract: {token}")

# Single-face exported operations must branch on video mode and use the direct
# Fusion path for TALKING_VIDEO. This deliberately rejects the regression where
# all three exports unconditionally used svc-fusion-extension longform routes.
required = (
    "Single-face Talking Video is the proven direct Fusion workflow.",
    "const payload = normalizeDirectCreate(req);",
    "const base = resolveFusionBase();",
    "getFusionPreviewCandidates()",
    "getFusionCreateCandidates()",
    "getFusionStatusCandidates(jobId)",
    'videoMode: FusionVideoMode | string = "TALKING_VIDEO"',
)
for token in required:
    if token not in creator:
        fail(f"single-face direct route not enforced: {token}")

# Cinematic/longform behavior stays available; this gate is a split, not a
# deletion of longform capability.
for token in (
    "resolveFusionExtensionBase()",
    "getLongformPreviewCandidates()",
    "getLongformCreateCandidates()",
    "getLongformStatusCandidates(jobId)",
):
    if token not in creator:
        fail(f"longform capability unexpectedly removed: {token}")

# Reject the exact old unconditional export shapes.
for fn_name in ("previewFusionPricing", "apiCreateFusionJob"):
    m = re.search(
        rf"export async function {fn_name}\b.*?\n\}}",
        creator,
        re.S,
    )
    if not m:
        fail(f"cannot locate export {fn_name}")
    body = m.group(0)
    if "isCinematicVideoMode(req)" not in body:
        fail(f"{fn_name} does not split direct Talking Video from longform")

# Story/Multi-person must remain isolated from creatorFusion.
if 'from "./api/multiPersonStory"' not in story:
    fail("Multi-person Fusion no longer uses its dedicated Story API")

print("V3_SINGLE_FACE_FUSION_ROUTE_CERT=PASS")
print("TALKING_VIDEO_DIRECT_SVC_FUSION=PASS")
print("CINEMATIC_LONGFORM_PRESERVED=PASS")
print("MULTIPERSON_STORY_API_ISOLATION=PASS")
