import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from "expo-audio";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DF } from "../../core/theme/colors";
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
  type AudioPricingPreview,
  type AudioSyncResult,
  configureParticipantVoice,
  dispatchDialogueAudio,
  ensureStoryStudioWorkflow,
  getStoryWorkspace,
  getStudioWorkflow,
  latestPendingReview,
  previewDialogueAudio,
  reviewStudioOutput,
  type StudioStageView,
  type StudioWorkflowView,
  type StoryWorkspaceView,
  syncDialogueAudio,
  type WorkspaceParticipant,
} from "./api/multiPersonStory";

type Props = { storyId: string };
type StageMap<T> = Record<string, T>;
type AudioPlayerHandle = ReturnType<typeof createAudioPlayer>;
type PickerKind = "locale" | "voice";
type PickerState = { kind: PickerKind; participantId: string } | null;

type Choice = {
  key: string;
  label: string;
  subtitle?: string | null;
};

const BRAND = {
  background: (DF as any)?.night ?? "#080A0F",
  surface: (DF as any)?.night2 ?? "#121620",
  surfaceRaised: "#171C27",
  text: (DF as any)?.text ?? "#FFFFFF",
  muted: (DF as any)?.muted ?? "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.42)",
  border: (DF as any)?.border ?? "rgba(255,255,255,0.09)",
  accent: "#D6B172",
  accentStrong: "#E7C98F",
  accentFill: "rgba(214,177,114,0.10)",
  accentBorder: "rgba(214,177,114,0.32)",
  success: "#32D74B",
  danger: "#FF6B78",
};

function errorMessage(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string") return detail.replace(/_/g, " ");
  if (typeof detail?.message === "string") return detail.message;
  if (typeof error?.message === "string") return error.message;
  return "Something went wrong";
}

function clean(value: unknown) {
  return String(value ?? "").trim();
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
  return normalizeGender(
    persona.gender ??
      persona.gender_presentation ??
      persona.sex ??
      persona.voice_gender
  );
}

function humanGender(value: string) {
  if (value === "male") return "Male";
  if (value === "female") return "Female";
  if (value === "neutral") return "Neutral";
  return "Voice";
}

function voiceGender(voice: UiVoice) {
  return normalizeGender((voice.raw as any)?.gender);
}

function quoteCredits(preview: AudioPricingPreview | null | undefined): number | null {
  const pricing: any = preview?.pricing ?? {};
  const direct = [
    pricing?.estimated_credits,
    pricing?.credits,
    pricing?.pricing?.estimated_credits,
    pricing?.pricing?.credits,
  ];
  for (const value of direct) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const labels = [
    pricing?.summary?.estimated_credits_label,
    pricing?.summary?.display_total,
    pricing?.pricing?.summary?.estimated_credits_label,
    pricing?.pricing?.summary?.display_total,
  ];
  for (const value of labels) {
    const match = clean(value).match(/([0-9]+(?:\.[0-9]+)?)/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function Button({
  label,
  onPress,
  disabled,
  secondary,
  compact,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.buttonSecondary,
        compact && styles.buttonCompact,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  onPress,
  disabled,
}: {
  label: string;
  value?: string | null;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectField,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.selectLabel}>{label}</Text>
        <Text style={[styles.selectValue, !value && styles.selectPlaceholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function ChoiceModal({
  visible,
  title,
  choices,
  selectedKey,
  loading,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  choices: Choice[];
  selectedKey?: string | null;
  loading?: boolean;
  onClose: () => void;
  onSelect: (choice: Choice) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    return choices.filter((item) =>
      `${item.label} ${item.subtitle || ""}`.toLowerCase().includes(q)
    );
  }, [choices, query]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.modalClose}>×</Text>
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={BRAND.faint}
            style={styles.searchInput}
          />
          {loading ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator color={BRAND.accent} />
              <Text style={styles.helper}>Loading available voices…</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.choiceList}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No matching options are available.</Text>
              }
              renderItem={({ item }) => {
                const selected = item.key === selectedKey;
                return (
                  <Pressable
                    onPress={() => onSelect(item)}
                    style={({ pressed }) => [
                      styles.choiceRow,
                      selected && styles.choiceRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.choiceLabel}>{item.label}</Text>
                      {item.subtitle ? (
                        <Text style={styles.choiceSubtitle}>{item.subtitle}</Text>
                      ) : null}
                    </View>
                    {selected ? <Text style={styles.choiceCheck}>✓</Text> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function AudioPreviewButton({ url }: { url: string }) {
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(async () => {
    const player = playerRef.current;
    playerRef.current = null;
    setPlaying(false);
    if (!player) return;
    try {
      await Promise.resolve((player as any)?.pause?.());
    } catch {}
    try {
      await Promise.resolve((player as any)?.seekTo?.(0));
    } catch {}
    try {
      await Promise.resolve((player as any)?.release?.());
    } catch {}
  }, []);

  useEffect(() => () => void stop(), [stop]);

  const toggle = useCallback(async () => {
    if (busy) return;
    if (playing) {
      await stop();
      return;
    }
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
      player.muted = false;
      player.volume = 1;
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

  return (
    <Button
      label={busy ? "Preparing…" : playing ? "Stop" : "Play"}
      onPress={() => void toggle()}
      disabled={busy}
      secondary
      compact
    />
  );
}

export default function MultiPersonAudioCohortScreen({ storyId }: Props) {
  const { token } = useAuth();
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [locales, setLocales] = useState<UiLocale[]>([]);
  const [voiceCache, setVoiceCache] = useState<Record<string, UiVoice[]>>({});
  const [voiceLoading, setVoiceLoading] = useState<Record<string, boolean>>({});
  const [draftLocales, setDraftLocales] = useState<Record<string, string>>({});
  const [draftVoices, setDraftVoices] = useState<Record<string, string>>({});
  const [savingParticipant, setSavingParticipant] = useState<Record<string, boolean>>({});
  const [previews, setPreviews] = useState<StageMap<AudioPricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<AudioSyncResult>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [picker, setPicker] = useState<PickerState>(null);
  const mounted = useRef(true);
  const pollingRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const hydrateDrafts = useCallback((nextWorkspace: StoryWorkspaceView) => {
    setDraftLocales((current) => {
      const next = { ...current };
      nextWorkspace.participants.forEach((participant) => {
        if (!next[participant.participant_id]) {
          next[participant.participant_id] = clean(participant.preferred_locale);
        }
      });
      return next;
    });
    setDraftVoices((current) => {
      const next = { ...current };
      nextWorkspace.participants.forEach((participant) => {
        if (!next[participant.participant_id]) {
          next[participant.participant_id] = clean(participant.voice_profile_ref);
        }
      });
      return next;
    });
  }, []);

  const loadVoices = useCallback(
    async (locale: string) => {
      const key = clean(locale);
      if (!key || voiceCache[key] || voiceLoading[key]) return;
      setVoiceLoading((current) => ({ ...current, [key]: true }));
      try {
        const response = await fetchAudioVoices(token || undefined, key);
        const voices = normalizeVoices(response);
        if (mounted.current) {
          setVoiceCache((current) => ({ ...current, [key]: voices }));
        }
      } catch (error) {
        if (mounted.current) Alert.alert("Audio Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setVoiceLoading((current) => ({ ...current, [key]: false }));
        }
      }
    },
    [token, voiceCache, voiceLoading]
  );

  const load = useCallback(
    async (quiet = false) => {
      if (!storyId) return;
      if (!quiet) setLoading(true);
      try {
        const [nextWorkspace, initialWorkflow] = await Promise.all([
          getStoryWorkspace(storyId),
          ensureStoryStudioWorkflow(storyId),
        ]);

        const recoverable = audioStages(initialWorkflow).filter((stage) =>
          ["generating", "awaiting_review", "approved"].includes(stage.state)
        );
        const recovered: StageMap<AudioSyncResult> = {};
        if (recoverable.length) {
          const results = await Promise.allSettled(
            recoverable.map((stage) =>
              syncDialogueAudio(initialWorkflow.workflow_id, stage.stage_run_id)
            )
          );
          results.forEach((result, index) => {
            if (result.status === "fulfilled") {
              recovered[recoverable[index].stage_run_id] = result.value;
            }
          });
        }
        const latestWorkflow = recoverable.length
          ? await getStudioWorkflow(initialWorkflow.workflow_id)
          : initialWorkflow;

        if (!mounted.current) return;
        setWorkspace(nextWorkspace);
        setWorkflow(latestWorkflow);
        setSyncs((current) => ({ ...current, ...recovered }));
        hydrateDrafts(nextWorkspace);
      } catch (error) {
        Alert.alert("Audio Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [storyId, hydrateDrafts]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetchAudioLocales(token || undefined);
        const next = normalizeLocales(response);
        if (mounted.current) setLocales(next);
      } catch (error) {
        if (mounted.current) Alert.alert("Audio Studio", errorMessage(error));
      }
    })();
  }, [token]);

  useEffect(() => {
    (workspace?.participants ?? []).forEach((participant) => {
      const locale = clean(
        draftLocales[participant.participant_id] || participant.preferred_locale
      );
      if (locale) void loadVoices(locale);
    });
  }, [workspace, draftLocales, loadVoices]);

  const stages = useMemo(() => audioStages(workflow), [workflow]);
  const turns = useMemo(
    () =>
      (workspace?.scenes ?? []).flatMap((scene: any) =>
        (scene?.dialogue ?? []).map((turn: any) => ({
          ...turn,
          scene_id: scene?.scene_id,
        }))
      ),
    [workspace]
  );
  const turnById = useMemo(
    () => new Map(turns.map((turn: any) => [clean(turn.dialogue_turn_id), turn])),
    [turns]
  );
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
  const spokenParticipants = useMemo(
    () =>
      (workspace?.participants ?? []).filter((participant) =>
        turns.some(
          (turn: any) => clean(turn.speaker_participant_id) === participant.participant_id
        )
      ),
    [workspace, turns]
  );

  const participantIdForStage = useCallback(
    (stage: StudioStageView) => {
      const metadataId = clean(stage.metadata?.speaker_participant_id);
      if (metadataId) return metadataId;
      const turn = turnById.get(clean(stage.dialogue_turn_id));
      return clean(turn?.speaker_participant_id);
    },
    [turnById]
  );

  const syncGenerating = useCallback(async () => {
    if (!workflow || pollingRef.current) return;
    const generating = audioStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    pollingRef.current = true;
    try {
      const results = await Promise.allSettled(
        generating.map((stage) => syncDialogueAudio(workflow.workflow_id, stage.stage_run_id))
      );
      if (!mounted.current) return;
      setSyncs((current) => {
        const next = { ...current };
        results.forEach((result, index) => {
          if (result.status === "fulfilled") {
            next[generating[index].stage_run_id] = result.value;
          }
        });
        return next;
      });
      const latest = await getStudioWorkflow(workflow.workflow_id);
      if (mounted.current) setWorkflow(latest);
    } finally {
      pollingRef.current = false;
    }
  }, [workflow]);

  useEffect(() => {
    if (!workflow || !audioStages(workflow).some((stage) => stage.state === "generating")) return;
    const timer = setInterval(() => void syncGenerating(), 2800);
    return () => clearInterval(timer);
  }, [workflow, syncGenerating]);

  const voiceChoicesFor = useCallback(
    (participant: WorkspaceParticipant) => {
      const locale = clean(
        draftLocales[participant.participant_id] || participant.preferred_locale
      );
      const expected = participantGender(participant);
      const voices = voiceCache[locale] ?? [];
      return voices.filter((voice) => {
        if (!['male', 'female'].includes(expected)) return true;
        return voiceGender(voice) === expected;
      });
    },
    [draftLocales, voiceCache]
  );

  const saveVoice = useCallback(
    async (participant: WorkspaceParticipant, voice: UiVoice) => {
      if (!workflow) return;
      const locale = clean(
        draftLocales[participant.participant_id] || participant.preferred_locale
      );
      if (!locale) {
        Alert.alert("Audio Studio", "Choose a language before selecting a voice.");
        return;
      }
      setSavingParticipant((current) => ({ ...current, [participant.participant_id]: true }));
      try {
        await configureParticipantVoice(workflow.workflow_id, participant.participant_id, {
          voice_id: voice.key,
          voice_locale: locale,
        });
        const nextWorkspace = await getStoryWorkspace(storyId);
        if (!mounted.current) return;
        setWorkspace(nextWorkspace);
        setDraftVoices((current) => ({
          ...current,
          [participant.participant_id]: voice.key,
        }));
        hydrateDrafts(nextWorkspace);
        setPreviews({});
      } catch (error) {
        Alert.alert("Audio Studio", errorMessage(error));
      } finally {
        if (mounted.current) {
          setSavingParticipant((current) => ({ ...current, [participant.participant_id]: false }));
        }
      }
    },
    [workflow, draftLocales, storyId, hydrateDrafts]
  );

  const allVoicesReady = useMemo(
    () =>
      spokenParticipants.length > 0 &&
      spokenParticipants.every(
        (participant) =>
          clean(participant.voice_profile_ref) && clean(participant.preferred_locale)
      ),
    [spokenParticipants]
  );

  const priceableStages = useMemo(
    () =>
      stages.filter((stage) =>
        ["pending", "ready", "failed", "rejected"].includes(stage.state)
      ),
    [stages]
  );

  const quotedPrice = useMemo(() => {
    const values = Object.values(previews);
    if (!values.length) return null;
    const credits = values.map(quoteCredits);
    if (credits.every((value) => value != null)) {
      const total = credits.reduce((sum, value) => sum + Number(value || 0), 0);
      return `${Number.isInteger(total) ? total : total.toFixed(1)} credits`;
    }
    return `${values.length} priced dialogue clip${values.length === 1 ? "" : "s"}`;
  }, [previews]);

  const checkConversationPrice = useCallback(async () => {
    if (!workflow) return;
    if (!allVoicesReady) {
      Alert.alert("Audio Studio", "Choose one language and voice for every speaking character first.");
      return;
    }
    if (!priceableStages.length) return;
    setActionBusy(true);
    try {
      const results = await Promise.all(
        priceableStages.map((stage) =>
          previewDialogueAudio(workflow.workflow_id, stage.stage_run_id)
        )
      );
      if (!mounted.current) return;
      const next: StageMap<AudioPricingPreview> = {};
      results.forEach((result) => {
        next[result.stage_run_id] = result;
      });
      setPreviews(next);
    } catch (error) {
      Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [workflow, allVoicesReady, priceableStages]);

  const generateConversation = useCallback(async () => {
    if (!workflow) return;
    const missingQuote = priceableStages.find((stage) => !previews[stage.stage_run_id]);
    if (missingQuote) {
      await checkConversationPrice();
      return;
    }
    if (!priceableStages.length) return;

    Alert.alert(
      "Generate conversation audio?",
      `${quotedPrice || "The displayed price"} will be confirmed. Each character keeps the same selected voice across all of their dialogue.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          onPress: () => {
            void (async () => {
              setActionBusy(true);
              try {
                await Promise.all(
                  priceableStages.map((stage) =>
                    dispatchDialogueAudio(
                      workflow.workflow_id,
                      stage.stage_run_id,
                      audioPricingQuote(previews[stage.stage_run_id])
                    )
                  )
                );
                const latest = await getStudioWorkflow(workflow.workflow_id);
                if (!mounted.current) return;
                setWorkflow(latest);
                setPreviews({});
              } catch (error) {
                Alert.alert("Audio Studio", errorMessage(error));
              } finally {
                if (mounted.current) setActionBusy(false);
              }
            })();
          },
        },
      ]
    );
  }, [workflow, priceableStages, previews, quotedPrice, checkConversationPrice]);

  const approveAll = useCallback(async () => {
    if (!workflow) return;
    setActionBusy(true);
    try {
      const authoritative = await getStudioWorkflow(workflow.workflow_id);
      const pending = audioStages(authoritative)
        .filter((stage) => stage.state === "awaiting_review")
        .map((stage) => latestPendingReview(stage))
        .filter(Boolean) as NonNullable<ReturnType<typeof latestPendingReview>>[];
      if (!pending.length) {
        setWorkflow(authoritative);
        return;
      }
      await Promise.all(
        pending.map((review) => reviewStudioOutput(review.review_item_id, "approved"))
      );
      const next = await advanceStudioWorkflow(workflow.workflow_id);
      if (!mounted.current) return;
      setWorkflow(next);
      await load(true);
    } catch (error) {
      Alert.alert("Audio Studio", errorMessage(error));
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [workflow, load]);

  const reviseTurn = useCallback(
    async (stage: StudioStageView) => {
      if (!workflow) return;
      setActionBusy(true);
      try {
        const authoritative = await getStudioWorkflow(workflow.workflow_id);
        const current = audioStages(authoritative).find(
          (item) => item.stage_run_id === stage.stage_run_id
        );
        const pending = latestPendingReview(current);
        if (!pending) {
          setWorkflow(authoritative);
          return;
        }
        const next = await reviewStudioOutput(pending.review_item_id, "revise");
        if (!mounted.current) return;
        setWorkflow(next);
        setSyncs((currentSyncs) => {
          const copy = { ...currentSyncs };
          delete copy[stage.stage_run_id];
          return copy;
        });
      } catch (error) {
        Alert.alert("Audio Studio", errorMessage(error));
      } finally {
        if (mounted.current) setActionBusy(false);
      }
    },
    [workflow]
  );

  const openPlanScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: { intent: "manage", source: "story_audio" },
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
        menu_source: "story_audio",
      },
    } as any);
  }, []);

  if (loading && !workflow) {
    return (
      <View style={styles.safe}>
        <DFHeader subtitle="Story Audio Studio" onMenuPress={openHamburgerMenu} onPressMeta={openPlanScreen} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={BRAND.accent} />
          <Text style={styles.helper}>Preparing character voices…</Text>
        </View>
      </View>
    );
  }

  const required = stages.length;
  const approved = stages.filter((stage) => stage.state === "approved").length;
  const awaitingReview = stages.filter((stage) => stage.state === "awaiting_review").length;
  const generating = stages.filter((stage) => stage.state === "generating").length;
  const failed = stages.filter((stage) => ["failed", "rejected"].includes(stage.state)).length;
  const audioReady = required > 0 && approved === required;
  const faceBlocked = workflow?.current_stage === "face";
  const canApproveAll = awaitingReview > 0 && generating === 0;

  const activePickerParticipant = picker
    ? participantById.get(picker.participantId) ?? null
    : null;
  const activeLocale = activePickerParticipant
    ? clean(
        draftLocales[activePickerParticipant.participant_id] ||
          activePickerParticipant.preferred_locale
      )
    : "";
  const pickerChoices: Choice[] = !picker
    ? []
    : picker.kind === "locale"
      ? locales.map((locale) => ({
          key: locale.code,
          label: locale.label || locale.code,
          subtitle: locale.nativeName && locale.nativeName !== locale.label ? locale.nativeName : locale.code,
        }))
      : activePickerParticipant
        ? voiceChoicesFor(activePickerParticipant).map((voice) => ({
            key: voice.key,
            label: clean((voice.raw as any)?.display_name) || voice.label || voice.key,
            subtitle: `${humanGender(voiceGender(voice))} • ${voice.locale}`,
          }))
        : [];

  return (
    <View style={styles.safe}>
      <DFHeader subtitle="Story Audio Studio" onMenuPress={openHamburgerMenu} onPressMeta={openPlanScreen} />

      <ChoiceModal
        visible={Boolean(picker)}
        title={picker?.kind === "locale" ? "Choose language" : "Choose voice"}
        choices={pickerChoices}
        selectedKey={
          picker?.kind === "locale"
            ? activeLocale
            : activePickerParticipant
              ? clean(
                  draftVoices[activePickerParticipant.participant_id] ||
                    activePickerParticipant.voice_profile_ref
                )
              : null
        }
        loading={picker?.kind === "voice" && Boolean(voiceLoading[activeLocale])}
        onClose={() => setPicker(null)}
        onSelect={(choice) => {
          if (!picker || !activePickerParticipant) return;
          if (picker.kind === "locale") {
            setDraftLocales((current) => ({
              ...current,
              [activePickerParticipant.participant_id]: choice.key,
            }));
            setDraftVoices((current) => ({
              ...current,
              [activePickerParticipant.participant_id]: "",
            }));
            setPicker(null);
            void loadVoices(choice.key);
            return;
          }
          const voice = (voiceCache[activeLocale] ?? []).find(
            (item) => item.key === choice.key
          );
          setPicker(null);
          if (voice) void saveVoice(activePickerParticipant, voice);
        }}
      />

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
          <Text style={styles.eyebrow}>VOICE CAST</Text>
          <Text style={styles.title}>{workspace?.title || "Story voices"}</Text>
          <Text style={styles.subtitle}>
            Choose one voice for each character. That voice stays consistent across the entire conversation.
          </Text>
        </View>

        {faceBlocked ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Finish Face approval first</Text>
            <Text style={styles.noticeBody}>
              Character voices unlock after the complete Face cast is approved.
            </Text>
            <Button
              label="Return to Face Studio"
              secondary
              onPress={() =>
                router.replace({
                  pathname: "/(tabs)/face/story/[storyId]" as any,
                  params: { storyId, stage: "face" },
                } as any)
              }
            />
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>Character voices</Text>
            <Text style={styles.sectionHint}>
              {spokenParticipants.length} speaking character{spokenParticipants.length === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={[styles.readyPill, allVoicesReady && styles.readyPillOn]}>
            <Text style={styles.readyPillText}>{allVoicesReady ? "READY" : "SET VOICES"}</Text>
          </View>
        </View>

        {spokenParticipants.map((participant) => {
          const id = participant.participant_id;
          const gender = participantGender(participant);
          const locale = clean(draftLocales[id] || participant.preferred_locale);
          const voiceId = clean(draftVoices[id] || participant.voice_profile_ref);
          const available = voiceCache[locale] ?? [];
          const selectedVoice = available.find((voice) => voice.key === voiceId);
          const lineCount = turns.filter(
            (turn: any) => clean(turn.speaker_participant_id) === id
          ).length;
          const saving = Boolean(savingParticipant[id]);
          const voiceReady = Boolean(clean(participant.voice_profile_ref) && clean(participant.preferred_locale));

          return (
            <View key={id} style={[styles.voiceCard, voiceReady && styles.voiceCardReady]}>
              <View style={styles.voiceCardHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {clean(participant.display_name).slice(0, 1).toUpperCase() || "•"}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.characterName}>{participant.display_name || "Character"}</Text>
                  <Text style={styles.characterMeta}>
                    {humanGender(gender)} voice • {lineCount} line{lineCount === 1 ? "" : "s"}
                  </Text>
                </View>
                {saving ? (
                  <ActivityIndicator color={BRAND.accent} />
                ) : voiceReady ? (
                  <Text style={styles.lockedMark}>✓</Text>
                ) : null}
              </View>

              <SelectField
                label="Language"
                value={
                  locales.find((item) => item.code === locale)?.label || locale
                }
                placeholder="Choose language"
                disabled={faceBlocked || saving || stages.some((stage) => {
                  const stageParticipantId = participantIdForStage(stage);
                  return stageParticipantId === id && ["generating", "awaiting_review", "approved"].includes(stage.state);
                })}
                onPress={() => setPicker({ kind: "locale", participantId: id })}
              />

              <SelectField
                label="Voice"
                value={
                  selectedVoice
                    ? clean((selectedVoice.raw as any)?.display_name) || selectedVoice.label
                    : voiceId
                }
                placeholder={locale ? `Choose ${humanGender(gender).toLowerCase()} voice` : "Choose language first"}
                disabled={!locale || faceBlocked || saving || stages.some((stage) => {
                  const stageParticipantId = participantIdForStage(stage);
                  return stageParticipantId === id && ["generating", "awaiting_review", "approved"].includes(stage.state);
                })}
                onPress={() => {
                  void loadVoices(locale);
                  setPicker({ kind: "voice", participantId: id });
                }}
              />

              <Text style={styles.voiceRule}>
                Applied automatically to every {participant.display_name || "character"} dialogue turn.
              </Text>
            </View>
          );
        })}

        <View style={styles.conversationCard}>
          <View style={styles.conversationHeader}>
            <View>
              <Text style={styles.sectionTitle}>Conversation audio</Text>
              <Text style={styles.sectionHint}>
                {required} dialogue turn{required === 1 ? "" : "s"} • {approved}/{required} approved
              </Text>
            </View>
            {generating ? <ActivityIndicator color={BRAND.accent} /> : null}
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{approved}</Text>
              <Text style={styles.metricLabel}>Approved</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{awaitingReview}</Text>
              <Text style={styles.metricLabel}>Review</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{generating}</Text>
              <Text style={styles.metricLabel}>Generating</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{failed}</Text>
              <Text style={styles.metricLabel}>Needs attention</Text>
            </View>
          </View>

          {!audioReady && priceableStages.length > 0 ? (
            <View style={styles.primaryActionBox}>
              {quotedPrice ? (
                <>
                  <Text style={styles.priceCaption}>CONVERSATION PRICE</Text>
                  <Text style={styles.priceValue}>{quotedPrice}</Text>
                  <Text style={styles.priceNote}>
                    One confirmation covers the current priced dialogue set. Pricing is still reserved and committed per generated clip underneath.
                  </Text>
                  <Button
                    label={actionBusy ? "Generating…" : "Generate conversation audio"}
                    onPress={() => void generateConversation()}
                    disabled={actionBusy || !allVoicesReady}
                  />
                  <Button
                    label="Refresh price"
                    onPress={() => void checkConversationPrice()}
                    disabled={actionBusy}
                    secondary
                  />
                </>
              ) : (
                <>
                  <Text style={styles.actionTitle}>Ready to create the conversation</Text>
                  <Text style={styles.actionBody}>
                    Check one combined view of the dialogue pricing, then generate all pending turns with the character voices above.
                  </Text>
                  <Button
                    label={actionBusy ? "Checking price…" : "Check conversation price"}
                    onPress={() => void checkConversationPrice()}
                    disabled={actionBusy || !allVoicesReady || faceBlocked}
                  />
                </>
              )}
            </View>
          ) : null}

          {generating > 0 ? (
            <View style={styles.progressCard}>
              <Text style={styles.actionTitle}>Creating dialogue audio</Text>
              <Text style={styles.actionBody}>
                {generating} clip{generating === 1 ? " is" : "s are"} being synthesized. Character voice assignments stay locked during generation.
              </Text>
            </View>
          ) : null}

          {stages.map((stage, index) => {
            const turn = turnById.get(clean(stage.dialogue_turn_id));
            const participantId = participantIdForStage(stage);
            const participant = participantById.get(participantId);
            const synced = syncs[stage.stage_run_id];
            const audioUrl = clean(synced?.audio_url || stage.metadata?.audio_url);
            const canReview = stage.state === "awaiting_review";
            const needsAttention = ["failed", "rejected"].includes(stage.state);
            const stateLabel = stage.state === "approved"
              ? "Approved"
              : canReview
                ? "Ready to review"
                : stage.state === "generating"
                  ? "Generating"
                  : needsAttention
                    ? "Needs attention"
                    : "Pending";

            return (
              <View key={stage.stage_run_id} style={styles.turnRow}>
                <View style={styles.turnNumber}>
                  <Text style={styles.turnNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.turnBody}>
                  <View style={styles.turnTopLine}>
                    <Text style={styles.turnSpeaker}>{participant?.display_name || "Character"}</Text>
                    <Text style={[
                      styles.turnState,
                      stage.state === "approved" && styles.turnStateApproved,
                      canReview && styles.turnStateReview,
                      needsAttention && styles.turnStateDanger,
                    ]}>
                      {stateLabel}
                    </Text>
                  </View>
                  <Text style={styles.turnText} numberOfLines={3}>
                    {clean(turn?.text) || "Dialogue"}
                  </Text>
                  {(audioUrl || canReview || needsAttention) ? (
                    <View style={styles.turnActions}>
                      {audioUrl ? <AudioPreviewButton url={audioUrl} /> : null}
                      {canReview ? (
                        <Button
                          label="Revise this line"
                          onPress={() =>
                            Alert.alert(
                              "Revise this line?",
                              "Only this dialogue turn will return for a new priced generation. The character voice remains unchanged.",
                              [
                                { text: "Cancel", style: "cancel" },
                                { text: "Revise", onPress: () => void reviseTurn(stage) },
                              ]
                            )
                          }
                          disabled={actionBusy}
                          secondary
                          compact
                        />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}

          {canApproveAll ? (
            <View style={styles.reviewAllBox}>
              <Text style={styles.actionTitle}>Review complete?</Text>
              <Text style={styles.actionBody}>
                Listen to the generated lines. Approve the current conversation in one action, or revise only the line that needs work.
              </Text>
              <Button
                label={actionBusy ? "Approving…" : `Approve ${awaitingReview} ready line${awaitingReview === 1 ? "" : "s"}`}
                onPress={() => void approveAll()}
                disabled={actionBusy}
              />
            </View>
          ) : null}

          {audioReady ? (
            <View style={styles.completeBox}>
              <Text style={styles.completeTitle}>Conversation audio is ready</Text>
              <Text style={styles.completeBody}>
                Every dialogue turn is approved and locked with consistent character voices.
              </Text>
              <Button
                label="Continue to Fusion Studio"
                onPress={() =>
                  router.replace({
                    pathname: "/(tabs)/face/story/[storyId]" as any,
                    params: { storyId, stage: "fusion" },
                  } as any)
                }
              />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND.background },
  content: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 140,
    gap: 14,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  helper: { color: BRAND.muted, fontSize: 13, fontWeight: "600" },
  hero: { paddingHorizontal: 2, paddingBottom: 4 },
  eyebrow: { color: BRAND.accent, fontSize: 11, fontWeight: "900", letterSpacing: 1.6 },
  title: { color: BRAND.text, fontSize: 28, lineHeight: 34, fontWeight: "900", marginTop: 7, letterSpacing: -0.5 },
  subtitle: { color: BRAND.muted, fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 620 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 },
  sectionTitle: { color: BRAND.text, fontSize: 17, fontWeight: "900", letterSpacing: -0.15 },
  sectionHint: { color: BRAND.muted, fontSize: 12, marginTop: 3, fontWeight: "600" },
  readyPill: { borderWidth: 1, borderColor: BRAND.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.035)" },
  readyPillOn: { borderColor: "rgba(50,215,75,0.28)", backgroundColor: "rgba(50,215,75,0.08)" },
  readyPillText: { color: BRAND.text, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  voiceCard: { backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border, borderRadius: 22, padding: 16, gap: 12 },
  voiceCardReady: { borderColor: BRAND.accentBorder },
  voiceCardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: BRAND.accentFill, borderWidth: 1, borderColor: BRAND.accentBorder },
  avatarText: { color: BRAND.accentStrong, fontSize: 18, fontWeight: "900" },
  characterName: { color: BRAND.text, fontSize: 18, fontWeight: "900" },
  characterMeta: { color: BRAND.muted, fontSize: 12, marginTop: 3, fontWeight: "600" },
  lockedMark: { color: BRAND.success, fontSize: 19, fontWeight: "900" },
  selectField: { minHeight: 62, borderRadius: 15, borderWidth: 1, borderColor: BRAND.border, backgroundColor: "rgba(255,255,255,0.035)", paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  selectLabel: { color: BRAND.faint, fontSize: 9, fontWeight: "900", letterSpacing: 1.05, textTransform: "uppercase" },
  selectValue: { color: BRAND.text, fontSize: 14, fontWeight: "800", marginTop: 3 },
  selectPlaceholder: { color: BRAND.muted, fontWeight: "600" },
  chevron: { color: BRAND.accent, fontSize: 28, lineHeight: 28, fontWeight: "300" },
  voiceRule: { color: BRAND.faint, fontSize: 11, lineHeight: 17, fontWeight: "600" },
  noticeCard: { borderWidth: 1, borderColor: "rgba(255,107,120,0.24)", backgroundColor: "rgba(255,107,120,0.06)", borderRadius: 18, padding: 15, gap: 10 },
  noticeTitle: { color: BRAND.text, fontSize: 15, fontWeight: "900" },
  noticeBody: { color: BRAND.muted, fontSize: 12, lineHeight: 18 },
  conversationCard: { backgroundColor: BRAND.surface, borderWidth: 1, borderColor: BRAND.border, borderRadius: 24, padding: 16, gap: 14, marginTop: 4 },
  conversationHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  metricsRow: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.035)", paddingHorizontal: 8, paddingVertical: 10, alignItems: "center" },
  metricValue: { color: BRAND.text, fontSize: 17, fontWeight: "900" },
  metricLabel: { color: BRAND.faint, fontSize: 8, fontWeight: "800", textAlign: "center", marginTop: 2 },
  primaryActionBox: { borderWidth: 1, borderColor: BRAND.accentBorder, backgroundColor: BRAND.accentFill, borderRadius: 18, padding: 14, gap: 9 },
  progressCard: { borderRadius: 16, backgroundColor: "rgba(255,255,255,0.035)", padding: 13, gap: 5 },
  reviewAllBox: { borderWidth: 1, borderColor: BRAND.accentBorder, backgroundColor: BRAND.accentFill, borderRadius: 18, padding: 14, gap: 9 },
  actionTitle: { color: BRAND.text, fontSize: 14, fontWeight: "900" },
  actionBody: { color: BRAND.muted, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  priceCaption: { color: BRAND.faint, fontSize: 9, fontWeight: "900", letterSpacing: 1.05 },
  priceValue: { color: BRAND.accentStrong, fontSize: 25, fontWeight: "900", letterSpacing: -0.35 },
  priceNote: { color: BRAND.muted, fontSize: 11, lineHeight: 17 },
  turnRow: { flexDirection: "row", gap: 11, paddingVertical: 11, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.065)" },
  turnNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)" },
  turnNumberText: { color: BRAND.muted, fontSize: 10, fontWeight: "900" },
  turnBody: { flex: 1, minWidth: 0, gap: 5 },
  turnTopLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  turnSpeaker: { color: BRAND.text, fontSize: 13, fontWeight: "900", flex: 1 },
  turnState: { color: BRAND.muted, fontSize: 9, fontWeight: "800" },
  turnStateApproved: { color: BRAND.success },
  turnStateReview: { color: BRAND.accentStrong },
  turnStateDanger: { color: BRAND.danger },
  turnText: { color: "rgba(255,255,255,0.74)", fontSize: 12, lineHeight: 18 },
  turnActions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 4 },
  completeBox: { borderWidth: 1, borderColor: "rgba(50,215,75,0.28)", backgroundColor: "rgba(50,215,75,0.065)", borderRadius: 18, padding: 14, gap: 9 },
  completeTitle: { color: BRAND.text, fontSize: 15, fontWeight: "900" },
  completeBody: { color: BRAND.muted, fontSize: 12, lineHeight: 18 },
  button: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: "rgba(214,177,114,0.42)", backgroundColor: BRAND.accent },
  buttonSecondary: { backgroundColor: "rgba(255,255,255,0.035)", borderColor: BRAND.border },
  buttonCompact: { minHeight: 36, paddingHorizontal: 11, alignSelf: "flex-start" },
  buttonText: { color: "#1C1208", fontSize: 12, fontWeight: "900" },
  buttonTextSecondary: { color: "rgba(255,255,255,0.86)" },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.74)", justifyContent: "flex-end" },
  modalCard: { maxHeight: "78%", backgroundColor: BRAND.surfaceRaised, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: BRAND.border, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 28 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  modalTitle: { color: BRAND.text, fontSize: 20, fontWeight: "900" },
  modalClose: { color: BRAND.muted, fontSize: 30, lineHeight: 30, fontWeight: "300" },
  searchInput: { marginTop: 13, marginBottom: 10, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: BRAND.border, backgroundColor: "rgba(0,0,0,0.18)", color: BRAND.text, paddingHorizontal: 13, fontSize: 14 },
  modalLoading: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: 10 },
  choiceList: { paddingBottom: 10 },
  choiceRow: { minHeight: 58, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.055)" },
  choiceRowSelected: { backgroundColor: BRAND.accentFill, borderBottomColor: BRAND.accentBorder },
  choiceLabel: { color: BRAND.text, fontSize: 14, fontWeight: "800" },
  choiceSubtitle: { color: BRAND.muted, fontSize: 11, marginTop: 3 },
  choiceCheck: { color: BRAND.success, fontSize: 18, fontWeight: "900" },
  emptyText: { color: BRAND.muted, textAlign: "center", paddingVertical: 30 },
});
