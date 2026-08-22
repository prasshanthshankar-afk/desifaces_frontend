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
type Choice = { key: string; label: string; subtitle?: string };
type PickerKind = "locale" | "voice" | "style";
type PickerState = { kind: PickerKind; participantId: string } | null;
type AudioPlayerHandle = ReturnType<typeof createAudioPlayer>;

type SavedProfile = {
  voiceId: string;
  locale: string;
  style?: string | null;
  voiceLabel?: string;
  voiceGender?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

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

function humanGender(value: unknown) {
  const gender = normalizeGender(value);
  if (gender === "male") return "Male";
  if (gender === "female") return "Female";
  if (gender === "neutral") return "Neutral";
  return "Unspecified";
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
  const label = clean(
    p.summary?.estimated_credits_label ||
      p.summary?.display_total ||
      p.pricing?.summary?.estimated_credits_label ||
      p.pricing?.summary?.display_total
  );
  const match = label.match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function parseMeta(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function voiceStyles(voice: UiVoice | undefined): string[] {
  if (!voice) return [];
  const raw: any = voice.raw as any;
  const meta = parseMeta(raw?.meta_json);
  const source = raw?.styles || raw?.style_list || meta?.StyleList || meta?.style_list || meta?.styles || [];
  const values = Array.isArray(source)
    ? source.map(clean)
    : typeof source === "string"
      ? source.split(",").map(clean)
      : [];
  return [...new Map(values.filter(Boolean).map((value) => [value.toLowerCase(), value])).values()];
}

function localeDefaultVoice(locale: UiLocale | null | undefined) {
  return clean((locale?.raw as any)?.default_voice);
}

function persistedVoiceLocale(participant: WorkspaceParticipant) {
  return clean(participant.voice_profile_ref) ? clean(participant.preferred_locale) : "";
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.modalClose}>×</Text></Pressable>
          </View>
          {loading ? (
            <View style={styles.modalLoading}><ActivityIndicator color={STUDIO.accent} /></View>
          ) : (
            <FlatList
              data={choices}
              keyExtractor={(item) => item.key || "default"}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.choiceList}
              ListEmptyComponent={<Text style={styles.empty}>No configured options are available.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [
                    styles.choiceRow,
                    item.key === selected && styles.choiceSelected,
                    pressed && styles.pressed,
                  ]}
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
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(async () => {
    const player = playerRef.current;
    playerRef.current = null;
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
      const player = createAudioPlayer(url, {
        updateInterval: 250,
        downloadFirst: true,
        keepAudioSessionActive: true,
      });
      playerRef.current = player;
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

export default function MultiPersonAudioCharacterWorkspaceScreen({ storyId }: Props) {
  const viewport = useStudioViewport();
  const { token } = useAuth();
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [locales, setLocales] = useState<UiLocale[]>([]);
  const [voiceCache, setVoiceCache] = useState<Record<string, UiVoice[]>>({});
  const [voiceLoading, setVoiceLoading] = useState<Record<string, boolean>>({});
  const [draftLocales, setDraftLocales] = useState<Record<string, string>>({});
  const [draftVoices, setDraftVoices] = useState<Record<string, string>>({});
  const [draftStyles, setDraftStyles] = useState<Record<string, string>>({});
  const [savedProfiles, setSavedProfiles] = useState<Record<string, SavedProfile>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [previews, setPreviews] = useState<StageMap<AudioPricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<AudioSyncResult>>({});
  const [pollErrors, setPollErrors] = useState<StageMap<string>>({});
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
      next.participants.forEach((p) => {
        if (!copy[p.participant_id]) copy[p.participant_id] = persistedVoiceLocale(p);
      });
      return copy;
    });
    setDraftVoices((current) => {
      const copy = { ...current };
      next.participants.forEach((p) => {
        if (!copy[p.participant_id]) copy[p.participant_id] = clean(p.voice_profile_ref);
      });
      return copy;
    });
  }, []);

  const loadVoices = useCallback(async (locale: string) => {
    const key = clean(locale);
    if (!key || voiceCache[key] || voiceLoading[key]) return;
    setVoiceLoading((current) => ({ ...current, [key]: true }));
    try {
      const response = await fetchAudioVoices(token || undefined, key);
      if (mounted.current) {
        setVoiceCache((current) => ({ ...current, [key]: normalizeVoices(response) }));
      }
    } catch (error) {
      if (mounted.current) Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      if (mounted.current) setVoiceLoading((current) => ({ ...current, [key]: false }));
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
      const latestWorkflow = recoverable.length
        ? await getStudioWorkflow(initialWorkflow.workflow_id)
        : initialWorkflow;

      if (!mounted.current) return;
      const executableLocales = normalizeLocales(localeResponse).filter((locale) => localeDefaultVoice(locale));
      const executableByCode = new Map(executableLocales.map((locale) => [locale.code, locale]));

      setWorkspace(nextWorkspace);
      setWorkflow(latestWorkflow);
      setSyncs((current) => ({ ...current, ...recovered }));
      setLocales(executableLocales);

      // Reconcile local drafts against the executable svc-audio catalog on every
      // authoritative load. This deliberately clears stale values such as en-PK
      // when no configured provider/model can synthesize that locale.
      setDraftLocales((current) => {
        const copy = { ...current };
        nextWorkspace.participants.forEach((participant) => {
          const participantId = participant.participant_id;
          const currentLocale = clean(copy[participantId]);
          const persistedLocale = persistedVoiceLocale(participant);

          if (currentLocale && executableByCode.has(currentLocale)) return;
          copy[participantId] =
            persistedLocale && executableByCode.has(persistedLocale)
              ? persistedLocale
              : "";
        });
        return copy;
      });

      setDraftVoices((current) => {
        const copy = { ...current };
        nextWorkspace.participants.forEach((participant) => {
          const participantId = participant.participant_id;
          const persistedLocale = persistedVoiceLocale(participant);
          const persistedVoice = clean(participant.voice_profile_ref);

          if (persistedVoice && persistedLocale && executableByCode.has(persistedLocale)) {
            copy[participantId] = persistedVoice;
            return;
          }

          // A voice cannot remain selected after its locale becomes non-executable.
          const draftLocale = clean(
            persistedLocale && executableByCode.has(persistedLocale)
              ? persistedLocale
              : ""
          );
          copy[participantId] = draftLocale
            ? localeDefaultVoice(executableByCode.get(draftLocale))
            : "";
        });
        return copy;
      });
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
  const speakingIds = useMemo(
    () => new Set(stages.map((stage) => clean(stage.participant_id)).filter(Boolean)),
    [stages]
  );
  const speakers = useMemo(
    () => (workspace?.participants ?? []).filter((participant) => speakingIds.has(participant.participant_id)),
    [speakingIds, workspace]
  );
  const participantById = useMemo(
    () => new Map((workspace?.participants ?? []).map((participant) => [participant.participant_id, participant])),
    [workspace]
  );
  const dialogueByTurn = useMemo(() => {
    const map = new Map<string, any>();
    (workspace?.scenes ?? []).forEach((scene: any) => {
      (scene?.dialogue ?? []).forEach((turn: any) => {
        map.set(clean(turn?.dialogue_turn_id || turn?.turn_id), turn);
      });
    });
    return map;
  }, [workspace]);

  useEffect(() => {
    speakers.forEach((participant) => {
      const locale = clean(draftLocales[participant.participant_id]);
      if (locale) void loadVoices(locale);
    });
  }, [draftLocales, loadVoices, speakers]);

  useEffect(() => {
    if (!workflow) return;
    const generating = audioStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(async () => {
      const settled = await Promise.allSettled(
        generating.map((stage) => syncDialogueAudio(workflow.workflow_id, stage.stage_run_id))
      );
      if (!mounted.current) return;
      const patch: StageMap<AudioSyncResult> = {};
      const errors: StageMap<string> = {};
      let latest: StudioWorkflowView | null = null;
      settled.forEach((result, index) => {
        const stage = generating[index];
        if (result.status === "fulfilled") {
          patch[stage.stage_run_id] = result.value;
          latest = result.value.workflow;
        } else {
          errors[stage.stage_run_id] = errorMessage(result.reason);
        }
      });
      if (latest) setWorkflow(latest);
      setSyncs((current) => ({ ...current, ...patch }));
      if (Object.keys(errors).length) setPollErrors((current) => ({ ...current, ...errors }));
    }, 2800);
    return () => clearInterval(timer);
  }, [workflow]);

  const saveVoice = useCallback(async (participant: WorkspaceParticipant) => {
    if (!workflow) return;
    const participantId = participant.participant_id;
    const locale = clean(draftLocales[participantId]);
    const voiceId = clean(draftVoices[participantId]);
    const style = clean(draftStyles[participantId]) || null;
    if (!locale || !voiceId) {
      Alert.alert("Character voice", "Choose a language and voice first.");
      return;
    }
    setSaving((current) => ({ ...current, [participantId]: true }));
    try {
      const result = await configureParticipantVoice(workflow.workflow_id, participantId, {
        voice_id: voiceId,
        voice_locale: locale,
        style,
      });
      if (!mounted.current) return;
      setSavedProfiles((current) => ({
        ...current,
        [participantId]: {
          voiceId: result.voice_id,
          locale: result.voice_locale,
          style: result.style,
          voiceLabel: result.voice_display_name,
          voiceGender: result.voice_gender,
        },
      }));
      const nextWorkspace = await getStoryWorkspace(storyId);
      if (!mounted.current) return;
      setWorkspace(nextWorkspace);
      hydrateDrafts(nextWorkspace);
      setPreviews({});
    } catch (error) {
      Alert.alert("Character voice", errorMessage(error));
    } finally {
      if (mounted.current) setSaving((current) => ({ ...current, [participantId]: false }));
    }
  }, [draftLocales, draftStyles, draftVoices, hydrateDrafts, storyId, workflow]);

  const executableLocaleCodes = useMemo(
    () => new Set(locales.map((locale) => locale.code)),
    [locales]
  );

  const profilesReady = speakers.length > 0 && speakers.every((participant) => {
    const participantId = participant.participant_id;
    const local = savedProfiles[participantId];
    const persistedLocale = persistedVoiceLocale(participant);
    const persistedVoice = clean(participant.voice_profile_ref);

    return Boolean(
      (local?.voiceId && local?.locale && executableLocaleCodes.has(local.locale)) ||
      (persistedVoice && persistedLocale && executableLocaleCodes.has(persistedLocale))
    );
  });

  const checkConversationPrice = useCallback(async () => {
    if (!workflow) return;
    if (!profilesReady) {
      Alert.alert("Character voices", "Choose and apply one language and one voice for every speaking character first.");
      return;
    }
    const targets = audioStages(workflow).filter((stage) =>
      ["pending", "ready", "failed", "rejected"].includes(stage.state)
    );
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
      if (mounted.current) setPreviews((current) => ({ ...current, ...patch }));
      if (failures.length) Alert.alert("Conversation pricing", failures[0]);
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [profilesReady, workflow]);

  const generateConversation = useCallback(async () => {
    if (!workflow) return;
    const targets = audioStages(workflow).filter((stage) => Boolean(previews[stage.stage_run_id]));
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
      if (failed && failed.status === "rejected") {
        Alert.alert("Audio Studio", errorMessage(failed.reason));
      }
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
        setPreviews((currentPreviews) => {
          const copy = { ...currentPreviews };
          delete copy[stage.stage_run_id];
          return copy;
        });
        setSyncs((currentSyncs) => {
          const copy = { ...currentSyncs };
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
    const ready = audioStages(workflow).filter(
      (stage) => stage.state === "awaiting_review" && latestPendingReview(stage)
    );
    if (!ready.length) return;
    setActionBusy(true);
    try {
      let latest = workflow;
      for (const stage of ready) {
        const authoritative = await getStudioWorkflow(latest.workflow_id);
        const current = audioStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id);
        const pending = latestPendingReview(current);
        if (!pending) {
          latest = authoritative;
          continue;
        }
        latest = await reviewStudioOutput(pending.review_item_id, "approved");
      }
      if (latest.current_stage === "fusion") {
        latest = await advanceStudioWorkflow(latest.workflow_id).catch(() => latest);
      }
      if (mounted.current) setWorkflow(latest);
    } catch (error) {
      Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [workflow]);

  const openMenu = useCallback(() => {
    router.push({
      pathname: "/(tabs)/dashboard" as any,
      params: { openMenu: "1", menu_nonce: `${Date.now()}`, menu_source: "story_audio" },
    } as any);
  }, []);
  const openPlan = useCallback(() => {
    router.push({
      pathname: "/(tabs)/billing" as any,
      params: { intent: "manage", source: "story_audio" },
    } as any);
  }, []);

  if (loading && !workflow) {
    return (
      <View style={styles.safe}>
        <DFHeader subtitle="Story Audio Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={STUDIO.accent} />
          <Text style={styles.helper}>Preparing character voices…</Text>
        </View>
      </View>
    );
  }

  const approved = stages.filter((stage) => stage.state === "approved").length;
  const reviewReady = stages.filter((stage) => stage.state === "awaiting_review").length;
  const pricedCount = Object.keys(previews).length;
  const totalCredits = Object.values(previews).reduce(
    (sum, preview) => sum + (quoteCredits(preview) || 0),
    0
  );

  const pickerParticipant = picker ? participantById.get(picker.participantId) : undefined;
  const pickerLocale = pickerParticipant
    ? clean(draftLocales[pickerParticipant.participant_id])
    : "";
  const pickerVoiceId = pickerParticipant
    ? clean(draftVoices[pickerParticipant.participant_id])
    : "";
  const pickerVoice = (voiceCache[pickerLocale] ?? []).find((voice) => voice.key === pickerVoiceId);

  const localeChoices: Choice[] = locales.map((locale) => ({
    key: locale.code,
    label: locale.label,
    subtitle: locale.code,
  }));
  // Deliberately expose the complete provider/masterdata voice list for the
  // selected language. Face gender is not a voice-selection restriction.
  const voiceChoices: Choice[] = (voiceCache[pickerLocale] ?? []).map((voice) => ({
    key: voice.key,
    label: clean((voice.raw as any)?.display_name) || voice.label,
    subtitle: `${humanGender((voice.raw as any)?.gender)} • ${voice.locale}`,
  }));
  const styleChoices: Choice[] = [
    { key: "", label: "Natural / provider default", subtitle: "No style override" },
    ...voiceStyles(pickerVoice).map((style) => ({ key: style, label: humanState(style) })),
  ];

  return (
    <View style={styles.safe}>
      <DFHeader subtitle="Story Audio Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { maxWidth: viewport.contentMaxWidth, paddingHorizontal: viewport.horizontalPadding },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={STUDIO.accent}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        <StudioHero
          eyebrow="STORY AUDIO STUDIO"
          title={workspace?.title || "Character voices"}
          subtitle="Choose each character's language, voice and delivery. The same profile is used consistently for every line that character speaks."
          right={<ProgressLine current={approved} total={stages.length} label="Audio" />}
        />

        <SectionLabel
          title="Character voices"
          meta={`${speakers.length} speaker${speakers.length === 1 ? "" : "s"}`}
        />

        {!speakers.length ? (
          <Surface style={styles.notice}>
            <Text style={styles.noticeTitle}>Speaker mapping unavailable</Text>
            <Text style={styles.noticeBody}>
              Refresh after updating the app. Audio generation is blocked until every dialogue turn is mapped to its character.
            </Text>
          </Surface>
        ) : null}

        <View style={[styles.voiceGrid, viewport.wide && styles.voiceGridWide]}>
          {speakers.map((participant) => {
            const participantId = participant.participant_id;
            const locale = clean(draftLocales[participantId]);
            const voiceId = clean(draftVoices[participantId]);
            const selectedVoice = (voiceCache[locale] ?? []).find((voice) => voice.key === voiceId);
            const style = clean(draftStyles[participantId]);
            const saved = savedProfiles[participantId];
            const lineCount = stages.filter((stage) => clean(stage.participant_id) === participantId).length;
            const locked = stages
              .filter((stage) => clean(stage.participant_id) === participantId)
              .some((stage) => ["generating", "awaiting_review", "approved"].includes(stage.state));
            const persisted = Boolean(
              saved ||
              (clean(participant.voice_profile_ref) === voiceId && clean(participant.preferred_locale) === locale && voiceId && locale)
            );

            return (
              <Surface
                key={participantId}
                accent={persisted}
                style={[styles.voiceCard, viewport.wide && styles.voiceCardWide]}
              >
                <View style={styles.voiceTop}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.voiceName} numberOfLines={1}>
                      {participant.display_name || "Character"}
                    </Text>
                    <Text style={styles.voiceMeta}>
                      {lineCount} line{lineCount === 1 ? "" : "s"}
                      {selectedVoice ? ` • ${humanGender((selectedVoice.raw as any)?.gender)} voice` : ""}
                    </Text>
                  </View>
                  <StatusPill
                    value={persisted ? "SET" : locked ? "LOCKED" : "CHOOSE"}
                    tone={persisted ? "success" : locked ? "accent" : "neutral"}
                  />
                </View>

                <View style={styles.selectGrid}>
                  <Pressable
                    disabled={locked}
                    onPress={() => setPicker({ kind: "locale", participantId })}
                    style={({ pressed }) => [styles.select, locked && styles.disabled, pressed && !locked && styles.pressed]}
                  >
                    <Text style={styles.selectLabel}>Language</Text>
                    <Text style={styles.selectValue} numberOfLines={1}>
                      {locales.find((item) => item.code === locale)?.label || locale || "Choose"}
                    </Text>
                    <Text style={styles.selectChevron}>›</Text>
                  </Pressable>

                  <Pressable
                    disabled={locked || !locale}
                    onPress={() => {
                      void loadVoices(locale);
                      setPicker({ kind: "voice", participantId });
                    }}
                    style={({ pressed }) => [styles.select, locked && styles.disabled, pressed && !locked && styles.pressed]}
                  >
                    <Text style={styles.selectLabel}>Voice</Text>
                    <Text style={styles.selectValue} numberOfLines={1}>
                      {selectedVoice
                        ? clean((selectedVoice.raw as any)?.display_name) || selectedVoice.label
                        : saved?.voiceLabel || voiceId || "Choose"}
                    </Text>
                    <Text style={styles.selectChevron}>›</Text>
                  </Pressable>

                  <Pressable
                    disabled={locked || !selectedVoice || voiceStyles(selectedVoice).length === 0}
                    onPress={() => setPicker({ kind: "style", participantId })}
                    style={({ pressed }) => [
                      styles.select,
                      (locked || !selectedVoice || voiceStyles(selectedVoice).length === 0) && styles.disabled,
                      pressed && !locked && styles.pressed,
                    ]}
                  >
                    <Text style={styles.selectLabel}>Delivery</Text>
                    <Text style={styles.selectValue} numberOfLines={1}>
                      {style ? humanState(style) : "Natural / default"}
                    </Text>
                    <Text style={styles.selectChevron}>›</Text>
                  </Pressable>
                </View>

                {!locked ? (
                  <CompactButton
                    label={saving[participantId] ? "Saving…" : persisted ? "Update voice" : "Apply voice"}
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

        <SectionLabel
          title="Conversation audio"
          meta={`${approved} approved • ${reviewReady} ready`}
        />
        <Surface style={styles.conversationToolbar} accent={pricedCount > 0}>
          <View style={styles.toolbarText}>
            <Text style={styles.toolbarTitle}>{stages.length} dialogue turns</Text>
            <Text style={styles.toolbarMeta}>
              {!profilesReady
                ? "Set every character voice before pricing"
                : pricedCount
                  ? `${pricedCount} priced${totalCredits ? ` • ${totalCredits} credits` : ""}`
                  : "Ready for conversation pricing"}
            </Text>
          </View>
          <View style={styles.toolbarActions}>
            <CompactButton
              label={actionBusy ? "Working…" : "Check price"}
              onPress={() => void checkConversationPrice()}
              disabled={actionBusy || !profilesReady}
            />
            <CompactButton
              label="Generate"
              onPress={() => void generateConversation()}
              disabled={actionBusy || pricedCount === 0 || !profilesReady}
              tone="primary"
            />
            <CompactButton
              label={`Approve ${reviewReady || "ready"}`}
              onPress={() => void approveReady()}
              disabled={actionBusy || reviewReady === 0}
            />
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
            const failure =
              sync?.error_message ||
              pollErrors[stage.stage_run_id] ||
              clean(stage.metadata?.last_error || stage.metadata?.error_message);

            return (
              <View key={stage.stage_run_id}>
                {index ? <Divider /> : null}
                <View style={styles.dialogueRow}>
                  <Text style={styles.sequence}>{index + 1}</Text>
                  <View style={styles.dialogueBody}>
                    <View style={styles.dialogueHead}>
                      <Text style={styles.speaker} numberOfLines={1}>
                        {participant?.display_name || sync?.display_name || "Speaker"}
                      </Text>
                      <StatusPill value={humanState(stage.state)} tone={stageTone(stage.state)} />
                    </View>
                    <Text style={styles.dialogueText} numberOfLines={viewport.compact ? 2 : 3}>
                      {text}
                    </Text>
                    {preview ? (
                      <Text style={styles.linePrice}>
                        Price ready{quoteCredits(preview) != null ? ` • ${quoteCredits(preview)} credits` : ""}
                      </Text>
                    ) : null}
                    {failure ? <Text style={styles.errorText} numberOfLines={2}>{failure}</Text> : null}
                  </View>
                  <View style={[styles.lineActions, { width: viewport.actionWidth }]}>
                    {sync?.audio_url ? <AudioPlay url={String(sync.audio_url)} /> : null}
                    {canReview ? (
                      <>
                        <CompactButton
                          label="Approve"
                          onPress={() => void reviewLine(stage, "approved")}
                          disabled={actionBusy}
                          tone="primary"
                          fill
                        />
                        <CompactButton
                          label="Revise"
                          onPress={() => Alert.alert(
                            "Revise this line?",
                            "Only this dialogue line will be regenerated. The character voice remains unchanged.",
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
        title={
          picker?.kind === "voice"
            ? `Choose ${pickerParticipant?.display_name || "character"} voice`
            : picker?.kind === "style"
              ? "Choose delivery"
              : "Choose language"
        }
        choices={picker?.kind === "voice" ? voiceChoices : picker?.kind === "style" ? styleChoices : localeChoices}
        selected={
          picker
            ? picker.kind === "voice"
              ? draftVoices[picker.participantId]
              : picker.kind === "style"
                ? draftStyles[picker.participantId] || ""
                : draftLocales[picker.participantId]
            : ""
        }
        loading={Boolean(picker?.kind === "voice" && voiceLoading[pickerLocale])}
        onClose={() => setPicker(null)}
        onSelect={(choice) => {
          if (!picker) return;
          if (picker.kind === "locale") {
            const selectedLocale = locales.find((locale) => locale.code === choice.key);
            const defaultVoice = localeDefaultVoice(selectedLocale);
            setDraftLocales((current) => ({ ...current, [picker.participantId]: choice.key }));
            setDraftVoices((current) => ({ ...current, [picker.participantId]: defaultVoice }));
            setDraftStyles((current) => ({ ...current, [picker.participantId]: "" }));
            void loadVoices(choice.key);
          } else if (picker.kind === "voice") {
            setDraftVoices((current) => ({ ...current, [picker.participantId]: choice.key }));
            setDraftStyles((current) => ({ ...current, [picker.participantId]: "" }));
          } else {
            setDraftStyles((current) => ({ ...current, [picker.participantId]: choice.key }));
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
  notice: { gap: 4, padding: 10 },
  noticeTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  noticeBody: { color: STUDIO.muted, fontSize: 9, lineHeight: 14, fontWeight: "600" },
  voiceGrid: { gap: 10 },
  voiceGridWide: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch" },
  voiceCard: { gap: 10 },
  voiceCardWide: { flexGrow: 1, flexBasis: "46%", minWidth: 300 },
  voiceTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  voiceName: { color: STUDIO.text, fontSize: 15, fontWeight: "900" },
  voiceMeta: { color: STUDIO.accentText, fontSize: 10, fontWeight: "800", marginTop: 2 },
  selectGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  select: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 116,
    minHeight: 50,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surfaceSoft,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
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
  errorText: { color: "#FFC0C6", fontSize: 8, lineHeight: 12, fontWeight: "700" },
  lineActions: { flexShrink: 0, gap: 5, justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 18 },
  modalCard: { maxHeight: "78%", width: "100%", maxWidth: 560, alignSelf: "center", borderRadius: 18, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.raised, padding: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modalTitle: { flex: 1, color: STUDIO.text, fontSize: 15, fontWeight: "900" },
  modalClose: { color: STUDIO.muted, fontSize: 24, lineHeight: 28 },
  modalLoading: { padding: 28, alignItems: "center" },
  choiceList: { paddingBottom: 8 },
  choiceRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.05)", paddingHorizontal: 8 },
  choiceSelected: { backgroundColor: STUDIO.accentFill, borderRadius: 9 },
  choiceLabel: { color: STUDIO.text, fontSize: 11, fontWeight: "800" },
  choiceSubtitle: { color: STUDIO.muted, fontSize: 9, marginTop: 2 },
  check: { color: STUDIO.accent, fontSize: 14, fontWeight: "900" },
  empty: { color: STUDIO.muted, fontSize: 11, padding: 20, textAlign: "center" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.76 },
});
