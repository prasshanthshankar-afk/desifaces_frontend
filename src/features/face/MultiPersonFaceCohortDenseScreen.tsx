import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  SafeAreaView,
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
import {
  dispatchParticipantFace,
  displayPrice,
  ensureStoryStudioWorkflow,
  faceCohort,
  faceStages,
  getFaceMediaReadUrl,
  getStoryWorkspace,
  getStudioWorkflow,
  latestFaceOutput,
  latestPendingReview,
  previewParticipantFace,
  pricingQuote,
  reviewStudioOutput,
  syncParticipantFace,
  type FacePricingPreview,
  type FaceSyncResult,
  type StoryWorkspaceView,
  type StudioStageView,
  type StudioWorkflowView,
} from "./api/multiPersonFace";

type Props = { storyId: string };
type StageMap<T> = Record<string, T>;

function errorMessage(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string") return detail.replace(/_/g, " ");
  if (typeof detail?.message === "string") return detail.message;
  if (typeof error?.message === "string") return error.message;
  return "Something went wrong";
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function participantMeta(participant: any) {
  const persona = participant?.persona ?? {};
  const gender = clean(
    persona.gender ?? persona.gender_presentation ?? persona.sex ?? persona.voice_gender
  );
  const age = clean(persona.age ?? persona.age_presentation ?? persona.age_range);
  return [gender ? humanState(gender) : "", age ? `${age}${/^\d+$/.test(age) ? " yrs" : ""}` : ""]
    .filter(Boolean)
    .join(" • ");
}

function stageTone(state: string) {
  if (state === "approved") return "success" as const;
  if (state === "awaiting_review") return "accent" as const;
  if (state === "failed" || state === "rejected") return "danger" as const;
  return "neutral" as const;
}

function shortStatus(stage: StudioStageView) {
  switch (stage.state) {
    case "approved": return "Identity locked";
    case "awaiting_review": return "Review generated identity";
    case "generating": return "Creating identity…";
    case "failed": return "Generation failed — retry this character only";
    case "rejected": return "Ready for a new priced generation";
    default: return "Ready for pricing";
  }
}

export default function MultiPersonFaceCohortDenseScreen({ storyId }: Props) {
  const viewport = useStudioViewport();
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [previews, setPreviews] = useState<StageMap<FacePricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<FaceSyncResult>>({});
  const [mediaUrls, setMediaUrls] = useState<StageMap<string>>({});
  const [busy, setBusy] = useState<StageMap<boolean>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const hydrateMedia = useCallback(async (nextWorkflow: StudioWorkflowView) => {
    const candidates = faceStages(nextWorkflow)
      .map((stage) => ({ stage, output: latestFaceOutput(stage) }))
      .filter((item) => Boolean(item.output?.media_id));
    if (!candidates.length) return;
    const settled = await Promise.allSettled(
      candidates.map((item) => getFaceMediaReadUrl(String(item.output?.media_id)))
    );
    if (!mounted.current) return;
    const patch: StageMap<string> = {};
    settled.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.read_url) {
        patch[candidates[index].stage.stage_run_id] = result.value.read_url;
      }
    });
    setMediaUrls((current) => ({ ...current, ...patch }));
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!storyId) return;
    if (!quiet) setLoading(true);
    try {
      const [nextWorkspace, initialWorkflow] = await Promise.all([
        getStoryWorkspace(storyId),
        ensureStoryStudioWorkflow(storyId),
      ]);
      let latestWorkflow = initialWorkflow;
      const recoverable = faceStages(initialWorkflow).filter((stage) =>
        ["generating", "awaiting_review", "approved"].includes(stage.state) ||
        Boolean(stage.metadata?.compatibility_face_job_id)
      );
      if (recoverable.length) {
        const settled = await Promise.allSettled(
          recoverable.map((stage) => syncParticipantFace(initialWorkflow.workflow_id, stage.stage_run_id))
        );
        const recovered: StageMap<FaceSyncResult> = {};
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") {
            recovered[recoverable[index].stage_run_id] = result.value;
            latestWorkflow = result.value.workflow || latestWorkflow;
          }
        });
        if (mounted.current) setSyncs((current) => ({ ...current, ...recovered }));
      }
      if (!mounted.current) return;
      setWorkspace(nextWorkspace);
      setWorkflow(latestWorkflow);
      await hydrateMedia(latestWorkflow);
    } catch (error) {
      Alert.alert("Face Studio", errorMessage(error));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [hydrateMedia, storyId]);

  useEffect(() => { void load(); }, [load]);

  const stages = useMemo(() => faceStages(workflow), [workflow]);
  const cohort = useMemo(() => faceCohort(workflow), [workflow]);
  const participantById = useMemo(
    () => new Map((workspace?.participants ?? []).map((p) => [p.participant_id, p])),
    [workspace]
  );

  const syncStage = useCallback(async (stage: StudioStageView, quiet = false) => {
    if (!workflow) return;
    if (!quiet) setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    try {
      const result = await syncParticipantFace(workflow.workflow_id, stage.stage_run_id);
      if (!mounted.current) return;
      setSyncs((c) => ({ ...c, [stage.stage_run_id]: result }));
      setWorkflow(result.workflow);
      if (result.image_url) {
        setMediaUrls((c) => ({ ...c, [stage.stage_run_id]: String(result.image_url) }));
      } else {
        await hydrateMedia(result.workflow);
      }
    } catch (error) {
      if (!quiet) Alert.alert("Face Studio", errorMessage(error));
    } finally {
      if (mounted.current && !quiet) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [hydrateMedia, workflow]);

  useEffect(() => {
    if (!workflow) return;
    const generating = faceStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(() => generating.forEach((stage) => void syncStage(stage, true)), 2600);
    return () => clearInterval(timer);
  }, [syncStage, workflow]);

  const checkPrice = useCallback(async (stage: StudioStageView) => {
    if (!workflow) return;
    setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    try {
      const preview = await previewParticipantFace(workflow.workflow_id, stage.stage_run_id);
      if (mounted.current) setPreviews((c) => ({ ...c, [stage.stage_run_id]: preview }));
    } catch (error) {
      Alert.alert("Face Studio", errorMessage(error));
    } finally {
      if (mounted.current) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [workflow]);

  const generate = useCallback(async (stage: StudioStageView) => {
    if (!workflow) return;
    const preview = previews[stage.stage_run_id];
    if (!preview) return void checkPrice(stage);
    setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    try {
      await dispatchParticipantFace(workflow.workflow_id, stage.stage_run_id, pricingQuote(preview));
      const next = await getStudioWorkflow(workflow.workflow_id);
      if (!mounted.current) return;
      setWorkflow(next);
      setPreviews((c) => {
        const copy = { ...c };
        delete copy[stage.stage_run_id];
        return copy;
      });
    } catch (error) {
      Alert.alert("Face Studio", errorMessage(error));
    } finally {
      if (mounted.current) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [checkPrice, previews, workflow]);

  const review = useCallback(async (
    stage: StudioStageView,
    decision: "approved" | "rejected" | "revise"
  ) => {
    if (!workflow) return;
    setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    try {
      const authoritative = await getStudioWorkflow(workflow.workflow_id);
      const current = faceStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id);
      const pending = latestPendingReview(current);
      if (!pending) {
        setWorkflow(authoritative);
        await hydrateMedia(authoritative);
        Alert.alert("Face Studio", "This review is no longer pending. The latest state has been loaded.");
        return;
      }
      const next = await reviewStudioOutput(pending.review_item_id, decision);
      if (!mounted.current) return;
      setWorkflow(next);
      await hydrateMedia(next);
      if (decision !== "approved") {
        setPreviews((c) => {
          const copy = { ...c };
          delete copy[stage.stage_run_id];
          return copy;
        });
      }
    } catch (error) {
      Alert.alert("Face Studio", errorMessage(error));
    } finally {
      if (mounted.current) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [hydrateMedia, workflow]);

  if (loading && !workflow) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={STUDIO.accent} />
          <Text style={styles.loading}>Preparing cast…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const required = cohort?.required_total ?? stages.length;
  const approved = cohort?.approved_total ?? stages.filter((s) => s.state === "approved").length;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            maxWidth: viewport.contentMaxWidth,
            paddingHorizontal: viewport.horizontalPadding,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={STUDIO.accent}
            onRefresh={() => { setRefreshing(true); void load(true); }}
          />
        }
      >
        <StudioHero
          eyebrow="STORY FACE STUDIO"
          title={workspace?.title || "Character cast"}
          subtitle="Create, review and lock the cast. Approved identities stay untouched while individual characters are revised."
          right={<ProgressLine current={approved} total={required} label="Cast" />}
        />

        <SectionLabel
          title="Face cast"
          meta={approved === required && required > 0 ? "Ready for Audio" : `${Math.max(0, required - approved)} remaining`}
        />

        {stages.map((stage, index) => {
          const participant = participantById.get(String(stage.participant_id || ""));
          const preview = previews[stage.stage_run_id];
          const synced = syncs[stage.stage_run_id];
          const imageUrl = synced?.image_url || mediaUrls[stage.stage_run_id] || "";
          const isBusy = Boolean(busy[stage.stage_run_id]);
          const canReview = stage.state === "awaiting_review" && Boolean(latestPendingReview(stage));
          const canPrice = ["pending", "ready", "failed", "rejected"].includes(stage.state);
          const prompt = clean(preview?.studio_input?.user_prompt || synced?.prompt_used);
          const attempt = synced?.attempt_no || stage.metadata?.face_attempt_count;

          return (
            <Surface key={stage.stage_run_id} accent={stage.state === "approved"} style={styles.characterCard}>
              <View style={styles.characterRow}>
                <View
                  style={[
                    styles.mediaBox,
                    { width: viewport.mediaSize, height: Math.round(viewport.mediaSize * 1.18) },
                  ]}
                >
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
                  ) : (
                    <View style={styles.placeholder}>
                      {stage.state === "generating" ? <ActivityIndicator color={STUDIO.accent} /> : null}
                      <Text style={styles.placeholderIndex}>{index + 1}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.details}>
                  <View style={styles.nameRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.name} numberOfLines={1}>{participant?.display_name || `Character ${index + 1}`}</Text>
                      <Text style={styles.meta} numberOfLines={1}>{participantMeta(participant) || "Character identity"}</Text>
                    </View>
                    <StatusPill value={humanState(stage.state)} tone={stageTone(stage.state)} />
                  </View>

                  <Text style={styles.status} numberOfLines={2}>{shortStatus(stage)}</Text>

                  {preview ? (
                    <View style={styles.priceLine}>
                      <Text style={styles.priceLabel}>Price</Text>
                      <Text style={styles.priceValue}>{displayPrice(preview)}</Text>
                    </View>
                  ) : null}

                  {prompt ? (
                    <View style={styles.promptLine}>
                      <Text style={styles.promptLabel}>Director prompt</Text>
                      <Text style={styles.promptText} numberOfLines={viewport.compact ? 2 : 3}>{prompt}</Text>
                    </View>
                  ) : null}

                  {attempt ? <Text style={styles.attempt}>Attempt {String(attempt)}</Text> : null}
                </View>

                <View style={[styles.actionRail, { width: viewport.actionWidth }]}>
                  {isBusy ? <ActivityIndicator size="small" color={STUDIO.accent} /> : null}

                  {canPrice && !preview ? (
                    <CompactButton
                      label={stage.state === "failed" ? "Retry price" : stage.state === "rejected" ? "Regen price" : "Check price"}
                      onPress={() => void checkPrice(stage)}
                      disabled={isBusy}
                      fill
                    />
                  ) : null}

                  {canPrice && preview ? (
                    <>
                      <CompactButton
                        label={stage.state === "failed" ? "Retry" : stage.state === "rejected" ? "Regenerate" : "Generate"}
                        onPress={() => void generate(stage)}
                        disabled={isBusy}
                        tone="primary"
                        fill
                      />
                      <CompactButton label="Reprice" onPress={() => void checkPrice(stage)} disabled={isBusy} fill />
                    </>
                  ) : null}

                  {canReview ? (
                    <>
                      <CompactButton label="Approve" onPress={() => void review(stage, "approved")} disabled={isBusy} tone="primary" fill />
                      <CompactButton
                        label="Revise"
                        onPress={() => Alert.alert(
                          "Revise this Face?",
                          "Only this character will return to generation. Approved cast members remain locked.",
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Revise", onPress: () => void review(stage, "revise") },
                          ]
                        )}
                        disabled={isBusy}
                        fill
                      />
                      <CompactButton
                        label="Reject"
                        onPress={() => Alert.alert(
                          "Reject this Face?",
                          "This generated output remains charged and auditable. Only this character will require replacement.",
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Reject", style: "destructive", onPress: () => void review(stage, "rejected") },
                          ]
                        )}
                        disabled={isBusy}
                        tone="danger"
                        fill
                      />
                    </>
                  ) : null}

                  {stage.state === "generating" ? (
                    <CompactButton label="Refresh" onPress={() => void syncStage(stage)} disabled={isBusy} fill />
                  ) : null}

                  {stage.state === "approved" ? <StatusPill value="LOCKED" tone="success" /> : null}
                </View>
              </View>
            </Surface>
          );
        })}

        <Divider />
        <View style={styles.footerRow}>
          <Text style={styles.footerTitle}>{approved === required && required > 0 ? "Face cast complete" : "Face cast in progress"}</Text>
          <Text style={styles.footerMeta}>{approved}/{required} approved</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: STUDIO.bg },
  content: {
    width: "100%",
    alignSelf: "center",
    paddingTop: 10,
    paddingBottom: 44,
    gap: 10,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loading: { color: STUDIO.muted, fontSize: 12, fontWeight: "700" },
  characterCard: { padding: 10 },
  characterRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  mediaBox: {
    flexShrink: 0,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#1A1D26",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  image: { width: "100%", height: "100%" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 7 },
  placeholderIndex: { color: STUDIO.faint, fontSize: 18, fontWeight: "900" },
  details: { flex: 1, minWidth: 0, justifyContent: "center", gap: 6 },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  name: { color: STUDIO.text, fontSize: 16, fontWeight: "900", letterSpacing: -0.2 },
  meta: { color: STUDIO.accentText, fontSize: 10, fontWeight: "800", marginTop: 2 },
  status: { color: STUDIO.muted, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  priceLine: { flexDirection: "row", alignItems: "baseline", gap: 7 },
  priceLabel: { color: STUDIO.faint, fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  priceValue: { color: STUDIO.text, fontSize: 12, fontWeight: "900" },
  promptLine: { gap: 2 },
  promptLabel: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.4 },
  promptText: { color: "rgba(255,255,255,0.60)", fontSize: 9, lineHeight: 13 },
  attempt: { color: STUDIO.faint, fontSize: 8, fontWeight: "800" },
  actionRail: { flexShrink: 0, justifyContent: "center", gap: 6 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 2 },
  footerTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  footerMeta: { color: STUDIO.muted, fontSize: 10, fontWeight: "800" },
});
