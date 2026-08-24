import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
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
  ProgressLine,
  SectionLabel,
  StatusPill,
  STUDIO,
  StudioHero,
  Surface,
  useStudioViewport,
} from "../../core/studio/DenseStudioUI";
import {
  getStudioProductionPreflight,
  retryFusionStitch,
  userFacingStudioError,
  type StudioProductionPreflight,
} from "../../core/studio/productionExperience";
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

type ConfirmationState = {
  stage: StudioStageView;
  preview: FusionPricingPreview;
} | null;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isChildSuccess(value: unknown) {
  return ["succeeded", "completed", "complete", "ready"].includes(clean(value).toLowerCase());
}

function childCredits(child: FusionPricingChild): number | null {
  const pricing: any = child?.pricing ?? {};
  const summary: any = child?.pricing_summary ?? {};
  const candidates = [
    pricing.estimated_credits,
    pricing.credits,
    pricing.total_credits,
    pricing?.summary?.estimated_credits,
    pricing?.summary?.credits,
    summary.estimated_credits,
    summary.credits,
    summary.total_credits,
  ];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0) return number;
  }
  const text = clean(
    summary.estimated_credits_label ||
      summary.display_total ||
      pricing?.summary?.estimated_credits_label ||
      pricing?.summary?.display_total ||
      pricing.display_total
  );
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function childPriceLabel(child: FusionPricingChild) {
  const credits = childCredits(child);
  if (credits !== null) return `${credits} credit${credits === 1 ? "" : "s"}`;
  const pricing: any = child?.pricing ?? {};
  const summary: any = child?.pricing_summary ?? {};
  return clean(
    summary.display_total ||
      summary.estimated_credits_label ||
      pricing?.summary?.display_total ||
      pricing?.summary?.estimated_credits_label ||
      pricing.display_total ||
      child.message ||
      "Price ready"
  );
}

function scenePrice(preview: FusionPricingPreview | undefined) {
  if (!preview) return { known: false, credits: 0, label: "" };
  if (!preview.children.length) {
    return { known: true, credits: 0, label: "No new segment charge" };
  }
  const values = preview.children.map(childCredits);
  if (values.some((value) => value === null)) {
    return { known: false, credits: 0, label: "Scene price ready" };
  }
  const credits = (values as number[]).reduce((sum, value) => sum + value, 0);
  return { known: true, credits, label: `${credits} credit${credits === 1 ? "" : "s"}` };
}

function FinalVideoPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

function ReadinessItem({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <View style={styles.readinessItem}>
      <View style={[styles.readinessDot, ready && styles.readinessDotReady]}>
        <Text style={styles.readinessCheck}>{ready ? "✓" : ""}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.readinessLabel}>{label}</Text>
        <Text style={styles.readinessValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function MultiPersonFusionDenseScreen({ storyId }: Props) {
  const viewport = useStudioViewport();
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [preflight, setPreflight] = useState<StudioProductionPreflight | null>(null);
  const [previews, setPreviews] = useState<StageMap<FusionPricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<FusionSyncResult>>({});
  const [busy, setBusy] = useState<StageMap<boolean>>({});
  const [expandedPrices, setExpandedPrices] = useState<StageMap<boolean>>({});
  const [processingConsent, setProcessingConsent] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refreshPreflight = useCallback(async (workflowId: string) => {
    const next = await getStudioProductionPreflight(workflowId);
    if (mounted.current) setPreflight(next);
    return next;
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!storyId) return;
    if (!quiet) setLoading(true);
    setMessage("");
    try {
      const [nextWorkspace, initialWorkflow] = await Promise.all([
        getStoryWorkspace(storyId),
        ensureStoryStudioWorkflow(storyId),
      ]);
      let latestWorkflow = initialWorkflow;
      const recovered: StageMap<FusionSyncResult> = {};
      const recoverable = fusionStages(initialWorkflow).filter((stage) =>
        ["generating", "awaiting_review", "approved"].includes(stage.state)
      );
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
      const nextPreflight = await getStudioProductionPreflight(latestWorkflow.workflow_id);
      if (!mounted.current) return;
      setWorkspace(nextWorkspace);
      setWorkflow(latestWorkflow);
      setPreflight(nextPreflight);
      setSyncs((current) => ({ ...current, ...recovered }));
    } catch (error) {
      if (mounted.current) setMessage(userFacingStudioError(error));
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
    if (!quiet) setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
    try {
      const result = await syncSceneFusion(workflow.workflow_id, stage.stage_run_id);
      if (!mounted.current) return;
      setSyncs((current) => ({ ...current, [stage.stage_run_id]: result }));
      setWorkflow(result.workflow);
      await refreshPreflight(workflow.workflow_id);
    } catch (error) {
      if (!quiet) setMessage(userFacingStudioError(error));
      if (workflow) {
        const authoritative = await getStudioWorkflow(workflow.workflow_id).catch(() => null);
        if (authoritative && mounted.current) {
          setWorkflow(authoritative);
          await refreshPreflight(authoritative.workflow_id).catch(() => null);
        }
      }
    } finally {
      if (mounted.current && !quiet) setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
    }
  }, [refreshPreflight, workflow]);

  useEffect(() => {
    if (!workflow) return;
    const generating = fusionStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(() => generating.forEach((stage) => void syncStage(stage, true)), 3600);
    return () => clearInterval(timer);
  }, [syncStage, workflow]);

  const checkPrice = useCallback(async (stage: StudioStageView) => {
    if (!workflow) return;
    if (!processingConsent) {
      setMessage("Confirm secure video processing first. Nothing is sent for scene creation until you approve it.");
      return;
    }
    setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
    setMessage("");
    try {
      const preview = await previewSceneFusion(workflow.workflow_id, stage.stage_run_id, true);
      if (mounted.current) setPreviews((current) => ({ ...current, [stage.stage_run_id]: preview }));
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
    }
  }, [processingConsent, workflow]);

  const confirmRender = useCallback(async (stage: StudioStageView, preview: FusionPricingPreview) => {
    if (!workflow) return;
    setConfirmation(null);
    setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
    setMessage("");
    try {
      if (stage.state === "failed" && preview.children.length === 0) {
        await retryFusionStitch(workflow.workflow_id, stage.stage_run_id);
      } else {
        const confirmations = fusionPricingConfirmations(preview);
        await dispatchSceneFusion(workflow.workflow_id, stage.stage_run_id, confirmations, true);
      }
      const next = await getStudioWorkflow(workflow.workflow_id);
      if (!mounted.current) return;
      setWorkflow(next);
      setPreviews((current) => {
        const copy = { ...current };
        delete copy[stage.stage_run_id];
        return copy;
      });
      await refreshPreflight(workflow.workflow_id);
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
    }
  }, [refreshPreflight, workflow]);

  const review = useCallback(async (stage: StudioStageView, decision: "approved" | "revise") => {
    if (!workflow) return;
    setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
    setMessage("");
    try {
      const authoritative = await getStudioWorkflow(workflow.workflow_id);
      const current = fusionStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id);
      const pending = latestPendingReview(current);
      if (!pending) {
        setWorkflow(authoritative);
        setMessage("The latest scene state has been loaded.");
        return;
      }
      const reviewed = await reviewStudioOutput(pending.review_item_id, decision);
      const next = decision === "approved"
        ? await advanceStudioWorkflow(reviewed.workflow_id).catch(() => reviewed)
        : reviewed;
      if (!mounted.current) return;
      setWorkflow(next);
      await refreshPreflight(next.workflow_id);
      if (decision === "revise") {
        setPreviews((currentPreviews) => {
          const copy = { ...currentPreviews };
          delete copy[stage.stage_run_id];
          return copy;
        });
        setSyncs((currentSyncs) => {
          const copy = { ...currentSyncs };
          delete copy[stage.stage_run_id];
          return copy;
        });
      }
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
    }
  }, [refreshPreflight, workflow]);

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
        <View style={styles.center}><ActivityIndicator size="large" color={STUDIO.accent} /><Text style={styles.helper}>Preparing your scene…</Text></View>
      </View>
    );
  }

  const approvedScenes = stages.filter((stage) => stage.state === "approved").length;
  const complete = clean(workflow?.state).toLowerCase() === "completed";
  const faceReady = Boolean(preflight?.face?.total) && preflight?.face?.approved === preflight?.face?.total;
  const audioReady = Boolean(preflight?.audio?.total) && preflight?.audio?.approved === preflight?.audio?.total;
  const voicesReady = Boolean(preflight?.audio?.speakers_ready);
  const fusionCurrent = workflow?.current_stage === "fusion" || complete;
  const readyForScene = faceReady && audioReady && voicesReady && fusionCurrent;

  return (
    <View style={styles.safe}>
      <DFHeader subtitle="Story Fusion Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: viewport.contentMaxWidth, paddingHorizontal: viewport.horizontalPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={STUDIO.accent} onRefresh={() => { setRefreshing(true); void load(true); }} />}
      >
        <StudioHero
          eyebrow="STORY FUSION STUDIO"
          title={workspace?.title || "Create your scene"}
          subtitle="Bring the approved cast, voices and dialogue together into the final talking-video scene. Nothing upstream is regenerated."
          right={<ProgressLine current={approvedScenes} total={stages.length} label="Scenes" />}
        />

        {message ? <Surface style={styles.messageBox} accent><Text style={styles.messageText}>{message}</Text></Surface> : null}

        <Surface style={styles.readinessCard} accent={readyForScene}>
          <View style={styles.readinessHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.readinessTitle}>{readyForScene ? "Ready to create" : "Production readiness"}</Text>
              <Text style={styles.readinessMeta}>
                {readyForScene ? "Everything you approved is locked and will be reused." : "Finish the highlighted upstream step before scene creation."}
              </Text>
            </View>
            {readyForScene ? <StatusPill value="READY" tone="success" /> : <StatusPill value="WAITING" tone="neutral" />}
          </View>
          <View style={styles.readinessGrid}>
            <ReadinessItem label="Cast" value={`${preflight?.face?.approved ?? 0}/${preflight?.face?.total ?? 0} locked`} ready={faceReady} />
            <ReadinessItem label="Voices" value={voicesReady ? "Character voices ready" : "Needs attention"} ready={voicesReady} />
            <ReadinessItem label="Dialogue" value={`${preflight?.audio?.approved ?? 0}/${preflight?.audio?.total ?? 0} approved`} ready={audioReady} />
            <ReadinessItem label="Scene" value={fusionCurrent ? "Ready for production" : `Waiting for ${workflow?.current_stage || "upstream work"}`} ready={fusionCurrent} />
          </View>
        </Surface>

        <Surface style={styles.consentCard} accent={processingConsent}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: processingConsent }}
            onPress={() => {
              const next = !processingConsent;
              setProcessingConsent(next);
              if (!next) setPreviews({});
            }}
            style={({ pressed }) => [styles.consent, pressed && styles.pressed]}
          >
            <View style={[styles.checkbox, processingConsent && styles.checkboxActive]}>
              <Text style={styles.checkmark}>{processingConsent ? "✓" : ""}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.consentTitle}>Allow secure video processing</Text>
              <Text style={styles.consentMeta}>
                Your approved Face and Audio may be securely processed by the configured video-generation service. Nothing is sent until you confirm scene creation.
              </Text>
            </View>
          </Pressable>
        </Surface>

        <SectionLabel title="Scene production" meta={`${approvedScenes}/${stages.length} approved`} />

        {stages.map((stage, index) => {
          const scene = sceneById.get(clean(stage.scene_id));
          const preview = previews[stage.stage_run_id];
          const sync = syncs[stage.stage_run_id];
          const isBusy = Boolean(busy[stage.stage_run_id]);
          const canReview = stage.state === "awaiting_review" && Boolean(latestPendingReview(stage));
          const canPrice = ["pending", "ready", "failed", "rejected"].includes(stage.state) && readyForScene;
          const videoUrl = clean(sync?.video_url);
          const children = sync?.children ?? [];
          const sceneTitle = clean(scene?.title || scene?.name) || `Scene ${index + 1}`;
          const turnCount = Number(preview?.turn_count || scene?.dialogue?.length || children.length || 0);
          const childSuccess = children.filter((child: any) => isChildSuccess(child?.status) && clean(child?.video_url)).length;
          const childFailed = children.filter((child: any) => clean(child?.status).toLowerCase() === "failed").length;
          const allChildrenRendered = turnCount > 0 && childSuccess >= turnCount;
          const stitching = stage.state === "generating" && allChildrenRendered && !videoUrl;
          const price = scenePrice(preview);
          const retrySubset = Boolean(preview && preview.children.length > 0 && preview.children.length < preview.turn_count);
          const stitchOnly = Boolean(preview && stage.state === "failed" && preview.children.length === 0);
          const expanded = Boolean(expandedPrices[stage.stage_run_id]);

          return (
            <Surface key={stage.stage_run_id} accent={stage.state === "approved"} style={styles.sceneCard}>
              <View style={styles.sceneHeader}>
                <View style={styles.sceneNumber}><Text style={styles.sceneNumberText}>{index + 1}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sceneTitle} numberOfLines={2}>{sceneTitle}</Text>
                  <Text style={styles.sceneMeta}>
                    {turnCount} dialogue segment{turnCount === 1 ? "" : "s"} • approved Face and Audio reused
                  </Text>
                </View>
                <StatusPill
                  value={stitching ? "ASSEMBLING" : stage.state === "awaiting_review" ? "READY TO REVIEW" : stage.state === "failed" ? "NEEDS RETRY" : stage.state === "approved" ? "APPROVED" : stage.state === "generating" ? "CREATING" : "READY"}
                  tone={stage.state === "approved" ? "success" : stage.state === "failed" ? "danger" : stage.state === "awaiting_review" ? "accent" : "neutral"}
                />
              </View>

              {stage.state === "generating" ? (
                <View style={styles.productionProgress}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.progressTitle}>{stitching ? "Assembling your scene…" : "Creating dialogue video segments…"}</Text>
                    <Text style={styles.progressMeta}>
                      {stitching ? "All dialogue videos are ready. desifaces is joining them in story order." : `${childSuccess}/${turnCount} rendered${childFailed ? ` • ${childFailed} needs attention` : ""}. Completed segments stay preserved.`}
                    </Text>
                  </View>
                  <ProgressLine current={childSuccess} total={turnCount} label="Segments" />
                </View>
              ) : null}

              {preview ? (
                <View style={styles.priceCard}>
                  <View style={styles.priceHeader}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.priceKicker}>{stitchOnly ? "ASSEMBLY RETRY" : retrySubset ? "RETRY PRICE" : "SCENE PRICE"}</Text>
                      <Text style={styles.priceTotal}>{price.label}</Text>
                      <Text style={styles.priceExplain}>
                        {stitchOnly
                          ? "All dialogue videos are already complete. Retry only scene assembly; there is no new child-render charge."
                          : retrySubset
                            ? `${preview.turn_count - preview.children.length} completed segment${preview.turn_count - preview.children.length === 1 ? " is" : "s are"} preserved. Only ${preview.children.length} unfinished segment${preview.children.length === 1 ? " is" : "s are"} repriced.`
                            : `${preview.children.length} dialogue segment${preview.children.length === 1 ? "" : "s"} included. Nothing starts until you confirm.`}
                      </Text>
                    </View>
                    {!stitchOnly && preview.children.length > 0 ? (
                      <Pressable onPress={() => setExpandedPrices((current) => ({ ...current, [stage.stage_run_id]: !expanded }))}>
                        <Text style={styles.detailsToggle}>{expanded ? "Hide details" : "See details"}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {expanded ? (
                    <View style={styles.priceDetails}>
                      {preview.children
                        .slice()
                        .sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0))
                        .map((child) => (
                          <View key={child.dialogue_turn_id} style={styles.priceDetailRow}>
                            <Text style={styles.priceDetailName} numberOfLines={1}>{child.display_name || "Dialogue"}</Text>
                            <Text style={styles.priceDetailValue}>{childPriceLabel(child)}</Text>
                          </View>
                        ))}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {videoUrl ? (
                <View style={styles.finalMedia}>
                  <Text style={styles.finalMediaTitle}>Your scene is ready</Text>
                  <FinalVideoPlayer uri={videoUrl} />
                  <Text style={styles.finalMediaMeta}>Review the complete scene before approval. Your Face and Audio remain locked if you choose Revise Scene.</Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                {isBusy ? <ActivityIndicator size="small" color={STUDIO.accent} /> : null}
                {canPrice && !preview ? (
                  <CompactButton label={stage.state === "failed" ? "Check retry price" : stage.state === "rejected" ? "Price new scene version" : "Check scene price"} onPress={() => void checkPrice(stage)} disabled={isBusy || !processingConsent} fill />
                ) : null}
                {canPrice && preview ? (
                  <>
                    <CompactButton
                      label={stitchOnly ? "Retry assembly" : retrySubset ? "Retry unfinished segments" : stage.state === "rejected" ? "Create new scene version" : "Create scene"}
                      onPress={() => setConfirmation({ stage, preview })}
                      disabled={isBusy || !processingConsent}
                      tone="primary"
                      fill
                    />
                    {!stitchOnly ? <CompactButton label="Refresh price" onPress={() => void checkPrice(stage)} disabled={isBusy || !processingConsent} fill /> : null}
                  </>
                ) : null}
                {stage.state === "generating" ? <CompactButton label="Refresh progress" onPress={() => void syncStage(stage)} disabled={isBusy} fill /> : null}
                {canReview ? (
                  <>
                    <CompactButton label="Approve story scene" onPress={() => void review(stage, "approved")} disabled={isBusy} tone="primary" fill />
                    <CompactButton
                      label="Revise scene"
                      onPress={() => Alert.alert(
                        "Create a new scene version?",
                        "Your approved Face identities and Audio stay locked and are reused. Only this scene video is regenerated and repriced.",
                        [
                          { text: "Keep current", style: "cancel" },
                          { text: "Revise scene", onPress: () => void review(stage, "revise") },
                        ]
                      )}
                      disabled={isBusy}
                      fill
                    />
                  </>
                ) : null}
                {stage.state === "approved" ? <StatusPill value="SCENE LOCKED" tone="success" /> : null}
              </View>
            </Surface>
          );
        })}

        <Divider />
        <View style={styles.footerRow}>
          <Text style={styles.footerTitle}>{complete ? "Story production complete" : "Fusion in progress"}</Text>
          <Text style={styles.footerMeta}>{approvedScenes}/{stages.length} approved</Text>
        </View>
      </ScrollView>

      <Modal visible={Boolean(confirmation)} transparent animationType="fade" onRequestClose={() => setConfirmation(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmationCard}>
            {confirmation ? (() => {
              const price = scenePrice(confirmation.preview);
              const stitchOnly = confirmation.stage.state === "failed" && confirmation.preview.children.length === 0;
              const retrySubset = confirmation.preview.children.length > 0 && confirmation.preview.children.length < confirmation.preview.turn_count;
              return (
                <>
                  <Text style={styles.confirmationEyebrow}>{stitchOnly ? "ASSEMBLY RECOVERY" : retrySubset ? "UNFINISHED SEGMENTS ONLY" : "READY TO CREATE"}</Text>
                  <Text style={styles.confirmationTitle}>{stitchOnly ? "Retry scene assembly?" : "Create this scene?"}</Text>
                  <Text style={styles.confirmationPrice}>{price.label}</Text>
                  <Text style={styles.confirmationMeta}>
                    {stitchOnly
                      ? "All dialogue videos are already complete. This retries assembly without a new child-render charge."
                      : retrySubset
                        ? `Only ${confirmation.preview.children.length} unfinished segment${confirmation.preview.children.length === 1 ? "" : "s"} will be generated. Completed segments stay untouched.`
                        : `${confirmation.preview.children.length} ordered dialogue segment${confirmation.preview.children.length === 1 ? "" : "s"} will be created and assembled into one scene.`}
                  </Text>
                  <Text style={styles.confirmationGuarantee}>Approved Face and Audio are reused. Nothing upstream is regenerated.</Text>
                  <View style={styles.confirmationActions}>
                    <CompactButton label="Cancel" onPress={() => setConfirmation(null)} fill />
                    <CompactButton label={stitchOnly ? "Retry assembly" : retrySubset ? "Retry unfinished" : "Confirm & create"} onPress={() => void confirmRender(confirmation.stage, confirmation.preview)} tone="primary" fill />
                  </View>
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: STUDIO.bg },
  content: { width: "100%", alignSelf: "center", paddingTop: 10, paddingBottom: 120, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  helper: { color: STUDIO.muted, fontSize: 11, fontWeight: "700" },
  messageBox: { padding: 10 },
  messageText: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  readinessCard: { padding: 11, gap: 10 },
  readinessHeader: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  readinessTitle: { color: STUDIO.text, fontSize: 13, fontWeight: "900" },
  readinessMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "650", marginTop: 2 },
  readinessGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  readinessItem: { minWidth: "46%", flexGrow: 1, flexBasis: 150, flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft },
  readinessDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: STUDIO.border, alignItems: "center", justifyContent: "center" },
  readinessDotReady: { borderColor: "#3B9B68", backgroundColor: "rgba(59,155,104,0.16)" },
  readinessCheck: { color: "#8CE0AE", fontSize: 10, fontWeight: "900" },
  readinessLabel: { color: STUDIO.faint, fontSize: 7, fontWeight: "900", letterSpacing: 0.45, textTransform: "uppercase" },
  readinessValue: { color: STUDIO.text, fontSize: 9, lineHeight: 12, fontWeight: "800", marginTop: 1 },
  consentCard: { padding: 10 },
  consent: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  checkbox: { width: 23, height: 23, borderRadius: 7, borderWidth: 1, borderColor: STUDIO.border, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxActive: { backgroundColor: STUDIO.accentFill, borderColor: STUDIO.accentBorder },
  checkmark: { color: STUDIO.accent, fontSize: 12, fontWeight: "900" },
  consentTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  consentMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "650", marginTop: 2 },
  sceneCard: { padding: 11, gap: 10 },
  sceneHeader: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  sceneNumber: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft, alignItems: "center", justifyContent: "center" },
  sceneNumberText: { color: STUDIO.accentText, fontSize: 13, fontWeight: "900" },
  sceneTitle: { color: STUDIO.text, fontSize: 15, lineHeight: 18, fontWeight: "900", letterSpacing: -0.15 },
  sceneMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "650", marginTop: 2 },
  productionProgress: { flexDirection: "row", alignItems: "center", gap: 10, padding: 9, borderRadius: 10, backgroundColor: STUDIO.surfaceSoft, borderWidth: 1, borderColor: STUDIO.border },
  progressTitle: { color: STUDIO.text, fontSize: 10, fontWeight: "900" },
  progressMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "650", marginTop: 2 },
  priceCard: { borderRadius: 11, borderWidth: 1, borderColor: STUDIO.accentBorder, backgroundColor: STUDIO.accentFill, padding: 10, gap: 8 },
  priceHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  priceKicker: { color: STUDIO.accentText, fontSize: 7, fontWeight: "900", letterSpacing: 0.55 },
  priceTotal: { color: STUDIO.text, fontSize: 17, lineHeight: 21, fontWeight: "900", marginTop: 2 },
  priceExplain: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "650", marginTop: 2 },
  detailsToggle: { color: STUDIO.accentText, fontSize: 8, fontWeight: "900", paddingVertical: 3 },
  priceDetails: { gap: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: STUDIO.border, paddingTop: 7 },
  priceDetailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  priceDetailName: { flex: 1, color: STUDIO.text, fontSize: 8, fontWeight: "700" },
  priceDetailValue: { color: STUDIO.accentText, fontSize: 8, fontWeight: "900" },
  finalMedia: { gap: 7 },
  finalMediaTitle: { color: STUDIO.text, fontSize: 12, fontWeight: "900" },
  video: { width: "100%", aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: "#000" },
  finalMediaMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "650" },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 2 },
  footerTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  footerMeta: { color: STUDIO.muted, fontSize: 10, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", padding: 18 },
  confirmationCard: { width: "100%", maxWidth: 520, alignSelf: "center", borderRadius: 18, borderWidth: 1, borderColor: STUDIO.accentBorder, backgroundColor: STUDIO.raised, padding: 16, gap: 9 },
  confirmationEyebrow: { color: STUDIO.accentText, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  confirmationTitle: { color: STUDIO.text, fontSize: 18, lineHeight: 22, fontWeight: "900" },
  confirmationPrice: { color: STUDIO.accentText, fontSize: 23, lineHeight: 27, fontWeight: "900" },
  confirmationMeta: { color: STUDIO.muted, fontSize: 10, lineHeight: 15, fontWeight: "650" },
  confirmationGuarantee: { color: STUDIO.text, fontSize: 9, lineHeight: 13, fontWeight: "800" },
  confirmationActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  pressed: { opacity: 0.76 },
});