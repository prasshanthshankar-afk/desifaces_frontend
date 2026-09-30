import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { STUDIO } from "../../core/studio/DenseStudioUI";
import { ensureStoryStudioWorkflow } from "../../core/studio/multiPersonWorkflow";
import MultiPersonFusionDenseScreen from "./MultiPersonFusionDenseScreen";
import {
  getSharedSceneState,
  saveSharedSceneVideoSettings,
  type SharedSceneWorkflowState,
} from "../face/api/sharedScene";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function errorText(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string") return detail;
  if (typeof detail?.message === "string") return detail.message;
  return clean(error?.message) || "Video direction could not be saved.";
}

export default function SharedSceneFusionScreen({ storyId }: { storyId: string }) {
  const [state, setState] = useState<SharedSceneWorkflowState | null>(null);
  const [mode, setMode] = useState<"precise_lipsync" | "natural_motion">("precise_lipsync");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const workflow = await ensureStoryStudioWorkflow(storyId, "shared_scene");
    const canonical = await getSharedSceneState(workflow.workflow_id);
    setState(canonical);
  }, [storyId]);

  useEffect(() => {
    void load().catch((reason) => setError(errorText(reason)));
  }, [load]);

  const save = useCallback(async () => {
    if (!state?.video?.stage_run_id) return;
    if (mode === "natural_motion" && !prompt.trim()) {
      setError("Describe the natural motion before saving video direction.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await saveSharedSceneVideoSettings(
        state.workflow_id,
        state.video.stage_run_id,
        {
          motion_mode: mode,
          video_prompt: mode === "natural_motion" ? prompt.trim() : null,
        }
      );
      await load();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }, [load, mode, prompt, state]);

  if (!state) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={STUDIO.accent} />
        <Text style={styles.muted}>Loading conversation video setup…</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  if (state.video.settings_saved) {
    return (
      <MultiPersonFusionDenseScreen
        storyId={storyId}
        conversationMode="shared_scene"
      />
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>GROUP PHOTO CONVERSATION</Text>
        <Text style={styles.title}>Choose conversation motion</Text>
        <Text style={styles.muted}>
          Save the motion direction before checking the video price. The approved group photo and speaker mapping stay locked.
        </Text>

        <Pressable
          onPress={() => setMode("precise_lipsync")}
          style={[styles.choice, mode === "precise_lipsync" && styles.choiceActive]}
        >
          <Text style={styles.choiceTitle}>Precise lip-sync</Text>
          <Text style={styles.choiceText}>
            Keep the shared photo visually stable and focus motion on the mapped speaker.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setMode("natural_motion")}
          style={[styles.choice, mode === "natural_motion" && styles.choiceActive]}
        >
          <Text style={styles.choiceTitle}>Natural motion</Text>
          <Text style={styles.choiceText}>
            Add broader natural movement while preserving the mapped speakers and shared scene.
          </Text>
        </Pressable>

        {mode === "natural_motion" ? (
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe the natural motion you want in the conversation."
            placeholderTextColor={STUDIO.faint}
            multiline
            textAlignVertical="top"
            style={styles.input}
          />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          disabled={busy}
          onPress={() => void save()}
          style={[styles.button, busy && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color={STUDIO.accentText} />
          ) : (
            <Text style={styles.buttonText}>Save video direction & check price</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: STUDIO.bg,
    padding: 14,
  },
  center: {
    flex: 1,
    backgroundColor: STUDIO.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surface,
    padding: 14,
  },
  eyebrow: {
    color: STUDIO.accentText,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: STUDIO.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    marginTop: 5,
  },
  muted: {
    color: STUDIO.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  choice: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surfaceSoft,
    padding: 11,
    marginTop: 10,
  },
  choiceActive: {
    borderColor: STUDIO.accentBorder,
    backgroundColor: STUDIO.accentFill,
  },
  choiceTitle: {
    color: STUDIO.text,
    fontSize: 12,
    fontWeight: "900",
  },
  choiceText: {
    color: STUDIO.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  input: {
    minHeight: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.bg,
    color: STUDIO.text,
    padding: 10,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
  },
  error: {
    color: "#FFC0C6",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 9,
  },
  button: {
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: STUDIO.accentBorder,
    backgroundColor: STUDIO.accentFill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 12,
  },
  buttonText: {
    color: STUDIO.accentText,
    fontSize: 11,
    fontWeight: "900",
  },
  disabled: { opacity: 0.4 },
});
