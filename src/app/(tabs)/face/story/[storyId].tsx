import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ensureStoryStudioWorkflow } from "../../../../core/studio/multiPersonWorkflow";
import { DF } from "../../../../core/theme/colors";
import DFHeader from "../../../../core/ui/DFHeader";
import MultiPersonAudioWorkspaceScreen from "../../../../features/audio/MultiPersonAudioWorkspaceScreen";
import MultiPersonFaceSavedWorkScreen from "../../../../features/face/MultiPersonFaceSavedWorkScreen";
import MultiPersonFusionDenseScreen from "../../../../features/fusion/MultiPersonFusionDenseScreen";

type StoryStage = "face" | "audio" | "fusion";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStage(value: string | undefined): StoryStage | null {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "face" || raw === "audio" || raw === "fusion" ? raw : null;
}

function stageRank(stage: StoryStage | null) {
  if (stage === "fusion") return 3;
  if (stage === "audio") return 2;
  if (stage === "face") return 1;
  return 0;
}

export default function StoryStudioRoute() {
  const params = useLocalSearchParams<{
    storyId?: string | string[];
    stage?: string | string[];
  }>();
  const storyId = String(one(params.storyId) || "").trim();
  const explicitStage = normalizeStage(one(params.stage));
  const [resolvedStage, setResolvedStage] = useState<StoryStage | null>(explicitStage);
  const [error, setError] = useState("");
  const activeRef = useRef(true);

  const refreshCanonicalStage = useCallback(async () => {
    if (!storyId) return;
    const workflow = await ensureStoryStudioWorkflow(storyId);
    if (!activeRef.current) return;
    const canonical = normalizeStage(String(workflow?.current_stage || "")) || "face";
    setResolvedStage((current) => {
      const requested = current || explicitStage;
      return stageRank(canonical) > stageRank(requested) ? canonical : requested || canonical;
    });
  }, [explicitStage, storyId]);

  useEffect(() => {
    activeRef.current = true;
    setError("");
    if (!storyId) {
      setError("Story id is required.");
      return () => {
        activeRef.current = false;
      };
    }
    void refreshCanonicalStage().catch((reason) => {
      if (activeRef.current) setError(String(reason?.message || "Unable to load Story Studio."));
    });
    // Child Studio screens already poll their active generation work. This route
    // only needs to discover canonical stage transitions, so keep the cadence light.
    const timer = setInterval(() => {
      void refreshCanonicalStage().catch(() => {});
    }, 4000);
    return () => {
      activeRef.current = false;
      clearInterval(timer);
    };
  }, [refreshCanonicalStage, storyId]);

  const openPlanScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: { intent: "manage", source: "story_face" },
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
        menu_source: "story_face",
      },
    } as any);
  }, []);

  if (!resolvedStage) {
    return (
      <View style={styles.center}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            <ActivityIndicator size="large" color="#F8B848" />
            <Text style={styles.loading}>Opening Story Studio…</Text>
          </>
        )}
      </View>
    );
  }

  if (resolvedStage === "audio") {
    return <MultiPersonAudioWorkspaceScreen storyId={storyId} />;
  }
  if (resolvedStage === "fusion") {
    return <MultiPersonFusionDenseScreen storyId={storyId} />;
  }

  return (
    <View style={styles.safe}>
      <DFHeader subtitle="Story Face Studio" onMenuPress={openHamburgerMenu} onPressMeta={openPlanScreen} />
      <View style={styles.body}>
        <MultiPersonFaceSavedWorkScreen storyId={storyId} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: (DF as any)?.night ?? "#0E0F14" },
  body: { flex: 1, minHeight: 0 },
  center: {
    flex: 1,
    backgroundColor: (DF as any)?.night ?? "#0E0F14",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  loading: { color: (DF as any)?.muted ?? "rgba(255,255,255,0.62)", fontSize: 13, fontWeight: "700" },
  error: { color: "#FFB4BD", fontSize: 13, lineHeight: 19, fontWeight: "700", textAlign: "center" },
});
