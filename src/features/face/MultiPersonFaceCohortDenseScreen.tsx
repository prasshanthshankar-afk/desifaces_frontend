import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
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
  getStudioProductionPreflight,
  setParticipantFaceProfile,
  userFacingStudioError,
  type StudioProductionPreflight,
} from "../../core/studio/productionExperience";
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

type Props = {
  storyId: string;
  onUseSavedFace?: (participantId: string) => void;
  reusedFaceUrls?: Record<string, string>;
};
type StageMap<T> = Record<string, T>;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function participantMeta(participant: any) {
  const persona = participant?.persona ?? {};
  const gender = clean(persona.gender ?? persona.gender_presentation ?? persona.sex);
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

function shortStatus(stage: StudioStageView, needsChoice: boolean) {
  if (needsChoice) return "One quick choice before creating a new Face";
  switch (stage.state) {
    case "approved": return "Identity locked";
    case "awaiting_review": return "Your Face is ready to review";
    case "generating": return "Creating this Face…";
    case "failed": return "Creation did not finish — retry only this character";
    case "rejected": return "Ready for a new version";
    default: return "Ready to check price";
  }
}

export default function MultiPersonFaceCohortDenseScreen({
  storyId,
  onUseSavedFace,
  reusedFaceUrls,
}: Props) {
  const viewport = useStudioViewport();
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [preflight, setPreflight] = useState<StudioProductionPreflight | null>(null);
  const [previews, setPreviews] = useState<StageMap<FacePricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<FaceSyncResult>>({});
  const [mediaUrls, setMediaUrls] = useState<StageMap<string>>({});
  const [busy, setBusy] = useState<StageMap<boolean>>({});
  const [message, setMessage] = useState("");
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
    setMessage("");
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
      const nextPreflight = await getStudioProductionPreflight(latestWorkflow.workflow_id);
      if (!mounted.current) return;
      setWorkspace(nextWorkspace);
      setWorkflow(latestWorkflow);
      setPreflight(nextPreflight);
      await hydrateMedia(latestWorkflow);
    } catch (error) {
      if (mounted.current) setMessage(userFacingStudioError(error));
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
  const preflightByParticipant = useMemo(
    () => new Map((preflight?.face?.items ?? []).map((item) => [item.participant_id, item])),
    [preflight]
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
      setPreflight(await getStudioProductionPreflight(workflow.workflow_id));
    } catch (error) {
      if (!quiet) setMessage(userFacingStudioError(error));
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

  const choosePresentation = useCallback(async (
    stage: StudioStageView,
    gender: "female" | "male"
  ) => {
    if (!workflow || !stage.participant_id) return;
    setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    setMessage("");
    try {
      const next = await setParticipantFaceProfile(
        workflow.workflow_id,
        String(stage.participant_id),
        gender
      );
      if (!mounted.current) return;
      setPreflight(next);
      setWorkspace(await getStoryWorkspace(storyId));
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [storyId, workflow]);

  const checkPrice = useCallback(async (stage: StudioStageView) => {
    if (!workflow) return;
    const ready = stage.participant_id
      ? preflightByParticipant.get(String(stage.participant_id))?.ready_for_pricing
      : false;
    if (!ready) {
      setMessage("Complete the one highlighted character choice, or use a saved Face, before checking price.");
      return;
    }
    setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    setMessage("");
    try {
      const preview = await previewParticipantFace(workflow.workflow_id, stage.stage_run_id);
      if (mounted.current) setPreviews((c) => ({ ...c, [stage.stage_run_id]: preview }));
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [preflightByParticipant, workflow]);

  const generate = useCallback(async (stage: StudioStageView) => {
    if (!workflow) return;
    const preview = previews[stage.stage_run_id];
    if (!preview) return void checkPrice(stage);
    setBusy((c) => ({ ...c, [stage.stage_run_id]: true }));
    setMessage("");
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
      setPreflight(await getStudioProductionPreflight(workflow.workflow_id));
    } catch (error) {
      setMessage(userFacingStudioError(error));
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
    setMessage("");
    try {
      const authoritative = await getStudioWorkflow(workflow.workflow_id);
      const current = faceStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id);
      const pending = latestPendingReview(current);
      if (!pending) {
        setWorkflow(authoritative);
        await hydrateMedia(authoritative);
        setMessage("The latest review state has been loaded.");
        return;
      }
      const next = await reviewStudioOutput(pending.review_item_id, decision);
      if (!mounted.current) return;
      setWorkflow(next);
      await hydrateMedia(next);
      setPreflight(await getStudioProductionPreflight(workflow.workflow_id));
      if (decision !== "approved") {
        setPreviews((c) => {
          const copy = { ...c };
          delete copy[stage.stage_run_id];
          return copy;
        });
      }
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setBusy((c) => ({ ...c, [stage.stage_run_id]: false }));
    }
  }, [hydrateMedia, workflow]);

  if (loading && !workflow) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={STUDIO.accent} />
          <Text style={styles.loading}>Preparing your cast…</Text>
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
          { maxWidth: viewport.contentMaxWidth, paddingHorizontal: viewport.horizontalPadding },
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
          subtitle="Reuse an identity you own or let desifaces prepare a new Face. You approve every character before anything moves forward."
          right={<ProgressLine current={approved} total={required} label="Cast" />}
        />

        {message ? (
          <Surface style={styles.messageBox} accent>
            <Text style={styles.messageText}>{message}</Text>
          </Surface>
        ) : null}

        <SectionLabel
          title="Your cast"
          meta={approved === required && required > 0 ? "Ready for Audio" : `${Math.max(0, required - approved)} to finish`}
        />

        {stages.map((stage, index) => {
          const participantId = String(stage.participant_id || "");
          const participant = participantById.get(participantId);
          const item = preflightByParticipant.get(participantId);
          const needsChoice = Boolean(item?.missing_fields?.includes("gender_presentation"));
          const preview = previews[stage.stage_run_id];
          const synced = syncs[stage.stage_run_id];
          const reusedImageUrl = clean(reusedFaceUrls?.[participantId]);
          const imageUrl = synced?.image_url || mediaUrls[stage.stage_run_id] || reusedImageUrl || "";
          const isBusy = Boolean(busy[stage.stage_run_id]);
          const canReview = stage.state === "awaiting_review" && Boolean(latestPendingReview(stage));
          const canPrice = ["pending", "ready", "failed", "rejected"].includes(stage.state) && Boolean(item?.ready_for_pricing);
          const prompt = clean(preview?.studio_input?.user_prompt || synced?.prompt_used);
          const attempt = synced?.attempt_no || stage.metadata?.face_attempt_count;

          return (
            <Surface key={stage.stage_run_id} accent={stage.state === "approved"} style={styles.characterCard}>
              <View style={styles.characterRow}>
                <View style={[styles.mediaBox, { width: viewport.mediaSize, height: Math.round(viewport.mediaSize * 1.18) }]}>
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
                      <Text style={styles.name} numberOfLines={2}>{participant?.display_name || `Character ${index + 1}`}</Text>
                      <Text style={styles.meta} numberOfLines={2}>{participantMeta(participant) || "Character identity"}</Text>
                    </View>
                    <StatusPill value={humanState(stage.state)} tone={stageTone(stage.state)} />
                  </View>

                  <Text style={styles.status} numberOfLines={2}>{shortStatus(stage, needsChoice)}</Text>

                  {needsChoice ? (
                    <View style={styles.choiceBox}>
                      <Text style={styles.choiceTitle}>How should this Face be presented?</Text>
                      <Text style={styles.choiceMeta}>This cannot be guessed from a name or story. Choose once, or reuse a saved Face.</Text>
                      <View style={styles.choiceRow}>
                        <Pressable
                          onPress={() => void choosePresentation(stage, "female")}
                          disabled={isBusy}
                          style={({ pressed }) => [styles.choiceButton, pressed && styles.pressed]}
                        >
                          <Text style={styles.choiceButtonText}>Female</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void choosePresentation(stage, "male")}
                          disabled={isBusy}
                          style={({ pressed }) => [styles.choiceButton, pressed && styles.pressed]}
                        >
                          <Text style={styles.choiceButtonText}>Male</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}

                  {preview ? (
                    <View style={styles.priceLine}>
                      <Text style={styles.priceLabel}>Price</Text>
                      <Text style={styles.priceValue}>{displayPrice(preview)}</Text>
                    </View>
                  ) : null}

                  {prompt ? (
                    <View style={styles.promptLine}>
                      <Text style={styles.promptLabel}>desifaces direction</Text>
                      <Text style={styles.promptText} numberOfLines={viewport.compact ? 2 : 3}>{prompt}</Text>
                    </View>
                  ) : null}

                  {attempt ? <Text style={styles.attempt}>Attempt {String(attempt)}</Text> : null}
                </View>

                <View style={[styles.actionRail, { width: viewport.actionWidth }]}>
                  {isBusy ? <ActivityIndicator size="small" color={STUDIO.accent} /> : null}

                  {stage.state !== "approved" && onUseSavedFace && participantId ? (
                    <CompactButton label="Saved Face" onPress={() => onUseSavedFace(participantId)} disabled={isBusy || stage.state === "generating"} fill />
                  ) : null}

                  {canPrice && !preview ? (
                    <CompactButton
                      label={stage.state === "failed" ? "Retry price" : stage.state === "rejected" ? "New version" : "Check price"}
                      onPress={() => void checkPrice(stage)}
                      disabled={isBusy}
                      fill
                    />
                  ) : null}

                  {canPrice && preview ? (
                    <>
                      <CompactButton
                        label={stage.state === "failed" ? "Retry" : stage.state === "rejected" ? "Generate" : "Generate"}
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
                      <CompactButton label="Revise" onPress={() => void review(stage, "revise")} disabled={isBusy} fill />
                      <CompactButton label="Reject" onPress={() => void review(stage, "rejected")} disabled={isBusy} tone="danger" fill />
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
          <Text style={styles.footerTitle}>{approved === required && required > 0 ? "Cast ready for Audio" : "Face cast in progress"}</Text>
          <Text style={styles.footerMeta}>{approved}/{required} approved</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: STUDIO.bg },
  content: { width: "100%", alignSelf: "center", paddingTop: 10, paddingBottom: 120, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loading: { color: STUDIO.muted, fontSize: 11, fontWeight: "700" },
  messageBox: { padding: 10 },
  messageText: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  characterCard: { padding: 10 },
  characterRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
  mediaBox: { flexShrink: 0, borderRadius: 13, overflow: "hidden", backgroundColor: STUDIO.surfaceSoft, borderWidth: 1, borderColor: STUDIO.border },
  image: { width: "100%", height: "100%" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6 },
  placeholderIndex: { color: STUDIO.faint, fontSize: 19, fontWeight: "900" },
  details: { flex: 1, minWidth: 0, justifyContent: "center", gap: 5 },
  nameRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  name: { color: STUDIO.text, fontSize: 15, lineHeight: 18, fontWeight: "900", letterSpacing: -0.15 },
  meta: { color: STUDIO.accentText, fontSize: 9, lineHeight: 12, fontWeight: "800", marginTop: 1 },
  status: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  choiceBox: { borderWidth: 1, borderColor: STUDIO.accentBorder, backgroundColor: STUDIO.accentFill, borderRadius: 10, padding: 8, gap: 5 },
  choiceTitle: { color: STUDIO.text, fontSize: 9, fontWeight: "900" },
  choiceMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "600" },
  choiceRow: { flexDirection: "row", gap: 6 },
  choiceButton: { flex: 1, minHeight: 30, borderWidth: 1, borderColor: STUDIO.border, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: STUDIO.surface },
  choiceButtonText: { color: STUDIO.text, fontSize: 9, fontWeight: "900" },
  priceLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  priceLabel: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", textTransform: "uppercase" },
  priceValue: { color: STUDIO.accentText, fontSize: 10, fontWeight: "900" },
  promptLine: { gap: 1 },
  promptLabel: { color: STUDIO.faint, fontSize: 7, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.4 },
  promptText: { color: STUDIO.muted, fontSize: 8, lineHeight: 12, fontWeight: "600" },
  attempt: { color: STUDIO.faint, fontSize: 8, fontWeight: "700" },
  actionRail: { flexShrink: 0, justifyContent: "center", gap: 6 },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 2 },
  footerTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  footerMeta: { color: STUDIO.muted, fontSize: 10, fontWeight: "800" },
  pressed: { opacity: 0.75 },
});