import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import {
  CompactButton,
  Divider,
  humanState,
  ProgressLine,
  SectionLabel,
  StatusPill,
  STUDIO,
  StudioHero,
  Surface,
  useStudioViewport,
} from "../../core/studio/DenseStudioUI";
import DFHeader from "../../core/ui/DFHeader";
import {
  advanceStudioWorkflow,
  dispatchSceneFusion,
  ensureStoryStudioWorkflow,
  fusionPricingConfirmations,
  fusionStages,
  getStoryWorkspace,
  getStudioWorkflow,
  latestPendingReview,
  previewSceneFusion,
  reviewStudioOutput,
  syncSceneFusion,
  type FusionPricingChild,
  type FusionPricingPreview,
  type FusionSyncResult,
  type StoryWorkspaceView,
  type StudioStageView,
  type StudioWorkflowView,
} from "./api/multiPersonStory";

type Props = { storyId: string };
type StageMap<T> = Record<string, T>;

function clean(value: unknown) { return String(value ?? "").trim(); }
function errorMessage(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string") return detail.replace(/_/g, " ");
  if (typeof detail?.message === "string") return detail.message;
  if (typeof error?.message === "string") return error.message;
  return "Something went wrong";
}
function stageTone(state: string) {
  if (state === "approved") return "success" as const;
  if (state === "awaiting_review") return "accent" as const;
  if (state === "failed" || state === "rejected") return "danger" as const;
  return "neutral" as const;
}
function childPriceLabel(child: FusionPricingChild) {
  const pricing: any = child?.pricing ?? {};
  const summary: any = child?.pricing_summary ?? {};
  return clean(
    summary.display_total || summary.estimated_credits_label ||
    pricing.summary?.display_total || pricing.summary?.estimated_credits_label ||
    pricing.display_total || child.message || "Price ready"
  );
}

export default function MultiPersonFusionDenseScreen({ storyId }: Props) {
  const viewport = useStudioViewport();
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
    return () => { mounted.current = false; };
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!storyId) return;
    if (!quiet) setLoading(true);
    try {
      const [nextWorkspace, initialWorkflow] = await Promise.all([
        getStoryWorkspace(storyId),
        ensureStoryStudioWorkflow(storyId),
      ]);
      const recoverable = fusionStages(initialWorkflow).filter((stage) =>
        ["generating", "awaiting_review", "approved"].includes(stage.state)
      );
      let latestWorkflow = initialWorkflow;
      const recovered: StageMap<FusionSyncResult> = {};
      if (recoverable.length) {
        const settled = await Promise.allSettled(
          recoverable.map((stage) => syncSceneFusion(initialWorkflow.workflow_id, stage.stage_run_id))
        );
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") {
            recovered[recoverable[index].stage_run_id] = result.value;
            latestWorkflow = result.value.workflow || latestWorkflow;
          }
        });
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
  }, [storyId]);

  useEffect(() => { void load(); }, [load]);

  const stages = useMemo(() => fusionStages(workflow), [workflow]);
  const sceneById = useMemo(() => {
    const map = new Map<string, any>();
    (workspace?.scenes ?? []).forEach((scene: any) => {
      const id = clean(scene?.scene_id || scene?.id);
      if (id) map.set(id, scene);
    });
    return map;
  }, [workspace]);

  const syncStage = useCallback(async (stage: StudioStageView, quiet = false) => {
    if (!workflow) return;
    if (!quiet) setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    try {
      const result = await syncSceneFusion(workflow.workflow_id, stage.stage_run_id);
      if (!mounted.current) return;
      setSyncs((c) => ({ ...c, [stage.stage_run_id]: result }));
      setWorkflow(result.workflow);
    } catch (error) {
      if (!quiet) Alert.alert("Fusion Studio", errorMessage(error));
    } finally {
      if (mounted.current && !quiet) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [workflow]);

  useEffect(() => {
    if (!workflow) return;
    const generating = fusionStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(() => generating.forEach((stage) => void syncStage(stage, true)), 4200);
    return () => clearInterval(timer);
  }, [syncStage, workflow]);

  const checkPrice = useCallback(async (stage: StudioStageView) => {
    if (!workflow) return;
    if (!externalProviderOk) {
      Alert.alert("Fusion Studio", "Enable external-provider processing before checking the render price.");
      return;
    }
    setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    try {
      const preview = await previewSceneFusion(workflow.workflow_id, stage.stage_run_id, true);
      if (mounted.current) setPreviews((c) => ({ ...c, [stage.stage_run_id]: preview }));
    } catch (error) {
      Alert.alert("Fusion Studio", errorMessage(error));
    } finally {
      if (mounted.current) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [externalProviderOk, workflow]);

  const renderScene = useCallback(async (stage: StudioStageView) => {
    if (!workflow) return;
    const preview = previews[stage.stage_run_id];
    if (!preview) return void checkPrice(stage);
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
      `${confirmations.length} ordered dialogue segment${confirmations.length === 1 ? "" : "s"} will be rendered and stitched.\n\n${priceLines}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Render",
          onPress: () => void (async () => {
            setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
            try {
              await dispatchSceneFusion(workflow.workflow_id, stage.stage_run_id, confirmations, true);
              const next = await getStudioWorkflow(workflow.workflow_id);
              if (!mounted.current) return;
              setWorkflow(next);
              setPreviews((c) => {
                const copy = { ...c };
                delete copy[stage.stage_run_id];
                return copy;
              });
            } catch (error) {
              Alert.alert("Fusion Studio", errorMessage(error));
            } finally {
              if (mounted.current) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
            }
          })(),
        },
      ]
    );
  }, [checkPrice, previews, workflow]);

  const review = useCallback(async (
    stage: StudioStageView,
    decision: "approved" | "rejected" | "revise"
  ) => {
    if (!workflow) return;
    setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    try {
      const authoritative = await getStudioWorkflow(workflow.workflow_id);
      const current = fusionStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id);
      const pending = latestPendingReview(current);
      if (!pending) {
        setWorkflow(authoritative);
        Alert.alert("Fusion Studio", "This review is no longer pending. The latest state has been loaded.");
        return;
      }
      const reviewed = await reviewStudioOutput(pending.review_item_id, decision);
      const next = decision === "approved"
        ? await advanceStudioWorkflow(reviewed.workflow_id).catch(() => reviewed)
        : reviewed;
      if (!mounted.current) return;
      setWorkflow(next);
      if (decision !== "approved") {
        setPreviews((c) => {
          const copy = { ...c };
          delete copy[stage.stage_run_id];
          return copy;
        });
        setSyncs((c) => {
          const copy = { ...c };
          delete copy[stage.stage_run_id];
          return copy;
        });
      }
    } catch (error) {
      Alert.alert("Fusion Studio", errorMessage(error));
    } finally {
      if (mounted.current) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [workflow]);

  const openMenu = useCallback(() => {
    router.push({ pathname: "/(tabs)/dashboard" as any, params: { openMenu: "1", menu_nonce: `${Date.now()}`, menu_source: "story_fusion" } } as any);
  }, []);
  const openPlan = useCallback(() => {
    router.push({ pathname: "/(tabs)/billing" as any, params: { intent: "manage", source: "story_fusion" } } as any);
  }, []);

  if (loading && !workflow) {
    return (
      <View style={styles.safe}>
        <DFHeader subtitle="Story Fusion Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
        <View style={styles.center}><ActivityIndicator size="large" color={STUDIO.accent} /><Text style={styles.helper}>Preparing scene render…</Text></View>
      </View>
    );
  }

  const approved = stages.filter((stage) => stage.state === "approved").length;
  const blocked = workflow?.current_stage === "face" || workflow?.current_stage === "audio";
  const complete = clean(workflow?.state).toLowerCase() === "completed";

  return (
    <View style={styles.safe}>
      <DFHeader subtitle="Story Fusion Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: viewport.contentMaxWidth, paddingHorizontal: viewport.horizontalPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={STUDIO.accent} onRefresh={() => { setRefreshing(true); void load(true); }} />}
      >
        <StudioHero
          eyebrow="STORY FUSION STUDIO"
          title={workspace?.title || "Scene render"}
          subtitle="Render each scene from approved Face and Audio inputs, then review and lock the stitched output."
          right={<ProgressLine current={approved} total={stages.length} label="Scenes" />}
        />

        <Surface style={styles.topBar} accent={externalProviderOk}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: externalProviderOk }}
            onPress={() => {
              const next = !externalProviderOk;
              setExternalProviderOk(next);
              if (!next) setPreviews({});
            }}
            style={({ pressed }) => [styles.consent, pressed && styles.pressed]}
          >
            <View style={[styles.checkbox, externalProviderOk && styles.checkboxActive]}>
              <Text style={styles.checkmark}>{externalProviderOk ? "✓" : ""}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.consentTitle}>External-provider processing</Text>
              <Text style={styles.consentMeta} numberOfLines={1}>{externalProviderOk ? "Enabled for pricing and render" : "Required before render pricing"}</Text>
            </View>
          </Pressable>
          {blocked ? <StatusPill value={`WAITING FOR ${humanState(workflow?.current_stage).toUpperCase()}`} tone="danger" /> : null}
          {complete ? <StatusPill value="STORY COMPLETE" tone="success" /> : null}
        </Surface>

        <SectionLabel title="Scene workspace" meta={`${approved}/${stages.length} approved`} />

        {stages.map((stage, index) => {
          const scene = sceneById.get(clean(stage.scene_id));
          const preview = previews[stage.stage_run_id];
          const sync = syncs[stage.stage_run_id];
          const isBusy = Boolean(busy[stage.stage_run_id]);
          const canReview = stage.state === "awaiting_review" && Boolean(latestPendingReview(stage));
          const canPrice = ["pending", "ready", "failed", "rejected"].includes(stage.state) && !blocked;
          const videoUrl = clean(sync?.video_url);
          const children = sync?.children ?? [];
          const sceneTitle = clean(scene?.title || scene?.name) || `Scene ${index + 1}`;
          const turnCount = preview?.turn_count || scene?.dialogue?.length || children.length || 0;
          const participants = Array.isArray(scene?.participant_ids) ? scene.participant_ids.length : 0;
          const childSummary = preview?.children?.length
            ? preview.children.map((child) => childPriceLabel(child)).filter(Boolean).slice(0, 2).join(" • ")
            : "";

          return (
            <Surface key={stage.stage_run_id} accent={stage.state === "approved"} style={styles.sceneCard}>
              <View style={styles.sceneRow}>
                <View style={[styles.sceneBadge, { width: viewport.mediaSize, height: Math.max(84, Math.round(viewport.mediaSize * 0.72)) }]}>
                  <Text style={styles.sceneBadgeKicker}>SCENE</Text>
                  <Text style={styles.sceneBadgeNumber}>{index + 1}</Text>
                  {videoUrl ? <Text style={styles.sceneBadgeReady}>PREVIEW</Text> : null}
                </View>

                <View style={styles.sceneBody}>
                  <View style={styles.sceneHead}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.sceneTitle} numberOfLines={1}>{sceneTitle}</Text>
                      <Text style={styles.sceneMeta} numberOfLines={1}>
                        {turnCount} dialogue segment{turnCount === 1 ? "" : "s"}{participants ? ` • ${participants} character${participants === 1 ? "" : "s"}` : ""} • ordered stitch
                      </Text>
                    </View>
                    <StatusPill value={humanState(stage.state)} tone={stageTone(stage.state)} />
                  </View>

                  {preview ? (
                    <View style={styles.priceSummary}>
                      <Text style={styles.priceTitle}>Render price ready</Text>
                      <Text style={styles.priceMeta} numberOfLines={2}>{childSummary || `${preview.children.length} priced segments`}</Text>
                    </View>
                  ) : null}

                  {children.length ? (
                    <View style={styles.segmentSummary}>
                      <Text style={styles.segmentTitle}>Segments</Text>
                      <Text style={styles.segmentMeta} numberOfLines={2}>
                        {children
                          .slice()
                          .sort((a: any, b: any) => Number(a?.sequence_no || 0) - Number(b?.sequence_no || 0))
                          .map((child: any) => `${clean(child?.display_name) || "Dialogue"}: ${humanState(child?.status || "queued")}`)
                          .join(" • ")}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={[styles.actionRail, { width: viewport.actionWidth }]}> 
                  {isBusy ? <ActivityIndicator size="small" color={STUDIO.accent} /> : null}
                  {videoUrl ? <CompactButton label="Preview" onPress={() => void Linking.openURL(videoUrl).catch((error) => Alert.alert("Fusion Studio", errorMessage(error)))} fill /> : null}
                  {canPrice && !preview ? (
                    <CompactButton
                      label={stage.state === "failed" ? "Retry price" : stage.state === "rejected" ? "Regen price" : "Check price"}
                      onPress={() => void checkPrice(stage)}
                      disabled={isBusy || !externalProviderOk}
                      fill
                    />
                  ) : null}
                  {canPrice && preview ? (
                    <>
                      <CompactButton label={stage.state === "rejected" ? "Regenerate" : stage.state === "failed" ? "Retry" : "Render"} onPress={() => void renderScene(stage)} disabled={isBusy || !externalProviderOk} tone="primary" fill />
                      <CompactButton label="Reprice" onPress={() => void checkPrice(stage)} disabled={isBusy || !externalProviderOk} fill />
                    </>
                  ) : null}
                  {canReview ? (
                    <>
                      {!videoUrl ? <CompactButton label="Load preview" onPress={() => void syncStage(stage)} disabled={isBusy} fill /> : null}
                      <CompactButton label="Approve" onPress={() => void review(stage, "approved")} disabled={isBusy} tone="primary" fill />
                      <CompactButton
                        label="Revise"
                        onPress={() => Alert.alert(
                          "Revise this scene?",
                          "Approved Face and Audio inputs stay locked. Only the scene render will be regenerated and repriced.",
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Revise", onPress: () => void review(stage, "revise") },
                          ]
                        )}
                        disabled={isBusy}
                        fill
                      />
                    </>
                  ) : null}
                  {stage.state === "generating" ? <CompactButton label="Refresh" onPress={() => void syncStage(stage)} disabled={isBusy} fill /> : null}
                  {stage.state === "approved" ? <StatusPill value="LOCKED" tone="success" /> : null}
                </View>
              </View>
            </Surface>
          );
        })}

        <Divider />
        <View style={styles.footerRow}>
          <Text style={styles.footerTitle}>{complete ? "Story render complete" : "Fusion in progress"}</Text>
          <Text style={styles.footerMeta}>{approved}/{stages.length} approved</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: STUDIO.bg },
  content: { width: "100%", alignSelf: "center", paddingTop: 10, paddingBottom: 120, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  helper: { color: STUDIO.muted, fontSize: 11, fontWeight: "700" },
  topBar: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10 },
  consent: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: STUDIO.border, alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: STUDIO.accentFill, borderColor: STUDIO.accentBorder },
  checkmark: { color: STUDIO.accent, fontSize: 12, fontWeight: "900" },
  consentTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  consentMeta: { color: STUDIO.muted, fontSize: 9, fontWeight: "700", marginTop: 1 },
  sceneCard: { padding: 10 },
  sceneRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  sceneBadge: { flexShrink: 0, borderRadius: 13, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft, alignItems: "center", justifyContent: "center", gap: 1 },
  sceneBadgeKicker: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  sceneBadgeNumber: { color: STUDIO.text, fontSize: 26, lineHeight: 29, fontWeight: "900" },
  sceneBadgeReady: { color: STUDIO.accentText, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  sceneBody: { flex: 1, minWidth: 0, justifyContent: "center", gap: 7 },
  sceneHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  sceneTitle: { color: STUDIO.text, fontSize: 15, fontWeight: "900", letterSpacing: -0.15 },
  sceneMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "700", marginTop: 2 },
  priceSummary: { gap: 2 },
  priceTitle: { color: STUDIO.accentText, fontSize: 9, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.35 },
  priceMeta: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  segmentSummary: { gap: 2 },
  segmentTitle: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.35 },
  segmentMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600" },
  actionRail: { flexShrink: 0, justifyContent: "center", gap: 6 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 2 },
  footerTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  footerMeta: { color: STUDIO.muted, fontSize: 10, fontWeight: "800" },
  pressed: { opacity: 0.76 },
});
