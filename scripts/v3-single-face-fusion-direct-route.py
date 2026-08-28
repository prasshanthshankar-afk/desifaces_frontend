#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "src/features/fusion/api/creatorFusion.ts"

OLD_RE = re.compile(
    r'''export async function previewFusionPricing\(\n'''
    r'''  req: FusionCreateRequest\n'''
    r'''\): Promise<StudioPricingPreviewResponse> \{.*?'''
    r'''export const apiGetFusionJobStatus = apiGetFusionJob;''',
    re.S,
)

NEW = r'''export async function previewFusionPricing(
  req: FusionCreateRequest
): Promise<StudioPricingPreviewResponse> {
  try {
    assertSupportedFusionMode(req);

    if (isCinematicVideoMode(req)) {
      const payload = normalizeCreate(req);
      const base = resolveFusionExtensionBase();
      return await firstSuccessfulPost<StudioPricingPreviewResponse>(
        base,
        getLongformPreviewCandidates(),
        payload
      );
    }

    // Single-face Talking Video is the proven direct Fusion workflow.
    // Story/Multi-person uses its own orchestration API and must not cause
    // ordinary Face -> Audio -> Fusion to be promoted to longform.
    const payload = normalizeDirectCreate(req);
    const base = resolveFusionBase();
    return await firstSuccessfulPost<StudioPricingPreviewResponse>(
      base,
      getFusionPreviewCandidates(),
      payload
    );
  } catch (error: any) {
    throwFriendly(
      isCinematicVideoMode(req) ? "Longform pricing preview failed" : "Fusion pricing preview failed",
      error
    );
  }
}

export async function apiCreateFusionJob(req: FusionCreateRequest): Promise<FusionJobView> {
  try {
    assertSupportedFusionMode(req);

    if (isCinematicVideoMode(req)) {
      const payload = normalizeCreate(req);
      const base = resolveFusionExtensionBase();
      const raw = await firstSuccessfulPost<any>(
        base,
        getLongformCreateCandidates(),
        payload
      );
      return normalizeJobView(raw);
    }

    const payload = normalizeDirectCreate(req);
    const base = resolveFusionBase();
    const raw = await firstSuccessfulPost<any>(
      base,
      getFusionCreateCandidates(),
      payload
    );
    return normalizeJobView(raw);
  } catch (error: any) {
    throwFriendly(
      isCinematicVideoMode(req) ? "Create longform job failed" : "Create Fusion job failed",
      error
    );
  }
}

export async function apiGetFusionJob(
  jobId: string,
  videoMode: FusionVideoMode | string = "TALKING_VIDEO"
): Promise<FusionJobView> {
  if (!jobId) throw new Error("Missing jobId");

  const cinematic = clean(videoMode).toUpperCase() === "CINEMATIC_VIDEO_DIRECTION";

  try {
    if (cinematic) {
      const base = resolveFusionExtensionBase();
      const raw = await firstSuccessfulGet<any>(
        base,
        getLongformStatusCandidates(jobId)
      );
      return normalizeJobView(raw);
    }

    const base = resolveFusionBase();
    const raw = await firstSuccessfulGet<any>(
      base,
      getFusionStatusCandidates(jobId)
    );
    return normalizeJobView(raw);
  } catch (error: any) {
    throwFriendly(cinematic ? "Longform status failed" : "Fusion status failed", error);
  }
}

export async function apiGetFusionJobSegments(jobId: string): Promise<FusionSegmentView[]> {
  if (!jobId) throw new Error("Missing jobId");

  try {
    const base = resolveFusionExtensionBase();
    return await firstSuccessfulGet<FusionSegmentView[]>(
      base,
      getLongformSegmentsCandidates(jobId)
    );
  } catch (error: any) {
    throwFriendly("Longform segments failed", error);
  }
}

export const apiGetFusionJobStatus = apiGetFusionJob;'''


def fail(message: str) -> None:
    raise SystemExit(f"V3_SINGLE_FACE_FUSION_DIRECT_ROUTE=FAIL: {message}")


def main() -> None:
    if not TARGET.exists():
        fail(f"missing {TARGET.relative_to(ROOT)}")

    before = TARGET.read_text()

    # Idempotent success if the intended split is already present.
    already = (
        "Single-face Talking Video is the proven direct Fusion workflow." in before
        and "getFusionCreateCandidates()" in before
        and 'videoMode: FusionVideoMode | string = "TALKING_VIDEO"' in before
    )
    if already:
        print("V3_SINGLE_FACE_FUSION_DIRECT_ROUTE=ALREADY_APPLIED")
        return

    matches = list(OLD_RE.finditer(before))
    if len(matches) != 1:
        fail(f"expected one export routing block, found {len(matches)}")

    after = OLD_RE.sub(NEW, before, count=1)

    required = {
        "DIRECT_PREVIEW": "getFusionPreviewCandidates()",
        "DIRECT_CREATE": "getFusionCreateCandidates()",
        "DIRECT_STATUS": "getFusionStatusCandidates(jobId)",
        "DIRECT_BASE": "resolveFusionBase()",
        "LONGFORM_PRESERVED": "getLongformCreateCandidates()",
        "TALKING_DEFAULT": 'videoMode: FusionVideoMode | string = "TALKING_VIDEO"',
    }
    for label, token in required.items():
        if token not in after:
            fail(f"missing contract token {label}: {token}")

    # Story/Multi-person must remain isolated in its own API module.
    story = ROOT / "src/features/fusion/MultiPersonFusionDenseScreen.tsx"
    story_text = story.read_text()
    if 'from "./api/multiPersonStory"' not in story_text:
        fail("Multi-person Fusion no longer imports its dedicated story API")

    TARGET.write_text(after)
    print("V3_SINGLE_FACE_FUSION_SOURCE_SPLIT=PASS")
    print("SINGLE_FACE_TALKING_VIDEO_DIRECT_FUSION=PASS")
    print("MULTIPERSON_STORY_API_ISOLATION=PASS")

    if "--typecheck" in sys.argv:
        subprocess.run(
            ["npx", "tsc", "--noEmit", "--pretty", "false"],
            cwd=ROOT,
            check=True,
        )
        print("TYPESCRIPT_TYPECHECK=PASS")


if __name__ == "__main__":
    main()
