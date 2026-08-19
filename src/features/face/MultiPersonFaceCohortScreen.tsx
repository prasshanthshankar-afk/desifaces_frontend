import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { DF } from "../../core/theme/colors";

import {
  dispatchParticipantFace,
  displayPrice,
  ensureStoryStudioWorkflow,
  faceCohort,
  FacePricingPreview,
  faceStages,
  FaceSyncResult,
  getFaceMediaReadUrl,
  getStoryWorkspace,
  getStudioWorkflow,
  latestFaceOutput,
  latestPendingReview,
  previewParticipantFace,
  pricingQuote,
  reviewStudioOutput,
  StoryWorkspaceView,
  StudioStageView,
  StudioWorkflowView,
  syncParticipantFace,
} from "./api/multiPersonFace";

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
  danger: "#7A2E35",
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

export default function MultiPersonFaceCohortScreen({ storyId }: Props) {
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
    return () => {
      mounted.current = false;
    };
  }, []);

  const hydrateMediaUrls = useCallback(async (nextWorkflow: StudioWorkflowView) => {
    const candidates = faceStages(nextWorkflow)
      .map((stage) => ({ stage, output: latestFaceOutput(stage) }))
      .filter((item) => Boolean(item.output?.media_id));
    if (!candidates.length) return;

    const settled = await Promise.allSettled(
      candidates.map((item) => getFaceMediaReadUrl(String(item.output?.media_id)))
    );
    if (!mounted.current) return;
    const next: StageMap<string> = {};
    settled.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.read_url) {
        next[candidates[index].stage.stage_run_id] = result.value.read_url;
      }
    });
    setMediaUrls((current) => ({ ...current, ...next }));
  }, []);

  const load = useCallback(
    async (quiet = false) => {
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

        const recoverable = faceStages(nextWorkflow).filter((stage) =>
          Boolean(stage.metadata?.compatibility_face_job_id)
        );
        let latestWorkflow = nextWorkflow;
        if (recoverable.length) {
          const settled = await Promise.allSettled(
            recoverable.map((stage) =>
              syncParticipantFace(nextWorkflow.workflow_id, stage.stage_run_id)
            )
          );
          if (!mounted.current) return;
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
        await hydrateMediaUrls(latestWorkflow);
      } catch (error) {
        Alert.alert("Face Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [storyId, hydrateMediaUrls]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const stages = useMemo(() => faceStages(workflow), [workflow]);
  const cohort = useMemo(() => faceCohort(workflow), [workflow]);
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
        const result = await syncParticipantFace(workflow.workflow_id, stage.stage_run_id);
        if (!mounted.current) return;
        setSyncs((current) => ({ ...current, [stage.stage_run_id]: result }));
        setWorkflow(result.workflow);
        if (result.image_url) {
          setMediaUrls((current) => ({ ...current, [stage.stage_run_id]: String(result.image_url) }));
        } else {
          await hydrateMediaUrls(result.workflow);
        }
      } catch (error) {
        if (!quiet) Alert.alert("Face Studio", errorMessage(error));
      } finally {
        if (mounted.current && !quiet) {
          setBusy((current) => ({ ...current, [stage.stage_run_id]: false }));
        }
      }
    },
    [workflow, hydrateMediaUrls]
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
      if (!workflow) return;

      setBusy((current) => ({ ...current, [stage.stage_run_id]: true }));
      try {
        // Re-read the workflow immediately before the review mutation. This avoids
        // submitting a stale review_item_id when background sync/polling has updated
        // the stage between render and tap.
        const authoritative = await getStudioWorkflow(workflow.workflow_id);
        if (!mounted.current) return;

        const currentStage =
          faceStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id) ?? null;
        const pending = latestPendingReview(currentStage);

        if (!pending) {
          setWorkflow(authoritative);
          await hydrateMediaUrls(authoritative);
          Alert.alert(
            "Face Studio",
            "This Face review is no longer pending. The latest workflow state has been refreshed."
          );
          return;
        }

        const next = await reviewStudioOutput(pending.review_item_id, decision);
        if (!mounted.current) return;
        setWorkflow(next);
        await hydrateMediaUrls(next);

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
    [workflow, hydrateMediaUrls]
  );

  if (loading && !workflow) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND.accent} />
          <Text style={styles.loadingText}>Preparing Face cast…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const required = cohort?.required_total ?? stages.length;
  const approved =
    cohort?.approved_total ?? stages.filter((stage) => stage.state === "approved").length;
  const castReady = Boolean(cohort?.satisfied && required > 0);
  const progress = required ? Math.min(100, (approved / required) * 100) : 0;

  return (
    <SafeAreaView style={styles.safe}>
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
            <Text style={styles.eyebrow}>STORY FACE STUDIO</Text>
          </View>
          <Text style={styles.title}>{workspace?.title || "Character cast"}</Text>
          <Text style={styles.subtitle}>
            Create, review and lock every character identity before the story advances to Audio Studio.
          </Text>
        </View>

        <View style={[styles.cohortCard, castReady && styles.cohortReady]}>
          <View style={styles.cohortHeader}>
            <Text style={styles.cohortTitle}>Face cast</Text>
            <Text style={styles.cohortCount}>
              {approved}/{required} approved
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
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
          const imageUrl = synced?.image_url || mediaUrls[stage.stage_run_id] || null;
          const pendingReview = latestPendingReview(stage);
          const isBusy = Boolean(busy[stage.stage_run_id]);
          const canPrice = ["pending", "ready", "failed", "rejected"].includes(stage.state);
          const canReview = stage.state === "awaiting_review" && Boolean(pendingReview);
          const locked = stage.state === "approved";

          return (
            <View
              key={stage.stage_run_id}
              style={[styles.characterCard, locked && styles.characterLocked]}
            >
              <View style={styles.characterHeader}>
                <View style={styles.characterHeaderText}>
                  <Text style={styles.characterName}>{name}</Text>
                  <View
                    style={[
                      styles.statePill,
                      locked && styles.statePillApproved,
                      stage.state === "awaiting_review" && styles.statePillReview,
                      stage.state === "generating" && styles.statePillGenerating,
                    ]}
                  >
                    <Text style={styles.characterState}>{humanState(stage.state)}</Text>
                  </View>
                </View>
                {locked ? <Text style={styles.lockBadge}>LOCKED</Text> : null}
              </View>

              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.faceImage} resizeMode="cover" />
              ) : (
                <View style={styles.imagePlaceholder}>
                  {stage.state === "generating" ? <ActivityIndicator size="large" color={BRAND.accent} /> : null}
                  <Text style={styles.placeholderText}>
                    {stage.state === "generating"
                      ? "Creating identity…"
                      : "Face candidate will appear here"}
                  </Text>
                </View>
              )}

              <Text style={styles.statusText}>{statusCopy(stage)}</Text>

              {preview ? (
                <View style={styles.priceStrip}>
                  <View style={styles.priceStripText}>
                    <Text style={styles.priceStripLabel}>PRICE READY</Text>
                    <Text style={styles.priceStripValue}>{displayPrice(preview)}</Text>
                  </View>
                  {(preview.studio_input as any)?.gender ? (
                    <View style={styles.inputChip}>
                      <Text style={styles.inputChipText}>
                        {humanState(String((preview.studio_input as any).gender))}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

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
              ) : stage.metadata?.face_attempt_count ? (
                <Text style={styles.attemptText}>
                  Attempt {String(stage.metadata.face_attempt_count)} • {humanState(stage.metadata.face_attempt_kind)}
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
                    <View style={styles.reviewSecondaryRow}>
                      <View style={styles.reviewSecondaryAction}>
                        <Button
                          label="Revise"
                          onPress={() =>
                            Alert.alert(
                              "Revise this Face?",
                              "This keeps the rest of the cast untouched and prepares only this character for a new priced generation.",
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
                      <View style={styles.reviewSecondaryAction}>
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
          <Text style={styles.footerGateTitle}>
            {castReady ? "Face Studio complete" : "Face Studio is not complete"}
          </Text>
          <Text style={styles.footerGateBody}>
            {castReady
              ? "All required identities are approved and locked. The workflow may now move to Audio Studio."
              : `Audio remains blocked until ${required - approved} more required Face${
                  required - approved === 1 ? " is" : "s are"
                } approved.`}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingBottom: 48,
    gap: 14,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: BRAND.muted, fontSize: 13, fontWeight: "700" },

  hero: { gap: 8, paddingHorizontal: 2, marginBottom: 2 },
  eyebrowPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    backgroundColor: BRAND.accentFill,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eyebrow: {
    color: BRAND.accentText,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  title: { color: BRAND.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.35 },
  subtitle: { color: BRAND.muted, fontSize: 13, lineHeight: 19, maxWidth: 620, fontWeight: "600" },

  cohortCard: {
    backgroundColor: BRAND.surface,
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    borderRadius: 18,
    padding: 15,
    gap: 10,
  },
  cohortReady: { borderColor: "rgba(248,184,72,0.55)", backgroundColor: "rgba(232,152,56,0.08)" },
  cohortHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  cohortTitle: { color: BRAND.text, fontSize: 15, fontWeight: "900" },
  cohortCount: {
    color: BRAND.accentText,
    fontSize: 11,
    fontWeight: "900",
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    backgroundColor: BRAND.accentFill,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  progressTrack: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 99,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: BRAND.accent, borderRadius: 99 },
  cohortBody: { color: "rgba(255,255,255,0.82)", fontSize: 12, lineHeight: 18, fontWeight: "600" },
  cohortMeta: { color: BRAND.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" },

  characterCard: {
    backgroundColor: BRAND.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 12,
  },
  characterLocked: { borderColor: "rgba(248,184,72,0.46)" },
  characterHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  characterHeaderText: { flex: 1, gap: 7 },
  characterName: { color: BRAND.text, fontSize: 18, fontWeight: "900", letterSpacing: -0.2 },
  statePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  statePillApproved: { borderColor: BRAND.accentBorder, backgroundColor: BRAND.accentFill },
  statePillReview: { borderColor: "rgba(248,184,72,0.26)", backgroundColor: "rgba(232,152,56,0.08)" },
  statePillGenerating: { borderColor: "rgba(255,255,255,0.16)", backgroundColor: "rgba(255,255,255,0.06)" },
  characterState: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "900", letterSpacing: 0.35 },
  lockBadge: {
    color: "#211708",
    backgroundColor: BRAND.accent,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 9,
    fontWeight: "900",
    overflow: "hidden",
  },

  faceImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: "#1C1F27",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  imagePlaceholder: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 22,
  },
  placeholderText: { color: BRAND.muted, fontSize: 12, textAlign: "center", fontWeight: "700" },
  statusText: { color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 18, fontWeight: "600" },

  priceStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.accentBorder,
    backgroundColor: BRAND.accentFill,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  priceStripText: { flex: 1, gap: 2 },
  priceStripLabel: { color: BRAND.accentText, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  priceStripValue: { color: BRAND.text, fontSize: 14, fontWeight: "900" },
  inputChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.16)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  inputChipText: { color: "rgba(255,255,255,0.82)", fontSize: 10, fontWeight: "900" },

  promptBox: {
    backgroundColor: "rgba(8,8,8,0.52)",
    borderRadius: 14,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  promptLabel: { color: BRAND.accentText, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  promptText: { color: "rgba(255,255,255,0.64)", fontSize: 11, lineHeight: 17 },
  attemptText: { color: BRAND.muted, fontSize: 10, fontWeight: "800" },

  actions: { gap: 8 },
  button: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "rgba(232,152,56,0.22)",
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.40)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  buttonSecondary: { backgroundColor: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.12)" },
  buttonDanger: { backgroundColor: "rgba(122,46,53,0.42)", borderColor: "rgba(255,132,144,0.24)" },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  buttonText: { color: BRAND.text, fontSize: 12, fontWeight: "900" },
  buttonTextSecondary: { color: "rgba(255,255,255,0.90)" },
  buttonTextDanger: { color: "rgba(255,235,237,0.96)" },

  reviewBlock: {
    backgroundColor: "rgba(232,152,56,0.07)",
    borderRadius: 16,
    padding: 13,
    gap: 9,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.18)",
  },
  reviewTitle: { color: BRAND.text, fontSize: 13, fontWeight: "900" },
  reviewBody: { color: BRAND.muted, fontSize: 11, lineHeight: 17, fontWeight: "600" },
  reviewSecondaryRow: { flexDirection: "row", gap: 8 },
  reviewSecondaryAction: { flex: 1 },

  footerGate: {
    marginTop: 2,
    borderRadius: 18,
    padding: 15,
    backgroundColor: BRAND.surface,
    borderWidth: 1,
    borderColor: BRAND.border,
    gap: 5,
  },
  footerGateTitle: { color: BRAND.text, fontSize: 14, fontWeight: "900" },
  footerGateBody: { color: BRAND.muted, fontSize: 11, lineHeight: 17, fontWeight: "600" },
});