import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  dispatchParticipantFace,
  displayPrice,
  ensureStoryStudioWorkflow,
  faceCohort,
  faceStages,
  FacePricingPreview,
  FaceSyncResult,
  getStoryWorkspace,
  getStudioWorkflow,
  latestPendingReview,
  previewParticipantFace,
  pricingQuote,
  reviewStudioOutput,
  StudioStageView,
  StudioWorkflowView,
  StoryWorkspaceView,
  syncParticipantFace,
} from "./api/multiPersonFace";

type Props = {
  storyId: string;
};

type StageMap<T> = Record<string, T>;

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

function statusCopy(stage: StudioStageView) {
  switch (stage.state) {
    case "approved":
      return "Approved and locked for this cast.";
    case "awaiting_review":
      return "Generation succeeded. Review this face before the cast can advance.";
    case "generating":
      return "Generating this character now…";
    case "failed":
      return "This attempt failed. Retry only this character; approved cast members stay locked.";
    case "rejected":
      return "The previous successful output was not selected. Regeneration is a new billable output.";
    default:
      return "Ready for a Face Studio pricing preview.";
  }
}

function actionLabel(stage: StudioStageView, preview?: FacePricingPreview | null) {
  const price = preview ? displayPrice(preview) : "";
  if (!preview) {
    if (stage.state === "failed") return "Check retry price";
    if (stage.state === "rejected") return "Check regenerate price";
    return "Check price";
  }
  if (stage.state === "failed") return `Retry • ${price}`;
  if (stage.state === "rejected") return `Regenerate • ${price}`;
  return `Generate Face • ${price}`;
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
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        danger && styles.buttonDanger,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

export default function MultiPersonFaceCohortScreen({ storyId }: Props) {
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [previews, setPreviews] = useState<StageMap<FacePricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<FaceSyncResult>>({});
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

  const load = useCallback(async (quiet = false) => {
    if (!storyId) return;
    if (!quiet) setLoading(true);
    try {
      const [nextWorkspace, nextWorkflow] = await Promise.all([
        getStoryWorkspace(storyId),
        ensureStoryStudioWorkflow(storyId),
      ]);
      if (!mounted.current) return;
      setWorkspace(nextWorkspace);
      setWorkflow(nextWorkflow);

      // Recover image/status state after screen reload without replaying generation.
      const recoverable = faceStages(nextWorkflow).filter(
        (stage) => Boolean(stage.metadata?.compatibility_face_job_id)
      );
      if (recoverable.length) {
        const settled = await Promise.allSettled(
          recoverable.map((stage) => syncParticipantFace(nextWorkflow.workflow_id, stage.stage_run_id))
        );
        if (!mounted.current) return;
        let latestWorkflow = nextWorkflow;
        const recovered: StageMap<FaceSyncResult> = {};
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") {
            recovered[recoverable[index].stage_run_id] = result.value;
            latestWorkflow = result.value.workflow || latestWorkflow;
          }
        });
        setSyncs((current) => ({ ...current, ...recovered }));
        setWorkflow(latestWorkflow);
      }
    } catch (error) {
      Alert.alert("Face Studio", errorMessage(error));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [storyId]);

  useEffect(() => {
    load();
  }, [load]);

  const stages = useMemo(() => faceStages(workflow), [workflow]);
  const cohort = useMemo(() => faceCohort(workflow), [workflow]);
  const participantById = useMemo(
    () =>
      new Map(
        (workspace?.participants ?? []).map((participant) => [participant.participant_id, participant])
      ),
    [workspace]
  );

  const syncStage = useCallback(
    async (stage: StudioStageView, quiet = false) => {
      if (!workflow) return;
      if (!quiet) setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const result = await syncParticipantFace(workflow.workflow_id, stage.stage_run_id);
        if (!mounted.current) return;
        setSyncs((current) => ({ ...current, [stage.stage_run_id]: result }));
        setWorkflow(result.workflow);
      } catch (error) {
        if (!quiet) Alert.alert("Face Studio", errorMessage(error));
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
    const generating = faceStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(() => {
      generating.forEach((stage) => {
        void syncStage(stage, true);
      });
    }, 2500);
    return () => clearInterval(timer);
  }, [workflow, syncStage]);

  const checkPrice = useCallback(
    async (stage: StudioStageView) => {
      if (!workflow) return;
      setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const preview = await previewParticipantFace(workflow.workflow_id, stage.stage_run_id);
        if (!mounted.current) return;
        setPreviews((current) => ({ ...current, [stage.stage_run_id]: preview }));
      } catch (error) {
        Alert.alert("Face Studio", errorMessage(error));
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
      setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const quote = pricingQuote(preview);
        await dispatchParticipantFace(workflow.workflow_id, stage.stage_run_id, quote);
        const next = await getStudioWorkflow(workflow.workflow_id);
        if (!mounted.current) return;
        setWorkflow(next);
        setPreviews((current) => {
          const copy = { ...current };
          delete copy[stage.stage_run_id];
          return copy;
        });
      } catch (error) {
        Alert.alert("Face Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
        }
      }
    },
    [workflow, previews, checkPrice]
  );

  const review = useCallback(
    async (stage: StudioStageView, decision: "approved" | "rejected" | "revise") => {
      const pending = latestPendingReview(stage);
      if (!pending) {
        Alert.alert("Face Studio", "No pending Face review was found for this character.");
        return;
      }
      setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        const next = await reviewStudioOutput(pending.review_item_id, decision);
        if (!mounted.current) return;
        setWorkflow(next);
        if (decision !== "approved") {
          setPreviews((current) => {
            const copy = { ...current };
            delete copy[stage.stage_run_id];
            return copy;
          });
        }
      } catch (error) {
        Alert.alert("Face Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
        }
      }
    },
    []
  );

  if (loading && !workflow) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Preparing Face cast…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const required = cohort?.required_total ?? stages.length;
  const approved = cohort?.approved_total ?? stages.filter((stage) => stage.state === "approved").length;
  const castReady = Boolean(cohort?.satisfied && required > 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        <Text style={styles.eyebrow}>STORY FACE STUDIO</Text>
        <Text style={styles.title}>{workspace?.title || "Character cast"}</Text>
        <Text style={styles.subtitle}>
          Generate and approve every required character identity before Audio Studio can begin.
        </Text>

        <View style={[styles.cohortCard, castReady && styles.cohortReady]}>
          <View style={styles.cohortHeader}>
            <Text style={styles.cohortTitle}>Face cast</Text>
            <Text style={styles.cohortCount}>{approved}/{required} approved</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${required ? Math.min(100, (approved / required) * 100) : 0}%` },
              ]}
            />
          </View>
          <Text style={styles.cohortBody}>
            {castReady
              ? "Cast locked. Every required Face is approved; Audio is now eligible."
              : "Audio is locked. Successful Faces remain preserved and billable, but no participant advances until the complete cast is approved."}
          </Text>
          {!castReady && cohort ? (
            <Text style={styles.cohortMeta}>
              {cohort.awaiting_review_total} awaiting review • {cohort.generating_total} generating • {cohort.failed_total} failed • {cohort.rejected_total} rejected
            </Text>
          ) : null}
        </View>

        {stages.map((stage) => {
          const participant = participantById.get(String(stage.participant_id || ""));
          const name = participant?.display_name || "Character";
          const preview = previews[stage.stage_run_id];
          const synced = syncs[stage.stage_run_id];
          const imageUrl = synced?.image_url || null;
          const pendingReview = latestPendingReview(stage);
          const isBusy = Boolean(busy[stage.stage_run_id]);
          const canPrice = ["pending", "ready", "failed", "rejected"].includes(stage.state);
          const canReview = stage.state === "awaiting_review" && Boolean(pendingReview);
          const locked = stage.state === "approved";

          return (
            <View key={stage.stage_run_id} style={[styles.characterCard, locked && styles.characterLocked]}>
              <View style={styles.characterHeader}>
                <View style={styles.characterHeaderText}>
                  <Text style={styles.characterName}>{name}</Text>
                  <Text style={styles.characterState}>{humanState(stage.state)}</Text>
                </View>
                {locked ? <Text style={styles.lockBadge}>LOCKED</Text> : null}
              </View>

              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.faceImage} resizeMode="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  {stage.state === "generating" ? <ActivityIndicator size="large" /> : null}
                  <Text style={styles.placeholderText}>
                    {stage.state === "generating" ? "Creating identity…" : "Face candidate will appear here"}
                  </Text>
                </View>
              )}

              <Text style={styles.statusText}>{statusCopy(stage)}</Text>

              {preview?.studio_input?.user_prompt ? (
                <View style={styles.promptBox}>
                  <Text style={styles.promptLabel}>Director → Face prompt</Text>
                  <Text style={styles.promptText} numberOfLines={8}>
                    {String(preview.studio_input.user_prompt)}
                  </Text>
                </View>
              ) : synced?.prompt_used ? (
                <View style={styles.promptBox}>
                  <Text style={styles.promptLabel}>Face prompt used</Text>
                  <Text style={styles.promptText} numberOfLines={8}>
                    {String(synced.prompt_used)}
                  </Text>
                </View>
              ) : null}

              {synced?.attempt_no ? (
                <Text style={styles.attemptText}>
                  Attempt {synced.attempt_no} • {humanState(synced.attempt_kind)}
                </Text>
              ) : null}

              {canPrice ? (
                <View style={styles.actions}>
                  {!preview ? (
                    <Button
                      label={actionLabel(stage)}
                      onPress={() => void checkPrice(stage)}
                      disabled={isBusy}
                      secondary
                    />
                  ) : (
                    <>
                      <Button
                        label={actionLabel(stage, preview)}
                        onPress={() => void dispatch(stage)}
                        disabled={isBusy}
                      />
                      <Button
                        label="Refresh price"
                        onPress={() => void checkPrice(stage)}
                        disabled={isBusy}
                        secondary
                      />
                    </>
                  )}
                </View>
              ) : null}

              {canReview ? (
                <View style={styles.reviewBlock}>
                  <Text style={styles.reviewTitle}>Human review required</Text>
                  <Text style={styles.reviewBody}>
                    Approval locks this identity. Reject or revise keeps the rest of the approved cast untouched.
                  </Text>
                  <View style={styles.actions}>
                    <Button
                      label="Approve & lock"
                      onPress={() => void review(stage, "approved")}
                      disabled={isBusy}
                    />
                    <Button
                      label="Revise"
                      onPress={() => void review(stage, "revise")}
                      disabled={isBusy}
                      secondary
                    />
                    <Button
                      label="Reject"
                      onPress={() =>
                        Alert.alert(
                          "Reject this Face?",
                          "The successful generation remains charged and auditable. Only this character will need a new generation.",
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Reject",
                              style: "destructive",
                              onPress: () => void review(stage, "rejected"),
                            },
                          ]
                        )
                      }
                      disabled={isBusy}
                      danger
                    />
                  </View>
                </View>
              ) : null}

              {stage.state === "generating" ? (
                <Button
                  label="Refresh status"
                  onPress={() => void syncStage(stage)}
                  disabled={isBusy}
                  secondary
                />
              ) : null}
            </View>
          );
        })}

        <View style={styles.footerGate}>
          <Text style={styles.footerGateTitle}>{castReady ? "Face Studio complete" : "Face Studio is not complete"}</Text>
          <Text style={styles.footerGateBody}>
            {castReady
              ? "All required identities are approved and locked. The workflow may now move to Audio Studio."
              : `Audio remains blocked until ${required - approved} more required Face${required - approved === 1 ? " is" : "s are"} approved.`}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#07080B" },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { color: "rgba(255,255,255,0.76)", fontSize: 15, fontWeight: "700" },
  eyebrow: { color: "#D2B07A", fontSize: 12, fontWeight: "900", letterSpacing: 1.8 },
  title: { color: "#FFFFFF", fontSize: 30, fontWeight: "900", letterSpacing: -0.6 },
  subtitle: { color: "rgba(255,255,255,0.68)", fontSize: 15, lineHeight: 22, maxWidth: 620 },
  cohortCard: {
    backgroundColor: "#14161C",
    borderWidth: 1,
    borderColor: "rgba(210,176,122,0.28)",
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  cohortReady: { borderColor: "rgba(255,255,255,0.34)" },
  cohortHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  cohortTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  cohortCount: { color: "#D2B07A", fontSize: 14, fontWeight: "900" },
  progressTrack: { height: 7, backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 99, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#D2B07A", borderRadius: 99 },
  cohortBody: { color: "rgba(255,255,255,0.82)", fontSize: 14, lineHeight: 21, fontWeight: "650" },
  cohortMeta: { color: "rgba(255,255,255,0.52)", fontSize: 12, fontWeight: "700" },
  characterCard: {
    backgroundColor: "#101218",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 13,
  },
  characterLocked: { borderColor: "rgba(210,176,122,0.55)" },
  characterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  characterHeaderText: { flex: 1 },
  characterName: { color: "#FFFFFF", fontSize: 21, fontWeight: "900" },
  characterState: { color: "rgba(255,255,255,0.56)", fontSize: 12, fontWeight: "800", marginTop: 3 },
  lockBadge: { color: "#201708", backgroundColor: "#D2B07A", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, fontSize: 10, fontWeight: "900" },
  faceImage: { width: "100%", aspectRatio: 3 / 4, borderRadius: 18, backgroundColor: "#1C1F27" },
  imagePlaceholder: { width: "100%", aspectRatio: 3 / 4, borderRadius: 18, backgroundColor: "#191B22", alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  placeholderText: { color: "rgba(255,255,255,0.48)", fontSize: 13, textAlign: "center", fontWeight: "700" },
  statusText: { color: "rgba(255,255,255,0.78)", fontSize: 14, lineHeight: 21, fontWeight: "650" },
  promptBox: { backgroundColor: "#090A0E", borderRadius: 14, padding: 13, gap: 7, borderWidth: 1, borderColor: "rgba(255,255,255,0.06)" },
  promptLabel: { color: "#D2B07A", fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  promptText: { color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 18 },
  attemptText: { color: "rgba(255,255,255,0.48)", fontSize: 11, fontWeight: "800" },
  actions: { gap: 9 },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: "#D2B07A", alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.20)" },
  buttonDanger: { backgroundColor: "#5D2227" },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: "#211708", fontSize: 14, fontWeight: "900" },
  buttonTextSecondary: { color: "#FFFFFF" },
  reviewBlock: { backgroundColor: "rgba(210,176,122,0.08)", borderRadius: 16, padding: 14, gap: 9 },
  reviewTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  reviewBody: { color: "rgba(255,255,255,0.66)", fontSize: 13, lineHeight: 19 },
  footerGate: { marginTop: 4, borderRadius: 18, padding: 18, backgroundColor: "#14161C", gap: 6 },
  footerGateTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "900" },
  footerGateBody: { color: "rgba(255,255,255,0.66)", fontSize: 13, lineHeight: 20 },
});
