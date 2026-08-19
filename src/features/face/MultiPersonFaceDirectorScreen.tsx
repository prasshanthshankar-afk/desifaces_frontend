import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
    }, 1800);

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
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
              placeholderTextColor="rgba(255,255,255,0.35)"
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
              {submitting ? <ActivityIndicator color="#1c1208" /> : <Text style={styles.primaryText}>Ask Creative Director</Text>}
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.statusCard}>
              <View>
                <Text style={styles.statusLabel}>Director run</Text>
                <Text style={styles.statusValue}>{humanState(run.state)}</Text>
              </View>
              {(polling || RUNNING_STATES.has(run.state)) && <ActivityIndicator color="#d6b172" />}
            </View>

            {run.errors?.length ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Director error</Text>
                {run.errors.map((item, index) => (
                  <Text key={`${index}-${item}`} style={styles.errorText}>{item}</Text>
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
                    <View style={styles.badge}><Text style={styles.badgeText}>{index + 1}</Text></View>
                    <View style={styles.participantBody}>
                      <Text style={styles.participantName}>{participant.display_name}</Text>
                      {participant.role ? <Text style={styles.participantRole}>{participant.role}</Text> : null}
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
                    <Text style={styles.sceneTitle}>Scene {scene.sequence + 1}{scene.title ? ` • ${scene.title}` : ""}</Text>
                    {scene.purpose ? <Text style={styles.sceneText}>{scene.purpose}</Text> : null}
                    {scene.participant_refs?.length ? (
                      <Text style={styles.sceneText}>Cast: {scene.participant_refs.join(", ")}</Text>
                    ) : null}
                  </View>
                ))}

                {critique ? (
                  <View style={styles.critiqueBox}>
                    <Text style={styles.critiqueTitle}>Continuity critique • {critique.score}/100</Text>
                    <Text style={styles.critiqueText}>{critique.ready ? "Ready for human review." : "Director revised this plan before review."}</Text>
                    {critique.safety_notes?.map((item, index) => (
                      <Text key={`s-${index}`} style={styles.critiqueText}>• {item}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {run.state === "awaiting_review" ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Human review</Text>
                <Text style={styles.helper}>Approve this Director plan to create the canonical Story and unlock the participant Face workflow. Or request a revision before any Face provider cost is incurred.</Text>
                <TextInput
                  value={feedback}
                  onChangeText={setFeedback}
                  multiline
                  textAlignVertical="top"
                  placeholder="Optional revision feedback"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={styles.feedbackInput}
                />
                <Pressable
                  onPress={() => void review(true)}
                  disabled={submitting}
                  style={({ pressed }) => [styles.primaryButton, submitting && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.primaryText}>Approve Director plan</Text>
                </Pressable>
                <Pressable
                  onPress={() => void review(false)}
                  disabled={submitting}
                  style={({ pressed }) => [styles.secondaryButton, submitting && styles.disabled, pressed && styles.pressed]}
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
                <Pressable onPress={openFaceCast} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={styles.primaryText}>Open Face Cast</Text>
                </Pressable>
              </View>
            ) : null}

            {run.state === "failed" ? (
              <Pressable onPress={reset} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Start a new brief</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#080a0f" },
  content: { padding: 18, paddingBottom: 48 },
  eyebrow: { color: "#d6b172", fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  title: { color: "#fff", fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 8 },
  subtitle: { color: "rgba(255,255,255,0.68)", fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 18 },
  card: { backgroundColor: "#121620", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", marginBottom: 14 },
  label: { color: "rgba(255,255,255,0.9)", fontWeight: "800", marginBottom: 9 },
  input: { minHeight: 180, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", color: "#fff", padding: 13, fontSize: 15, lineHeight: 22, backgroundColor: "rgba(0,0,0,0.22)" },
  feedbackInput: { minHeight: 96, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", color: "#fff", padding: 13, marginTop: 12, marginBottom: 12, backgroundColor: "rgba(0,0,0,0.22)" },
  primaryButton: { minHeight: 48, borderRadius: 14, backgroundColor: "#d6b172", alignItems: "center", justifyContent: "center", marginTop: 14, paddingHorizontal: 16 },
  primaryText: { color: "#1c1208", fontWeight: "900", fontSize: 14 },
  secondaryButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: "rgba(214,177,114,0.55)", alignItems: "center", justifyContent: "center", marginTop: 10, paddingHorizontal: 16 },
  secondaryText: { color: "#e5c58c", fontWeight: "800", fontSize: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  statusCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#101722", borderRadius: 16, padding: 14, marginBottom: 14 },
  statusLabel: { color: "rgba(255,255,255,0.52)", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  statusValue: { color: "#fff", fontSize: 17, fontWeight: "900", marginTop: 3 },
  planTitle: { color: "#fff", fontSize: 22, fontWeight: "900" },
  planSummary: { color: "rgba(255,255,255,0.7)", lineHeight: 20, marginTop: 8 },
  sectionTitle: { color: "#fff", fontSize: 15, fontWeight: "900", marginTop: 18, marginBottom: 9 },
  participantRow: { flexDirection: "row", marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.07)" },
  badge: { width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(214,177,114,0.16)", alignItems: "center", justifyContent: "center", marginRight: 10 },
  badgeText: { color: "#d6b172", fontWeight: "900" },
  participantBody: { flex: 1 },
  participantName: { color: "#fff", fontWeight: "900", fontSize: 16 },
  participantRole: { color: "#d6b172", fontSize: 13, fontWeight: "700", marginTop: 2 },
  participantDetail: { color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 18, marginTop: 5 },
  sceneRow: { backgroundColor: "rgba(255,255,255,0.035)", borderRadius: 12, padding: 11, marginBottom: 8 },
  sceneTitle: { color: "rgba(255,255,255,0.9)", fontWeight: "800" },
  sceneText: { color: "rgba(255,255,255,0.62)", fontSize: 12, lineHeight: 18, marginTop: 4 },
  critiqueBox: { borderRadius: 12, backgroundColor: "rgba(214,177,114,0.08)", padding: 12, marginTop: 14 },
  critiqueTitle: { color: "#e5c58c", fontWeight: "900" },
  critiqueText: { color: "rgba(255,255,255,0.66)", fontSize: 12, lineHeight: 18, marginTop: 4 },
  helper: { color: "rgba(255,255,255,0.62)", fontSize: 13, lineHeight: 19 },
  readyCard: { backgroundColor: "rgba(46,152,91,0.12)", borderColor: "rgba(76,196,126,0.28)", borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 14 },
  readyTitle: { color: "#b8f2cf", fontSize: 18, fontWeight: "900" },
  readyText: { color: "rgba(255,255,255,0.68)", fontSize: 13, lineHeight: 19, marginTop: 7 },
  errorCard: { backgroundColor: "rgba(180,55,55,0.13)", borderColor: "rgba(230,90,90,0.28)", borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  errorTitle: { color: "#ffc2c2", fontWeight: "900", marginBottom: 5 },
  errorText: { color: "rgba(255,255,255,0.72)", fontSize: 12, lineHeight: 18 },
});
