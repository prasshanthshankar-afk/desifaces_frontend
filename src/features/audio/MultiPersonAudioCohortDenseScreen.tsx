import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from "expo-audio";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "../../core/auth/AuthContext";
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
import DFHeader from "../../core/ui/DFHeader";
import {
  fetchAudioLocales,
  fetchAudioVoices,
  normalizeLocales,
  normalizeVoices,
  type UiLocale,
  type UiVoice,
} from "./api/masterdataAudio";
import {
  advanceStudioWorkflow,
  audioPricingQuote,
  audioStages,
  configureParticipantVoice,
  dispatchDialogueAudio,
  ensureStoryStudioWorkflow,
  getStoryWorkspace,
  getStudioWorkflow,
  latestPendingReview,
  previewDialogueAudio,
  reviewStudioOutput,
  syncDialogueAudio,
  type AudioPricingPreview,
  type AudioSyncResult,
  type StoryWorkspaceView,
  type StudioStageView,
  type StudioWorkflowView,
  type WorkspaceParticipant,
} from "./api/multiPersonStory";

type Props = { storyId: string };
type StageMap<T> = Record<string, T>;
type PickerState = { kind: "locale" | "voice"; participantId: string } | null;
type Choice = { key: string; label: string; subtitle?: string };
type AudioPlayerHandle = ReturnType<typeof createAudioPlayer>;

function clean(value: unknown) { return String(value ?? "").trim(); }
function errorMessage(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string") return detail.replace(/_/g, " ");
  if (typeof detail?.message === "string") return detail.message;
  if (typeof error?.message === "string") return error.message;
  return "Something went wrong";
}
function normalizeGender(value: unknown) {
  const raw = clean(value).toLowerCase();
  if (["male", "man", "m", "boy"].includes(raw)) return "male";
  if (["female", "woman", "f", "girl"].includes(raw)) return "female";
  if (["neutral", "nonbinary", "non-binary"].includes(raw)) return "neutral";
  return "unspecified";
}
function participantGender(participant: WorkspaceParticipant) {
  const persona = participant.persona ?? {};
  return normalizeGender(persona.gender ?? persona.gender_presentation ?? persona.sex ?? persona.voice_gender);
}
function voiceGender(voice: UiVoice) { return normalizeGender((voice.raw as any)?.gender); }
function humanGender(value: string) {
  if (value === "male") return "Male";
  if (value === "female") return "Female";
  if (value === "neutral") return "Neutral";
  return "Voice";
}
function stageTone(state: string) {
  if (state === "approved") return "success" as const;
  if (state === "awaiting_review") return "accent" as const;
  if (state === "failed" || state === "rejected") return "danger" as const;
  return "neutral" as const;
}
function quoteCredits(preview: AudioPricingPreview | null | undefined) {
  const p: any = preview?.pricing ?? {};
  const values = [
    p.estimated_credits,
    p.credits,
    p.pricing?.estimated_credits,
    p.pricing?.credits,
    p.summary?.estimated_credits,
    p.pricing?.summary?.estimated_credits,
  ];
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const text = clean(
    p.summary?.estimated_credits_label || p.summary?.display_total ||
    p.pricing?.summary?.estimated_credits_label || p.pricing?.summary?.display_total
  );
  const match = text.match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function ChoiceModal({
  visible,
  title,
  choices,
  selected,
  loading,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  choices: Choice[];
  selected?: string;
  loading?: boolean;
  onClose: () => void;
  onSelect: (choice: Choice) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => { if (!visible) setQuery(""); }, [visible]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? choices.filter((item) => `${item.label} ${item.subtitle || ""}`.toLowerCase().includes(q)) : choices;
  }, [choices, query]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.modalClose}>×</Text></Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={STUDIO.faint}
            style={styles.searchInput}
          />
          {loading ? (
            <View style={styles.modalLoading}><ActivityIndicator color={STUDIO.accent} /></View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.choiceList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.empty}>No matching options.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [styles.choiceRow, item.key === selected && styles.choiceSelected, pressed && styles.pressed]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.choiceLabel}>{item.label}</Text>
                    {item.subtitle ? <Text style={styles.choiceSubtitle}>{item.subtitle}</Text> : null}
                  </View>
                  {item.key === selected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function AudioPlay({ url }: { url: string }) {
  const ref = useRef<AudioPlayerHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(async () => {
    const player = ref.current;
    ref.current = null;
    setPlaying(false);
    if (!player) return;
    try { await Promise.resolve((player as any)?.pause?.()); } catch {}
    try { await Promise.resolve((player as any)?.release?.()); } catch {}
  }, []);
  useEffect(() => () => { void stop(); }, [stop]);

  const toggle = useCallback(async () => {
    if (busy) return;
    if (playing) return void stop();
    setBusy(true);
    try {
      await stop();
      await setIsAudioActiveAsync(false).catch(() => {});
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
        interruptionMode: "doNotMix",
      });
      await setIsAudioActiveAsync(true);
      const player = createAudioPlayer(url, { updateInterval: 250, downloadFirst: true, keepAudioSessionActive: true });
      ref.current = player;
      (player as any)?.addListener?.("playbackStatusUpdate", (status: any) => {
        if (status?.didJustFinish) void stop();
      });
      await Promise.resolve((player as any)?.play?.());
      setPlaying(true);
    } catch (error) {
      await stop();
      Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [busy, playing, stop, url]);

  return <CompactButton label={busy ? "…" : playing ? "Stop" : "Play"} onPress={() => void toggle()} disabled={busy} />;
}

export default function MultiPersonAudioCohortDenseScreen({ storyId }: Props) {
  const viewport = useStudioViewport();
  const { token } = useAuth();
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [locales, setLocales] = useState<UiLocale[]>([]);
  const [voiceCache, setVoiceCache] = useState<Record<string, UiVoice[]>>({});
  const [voiceLoading, setVoiceLoading] = useState<Record<string, boolean>>({});
  const [draftLocales, setDraftLocales] = useState<Record<string, string>>({});
  const [draftVoices, setDraftVoices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [previews, setPreviews] = useState<StageMap<AudioPricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<AudioSyncResult>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [picker, setPicker] = useState<PickerState>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const hydrateDrafts = useCallback((next: StoryWorkspaceView) => {
    setDraftLocales((current) => {
      const copy = { ...current };
      next.participants.forEach((p) => { if (!copy[p.participant_id]) copy[p.participant_id] = clean(p.preferred_locale); });
      return copy;
    });
    setDraftVoices((current) => {
      const copy = { ...current };
      next.participants.forEach((p) => { if (!copy[p.participant_id]) copy[p.participant_id] = clean(p.voice_profile_ref); });
      return copy;
    });
  }, []);

  const loadVoices = useCallback(async (locale: string) => {
    const key = clean(locale);
    if (!key || voiceCache[key] || voiceLoading[key]) return;
    setVoiceLoading((c) => ({ ...c, [key]: true }));
    try {
      const response = await fetchAudioVoices(token || undefined, key);
      if (mounted.current) setVoiceCache((c) => ({ ...c, [key]: normalizeVoices(response) }));
    } catch (error) {
      if (mounted.current) Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      if (mounted.current) setVoiceLoading((c) => ({ ...c, [key]: false }));
    }
  }, [token, voiceCache, voiceLoading]);

  const load = useCallback(async (quiet = false) => {
    if (!storyId) return;
    if (!quiet) setLoading(true);
    try {
      const [nextWorkspace, initialWorkflow, localeResponse] = await Promise.all([
        getStoryWorkspace(storyId),
        ensureStoryStudioWorkflow(storyId),
        fetchAudioLocales(token || undefined),
      ]);
      const recoverable = audioStages(initialWorkflow).filter((stage) =>
        ["generating", "awaiting_review", "approved"].includes(stage.state)
      );
      const recovered: StageMap<AudioSyncResult> = {};
      if (recoverable.length) {
        const settled = await Promise.allSettled(
          recoverable.map((stage) => syncDialogueAudio(initialWorkflow.workflow_id, stage.stage_run_id))
        );
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") recovered[recoverable[index].stage_run_id] = result.value;
        });
      }
      const latestWorkflow = recoverable.length ? await getStudioWorkflow(initialWorkflow.workflow_id) : initialWorkflow;
      if (!mounted.current) return;
      setWorkspace(nextWorkspace);
      setWorkflow(latestWorkflow);
      setSyncs((c) => ({ ...c, ...recovered }));
      setLocales(normalizeLocales(localeResponse));
      hydrateDrafts(nextWorkspace);
    } catch (error) {
      Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [hydrateDrafts, storyId, token]);

  useEffect(() => { void load(); }, [load]);

  const stages = useMemo(() => audioStages(workflow), [workflow]);
  const speakingIds = useMemo(() => new Set(stages.map((s) => clean(s.participant_id)).filter(Boolean)), [stages]);
  const speakers = useMemo(
    () => (workspace?.participants ?? []).filter((p) => speakingIds.has(p.participant_id)),
    [speakingIds, workspace]
  );
  const participantById = useMemo(() => new Map((workspace?.participants ?? []).map((p) => [p.participant_id, p])), [workspace]);
  const dialogueByTurn = useMemo(() => {
    const map = new Map<string, any>();
    (workspace?.scenes ?? []).forEach((scene: any) => {
      (scene?.dialogue ?? []).forEach((turn: any) => map.set(clean(turn?.dialogue_turn_id || turn?.turn_id), turn));
    });
    return map;
  }, [workspace]);

  useEffect(() => {
    speakers.forEach((p) => {
      const locale = draftLocales[p.participant_id] || clean(p.preferred_locale);
      if (locale) void loadVoices(locale);
    });
  }, [draftLocales, loadVoices, speakers]);

  useEffect(() => {
    if (!workflow) return;
    const generating = audioStages(workflow).filter((s) => s.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(async () => {
      const settled = await Promise.allSettled(
        generating.map((stage) => syncDialogueAudio(workflow.workflow_id, stage.stage_run_id))
      );
      if (!mounted.current) return;
      const patch: StageMap<AudioSyncResult> = {};
      let latest: StudioWorkflowView | null = null;
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") {
          patch[generating[index].stage_run_id] = result.value;
          latest = result.value.workflow;
        }
      });
      if (latest) setWorkflow(latest);
      setSyncs((c) => ({ ...c, ...patch }));
    }, 2800);
    return () => clearInterval(timer);
  }, [workflow]);

  const saveVoice = useCallback(async (participant: WorkspaceParticipant) => {
    if (!workflow) return;
    const participantId = participant.participant_id;
    const locale = clean(draftLocales[participantId] || participant.preferred_locale);
    const voice = clean(draftVoices[participantId] || participant.voice_profile_ref);
    if (!locale || !voice) {
      Alert.alert("Character voice", "Choose a language and voice first.");
      return;
    }
    setSaving((c) => ({ ...c, [participantId]: true }));
    try {
      await configureParticipantVoice(workflow.workflow_id, participantId, { voice_id: voice, voice_locale: locale });
      const nextWorkspace = await getStoryWorkspace(storyId);
      if (!mounted.current) return;
      setWorkspace(nextWorkspace);
      hydrateDrafts(nextWorkspace);
    } catch (error) {
      Alert.alert("Character voice", errorMessage(error));
    } finally {
      if (mounted.current) setSaving((c) => ({ ...c, [participantId]: false }));
    }
  }, [draftLocales, draftVoices, hydrateDrafts, storyId, workflow]);

  const checkConversationPrice = useCallback(async () => {
    if (!workflow) return;
    const targets = audioStages(workflow).filter((s) => ["pending", "ready", "failed", "rejected"].includes(s.state));
    if (!targets.length) return;
    setActionBusy(true);
    try {
      const settled = await Promise.allSettled(
        targets.map((stage) => previewDialogueAudio(workflow.workflow_id, stage.stage_run_id))
      );
      const patch: StageMap<AudioPricingPreview> = {};
      const failures: string[] = [];
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") patch[targets[index].stage_run_id] = result.value;
        else failures.push(errorMessage(result.reason));
      });
      if (mounted.current) setPreviews((c) => ({ ...c, ...patch }));
      if (failures.length) Alert.alert("Conversation pricing", failures[0]);
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [workflow]);

  const generateConversation = useCallback(async () => {
    if (!workflow) return;
    const targets = audioStages(workflow).filter((s) => Boolean(previews[s.stage_run_id]));
    if (!targets.length) return void checkConversationPrice();
    setActionBusy(true);
    try {
      const settled = await Promise.allSettled(
        targets.map((stage) => dispatchDialogueAudio(
          workflow.workflow_id,
          stage.stage_run_id,
          audioPricingQuote(previews[stage.stage_run_id])
        ))
      );
      const failed = settled.find((result) => result.status === "rejected");
      const next = await getStudioWorkflow(workflow.workflow_id);
      if (!mounted.current) return;
      setWorkflow(next);
      setPreviews({});
      if (failed && failed.status === "rejected") Alert.alert("Audio Studio", errorMessage(failed.reason));
    } catch (error) {
      Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [checkConversationPrice, previews, workflow]);

  const reviewLine = useCallback(async (stage: StudioStageView, decision: "approved" | "revise") => {
    if (!workflow) return;
    setActionBusy(true);
    try {
      const authoritative = await getStudioWorkflow(workflow.workflow_id);
      const current = audioStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id);
      const pending = latestPendingReview(current);
      if (!pending) {
        setWorkflow(authoritative);
        return;
      }
      const next = await reviewStudioOutput(pending.review_item_id, decision);
      if (!mounted.current) return;
      setWorkflow(next);
      if (decision === "revise") {
        setPreviews((c) => {
          const copy = { ...c };
          delete copy[stage.stage_run_id];
          return copy;
        });
        setSyncs((c) => {
          const copy = { ...c };
          delete copy[stage.stage_run_id];
          return copy;
        });
      }
    } catch (error) {
      Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [workflow]);

  const approveReady = useCallback(async () => {
    if (!workflow) return;
    const ready = audioStages(workflow).filter((s) => s.state === "awaiting_review" && latestPendingReview(s));
    if (!ready.length) return;
    setActionBusy(true);
    try {
      let latest = workflow;
      for (const stage of ready) {
        const authoritative = await getStudioWorkflow(latest.workflow_id);
        const current = audioStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id);
        const pending = latestPendingReview(current);
        if (!pending) { latest = authoritative; continue; }
        latest = await reviewStudioOutput(pending.review_item_id, "approved");
      }
      if (latest.current_stage === "fusion") latest = await advanceStudioWorkflow(latest.workflow_id).catch(() => latest);
      if (mounted.current) setWorkflow(latest);
    } catch (error) {
      Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [workflow]);

  const openMenu = useCallback(() => {
    router.push({ pathname: "/(tabs)/dashboard" as any, params: { openMenu: "1", menu_nonce: `${Date.now()}`, menu_source: "story_audio" } } as any);
  }, []);
  const openPlan = useCallback(() => {
    router.push({ pathname: "/(tabs)/billing" as any, params: { intent: "manage", source: "story_audio" } } as any);
  }, []);

  if (loading && !workflow) {
    return (
      <View style={styles.safe}>
        <DFHeader subtitle="Story Audio Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
        <View style={styles.center}><ActivityIndicator size="large" color={STUDIO.accent} /><Text style={styles.helper}>Preparing voices…</Text></View>
      </View>
    );
  }

  const approved = stages.filter((s) => s.state === "approved").length;
  const reviewReady = stages.filter((s) => s.state === "awaiting_review").length;
  const totalCredits = Object.values(previews).reduce((sum, preview) => sum + (quoteCredits(preview) || 0), 0);
  const pricedCount = Object.keys(previews).length;

  const localeChoices: Choice[] = locales.map((locale) => ({ key: locale.code, label: locale.label, subtitle: locale.code }));
  const pickerParticipant = picker ? participantById.get(picker.participantId) : undefined;
  const pickerLocale = pickerParticipant ? clean(draftLocales[pickerParticipant.participant_id] || pickerParticipant.preferred_locale) : "";
  const pickerGender = pickerParticipant ? participantGender(pickerParticipant) : "unspecified";
  const pickerVoices = (voiceCache[pickerLocale] ?? []).filter((voice) => {
    const g = voiceGender(voice);
    return pickerGender === "unspecified" || pickerGender === "neutral" || g === "unspecified" || g === pickerGender;
  });
  const voiceChoices: Choice[] = pickerVoices.map((voice) => ({ key: voice.key, label: clean(voice.raw?.display_name) || voice.label, subtitle: `${humanGender(voiceGender(voice))} • ${voice.locale}` }));

  return (
    <View style={styles.safe}>
      <DFHeader subtitle="Story Audio Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: viewport.contentMaxWidth, paddingHorizontal: viewport.horizontalPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={STUDIO.accent} onRefresh={() => { setRefreshing(true); void load(true); }} />}
      >
        <StudioHero
          eyebrow="STORY AUDIO STUDIO"
          title={workspace?.title || "Character voices"}
          subtitle="Choose one language and one voice for each speaking character. That voice remains consistent across the full conversation."
          right={<ProgressLine current={approved} total={stages.length} label="Audio" />}
        />

        <SectionLabel title="Character voices" meta={`${speakers.length} speaker${speakers.length === 1 ? "" : "s"}`} />
        <View style={[styles.voiceGrid, viewport.wide && styles.voiceGridWide]}>
          {speakers.map((participant) => {
            const participantId = participant.participant_id;
            const gender = participantGender(participant);
            const locale = clean(draftLocales[participantId] || participant.preferred_locale);
            const voiceId = clean(draftVoices[participantId] || participant.voice_profile_ref);
            const voices = voiceCache[locale] ?? [];
            const selectedVoice = voices.find((v) => v.key === voiceId);
            const lineCount = stages.filter((s) => clean(s.participant_id) === participantId).length;
            const locked = stages
              .filter((s) => clean(s.participant_id) === participantId)
              .some((s) => ["generating", "awaiting_review", "approved"].includes(s.state));
            const persisted = clean(participant.voice_profile_ref) === voiceId && clean(participant.preferred_locale) === locale;

            return (
              <Surface key={participantId} accent={persisted} style={[styles.voiceCard, viewport.wide && styles.voiceCardWide]}>
                <View style={styles.voiceTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.voiceName} numberOfLines={1}>{participant.display_name || "Character"}</Text>
                    <Text style={styles.voiceMeta}>{humanGender(gender)} • {lineCount} line{lineCount === 1 ? "" : "s"}</Text>
                  </View>
                  <StatusPill value={persisted ? "SET" : locked ? "LOCKED" : "CHOOSE"} tone={persisted ? "success" : locked ? "accent" : "neutral"} />
                </View>

                <View style={styles.selectRow}>
                  <Pressable
                    disabled={locked}
                    onPress={() => setPicker({ kind: "locale", participantId })}
                    style={({ pressed }) => [styles.select, locked && styles.disabled, pressed && !locked && styles.pressed]}
                  >
                    <Text style={styles.selectLabel}>Language</Text>
                    <Text style={styles.selectValue} numberOfLines={1}>{locales.find((l) => l.code === locale)?.label || locale || "Choose"}</Text>
                    <Text style={styles.selectChevron}>›</Text>
                  </Pressable>
                  <Pressable
                    disabled={locked || !locale}
                    onPress={() => { void loadVoices(locale); setPicker({ kind: "voice", participantId }); }}
                    style={({ pressed }) => [styles.select, locked && styles.disabled, pressed && !locked && styles.pressed]}
                  >
                    <Text style={styles.selectLabel}>Voice</Text>
                    <Text style={styles.selectValue} numberOfLines={1}>{selectedVoice ? clean(selectedVoice.raw?.display_name) || selectedVoice.label : voiceId || "Choose"}</Text>
                    <Text style={styles.selectChevron}>›</Text>
                  </Pressable>
                </View>

                {!locked && (!persisted || !participant.voice_profile_ref) ? (
                  <CompactButton
                    label={saving[participantId] ? "Saving…" : "Apply voice"}
                    onPress={() => void saveVoice(participant)}
                    disabled={Boolean(saving[participantId]) || !locale || !voiceId}
                    tone="primary"
                    fill
                  />
                ) : null}
              </Surface>
            );
          })}
        </View>

        <SectionLabel title="Conversation audio" meta={`${approved} approved • ${reviewReady} ready`} />
        <Surface style={styles.conversationToolbar} accent={pricedCount > 0}>
          <View style={styles.toolbarText}>
            <Text style={styles.toolbarTitle}>{stages.length} dialogue turns</Text>
            <Text style={styles.toolbarMeta}>
              {pricedCount ? `${pricedCount} priced${totalCredits ? ` • ${totalCredits} credits` : ""}` : "Price the conversation before generation"}
            </Text>
          </View>
          <View style={styles.toolbarActions}>
            <CompactButton label={actionBusy ? "Working…" : "Check price"} onPress={() => void checkConversationPrice()} disabled={actionBusy} />
            <CompactButton label="Generate" onPress={() => void generateConversation()} disabled={actionBusy || pricedCount === 0} tone="primary" />
            <CompactButton label={`Approve ${reviewReady || "ready"}`} onPress={() => void approveReady()} disabled={actionBusy || reviewReady === 0} />
          </View>
        </Surface>

        <Surface style={styles.dialogueTable}>
          {stages.map((stage, index) => {
            const participant = participantById.get(clean(stage.participant_id));
            const turn = dialogueByTurn.get(clean(stage.dialogue_turn_id));
            const sync = syncs[stage.stage_run_id];
            const preview = previews[stage.stage_run_id];
            const canReview = stage.state === "awaiting_review" && Boolean(latestPendingReview(stage));
            const text = clean(turn?.text || stage.metadata?.text || stage.metadata?.dialogue_text || "Dialogue");

            return (
              <View key={stage.stage_run_id}>
                {index ? <Divider /> : null}
                <View style={styles.dialogueRow}>
                  <Text style={styles.sequence}>{index + 1}</Text>
                  <View style={styles.dialogueBody}>
                    <View style={styles.dialogueHead}>
                      <Text style={styles.speaker} numberOfLines={1}>{participant?.display_name || sync?.display_name || "Speaker"}</Text>
                      <StatusPill value={humanState(stage.state)} tone={stageTone(stage.state)} />
                    </View>
                    <Text style={styles.dialogueText} numberOfLines={viewport.compact ? 2 : 3}>{text}</Text>
                    {preview ? <Text style={styles.linePrice}>Price ready{quoteCredits(preview) != null ? ` • ${quoteCredits(preview)} credits` : ""}</Text> : null}
                  </View>
                  <View style={[styles.lineActions, { width: viewport.actionWidth }]}> 
                    {sync?.audio_url ? <AudioPlay url={String(sync.audio_url)} /> : null}
                    {canReview ? (
                      <>
                        <CompactButton label="Approve" onPress={() => void reviewLine(stage, "approved")} disabled={actionBusy} tone="primary" fill />
                        <CompactButton
                          label="Revise"
                          onPress={() => Alert.alert(
                            "Revise this line?",
                            "Only this dialogue line will be regenerated. The character voice stays unchanged.",
                            [
                              { text: "Cancel", style: "cancel" },
                              { text: "Revise", onPress: () => void reviewLine(stage, "revise") },
                            ]
                          )}
                          disabled={actionBusy}
                          fill
                        />
                      </>
                    ) : null}
                    {stage.state === "generating" ? <ActivityIndicator size="small" color={STUDIO.accent} /> : null}
                  </View>
                </View>
              </View>
            );
          })}
        </Surface>
      </ScrollView>

      <ChoiceModal
        visible={Boolean(picker)}
        title={picker?.kind === "voice" ? `Choose ${pickerParticipant?.display_name || "character"} voice` : "Choose language"}
        choices={picker?.kind === "voice" ? voiceChoices : localeChoices}
        selected={picker ? (picker.kind === "voice" ? draftVoices[picker.participantId] : draftLocales[picker.participantId]) : ""}
        loading={Boolean(picker?.kind === "voice" && voiceLoading[pickerLocale])}
        onClose={() => setPicker(null)}
        onSelect={(choice) => {
          if (!picker) return;
          if (picker.kind === "locale") {
            setDraftLocales((c) => ({ ...c, [picker.participantId]: choice.key }));
            setDraftVoices((c) => ({ ...c, [picker.participantId]: "" }));
            void loadVoices(choice.key);
          } else {
            setDraftVoices((c) => ({ ...c, [picker.participantId]: choice.key }));
          }
          setPicker(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: STUDIO.bg },
  content: { width: "100%", alignSelf: "center", paddingTop: 10, paddingBottom: 120, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  helper: { color: STUDIO.muted, fontSize: 11, fontWeight: "700" },
  voiceGrid: { gap: 10 },
  voiceGridWide: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch" },
  voiceCard: { gap: 10 },
  voiceCardWide: { flexGrow: 1, flexBasis: "46%", minWidth: 300 },
  voiceTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  voiceName: { color: STUDIO.text, fontSize: 15, fontWeight: "900" },
  voiceMeta: { color: STUDIO.accentText, fontSize: 10, fontWeight: "800", marginTop: 2 },
  selectRow: { flexDirection: "row", gap: 8 },
  select: { flex: 1, minWidth: 0, minHeight: 50, borderRadius: 11, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft, paddingHorizontal: 10, justifyContent: "center" },
  selectLabel: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.35 },
  selectValue: { color: STUDIO.text, fontSize: 11, fontWeight: "800", marginTop: 3, paddingRight: 12 },
  selectChevron: { position: "absolute", right: 8, top: 17, color: STUDIO.faint, fontSize: 17, fontWeight: "700" },
  conversationToolbar: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10 },
  toolbarText: { flex: 1, minWidth: 0 },
  toolbarTitle: { color: STUDIO.text, fontSize: 12, fontWeight: "900" },
  toolbarMeta: { color: STUDIO.muted, fontSize: 9, fontWeight: "700", marginTop: 2 },
  toolbarActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
  dialogueTable: { padding: 0, overflow: "hidden" },
  dialogueRow: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10, paddingVertical: 9 },
  sequence: { width: 18, color: STUDIO.faint, fontSize: 9, fontWeight: "900", textAlign: "center" },
  dialogueBody: { flex: 1, minWidth: 0, gap: 4 },
  dialogueHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  speaker: { flex: 1, color: STUDIO.accentText, fontSize: 10, fontWeight: "900" },
  dialogueText: { color: STUDIO.text, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  linePrice: { color: STUDIO.faint, fontSize: 8, fontWeight: "800" },
  lineActions: { flexShrink: 0, gap: 5, justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 18 },
  modalCard: { maxHeight: "78%", width: "100%", maxWidth: 560, alignSelf: "center", borderRadius: 18, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.raised, padding: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modalTitle: { flex: 1, color: STUDIO.text, fontSize: 15, fontWeight: "900" },
  modalClose: { color: STUDIO.muted, fontSize: 24, lineHeight: 28 },
  searchInput: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: "rgba(0,0,0,0.18)", color: STUDIO.text, paddingHorizontal: 10, marginTop: 10, marginBottom: 8 },
  modalLoading: { padding: 28, alignItems: "center" },
  choiceList: { paddingBottom: 8 },
  choiceRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", paddingHorizontal: 8 },
  choiceSelected: { backgroundColor: STUDIO.accentFill, borderRadius: 9 },
  choiceLabel: { color: STUDIO.text, fontSize: 11, fontWeight: "800" },
  choiceSubtitle: { color: STUDIO.muted, fontSize: 9, marginTop: 2 },
  check: { color: STUDIO.accent, fontSize: 14, fontWeight: "900" },
  empty: { color: STUDIO.muted, fontSize: 11, padding: 20, textAlign: "center" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.75 },
});
