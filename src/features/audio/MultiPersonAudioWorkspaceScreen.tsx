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
type VoiceProfile = { locale: string; voiceId: string; style: string };

const AUDIO_FANOUT_CONCURRENCY = 32;
const AUDIO_STATUS_CONCURRENCY = 32;

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
  if (!items.length) return [] as R[];
  const output: (R | undefined)[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
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
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.modalClose}>×</Text>
            </Pressable>
          </View>
          {loading ? (
            <View style={styles.modalLoading}><ActivityIndicator color={STUDIO.accent} /></View>
          ) : (
            <FlatList
              data={choices}
              keyExtractor={(item, index) => item.key || `default-${index}`}
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

export default function MultiPersonAudioWorkspaceScreen({ storyId }: Props) {
  const viewport = useStudioViewport();
  const { token } = useAuth();
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [autoProfiles, setAutoProfiles] = useState<Record<string, AudioAutoCharacter>>({});
  const [savedProfiles, setSavedProfiles] = useState<Record<string, VoiceProfile>>({});
  const [draftProfiles, setDraftProfiles] = useState<Record<string, VoiceProfile>>({});
  const [locales, setLocales] = useState<UiLocale[]>([]);
  const [countries, setCountries] = useState<UiCountry[]>([]);
  const [voiceCache, setVoiceCache] = useState<Record<string, UiVoice[]>>({});
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

  const hydrateProfiles = useCallback((
    nextWorkspace: StoryWorkspaceView,
    auto?: AudioAutoConfigureResult
  ) => {
    const autoById = new Map((auto?.characters ?? []).map((item) => [item.participant_id, item]));
    const nextSaved: Record<string, VoiceProfile> = {};
    for (const participant of nextWorkspace.participants ?? []) {
      const resolved = autoById.get(participant.participant_id);
      const locale = clean(resolved?.locale || participant.preferred_locale);
      const voiceId = clean(resolved?.voice_id || participant.voice_profile_ref);
      if (locale && voiceId) {
        nextSaved[participant.participant_id] = {
          locale,
          voiceId,
          style: clean(resolved?.style),
        };
      }
    }
    setSavedProfiles(nextSaved);
    setDraftProfiles((current) => {
      const copy = { ...nextSaved };
      for (const [participantId, profile] of Object.entries(current)) {
        if (profile.locale || profile.voiceId || profile.style) copy[participantId] = profile;
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
        const recovered = await runLimited(recoverable, AUDIO_STATUS_CONCURRENCY, async (stage) => {
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
      hydrateProfiles(nextWorkspace, autoResult);
    } catch (error) {
      if (mounted.current) setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [hydrateProfiles, storyId, token]);

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
      const locale = clean(draftProfiles[speaker.participant_id]?.locale);
      if (locale) void loadVoices(locale);
    }
  }, [draftProfiles, loadVoices, speakers]);

  useEffect(() => {
    if (!workflow) return;
    const generating = audioStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(() => {
      void runLimited(generating, AUDIO_STATUS_CONCURRENCY, async (stage) => {
        try {
          const result = await syncDialogueAudio(workflow.workflow_id, stage.stage_run_id);
          if (mounted.current) {
            setSyncs((current) => ({ ...current, [stage.stage_run_id]: result }));
            setWorkflow(result.workflow);
          }
          return result;
        } catch {
          return null;
        }
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [workflow]);

  const participantLocked = useCallback((participantId: string) =>
    stages.some((stage) =>
      clean(stage.participant_id) === participantId &&
      ["generating", "awaiting_review", "approved"].includes(stage.state)
    ), [stages]);

  const profileDirty = useCallback((participantId: string) => {
    const draft = draftProfiles[participantId];
    const saved = savedProfiles[participantId];
    if (!draft?.locale || !draft?.voiceId) return true;
    if (!saved?.locale || !saved?.voiceId) return true;
    return (
      draft.locale !== saved.locale ||
      draft.voiceId !== saved.voiceId ||
      draft.style !== saved.style
    );
  }, [draftProfiles, savedProfiles]);

  const saveProfile = useCallback(async (participantId: string) => {
    if (!workflow) return;
    const draft = draftProfiles[participantId];
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
      const saved: VoiceProfile = {
        locale: result.voice_locale,
        voiceId: result.voice_id,
        style: clean(result.style),
      };
      setSavedProfiles((current) => ({ ...current, [participantId]: saved }));
      setDraftProfiles((current) => ({ ...current, [participantId]: saved }));
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
          style: result.style,
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
  }, [draftProfiles, localeLabel, storyId, workflow]);

  const priceableStages = useMemo(
    () => stages.filter((stage) => ["pending", "ready", "failed", "rejected"].includes(stage.state)),
    [stages]
  );

  const checkConversationPrice = useCallback(async () => {
    if (!workflow || !priceableStages.length) return;
    const unresolved = speakers.filter((speaker) => profileDirty(speaker.participant_id));
    if (unresolved.length) {
      setMessage("Save the highlighted voice choices before checking the Audio price.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const results = await runLimited(priceableStages, AUDIO_FANOUT_CONCURRENCY, (stage) =>
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
  }, [priceableStages, profileDirty, speakers, workflow]);

  const pricedTargets = useMemo(
    () => priceableStages.filter((stage) => Boolean(previews[stage.stage_run_id])),
    [previews, priceableStages]
  );
  const quotedCredits = pricedTargets.map((stage) => quoteCredits(previews[stage.stage_run_id]));
  const totalCredits = quotedCredits.every((value) => value !== null)
    ? (quotedCredits as number[]).reduce((sum, value) => sum + value, 0)
    : null;
  const allPriceableQuoted = priceableStages.length > 0 && pricedTargets.length === priceableStages.length;

  const generateConversation = useCallback(() => {
    if (!workflow || !allPriceableQuoted) return;
    Alert.alert(
      "Create Story Audio?",
      `${pricedTargets.length} dialogue line${pricedTargets.length === 1 ? "" : "s"} will be submitted together and created in parallel using the prices you just reviewed.${totalCredits !== null ? `\n\nEstimated total: ${totalCredits} credits.` : ""}\n\nYou can continue working while the lines are generated.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create in parallel",
          onPress: () => void (async () => {
            setBusy(true);
            setMessage("");
            try {
              await runLimited(pricedTargets, AUDIO_FANOUT_CONCURRENCY, async (stage) => {
                const preview = previews[stage.stage_run_id];
                if (!preview) return null;
                return dispatchDialogueAudio(
                  workflow.workflow_id,
                  stage.stage_run_id,
                  audioPricingQuote(preview)
                );
              });
              if (!mounted.current) return;
              setWorkflow(await getStudioWorkflow(workflow.workflow_id));
              setPreviews({});
              setMessage(`${pricedTargets.length} Audio jobs were submitted together and are being generated in parallel.`);
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
      const allApproved = audioStages(authoritative).length > 0 &&
        audioStages(authoritative).every((stage) => stage.state === "approved");
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

  const pickerParticipant = picker?.participantId
    ? participantById.get(picker.participantId)
    : undefined;
  const pickerDraft = picker?.participantId ? draftProfiles[picker.participantId] : undefined;
  const pickerVoices = pickerDraft?.locale ? voiceCache[pickerDraft.locale] ?? [] : [];
  const selectedVoice = pickerVoices.find((item) => item.key === pickerDraft?.voiceId);
  const availableStyles = voiceStyles(selectedVoice);
  const choices: Choice[] = picker?.kind === "locale"
    ? locales.map((item) => ({
        key: item.code,
        label: localeLabel(item.code),
        subtitle: clean((item.raw as any)?.native_name) || undefined,
      }))
    : picker?.kind === "voice"
      ? pickerVoices.map((item) => ({
          key: item.key,
          label: clean(item.raw?.display_name) || item.label,
          subtitle: [clean(item.raw?.gender), clean(item.raw?.voice_type)].filter(Boolean).join(" • ") || undefined,
        }))
      : [
          { key: "", label: "Natural", subtitle: "Use the provider's natural delivery" },
          ...availableStyles.map((item) => ({ key: item, label: item })),
        ];

  const selectChoice = useCallback((choice: Choice) => {
    if (!picker) return;
    const participantId = picker.participantId;
    setDraftProfiles((current) => {
      const prior = current[participantId] || { locale: "", voiceId: "", style: "" };
      if (picker.kind === "locale") {
        const locale = localeByCode.get(choice.key);
        return {
          ...current,
          [participantId]: {
            locale: choice.key,
            voiceId: clean((locale?.raw as any)?.default_voice),
            style: "",
          },
        };
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
    router.push({
      pathname: "/(tabs)/dashboard" as any,
      params: { openMenu: "1", menu_nonce: `${Date.now()}`, menu_source: "story_audio" },
    } as any);
  }, []);
  const openPlan = useCallback(() => {
    router.push({ pathname: "/(tabs)/billing" as any, params: { intent: "manage", source: "story_audio" } } as any);
  }, []);

  if (loading && !workflow) {
    return (
      <View style={styles.safe}>
        <DFHeader subtitle="Audio Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={STUDIO.accent} />
          <Text style={styles.helper}>Preparing character voices…</Text>
        </View>
      </View>
    );
  }

  const approvedCount = stages.filter((stage) => stage.state === "approved").length;
  const reviewableCount = stages.filter((stage) => stage.state === "awaiting_review").length;
  const generatingCount = stages.filter((stage) => stage.state === "generating").length;

  return (
    <View style={styles.safe}>
      <DFHeader subtitle="Audio Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { maxWidth: viewport.contentMaxWidth, paddingHorizontal: viewport.horizontalPadding },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={STUDIO.accent}
            onRefresh={() => { setRefreshing(true); void load(true); }}
          />
        }
      >
        <StudioHero
          eyebrow="STORY • AUDIO"
          title={workspace?.title || "Character voices"}
          subtitle="desifaces prepares compatible voices from your story. Once confirmed, all independent dialogue lines are submitted together and generated in parallel."
          right={<ProgressLine current={approvedCount} total={stages.length} label="Dialogue" />}
        />

        {message ? (
          <Surface style={styles.messageBox} accent>
            <Text style={styles.messageText}>{message}</Text>
          </Surface>
        ) : null}

        <SectionLabel title="Character voices" meta={`${speakers.length} speaker${speakers.length === 1 ? "" : "s"}`} />
        {speakers.map((speaker) => {
          const id = speaker.participant_id;
          const draft = draftProfiles[id] || { locale: "", voiceId: "", style: "" };
          const auto = autoProfiles[id];
          const voices = draft.locale ? voiceCache[draft.locale] ?? [] : [];
          const voice = voices.find((item) => item.key === draft.voiceId);
          const stylesForVoice = voiceStyles(voice);
          const locked = participantLocked(id);
          const dirty = profileDirty(id);
          return (
            <Surface key={id} accent={!dirty} style={styles.characterCard}>
              <View style={styles.characterHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.characterName}>{speaker.display_name || "Character"}</Text>
                  <Text style={styles.characterMeta}>
                    {auto?.status === "suggested"
                      ? "desifaces suggestion • editable before generation"
                      : locked
                        ? "Voice locked for generated dialogue"
                        : "Change only if you want a different performance"}
                  </Text>
                </View>
                <StatusPill
                  value={locked ? "Locked" : dirty ? "Save choice" : "Ready"}
                  tone={locked || !dirty ? "success" : "accent"}
                />
              </View>

              <View style={styles.choiceGrid}>
                <Pressable
                  disabled={locked}
                  onPress={() => setPicker({ kind: "locale", participantId: id })}
                  style={({ pressed }) => [styles.choiceCard, locked && styles.disabled, pressed && !locked && styles.pressed]}
                >
                  <Text style={styles.choiceKicker}>Language</Text>
                  <Text style={styles.choiceValue}>{draft.locale ? localeLabel(draft.locale) : "Choose language"}</Text>
                </Pressable>

                <Pressable
                  disabled={locked || !draft.locale}
                  onPress={() => { void loadVoices(draft.locale); setPicker({ kind: "voice", participantId: id }); }}
                  style={({ pressed }) => [styles.choiceCard, (locked || !draft.locale) && styles.disabled, pressed && !locked && styles.pressed]}
                >
                  <Text style={styles.choiceKicker}>Voice</Text>
                  <Text style={styles.choiceValue}>
                    {clean(voice?.raw?.display_name) || clean(auto?.voice_display_name) || draft.voiceId || "Choose voice"}
                  </Text>
                  {clean(voice?.raw?.gender || auto?.voice_gender) ? (
                    <Text style={styles.choiceHint}>{clean(voice?.raw?.gender || auto?.voice_gender)}</Text>
                  ) : null}
                </Pressable>

                <Pressable
                  disabled={locked || !draft.voiceId}
                  onPress={() => setPicker({ kind: "style", participantId: id })}
                  style={({ pressed }) => [styles.choiceCard, (locked || !draft.voiceId) && styles.disabled, pressed && !locked && styles.pressed]}
                >
                  <Text style={styles.choiceKicker}>Delivery</Text>
                  <Text style={styles.choiceValue}>{draft.style || "Natural"}</Text>
                  <Text style={styles.choiceHint}>{stylesForVoice.length ? "Optional" : "Natural provider delivery"}</Text>
                </Pressable>
              </View>

              {!locked && dirty ? (
                <View style={styles.saveRow}>
                  <Text style={styles.saveHint}>Save once; this voice applies to every dialogue line for this character.</Text>
                  <CompactButton
                    label={savingId === id ? "Saving…" : "Save voice"}
                    onPress={() => void saveProfile(id)}
                    disabled={savingId === id || !draft.locale || !draft.voiceId}
                    tone="primary"
                  />
                </View>
              ) : null}
            </Surface>
          );
        })}

        <SectionLabel title="Conversation" meta={`${approvedCount}/${stages.length} approved`} />
        <Surface style={styles.pricingBar} accent={allPriceableQuoted || generatingCount > 0}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pricingTitle}>
              {generatingCount > 0
                ? `Creating ${generatingCount} Audio line${generatingCount === 1 ? "" : "s"} in parallel`
                : allPriceableQuoted
                  ? "Audio price ready"
                  : "Price before creating"}
            </Text>
            <Text style={styles.pricingMeta}>
              {generatingCount > 0
                ? `${reviewableCount} already ready to review. Completed lines stay preserved; you can continue working while the rest finish.`
                : allPriceableQuoted
                  ? `${pricedTargets.length} line${pricedTargets.length === 1 ? "" : "s"}${totalCredits !== null ? ` • ${totalCredits} credits estimated` : ""}. All lines will be submitted together.`
                  : "desifaces prices each dialogue line through the existing pricing service. Nothing starts until you confirm."}
            </Text>
          </View>
          <View style={styles.pricingActions}>
            {!allPriceableQuoted && priceableStages.length && generatingCount === 0 ? (
              <CompactButton label="Check price" onPress={() => void checkConversationPrice()} disabled={busy} />
            ) : null}
            {allPriceableQuoted && generatingCount === 0 ? (
              <CompactButton label="Confirm & create in parallel" onPress={generateConversation} disabled={busy} tone="primary" />
            ) : null}
            {allPriceableQuoted && generatingCount === 0 ? (
              <CompactButton label="Reprice" onPress={() => void checkConversationPrice()} disabled={busy} />
            ) : null}
            {reviewableCount ? (
              <CompactButton label={`Approve ready (${reviewableCount})`} onPress={() => void approveReady()} disabled={busy} tone="primary" />
            ) : null}
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
            const lineCredits = quoteCredits(preview);
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
                    {preview ? (
                      <Text style={styles.dialoguePrice}>{lineCredits !== null ? `${lineCredits} credits` : "Price ready"}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.dialogueActions, { width: viewport.actionWidth }]}>
                    {["awaiting_review", "approved"].includes(stage.state) ? (
                      <CompactButton label="Play" onPress={() => void playStage(stage)} disabled={busy} fill />
                    ) : null}
                    {canReview ? (
                      <CompactButton label="Approve" onPress={() => void reviewTurn(stage, "approved")} disabled={busy} tone="primary" fill />
                    ) : null}
                    {canReview ? (
                      <CompactButton label="Revise" onPress={() => void reviewTurn(stage, "revise")} disabled={busy} fill />
                    ) : null}
                    {stage.state === "generating" ? <ActivityIndicator size="small" color={STUDIO.accent} /> : null}
                    {stage.state === "approved" ? <StatusPill value="Locked" tone="success" /> : null}
                    {clean(sync?.error_message) ? (
                      <Text style={styles.lineError} numberOfLines={2}>{clean(sync?.error_message)}</Text>
                    ) : null}
                  </View>
                </View>
              </Surface>
            );
          })}
        </View>

        <Divider />
        <View style={styles.footerRow}>
          <Text style={styles.footerTitle}>
            {approvedCount === stages.length && stages.length ? "Audio ready for Fusion" : "Your script remains unchanged"}
          </Text>
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
  helper: { color: STUDIO.muted, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  messageBox: { padding: 10 },
  messageText: { color: "#FFE6B2", fontSize: 11, lineHeight: 16, fontWeight: "700" },
  characterCard: { gap: 10, padding: 10 },
  characterHead: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  characterName: { color: STUDIO.text, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  characterMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  choiceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceCard: { flex: 1, minWidth: 145, borderRadius: 12, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft, padding: 9, minHeight: 67 },
  choiceKicker: { color: STUDIO.faint, fontSize: 10, lineHeight: 14, fontWeight: "900", letterSpacing: 0.2 },
  choiceValue: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900", marginTop: 4 },
  choiceHint: { color: STUDIO.muted, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 2 },
  saveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  saveHint: { flex: 1, color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  pricingBar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 10 },
  pricingTitle: { color: STUDIO.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  pricingMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  pricingActions: { flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "flex-end" },
  dialogueList: { gap: 7 },
  dialogueCard: { padding: 9 },
  dialogueRow: { flexDirection: "row", alignItems: "stretch", gap: 9 },
  dialogueIndex: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft, alignItems: "center", justifyContent: "center" },
  dialogueIndexText: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "900" },
  dialogueBody: { flex: 1, minWidth: 0, gap: 4 },
  dialogueHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  dialogueSpeaker: { flex: 1, color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  dialogueText: { color: "rgba(255,255,255,0.84)", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  dialoguePrice: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "800" },
  dialogueActions: { flexShrink: 0, justifyContent: "center", gap: 5 },
  lineError: { color: "#FFC0C6", fontSize: 10, lineHeight: 14, fontWeight: "700" },
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
  choiceLabel: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  choiceSubtitle: { color: STUDIO.muted, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 1 },
  check: { color: STUDIO.accent, fontSize: 13, fontWeight: "900" },
  empty: { color: STUDIO.muted, fontSize: 10, lineHeight: 15, textAlign: "center", padding: 28 },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.48 },
});
