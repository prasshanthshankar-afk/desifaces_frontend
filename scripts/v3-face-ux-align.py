#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FACE = ROOT / "src/features/face/FaceStudioScreen.tsx"
DIRECTOR = ROOT / "src/features/face/MultiPersonFaceDirectorScreen.tsx"


def patch_face_studio() -> None:
    text = FACE.read_text()

    import_line = 'import FaceCreationModeSwitch from "./FaceCreationModeSwitch";\n'
    anchor_import = 'import DFHeader from "../../core/ui/DFHeader";\n'
    if import_line not in text:
        if anchor_import not in text:
            raise SystemExit("V3_FACE_UX_PATCH_FAIL=face_import_anchor_missing")
        text = text.replace(anchor_import, anchor_import + import_line, 1)

    old = """        onPressMeta={openPlanScreen}\n      />\n      <Stepper step={1} />"""
    new = """        onPressMeta={openPlanScreen}\n      />\n      <FaceCreationModeSwitch active=\"individual\" />\n      <Stepper step={1} />"""
    if '<FaceCreationModeSwitch active="individual" />' not in text:
        if old not in text:
            raise SystemExit("V3_FACE_UX_PATCH_FAIL=face_header_anchor_missing")
        text = text.replace(old, new, 1)

    FACE.write_text(text)


def patch_director_screen() -> None:
    text = DIRECTOR.read_text()
    text = text.replace("  SafeAreaView,\n", "", 1)
    text = text.replace(
        '<SafeAreaView style={styles.safe}>',
        '<View style={styles.safe}>',
        1,
    )
    text = text.replace("</SafeAreaView>", "</View>", 1)

    if "SafeAreaView" in text:
        raise SystemExit("V3_FACE_UX_PATCH_FAIL=nested_safe_area_remains")

    DIRECTOR.write_text(text)


def verify() -> None:
    face = FACE.read_text()
    director = DIRECTOR.read_text()
    required = {
        "face_mode_import": 'FaceCreationModeSwitch from "./FaceCreationModeSwitch"',
        "individual_mode": '<FaceCreationModeSwitch active="individual" />',
    }
    for label, needle in required.items():
        if needle not in face:
            raise SystemExit(f"V3_FACE_UX_PATCH_FAIL={label}")
    if "SafeAreaView" in director:
        raise SystemExit("V3_FACE_UX_PATCH_FAIL=director_safe_area")


patch_face_studio()
patch_director_screen()
verify()
print("V3_FACE_UX_SAFE_AREA=PASS")
print("V3_FACE_UX_MODE_NAVIGATION=PASS")
