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
  type WorkspaceParticipant,
} from "./api/multiPersonStory";

type Props = { storyId: string };
type StageMap<T> = Record<string, T>;
type Choice = { key: string; label: string; subtitle?: string };
type PickerKind = "locale" | "voice" | "style";
type PickerState = { kind: PickerKind; participantId: string } | null;
type AudioPlayerHandle = ReturnType<typeof createAudioPlayer>;

type DraftProfile = {
  locale: string;
  voiceId: string;
  style: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function localeRegionCode(value: unknown) {
  const parts = clean(value).replace(/_/g, "-").split("-").filter(Boolean);
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const part = parts[index];
    if (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part)) return part.toUpperCase();
  }
  return "";
}

function localeDisplay(locale: UiLocale | undefined, countries: Map<string, UiCountry>) {
  if (!locale) return { language: "", country: "", full: "" };
  const language = clean(locale.label) || clean(locale.code);
  const region = localeRegionCode(locale.code);
  const country = countries.get(region)?.label || "";
  return { language, country, full: country ? `${language} • ${country}` : language };
}

function normalizeGender(value: unknown) {
  const raw = clean(value).toLowerCase();
  if (["male", "man", "m", "boy"].includes(raw)) return "Male";
  if (["female", "woman", "f", "girl"].includes(raw)) return "Female";
  if (["neutral", "nonbinary", "non-binary"].includes(raw)) return "Neutral";
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

function localeDefaultVoice(locale: UiLocale | undefined) {
  return clean((locale?.raw as any)?.default_voice);
}

function stageLabel(stage: StudioStageView, preview?: AudioPricingPreview) {
  if (stage.state === "approved") return "Approved";
  if (stage.state === "awaiting_review") return "Ready to review";
  if (stage.state === "generating") return "Generating";
  if (stage.state === "failed") return "Needs retry";
  if (stage.state === "rejected") return "Ready for a new version";
  return preview ? "Price ready" : "Ready to price";
}

function stageTone(stage: StudioStageView, preview?: AudioPricingPreview) {
  if (stage.state === "approved") return "success" as const;
  if (stage.state === "awaiting_review" || preview) return "accent" as const;
  if (stage.state === "failed" || stage.state === "rejected") return "danger" as const;
  return "neutral" as const;
}

function quoteCredits(preview: AudioPricingPreview | null | undefined) {
  const p: any = preview?.pricing ?? {};
  const values = [p.estimated_credits, p.credits, p.pricing?.estimated_credits, p.pricing?.credits, p.summary?.estimated_credits, p.pricing?.summary?.estimated_credits];
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const label = clean(p.summary?.estimated_credits_label || p.summary?.display_total || p.pricing?.summary?.estimated_credits_label || p.pricing?.summary?.display_total);
  const match = label.match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function ChoiceModal({ visible, title, choices, selected, loading, onClose, onSelect }: {
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

export default function MultiPersonAudioCharacterWorkspaceScreen({ storyId }: Props) {
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
  const [pollErrors, setPollErrors] = useState<StageMap<string>>({});
  const [picker, setPicker] = useState<PickerState>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [saving, setSaving] = useState<StageMap<boolean>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const playerRef = useRef<AudioPlayerHandle | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      try { playerRef.current?.remove(); } catch {}
      playerRef.current = null;
    };
  }, []);

  const countryByCode = useMemo(() => new Map(countries.map((item) => [item.code, item])), [countries]);

  const loadVoices = useCallback(async (locale: string) => {
    const code = clean(locale);
    if (!code || voiceCache[code]) return;
    setPickerLoading(true);
    try {
      const response = await fetchAudioVoices(token || undefined, code);
      if (!mounted.current) return;
      setVoiceCache((current) => ({ ...current, [code]: normalizeVoices(response) }));
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setPickerLoading(false);
    }
  }, [token, voiceCache]);

  const hydrateDrafts = useCallback((nextWorkspace: StoryWorkspaceView, auto?: AudioAutoConfigureResult) => {
    const autoMap = new Map((auto?.characters ?? []).map((item) => [item.participant_id, item]));
    setDrafts((current) => {
      const copy = { ...current };
      (nextWorkspace.participants ?? []).forEach((participant) => {
        const id = participant.participant_id;
        const resolved = autoMap.get(id);
        const locale = clean(resolved?.locale || participant.preferred_locale);
        const voiceId = clean(resolved?.voice_id || participant.voice_profile_ref);
        const existing = copy[id];
        copy[id] = {
          locale: existing?.locale || locale,
          voiceId: existing?.voiceId || voiceId,
          style: existing?.style || "",
        };
      });
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
      const executableLocales = normalizeLocales(localeResponse).filter((locale) => localeDefaultVoice(locale));
      const normalizedCountries = normalizeCountries(countryResponse);
      let nextWorkspace = initialWorkspace;
      let latestWorkflow = initialWorkflow;
      let autoResult: AudioAutoConfigureResult | undefined;

      if (initialWorkflow.current_stage === "audio") {
        autoResult = await autoConfigureStoryAudio(initialWorkflow.workflow_id);
        nextWorkspace = await getStoryWorkspace(storyId);
        const map: Record<string, AudioAutoCharacter> = {};
        (autoResult.characters ?? []).forEach((item) => { map[item.participant_id] = item; });
        setAutoProfiles(map);
      }

      const recoverable = audioStages(latestWorkflow).filter((stage) => ["generating", "awaiting_review", "approved"].includes(stage.state));
      const recovered: StageMap<AudioSyncResult> = {};
      if (recoverable.length) {
        const settled = await Promise.allSettled(recoverable.map((stage) => syncDialogueAudio(latestWorkflow.workflow_id, stage.stage_run_id)));
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") {
            recovered[recoverable[index].stage_run_id] = result.value;
            latestWorkflow = result.value.workflow || latestWorkflow;
          }
        });
      }
      if (!mounted.current) return;
      setLocales(executableLocales);
      setCountries(normalizedCountries);
      setWorkspace(nextWorkspace);
      setWorkflow(latestWorkflow);
      setSyncs((current) => ({ ...current, ...recovered }));
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
  const speakingIds = useMemo(() => new Set(stages.map((stage) => clean(stage.participant_id)).filter(Boolean)), [stages]);
  const speakers = useMemo(() => (workspace?.participants ?? []).filter((participant) => speakingIds.has(participant.participant_id)), [speakingIds, workspace]);
  const participantById = useMemo(() => new Map((workspace?.participants ?? []).map((participant) => [participant.participant_id, participant])), [workspace]);
  const dialogueByTurn = useMemo(() => {
    const map = new Map<string, any>();
    (workspace?.scenes ?? []).forEach((scene: any) => {
      (scene?.dialogue ?? []).forEach((turn: any) => map.set(clean(turn?.dialogue_turn_id || turn?.turn_id), turn));
    });
    return map;
  }, [workspace]);

  useEffect(() => {
    speakers.forEach((participant) => {
      const locale = clean(drafts[participant.participant_id]?.locale);
      if (locale) void loadVoices(locale);
    });
  }, [drafts, loadVoices, speakers]);

  useEffect(() => {
    if (!workflow) return;
    const generating = audioStages(workflow).filter((stage) => stage.state === "generating");
    if (!generating.length) return;
    const timer = setInterval(async () => {
      const settled = await Promise.allSettled(generating.map((stage) => syncDialogueAudio(workflow.workflow_id, stage.stage_run_id)));
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
          errors[stage.stage_run_id] = userFacingStudioError(result.reason);
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
    const id = participant.participant_id;
    const draft = drafts[id];
    if (!draft?.locale || !draft?.voiceId) {
      setMessage(`Choose a language and voice for ${participant.display_name || "this character"}.`);
      return;
    }
    setSaving((current) => ({ ...current, [id]: true }));
    setMessage("");
    try {
      const result = await configureParticipantVoice(workflow.workflow_id, id, {
        voice_id: draft.voiceId,
        voice_locale: draft.locale,
        style: draft.style || null,
      });
      setAutoProfiles((current) => ({
        ...current,
        [id]: {
          participant_id: id,
          display_name: result.display_name,
          ready: true,
          status: "user_selected",
          locale: result.voice_locale,
          language: locales.find((item) => item.code === result.voice_locale)?.label || result.voice_locale,
          voice_id: result.voice_id,
          voice_display_name: result.voice_display_name,
          voice_gender: result.voice_gender,
          message: "Your voice choice is saved.",
        },
      }));
      setWorkspace(await getStoryWorkspace(storyId));
      setPreviews({});
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setSaving((current) => ({ ...current, [id]: false }));
    }
  }, [drafts, locales, storyId, workflow]);

  const profilesReady = speakers.length > 0 && speakers.every((participant) => {
    const draft = drafts[participant.participant_id];
    return Boolean(clean(draft?.locale) && clean(draft?.voiceId));
  });

  const checkConversationPrice = useCallback(async () => {
    if (!workflow || !profilesReady) {
      setMessage("desifaces needs a ready voice for every speaking character before pricing.");
      return;
    }
    const targets = audioStages(workflow).filter((stage) => ["pending", "ready", "failed", "rejected"].includes(stage.state));
    if (!targets.length) return;
    setActionBusy(true);
    setMessage("");
    try {
      const settled = await Promise.allSettled(targets.map((stage) => previewDialogueAudio(workflow.workflow_id, stage.stage_run_id)));
      const patch: StageMap<AudioPricingPreview> = {};
      const failures: string[] = [];
      settled.forEach((result, index) => {
        if (result.status === "fulfilled") patch[targets[index].stage_run_id] = result.value;
        else failures.push(userFacingStudioError(result.reason));
      });
      setPreviews((current) => ({ ...current, ...patch }));
      if (failures.length) setMessage(failures[0]);
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [profilesReady, workflow]);

  const generateConversation = useCallback(async () => {
    if (!workflow) return;
    const targets = audioStages(workflow).filter((stage) => Boolean(previews[stage.stage_run_id]));
    if (!targets.length) return void checkConversationPrice();
    setActionBusy(true);
    setMessage("");
    try {
      const settled = await Promise.allSettled(targets.map((stage) => dispatchDialogueAudio(workflow.workflow_id, stage.stage_run_id, audioPricingQuote(previews[stage.stage_run_id]))));
      const failed = settled.find((result) => result.status === "rejected");
      setWorkflow(await getStudioWorkflow(workflow.workflow_id));
      setPreviews({});
      if (failed && failed.status === "rejected") setMessage(userFacingStudioError(failed.reason));
    } catch (error) {
      setMessage(userFacingStudioError(error));
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
      if (!pending) return setWorkflow(authoritative);
      setWorkflow(await reviewStudioOutput(pending.review_item_id, decision));
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [workflow]);

  const approveReady = useCallback(async () => {
    if (!workflow) return;
    const ready = audioStages(workflow).filter((stage) => stage.state === "awaiting_review" && latestPendingReview(stage));
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
      setWorkflow(latest);
    } catch (error) {
      setMessage(userFacingStudioError(error));
    } finally {
      if (mounted.current) setActionBusy(false);
    }
  }, [workflow]);

  const play = useCallback(async (url: string) => {
    const source = clean(url);
    if (!source) return;
    try {
      try { playerRef.current?.remove(); } catch {}
      await setAudioModeAsync({ playsInSilentMode: true });
      await setIsAudioActiveAsync(true);
      const player = createAudioPlayer({ uri: source });
      playerRef.current = player;
      player.play();
    } catch (error) {
      setMessage(userFacingStudioError(error));
    }
  }, []);

  const openPicker = useCallback(async (kind: PickerKind, participantId: string) => {
    const locale = clean(drafts[participantId]?.locale);
    if (kind !== "locale" && locale) await loadVoices(locale);
    setPicker({ kind, participantId });
  }, [drafts, loadVoices]);

  const pickerDraft = picker ? drafts[picker.participantId] : undefined;
  const pickerLocale = clean(pickerDraft?.locale);
  const pickerVoice = (voiceCache[pickerLocale] ?? []).find((voice) => voice.key === pickerDraft?.voiceId);
  const localeChoices: Choice[] = locales
    .map((locale) => {
      const display = localeDisplay(locale, countryByCode);
      return { key: locale.code, label: display.language, subtitle: display.country ? `Country: ${display.country}` : "Global" };
    })
    .sort((a, b) => `${a.subtitle} ${a.label}`.localeCompare(`${b.subtitle} ${b.label}`));
  const voiceChoices: Choice[] = (voiceCache[pickerLocale] ?? []).map((voice) => ({
    key: voice.key,
    label: clean((voice.raw as any)?.display_name) || voice.label,
    subtitle: [normalizeGender((voice.raw as any)?.gender), localeDisplay(locales.find((item) => item.code === voice.locale), countryByCode).full].filter(Boolean).join(" • "),
  }));
  const styleChoices: Choice[] = [
    { key: "", label: "Natural / default", subtitle: "Use the voice's natural delivery" },
    ...voiceStyles(pickerVoice).map((style) => ({ key: style, label: style })),
  ];
  const choices = picker?.kind === "locale" ? localeChoices : picker?.kind === "voice" ? voiceChoices : styleChoices;

  const approved = stages.filter((stage) => stage.state === "approved").length;
  const reviewReady = stages.filter((stage) => stage.state === "awaiting_review").length;
  const generating = stages.filter((stage) => stage.state === "generating").length;
  const failed = stages.filter((stage) => stage.state === "failed").length;
  const generated = approved + reviewReady;
  const pricedCount = Object.keys(previews).length;
  const totalCredits = Object.values(previews).reduce((sum, preview) => sum + (quoteCredits(preview) || 0), 0);

  const openMenu = useCallback(() => router.push({ pathname: "/(tabs)/dashboard" as any, params: { openMenu: "1", menu_nonce: `${Date.now()}`, menu_source: "story_audio" } } as any), []);
  const openPlan = useCallback(() => router.push({ pathname: "/(tabs)/billing" as any, params: { intent: "manage", source: "story_audio" } } as any), []);

  if (loading && !workflow) {
    return (
      <View style={styles.safe}>
        <DFHeader subtitle="Story Audio Studio" onMenuPress={openMenu} onPressMeta={openPlan} />
        <View style={styles.center}><ActivityIndicator size="large" color={STUDIO.accent} /><Text style={styles.helper}>Preparing voices from your story…</Text></View>
      </View>
    );
  }

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
          subtitle="desifaces prepares a compatible voice from your script. Keep the suggestion or change language, voice or delivery before generation."
          right={<ProgressLine current={approved} total={stages.length} label="Audio" />}
        />

        {message ? <Surface style={styles.messageBox} accent><Text style={styles.messageText}>{message}</Text></Surface> : null}

        <SectionLabel title="Character voices" meta={`${speakers.length} speaker${speakers.length === 1 ? "" : "s"}`} />
        {speakers.map((participant) => {
          const id = participant.participant_id;
          const draft = drafts[id] || { locale: "", voiceId: "", style: "" };
          const locale = locales.find((item) => item.code === draft.locale);
          const localeText = localeDisplay(locale, countryByCode).full || clean(autoProfiles[id]?.language) || "Choose language";
          const selectedVoice = (voiceCache[draft.locale] ?? []).find((voice) => voice.key === draft.voiceId);
          const voiceText = clean((selectedVoice?.raw as any)?.display_name) || clean(autoProfiles[id]?.voice_display_name) || draft.voiceId || "Choose voice";
          const auto = autoProfiles[id];
          const lineCount = stages.filter((stage) => clean(stage.participant_id) === id).length;
          const locked = stages.some((stage) => clean(stage.participant_id) === id && ["generating", "awaiting_review", "approved"].includes(stage.state));
          return (
            <Surface key={id} accent={Boolean(auto?.ready)} style={styles.voiceCard}>
              <View style={styles.voiceHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.voiceName}>{participant.display_name || "Character"}</Text>
                  <Text style={styles.voiceMeta}>{lineCount} dialogue line{lineCount === 1 ? "" : "s"}</Text>
                </View>
                <StatusPill value={locked ? "LOCKED" : auto?.status === "suggested" ? "SUGGESTED" : auto?.ready ? "READY" : "NEEDS CHOICE"} tone={auto?.ready ? "success" : "neutral"} />
              </View>

              {auto?.message ? <Text style={styles.suggestionText}>{auto.message}</Text> : null}

              <View style={styles.voiceControls}>
                <Pressable disabled={locked} onPress={() => void openPicker("locale", id)} style={({ pressed }) => [styles.selectBox, pressed && !locked && styles.pressed, locked && styles.disabled]}>
                  <Text style={styles.selectLabel}>LANGUAGE & COUNTRY</Text>
                  <Text style={styles.selectValue} numberOfLines={2}>{localeText}</Text>
                  <Text style={styles.selectChevron}>›</Text>
                </Pressable>
                <Pressable disabled={locked || !draft.locale} onPress={() => void openPicker("voice", id)} style={({ pressed }) => [styles.selectBox, pressed && !locked && styles.pressed, (locked || !draft.locale) && styles.disabled]}>
                  <Text style={styles.selectLabel}>VOICE</Text>
                  <Text style={styles.selectValue} numberOfLines={2}>{voiceText}</Text>
                  <Text style={styles.selectChevron}>›</Text>
                </Pressable>
              </View>
              <Pressable disabled={locked || !draft.voiceId} onPress={() => void openPicker("style", id)} style={({ pressed }) => [styles.deliveryBox, pressed && !locked && styles.pressed, (locked || !draft.voiceId) && styles.disabled]}>
                <Text style={styles.selectLabel}>DELIVERY</Text>
                <Text style={styles.selectValue}>{draft.style || "Natural / default"}</Text>
                <Text style={styles.selectChevron}>›</Text>
              </Pressable>
              {!locked ? <CompactButton label={saving[id] ? "Saving…" : auto?.status === "suggested" ? "Keep suggestion" : "Update voice"} onPress={() => void saveVoice(participant)} disabled={Boolean(saving[id]) || !draft.locale || !draft.voiceId} tone="primary" fill /> : null}
            </Surface>
          );
        })}

        <SectionLabel title="Conversation audio" meta={`${approved} approved • ${reviewReady} ready`} />
        <Surface style={styles.progressCard} accent={generating > 0 || reviewReady > 0}>
          <View style={styles.progressCopy}>
            <Text style={styles.progressTitle}>Conversation progress</Text>
            <Text style={styles.progressMessage}>
              {!profilesReady
                ? "Step 1 of 3 • Review the suggested character voices. Change only what you want."
                : generating > 0
                  ? `Creating ${generating} of ${stages.length} dialogue lines. This screen updates automatically.`
                  : reviewReady > 0
                    ? `${reviewReady} line${reviewReady === 1 ? " is" : "s are"} ready to review • ${approved}/${stages.length} approved.`
                    : failed > 0
                      ? `${failed} line${failed === 1 ? " needs" : "s need"} a retry. Completed lines stay untouched.`
                      : approved === stages.length && stages.length > 0
                        ? "All dialogue audio is approved and ready for Fusion."
                        : pricedCount > 0
                          ? `Step 3 of 3 • Price ready for ${pricedCount} line${pricedCount === 1 ? "" : "s"}. Confirm Generate to start.`
                          : "Step 2 of 3 • Check the conversation price. Nothing is generated until you confirm."}
            </Text>
          </View>
          <ProgressLine current={generated} total={stages.length} label="Generated" />
        </Surface>

        <Surface style={styles.toolbar} accent={pricedCount > 0}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.toolbarTitle}>{stages.length} dialogue turns</Text>
            <Text style={styles.toolbarMeta}>
              {!profilesReady ? "Character voice setup needs attention" : generating > 0 ? `${generating} generating` : pricedCount > 0 ? `Price ready${totalCredits ? ` • ${totalCredits} credits` : ""}` : reviewReady > 0 ? `${reviewReady} ready to review` : "Ready for pricing"}
            </Text>
          </View>
          <CompactButton label="Check price" onPress={() => void checkConversationPrice()} disabled={actionBusy || !profilesReady || generating > 0} />
          <CompactButton label="Generate" onPress={() => void generateConversation()} disabled={actionBusy || pricedCount === 0 || generating > 0} tone="primary" />
          <CompactButton label="Approve ready" onPress={() => void approveReady()} disabled={actionBusy || reviewReady === 0} />
        </Surface>

        <Surface style={styles.dialogueList}>
          {stages.map((stage, index) => {
            const turn = dialogueByTurn.get(clean(stage.dialogue_turn_id));
            const participant = participantById.get(clean(stage.participant_id));
            const sync = syncs[stage.stage_run_id];
            const preview = previews[stage.stage_run_id];
            const audioUrl = clean(sync?.audio_url);
            const error = pollErrors[stage.stage_run_id] || clean(sync?.error_message);
            return (
              <View key={stage.stage_run_id} style={styles.dialogueRow}>
                <Text style={styles.turnNumber}>{index + 1}</Text>
                <View style={styles.dialogueBody}>
                  <View style={styles.dialogueHead}>
                    <Text style={styles.speaker}>{participant?.display_name || sync?.display_name || "Character"}</Text>
                    <StatusPill value={stageLabel(stage, preview)} tone={stageTone(stage, preview)} />
                  </View>
                  <Text style={styles.dialogueText} numberOfLines={3}>{clean(turn?.text) || "Dialogue"}</Text>
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                  {audioUrl ? (
                    <View style={styles.rowActions}>
                      <CompactButton label="Play" onPress={() => void play(audioUrl)} />
                      {stage.state === "awaiting_review" ? <CompactButton label="Approve" onPress={() => void reviewLine(stage, "approved")} tone="primary" /> : null}
                      {stage.state === "awaiting_review" ? <CompactButton label="Revise" onPress={() => void reviewLine(stage, "revise")} /> : null}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </Surface>

        <Divider />
        <View style={styles.footerRow}>
          <Text style={styles.footerTitle}>{approved === stages.length && stages.length > 0 ? "Dialogue ready for Fusion" : "Audio in progress"}</Text>
          <Text style={styles.footerMeta}>{approved}/{stages.length} approved</Text>
        </View>
      </ScrollView>

      <ChoiceModal
        visible={Boolean(picker)}
        title={picker?.kind === "locale" ? "Choose language & country" : picker?.kind === "voice" ? "Choose voice" : "Choose delivery"}
        choices={choices}
        selected={picker?.kind === "locale" ? pickerDraft?.locale : picker?.kind === "voice" ? pickerDraft?.voiceId : pickerDraft?.style || ""}
        loading={pickerLoading}
        onClose={() => setPicker(null)}
        onSelect={(choice) => {
          if (!picker) return;
          const id = picker.participantId;
          if (picker.kind === "locale") {
            const nextLocale = choice.key;
            const defaultVoice = localeDefaultVoice(locales.find((item) => item.code === nextLocale));
            setDrafts((current) => ({ ...current, [id]: { locale: nextLocale, voiceId: defaultVoice, style: "" } }));
            void loadVoices(nextLocale);
          } else if (picker.kind === "voice") {
            setDrafts((current) => ({ ...current, [id]: { ...(current[id] || { locale: "", style: "" }), voiceId: choice.key, style: "" } }));
          } else {
            setDrafts((current) => ({ ...current, [id]: { ...(current[id] || { locale: "", voiceId: "" }), style: choice.key } }));
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
  messageBox: { padding: 10 },
  messageText: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  voiceCard: { padding: 10, gap: 9 },
  voiceHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  voiceName: { color: STUDIO.text, fontSize: 15, fontWeight: "900" },
  voiceMeta: { color: STUDIO.muted, fontSize: 9, fontWeight: "700", marginTop: 1 },
  suggestionText: { color: STUDIO.accentText, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  voiceControls: { flexDirection: "row", gap: 8 },
  selectBox: { flex: 1, minHeight: 58, borderRadius: 11, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center" },
  deliveryBox: { minHeight: 54, borderRadius: 11, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surfaceSoft, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center" },
  selectLabel: { color: STUDIO.faint, fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  selectValue: { color: STUDIO.text, fontSize: 11, lineHeight: 15, fontWeight: "800", marginTop: 3, paddingRight: 14 },
  selectChevron: { position: "absolute", right: 8, top: 17, color: STUDIO.faint, fontSize: 17, fontWeight: "700" },
  progressCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 11 },
  progressCopy: { flex: 1, minWidth: 0, gap: 3 },
  progressTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  progressMessage: { color: STUDIO.muted, fontSize: 9, lineHeight: 13, fontWeight: "700" },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, flexWrap: "wrap" },
  toolbarTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  toolbarMeta: { color: STUDIO.muted, fontSize: 8, lineHeight: 11, fontWeight: "700", marginTop: 2 },
  dialogueList: { padding: 0, overflow: "hidden" },
  dialogueRow: { flexDirection: "row", gap: 10, padding: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: STUDIO.border },
  turnNumber: { width: 18, color: STUDIO.faint, fontSize: 9, fontWeight: "900", paddingTop: 2 },
  dialogueBody: { flex: 1, minWidth: 0, gap: 5 },
  dialogueHead: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  speaker: { flex: 1, color: STUDIO.accentText, fontSize: 10, fontWeight: "900" },
  dialogueText: { color: STUDIO.text, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  errorText: { color: "#FFC0C6", fontSize: 8, lineHeight: 11, fontWeight: "700" },
  rowActions: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  footerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 2 },
  footerTitle: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  footerMeta: { color: STUDIO.muted, fontSize: 10, fontWeight: "800" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.78)", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 600, maxHeight: "82%", alignSelf: "center", borderRadius: 18, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.raised, padding: 12 },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  modalTitle: { flex: 1, color: STUDIO.text, fontSize: 15, fontWeight: "900" },
  modalClose: { color: STUDIO.muted, fontSize: 25, lineHeight: 28 },
  modalLoading: { minHeight: 180, alignItems: "center", justifyContent: "center" },
  choiceList: { paddingBottom: 6 },
  choiceRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 9, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: STUDIO.border },
  choiceSelected: { backgroundColor: STUDIO.accentFill },
  choiceLabel: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  choiceSubtitle: { color: STUDIO.muted, fontSize: 9, fontWeight: "600", marginTop: 2 },
  check: { color: STUDIO.accent, fontSize: 14, fontWeight: "900" },
  empty: { color: STUDIO.muted, fontSize: 10, textAlign: "center", padding: 24 },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.45 },
});