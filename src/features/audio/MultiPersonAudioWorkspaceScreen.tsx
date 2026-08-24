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

import {
  CompactButton,
  Divider,
  ProgressLine,
  SectionLabel,
  StatusPill,
  STUDIO,
  StudioHero,
  Surface,
  useStudioViewport,
} from "../../core/studio/DenseStudioUI";
import {
  autoConfigureStoryAudio,
  userFacingStudioError,
  type AudioAutoCharacter,
  type AudioAutoConfigureResult,
} from "../../core/studio/productionExperience";
import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import {
  fetchAudioCountries,
  fetchAudioLocales,
  fetchAudioVoices,
  normalizeCountries,
  normalizeLocales,
  normalizeVoices,
  type UiCountry,
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
} from "./api/multiPersonStory";

type Props = { storyId: string };
type StageMap<T> = Record<string, T>;
type PlayerHandle = ReturnType<typeof createAudioPlayer>;
type PickerKind = "locale" | "voice" | "style";
type PickerState = { kind: PickerKind; participantId: string } | null;
type Choice = { key: string; label: string; subtitle?: string };
type DraftProfile = { locale: string; voiceId: string; style: string };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function localeRegion(value: unknown) {
  const parts = clean(value).replace(/_/g, "-").split("-").filter(Boolean);
  for (let index = parts.length - 1; index > 0; index -= 1) {
    if (/^[A-Za-z]{2}$/.test(parts[index])) return parts[index].toUpperCase();
  }
  return "";
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

function voiceStyles(voice: UiVoice | undefined) {
  if (!voice) return [] as string[];
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

function quoteCredits(preview: AudioPricingPreview | undefined): number | null {
  const p: any = preview?.pricing ?? {};
  for (const value of [
    p.estimated_credits,
    p.credits,
    p.total_credits,
    p.pricing?.estimated_credits,
    p.pricing?.credits,
    p.summary?.estimated_credits,
    p.pricing?.summary?.estimated_credits,
  ]) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) return amount;
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

function stageLabel(stage: StudioStageView, preview?: AudioPricingPreview) {
  if (stage.state === "approved") return "Approved";
  if (stage.state === "awaiting_review") return "Ready to review";
  if (stage.state === "generating") return "Creating";
  if (stage.state === "failed") return "Needs retry";
  if (stage.state === "rejected") return "Ready for a new version";
  return preview ? "Price ready" : "Ready";
}

function stageTone(stage: StudioStageView, preview?: AudioPricingPreview) {
  if (stage.state === "approved") return "success" as const;
  if (stage.state === "awaiting_review" || preview) return "accent" as const;
  if (stage.state === "failed" || stage.state === "rejected") return "danger" as const;
  return "neutral" as const;
}

async function runLimited<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const output: Array<R | undefined> = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return output as R[];
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
              contentContainerStyle={styles.choiceList}
              ListEmptyComponent={<Text style={styles.empty}>No configured options are available.</Text>}
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

export default function MultiPersonAudioWorkspaceScreen({ storyId }: Props) {
  const viewport = useStudioViewport();
  const { token } = useAuth();
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [autoProfiles, setAutoProfiles] = useState<Record<string, AudioAutoCharacter>>({});
  const [locales, setLocales] = useState<UiLocale[]>([]);
  const [countries, setCountries] = useState<UiCountry[]>([]);
  const [voiceCache, setVoiceCache] = useState<Record<string, UiVoice[]>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftProfile>>({});
  const [previews, setPreviews] = useState<StageMap<AudioPricingPreview>>({});
  const [syncs, setSyncs] = useState<StageMap<AudioSyncResult>>({});
  const [picker, setPicker] = useState<PickerState>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const playerRef = useRef<PlayerHandle | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      try { playerRef.current?.remove(); } catch {}
      playerRef.current = null;
    };
  }, []);

  const countryByCode = useMemo(
    () => new Map(countries.map((item) => [item.code, item])),
    [countries]
  );

  const localeByCode = useMemo(
    () => new Map(locales.map((item) => [item.code, item])),
    [locales]
  );

  const localeLabel = useCallback((code: string) => {
    const locale = localeByCode.get(code);
    const language = clean(locale?.label) || code;
    const country = countryByCode.get(localeRegion(code))?.label || "";
    return country ? `${language} • ${country}` : language;
  }, [countryByCode, localeByCode]);

  const loadVoices = useCallback(async (locale: string) => {
    const code = clean(locale);
    if (!code || voiceCache[code]) return;
    setPickerLoading(true);
    try {
      const response = await fetchAudioVoices(token || undefined, code);
      if (mounted.current) {
        setVoiceCache((current) => ({ ...current, [code]: normalizeVoices(response) }));
      }
    } catch (error) {
      if (mounted.current) setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setPickerLoading(false);
    }
  }, [token, voiceCache]);

  const hydrateDrafts = useCallback((nextWorkspace: StoryWorkspaceView, auto?: AudioAutoConfigureResult) => {
    const autoById = new Map((auto?.characters ?? []).map((item) => [item.participant_id, item]));
    setDrafts((current) => {
      const copy = { ...current };
      for (const participant of nextWorkspace.participants ?? []) {
        const id = participant.participant_id;
        const resolved = autoById.get(id);
        const existing = copy[id];
        copy[id] = {
          locale: existing?.locale || clean(resolved?.locale || participant.preferred_locale),
          voiceId: existing?.voiceId || clean(resolved?.voice_id || participant.voice_profile_ref),
          style: existing?.style || "",
        };
      }
      return copy;
    });
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!storyId) return;
    if (!quiet) setLoading(true);
    setMessage("");
    try {
      const [initialWorkspace, initialWorkflow, localeResponse, countryResponse] = await Promise.all([
        getStoryWorkspace(storyId),
        ensureStoryStudioWorkflow(storyId),
        fetchAudioLocales(token || undefined),
        fetchAudioCountries(token || undefined),
      ]);

      let nextWorkspace = initialWorkspace;
      let latestWorkflow = initialWorkflow;
      let autoResult: AudioAutoConfigureResult | undefined;

      if (initialWorkflow.current_stage === "audio") {
        autoResult = await autoConfigureStoryAudio(initialWorkflow.workflow_id);
        nextWorkspace = await getStoryWorkspace(storyId);
        const map: Record<string, AudioAutoCharacter> = {};
        for (const item of autoResult.characters ?? []) map[item.participant_id] = item;
        setAutoProfiles(map);
      }

      const recoverable = audioStages(latestWorkflow).filter((stage) =>
        ["generating", "awaiting_review", "approved"].includes(stage.state)
      );
      if (recoverable.length) {
        const recovered = await runLimited(recoverable, 4, async (stage) => {
          try { return await syncDialogueAudio(latestWorkflow.workflow_id, stage.stage_run_id); }
          catch { return null; }
        });
        const patch: StageMap<AudioSyncResult> = {};
        for (const result of recovered) {
          if (!result) continue;
          patch[result.stage_run_id] = result;
          latestWorkflow = result.workflow || latestWorkflow;
        }
        if (mounted.current) setSyncs((current) => ({ ...current, ...patch }));
      }

      if (!mounted.current) return;
      setLocales(normalizeLocales(localeResponse).filter((item) => clean((item.raw as any)?.default_voice)));
      setCountries(normalizeCountries(countryResponse));
      setWorkspace(nextWorkspace);
      setWorkflow(latestWorkflow);
      hydrateDrafts(nextWorkspace, autoResult);
    } catch (error) {
      if (mounted.current) setMessage(userFacingStudioError(error));
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
    () => new Map((workspace?.participants ?? []).map((item) => [item.participant_id, item])),
    [workspace]
  );
  const dialogueByTurn = useMemo(() => {
    const map = new Map<string, any>();
    for (const scene of workspace?.scenes ?? []) {
      for (const turn of (scene as any)?.dialogue ?? []) {
        const id = clean(turn?.dialogue_turn_id || turn?.turn_id || turn?.id);
        if (id) map.set(id, turn);
      }
    }
    return map;
  }, [workspace]);

  useEffect(() => {
    for (const speaker of speakers) {
      const locale = clean(drafts[speaker.participant_id]?.locale);
      if (locale) void loadVoices(locale);
    }
  }, [drafts, loadVoices, speakers]);

  useEffect(() => {
    if (!workflow) return;
    const generating = audioStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(() => {
      void runLimited(generating, 4, async (stage) => {
        const result = await syncDialogueAudio(workflow.workflow_id, stage.stage_run_id);
        if (mounted.current) {
          setSyncs((current) => ({ ...current, [stage.stage_run_id]: result }));
          setWorkflow(result.workflow);
        }
        return result;
      }).catch((error) => {
        if (mounted.current) setMessage(userFacingStudioError(error));
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [workflow]);

  const participantLocked = useCallback((participantId: string) =>
    stages.some((stage) => clean(stage.participant_id) === participantId && ["generating", "awaiting_review", "approved"].includes(stage.state)),
  [stages]);

  const profileUnsaved = useCallback((participantId: string) => {
    const draft = drafts[participantId];
    const saved = autoProfiles[participantId];
    if (!draft?.locale || !draft?.voiceId) return true;
    if (!saved?.ready) return true;
    return draft.locale !== clean(saved.locale) || draft.voiceId !== clean(saved.voice_id);
  }, [autoProfiles, drafts]);

  const saveProfile = useCallback(async (participantId: string) => {
    if (!workflow) return;
    const draft = drafts[participantId];
    if (!draft?.locale || !draft?.voiceId) {
      setMessage("Choose a language and voice first.");
      return;
    }
    setSavingId(participantId);
    setMessage("");
    try {
      const result = await configureParticipantVoice(workflow.workflow_id, participantId, {
        voice_id: draft.voiceId,
        voice_locale: draft.locale,
        style: draft.style || null,
      });
      if (!mounted.current) return;
      setAutoProfiles((current) => ({
        ...current,
        [participantId]: {
          participant_id: result.participant_id,
          display_name: result.display_name,
          ready: true,
          status: "preserved",
          locale: result.voice_locale,
          language: localeLabel(result.voice_locale),
          voice_id: result.voice_id,
          voice_display_name: result.voice_display_name,
          voice_gender: result.voice_gender,
          message: "Voice choice saved.",
        },
      }));
      setWorkspace(await getStoryWorkspace(storyId));
      setPreviews({});
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setSavingId("");
    }
  }, [drafts, localeLabel, storyId, workflow]);

  const priceableStages = useMemo(
    () => stages.filter((stage) => ["pending", "ready", "failed", "rejected"].includes(stage.state)),
    [stages]
  );

  const checkConversationPrice = useCallback(async () => {
    if (!workflow || !priceableStages.length) return;
    const unsaved = speakers.filter((speaker) => profileUnsaved(speaker.participant_id));
    if (unsaved.length) {
      setMessage("Save the highlighted voice choices before checking the Audio price.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const results = await runLimited(priceableStages, 4, (stage) =>
        previewDialogueAudio(workflow.workflow_id, stage.stage_run_id)
      );
      if (!mounted.current) return;
      const patch: StageMap<AudioPricingPreview> = {};
      results.forEach((preview) => { patch[preview.stage_run_id] = preview; });
      setPreviews((current) => ({ ...current, ...patch }));
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [priceableStages, profileUnsaved, speakers, workflow]);

  const pricedTargets = useMemo(
    () => priceableStages.filter((stage) => Boolean(previews[stage.stage_run_id])),
    [previews, priceableStages]
  );
  const knownCredits = pricedTargets.map((stage) => quoteCredits(previews[stage.stage_run_id]));
  const totalCredits = knownCredits.every((value) => value !== null)
    ? (knownCredits as number[]).reduce((sum, value) => sum + value, 0)
    : null;
  const allPriceableQuoted = priceableStages.length > 0 && pricedTargets.length === priceableStages.length;

  const generateConversation = useCallback(() => {
    if (!workflow || !allPriceableQuoted) return;
    Alert.alert(
      "Create Story Audio?",
      `${pricedTargets.length} dialogue line${pricedTargets.length === 1 ? "" : "s"} will be created using the price you just reviewed.${totalCredits !== null ? `\n\nEstimated total: ${totalCredits} credits.` : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create Audio",
          onPress: () => void (async () => {
            setBusy(true);
            setMessage("");
            try {
              await runLimited(pricedTargets, 3, async (stage) => {
                const preview = previews[stage.stage_run_id];
                if (!preview) return null;
                return dispatchDialogueAudio(workflow.workflow_id, stage.stage_run_id, audioPricingQuote(preview));
              });
              if (!mounted.current) return;
              setWorkflow(await getStudioWorkflow(workflow.workflow_id));
              setPreviews({});
            } catch (error) {
              setMessage(userFacingStudioError(error));
              const authoritative = await getStudioWorkflow(workflow.workflow_id).catch(() => null);
              if (authoritative && mounted.current) setWorkflow(authoritative);
            } finally {
              if (mounted.current) setBusy(false);
            }
          })(),
        },
      ]
    );
  }, [allPriceableQuoted, previews, pricedTargets, totalCredits, workflow]);

  const playStage = useCallback(async (stage: StudioStageView) => {
    if (!workflow) return;
    setMessage("");
    try {
      let result = syncs[stage.stage_run_id];
      if (!clean(result?.audio_url)) {
        result = await syncDialogueAudio(workflow.workflow_id, stage.stage_run_id);
        if (mounted.current) {
          setSyncs((current) => ({ ...current, [stage.stage_run_id]: result! }));
          setWorkflow(result.workflow);
        }
      }
      const url = clean(result?.audio_url);
      if (!url) throw new Error("Audio preview is not ready yet.");
      try { playerRef.current?.remove(); } catch {}
      await setAudioModeAsync({ playsInSilentMode: true });
      await setIsAudioActiveAsync(true);
      const player = createAudioPlayer(url);
      playerRef.current = player;
      player.play();
    } catch (error) {
      setMessage(userFacingStudioError(error));
    }
  }, [syncs, workflow]);

  const reviewTurn = useCallback(async (stage: StudioStageView, decision: "approved" | "revise") => {
    if (!workflow) return;
    setBusy(true);
    setMessage("");
    try {
      const authoritative = await getStudioWorkflow(workflow.workflow_id);
      const current = audioStages(authoritative).find((item) => item.stage_run_id === stage.stage_run_id);
      const pending = latestPendingReview(current);
      if (!pending) {
        setWorkflow(authoritative);
        setMessage("The latest Audio state has been loaded.");
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
      }
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [workflow]);

  const approveReady = useCallback(async () => {
    if (!workflow) return;
    setBusy(true);
    setMessage("");
    try {
      let currentWorkflow = await getStudioWorkflow(workflow.workflow_id);
      const ready = audioStages(currentWorkflow).filter((stage) =>
        stage.state === "awaiting_review" && Boolean(latestPendingReview(stage))
      );
      for (const stage of ready) {
        const pending = latestPendingReview(stage);
        if (!pending) continue;
        currentWorkflow = await reviewStudioOutput(pending.review_item_id, "approved");
      }
      const authoritative = await getStudioWorkflow(workflow.workflow_id);
      const allApproved = audioStages(authoritative).every((stage) => stage.state === "approved");
      const next = allApproved
        ? await advanceStudioWorkflow(authoritative.workflow_id).catch(() => authoritative)
        : authoritative;
      if (mounted.current) setWorkflow(next);
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [workflow]);

  const pickerParticipant = picker?.participantId ? participantById.get(picker.participantId) : undefined;
  const pickerDraft = picker?.participantId ? drafts[picker.participantId] : undefined;
  const pickerVoices = pickerDraft?.locale ? voiceCache[pickerDraft.locale] ?? [] : [];
  const selectedVoice = pickerVoices.find((item) => item.key === pickerDraft?.voiceId);
  const stylesForVoice = voiceStyles(selectedVoice);
  const choices: Choice[] = picker?.kind === "locale"
    ? locales.map((item) => ({ key: item.code, label: localeLabel(item.code), subtitle: clean((item.raw as any)?.native_name) || undefined }))
    : picker?.kind === "voice"
      ? pickerVoices.map((item) => ({ key: item.key, label: clean(item.raw?.display_name) || item.label, subtitle: [clean(item.raw?.gender), clean(item.raw?.voice_type)].filter(Boolean).join(" • ") || undefined }))
      : stylesForVoice.map((item) => ({ key: item, label: item }));

  const selectChoice = useCallback((choice: Choice) => {
    if (!picker) return;
    const participantId = picker.participantId;
    setDrafts((current) => {
      const prior = current[participantId] || { locale: "", voiceId: "", style: "" };
      if (picker.kind === "locale") {
        const locale = localeByCode.get(choice.key);
        const defaultVoice = clean((locale?.raw as any)?.default_voice);
        return { ...current, [participantId]: { locale: choice.key, voiceId: defaultVoice, style: "" } };
      }
      if (picker.kind === "voice") {
        return { ...current, [participantId]: { ...prior, voiceId: choice.key, style: "" } };
      }
      return { ...current, [participantId]: { ...prior, style: choice.key } };
    });
    setPicker(null);
    if (picker.kind === "locale") void loadVoices(choice.key);
  }, [loadVoices, localeByCode, picker]);

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
        <View style={styles.center}><ActivityIndicator size="large" color={STUDIO.accent} /><Text style={styles.helper}>Preparing character voices…</Text></View>
      </View>
    );
  }

  const approvedCount = stages.filter((stage) => stage.state === "approved").length;
  const reviewableCount = stages.filter((stage) => stage.state === "awaiting_review").length;

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
          subtitle="desifaces prepares a compatible voice from your story. Keep the suggestion or change only what matters to you. Your dialogue stays yours."
          right={<ProgressLine current={approvedCount} total={stages.length} label="Dialogue" />}
        />

        {message ? <Surface style={styles.messageBox} accent><Text style={styles.messageText}>{message}</Text></Surface> : null}

        <SectionLabel title="Character voices" meta={`${speakers.length} speaker${speakers.length === 1 ? "" : "s"}`} />
        {speakers.map((speaker) => {
          const id = speaker.participant_id;
          const draft = drafts[id] || { locale: "", voiceId: "", style: "" };
          const auto = autoProfiles[id];
          const voices = draft.locale ? voiceCache[draft.locale] ?? [] : [];
          const voice = voices.find((item) => item.key === draft.voiceId);
          const locked = participantLocked(id);
          const unsaved = profileUnsaved(id);
          const availableStyles = voiceStyles(voice);
          return (
            <Surface key={id} accent={Boolean(auto?.ready && !unsaved)} style={styles.characterCard}>
              <View style={styles.characterHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.characterName}>{speaker.display_name || "Character"}</Text>
                  <Text style={styles.characterMeta}>
                    {auto?.status === "suggested" ? "desifaces suggestion • editable before generation" : locked ? "Voice locked for generated dialogue" : "Choose only if you want to change the suggestion"}
                  </Text>
                </View>
                <StatusPill value={locked ? "LOCKED" : unsaved ? "SAVE CHOICE" : "READY"} tone={locked || !unsaved ? "success" : "accent"} />
              </View>

              <View style={styles.choiceGrid}>
                <Pressable disabled={locked} onPress={() => setPicker({ kind: "locale", participantId: id })} style={({ pressed }) => [styles.choiceCard, locked && styles.disabled, pressed && !locked && styles.pressed]}>
                  <Text style={styles.choiceKicker}>LANGUAGE</Text>
                  <Text style={styles.choiceValue}>{draft.locale ? localeLabel(draft.locale) : "Choose language"}</Text>
                </Pressable>
                <Pressable disabled={locked || !draft.locale} onPress={() => { void loadVoices(draft.locale); setPicker({ kind: "voice", participantId: id }); }} style={({ pressed }) => [styles.choiceCard, (locked || !draft.locale) && styles.disabled, pressed && !locked && styles.pressed]}>
                  <Text style={styles.choiceKicker}>VOICE</Text>
                  <Text style={styles.choiceValue}>{clean(voice?.raw?.display_name) || clean(auto?.voice_display_name) || draft.voiceId || "Choose voice"}</Text>
                  {clean(voice?.raw?.gender || auto?.voice_gender) ? <Text style={styles.choiceHint}>{clean(voice?.raw?.gender || auto?.voice_gender)}</Text> : null}
                </Pressable>
                <Pressable disabled={locked || !draft.voiceId || !availableStyles.length} onPress={() => setPicker({ kind: "style", participantId: id })} style={({ pressed }) => [styles.choiceCard, (locked || !draft.voiceId || !availableStyles.length) && styles.disabled, pressed && !locked && styles.pressed]}>
                  <Text style={styles.choiceKicker}>DELIVERY</Text>
                  <Text style={styles.choiceValue}>{draft.style || "Natural"}</Text>
                  <Text style={styles.choiceHint}>{availableStyles.length ? "Optional" : "Provider default"}</Text>
                </Pressable>
              </View>

              {!locked && unsaved ? (
                <View style={styles.saveRow}>
                  <Text style={styles.saveHint}>Save once; it applies to every dialogue line for this character.</Text>
                  <CompactButton label={savingId === id ? "Saving…" : "Save voice"} onPress={() => void saveProfile(id)} disabled={savingId === id || !draft.locale || !draft.voiceId} tone="primary" />
                </View>
              ) : null}
            </Surface>
          );
        })}

        <SectionLabel title="Conversation" meta={`${approvedCount}/${stages.length} approved`} />
        <Surface style={styles.pricingBar} accent={allPriceableQuoted}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pricingTitle}>{allPriceableQuoted ? "Audio price ready" : "Price before creating"}</Text>
            <Text style={styles.pricingMeta}>
              {allPriceableQuoted
                ? `${pricedTargets.length} line${pricedTargets.length === 1 ? "" : "s"}${totalCredits !== null ? ` • ${totalCredits} credits estimated` : ""}. Existing svc-audio pricing is used as-is.`
                : "desifaces prices each dialogue line through the existing Audio pricing service. Nothing starts until you confirm."}
            </Text>
          </View>
          <View style={styles.pricingActions}>
            {!allPriceableQuoted && priceableStages.length ? <CompactButton label="Check price" onPress={() => void checkConversationPrice()} disabled={busy} /> : null}
            {allPriceableQuoted ? <CompactButton label="Confirm & create Audio" onPress={generateConversation} disabled={busy} tone="primary" /> : null}
            {allPriceableQuoted ? <CompactButton label="Reprice" onPress={() => void checkConversationPrice()} disabled={busy} /> : null}
            {reviewableCount ? <CompactButton label={`Approve ready (${reviewableCount})`} onPress={() => void approveReady()} disabled={busy} tone="primary" /> : null}
          </View>
        </Surface>

        <View style={styles.dialogueList}>
          {stages.map((stage, index) => {
            const participant = participantById.get(clean(stage.participant_id));
            const turn = dialogueByTurn.get(clean(stage.dialogue_turn_id));
            const preview = previews[stage.stage_run_id];
            const sync = syncs[stage.stage_run_id];
            const canReview = stage.state === "awaiting_review" && Boolean(latestPendingReview(stage));
            const text = clean(turn?.text || turn?.script || turn?.content || turn?.utterance) || "Dialogue line";
            return (
              <Surface key={stage.stage_run_id} accent={stage.state === "approved"} style={styles.dialogueCard}>
                <View style={styles.dialogueRow}>
                  <View style={styles.dialogueIndex}><Text style={styles.dialogueIndexText}>{index + 1}</Text></View>
                  <View style={styles.dialogueBody}>
                    <View style={styles.dialogueHead}>
                      <Text style={styles.dialogueSpeaker}>{participant?.display_name || "Character"}</Text>
                      <StatusPill value={stageLabel(stage, preview)} tone={stageTone(stage, preview)} />
                    </View>
                    <Text style={styles.dialogueText} numberOfLines={3}>{text}</Text>
                    {preview ? <Text style={styles.dialoguePrice}>{quoteCredits(preview) !== null ? `${quoteCredits(preview)} credits` : "Price ready"}</Text> : null}
                  </View>
                  <View style={[styles.dialogueActions, { width: viewport.actionWidth }]}>
                    {["awaiting_review", "approved"].includes(stage.state) ? <CompactButton label="Play" onPress={() => void playStage(stage)} disabled={busy} fill /> : null}
                    {canReview ? <CompactButton label="Approve" onPress={() => void reviewTurn(stage, "approved")} disabled={busy} tone="primary" fill /> : null}
                    {canReview ? <CompactButton label="Revise" onPress={() => void reviewTurn(stage, "revise")} disabled={busy} fill /> : null}
                    {stage.state === "generating" ? <ActivityIndicator size="small" color={STUDIO.accent} /> : null}
                    {stage.state === "approved" ? <StatusPill value="LOCKED" tone="success" /> : null}
                    {clean(sync?.error_message) ? <Text style={styles.lineError} numberOfLines={2}>{clean(sync?.error_message)}</Text> : null}
                  </View>
                </View>
              </Surface>
            );
          })}
        </View>

        <Divider />
        <View style={styles.footerRow}>
          <Text style={styles.footerTitle}>{approvedCount === stages.length && stages.length ? "Audio ready for Fusion" : "Your script remains unchanged"}</Text>
          <Text style={styles.footerMeta}>{approvedCount}/{stages.length}</Text>
        </View>
      </ScrollView>

      <ChoiceModal
        visible={Boolean(picker)}
        title={`${picker?.kind === "locale" ? "Language" : picker?.kind === "voice" ? "Voice" : "Delivery"}${pickerParticipant?.display_name ? ` • ${pickerParticipant.display_name}` : ""}`}
        choices={choices}
        selected={picker?.kind === "locale" ? pickerDraft?.locale : picker?.kind === "voice" ? pickerDraft?.voiceId : pickerDraft?.style}
        loading={pickerLoading}
        onClose={() => setPicker(null)}
        onSelect={selectChoice}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: STUDIO.bg },
  content: { width: "100%", alignSelf: "center", paddingTop: 10, paddingBottom: 120, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  helper: { color: STUDIO.muted, fontSize: 11, fontWeight: "700" },
  messageBox: { padding: 10 },
  messageText: { color: "#FFE6B2", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  characterCard: { gap: 10, padding: 10 },
  characterHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  characterName: { color: STUDIO.text, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  characterMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 2 },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceCard: { flex: 1, minWidth: 145, borderRadius: 12, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft, padding: 9, minHeight: 67 },
  choiceKicker: { color: STUDIO.faint, fontSize: 8, fontWeight: "900", letterSpacing: 0.65 },
  choiceValue: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "900", marginTop: 4 },
  choiceHint: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "600", marginTop: 2 },
  saveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  saveHint: { flex: 1, color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600" },
  pricingBar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 10 },
  pricingTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  pricingMeta: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "600", marginTop: 2 },
  pricingActions: { flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "flex-end" },
  dialogueList: { gap: 7 },
  dialogueCard: { padding: 9 },
  dialogueRow: { flexDirection: "row", alignItems: "stretch", gap: 9 },
  dialogueIndex: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft, alignItems: "center", justifyContent: "center" },
  dialogueIndexText: { color: STUDIO.accentText, fontSize: 10, fontWeight: "900" },
  dialogueBody: { flex: 1, minWidth: 0, gap: 4 },
  dialogueHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  dialogueSpeaker: { flex: 1, color: STUDIO.text, fontSize: 10, fontWeight: "900" },
  dialogueText: { color: "rgba(255,255,255,0.84)", fontSize: 10, lineHeight: 15, fontWeight: "600" },
  dialoguePrice: { color: STUDIO.accentText, fontSize: 8, fontWeight: "800" },
  dialogueActions: { flexShrink: 0, justifyContent: "center", gap: 5 },
  lineError: { color: "#FFC0C6", fontSize: 8, lineHeight: 11, fontWeight: "700" },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 2 },
  footerTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  footerMeta: { color: STUDIO.muted, fontSize: 10, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.76)", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 620, maxHeight: "82%", alignSelf: "center", borderRadius: 18, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.raised, padding: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 9 },
  modalTitle: { color: STUDIO.text, fontSize: 14, fontWeight: "900" },
  modalClose: { color: STUDIO.muted, fontSize: 24, lineHeight: 28 },
  modalLoading: { minHeight: 160, alignItems: "center", justifyContent: "center" },
  choiceList: { gap: 6, paddingBottom: 8 },
  choiceRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 11, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surface, paddingHorizontal: 10, paddingVertical: 8 },
  choiceSelected: { borderColor: STUDIO.accentBorder, backgroundColor: STUDIO.accentFill },
  choiceLabel: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "900" },
  choiceSubtitle: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "600", marginTop: 1 },
  check: { color: STUDIO.accent, fontSize: 13, fontWeight: "900" },
  empty: { color: STUDIO.muted, fontSize: 10, lineHeight: 15, textAlign: "center", padding: 28 },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.48 },
});
