import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from "expo-audio";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";

import {
  advanceStudioWorkflow,
  audioPricingQuote,
  audioStages,
  AudioPricingPreview,
  AudioSyncResult,
  dispatchDialogueAudio,
  ensureStoryStudioWorkflow,
  getStoryWorkspace,
  getStudioWorkflow,
  latestPendingReview,
  previewDialogueAudio,
  reviewStudioOutput,
  StudioStageView,
  StudioWorkflowView,
  StoryWorkspaceView,
  syncDialogueAudio,
} from "./api/multiPersonStory";

type Props = { storyId: string };
type StageMap<T> = Record<string, T>;

type AudioPlayerHandle = ReturnType<typeof createAudioPlayer>;

const BRAND = {
  background: (DF as any)?.night ?? "#0E0F14",
  surface: (DF as any)?.night2 ?? "#141824",
  surfaceSoft: "rgba(255,255,255,0.045)",
  text: (DF as any)?.text ?? "#FFFFFF",
  muted: (DF as any)?.muted ?? "rgba(255,255,255,0.62)",
  border: (DF as any)?.border ?? "rgba(255,255,255,0.10)",
  accent: "#F8B848",
  accentText: "rgba(248,232,136,1)",
  accentFill: "rgba(232,152,56,0.14)",
  accentBorder: "rgba(248,184,72,0.32)",
  success: "#32D74B",
  danger: "#FF6B78",
};

function errorMessage(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string") return detail;
  if (typeof detail?.message === "string") return detail.message;
  if (typeof error?.message === "string") return error.message;
  return "Something went wrong";
}

function humanState(value: string | null | undefined) {
  return String(value || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function pricingLabel(preview: AudioPricingPreview | null | undefined) {
  const envelope: any = preview?.pricing ?? {};
  return (
    envelope?.summary?.display_total ||
    envelope?.pricing_summary?.display_total ||
    envelope?.pricing?.summary?.display_total ||
    envelope?.pricing?.summary?.estimated_credits_label ||
    envelope?.summary?.estimated_credits_label ||
    "Price ready"
  );
}

function statusCopy(stage: StudioStageView) {
  switch (stage.state) {
    case "approved":
      return "Voice clip approved and locked for this dialogue turn.";
    case "awaiting_review":
      return "Synthesis completed. Listen before approving this dialogue turn.";
    case "generating":
      return "Synthesizing this dialogue turn now…";
    case "failed":
      return "This dialogue turn failed. Only this turn needs a retry.";
    case "rejected":
      return "This clip was not selected. A new generation will be separately priced.";
    default:
      return "Ready for an Audio Studio pricing preview.";
  }
}

function Button({
  label,
  onPress,
  disabled,
  secondary,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          secondary && styles.buttonTextSecondary,
          danger && styles.buttonTextDanger,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function AudioPreviewButton({ url }: { url: string }) {
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(async () => {
    const player = playerRef.current;
    playerRef.current = null;
    setPlaying(false);
    if (!player) return;
    try {
      await Promise.resolve((player as any)?.pause?.());
    } catch {}
    try {
      await Promise.resolve((player as any)?.seekTo?.(0));
    } catch {}
    try {
      await Promise.resolve((player as any)?.release?.());
    } catch {}
  }, []);

  useEffect(() => () => void stop(), [stop]);

  const toggle = useCallback(async () => {
    if (busy) return;
    if (playing) {
      await stop();
      return;
    }
    setBusy(true);
    try {
      await stop();
      await setIsAudioActiveAsync(false).catch(() => {});
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: "doNotMix",
      });
      await setIsAudioActiveAsync(true);
      const player = createAudioPlayer(url, {
        updateInterval: 250,
        downloadFirst: true,
        keepAudioSessionActive: true,
      });
      player.muted = false;
      player.volume = 1;
      playerRef.current = player;
      (player as any)?.addListener?.("playbackStatusUpdate", (status: any) => {
        if (status?.didJustFinish) void stop();
      });
      await Promise.resolve((player as any)?.play?.());
      setPlaying(true);
    } catch (error) {
      await stop();
      Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [busy, playing, stop, url]);

  return (
    <Button
      label={busy ? "Preparing audio…" : playing ? "Stop preview" : "Play preview"}
      onPress={() => void toggle()}
      disabled={busy}
      secondary
    />
  );
}

export default function MultiPersonAudioCohortScreen({ storyId }: Props) {
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [previews, setPreviews] = useState<StageMap<AudioPricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<AudioSyncResult>>({});
  const [busy, setBusy] = useState<StageMap<boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (!storyId) return;
      if (!quiet) setLoading(true);
      try {
        const [nextWorkspace, initialWorkflow] = await Promise.all([
          getStoryWorkspace(storyId),
          ensureStoryStudioWorkflow(storyId),
        ]);
        if (!mounted.current) return;

        let latestWorkflow = initialWorkflow;
        const recovered: StageMap<AudioSyncResult> = {};
        for (const stage of audioStages(initialWorkflow)) {
          if (!["generating", "awaiting_review", "approved"].includes(stage.state)) continue;
          try {
            const result = await syncDialogueAudio(initialWorkflow.workflow_id, stage.stage_run_id);
            recovered[stage.stage_run_id] = result;
            latestWorkflow = result.workflow || latestWorkflow;
          } catch {
            // A stale/approved stage must not block screen hydration. Manual refresh
            // still exposes the service error for the individual dialogue turn.
          }
        }
        if (!mounted.current) return;
        setWorkspace(nextWorkspace);
        setWorkflow(latestWorkflow);
        setSyncs((current) => ({ ...current, ...recovered }));
      } catch (error) {
        Alert.alert("Audio Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [storyId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const stages = useMemo(() => audioStages(workflow), [workflow]);
  const participantById = useMemo(
    () =>
      new Map(
        (workspace?.participants ?? []).map((participant) => [
          participant.participant_id,
          participant,
        ])
      ),
    [workspace]
  );

  const syncStage = useCallback(
    async (stage: StudioStageView, quiet = false) => {
      if (!workflow) return;
      if (!quiet) setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const result = await syncDialogueAudio(workflow.workflow_id, stage.stage_run_id);
        if (!mounted.current) return;
        setSyncs((current) => ({ ...current, [stage.stage_run_id]: result }));
        setWorkflow(result.workflow);
      } catch (error) {
        if (!quiet) Alert.alert("Audio Studio", errorMessage(error));
      } finally {
        if (mounted.current && !quiet) {
          setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
        }
      }
    },
    [workflow]
  );

  useEffect(() => {
    if (!workflow) return;
    const generating = audioStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(() => {
      generating.forEach((stage) => void syncStage(stage, true));
    }, 3500);
    return () => clearInterval(timer);
  }, [workflow, syncStage]);

  const checkPrice = useCallback(
    async (stage: StudioStageView) => {
      if (!workflow) return;
      setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const preview = await previewDialogueAudio(workflow.workflow_id, stage.stage_run_id);
        if (!mounted.current) return;
        setPreviews((current) => ({ ...current, [stage.stage_run_id]: preview }));
      } catch (error) {
        Alert.alert("Audio Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
        }
      }
    },
    [workflow]
  );

  const dispatch = useCallback(
    async (stage: StudioStageView) => {
      if (!workflow) return;
      const preview = previews[stage.stage_run_id];
      if (!preview) {
        await checkPrice(stage);
        return;
      }
      let quote: ReturnType<typeof audioPricingQuote>;
      try {
        quote = audioPricingQuote(preview);
      } catch (error) {
        Alert.alert("Audio Studio", errorMessage(error));
        return;
      }
      Alert.alert(
        "Generate this voice clip?",
        `${pricingLabel(preview)} will be confirmed for this dialogue turn.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Generate",
            onPress: () => {
              void (async () => {
                setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
                try {
                  await dispatchDialogueAudio(workflow.workflow_id, stage.stage_run_id, quote);
                  const next = await getStudioWorkflow(workflow.workflow_id);
                  if (!mounted.current) return;
                  setWorkflow(next);
                  setPreviews((current) => {
                    const copy = { ...current };
                    delete copy[stage.stage_run_id];
                    return copy;
                  });
                } catch (error) {
                  Alert.alert("Audio Studio", errorMessage(error));
                } finally {
                  if (mounted.current) {
                    setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
                  }
                }
              })();
            },
          },
        ]
      );
    },
    [workflow, previews, checkPrice]
  );

  const review = useCallback(
    async (stage: StudioStageView, decision: "approved" | "rejected" | "revise") => {
      if (!workflow) return;
      setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const authoritative = await getStudioWorkflow(workflow.workflow_id);
        const currentStage =
          audioStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id) ?? null;
        const pending = latestPendingReview(currentStage);
        if (!pending) {
          setWorkflow(authoritative);
          Alert.alert(
            "Audio Studio",
            "This review is no longer pending. The latest workflow state has been refreshed."
          );
          return;
        }
        const reviewed = await reviewStudioOutput(pending.review_item_id, decision);
        if (!mounted.current) return;
        const next = decision === "approved"
          ? await advanceStudioWorkflow(reviewed.workflow_id)
          : reviewed;
        if (!mounted.current) return;
        setWorkflow(next);
        if (decision !== "approved") {
          setPreviews((current) => {
            const copy = { ...current };
            delete copy[stage.stage_run_id];
            return copy;
          });
          setSyncs((current) => {
            const copy = { ...current };
            delete copy[stage.stage_run_id];
            return copy;
          });
        }
      } catch (error) {
        Alert.alert("Audio Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
        }
      }
    },
    [workflow]
  );

  const openPlanScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: { intent: "manage", source: "story_audio" },
      } as any);
    } catch {
      router.push("/(tabs)/dashboard" as any);
    }
  }, []);

  const openHamburgerMenu = useCallback(() => {
    router.push({
      pathname: "/(tabs)/dashboard" as any,
      params: {
        openMenu: "1",
        menu_nonce: `${Date.now()}`,
        menu_source: "story_audio",
      } as any,
    } as any);
  }, []);

  if (loading && !workflow) {
    return (
      <View style={styles.safe}>
        <DFHeader subtitle="Story Audio Studio" onMenuPress={openHamburgerMenu} onPressMeta={openPlanScreen} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND.accent} />
          <Text style={styles.loadingText}>Preparing dialogue audio…</Text>
        </View>
      </View>
    );
  }

  const required = stages.length;
  const approved = stages.filter((stage) => stage.state === "approved").length;
  const audioReady = required > 0 && approved === required;
  const progress = required ? Math.min(100, (approved / required) * 100) : 0;
  const faceBlocked = workflow?.current_stage === "face";

  return (
    <View style={styles.safe}>
      <DFHeader subtitle="Story Audio Studio" onMenuPress={openHamburgerMenu} onPressMeta={openPlanScreen} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={BRAND.accent}
            colors={[BRAND.accent]}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.eyebrowPill}>
            <Text style={styles.eyebrow}>STORY AUDIO STUDIO</Text>
          </View>
          <Text style={styles.title}>{workspace?.title || "Dialogue voices"}</Text>
          <Text style={styles.subtitle}>
            Create and approve one voice clip per dialogue turn. Every clip keeps its speaker identity and locale from the approved story.
          </Text>
        </View>

        {faceBlocked ? (
          <View style={styles.blockedCard}>
            <Text style={styles.blockedTitle}>Face approval is still required</Text>
            <Text style={styles.blockedBody}>
              Audio remains locked until the complete required Face cast is approved.
            </Text>
            <Button
              label="Return to Face Studio"
              onPress={() =>
                router.replace({
                  pathname: "/(tabs)/face/story/[storyId]" as any,
                  params: { storyId, stage: "face" },
                } as any)
              }
              secondary
            />
          </View>
        ) : null}

        <View style={[styles.cohortCard, audioReady && styles.cohortReady]}>
          <View style={styles.cohortHeader}>
            <Text style={styles.cohortTitle}>Dialogue cohort</Text>
            <Text style={styles.cohortCount}>{approved}/{required} APPROVED</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.cohortBody}>
            {audioReady
              ? "Every required dialogue clip is approved. Fusion Studio is unlocked."
              : "Fusion remains blocked until every required dialogue clip is approved."}
          </Text>
        </View>

        {stages.map((stage, index) => {
          const preview = previews[stage.stage_run_id];
          const synced = syncs[stage.stage_run_id];
          const participantId =
            String(stage.metadata?.speaker_participant_id || synced?.participant_id || preview?.participant_id || "");
          const participant = participantById.get(participantId);
          const name = preview?.display_name || synced?.display_name || participant?.display_name || `Speaker ${index + 1}`;
          const pendingReview = latestPendingReview(stage);
          const canReview = stage.state === "awaiting_review" && Boolean(pendingReview);
          const canPrice = ["pending", "ready", "failed", "rejected"].includes(stage.state) && !faceBlocked;
          const isBusy = Boolean(busy[stage.stage_run_id]);
          const locked = stage.state === "approved";
          const audioUrl = String(synced?.audio_url || stage.metadata?.audio_url || "").trim();
          const dialogue = String(preview?.studio_input?.text || "").trim();
          const locale = String(preview?.studio_input?.target_locale || "").trim();
          const gender = String(preview?.studio_input?.speaker_gender || "").trim();

          return (
            <View key={stage.stage_run_id} style={[styles.turnCard, locked && styles.turnLocked]}>
              <View style={styles.turnHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.turnKicker}>TURN {index + 1}</Text>
                  <Text style={styles.turnTitle}>{name}</Text>
                </View>
                <View style={[styles.statePill, locked && styles.statePillApproved, canReview && styles.statePillReview]}>
                  <Text style={styles.statePillText}>{humanState(stage.state)}</Text>
                </View>
              </View>

              <Text style={styles.statusText}>{statusCopy(stage)}</Text>

              {preview ? (
                <View style={styles.priceStrip}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.priceLabel}>PRICE READY</Text>
                    <Text style={styles.priceValue}>{pricingLabel(preview)}</Text>
                  </View>
                  <View style={styles.chipRow}>
                    {gender ? <Text style={styles.chip}>{humanState(gender)}</Text> : null}
                    {locale ? <Text style={styles.chip}>{locale}</Text> : null}
                  </View>
                </View>
              ) : null}

              {dialogue ? (
                <View style={styles.dialogueBox}>
                  <Text style={styles.dialogueLabel}>DIALOGUE</Text>
                  <Text style={styles.dialogueText}>{dialogue}</Text>
                </View>
              ) : null}

              {audioUrl ? <AudioPreviewButton url={audioUrl} /> : null}

              {canPrice ? (
                <View style={styles.actions}>
                  {!preview ? (
                    <Button
                      label={stage.state === "failed" ? "Check retry price" : stage.state === "rejected" ? "Check regenerate price" : "Check price"}
                      onPress={() => void checkPrice(stage)}
                      disabled={isBusy}
                      secondary
                    />
                  ) : (
                    <>
                      <Button
                        label={stage.state === "failed" ? `Retry • ${pricingLabel(preview)}` : stage.state === "rejected" ? `Regenerate • ${pricingLabel(preview)}` : `Generate Audio • ${pricingLabel(preview)}`}
                        onPress={() => void dispatch(stage)}
                        disabled={isBusy}
                      />
                      <Button label="Refresh price" onPress={() => void checkPrice(stage)} disabled={isBusy} secondary />
                    </>
                  )}
                </View>
              ) : null}

              {canReview ? (
                <View style={styles.reviewBlock}>
                  <Text style={styles.reviewTitle}>Human review required</Text>
                  <Text style={styles.reviewBody}>
                    Listen to the full clip. Approval locks this dialogue turn for scene Fusion.
                  </Text>
                  {!audioUrl ? (
                    <Button label="Load audio preview" onPress={() => void syncStage(stage)} disabled={isBusy} secondary />
                  ) : null}
                  <Button label="Approve & lock" onPress={() => void review(stage, "approved")} disabled={isBusy} />
                  <View style={styles.secondaryRow}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Revise"
                        onPress={() =>
                          Alert.alert(
                            "Revise this voice clip?",
                            "Only this dialogue turn will return to a new priced generation.",
                            [
                              { text: "Cancel", style: "cancel" },
                              { text: "Revise", onPress: () => void review(stage, "revise") },
                            ]
                          )
                        }
                        disabled={isBusy}
                        secondary
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Reject"
                        onPress={() =>
                          Alert.alert(
                            "Reject this voice clip?",
                            "The completed generation remains charged and auditable. Only this dialogue turn will need regeneration.",
                            [
                              { text: "Cancel", style: "cancel" },
                              { text: "Reject", style: "destructive", onPress: () => void review(stage, "rejected") },
                            ]
                          )
                        }
                        disabled={isBusy}
                        danger
                      />
                    </View>
                  </View>
                </View>
              ) : null}

              {stage.state === "generating" ? (
                <Button label="Refresh status" onPress={() => void syncStage(stage)} disabled={isBusy} secondary />
              ) : null}
            </View>
          );
        })}

        <View style={styles.completionCard}>
          <Text style={styles.completionTitle}>{audioReady ? "Audio Studio complete" : "Audio Studio is not complete"}</Text>
          <Text style={styles.completionBody}>
            {audioReady
              ? "Every required dialogue clip is approved and locked. Continue to Fusion Studio to render the scene."
              : `${Math.max(0, required - approved)} dialogue turn${required - approved === 1 ? "" : "s"} still require approval.`}
          </Text>
          {audioReady ? (
            <Button
              label="Continue to Fusion Studio"
              onPress={() =>
                router.replace({
                  pathname: "/(tabs)/face/story/[storyId]" as any,
                  params: { storyId, stage: "fusion" },
                } as any)
              }
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND.background },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 140,
    gap: 14,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: BRAND.muted, fontSize: 13, fontWeight: "700" },
  hero: { gap: 8, paddingHorizontal: 2 },
  eyebrowPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    backgroundColor: BRAND.accentFill,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eyebrow: { color: BRAND.accentText, fontSize: 10, fontWeight: "900", letterSpacing: 1.25 },
  title: { color: BRAND.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.35 },
  subtitle: { color: BRAND.muted, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  blockedCard: {
    backgroundColor: "rgba(255,107,120,0.06)",
    borderColor: "rgba(255,107,120,0.25)",
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
    gap: 10,
  },
  blockedTitle: { color: BRAND.text, fontSize: 15, fontWeight: "900" },
  blockedBody: { color: BRAND.muted, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  cohortCard: {
    backgroundColor: BRAND.surface,
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    borderRadius: 18,
    padding: 15,
    gap: 10,
  },
  cohortReady: { borderColor: "rgba(248,184,72,0.55)", backgroundColor: "rgba(232,152,56,0.08)" },
  cohortHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  cohortTitle: { color: BRAND.text, fontSize: 15, fontWeight: "900" },
  cohortCount: {
    color: BRAND.accentText,
    fontSize: 10,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    backgroundColor: BRAND.accentFill,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  progressTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: BRAND.accent, borderRadius: 99 },
  cohortBody: { color: "rgba(255,255,255,0.82)", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  turnCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 12,
  },
  turnLocked: { borderColor: "rgba(248,184,72,0.46)" },
  turnHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  turnKicker: { color: BRAND.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  turnTitle: { color: BRAND.text, fontSize: 17, fontWeight: "900", marginTop: 2 },
  statePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: BRAND.surfaceSoft,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statePillApproved: { borderColor: "rgba(50,215,75,0.32)", backgroundColor: "rgba(50,215,75,0.08)" },
  statePillReview: { borderColor: BRAND.accentBorder, backgroundColor: BRAND.accentFill },
  statePillText: { color: BRAND.text, fontSize: 9, fontWeight: "900", letterSpacing: 0.45 },
  statusText: { color: BRAND.muted, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  priceStrip: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    backgroundColor: BRAND.accentFill,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  priceLabel: { color: BRAND.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  priceValue: { color: BRAND.accentText, fontSize: 15, fontWeight: "900", marginTop: 2 },
  chipRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" },
  chip: {
    color: BRAND.accentText,
    fontSize: 9,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    backgroundColor: "rgba(8,8,8,0.28)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dialogueBox: { borderRadius: 14, backgroundColor: BRAND.surfaceSoft, padding: 12, gap: 5 },
  dialogueLabel: { color: BRAND.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  dialogueText: { color: "rgba(255,255,255,0.9)", fontSize: 13, lineHeight: 20, fontWeight: "600" },
  actions: { gap: 8 },
  reviewBlock: {
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    backgroundColor: "rgba(232,152,56,0.07)",
    borderRadius: 16,
    padding: 12,
    gap: 9,
  },
  reviewTitle: { color: BRAND.text, fontSize: 13, fontWeight: "900" },
  reviewBody: { color: BRAND.muted, fontSize: 11, lineHeight: 17, fontWeight: "600" },
  secondaryRow: { flexDirection: "row", gap: 8 },
  completionCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 15,
    gap: 10,
  },
  completionTitle: { color: BRAND.text, fontSize: 15, fontWeight: "900" },
  completionBody: { color: BRAND.muted, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  button: {
    minHeight: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.38)",
    backgroundColor: "rgba(232,152,56,0.20)",
  },
  buttonSecondary: { backgroundColor: "rgba(255,255,255,0.045)", borderColor: BRAND.border },
  buttonDanger: { backgroundColor: "rgba(255,107,120,0.08)", borderColor: "rgba(255,107,120,0.28)" },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  buttonText: { color: BRAND.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.1 },
  buttonTextSecondary: { color: "rgba(255,255,255,0.86)" },
  buttonTextDanger: { color: "#FFB4BD" },
});
