import { Ionicons } from "@expo/vector-icons";
import { useGlobalSearchParams, usePathname } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../core/auth/AuthContext";
import { useAssistantContext } from "./AssistantContext";
import {
  type AssistantAction,
  type AssistantContextLocator,
  sendAssistantMessage,
} from "./api/assistant";
import { PikuMark } from "./PikuMark";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  restricted?: boolean;
  actions?: AssistantAction[];
};

const SUPPORT_EMAIL = "support@desifaces.ai";
// Piku is rendered locally as vector artwork; no image URI can fail at runtime.
const C = {
  bg: "#090A0D",
  surface: "#17181D",
  surface2: "#222329",
  border: "#35363D",
  text: "#F7F5F2",
  muted: "#A7A5AA",
  brand: "#E2B86F",
  green: "#79D59D",
  danger: "#FFB4BD",
};

function one(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.length ? String(value[0]) : undefined;
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function screenFromPath(pathname: string, override?: string) {
  if (override) return override;
  const path = String(pathname || "").toLowerCase();
  if (path.includes("/face/story/")) return "story";
  if (path.includes("/face")) return "face_studio";
  if (path.includes("/audio")) return "audio_studio";
  if (path.includes("/fusion")) return "fusion_studio";
  if (path.includes("/pricing") || path.includes("/billing")) return "pricing";
  if (path.includes("/media")) return "media_library";
  if (path.includes("/dashboard")) return "dashboard";
  if (path.includes("/settings")) return "settings";
  if (path.includes("/help")) return "help";
  return "app";
}

function labelForScreen(screen: string) {
  const labels: Record<string, string> = {
    story_face: "Story · Face",
    story_audio: "Story · Audio",
    story_fusion: "Story · Fusion",
    story_story_final: "Story · Final",
    story: "Story Studio",
    face_studio: "Face Studio",
    audio_studio: "Audio Studio",
    fusion_studio: "Fusion Studio",
    pricing: "Pricing",
    media_library: "Saved Work",
    dashboard: "Dashboard",
    settings: "Settings",
    help: "Help",
    app: "desifaces",
  };
  return labels[screen] || screen.replace(/_/g, " ");
}

export default function AssistantOverlay() {
  const { isAuthed, isReady } = useAuth();
  const { override } = useAssistantContext();
  const pathname = usePathname();
  const params = useGlobalSearchParams<Record<string, string | string[]>>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");

  const screen = screenFromPath(pathname, override?.screen);
  const context = useMemo<AssistantContextLocator>(() => {
    const storyId = override?.storyId || one(params.storyId) || one(params.story_id);
    const sceneId = override?.sceneId || one(params.sceneId) || one(params.scene_id);
    const participantId =
      override?.participantId || one(params.participantId) || one(params.participant_id);
    return {
      surface: "mobile",
      screen,
      ...(storyId ? { story_id: storyId } : {}),
      ...(sceneId ? { scene_id: sceneId } : {}),
      ...(participantId ? { participant_id: participantId } : {}),
    };
  }, [override?.participantId, override?.sceneId, override?.storyId, params, screen]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (!message || sending) return;

    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: "user", text: message },
    ]);
    setDraft("");
    setError("");
    setSending(true);

    try {
      const response = await sendAssistantMessage({ sessionId, message, context });
      setSessionId(response.session_id);
      setMessages((current) => [
        ...current,
        {
          id: response.message_id,
          role: "assistant",
          text: response.answer,
          restricted: Boolean(response.policy?.restricted),
          actions: response.suggested_actions || [],
        },
      ]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (reason: any) {
      const code = String(reason?.code || reason?.message || "");
      setError(
        code === "AUTH_REQUIRED"
          ? "Your session needs to be refreshed. Please sign in again."
          : code === "ASSISTANT_BASE_NOT_SET"
            ? "Piku is not connected to this development build yet."
            : "Piku is temporarily unavailable. Your current Studio work is unaffected."
      );
    } finally {
      setSending(false);
    }
  }, [context, draft, sending, sessionId]);

  const openSupport = useCallback(() => {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=desifaces%20support`);
  }, []);

  const hideForRoute =
    pathname.startsWith("/(auth)") || pathname.includes("/login") || pathname === "/";
  if (!isReady || !isAuthed || hideForRoute) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Piku"
        onPress={() => setOpen(true)}
        style={[styles.launcher, { bottom: Math.max(insets.bottom + 76, 92) }]}
      >
        <PikuMark size={52} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.identityRow}>
                <View style={styles.headerAvatar}><PikuMark size={42} /></View>
                <View style={{ flex: 1 }}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title}>Piku</Text>
                    <Ionicons name="sparkles" size={14} color={C.brand} />
                  </View>
                  <Text style={styles.contextLabel}>Context: {labelForScreen(screen)}</Text>
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Piku"
                onPress={() => setOpen(false)}
                style={styles.close}
              >
                <Ionicons name="close" size={22} color={C.text} />
              </Pressable>
            </View>

            <View style={styles.privacyNotice}>
              <Ionicons name="shield-checkmark-outline" size={16} color={C.green} />
              <Text style={styles.privacyText}>
                Context-aware help. Personal identity and payment-card data are not disclosed in chat.
              </Text>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.messages}
              contentContainerStyle={styles.messagesContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Hi, I’m Piku. What can I help with?</Text>
                  <Text style={styles.emptyText}>
                    Ask across desifaces—not just this screen. I can use your authorized account context for workflows, credits, pricing, recent generations and saved work.
                  </Text>
                </View>
              ) : null}

              {messages.map((message) => (
                <View
                  key={message.id}
                  style={message.role === "user" ? styles.userRow : styles.assistantRow}
                >
                  <View
                    style={message.role === "user" ? styles.userBubble : styles.assistantBubble}
                  >
                    <Text style={styles.messageText}>{message.text}</Text>
                    {message.restricted ? (
                      <Pressable onPress={openSupport} style={styles.supportLink}>
                        <Ionicons name="mail-outline" size={14} color={C.brand} />
                        <Text style={styles.supportText}>{SUPPORT_EMAIL}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {message.role === "assistant" && message.actions?.length ? (
                    <View style={styles.actionRow}>
                      {message.actions.slice(0, 3).map((action) => (
                        <Pressable
                          key={action.type}
                          onPress={() => setDraft(action.label)}
                          style={styles.actionChip}
                        >
                          <Text style={styles.actionText}>{action.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}

              {sending ? (
                <View style={styles.thinking}>
                  <ActivityIndicator size="small" color={C.brand} />
                  <Text style={styles.thinkingText}>
                    Piku is checking your authorized desifaces context…
                  </Text>
                </View>
              ) : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Ask Piku about desifaces…"
                placeholderTextColor={C.muted}
                multiline
                maxLength={8000}
                style={styles.input}
                editable={!sending}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message to Piku"
                disabled={!draft.trim() || sending}
                onPress={() => void send()}
                style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
              >
                <Ionicons name="arrow-up" size={19} color="#111" />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  launcher: {
    position: "absolute",
    right: 18,
    zIndex: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#080808",
    borderWidth: 2,
    borderColor: C.brand,
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 12,
    overflow: "hidden",
  },
  launcherAvatar: { width: 52, height: 52, borderRadius: 26 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.65)" },
  sheet: {
    maxHeight: "88%",
    minHeight: "62%",
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignSelf: "center",
    marginTop: 9,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  identityRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: C.brand,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { color: C.text, fontSize: 19, fontWeight: "800" },
  contextLabel: { color: C.muted, fontSize: 12, fontWeight: "700", marginTop: 3 },
  close: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface2,
    marginLeft: 10,
  },
  privacyNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(121,213,157,0.08)",
    borderWidth: 1,
    borderColor: "rgba(121,213,157,0.20)",
    marginBottom: 10,
  },
  privacyText: { flex: 1, color: C.muted, fontSize: 11.5, lineHeight: 16 },
  messages: { flex: 1 },
  messagesContent: { paddingVertical: 8, gap: 12 },
  emptyCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyTitle: { color: C.text, fontSize: 15, fontWeight: "800" },
  emptyText: { color: C.muted, fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  userRow: { alignItems: "flex-end" },
  assistantRow: { alignItems: "flex-start" },
  userBubble: {
    maxWidth: "84%",
    backgroundColor: "#3A3022",
    borderRadius: 17,
    borderBottomRightRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  assistantBubble: {
    maxWidth: "90%",
    backgroundColor: C.surface2,
    borderRadius: 17,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  messageText: { color: C.text, fontSize: 13.5, lineHeight: 20 },
  supportLink: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 10 },
  supportText: { color: C.brand, fontSize: 12, fontWeight: "800" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 7 },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actionText: { color: C.muted, fontSize: 11.5, fontWeight: "700" },
  thinking: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 5 },
  thinkingText: { color: C.muted, fontSize: 12 },
  error: { color: C.danger, fontSize: 12.5, lineHeight: 18 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 118,
    color: C.text,
    backgroundColor: C.surface2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.45 },
});