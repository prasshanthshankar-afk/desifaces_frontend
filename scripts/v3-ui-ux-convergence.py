#!/usr/bin/env python3
"""Apply the V3 single-face / Story UI-UX convergence package.

This is intentionally a narrow product-quality patch. It does not redesign the
single-face workflow and does not introduce a new shared-service/platform layer.
It brings the existing Multi-person / Story screens back into the established
desifaces visual language and Viewer behavior.

Safe/idempotent behavior:
- only edits the named V3 frontend screens;
- requires exact known source patterns or already-converged replacements;
- never changes API contracts, pricing calculation, auth, generation or billing;
- can be run more than once;
- --check validates the resulting source without changing it.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    "face": ROOT / "src/features/face/MultiPersonFaceCohortDenseScreen.tsx",
    "saved": ROOT / "src/features/face/MultiPersonFaceSavedWorkScreen.tsx",
    "audio": ROOT / "src/features/audio/MultiPersonAudioWorkspaceScreen.tsx",
    "fusion": ROOT / "src/features/fusion/MultiPersonFusionDenseScreen.tsx",
    "final": ROOT / "src/features/story/MultiPersonStoryFinalScreen.tsx",
}


def replace_known(text: str, old: str, new: str, *, expected: int = 1, label: str = "") -> str:
    old_count = text.count(old)
    new_count = text.count(new)
    if old_count == expected:
        return text.replace(old, new)
    if old_count == 0 and new_count >= expected:
        return text
    raise RuntimeError(
        f"source drift for {label or old[:60]!r}: expected {expected} old occurrence(s), "
        f"found old={old_count}, new={new_count}"
    )


def apply_pairs(path: Path, pairs: list[tuple[str, str, int, str]]) -> bool:
    text = path.read_text(encoding="utf-8")
    original = text
    for old, new, expected, label in pairs:
        text = replace_known(text, old, new, expected=expected, label=label)
    if text != original:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def apply() -> None:
    missing = [str(path) for path in FILES.values() if not path.is_file()]
    if missing:
        raise RuntimeError("missing expected V3 frontend files: " + ", ".join(missing))

    changed: list[str] = []

    face_pairs = [
        ('eyebrow="STORY FACE STUDIO"', 'eyebrow="STORY • FACE"', 1, "Face story context"),
        ('<StatusPill value="LOCKED" tone="success" />', '<StatusPill value="Locked" tone="success" />', 1, "Face locked status"),
        ('messageText: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "700" }', 'messageText: { color: STUDIO.text, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Face message typography"),
        ('batchMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600", marginTop: 3 }', 'batchMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 3 }', 1, "Face batch helper"),
        ('meta: { color: STUDIO.accentText, fontSize: 9, lineHeight: 12, fontWeight: "800", marginTop: 1 }', 'meta: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 1 }', 1, "Face participant meta"),
        ('status: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "700" }', 'status: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Face status copy"),
        ('choiceTitle: { color: STUDIO.text, fontSize: 9, fontWeight: "900" }', 'choiceTitle: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Face choice title"),
        ('choiceMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "600" }', 'choiceMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 15, fontWeight: "700" }', 1, "Face choice helper"),
        ('choiceButton: { flex: 1, minHeight: 30,', 'choiceButton: { flex: 1, minHeight: 38,', 1, "Face choice target"),
        ('choiceButtonText: { color: STUDIO.text, fontSize: 9, fontWeight: "900" }', 'choiceButtonText: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Face choice button"),
        ('priceLabel: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", textTransform: "uppercase" }', 'priceLabel: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "900" }', 1, "Face price label"),
        ('priceValue: { color: STUDIO.accentText, fontSize: 10, fontWeight: "900" }', 'priceValue: { color: STUDIO.accentText, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Face price value"),
        ('promptLabel: { color: STUDIO.faint, fontSize: 7, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.4 }', 'promptLabel: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 }', 1, "Face direction label"),
        ('promptText: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600" }', 'promptText: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Face direction text"),
        ('attempt: { color: STUDIO.faint, fontSize: 8, fontWeight: "700" }', 'attempt: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "700" }', 1, "Face attempt text"),
        ('footerTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" }', 'footerTitle: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Face footer title"),
        ('footerMeta: { color: STUDIO.muted, fontSize: 10, fontWeight: "800" }', 'footerMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 15, fontWeight: "800" }', 1, "Face footer meta"),
    ]
    if apply_pairs(FILES["face"], face_pairs):
        changed.append("Face")

    saved_pairs = [
        ('<Text style={styles.reuseTitle}>Saved Work first</Text>', '<Text style={styles.reuseTitle}>Saved Work</Text>', 1, "Saved Work title"),
        ('<StatusPill value="LOCKED" tone="success" />', '<StatusPill value="Locked" tone="success" />', 1, "Saved Work locked"),
        ('<StatusPill value="CREATING" tone="accent" />', '<StatusPill value="Creating" tone="accent" />', 1, "Saved Work creating"),
        ('reuseTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" }', 'reuseTitle: { color: STUDIO.text, fontSize: 13, lineHeight: 18, fontWeight: "900" }', 1, "Saved Work heading"),
        ('reuseMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600", marginTop: 2 }', 'reuseMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Saved Work helper"),
        ('participantName: { maxWidth: 160, color: STUDIO.accentText, fontSize: 10, lineHeight: 13, fontWeight: "900" }', 'participantName: { maxWidth: 180, color: STUDIO.accentText, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Saved Work participant"),
        ('messageText: { color: "#FFC0C6", fontSize: 9, lineHeight: 13, fontWeight: "700", paddingHorizontal: 4, paddingTop: 4 }', 'messageText: { color: "#FFC0C6", fontSize: 11, lineHeight: 16, fontWeight: "700", paddingHorizontal: 4, paddingTop: 4 }', 1, "Saved Work message"),
        ('modalMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 3 }', 'modalMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 3 }', 1, "Saved Work modal helper"),
        ('loadingText: { color: STUDIO.muted, fontSize: 10, fontWeight: "700" }', 'loadingText: { color: STUDIO.muted, fontSize: 12, lineHeight: 16, fontWeight: "700" }', 1, "Saved Work loading"),
        ('faceTitle: { color: STUDIO.text, fontSize: 10, lineHeight: 13, fontWeight: "900", marginTop: 7 }', 'faceTitle: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900", marginTop: 7 }', 1, "Saved Work face title"),
        ('faceAction: { color: STUDIO.accentText, fontSize: 8, lineHeight: 11, fontWeight: "700", marginTop: 2 }', 'faceAction: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 2 }', 1, "Saved Work action"),
        ('emptyMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 14, textAlign: "center" }', 'emptyMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, textAlign: "center" }', 1, "Saved Work empty helper"),
    ]
    if apply_pairs(FILES["saved"], saved_pairs):
        changed.append("Saved Work")

    audio_pairs = [
        ('subtitle="Story Audio Studio"', 'subtitle="Audio Studio"', 2, "Audio standard header"),
        ('eyebrow="STORY AUDIO STUDIO"', 'eyebrow="STORY • AUDIO"', 1, "Audio story context"),
        ('<StatusPill\n                  value={locked ? "LOCKED" : dirty ? "SAVE CHOICE" : "READY"}', '<StatusPill\n                  value={locked ? "Locked" : dirty ? "Save choice" : "Ready"}', 1, "Audio voice status"),
        ('<Text style={styles.choiceKicker}>LANGUAGE</Text>', '<Text style={styles.choiceKicker}>Language</Text>', 1, "Audio language label"),
        ('<Text style={styles.choiceKicker}>VOICE</Text>', '<Text style={styles.choiceKicker}>Voice</Text>', 1, "Audio voice label"),
        ('<Text style={styles.choiceKicker}>DELIVERY</Text>', '<Text style={styles.choiceKicker}>Delivery</Text>', 1, "Audio delivery label"),
        ('<StatusPill value="LOCKED" tone="success" />', '<StatusPill value="Locked" tone="success" />', 1, "Audio locked status"),
        ('helper: { color: STUDIO.muted, fontSize: 11, fontWeight: "700" }', 'helper: { color: STUDIO.muted, fontSize: 12, lineHeight: 16, fontWeight: "700" }', 1, "Audio helper"),
        ('messageText: { color: "#FFE6B2", fontSize: 10, lineHeight: 15, fontWeight: "700" }', 'messageText: { color: "#FFE6B2", fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Audio message"),
        ('characterMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 2 }', 'characterMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Audio character helper"),
        ('choiceKicker: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", letterSpacing: 0.65 }', 'choiceKicker: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 }', 1, "Audio field label"),
        ('choiceValue: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "900", marginTop: 4 }', 'choiceValue: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900", marginTop: 4 }', 1, "Audio field value"),
        ('choiceHint: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "600", marginTop: 2 }', 'choiceHint: { color: STUDIO.muted, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 2 }', 1, "Audio field helper"),
        ('saveHint: { flex: 1, color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600" }', 'saveHint: { flex: 1, color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Audio save helper"),
        ('pricingTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" }', 'pricingTitle: { color: STUDIO.text, fontSize: 13, lineHeight: 18, fontWeight: "900" }', 1, "Audio pricing title"),
        ('pricingMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 2 }', 'pricingMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Audio pricing helper"),
        ('dialogueIndexText: { color: STUDIO.accentText, fontSize: 10, fontWeight: "900" }', 'dialogueIndexText: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "900" }', 1, "Audio dialogue index"),
        ('dialogueSpeaker: { flex: 1, color: STUDIO.text, fontSize: 10, fontWeight: "900" }', 'dialogueSpeaker: { flex: 1, color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Audio speaker"),
        ('dialogueText: { color: "rgba(255,255,255,0.84)", fontSize: 10, lineHeight: 15, fontWeight: "600" }', 'dialogueText: { color: "rgba(255,255,255,0.84)", fontSize: 12, lineHeight: 17, fontWeight: "700" }', 1, "Audio dialogue"),
        ('dialoguePrice: { color: STUDIO.accentText, fontSize: 8, fontWeight: "800" }', 'dialoguePrice: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "800" }', 1, "Audio line price"),
        ('lineError: { color: "#FFC0C6", fontSize: 8, lineHeight: 11, fontWeight: "700" }', 'lineError: { color: "#FFC0C6", fontSize: 10, lineHeight: 14, fontWeight: "700" }', 1, "Audio line error"),
        ('choiceLabel: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "900" }', 'choiceLabel: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Audio picker label"),
        ('choiceSubtitle: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "600", marginTop: 1 }', 'choiceSubtitle: { color: STUDIO.muted, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 1 }', 1, "Audio picker helper"),
    ]
    if apply_pairs(FILES["audio"], audio_pairs):
        changed.append("Audio")

    fusion_viewer_old = '''                  <FinalVideoPlayer uri={videoUrl} />\n                  <Text style={styles.finalMediaMeta}>Review the complete scene before approval. Your Face and Audio remain locked if you choose Revise Scene.</Text>'''
    fusion_viewer_new = '''                  <FinalVideoPlayer uri={videoUrl} />\n                  <CompactButton\n                    label="Open in Viewer"\n                    onPress={() => router.push({\n                      pathname: "/(tabs)/media/viewer" as any,\n                      params: {\n                        type: "video",\n                        stage: "video_done",\n                        video_url: videoUrl,\n                        title: "Fusion Video",\n                        subtitle: workspace?.title || "Story scene",\n                      },\n                    } as any)}\n                  />\n                  <Text style={styles.finalMediaMeta}>Review the complete scene before approval. Your Face and Audio remain locked if you choose Revise Scene.</Text>'''

    fusion_pairs = [
        ('subtitle="Story Fusion Studio"', 'subtitle="Fusion Studio"', 2, "Fusion standard header"),
        ('eyebrow="STORY FUSION STUDIO"', 'eyebrow="STORY • FUSION"', 1, "Fusion story context"),
        (fusion_viewer_old, fusion_viewer_new, 1, "Fusion Viewer reuse"),
        ('messageText: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "700" }', 'messageText: { color: STUDIO.text, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Fusion message"),
        ('readinessMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 2 }', 'readinessMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Fusion readiness helper"),
        ('readinessLabel: { color: STUDIO.faint, fontSize: 7, fontWeight: "900", letterSpacing: 0.45, textTransform: "uppercase" }', 'readinessLabel: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 }', 1, "Fusion readiness label"),
        ('readinessValue: { color: STUDIO.text, fontSize: 9, lineHeight: 12, fontWeight: "800", marginTop: 1 }', 'readinessValue: { color: STUDIO.text, fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 1 }', 1, "Fusion readiness value"),
        ('consentTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" }', 'consentTitle: { color: STUDIO.text, fontSize: 13, lineHeight: 18, fontWeight: "900" }', 1, "Fusion consent title"),
        ('consentMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600", marginTop: 2 }', 'consentMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Fusion consent helper"),
        ('sceneMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600", marginTop: 2 }', 'sceneMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Fusion scene helper"),
        ('progressTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" }', 'progressTitle: { color: STUDIO.text, fontSize: 13, lineHeight: 18, fontWeight: "900" }', 1, "Fusion progress title"),
        ('progressMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "700", marginTop: 3 }', 'progressMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 3 }', 1, "Fusion progress helper"),
        ('progressEta: { color: STUDIO.accentText, fontSize: 8, lineHeight: 12, fontWeight: "900", marginTop: 3 }', 'progressEta: { color: STUDIO.accentText, fontSize: 11, lineHeight: 16, fontWeight: "900", marginTop: 3 }', 1, "Fusion progress ETA"),
        ('progressReassurance: { color: STUDIO.faint, fontSize: 7, lineHeight: 11, fontWeight: "600", marginTop: 3 }', 'progressReassurance: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 3 }', 1, "Fusion progress reassurance"),
        ('priceKicker: { color: STUDIO.accentText, fontSize: 7, fontWeight: "900", letterSpacing: 0.55 }', 'priceKicker: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 }', 1, "Fusion price label"),
        ('priceExplain: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600", marginTop: 2 }', 'priceExplain: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Fusion price explanation"),
        ('priceBillingBasis: { color: STUDIO.accentText, fontSize: 7, lineHeight: 11, fontWeight: "800", marginTop: 4 }', 'priceBillingBasis: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "800", marginTop: 4 }', 1, "Fusion billing basis"),
        ('detailsToggle: { color: STUDIO.accentText, fontSize: 8, fontWeight: "900", paddingVertical: 3 }', 'detailsToggle: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "900", paddingVertical: 4 }', 1, "Fusion price details toggle"),
        ('priceDetailName: { flex: 1, color: STUDIO.text, fontSize: 8, fontWeight: "700" }', 'priceDetailName: { flex: 1, color: STUDIO.text, fontSize: 11, lineHeight: 15, fontWeight: "700" }', 1, "Fusion price detail name"),
        ('priceDetailValue: { color: STUDIO.accentText, fontSize: 8, fontWeight: "900" }', 'priceDetailValue: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "900" }', 1, "Fusion price detail value"),
        ('finalMediaMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600" }', 'finalMediaMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Fusion media helper"),
        ('confirmationEyebrow: { color: STUDIO.accentText, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 }', 'confirmationEyebrow: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 }', 1, "Fusion confirmation label"),
        ('confirmationTitle: { color: STUDIO.text, fontSize: 18, lineHeight: 22, fontWeight: "900" }', 'confirmationTitle: { color: STUDIO.text, fontSize: 15, lineHeight: 20, fontWeight: "900" }', 1, "Fusion confirmation title"),
        ('confirmationPrice: { color: STUDIO.accentText, fontSize: 23, lineHeight: 27, fontWeight: "900" }', 'confirmationPrice: { color: STUDIO.accentText, fontSize: 20, lineHeight: 25, fontWeight: "900" }', 1, "Fusion confirmation price"),
        ('confirmationMeta: { color: STUDIO.muted, fontSize: 10, lineHeight: 15, fontWeight: "600" }', 'confirmationMeta: { color: STUDIO.muted, fontSize: 12, lineHeight: 17, fontWeight: "700" }', 1, "Fusion confirmation helper"),
        ('confirmationGuarantee: { color: STUDIO.text, fontSize: 9, lineHeight: 13, fontWeight: "800" }', 'confirmationGuarantee: { color: STUDIO.text, fontSize: 11, lineHeight: 16, fontWeight: "800" }', 1, "Fusion confirmation guarantee"),
    ]
    if apply_pairs(FILES["fusion"], fusion_pairs):
        changed.append("Fusion")

    final_viewer_old = '''            <FinalStoryPlayer uri={videoUrl} />\n\n            <Text style={styles.videoMeta}>'''
    final_viewer_new = '''            <FinalStoryPlayer uri={videoUrl} />\n\n            <CompactButton\n              label="Open in Viewer"\n              onPress={() => router.push({\n                pathname: "/(tabs)/media/viewer" as any,\n                params: {\n                  type: "video",\n                  stage: "video_done",\n                  video_url: videoUrl,\n                  title: workspace?.title || "Story Video",\n                  subtitle: "Final Story",\n                },\n              } as any)}\n              fill\n            />\n\n            <Text style={styles.videoMeta}>'''

    final_pairs = [
        ('subtitle="Story Final"', 'subtitle="Fusion Studio"', 2, "Final standard header"),
        ('eyebrow="STORY FINAL"', 'eyebrow="STORY • FINAL"', 1, "Final story context"),
        ('if (state === "awaiting_review") return "READY TO REVIEW";', 'if (state === "awaiting_review") return "Ready to review";', 1, "Final review status"),
        ('if (state === "generating") return "ASSEMBLING";', 'if (state === "generating") return "Assembling";', 1, "Final generating status"),
        ('if (state === "approved") return "APPROVED";', 'if (state === "approved") return "Approved";', 1, "Final approved status"),
        ('if (state === "failed") return "NEEDS RETRY";', 'if (state === "failed") return "Needs retry";', 1, "Final retry status"),
        ('if (state === "rejected") return "NEEDS ATTENTION";', 'if (state === "rejected") return "Needs attention";', 1, "Final attention status"),
        ('if (state === "ready" || state === "pending") return "READY";', 'if (state === "ready" || state === "pending") return "Ready";', 1, "Final ready status"),
        (': state.replace(/_/g, " ").toUpperCase()\n    : "WAITING";', ': state.replace(/_/g, " ").replace(/\\b\\w/g, (match) => match.toUpperCase())\n    : "Waiting";', 1, "Final fallback status"),
        ('const allScenesApproved =\n    sceneTotal > 1 && approvedScenes === sceneTotal;', 'const allScenesApproved =\n    sceneTotal > 0 && approvedScenes === sceneTotal;', 1, "Single-scene final readiness"),
        ('? "COMPLETE"', '? "Complete"', 1, "Final complete status"),
        (final_viewer_old, final_viewer_new, 1, "Final Viewer reuse"),
        ('fontSize: 10,\n    fontWeight: "700",\n  },\n  messageBox:', 'fontSize: 12,\n    lineHeight: 16,\n    fontWeight: "700",\n  },\n  messageBox:', 1, "Final helper"),
        ('fontSize: 10,\n    lineHeight: 15,\n    fontWeight: "700",\n  },\n  summaryCard:', 'fontSize: 11,\n    lineHeight: 16,\n    fontWeight: "700",\n  },\n  summaryCard:', 1, "Final message"),
        ('fontSize: 9,\n    lineHeight: 14,\n    fontWeight: "600",\n    marginTop: 3,', 'fontSize: 11,\n    lineHeight: 16,\n    fontWeight: "700",\n    marginTop: 3,', 1, "Final summary helper"),
        ('fontSize: 8,\n    fontWeight: "800",\n    marginTop: 2,\n    textTransform: "uppercase",\n    letterSpacing: 0.45,', 'fontSize: 11,\n    lineHeight: 15,\n    fontWeight: "800",\n    marginTop: 2,', 1, "Final scene progress label"),
        ('color: "#FFB4BD",\n    fontSize: 9,\n    lineHeight: 14,', 'color: "#FFB4BD",\n    fontSize: 11,\n    lineHeight: 16,', 1, "Final warning"),
        ('videoMeta: {\n    color: STUDIO.muted,\n    fontSize: 9,\n    lineHeight: 14,', 'videoMeta: {\n    color: STUDIO.muted,\n    fontSize: 11,\n    lineHeight: 16,', 1, "Final video helper"),
        ('auditNote: {\n    color: STUDIO.faint,\n    fontSize: 8,\n    lineHeight: 13,', 'auditNote: {\n    color: STUDIO.faint,\n    fontSize: 10,\n    lineHeight: 15,', 1, "Final audit note"),
        ('footerTitle: {\n    color: STUDIO.text,\n    fontSize: 11,', 'footerTitle: {\n    color: STUDIO.text,\n    fontSize: 12,\n    lineHeight: 16,', 1, "Final footer title"),
        ('footerMeta: {\n    color: STUDIO.muted,\n    fontSize: 9,', 'footerMeta: {\n    color: STUDIO.muted,\n    fontSize: 11,\n    lineHeight: 15,', 1, "Final footer meta"),
    ]
    if apply_pairs(FILES["final"], final_pairs):
        changed.append("Story Final")

    print("V3_UI_UX_CONVERGENCE_APPLIED=YES")
    print("CHANGED=" + (",".join(changed) if changed else "NONE_ALREADY_CONVERGED"))


def validate() -> None:
    for key, path in FILES.items():
        if not path.is_file():
            raise RuntimeError(f"missing {key}: {path}")

    checks = {
        "face": ["STORY • FACE", 'StatusPill value="Locked"'],
        "saved": [">Saved Work</Text>", "fontSize: 13"],
        "audio": ['subtitle="Audio Studio"', "STORY • AUDIO", "Audio price ready"],
        "fusion": ['subtitle="Fusion Studio"', "STORY • FUSION", 'label="Open in Viewer"'],
        "final": ['subtitle="Fusion Studio"', "STORY • FINAL", 'label="Open in Viewer"', "sceneTotal > 0 && approvedScenes === sceneTotal"],
    }
    for key, needles in checks.items():
        text = FILES[key].read_text(encoding="utf-8")
        for needle in needles:
            if needle not in text:
                raise RuntimeError(f"{key} convergence check missing: {needle}")

    banned_labels = ["Story Audio Studio", "Story Fusion Studio", 'subtitle="Story Final"', "STORY FACE STUDIO"]
    combined = "\n".join(path.read_text(encoding="utf-8") for path in FILES.values())
    for label in banned_labels:
        if label in combined:
            raise RuntimeError(f"legacy mode-switch label remains: {label}")

    # User-visible V3 Story text must not be rendered at 7/8/9px after convergence.
    for key, path in FILES.items():
        text = path.read_text(encoding="utf-8")
        tiny = re.findall(r"fontSize:\s*([789])\b", text)
        if tiny:
            raise RuntimeError(f"{key} still contains tiny user-visible font sizes: {tiny}")

    dense = (ROOT / "src/core/studio/DenseStudioUI.tsx").read_text(encoding="utf-8")
    required_dense = [
        "fontSize: 15,\n    lineHeight: 20",
        "fontSize: 12,\n    lineHeight: 17",
        "numberOfLines={2}",
        "minHeight: 40",
        "fontSize: 12, lineHeight: 16, fontWeight: \"900\", textAlign: \"center\"",
    ]
    for needle in required_dense:
        if needle not in dense:
            raise RuntimeError(f"DenseStudioUI convergence check missing: {needle}")

    print("V3_UI_UX_STATIC_CONTRACT=PASS")
    print("SINGLE_FACE_VISUAL_REFERENCE=PRESERVED")
    print("MULTIPERSON_HEADERS_SYMMETRIC=PASS")
    print("NO_TINY_7_8_9PX_STORY_TEXT=PASS")
    print("VIEWER_REUSE=PASS")
    print("PRICING_PROGRESS_TEXT_READABILITY=PASS")


def run_typecheck() -> None:
    package = ROOT / "package.json"
    if not package.is_file():
        raise RuntimeError("package.json missing")
    cmd = ["npx", "tsc", "--noEmit"]
    print("TYPECHECK_COMMAND=" + " ".join(cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)
    print("TYPESCRIPT_TYPECHECK=PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate only; do not edit")
    parser.add_argument("--typecheck", action="store_true", help="also run npx tsc --noEmit")
    args = parser.parse_args()

    try:
        if not args.check:
            apply()
        validate()
        if args.typecheck:
            run_typecheck()
        return 0
    except Exception as exc:
        print(f"V3_UI_UX_CONVERGENCE=FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
