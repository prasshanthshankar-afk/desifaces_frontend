import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { STUDIO, useStudioViewport } from "../../core/studio/DenseStudioUI";
import {
  createDirectorRun,
  directorCritique,
  directorPlan,
  DirectorRunView,
  getDirectorRun,
  resumeDirectorRun,
} from "./api/multiPersonDirector";

function errorMessage(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string") return detail;
  if (typeof detail?.message === "string") return detail.message;
  if (typeof error?.message === "string") return error.message;
  return "Something went wrong";
}

function humanState(value?: string | null) {
  return String(value || "idle")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

const RUNNING_STATES = new Set([
  "queued",
  "running",
  "drafting",
  "retrieving",
  "planning",
  "critiquing",
  "approved",
  "compiling",
]);

export default function MultiPersonFaceDirectorScreen() {
  const viewport = useStudioViewport();
  const [brief, setBrief] = useState("");
  const [run, setRun] = useState<DirectorRunView | null>(null);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshRun = useCallback(async (current: DirectorRunView) => {
    const next = await getDirectorRun(current.thread_id);
    if (mounted.current) setRun(next);
    return next;
  }, []);

  useEffect(() => {
    if (!run || !RUNNING_STATES.has(run.state)) return;

    let cancelled = false;
    setPolling(true);
    const timer = setInterval(() => {
      void refreshRun(run).catch((error) => {
        if (!cancelled && mounted.current) {
          Alert.alert("Creative Director", errorMessage(error));
        }
      });
    }, 2400);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (mounted.current) setPolling(false);
    };
  }, [run, refreshRun]);

  const plan = useMemo(() => directorPlan(run), [run]);
  const critique = useMemo(() => directorCritique(run), [run]);
  const readyStoryId = run?.story_id || run?.workspace?.story_id || null;

  const submitBrief = useCallback(async () => {
    const text = brief.trim();
    if (!text) {
      Alert.alert("Multi-Person Face", "Describe the people and scene you want to create.");
      return;
    }

    setSubmitting(true);
    setRun(null);
    setFeedback("");
    try {
      const next = await createDirectorRun({
        text,
        locale: "en",
        desired_scene_count: 1,
        constraints: {
          workflow: "face_cast_first",
          human_review_required: true,
        },
      });
      if (mounted.current) setRun(next);
    } catch (error) {
      Alert.alert("Creative Director", errorMessage(error));
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }, [brief]);

  const review = useCallback(
    async (approved: boolean) => {
      if (!run) return;
      setSubmitting(true);
      try {
        const next = await resumeDirectorRun(run.thread_id, {
          approved,
          feedback: feedback.trim() || null,
        });
        if (mounted.current) {
          setRun(next);
          if (approved) setFeedback("");
        }
      } catch (error) {
        Alert.alert("Creative Director", errorMessage(error));
      } finally {
        if (mounted.current) setSubmitting(false);
      }
    },
    [run, feedback]
  );

  const openFaceCast = useCallback(() => {
    if (!readyStoryId) return;
    router.push({
      pathname: "/(tabs)/face/story/[storyId]",
      params: { storyId: readyStoryId },
    } as any);
  }, [readyStoryId]);

  const reset = useCallback(() => {
    setRun(null);
    setFeedback("");
  }, []);

  return (
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            maxWidth: viewport.contentMaxWidth,
            paddingHorizontal: viewport.horizontalPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>MULTI-PERSON FACE</Text>
        <Text style={styles.title}>Create the cast from your intent</Text>
        <Text style={styles.subtitle}>
          Describe the people and situation. The Creative Director will propose a structured story plan for your review before Face Studio generates anyone.
        </Text>

        {!run ? (
          <View style={styles.card}>
            <Text style={styles.label}>Creative brief</Text>
            <TextInput
              value={brief}
              onChangeText={setBrief}
              editable={!submitting}
              multiline
              textAlignVertical="top"
              placeholder="Example: Ananya, 35, and her father Ravi, 65, are in their Chennai ancestral home discussing how to reopen a community arts space. Create two distinct, natural, expressive characters."
              placeholderTextColor={STUDIO.faint}
              style={styles.input}
            />
            <Pressable
              onPress={submitBrief}
              disabled={submitting || !brief.trim()}
              style={({ pressed }) => [
                styles.primaryButton,
                (submitting || !brief.trim()) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#1c1208" />
              ) : (
                <Text style={styles.primaryText}>Ask Creative Director</Text>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.statusCard}>
              <View>
                <Text style={styles.statusLabel}>Director run</Text>
                <Text style={styles.statusValue}>{humanState(run.state)}</Text>
              </View>
              {(polling || RUNNING_STATES.has(run.state)) && (
                <ActivityIndicator color={STUDIO.accent} />
              )}
            </View>

            {run.errors?.length ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Director error</Text>
                {run.errors.map((item, index) => (
                  <Text key={`${index}-${item}`} style={styles.errorText}>
                    {item}
                  </Text>
                ))}
              </View>
            ) : null}

            {plan ? (
              <View style={styles.card}>
                <Text style={styles.planTitle}>{plan.title}</Text>
                {plan.logline ? <Text style={styles.planSummary}>{plan.logline}</Text> : null}
                {plan.summary ? <Text style={styles.planSummary}>{plan.summary}</Text> : null}

                <Text style={styles.sectionTitle}>Proposed cast</Text>
                {plan.participants.map((participant, index) => (
                  <View key={`${participant.display_name}-${index}`} style={styles.participantRow}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{index + 1}</Text>
                    </View>
                    <View style={styles.participantBody}>
                      <Text style={styles.participantName}>{participant.display_name}</Text>
                      {participant.role ? (
                        <Text style={styles.participantRole}>{participant.role}</Text>
                      ) : null}
                      {participant.visual_direction && Object.keys(participant.visual_direction).length ? (
                        <Text style={styles.participantDetail} numberOfLines={4}>
                          {Object.entries(participant.visual_direction)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(" • ")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}

                <Text style={styles.sectionTitle}>Scene plan</Text>
                {plan.scenes.map((scene) => (
                  <View key={scene.sequence} style={styles.sceneRow}>
                    <Text style={styles.sceneTitle}>
                      Scene {scene.sequence + 1}{scene.title ? ` • ${scene.title}` : ""}
                    </Text>
                    {scene.purpose ? <Text style={styles.sceneText}>{scene.purpose}</Text> : null}
                    {scene.participant_refs?.length ? (
                      <Text style={styles.sceneText}>Cast: {scene.participant_refs.join(", ")}</Text>
                    ) : null}
                  </View>
                ))}

                {critique ? (
                  <View style={styles.critiqueBox}>
                    <Text style={styles.critiqueTitle}>
                      Continuity critique • {critique.score}/100
                    </Text>
                    <Text style={styles.critiqueText}>
                      {critique.ready
                        ? "Ready for human review."
                        : "Director revised this plan before review."}
                    </Text>
                    {critique.safety_notes?.map((item, index) => (
                      <Text key={`s-${index}`} style={styles.critiqueText}>
                        • {item}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {run.state === "awaiting_review" ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Human review</Text>
                <Text style={styles.helper}>
                  Approve this Director plan to create the canonical Story and unlock the participant Face workflow. Or request a revision before any Face provider cost is incurred.
                </Text>
                <TextInput
                  value={feedback}
                  onChangeText={setFeedback}
                  multiline
                  textAlignVertical="top"
                  placeholder="Optional revision feedback"
                  placeholderTextColor={STUDIO.faint}
                  style={styles.feedbackInput}
                />
                <Pressable
                  onPress={() => void review(true)}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    submitting && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.primaryText}>Approve Director plan</Text>
                </Pressable>
                <Pressable
                  onPress={() => void review(false)}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    submitting && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.secondaryText}>Revise plan</Text>
                </Pressable>
              </View>
            ) : null}

            {run.state === "ready" && readyStoryId ? (
              <View style={styles.readyCard}>
                <Text style={styles.readyTitle}>Story ready for Face Studio</Text>
                <Text style={styles.readyText}>
                  {run.workspace?.participants?.length || plan?.participants?.length || 0} participant(s) are now canonical. Face generation still requires pricing confirmation and individual HITL approval.
                </Text>
                <Pressable
                  onPress={openFaceCast}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryText}>Open Face Cast</Text>
                </Pressable>
              </View>
            ) : null}

            {run.state === "failed" ? (
              <Pressable
                onPress={reset}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryText}>Start a new brief</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: STUDIO.bg },
  content: {
    width: "100%",
    alignSelf: "center",
    paddingTop: 12,
    paddingBottom: 42,
  },
  eyebrow: {
    color: STUDIO.accentText,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  title: {
    color: STUDIO.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    letterSpacing: -0.25,
    marginTop: 5,
  },
  subtitle: {
    color: STUDIO.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    marginTop: 5,
    marginBottom: 12,
    maxWidth: 720,
  },
  card: {
    backgroundColor: STUDIO.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: STUDIO.border,
    marginBottom: 10,
  },
  label: { color: STUDIO.text, fontSize: 12, fontWeight: "900", marginBottom: 7 },
  input: {
    minHeight: 144,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STUDIO.border,
    color: STUDIO.text,
    padding: 11,
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: STUDIO.surfaceSoft,
  },
  feedbackInput: {
    minHeight: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STUDIO.border,
    color: STUDIO.text,
    padding: 11,
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: STUDIO.surfaceSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: "rgba(248,184,72,0.18)",
    borderWidth: 1,
    borderColor: STUDIO.accentBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    paddingHorizontal: 12,
  },
  primaryText: { color: STUDIO.accentText, fontWeight: "900", fontSize: 11 },
  secondaryButton: {
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 12,
  },
  secondaryText: { color: STUDIO.text, fontWeight: "800", fontSize: 11 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: STUDIO.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: STUDIO.border,
    padding: 11,
    marginBottom: 10,
  },
  statusLabel: {
    color: STUDIO.muted,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statusValue: { color: STUDIO.text, fontSize: 14, fontWeight: "900", marginTop: 2 },
  planTitle: { color: STUDIO.text, fontSize: 17, lineHeight: 22, fontWeight: "900" },
  planSummary: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  sectionTitle: { color: STUDIO.text, fontSize: 13, fontWeight: "900", marginTop: 14, marginBottom: 7 },
  participantRow: {
    flexDirection: "row",
    marginBottom: 9,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: STUDIO.accentFill,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  badgeText: { color: STUDIO.accentText, fontSize: 10, fontWeight: "900" },
  participantBody: { flex: 1 },
  participantName: { color: STUDIO.text, fontWeight: "900", fontSize: 13 },
  participantRole: { color: STUDIO.accentText, fontSize: 10, fontWeight: "700", marginTop: 2 },
  participantDetail: { color: STUDIO.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },
  sceneRow: {
    backgroundColor: STUDIO.surfaceSoft,
    borderRadius: 11,
    padding: 9,
    marginBottom: 7,
  },
  sceneTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "800" },
  sceneText: { color: STUDIO.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  critiqueBox: {
    borderRadius: 11,
    backgroundColor: STUDIO.accentFill,
    borderWidth: 1,
    borderColor: STUDIO.accentBorder,
    padding: 10,
    marginTop: 11,
  },
  critiqueTitle: { color: STUDIO.accentText, fontSize: 11, fontWeight: "900" },
  critiqueText: { color: STUDIO.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  helper: { color: STUDIO.muted, fontSize: 11, lineHeight: 16 },
  readyCard: {
    backgroundColor: "rgba(67,209,123,0.08)",
    borderColor: "rgba(67,209,123,0.30)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  readyTitle: { color: "#A8F1C4", fontSize: 14, fontWeight: "900" },
  readyText: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  errorCard: {
    backgroundColor: "rgba(255,123,134,0.08)",
    borderColor: "rgba(255,123,134,0.28)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 11,
    marginBottom: 10,
  },
  errorTitle: { color: "#FFC0C6", fontSize: 11, fontWeight: "900", marginBottom: 4 },
  errorText: { color: STUDIO.muted, fontSize: 10, lineHeight: 15 },
});