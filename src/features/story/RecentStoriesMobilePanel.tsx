import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { STUDIO } from "../../core/studio/DenseStudioUI";
import {
  getRecentStories,
  type RecentStory,
} from "../face/api/multiPersonDirector";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function statusLabel(item: RecentStory) {
  const attention = clean(item.attention_state).toLowerCase();
  if (attention === "awaiting_review") return "Needs review";
  if (attention === "failed") return "Needs attention";
  const stage = clean(item.current_stage).replace(/_/g, " ");
  const state = clean(item.workflow_state || item.state).replace(/_/g, " ");
  if (stage) return `${stage} · ${state || "active"}`;
  return state || "Story";
}

function ageLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function RecentStoriesMobilePanel() {
  const [items, setItems] = useState<RecentStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const next = await getRecentStories(6);
      setItems(Array.isArray(next) ? next : []);
    } catch (reason: any) {
      const detail = clean(reason?.body?.detail || reason?.message);
      setError(detail && detail !== "Not Found"
        ? detail
        : "Recent stories are temporarily unavailable. Your saved Story work is unaffected.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const openStory = useCallback((storyId: string) => {
    if (!storyId) return;
    router.push({
      pathname: "/(tabs)/face/story/[storyId]",
      params: { storyId },
    } as any);
  }, []);

  if (!loading && !items.length && !error) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>RECENT STORIES</Text>
          <Text style={styles.title}>Continue where you left off</Text>
        </View>
        {loading ? <ActivityIndicator color={STUDIO.accent} size="small" /> : null}
      </View>

      {error ? (
        <Pressable onPress={() => void load(true)} style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retry}>Tap to retry</Text>
        </Pressable>
      ) : null}

      {items.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={STUDIO.accent}
            />
          }
        >
          {items.map((item) => (
            <Pressable
              key={item.story_id}
              accessibilityRole="button"
              accessibilityLabel={`Continue ${item.title || "story"}`}
              onPress={() => openStory(item.story_id)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Text numberOfLines={2} style={styles.cardTitle}>
                {item.title || "Untitled Story"}
              </Text>
              <Text numberOfLines={1} style={styles.status}>
                {statusLabel(item)}
              </Text>
              <View style={styles.footer}>
                <Text style={styles.date}>{ageLabel(item.updated_at)}</Text>
                <Text style={styles.continue}>Continue →</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: STUDIO.border,
    backgroundColor: STUDIO.bg,
  },
  headingRow: {
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  eyebrow: {
    color: STUDIO.accentText,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: STUDIO.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    marginTop: 2,
  },
  cards: { paddingHorizontal: 14, paddingBottom: 2, gap: 8 },
  card: {
    width: 208,
    minHeight: 96,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surface,
    padding: 10,
  },
  cardTitle: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  status: { color: STUDIO.muted, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 5, textTransform: "capitalize" },
  footer: { marginTop: "auto", paddingTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  date: { color: STUDIO.faint, fontSize: 9, fontWeight: "700" },
  continue: { color: STUDIO.accentText, fontSize: 10, fontWeight: "900" },
  errorCard: { marginHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,180,189,0.3)", backgroundColor: "rgba(255,180,189,0.06)", padding: 10 },
  errorText: { color: "#FFB4BD", fontSize: 10.5, lineHeight: 15, fontWeight: "700" },
  retry: { color: STUDIO.accentText, fontSize: 10, fontWeight: "900", marginTop: 5 },
  pressed: { opacity: 0.74 },
});
