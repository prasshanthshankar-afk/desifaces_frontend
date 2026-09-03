#!/usr/bin/env python3
from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)


face_path = Path("src/features/face/FaceStudioScreen.tsx")
face = face_path.read_text()
if 'GenerationProgressCard from "../../components/jobs/GenerationProgressCard"' not in face:
    face = replace_once(
        face,
        'import { RunReceiptCard } from "../../components/pricing/RunReceiptCard";\n',
        'import { RunReceiptCard } from "../../components/pricing/RunReceiptCard";\nimport GenerationProgressCard from "../../components/jobs/GenerationProgressCard";\n',
        "face progress import",
    )
if "generationProgress, setGenerationProgress" not in face:
    face = replace_once(
        face,
        '  const [inlineStatus, setInlineStatus] = useState<string | null>(null);\n',
        '  const [inlineStatus, setInlineStatus] = useState<string | null>(null);\n  const [generationProgress, setGenerationProgress] = useState<any | null>(null);\n',
        "face progress state",
    )
    face = replace_once(
        face,
        '    setInlineStatus(null);\n    setUploadingSource(false);\n',
        '    setInlineStatus(null);\n    setGenerationProgress(null);\n    setUploadingSource(false);\n',
        "face progress reset",
    )
    face = replace_once(
        face,
        '            last = await apiGetFaceJobStatus(jobId);\n            consecutivePollingErrors = 0;\n',
        '            last = await apiGetFaceJobStatus(jobId);\n            setGenerationProgress(last?.progress ?? null);\n            consecutivePollingErrors = 0;\n',
        "face progress poll",
    )
    face = replace_once(
        face,
        '          {!!inlineStatus && (\n',
        '          {!!generationProgress && (\n            <GenerationProgressCard\n              kind="face"\n              status={String(generationProgress?.stage || "running")}\n              progress={generationProgress}\n            />\n          )}\n\n          {!!inlineStatus && (\n',
        "face progress render",
    )
face_path.write_text(face)


fusion_path = Path("src/features/fusion/FusionStudioScreen.tsx")
fusion = fusion_path.read_text()
if 'GenerationProgressCard from "../../components/jobs/GenerationProgressCard"' not in fusion:
    anchor = 'import GlobalJobsTray, { type StudioJobItem } from "../jobs/components/GlobalJobsTray";\n'
    if anchor not in fusion:
        anchor = 'import DFBlockingOverlay from "../../core/ui/DFBlockingOverlay";\n'
    fusion = replace_once(
        fusion,
        anchor,
        anchor + 'import GenerationProgressCard from "../../components/jobs/GenerationProgressCard";\n',
        "fusion progress import",
    )
if 'GenerationProgressCard\n              kind="video"' not in fusion:
    run_receipt_anchor = '            <RunReceiptCard\n'
    fusion = replace_once(
        fusion,
        run_receipt_anchor,
        '            {!!latestFusionJobStatus?.progress && (\n              <GenerationProgressCard\n                kind="video"\n                status={String(latestFusionJobStatus?.status || "running")}\n                progress={latestFusionJobStatus.progress}\n              />\n            )}\n\n' + run_receipt_anchor,
        "fusion progress render",
    )
fusion_path.write_text(fusion)

print("MOBILE_GENERATION_PROGRESS_PATCH=PASS")
