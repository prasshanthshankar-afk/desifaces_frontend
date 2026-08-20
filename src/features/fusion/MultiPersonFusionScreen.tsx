import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
  dispatchSceneFusion,
  ensureStoryStudioWorkflow,
  fusionPricingConfirmations,
  fusionStages,
  FusionPricingChild,
  FusionPricingPreview,
  FusionSyncResult,
  getStoryWorkspace,
  getStudioWorkflow,
  latestPendingReview,
  previewSceneFusion,
  reviewStudioOutput,
  StudioStageView,
  StudioWorkflowView,
  StoryWorkspaceView,
  syncSceneFusion,
} from "./api/multiPersonStory";

type Props = { storyId: string };
type StageMap<T> = Record<string, T>;

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

function childPriceLabel(child: FusionPricingChild) {
  const pricing: any = child?.pricing ?? {};
  const summary: any = child?.pricing_summary ?? {};
  return (
    summary?.display_total ||
    summary?.estimated_credits_label ||
    pricing?.summary?.display_total ||
    pricing?.summary?.estimated_credits_label ||
    pricing?.display_total ||
    child?.message ||
    "Price ready"
  );
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
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary, danger && styles.buttonTextDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function MultiPersonFusionScreen({ storyId }: Props) {
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [previews, setPreviews] = useState<StageMap<FusionPricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<FusionSyncResult>>({});
  const [busy, setBusy] = useState<StageMap<boolean>>({});
  const [externalProviderOk, setExternalProviderOk] = useState(false);
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
        const recovered: StageMap<FusionSyncResult> = {};
        for (const stage of fusionStages(initialWorkflow)) {
          if (!["generating", "awaiting_review", "approved"].includes(stage.state)) continue;
          try {
            const result = await syncSceneFusion(initialWorkflow.workflow_id, stage.stage_run_id);
            recovered[stage.stage_run_id] = result;
            latestWorkflow = result.workflow || latestWorkflow;
          } catch {
            // Do not fail the whole screen because one completed scene needs a manual refresh.
          }
        }
        if (!mounted.current) return;
        setWorkspace(nextWorkspace);
        setWorkflow(latestWorkflow);
        setSyncs((current) => ({ ...current, ...recovered }));
      } catch (error) {
        Alert.alert("Fusion Studio", errorMessage(error));
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

  const stages = useMemo(() => fusionStages(workflow), [workflow]);
  const sceneById = useMemo(() => {
    const map = new Map<string, any>();
    (workspace?.scenes ?? []).forEach((scene: any) => {
      const id = String(scene?.scene_id || scene?.id || "").trim();
      if (id) map.set(id, scene);
    });
    return map;
  }, [workspace]);

  const syncStage = useCallback(
    async (stage: StudioStageView, quiet = false) => {
      if (!workflow) return;
      if (!quiet) setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const result = await syncSceneFusion(workflow.workflow_id, stage.stage_run_id);
        if (!mounted.current) return;
        setSyncs((current) => ({ ...current, [stage.stage_run_id]: result }));
        setWorkflow(result.workflow);
      } catch (error) {
        if (!quiet) Alert.alert("Fusion Studio", errorMessage(error));
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
    const generating = fusionStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(() => {
      generating.forEach((stage) => void syncStage(stage, true));
    }, 4500);
    return () => clearInterval(timer);
  }, [workflow, syncStage]);

  const checkPrice = useCallback(
    async (stage: StudioStageView) => {
      if (!workflow) return;
      if (!externalProviderOk) {
        Alert.alert(
          "Fusion Studio",
          "Enable external-provider processing consent before checking the exact render price."
        );
        return;
      }
      setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const preview = await previewSceneFusion(
          workflow.workflow_id,
          stage.stage_run_id,
          externalProviderOk
        );
        if (!mounted.current) return;
        setPreviews((current) => ({ ...current, [stage.stage_run_id]: preview }));
      } catch (error) {
        Alert.alert("Fusion Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
        }
      }
    },
    [workflow, externalProviderOk]
  );

  const dispatch = useCallback(
    async (stage: StudioStageView) => {
      if (!workflow) return;
      const preview = previews[stage.stage_run_id];
      if (!preview) {
        await checkPrice(stage);
        return;
      }
      let confirmations: ReturnType<typeof fusionPricingConfirmations>;
      try {
        confirmations = fusionPricingConfirmations(preview);
      } catch (error) {
        Alert.alert("Fusion Studio", errorMessage(error));
        return;
      }
      const priceLines = preview.children
        .slice()
        .sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0))
        .map((child) => `${child.display_name}: ${childPriceLabel(child)}`)
        .join("\n");
      Alert.alert(
        "Render this scene?",
        `Fusion will create ${confirmations.length} ordered dialogue segment${confirmations.length === 1 ? "" : "s"}, then stitch them into one scene video.\n\n${priceLines}`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Render scene",
            onPress: () => {
              void (async () => {
                setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
                try {
                  await dispatchSceneFusion(
                    workflow.workflow_id,
                    stage.stage_run_id,
                    confirmations,
                    externalProviderOk
                  );
                  const next = await getStudioWorkflow(workflow.workflow_id);
                  if (!mounted.current) return;
                  setWorkflow(next);
                  setPreviews((current) => {
                    const copy = { ...current };
                    delete copy[stage.stage_run_id];
                    return copy;
                  });
                } catch (error) {
                  Alert.alert("Fusion Studio", errorMessage(error));
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
    [workflow, previews, externalProviderOk, checkPrice]
  );

  const review = useCallback(
    async (stage: StudioStageView, decision: "approved" | "rejected" | "revise") => {
      if (!workflow) return;
      setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const authoritative = await getStudioWorkflow(workflow.workflow_id);
        const currentStage =
          fusionStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id) ?? null;
        const pending = latestPendingReview(currentStage);
        if (!pending) {
          setWorkflow(authoritative);
          Alert.alert(
            "Fusion Studio",
            "This scene review is no longer pending. The latest workflow state has been refreshed."
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
        Alert.alert("Fusion Studio", errorMessage(error));
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
        params: { intent: "manage", source: "story_fusion" },
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
        menu_source: "story_fusion",
      } as any,
    } as any);
  }, []);

  if (loading && !workflow) {
    return (
      <View style={styles.safe}>
        <DFHeader subtitle="Story Fusion Studio" onMenuPress={openHamburgerMenu} onPressMeta={openPlanScreen} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND.accent} />
          <Text style={styles.loadingText}>Preparing scene Fusion…</Text>
        </View>
      </View>
    );
  }

  const required = stages.length;
  const approved = stages.filter((stage) => stage.state === "approved").length;
  const fusionReady = required > 0 && approved === required;
  const progress = required ? Math.min(100, (approved / required) * 100) : 0;
  const audioBlocked = workflow?.current_stage === "face" || workflow?.current_stage === "audio";
  const complete = String(workflow?.state || "").toLowerCase() === "completed";

  return (
    <View style={styles.safe}>
      <DFHeader subtitle="Story Fusion Studio" onMenuPress={openHamburgerMenu} onPressMeta={openPlanScreen} />
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
            <Text style={styles.eyebrow}>STORY FUSION STUDIO</Text>
          </View>
          <Text style={styles.title}>{workspace?.title || "Scene render"}</Text>
          <Text style={styles.subtitle}>
            Each dialogue turn is rendered with its approved speaker Face and approved Audio, then stitched in story order into one reviewable scene video.
          </Text>
        </View>

        {audioBlocked ? (
          <View style={styles.blockedCard}>
            <Text style={styles.blockedTitle}>Upstream approval is still required</Text>
            <Text style={styles.blockedBody}>
              Fusion remains locked until the complete Face cast and every required Audio dialogue turn are approved.
            </Text>
            <Button
              label={workflow?.current_stage === "face" ? "Return to Face Studio" : "Return to Audio Studio"}
              onPress={() =>
                router.replace({
                  pathname: "/(tabs)/face/story/[storyId]" as any,
                  params: { storyId, stage: workflow?.current_stage === "face" ? "face" : "audio" },
                } as any)
              }
              secondary
            />
          </View>
        ) : null}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: externalProviderOk }}
          onPress={() => {
            const next = !externalProviderOk;
            setExternalProviderOk(next);
            if (!next) setPreviews({});
          }}
          style={[styles.consentCard, externalProviderOk && styles.consentCardActive]}
        >
          <View style={[styles.checkbox, externalProviderOk && styles.checkboxActive]}>
            <Text style={styles.checkboxText}>{externalProviderOk ? "✓" : ""}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.consentTitle}>Allow external-provider video processing</Text>
            <Text style={styles.consentBody}>
              Fusion may send the approved Face and Audio media required for this render to the configured video provider. This consent is required before pricing and generation.
            </Text>
          </View>
        </Pressable>

        <View style={[styles.cohortCard, (fusionReady || complete) && styles.cohortReady]}>
          <View style={styles.cohortHeader}>
            <Text style={styles.cohortTitle}>Scene cohort</Text>
            <Text style={styles.cohortCount}>{approved}/{required} APPROVED</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.cohortBody}>
            {complete
              ? "The one-scene Story workflow is complete and the approved scene video is the final media output."
              : fusionReady
                ? "All scene videos are approved."
                : "Every generated scene remains human-review gated before the Story can complete."}
          </Text>
        </View>

        {stages.map((stage, index) => {
          const preview = previews[stage.stage_run_id];
          const synced = syncs[stage.stage_run_id];
          const isBusy = Boolean(busy[stage.stage_run_id]);
          const pendingReview = latestPendingReview(stage);
          const canReview = stage.state === "awaiting_review" && Boolean(pendingReview);
          const canPrice = ["pending", "ready", "failed", "rejected"].includes(stage.state) && !audioBlocked;
          const locked = stage.state === "approved";
          const scene = sceneById.get(String(stage.scene_id || ""));
          const sceneTitle = String(scene?.title || scene?.name || `Scene ${index + 1}`);
          const videoUrl = String(synced?.video_url || "").trim();
          const childStatuses = synced?.children ?? [];

          return (
            <View key={stage.stage_run_id} style={[styles.sceneCard, locked && styles.sceneLocked]}>
              <View style={styles.sceneHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sceneKicker}>SCENE {index + 1}</Text>
                  <Text style={styles.sceneTitle}>{sceneTitle}</Text>
                </View>
                <View style={[styles.statePill, locked && styles.statePillApproved, canReview && styles.statePillReview]}>
                  <Text style={styles.statePillText}>{humanState(stage.state)}</Text>
                </View>
              </View>

              {preview ? (
                <View style={styles.pricingCard}>
                  <Text style={styles.pricingTitle}>Confirmed render plan</Text>
                  <Text style={styles.pricingMeta}>
                    {preview.children.length} dialogue segment{preview.children.length === 1 ? "" : "s"} • ordered stitch
                  </Text>
                  {preview.children
                    .slice()
                    .sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0))
                    .map((child) => (
                      <View key={child.dialogue_turn_id} style={styles.priceRow}>
                        <Text style={styles.priceSpeaker}>{child.display_name}</Text>
                        <Text style={styles.priceValue}>{childPriceLabel(child)}</Text>
                      </View>
                    ))}
                </View>
              ) : null}

              {childStatuses.length ? (
                <View style={styles.segmentCard}>
                  <Text style={styles.segmentTitle}>Render segments</Text>
                  {childStatuses
                    .slice()
                    .sort((a: any, b: any) => Number(a?.sequence_no || 0) - Number(b?.sequence_no || 0))
                    .map((child: any) => (
                      <View key={String(child?.dialogue_turn_id || child?.fusion_job_id)} style={styles.segmentRow}>
                        <Text style={styles.segmentName}>{String(child?.display_name || "Dialogue")}</Text>
                        <Text style={styles.segmentStatus}>{humanState(String(child?.status || "queued"))}</Text>
                      </View>
                    ))}
                </View>
              ) : null}

              {videoUrl ? (
                <Button
                  label="Open final scene preview"
                  onPress={() => void Linking.openURL(videoUrl).catch((error) => Alert.alert("Fusion Studio", errorMessage(error)))}
                  secondary
                />
              ) : null}

              {canPrice ? (
                <View style={styles.actions}>
                  {!preview ? (
                    <Button
                      label={stage.state === "failed" ? "Check retry price" : stage.state === "rejected" ? "Check regenerate price" : "Check scene price"}
                      onPress={() => void checkPrice(stage)}
                      disabled={isBusy || !externalProviderOk}
                      secondary
                    />
                  ) : (
                    <>
                      <Button
                        label={stage.state === "failed" ? "Retry scene" : stage.state === "rejected" ? "Regenerate scene" : "Render scene"}
                        onPress={() => void dispatch(stage)}
                        disabled={isBusy || !externalProviderOk}
                      />
                      <Button label="Refresh price" onPress={() => void checkPrice(stage)} disabled={isBusy || !externalProviderOk} secondary />
                    </>
                  )}
                </View>
              ) : null}

              {canReview ? (
                <View style={styles.reviewBlock}>
                  <Text style={styles.reviewTitle}>Human review required</Text>
                  <Text style={styles.reviewBody}>
                    Review the fully stitched scene. Approval locks this scene video as the workflow output.
                  </Text>
                  {!videoUrl ? <Button label="Load final preview" onPress={() => void syncStage(stage)} disabled={isBusy} secondary /> : null}
                  <Button label="Approve & lock" onPress={() => void review(stage, "approved")} disabled={isBusy} />
                  <View style={styles.secondaryRow}>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Revise"
                        onPress={() =>
                          Alert.alert(
                            "Revise this scene?",
                            "A revised scene is a new priced Fusion generation. Approved Face and Audio inputs remain locked.",
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
                            "Reject this scene?",
                            "The completed render remains charged and auditable. A replacement scene will require a new pricing confirmation.",
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
                <Button label="Refresh render status" onPress={() => void syncStage(stage)} disabled={isBusy} secondary />
              ) : null}
            </View>
          );
        })}

        <View style={styles.completionCard}>
          <Text style={styles.completionTitle}>{complete ? "Story render complete" : "Fusion Studio is not complete"}</Text>
          <Text style={styles.completionBody}>
            {complete
              ? "The approved scene video is now the final media output for this one-scene Story workflow."
              : `${Math.max(0, required - approved)} scene${required - approved === 1 ? "" : "s"} still require approval.`}
          </Text>
          {complete ? <Button label="Return to Dashboard" onPress={() => router.replace("/(tabs)/dashboard" as any)} /> : null}
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
  consentCard: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: BRAND.surface,
    padding: 14,
  },
  consentCardActive: { borderColor: BRAND.accentBorder, backgroundColor: "rgba(232,152,56,0.07)" },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: BRAND.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.surfaceSoft,
  },
  checkboxActive: { borderColor: BRAND.accent, backgroundColor: BRAND.accentFill },
  checkboxText: { color: BRAND.accentText, fontSize: 15, fontWeight: "900" },
  consentTitle: { color: BRAND.text, fontSize: 13, fontWeight: "900" },
  consentBody: { color: BRAND.muted, fontSize: 11, lineHeight: 17, fontWeight: "600", marginTop: 4 },
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
  sceneCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 12,
  },
  sceneLocked: { borderColor: "rgba(248,184,72,0.46)" },
  sceneHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  sceneKicker: { color: BRAND.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1 },
  sceneTitle: { color: BRAND.text, fontSize: 17, fontWeight: "900", marginTop: 2 },
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
  pricingCard: { borderRadius: 15, borderWidth: 1, borderColor: BRAND.accentBorder, backgroundColor: BRAND.accentFill, padding: 12, gap: 7 },
  pricingTitle: { color: BRAND.text, fontSize: 12, fontWeight: "900" },
  pricingMeta: { color: BRAND.muted, fontSize: 10, fontWeight: "700" },
  priceRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingTop: 5 },
  priceSpeaker: { color: "rgba(255,255,255,0.84)", fontSize: 11, fontWeight: "700", flex: 1 },
  priceValue: { color: BRAND.accentText, fontSize: 11, fontWeight: "900" },
  segmentCard: { borderRadius: 14, backgroundColor: BRAND.surfaceSoft, padding: 12, gap: 7 },
  segmentTitle: { color: BRAND.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  segmentRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  segmentName: { color: BRAND.text, fontSize: 11, fontWeight: "700", flex: 1 },
  segmentStatus: { color: BRAND.accentText, fontSize: 10, fontWeight: "900" },
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
  completionCard: { backgroundColor: BRAND.surface, borderRadius: 18, borderWidth: 1, borderColor: BRAND.border, padding: 15, gap: 10 },
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
