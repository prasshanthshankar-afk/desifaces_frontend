#!/usr/bin/env python3
from pathlib import Path


def once(text:str,old:str,new:str,label:str)->str:
    n=text.count(old)
    if n!=1:
        raise SystemExit(f"{label}: expected exactly one anchor, found {n}")
    return text.replace(old,new,1)


def exact_count_replace(text:str,old:str,new:str,expected:int,label:str)->str:
    n=text.count(old)
    if n!=expected:
        raise SystemExit(f"{label}: expected exactly {expected} anchors, found {n}")
    return text.replace(old,new)

# -----------------------------------------------------------------------------
# Both dashboard skins: same spending capability, compact mobile presentation.
# -----------------------------------------------------------------------------
for rel, placement in [
    ("src/features/dashboard/ClassicDashboard.tsx", "        <View style={styles.savedWorkCard}>"),
    ("src/features/dashboard/TeslaDashboard.tsx", "        <View style={styles.vaultCard}>"),
]:
    p=Path(rel); s=p.read_text()
    if "SPENDING_SUMMARY_MOBILE_V1" not in s:
        # Both current dashboard skins share the canonical pricing resolver import.
        import_anchor='import { resolvePricingDisplay, useResolvedPricingDisplay } from "../../core/pricing/resolvePricingDisplay";\n'
        s=once(s,import_anchor,import_anchor+'import SpendingSummaryCard from "../../components/pricing/SpendingSummaryCard"; // SPENDING_SUMMARY_MOBILE_V1\n',f"{rel} spending import")
        s=once(s,placement,'        <SpendingSummaryCard token={token} />\n\n'+placement,f"{rel} spending placement")
    p.write_text(s)

# Dashboard menu: make full transaction history discoverable without crowding home.
p=Path("src/screens/DashboardScreen.tsx"); s=p.read_text()
if "SPENDING_HISTORY_MENU_V1" not in s:
    handler='''  const goComparePlans = React.useCallback(() => {\n    closeMenu();\n    router.push({ pathname: "/pricing/compare" });\n  }, [closeMenu]);\n'''
    s=once(s,handler,handler+'''\n  // SPENDING_HISTORY_MENU_V1\n  const goSpendingHistory = React.useCallback(() => {\n    closeMenu();\n    router.push("/pricing/spending-history" as any);\n  }, [closeMenu]);\n''',"dashboard spending handler")
    s=once(s,'        onGoComparePlans={goComparePlans}\n','        onGoComparePlans={goComparePlans}\n        onGoSpendingHistory={goSpendingHistory}\n',"dashboard spending prop")
    s=once(s,'  onGoComparePlans,\n  onGoUpgradePlan,\n','  onGoComparePlans,\n  onGoSpendingHistory,\n  onGoUpgradePlan,\n',"dashboard spending destructure")
    s=once(s,'  onGoComparePlans: () => void;\n  onGoUpgradePlan: () => void;\n','  onGoComparePlans: () => void;\n  onGoSpendingHistory: () => void;\n  onGoUpgradePlan: () => void;\n',"dashboard spending type")
    s=once(s,'              <MenuItem label="Compare Plans" onPress={onGoComparePlans} />\n','              <MenuItem label="Compare Plans" onPress={onGoComparePlans} />\n              <MenuItem label="Spending & transactions" onPress={onGoSpendingHistory} />\n',"dashboard spending menu item")
p.write_text(s)

# -----------------------------------------------------------------------------
# Voice: selected Face gender owns the visible voice catalog and all relevant
# preview/enhancer/create payloads.
# -----------------------------------------------------------------------------
p=Path("src/features/audio/AudioStudioScreen.tsx"); s=p.read_text()
if "MOBILE_FACE_VOICE_BINDING_V2" not in s:
    anchor='''  const voicesErr = (voicesQ.error as any)?.message ? String((voicesQ.error as any).message) : null;\n  const uiVoices: UiVoice[] = useMemo(() => normalizeVoices(voicesQ.data as any), [voicesQ.data]);\n\n'''
    replacement=anchor+'''  // MOBILE_FACE_VOICE_BINDING_V2: the selected Face filters the native voice chooser.\n  const faceCompatibleVoices: UiVoice[] = useMemo(() => {\n    const wanted = normalizeAudioGender(effectiveFaceGender);\n    if (wanted === "unspecified") return uiVoices;\n    const matched = uiVoices.filter((v) => {\n      const gender = readVoiceGender(v);\n      return gender === "unspecified" || gender === wanted;\n    });\n    return matched.length ? matched : uiVoices;\n  }, [uiVoices, effectiveFaceGender]);\n\n'''
    s=once(s,anchor,replacement,"mobile voice compatible catalog")
    old_effect='''  useEffect(() => {\n    if (voice) return;\n    if (!uiVoices.length) return;\n\n    const wantedGender = effectiveFaceGender.toLowerCase();\n    const genderMatched =\n      wantedGender === "male"\n        ? uiVoices.find((v) => readVoiceGender(v) === "male")\n        : wantedGender === "female"\n          ? uiVoices.find((v) => readVoiceGender(v) === "female")\n          : null;\n\n    const def = genderMatched || uiVoices.find((v) => (v as any)?.raw?.is_default) || uiVoices[0];\n    setVoice(def.key);\n  }, [uiVoices, voice, effectiveFaceGender]);\n'''
    new_effect='''  useEffect(() => {\n    if (!faceCompatibleVoices.length) { if (voice) setVoice(null); return; }\n    const current = faceCompatibleVoices.find((v) => v.key === voice);\n    if (current) return;\n    const wantedGender = normalizeAudioGender(effectiveFaceGender);\n    const exact = wantedGender === "unspecified" ? null : faceCompatibleVoices.find((v) => readVoiceGender(v) === wantedGender);\n    const def = exact || faceCompatibleVoices.find((v) => (v as any)?.raw?.is_default) || faceCompatibleVoices[0];\n    setVoice(def?.key || null);\n  }, [faceCompatibleVoices, voice, effectiveFaceGender]);\n'''
    s=once(s,old_effect,new_effect,"mobile voice auto resolution")
    s=once(s,'  const selectedVoice = uiVoices.find((x) => x.key === voice) ?? null;\n','  const selectedVoice = faceCompatibleVoices.find((x) => x.key === voice) ?? null;\n',"mobile selected voice source")
    s=once(s,'  const voiceOptions: Opt[] = useMemo(() => uiVoices.map((v) => ({ code: v.key, label: v.label })), [uiVoices]);\n','  const voiceOptions: Opt[] = useMemo(() => faceCompatibleVoices.map((v) => ({ code: v.key, label: v.label })), [faceCompatibleVoices]);\n',"mobile visible voice options")
    s=exact_count_replace(
        s,
        'voice_gender: selectedVoiceGender,',
        'voice_gender: speakerGender,',
        3,
        "mobile authoritative voice gender payloads",
    )
p.write_text(s)

# -----------------------------------------------------------------------------
# Video: same provider-neutral direction contract as web, but fewer visible
# controls. No provider or pricing policy is selected by these fields.
# -----------------------------------------------------------------------------
p=Path("src/features/fusion/FusionStudioScreen.tsx"); s=p.read_text()
if "MOBILE_VIDEO_DIRECTION_V1" not in s:
    import_anchor='import GenerationProgressCard from "../../components/jobs/GenerationProgressCard";\n'
    s=once(s,import_anchor,import_anchor+'''import MobileVideoDirectionControls, {\n  type MobilePerformanceStyle,\n  type MobileEmotionStyle,\n  type MobileMovementStyle,\n  type MobileSceneMotionStyle,\n} from "../../components/video/MobileVideoDirectionControls"; // MOBILE_VIDEO_DIRECTION_V1\n''',"mobile video direction import")
    state_anchor='''  const [talkingBackgroundMode, setTalkingBackgroundMode] = useState<TalkingBackgroundMode>(\n    (cleanParam((params as any).background_mode) ||\n      cleanParam(safeFlow?.fusionBackgroundMode) ||\n      "fixed") as TalkingBackgroundMode\n  );\n'''
    state_new=state_anchor+'''\n  const [performanceStyle, setPerformanceStyle] = useState<MobilePerformanceStyle>((cleanParam(safeFlow?.fusionPerformanceStyle) || "natural") as MobilePerformanceStyle);\n  const [emotionStyle, setEmotionStyle] = useState<MobileEmotionStyle>((cleanParam(safeFlow?.fusionEmotionStyle) || "auto") as MobileEmotionStyle);\n  const [movementStyle, setMovementStyle] = useState<MobileMovementStyle>((cleanParam(safeFlow?.fusionMovementStyle) || "auto") as MobileMovementStyle);\n  const [sceneMotionStyle, setSceneMotionStyle] = useState<MobileSceneMotionStyle>((cleanParam(safeFlow?.fusionSceneMotionStyle) || "auto") as MobileSceneMotionStyle);\n'''
    s=once(s,state_anchor,state_new,"mobile video direction state")
    # Persist these choices in the shared creator flow.
    s=once(s,'      fusionBackgroundMode: talkingBackgroundMode,\n','      fusionBackgroundMode: talkingBackgroundMode,\n      fusionPerformanceStyle: performanceStyle,\n      fusionEmotionStyle: emotionStyle,\n      fusionMovementStyle: movementStyle,\n      fusionSceneMotionStyle: sceneMotionStyle,\n',"mobile video direction flow settings")
    s=once(s,'    talkingBackgroundMode,\n    normalizedCinematicIntent,\n','    talkingBackgroundMode,\n    performanceStyle,\n    emotionStyle,\n    movementStyle,\n    sceneMotionStyle,\n    normalizedCinematicIntent,\n',"mobile video direction flow deps")
    # Add a provider-neutral plan to the parent payload tags. The backend owns
    # mapping to hand/body/camera/provider support.
    tags_anchor='''        background_mode: !isCinematic ? talkingBackgroundMode : "movement_based",\n        intent: isCinematic ? normalizedCinematicIntent : goalText,\n'''
    tags_new='''        background_mode: !isCinematic ? talkingBackgroundMode : "movement_based",\n        video_direction: {\n          performance_style: performanceStyle,\n          emotion: emotionStyle,\n          scene_motion: sceneMotionStyle,\n          hand_motion: movementStyle,\n          body_motion: movementStyle,\n          camera_motion: "auto",\n          delivery_energy: performanceStyle === "calm" ? "calm" : performanceStyle === "energetic" ? "energetic" : "normal",\n        },\n        intent: isCinematic ? normalizedCinematicIntent : goalText,\n'''
    s=once(s,tags_anchor,tags_new,"mobile video direction payload")
    # previewPayload dependency list must reflect the new states.
    s=once(s,'    talkingBackgroundMode,\n    normalizedCinematicIntent,\n    cinematicVideoType,\n','    talkingBackgroundMode,\n    performanceStyle,\n    emotionStyle,\n    movementStyle,\n    sceneMotionStyle,\n    normalizedCinematicIntent,\n    cinematicVideoType,\n',"mobile video preview deps")
    # Pricing query follows previewPayload, but explicit keys keep cache identity
    # understandable and guarantee a new quote when direction changes.
    s=once(s,'      talkingBackgroundMode,\n      normalizedCinematicIntent,\n','      talkingBackgroundMode,\n      performanceStyle,\n      emotionStyle,\n      movementStyle,\n      sceneMotionStyle,\n      normalizedCinematicIntent,\n',"mobile video pricing query keys")
    ui_anchor='''        <GlassCard style={{ marginTop: 12 }}>\n          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Aspect ratio</Text>\n'''
    ui_new='''        {videoMode === "TALKING_VIDEO" ? (\n          <MobileVideoDirectionControls\n            performance={performanceStyle}\n            emotion={emotionStyle}\n            movement={movementStyle}\n            sceneMotion={sceneMotionStyle}\n            onPerformance={setPerformanceStyle}\n            onEmotion={setEmotionStyle}\n            onMovement={setMovementStyle}\n            onSceneMotion={setSceneMotionStyle}\n          />\n        ) : null}\n\n'''+ui_anchor
    s=once(s,ui_anchor,ui_new,"mobile video direction UI")
p.write_text(s)

print("V3_MOBILE_CROSSCHANNEL_PARITY_PATCH=PASS")
