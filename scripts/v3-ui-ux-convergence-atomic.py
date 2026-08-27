#!/usr/bin/env python3
"""Transactional V3 UI/UX convergence patch.

All source transformations are prepared and validated in memory before any file
is written. The patch keeps the established single-face experience intact and
brings Story/Multi-person Face, Audio, Fusion and Final into the same desifaces
visual language without changing backend/API/pricing-generation contracts.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DENSE = ROOT / "src/core/studio/DenseStudioUI.tsx"
ROUTE = ROOT / "src/app/(tabs)/face/story/[storyId].tsx"
FILES = {
    "face": ROOT / "src/features/face/MultiPersonFaceCohortDenseScreen.tsx",
    "saved": ROOT / "src/features/face/MultiPersonFaceSavedWorkScreen.tsx",
    "audio": ROOT / "src/features/audio/MultiPersonAudioWorkspaceScreen.tsx",
    "fusion": ROOT / "src/features/fusion/MultiPersonFusionDenseScreen.tsx",
    "final": ROOT / "src/features/story/MultiPersonStoryFinalScreen.tsx",
}


def replace_known(text: str, old: str, new: str, expected: int, label: str) -> str:
    old_count = text.count(old)
    new_count = text.count(new)
    if old_count == expected:
        return text.replace(old, new)
    if old_count == 0 and new_count >= expected:
        return text
    raise RuntimeError(
        f"source drift [{label}]: expected old={expected}, found old={old_count}, new={new_count}"
    )


def transform(text: str, pairs: list[tuple[str, str, int, str]]) -> str:
    for old, new, expected, label in pairs:
        text = replace_known(text, old, new, expected, label)
    return text


def plans() -> dict[str, list[tuple[str, str, int, str]]]:
    fusion_viewer_old = '''                  <FinalVideoPlayer uri={videoUrl} />\n                  <Text style={styles.finalMediaMeta}>Review the complete scene before approval. Your Face and Audio remain locked if you choose Revise Scene.</Text>'''
    fusion_viewer_new = '''                  <FinalVideoPlayer uri={videoUrl} />\n                  <CompactButton\n                    label="Open in Viewer"\n                    onPress={() => router.push({\n                      pathname: "/(tabs)/media/viewer" as any,\n                      params: {\n                        type: "video",\n                        stage: "video_done",\n                        video_url: videoUrl,\n                        title: "Fusion Video",\n                        subtitle: workspace?.title || "Story scene",\n                      },\n                    } as any)}\n                  />\n                  <Text style={styles.finalMediaMeta}>Review the complete scene before approval. Your Face and Audio remain locked if you choose Revise Scene.</Text>'''

    final_viewer_old = '''            <FinalStoryPlayer uri={videoUrl} />\n\n            <Text style={styles.videoMeta}>'''
    final_viewer_new = '''            <FinalStoryPlayer uri={videoUrl} />\n\n            <CompactButton\n              label="Open in Viewer"\n              onPress={() => router.push({\n                pathname: "/(tabs)/media/viewer" as any,\n                params: {\n                  type: "video",\n                  stage: "video_done",\n                  video_url: videoUrl,\n                  title: workspace?.title || "Story Video",\n                  subtitle: "Final Story",\n                },\n              } as any)}\n              fill\n            />\n\n            <Text style={styles.videoMeta}>'''

    return {
        "face": [
            ('eyebrow="STORY FACE STUDIO"', 'eyebrow="STORY • FACE"', 1, "Face story context"),
            ('<StatusPill value="LOCKED" tone="success" />', '<StatusPill value="Locked" tone="success" />', 1, "Face locked status"),
            ('messageText: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "700" }', 'messageText: { color: STUDIO.text, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Face message"),
            ('batchMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600", marginTop: 3 }', 'batchMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 3 }', 1, "Face batch helper"),
            ('meta: { color: STUDIO.accentText, fontSize: 9, lineHeight: 12, fontWeight: "800", marginTop: 1 }', 'meta: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 1 }', 1, "Face participant meta"),
            ('status: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "700" }', 'status: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Face status"),
            ('choiceTitle: { color: STUDIO.text, fontSize: 9, fontWeight: "900" }', 'choiceTitle: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Face choice title"),
            ('choiceMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "600" }', 'choiceMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 15, fontWeight: "700" }', 1, "Face choice helper"),
            ('choiceButton: { flex: 1, minHeight: 30,', 'choiceButton: { flex: 1, minHeight: 38,', 1, "Face choice target"),
            ('choiceButtonText: { color: STUDIO.text, fontSize: 9, fontWeight: "900" }', 'choiceButtonText: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Face choice button"),
            ('priceLabel: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", textTransform: "uppercase" }', 'priceLabel: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "900" }', 1, "Face price label"),
            ('priceValue: { color: STUDIO.accentText, fontSize: 10, fontWeight: "900" }', 'priceValue: { color: STUDIO.accentText, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Face price value"),
            ('promptLabel: { color: STUDIO.faint, fontSize: 7, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.4 }', 'promptLabel: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 }', 1, "Face direction label"),
            ('promptText: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600" }', 'promptText: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Face direction text"),
            ('attempt: { color: STUDIO.faint, fontSize: 8, fontWeight: "700" }', 'attempt: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "700" }', 1, "Face attempt"),
            ('footerTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" }', 'footerTitle: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Face footer"),
            ('footerMeta: { color: STUDIO.muted, fontSize: 10, fontWeight: "800" }', 'footerMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 15, fontWeight: "800" }', 1, "Face footer meta"),
        ],
        "saved": [
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
        ],
        "audio": [
            ('subtitle="Story Audio Studio"', 'subtitle="Audio Studio"', 2, "Audio header"),
            ('eyebrow="STORY AUDIO STUDIO"', 'eyebrow="STORY • AUDIO"', 1, "Audio story context"),
            ('value={locked ? "LOCKED" : dirty ? "SAVE CHOICE" : "READY"}', 'value={locked ? "Locked" : dirty ? "Save choice" : "Ready"}', 1, "Audio voice status"),
            ('<Text style={styles.choiceKicker}>LANGUAGE</Text>', '<Text style={styles.choiceKicker}>Language</Text>', 1, "Audio language label"),
            ('<Text style={styles.choiceKicker}>VOICE</Text>', '<Text style={styles.choiceKicker}>Voice</Text>', 1, "Audio voice label"),
            ('<Text style={styles.choiceKicker}>DELIVERY</Text>', '<Text style={styles.choiceKicker}>Delivery</Text>', 1, "Audio delivery label"),
            ('<StatusPill value="LOCKED" tone="success" />', '<StatusPill value="Locked" tone="success" />', 1, "Audio locked"),
            ('helper: { color: STUDIO.muted, fontSize: 11, fontWeight: "700" }', 'helper: { color: STUDIO.muted, fontSize: 12, lineHeight: 16, fontWeight: "700" }', 1, "Audio helper"),
            ('messageText: { color: "#FFE6B2", fontSize: 10, lineHeight: 15, fontWeight: "700" }', 'messageText: { color: "#FFE6B2", fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Audio message"),
            ('characterMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 2 }', 'characterMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Audio character helper"),
            ('choiceKicker: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", letterSpacing: 0.65 }', 'choiceKicker: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 }', 1, "Audio field label"),
            ('choiceValue: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "900", marginTop: 4 }', 'choiceValue: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900", marginTop: 4 }', 1, "Audio field value"),
            ('choiceHint: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "600", marginTop: 2 }', 'choiceHint: { color: STUDIO.muted, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 2 }', 1, "Audio field helper"),
            ('saveHint: { flex: 1, color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600" }', 'saveHint: { flex: 1, color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Audio save helper"),
            ('pricingTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" }', 'pricingTitle: { color: STUDIO.text, fontSize: 13, lineHeight: 18, fontWeight: "900" }', 1, "Audio pricing title"),
            ('pricingMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 2 }', 'pricingMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Audio pricing helper"),
            ('dialogueIndexText: { color: STUDIO.accentText, fontSize: 10, fontWeight: "900" }', 'dialogueIndexText: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "900" }', 1, "Audio index"),
            ('dialogueSpeaker: { flex: 1, color: STUDIO.text, fontSize: 10, fontWeight: "900" }', 'dialogueSpeaker: { flex: 1, color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Audio speaker"),
            ('dialogueText: { color: "rgba(255,255,255,0.84)", fontSize: 10, lineHeight: 15, fontWeight: "600" }', 'dialogueText: { color: "rgba(255,255,255,0.84)", fontSize: 12, lineHeight: 17, fontWeight: "700" }', 1, "Audio dialogue"),
            ('dialoguePrice: { color: STUDIO.accentText, fontSize: 8, fontWeight: "800" }', 'dialoguePrice: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "800" }', 1, "Audio price"),
            ('lineError: { color: "#FFC0C6", fontSize: 8, lineHeight: 11, fontWeight: "700" }', 'lineError: { color: "#FFC0C6", fontSize: 10, lineHeight: 14, fontWeight: "700" }', 1, "Audio error"),
            ('choiceLabel: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "900" }', 'choiceLabel: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" }', 1, "Audio picker label"),
            ('choiceSubtitle: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "600", marginTop: 1 }', 'choiceSubtitle: { color: STUDIO.muted, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 1 }', 1, "Audio picker helper"),
        ],
        "fusion": [
            ('subtitle="Story Fusion Studio"', 'subtitle="Fusion Studio"', 2, "Fusion header"),
            ('eyebrow="STORY FUSION STUDIO"', 'eyebrow="STORY • FUSION"', 1, "Fusion story context"),
            (fusion_viewer_old, fusion_viewer_new, 1, "Fusion Viewer"),
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
            ('progressReassurance: { color: STUDIO.faint, fontSize: 7, lineHeight: 11, fontWeight: "600", marginTop: 3 }', 'progressReassurance: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 3 }', 1, "Fusion reassurance"),
            ('priceKicker: { color: STUDIO.accentText, fontSize: 7, fontWeight: "900", letterSpacing: 0.55 }', 'priceKicker: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 }', 1, "Fusion price label"),
            ('priceExplain: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600", marginTop: 2 }', 'priceExplain: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 }', 1, "Fusion price helper"),
            ('priceBillingBasis: { color: STUDIO.accentText, fontSize: 7, lineHeight: 11, fontWeight: "800", marginTop: 4 }', 'priceBillingBasis: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "800", marginTop: 4 }', 1, "Fusion billing basis"),
            ('detailsToggle: { color: STUDIO.accentText, fontSize: 8, fontWeight: "900", paddingVertical: 3 }', 'detailsToggle: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "900", paddingVertical: 4 }', 1, "Fusion price toggle"),
            ('priceDetailName: { flex: 1, color: STUDIO.text, fontSize: 8, fontWeight: "700" }', 'priceDetailName: { flex: 1, color: STUDIO.text, fontSize: 11, lineHeight: 15, fontWeight: "700" }', 1, "Fusion price detail"),
            ('priceDetailValue: { color: STUDIO.accentText, fontSize: 8, fontWeight: "900" }', 'priceDetailValue: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "900" }', 1, "Fusion price detail value"),
            ('finalMediaMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600" }', 'finalMediaMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" }', 1, "Fusion media helper"),
            ('confirmationEyebrow: { color: STUDIO.accentText, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 }', 'confirmationEyebrow: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 }', 1, "Fusion confirmation label"),
            ('confirmationTitle: { color: STUDIO.text, fontSize: 18, lineHeight: 22, fontWeight: "900" }', 'confirmationTitle: { color: STUDIO.text, fontSize: 15, lineHeight: 20, fontWeight: "900" }', 1, "Fusion confirmation title"),
            ('confirmationPrice: { color: STUDIO.accentText, fontSize: 23, lineHeight: 27, fontWeight: "900" }', 'confirmationPrice: { color: STUDIO.accentText, fontSize: 20, lineHeight: 25, fontWeight: "900" }', 1, "Fusion confirmation price"),
            ('confirmationMeta: { color: STUDIO.muted, fontSize: 10, lineHeight: 15, fontWeight: "600" }', 'confirmationMeta: { color: STUDIO.muted, fontSize: 12, lineHeight: 17, fontWeight: "700" }', 1, "Fusion confirmation helper"),
            ('confirmationGuarantee: { color: STUDIO.text, fontSize: 9, lineHeight: 13, fontWeight: "800" }', 'confirmationGuarantee: { color: STUDIO.text, fontSize: 11, lineHeight: 16, fontWeight: "800" }', 1, "Fusion confirmation guarantee"),
        ],
        "final": [
            ('subtitle="Story Final"', 'subtitle="Fusion Studio"', 2, "Final header"),
            ('eyebrow="STORY FINAL"', 'eyebrow="STORY • FINAL"', 1, "Final story context"),
            ('if (state === "awaiting_review") return "READY TO REVIEW";', 'if (state === "awaiting_review") return "Ready to review";', 1, "Final review status"),
            ('if (state === "generating") return "ASSEMBLING";', 'if (state === "generating") return "Assembling";', 1, "Final assembling status"),
            ('if (state === "approved") return "APPROVED";', 'if (state === "approved") return "Approved";', 1, "Final approved status"),
            ('if (state === "failed") return "NEEDS RETRY";', 'if (state === "failed") return "Needs retry";', 1, "Final retry status"),
            ('if (state === "rejected") return "NEEDS ATTENTION";', 'if (state === "rejected") return "Needs attention";', 1, "Final attention status"),
            ('if (state === "ready" || state === "pending") return "READY";', 'if (state === "ready" || state === "pending") return "Ready";', 1, "Final ready status"),
            ('? state.replace(/_/g, " ").toUpperCase()\n    : "WAITING";', '? state.replace(/_/g, " ").replace(/\\b\\w/g, (match) => match.toUpperCase())\n    : "Waiting";', 1, "Final fallback status"),
            ('const allScenesApproved =\n    sceneTotal > 1 && approvedScenes === sceneTotal;', 'const allScenesApproved =\n    sceneTotal > 0 && approvedScenes === sceneTotal;', 1, "Single-scene final readiness"),
            ('? "COMPLETE"', '? "Complete"', 1, "Final complete status"),
            (final_viewer_old, final_viewer_new, 1, "Final Viewer"),
            ('fontSize: 10,\n    fontWeight: "700",\n  },\n  messageBox:', 'fontSize: 12,\n    lineHeight: 16,\n    fontWeight: "700",\n  },\n  messageBox:', 1, "Final helper"),
            ('fontSize: 10,\n    lineHeight: 15,\n    fontWeight: "700",\n  },\n  summaryCard:', 'fontSize: 11,\n    lineHeight: 16,\n    fontWeight: "700",\n  },\n  summaryCard:', 1, "Final message"),
            ('fontSize: 9,\n    lineHeight: 14,\n    fontWeight: "600",\n    marginTop: 3,', 'fontSize: 11,\n    lineHeight: 16,\n    fontWeight: "700",\n    marginTop: 3,', 1, "Final summary helper"),
            ('fontSize: 8,\n    fontWeight: "800",\n    marginTop: 2,\n    textTransform: "uppercase",\n    letterSpacing: 0.45,', 'fontSize: 11,\n    lineHeight: 15,\n    fontWeight: "800",\n    marginTop: 2,', 1, "Final progress label"),
            ('color: "#FFB4BD",\n    fontSize: 9,\n    lineHeight: 14,', 'color: "#FFB4BD",\n    fontSize: 11,\n    lineHeight: 16,', 1, "Final warning"),
            ('videoMeta: {\n    color: STUDIO.muted,\n    fontSize: 9,\n    lineHeight: 14,', 'videoMeta: {\n    color: STUDIO.muted,\n    fontSize: 11,\n    lineHeight: 16,', 1, "Final video helper"),
            ('auditNote: {\n    color: STUDIO.faint,\n    fontSize: 8,\n    lineHeight: 13,', 'auditNote: {\n    color: STUDIO.faint,\n    fontSize: 10,\n    lineHeight: 15,', 1, "Final audit note"),
            ('footerTitle: {\n    color: STUDIO.text,\n    fontSize: 11,', 'footerTitle: {\n    color: STUDIO.text,\n    fontSize: 12,\n    lineHeight: 16,', 1, "Final footer title"),
            ('footerMeta: {\n    color: STUDIO.muted,\n    fontSize: 9,', 'footerMeta: {\n    color: STUDIO.muted,\n    fontSize: 11,\n    lineHeight: 15,', 1, "Final footer meta"),
        ],
    }


def validate_transformed(texts: dict[str, str]) -> None:
    required = {
        "face": ["STORY • FACE", 'StatusPill value="Locked"'],
        "saved": [">Saved Work</Text>", "fontSize: 13"],
        "audio": ['subtitle="Audio Studio"', "STORY • AUDIO", "Audio price ready"],
        "fusion": ['subtitle="Fusion Studio"', "STORY • FUSION", 'label="Open in Viewer"'],
        "final": ['subtitle="Fusion Studio"', "STORY • FINAL", 'label="Open in Viewer"', "sceneTotal > 0 && approvedScenes === sceneTotal"],
    }
    for key, needles in required.items():
        for needle in needles:
            if needle not in texts[key]:
                raise RuntimeError(f"{key} convergence check missing: {needle}")

    banned = ["Story Audio Studio", "Story Fusion Studio", 'subtitle="Story Final"', "STORY FACE STUDIO"]
    combined = "\n".join(texts.values())
    for label in banned:
        if label in combined:
            raise RuntimeError(f"legacy mode-switch label remains: {label}")

    for key, text in texts.items():
        tiny = re.findall(r"fontSize:\s*([789])\b", text)
        if tiny:
            raise RuntimeError(f"{key} still contains tiny user-visible font sizes: {tiny}")

    dense = DENSE.read_text(encoding="utf-8")
    for needle in [
        "fontSize: 15,\n    lineHeight: 20",
        "fontSize: 12,\n    lineHeight: 17",
        "minHeight: 40",
        "numberOfLines={2}",
    ]:
        if needle not in dense:
            raise RuntimeError(f"DenseStudioUI convergence contract missing: {needle}")

    route = ROUTE.read_text(encoding="utf-8")
    if 'DFHeader subtitle="Face Studio"' not in route or "Story Face Studio" in route:
        raise RuntimeError("Story Face route is not aligned to the single-face Face Studio header")


def prepare() -> tuple[dict[str, str], list[str]]:
    source = {key: path.read_text(encoding="utf-8") for key, path in FILES.items()}
    transformed: dict[str, str] = {}
    changed: list[str] = []
    plan = plans()
    for key, text in source.items():
        next_text = transform(text, plan[key])
        transformed[key] = next_text
        if next_text != text:
            changed.append(key)
    validate_transformed(transformed)
    return transformed, changed


def write_all(transformed: dict[str, str]) -> None:
    # No writes happen until every transformation and validation has succeeded.
    for key, path in FILES.items():
        current = path.read_text(encoding="utf-8")
        if current != transformed[key]:
            path.write_text(transformed[key], encoding="utf-8")


def run_typecheck() -> None:
    subprocess.run(["npx", "tsc", "--noEmit"], cwd=ROOT, check=True)
    print("TYPESCRIPT_TYPECHECK=PASS")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate only; do not write")
    parser.add_argument("--typecheck", action="store_true", help="run TypeScript typecheck after source validation")
    args = parser.parse_args()

    try:
        transformed, changed = prepare()
        if not args.check:
            write_all(transformed)
        print("V3_UI_UX_SOURCE_CONTRACT=PASS")
        print("PLANNED_OR_APPLIED=" + (",".join(changed) if changed else "NONE_ALREADY_CONVERGED"))
        print("SINGLE_FACE_VISUAL_REFERENCE=PRESERVED")
        print("MULTIPERSON_HEADERS_SYMMETRIC=PASS")
        print("NO_TINY_7_8_9PX_STORY_TEXT=PASS")
        print("PRICING_PROGRESS_READABILITY=PASS")
        print("VIEWER_REUSE=PASS")
        print("SINGLE_SCENE_FINAL_READINESS=PASS")
        if args.typecheck:
            run_typecheck()
        return 0
    except Exception as exc:
        print(f"V3_UI_UX_CONVERGENCE=FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
