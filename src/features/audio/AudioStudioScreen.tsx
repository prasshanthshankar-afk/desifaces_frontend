
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  ScrollView,
  Animated,
  Easing,
  Share as RNShare,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Audio } from "expo-av";

import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import { shareUrl } from "../../core/share/share";
import { saveCreateFlowContext } from "../../core/media/createFlow";
import { api } from "../../core/api/client";
import { endpoints } from "../../core/api/endpoints";
import { AUDIO_BASE, FACE_BASE } from "../../core/config/env";
import { derivePricingUiSummary } from "../../core/pricing/pricingSummary";

import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import DFBlockingOverlay from "../../core/ui/DFBlockingOverlay";
import { PricingTopBar } from "../../components/pricing/PricingTopBar";
import { UpgradePromptSheet } from "../../components/pricing/UpgradePromptSheet";
import { PricingBreakdownSheet } from "../../components/pricing/PricingBreakdownSheet";
import { RunReceiptCard } from "../../components/pricing/RunReceiptCard";
import { JobPricingTimeline } from "../../components/pricing/JobPricingTimeline";
import { normalizePricing, normalizePricingSummary } from "../pricing/normalizers";
import GlobalJobsTray, { type StudioJobItem } from "../jobs/components/GlobalJobsTray";

import {
  fetchAudioLocales,
  fetchAudioVoices,
  normalizeLocales,
  normalizeVoices,
  UiLocale,
  UiVoice,
} from "./api/masterdataAudio";

import { apiGetTtsJobStatus, TTSCreateRequest, VariantAudio } from "./api/creatorAudio";

type Opt = { code: string; label: string };


function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function cleanParam(v: any): string {
  if (Array.isArray(v)) v = v[0];
  return String(v ?? "").trim().replace(/^"+|"+$/g, "");
}

function normalizeAspectRatio(v: any): "9:16" | "16:9" | "1:1" {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "16:9" || s === "landscape") return "16:9";
  if (s === "1:1" || s === "square") return "1:1";
  return "9:16";
}

function isAllowedLocale(code: string) {
  const c = (code || "").trim();
  if (!c) return false;
  return c.endsWith("-IN") || c === "en-US" || c === "en-GB";
}

const LOCALE_RANK: Record<string, number> = {
  "en-IN": 0,
  "hi-IN": 1,
  "ta-IN": 2,
  "te-IN": 3,
  "kn-IN": 4,
  "ml-IN": 5,
  "bn-IN": 6,
  "mr-IN": 7,
  "gu-IN": 8,
  "pa-IN": 9,
  "ur-IN": 10,
  "or-IN": 11,
  "as-IN": 12,
  "en-US": 90,
  "en-GB": 91,
};

type UiAudioDuration = {
  duration_sec?: number;
  duration_ms?: number;
};

function asPositiveNumber(value: any): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function toDuration(duration_ms?: number, duration_sec?: number): UiAudioDuration {
  const ms = asPositiveNumber(duration_ms);
  const sec = asPositiveNumber(duration_sec) ?? (ms ? ms / 1000 : undefined);
  return {
    duration_ms: ms ?? (sec ? sec * 1000 : undefined),
    duration_sec: sec ?? (ms ? ms / 1000 : undefined),
  };
}

function readAudioDuration(source: any, fallback?: any): UiAudioDuration {
  const duration_ms =
    asPositiveNumber(source?.duration_ms) ??
    asPositiveNumber(source?.audio_duration_ms) ??
    asPositiveNumber(source?.meta?.duration_ms) ??
    asPositiveNumber(source?.metadata?.duration_ms) ??
    asPositiveNumber(source?.probe?.duration_ms) ??
    asPositiveNumber(fallback?.duration_ms) ??
    asPositiveNumber(fallback?.audio_duration_ms) ??
    asPositiveNumber(fallback?.meta?.duration_ms) ??
    asPositiveNumber(fallback?.metadata?.duration_ms) ??
    asPositiveNumber(fallback?.probe?.duration_ms);

  const duration_sec =
    asPositiveNumber(source?.duration_sec) ??
    asPositiveNumber(source?.audio_duration_sec) ??
    asPositiveNumber(source?.meta?.duration_sec) ??
    asPositiveNumber(source?.metadata?.duration_sec) ??
    asPositiveNumber(source?.probe?.duration_sec) ??
    asPositiveNumber(fallback?.duration_sec) ??
    asPositiveNumber(fallback?.audio_duration_sec) ??
    asPositiveNumber(fallback?.meta?.duration_sec) ??
    asPositiveNumber(fallback?.metadata?.duration_sec) ??
    asPositiveNumber(fallback?.probe?.duration_sec);

  return toDuration(duration_ms, duration_sec);
}

function formatDurationLabel(duration: UiAudioDuration | null | undefined): string | null {
  const sec = duration?.duration_sec ?? (duration?.duration_ms ? duration.duration_ms / 1000 : undefined);
  if (!sec || sec <= 0) return null;
  const rounded = Math.round(sec);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;
}

async function probeRemoteAudioDuration(audioUrl: string): Promise<UiAudioDuration> {
  const url = cleanParam(audioUrl);
  if (!url) return {};
  let sound: Audio.Sound | null = null;
  try {
    const created = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: false });
    sound = created.sound;
    const status: any = await sound.getStatusAsync();
    if (status?.isLoaded && asPositiveNumber(status.durationMillis)) {
      return toDuration(status.durationMillis, status.durationMillis / 1000);
    }
  } catch {}
  finally {
    try {
      await sound?.unloadAsync();
    } catch {}
  }
  return {};
}

async function resolveVariantDuration(variant: any): Promise<UiAudioDuration> {
  const current = readAudioDuration(variant);
  if (current.duration_ms || current.duration_sec) return current;
  const probed = await probeRemoteAudioDuration(variant?.audio_url);
  return readAudioDuration(probed);
}

function normalizeAudioVariants(status: any): VariantAudio[] {
  const vars = status?.variants || status?.outputs || [];
  if (!Array.isArray(vars)) return [];
  return vars
    .map((v: any) => {
      const duration = readAudioDuration(v, status);
      return {
        artifact_id: v?.artifact_id ?? v?.audio_artifact_id ?? null,
        audio_url: v?.audio_url ?? v?.url ?? null,
        content_type: v?.content_type ?? v?.mime ?? null,
        bytes: v?.bytes ?? null,
        duration_ms: duration.duration_ms ?? null,
        duration_sec: duration.duration_sec ?? null,
      };
    })
    .filter((v: any) => !!cleanParam(v.audio_url));
}


function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const Item = ({ n, label }: { n: 1 | 2 | 3; label: string }) => {
    const active = step === n;
    const done = step > n;
    return (
      <View style={{ flex: 1, alignItems: "center" }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: done ? "rgba(248,184,72,0.55)" : DF.border,
            backgroundColor: active ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>{n}</Text>
        </View>
        <Text style={{ color: active ? DF.text : DF.muted, marginTop: 6, fontWeight: "800", fontSize: 11 }}>
          {label}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingTop: 8 }}>
      <Item n={1} label="Face" />
      <View style={{ width: 22, height: 1, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.10)" }} />
      <Item n={2} label="Audio" />
      <View style={{ width: 22, height: 1, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.10)" }} />
      <Item n={3} label="Fusion" />
    </View>
  );
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View
      style={[
        {
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.05)",
          padding: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function ProgressBar({ progress01, label }: { progress01: Animated.Value; label?: string | null }) {
  return (
    <GlassCard style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: DF.text, fontWeight: "900" }}>{label ?? "Progress"}</Text>
        <Animated.Text style={{ color: DF.muted, fontWeight: "800" }}>
          {progress01.interpolate({
            inputRange: [0, 1],
            outputRange: ["0%", "100%"],
          })}
        </Animated.Text>
      </View>

      <View
        style={{
          marginTop: 10,
          height: 10,
          borderRadius: 10,
          backgroundColor: "rgba(255,255,255,0.06)",
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
        }}
      >
        <Animated.View
          style={{
            height: 10,
            width: progress01.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
            backgroundColor: "rgba(232,152,56,0.55)",
          }}
        />
      </View>
    </GlassCard>
  );
}

function SelectModal({
  open,
  title,
  items,
  selectedCode,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  items: Opt[];
  selectedCode?: string | null;
  onClose: () => void;
  onSelect: (x: Opt) => void;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} onPress={onClose} />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: DF.night,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          maxHeight: "70%",
        }}
      >
        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>{title}</Text>
          <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 12 }}>Tap to select.</Text>
        </View>

        <FlatList
          data={items}
          keyExtractor={(x) => x.code}
          contentContainerStyle={{ padding: 10, paddingBottom: 18 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const active = item.code === selectedCode;
            return (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: active ? "rgba(232,152,56,0.42)" : "rgba(255,255,255,0.10)",
                  backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function CompactChip({
  label,
  value,
  onPress,
  disabled,
  active,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
        backgroundColor: active ? "rgba(232,152,56,0.16)" : disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
        paddingVertical: 10,
        paddingHorizontal: 12,
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 10 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
        <Text
          numberOfLines={1}
          style={{
            color: DF.text,
            fontWeight: "900",
            fontSize: 12,
            flex: 1,
            paddingRight: 10,
          }}
        >
          {value}
        </Text>
        <Text style={{ color: "rgba(248,216,104,0.65)", fontWeight: "900", fontSize: 14 }}>›</Text>
      </View>
    </Pressable>
  );
}

function isUnauthorized(e: any): boolean {
  const msg = String(e?.message ?? "").toLowerCase();
  const code = String(e?.code ?? "").toLowerCase();
  const status = Number(e?.status ?? e?.response?.status ?? NaN);

  return (
    status === 401 ||
    code === "unauthorized" ||
    code === "http_401" ||
    msg.includes("unauthorized") ||
    msg.includes("401") ||
    msg.includes("session_expired")
  );
}

function readVoiceGender(v: UiVoice | undefined | null): string {
  return String((v as any)?.raw?.gender ?? (v as any)?.gender ?? "").toLowerCase();
}

function pickPricingLabel(resp: any): string | undefined {
  const summary = resp?.pricing_summary ?? null;
  if (summary?.finalLabel) return String(summary.finalLabel);
  if (summary?.final_label) return String(summary.final_label);
  if (summary?.receiptLabel) return String(summary.receiptLabel);
  if (summary?.receipt_label) return String(summary.receipt_label);
  if (summary?.estimateLabel) return String(summary.estimateLabel);
  if (summary?.estimate_label) return String(summary.estimate_label);

  const pricing = resp?.pricing ?? null;
  if (pricing?.amount != null && pricing?.currency) return `${pricing.currency} ${pricing.amount}`;
  return undefined;
}

function pickFinalPricingMessage(resp: any): string | null {
  const summary = resp?.pricing_summary ?? null;
  if (typeof summary?.message === "string" && summary.message.trim()) return summary.message;
  if (typeof summary?.detail === "string" && summary.detail.trim()) return summary.detail;

  const pricing = resp?.pricing ?? null;
  if (pricing?.state === "released") return "Reservation released. No final charge was applied.";
  if (pricing?.state === "committed") return "Final pricing snapshot captured from the completed run.";
  return null;
}

function readFinalPricingState(resp: any): "estimated" | "committed" | "released" {
  const state = String(resp?.pricing?.state ?? "").toLowerCase();
  if (state === "committed") return "committed";
  if (state === "released") return "released";
  return "estimated";
}

function stageFromAudioStatus(status: any): StudioJobItem["stage"] {
  const s = String(status ?? "").toLowerCase();
  if (s === "queued" || s === "pending") return "queued";
  if (s === "preparing" || s === "submitted") return "preparing";
  if (s === "processing" || s === "running" || s === "in_progress") return "running";
  if (s === "finalizing" || s === "publishing") return "finalizing";
  if (s === "succeeded" || s === "completed" || s === "ready") return "succeeded";
  if (s === "failed" || s === "error" || s === "canceled" || s === "cancelled") return "failed";
  return "running";
}

function nextProgress(current: number, stage: StudioJobItem["stage"]): number {
  const floor =
    stage === "queued"
      ? 0.14
      : stage === "preparing"
        ? 0.24
        : stage === "running"
          ? 0.58
          : stage === "finalizing"
            ? 0.82
            : stage === "succeeded"
              ? 1
              : current;
  return Math.max(current, floor);
}

type AudioEstimateResult = {
  preview: boolean;
  estimateLabel: string;
  detailLabel: string;
  settlementLabel: string;
  planLabel: string;
  availableLabel: string;
  holdLabel?: string;
  ctaLabel: string;
  insufficientBalance: boolean;
  confirmation?: { quote_id?: string; preview_fingerprint?: string } | null;
  raw?: any;
  pricing?: ReturnType<typeof normalizePricing>;
  pricingSummary?: ReturnType<typeof normalizePricingSummary>;
};

export default function AudioStudioScreen() {
  const auth = useAuth() as any;
  const { isReady, isAuthed, token } = auth;
  const tokenReady = !!token && isReady && isAuthed;

  const flow = useCreatorFlow() as any;
  const setFaceSelection = flow?.setFaceSelection as undefined | ((x: any) => void);
  const setAudioSelection = flow?.setAudioSelection as undefined | ((x: any) => void);
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);

  const params = useLocalSearchParams<{
    face_job_id?: string | string[];
    face_media_asset_id?: string | string[];
    face_profile_id?: string | string[];
    face_image_url?: string | string[];
    image_url?: string | string[];
    face_sas_url?: string | string[];
    media_asset_id?: string | string[];
    face_artifact_id?: string | string[];
    face_media_asset_id_legacy?: string | string[];
    gender?: string | string[];
    resolution?: string | string[];
    aspect_ratio?: string | string[];
  }>();

  const faceJobId = cleanParam(params.face_job_id) || "";
  const faceProfileId = cleanParam(params.face_profile_id) || "";
  const faceMediaAssetIdParam =
    cleanParam(params.face_media_asset_id) ||
    cleanParam(params.face_media_asset_id_legacy) ||
    cleanParam(params.media_asset_id) ||
    "";
  const faceArtifactIdParam = cleanParam(params.face_artifact_id) || "";
  const faceImageUrlParam =
    cleanParam(params.face_sas_url) || cleanParam(params.face_image_url) || cleanParam(params.image_url) || "";
  const faceGenderParam = cleanParam(params.gender) || "";
  const selectedAspectRatio = normalizeAspectRatio(cleanParam(params.aspect_ratio) || cleanParam(params.resolution) || flow?.fusionAspectRatio || "9:16");

  const [busy, setBusy] = useState(false);
  const [navLocked, setNavLocked] = useState(false);
  const locked = busy || navLocked;

  const [statusText, setStatusText] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [workflowSummaryOpen, setWorkflowSummaryOpen] = useState(false);
  const [jobs, setJobs] = useState<StudioJobItem[]>([]);
  const [backgroundNotice, setBackgroundNotice] = useState<string | null>(null);
  const [finalPricingLabel, setFinalPricingLabel] = useState<string | null>(null);
  const [finalPricingMessage, setFinalPricingMessage] = useState<string | null>(null);
  const [finalPricingState, setFinalPricingState] = useState<"estimated" | "committed" | "released">("estimated");
  const [showPricingBreakdown, setShowPricingBreakdown] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [text, setText] = useState("");
  const [targetLocale, setTargetLocale] = useState("hi-IN");
  const [sourceLanguage, setSourceLanguage] = useState<string | null>(null);
  const [translate, setTranslate] = useState(true);

  const [voice, setVoice] = useState<string | null>(null);
  const [context, setContext] = useState<string>("");

  const [variants, setVariants] = useState<VariantAudio[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const [openLocale, setOpenLocale] = useState(false);
  const [openSource, setOpenSource] = useState(false);
  const [openVoice, setOpenVoice] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const animateTo = useCallback(
    (to01: number, ms = 650) => {
      Animated.timing(progress, {
        toValue: clamp01(to01),
        duration: ms,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [progress]
  );

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthed) setNeedsLogin(true);
  }, [isReady, isAuthed]);

  useEffect(() => {
    if (!backgroundNotice) return;
    const t = setTimeout(() => setBackgroundNotice(null), 5000);
    return () => clearTimeout(t);
  }, [backgroundNotice]);

  const flowFace = flow?.faceSelection ?? flow?.face ?? null;
  const flowFaceUrl = cleanParam(flowFace?.sasUrl ?? flowFace?.imageUrl ?? flowFace?.image_url ?? "");
  const flowFaceMediaAssetId = cleanParam(flowFace?.mediaAssetId ?? flowFace?.media_asset_id ?? "");
  const flowFaceArtifactId = cleanParam(flowFace?.artifactId ?? flowFace?.artifact_id ?? "");
  const flowFaceGender = cleanParam(flowFace?.gender ?? "");

  const effectiveFaceMediaAssetId = flowFaceMediaAssetId || faceMediaAssetIdParam;
  const effectiveFaceGender = flowFaceGender || faceGenderParam || "";
  const effectiveFaceArtifactId = flowFaceArtifactId || faceArtifactIdParam;

  type FaceStatus = { variants?: Array<{ media_asset_id?: string; image_url?: string }> };

  const faceStatusQ = useQuery({
    queryKey: ["face-status", faceJobId],
    queryFn: () => api.get<FaceStatus>(FACE_BASE, `/api/face/creator/jobs/${faceJobId}/status`),
    enabled: tokenReady && !!faceJobId && !flowFaceUrl && !faceImageUrlParam,
    staleTime: 0,
    retry: 0,
  });

  const faceLoading = faceStatusQ.isFetching || faceStatusQ.isLoading;
  const faceErr = (faceStatusQ.error as any)?.message ? String((faceStatusQ.error as any).message) : null;

  const faceImageUrl = useMemo(() => {
    if (flowFaceUrl) return flowFaceUrl || null;
    if (faceImageUrlParam) return faceImageUrlParam || null;

    const vars = faceStatusQ.data?.variants ?? [];
    const v =
      (effectiveFaceMediaAssetId
        ? vars.find((x) => String(x.media_asset_id || "") === String(effectiveFaceMediaAssetId))
        : null) ?? vars[0];

    const url = v?.image_url ? cleanParam(v.image_url) : "";
    return url || null;
  }, [flowFaceUrl, faceImageUrlParam, faceStatusQ.data, effectiveFaceMediaAssetId]);

  const hasFacePreview = !!faceImageUrl;
  const hasFaceArtifact = !!effectiveFaceArtifactId;

  useEffect(() => {
    if (!setFaceSelection) return;
    if (flowFaceUrl) return;
    if (!faceImageUrl) return;

    setFaceSelection({
      artifactId: effectiveFaceArtifactId || undefined,
      mediaAssetId: effectiveFaceMediaAssetId || undefined,
      faceProfileId: faceProfileId || undefined,
      sasUrl: faceImageUrl,
      imageUrl: faceImageUrl,
      variantIndex: undefined,
      ...(effectiveFaceGender ? ({ gender: effectiveFaceGender } as any) : {}),
    } as any);
  }, [faceImageUrl, setFaceSelection, flowFaceUrl, effectiveFaceArtifactId, effectiveFaceMediaAssetId, effectiveFaceGender]);

  useEffect(() => {
    if (!faceImageUrl) return;
    saveCreateFlowContext({
      image_url: faceImageUrl || undefined,
      face_artifact_id: effectiveFaceArtifactId || undefined,
      face_profile_id: faceProfileId || undefined,
      media_asset_id: effectiveFaceMediaAssetId || undefined,
      aspect_ratio: selectedAspectRatio,
      ...(effectiveFaceGender ? ({ gender: effectiveFaceGender } as any) : {}),
    } as any).catch(() => {});
  }, [faceImageUrl, effectiveFaceArtifactId, faceProfileId, effectiveFaceMediaAssetId, effectiveFaceGender, selectedAspectRatio]);

  const localesQ = useQuery({
    queryKey: ["audio-locales"],
    queryFn: () => fetchAudioLocales(token),
    enabled: tokenReady,
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const localesErr = (localesQ.error as any)?.message ? String((localesQ.error as any).message) : null;
  const uiLocales: UiLocale[] = useMemo(() => normalizeLocales(localesQ.data as any), [localesQ.data]);

  const filteredLocales: UiLocale[] = useMemo(() => {
    const list = uiLocales.filter((l) => isAllowedLocale(l.code));
    list.sort((a, b) => {
      const ra = LOCALE_RANK[a.code] ?? 50;
      const rb = LOCALE_RANK[b.code] ?? 50;
      if (ra !== rb) return ra - rb;
      return String(a.label).localeCompare(String(b.label)) || String(a.code).localeCompare(String(b.code));
    });
    return list;
  }, [uiLocales]);

  useEffect(() => {
    if (!filteredLocales.length) return;
    const ok = filteredLocales.some((l) => l.code === targetLocale);
    if (!ok) {
      setTargetLocale(filteredLocales[0].code);
      setVoice(null);
    }
  }, [filteredLocales, targetLocale]);

  const voicesQ = useQuery({
    queryKey: ["audio-voices", targetLocale],
    queryFn: () => fetchAudioVoices(token, targetLocale),
    enabled: tokenReady && !!targetLocale,
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const voicesErr = (voicesQ.error as any)?.message ? String((voicesQ.error as any).message) : null;
  const uiVoices: UiVoice[] = useMemo(() => normalizeVoices(voicesQ.data as any), [voicesQ.data]);

  useEffect(() => {
    if (voice) return;
    if (!uiVoices.length) return;

    const wantedGender = effectiveFaceGender.toLowerCase();
    const genderMatched =
      wantedGender === "male"
        ? uiVoices.find((v) => readVoiceGender(v) === "male")
        : wantedGender === "female"
          ? uiVoices.find((v) => readVoiceGender(v) === "female")
          : null;

    const def = genderMatched || uiVoices.find((v) => (v as any)?.raw?.is_default) || uiVoices[0];
    setVoice(def.key);
  }, [uiVoices, voice, effectiveFaceGender]);

  useEffect(() => {
    if (!sourceLanguage) return;
    if (sourceLanguage === targetLocale) setTranslate(false);
  }, [sourceLanguage, targetLocale]);

  const localeLabel = filteredLocales.find((x) => x.code === targetLocale)?.label ?? targetLocale;
  const sourceLabel =
    sourceLanguage
      ? filteredLocales.find((x) => x.code === sourceLanguage)?.label ?? sourceLanguage
      : "Auto";
  const selectedVoice = uiVoices.find((x) => x.key === voice) ?? null;
  const voiceLabel = selectedVoice?.label ?? (voice ?? "Select");

  const localeOptions: Opt[] = useMemo(
    () => filteredLocales.map((l) => ({ code: l.code, label: `${l.label} (${l.code})` })),
    [filteredLocales]
  );
  const voiceOptions: Opt[] = useMemo(() => uiVoices.map((v) => ({ code: v.key, label: v.label })), [uiVoices]);

  const pricingPreviewPayload = useMemo(
    () => ({
      text: text.trim() || undefined,
      target_locale: targetLocale || undefined,
      source_language: translate ? sourceLanguage || undefined : undefined,
      translate,
      voice: voice || undefined,
      voice_id: voice || undefined,
      context: context?.trim() || undefined,
    }),
    [text, targetLocale, sourceLanguage, translate, voice, context]
  );

  const pricingQ = useQuery<AudioEstimateResult>({
    queryKey: ["audio-pricing-estimate", pricingPreviewPayload],
    enabled: tokenReady && !!faceImageUrl && !!text.trim() && !!voice,
    staleTime: 20_000,
    retry: 0,
    queryFn: async () => {
      const raw = await api.post<any>(
        AUDIO_BASE,
        (endpoints as any)?.audio?.pricingPreview || "/api/audio/tts/pricing/preview",
        pricingPreviewPayload
      );

      const pricing = normalizePricing(raw?.pricing, raw?.pricing_summary);
      const pricingSummary =
        normalizePricingSummary(raw?.pricing, raw?.pricing_summary) ||
        derivePricingUiSummary(pricing, {
          estimateLabel:
            raw?.pricing_summary?.estimateLabel ||
            raw?.pricing_summary?.estimate_label ||
            raw?.message ||
            null,
          message: raw?.message || null,
        });

      const confirmation = {
        quote_id:
          raw?.pricing_confirmation?.quote_id ||
          raw?.confirmation?.quote_id ||
          raw?.quote_id ||
          raw?.pricing?.quote_id ||
          undefined,
        preview_fingerprint:
          raw?.pricing_confirmation?.preview_fingerprint ||
          raw?.confirmation?.preview_fingerprint ||
          raw?.preview_fingerprint ||
          raw?.pricing?.preview_fingerprint ||
          undefined,
      };

      const estimateLabel = pricingSummary?.estimateLabel || pricingSummary?.receiptLabel || "Estimate pending";
      const messageText = String(raw?.message || pricingSummary?.message || pricing?.message || "").toLowerCase();
      const insufficientBalance = Boolean(
        raw?.insufficient_balance ||
          raw?.insufficientBalance ||
          (pricing as any)?.insufficientBalance ||
          (pricingSummary as any)?.insufficientBalance ||
          messageText.includes("insufficient") ||
          messageText.includes("not enough credit")
      );

      return {
        preview: false,
        estimateLabel,
        detailLabel: `${text.trim().length} characters • ${targetLocale} • ${voiceLabel}`,
        settlementLabel:
          pricing?.settlementMode === "postpaid"
            ? "Final billed amount is confirmed after completion."
            : pricing?.settlementMode === "included"
              ? "This run is covered by plan or included quota."
              : pricing?.message || pricingSummary?.message || "Reservation is finalized after completion.",
        planLabel:
          pricing?.tierCode ||
          raw?.pricing?.tier_code ||
          raw?.tier_code ||
          raw?.entitlement?.tier_code ||
          "Current plan",
        availableLabel:
          insufficientBalance
            ? "Not enough credits for this run"
            : pricing?.billingMode === "bill"
              ? "Billed after completion"
              : pricing?.settlementMode === "included"
                ? "Covered by plan"
                : "Balance available",
        holdLabel:
          pricing?.stage === "reserved"
            ? pricingSummary?.message || "Amount reserved"
            : pricing?.settlementMode === "postpaid"
              ? "No credit hold"
              : undefined,
        ctaLabel: confirmation.quote_id ? `Create Audio — ${estimateLabel}` : "Create Audio",
        insufficientBalance,
        confirmation,
        raw,
        pricing,
        pricingSummary,
      };
    },
  });

  const pricing = pricingQ.data;
  const pricingConfirmation = pricing?.confirmation ?? null;
  const pricingReady = Boolean(pricingConfirmation?.quote_id);
  const previewPendingMessage =
    !!text.trim() &&
    !!voice &&
    !!faceImageUrl &&
    !pricingReady &&
    !pricingQ.isFetching &&
    !pricingQ.error
      ? "Pricing preview is being prepared. Generate will unlock as soon as the estimate is ready."
      : null;

  const soundRef = useRef<Audio.Sound | null>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  const stopSound = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      }
    } catch {}
    soundRef.current = null;
    setPlayingIdx(null);
  }, []);

  useEffect(() => {
    return () => {
      stopSound();
    };
  }, [stopSound]);

  const playPause = useCallback(
    async (idx: number, url?: string | null) => {
      const u = cleanParam(url);
      if (!u) return;

      if (playingIdx === idx) {
        await stopSound();
        return;
      }

      await stopSound();

      try {
        const { sound } = await Audio.Sound.createAsync({ uri: u }, { shouldPlay: true });
        soundRef.current = sound;
        setPlayingIdx(idx);
        sound.setOnPlaybackStatusUpdate((st: any) => {
          if (st?.didJustFinish) stopSound();
        });
      } catch {
        setStatusText("Audio playback failed.");
      }
    },
    [playingIdx, stopSound]
  );

  const onShare = useCallback(async () => {
    const v = selectedIdx != null ? variants[selectedIdx] : null;
    const url = cleanParam((v as any)?.audio_url);
    if (!url) return;

    try {
      await shareUrl(url, { title: "DesiFaces Audio", message: "Audio shared from DesiFaces" });
    } catch {
      try {
        await RNShare.share({ message: url });
      } catch {}
    }
  }, [selectedIdx, variants]);

  const updateJob = useCallback(
    (jobId: string, patch: Partial<StudioJobItem> | ((prev: StudioJobItem) => StudioJobItem)) => {
      setJobs((prev) =>
        prev.map((job) => {
          if (job.id !== jobId) return job;
          return typeof patch === "function" ? patch(job) : { ...job, ...patch };
        })
      );
    },
    []
  );

  const dismissJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== jobId));
  }, []);

  const openPlanScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "manage",
          source: "audio",
          plan: pricing?.planLabel ?? "",
          availability: pricing?.availableLabel ?? "",
          settlement: pricing?.settlementLabel ?? "",
        },
      } as any);
    } catch {
      router.push("/(tabs)/dashboard" as any);
    }
  }, [pricing?.availableLabel, pricing?.planLabel, pricing?.settlementLabel]);

  const creepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const creepRef = useRef<number>(0);

  const openUpgradeScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "upgrade",
          source: "audio",
          plan: pricing?.planLabel ?? "",
          availability: pricing?.availableLabel ?? "",
          settlement: pricing?.settlementLabel ?? "",
        },
      } as any);
    } catch {
      openPlanScreen();
    }
  }, [openPlanScreen, pricing?.availableLabel, pricing?.planLabel, pricing?.settlementLabel]);

  const clearCreepTimer = useCallback(() => {
    if (creepTimerRef.current) {
      clearInterval(creepTimerRef.current);
      creepTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearCreepTimer();
  }, [clearCreepTimer]);

  const generate = useCallback(async () => {
    if (!tokenReady) {
      setNeedsLogin(true);
      setStatusText("Session not ready. Please login and try again.");
      animateTo(0, 350);
      return;
    }

    if (!faceImageUrl) {
      setStatusText("Missing face input. Go back and select a face first.");
      animateTo(0, 350);
      return;
    }
    if (!text.trim()) {
      setStatusText("Please enter a script.");
      animateTo(0, 350);
      return;
    }
    if (!voice) {
      setStatusText("Please select a voice.");
      animateTo(0, 350);
      return;
    }
    if (!pricingConfirmation?.quote_id) {
      setStatusText("Pricing preview is not ready yet. Please wait a moment and try again.");
      animateTo(0, 350);
      return;
    }
    if (pricing?.insufficientBalance) {
      setStatusText("You do not have enough credits for this voice generation. Please upgrade or top up to continue.");
      animateTo(0, 350);
      return;
    }

    setBusy(true);
    setFinalPricingLabel(null);
    setFinalPricingMessage(null);
    setFinalPricingState("estimated");
    setStatusText("Creating audio…");
    animateTo(0.06, 500);

    clearCreepTimer();
    creepRef.current = 0.12;

    try {
      await stopSound();
      setVariants([]);
      setSelectedIdx(null);

      const payload: TTSCreateRequest = {
        text: text.trim(),
        target_locale: targetLocale,
        source_language: translate ? sourceLanguage : null,
        translate,
        voice: voice as any,
        voice_id: voice as any,
        context: context?.trim() || null,
      } as any;

      const created = await api.post<any>(
        AUDIO_BASE,
        (endpoints as any)?.audio?.tts || "/api/audio/tts",
        {
          ...payload,
          pricing_confirmation: {
            quote_id: pricingConfirmation.quote_id,
            ...(pricingConfirmation.preview_fingerprint
              ? { preview_fingerprint: pricingConfirmation.preview_fingerprint }
              : {}),
          },
        }
      );
      const newJobId = created?.job_id ?? (created as any)?.id ?? null;
      if (!newJobId) throw new Error("Missing job_id from create.");

      const newJob: StudioJobItem = {
        id: newJobId,
        kind: "audio",
        title: "Create Voice",
        stage: "queued",
        progress: 0.12,
        message: "Queued…",
        startedAt: Date.now(),
        backgrounded: false,
        resultReady: false,
        pricingLabel: pricing?.estimateLabel,
      };
      setJobs((prev) => [newJob, ...prev]);

      setStatusText("Job started. You can keep using the app while it runs.");
      animateTo(0.12, 650);

      creepTimerRef.current = setInterval(() => {
        creepRef.current = Math.min(0.92, creepRef.current + 0.015);
        animateTo(creepRef.current, 900);
      }, 1100);

      const longRunningTimer = setTimeout(() => {
        updateJob(newJobId, (prev) => ({
          ...prev,
          backgrounded: true,
          message: "Still generating in the background.",
        }));
        setBackgroundNotice("Your voice is still processing. You can continue using the app and return from Jobs when it is ready.");
      }, 15_000);

      try {
        for (let i = 0; i < 220; i++) {
          const last = await apiGetTtsJobStatus(newJobId);
          const stage = stageFromAudioStatus(last?.status);
          const pricingLabel = pickPricingLabel(last);

          updateJob(newJobId, (prev) => ({
            ...prev,
            stage,
            progress: nextProgress(prev.progress, stage),
            resultReady: stage === "succeeded",
            resultCount: stage === "succeeded" ? Math.max(normalizeAudioVariants(last).length, prev.resultCount || 0) : prev.resultCount,
            pricingLabel: pricingLabel ?? prev.pricingLabel,
            message:
              stage === "queued"
                ? "Queued…"
                : stage === "preparing"
                  ? "Preparing…"
                  : stage === "running"
                    ? prev.backgrounded
                      ? "Generating in background…"
                      : "Generating voice…"
                    : stage === "finalizing"
                      ? "Finalizing…"
                      : stage === "succeeded"
                        ? "Ready"
                        : stage === "failed"
                          ? String((last as any)?.error_message ?? (last as any)?.error_code ?? "Job failed.")
                          : prev.message,
          }));

          if (stage === "queued") {
            setStatusText("Queued…");
            animateTo(Math.max(creepRef.current, 0.26), 650);
          } else if (stage === "running" || stage === "preparing") {
            setStatusText("Generating voice…");
            animateTo(Math.max(creepRef.current, 0.45), 650);
          } else if (stage === "finalizing") {
            setStatusText("Finalizing audio…");
            animateTo(Math.max(creepRef.current, 0.82), 650);
          } else if (stage === "succeeded") {
            clearCreepTimer();
            animateTo(1.0, 550);

            const vars = normalizeAudioVariants(last);
            if (!vars.length) throw new Error("Succeeded but missing variants.");

            setVariants(vars);
            setSelectedIdx(0);
            setFinalPricingLabel(pricingLabel ?? null);
            setFinalPricingMessage(pickFinalPricingMessage(last));
            setFinalPricingState(readFinalPricingState(last));

            const first = vars[0];
            const firstUrl = cleanParam((first as any)?.audio_url);
            if (firstUrl && setAudioSelection) {
              const firstDuration = readAudioDuration(first, last);
              setAudioSelection({
                artifactId: cleanParam((first as any)?.artifact_id || "") || undefined,
                mediaAssetId: undefined,
                sasUrl: firstUrl,
                audioUrl: firstUrl,
                locale: targetLocale || undefined,
                voice: voice || undefined,
                scriptText: text.trim() || undefined,
                durationSec: firstDuration.duration_sec,
                durationMs: firstDuration.duration_ms,
                variantIndex: 0,
              });
            }

            setStatusText("Your voice is ready. Pick the version you like best, continue to Fusion, or finish here for now.");
            clearTimeout(longRunningTimer);
            return;
          } else if (stage === "failed") {
            clearCreepTimer();
            animateTo(0, 450);
            setFinalPricingLabel(pricingLabel ?? null);
            setFinalPricingMessage(pickFinalPricingMessage(last));
            setFinalPricingState(readFinalPricingState(last));
            throw new Error((last as any)?.error_message ?? (last as any)?.error_code ?? "Job failed.");
          }

          await new Promise((r) => setTimeout(r, 1200));
        }

        throw new Error("This voice is still processing. You can continue using the app, and the result will remain available from Jobs when it finishes.");
      } finally {
        clearTimeout(longRunningTimer);
      }
    } catch (e: any) {
      clearCreepTimer();

      if (isUnauthorized(e)) {
        setNeedsLogin(true);
        setStatusText("Session expired. Please login again, then tap Generate.");
        animateTo(0, 350);
      } else {
        setStatusText(e?.message ?? "Generate failed.");
        animateTo(0, 350);
      }
    } finally {
      clearCreepTimer();
      setBusy(false);
    }
  }, [
    tokenReady,
    faceImageUrl,
    text,
    voice,
    targetLocale,
    sourceLanguage,
    translate,
    context,
    pricingConfirmation,
    pricing?.estimateLabel,
    pricing?.insufficientBalance,
    stopSound,
    animateTo,
    clearCreepTimer,
    setAudioSelection,
    updateJob,
  ]);

  const selectedVariant = selectedIdx != null ? variants[selectedIdx] : null;

const proceedToFusion = useCallback(
  async (variant: VariantAudio) => {
    const audioUrl = cleanParam((variant as any)?.audio_url);
    const audioArtifactId = cleanParam((variant as any)?.artifact_id || "");
    const imageUrl = cleanParam(faceImageUrl);
    const faceArtifactId = cleanParam(effectiveFaceArtifactId);

    if (!audioUrl || !imageUrl) return;
    if (!faceArtifactId) {
      setStatusText("To continue to video, choose a face created in Face Studio.");
      return;
    }

    await stopSound();

    try {
      setNavLocked(true);

      const duration = await resolveVariantDuration(variant);

      setFaceSelection?.({
        artifactId: faceArtifactId || undefined,
        mediaAssetId: effectiveFaceMediaAssetId || undefined,
        sasUrl: imageUrl,
        imageUrl: imageUrl,
        gender: effectiveFaceGender || undefined,
      } as any);

      if (setAudioSelection) {
        setAudioSelection({
          artifactId: audioArtifactId || undefined,
          mediaAssetId: undefined,
          sasUrl: audioUrl,
          audioUrl: audioUrl,
          locale: targetLocale || undefined,
          voice: voice || undefined,
          scriptText: text.trim() || undefined,
          durationSec: duration.duration_sec,
          durationMs: duration.duration_ms,
          variantIndex: undefined,
        });
      }

      await saveCreateFlowContext({
        image_url: imageUrl,
        face_artifact_id: faceArtifactId || undefined,
        audio_url: audioUrl,
        script_text: text.trim() || undefined,
        audio_locale: targetLocale || undefined,
        audio_voice: voice || undefined,
        face_profile_id: faceProfileId || undefined,
        media_asset_id: effectiveFaceMediaAssetId || undefined,
        audio_artifact_id: audioArtifactId || undefined,
        audio_duration_sec: duration.duration_sec,
        audio_duration_ms: duration.duration_ms,
        aspect_ratio: selectedAspectRatio,
        ...(effectiveFaceGender ? ({ gender: effectiveFaceGender } as any) : {}),
      } as any);

      setFusionSettings?.({
        fusionAspectRatio: selectedAspectRatio,
      });

      router.push({
        pathname: "/(tabs)/fusion",
        params: {
          face_artifact_id: faceArtifactId,
          face_media_asset_id: effectiveFaceMediaAssetId || "",
          face_profile_id: faceProfileId || "",
          face_image_url: imageUrl,
          face_sas_url: imageUrl,
          image_url: imageUrl,
          audio_artifact_id: audioArtifactId ?? "",
          audio_url: audioUrl ?? "",
          audio_sas_url: audioUrl ?? "",
          audio_duration_sec: duration.duration_sec != null ? String(duration.duration_sec) : "",
          audio_duration_ms: duration.duration_ms != null ? String(duration.duration_ms) : "",
          script_text: text.trim() || "",
          audio_locale: targetLocale || "",
          audio_voice: voice || "",
          gender: effectiveFaceGender || "",
          aspect_ratio: selectedAspectRatio,
          stage: "audio_done",
        },
      } as any);
    } finally {
      setNavLocked(false);
    }
  },
  [
    faceImageUrl,
    effectiveFaceArtifactId,
    effectiveFaceMediaAssetId,
    faceProfileId,
    effectiveFaceGender,
    stopSound,
    setFaceSelection,
    setAudioSelection,
    setFusionSettings,
    targetLocale,
    voice,
    text,
    selectedAspectRatio,
  ]
);

  const keyExtractor = useCallback((item: VariantAudio, index: number) => {
    return cleanParam((item as any)?.artifact_id) || cleanParam((item as any)?.audio_url) || String(index);
  }, []);

  const renderVariantTile = useCallback(
    ({ item, index }: { item: VariantAudio; index: number }) => {
      const active = selectedIdx === index;
      const audioUrl = cleanParam((item as any)?.audio_url);

      return (
        <Pressable
          onPress={() => {
            if (locked) return;
            setSelectedIdx(index);
            if (audioUrl && setAudioSelection) {
              const itemDuration = readAudioDuration(item);
              setAudioSelection({
                artifactId: cleanParam((item as any)?.artifact_id || "") || undefined,
                mediaAssetId: undefined,
                sasUrl: audioUrl,
                audioUrl: audioUrl,
                locale: targetLocale || undefined,
                voice: voice || undefined,
                scriptText: text.trim() || undefined,
                durationSec: itemDuration.duration_sec,
                durationMs: itemDuration.duration_ms,
                variantIndex: index,
              });
            }
          }}
          disabled={locked}
          style={{
            borderRadius: 16,
            borderWidth: 2,
            borderColor: active ? "rgba(248,184,72,0.55)" : "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.05)",
            padding: 12,
            marginBottom: 10,
            opacity: locked ? 0.75 : 1,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: DF.text, fontWeight: "900" }}>Variant {index + 1}</Text>
            {active && (
              <View
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(248,184,72,0.55)",
                  backgroundColor: "rgba(232,152,56,0.18)",
                }}
              >
                <Text style={{ color: "rgba(248,232,136,1)", fontWeight: "900", fontSize: 12 }}>Selected</Text>
              </View>
            )}
          </View>

          <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, marginTop: 6 }}>
            {(item as any).content_type ?? "audio"}
            {(item as any).bytes ? ` • ${Math.round(((item as any).bytes as number) / 1024)} KB` : ""}
            {formatDurationLabel(readAudioDuration(item)) ? ` • ${formatDurationLabel(readAudioDuration(item))}` : ""}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => playPause(index, audioUrl)}
              disabled={locked}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(0,0,0,0.30)",
                alignItems: "center",
                justifyContent: "center",
                opacity: locked ? 0.7 : 1,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>{playingIdx === index ? "Pause" : "Play"}</Text>
            </Pressable>

            <Pressable
              onPress={() => proceedToFusion(item)}
              disabled={locked || !active || !audioUrl || !hasFaceArtifact}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: active ? "rgba(248,184,72,0.55)" : "rgba(255,255,255,0.10)",
                backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: locked || !active || !hasFaceArtifact ? 0.6 : 1,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>{hasFaceArtifact ? "Continue to Video" : "Choose a Face Studio face"}</Text>
            </Pressable>
          </View>
        </Pressable>
      );
    },
    [selectedIdx, locked, playingIdx, playPause, proceedToFusion, setAudioSelection]
  );

  const HeaderContent = (
    <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
      <PricingTopBar
        studioName="Audio Studio"
        estimate={finalPricingLabel ?? pricing?.estimateLabel ?? "Estimate pending"}
        walletAfterRun={pricing?.availableLabel ?? undefined}
        planName={pricing?.planLabel ?? undefined}
        includedUsageLeft={pricing?.availableLabel ?? undefined}
        availabilityLabel={pricing?.availableLabel ?? undefined}
        settlementLabel={pricing?.settlementLabel ?? "Estimate shown before the run. Final pricing is confirmed after completion."}
        entitlementLabel={pricing?.detailLabel ?? undefined}
        onPressBreakdown={() => setShowPricingBreakdown(true)}
        onPressManagePlan={openPlanScreen}
      />

      <GlassCard>
        <View>
          <Text style={{ color: DF.text, fontSize: 18, fontWeight: "900" }}>Create voice</Text>
          <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700" }}>
            Match the selected face with the right voice, then continue to Fusion.
          </Text>
        </View>
      </GlassCard>

      {(needsLogin || (!tokenReady && isReady)) && (
        <GlassCard
          style={{
            marginTop: 12,
            borderColor: "rgba(255,180,90,0.30)",
            backgroundColor: "rgba(255,180,90,0.10)",
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900" }}>Session needed</Text>
          <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6 }}>
            Please login again. Your selected face stays on this screen.
          </Text>
          <Pressable
            onPress={() => router.push("/(auth)/login" as any)}
            style={{
              marginTop: 10,
              borderRadius: 14,
              paddingVertical: 10,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>Login</Text>
          </Pressable>
        </GlassCard>
      )}

      <GlassCard style={{ marginTop: 12 }}>
        <Text style={{ color: DF.muted, fontWeight: "800", fontSize: 12, marginBottom: 10 }}>Selected Face</Text>

        {faceLoading && !faceImageUrl ? (
          <View
            style={{
              width: "100%",
              aspectRatio: 1,
              borderRadius: 16,
              backgroundColor: DF.night2,
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <ActivityIndicator />
            <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 10 }}>Loading face…</Text>
          </View>
        ) : faceImageUrl ? (
          <View
            style={{
              width: "100%",
              aspectRatio: 1,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: DF.night2,
            }}
          >
            <Image
              source={{ uri: faceImageUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="contain"
              contentPosition="center"
              transition={180}
            />
          </View>
        ) : (
          <View
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,120,120,0.35)",
              backgroundColor: "rgba(255,120,120,0.08)",
              padding: 12,
            }}
          >
            <Text style={{ color: "rgba(255,210,210,0.95)", fontWeight: "900" }}>Face missing</Text>
            <Text style={{ color: "rgba(255,210,210,0.85)", fontWeight: "700", marginTop: 6 }}>
              Please go back to Face Studio and select a face before generating audio.
            </Text>
            {!!faceErr && (
              <Text style={{ color: "rgba(255,180,180,0.85)", fontWeight: "700", marginTop: 8 }}>{faceErr}</Text>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => router.back()}
                disabled={locked}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  opacity: locked ? 0.7 : 1,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>Back to Face</Text>
              </Pressable>

              {!!faceJobId && (
                <Pressable
                  onPress={() => faceStatusQ.refetch()}
                  disabled={locked}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "rgba(248,184,72,0.35)",
                    backgroundColor: "rgba(232,152,56,0.12)",
                    opacity: locked ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Retry</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </GlassCard>

      {hasFacePreview && !hasFaceArtifact && (
        <GlassCard
          style={{
            marginTop: 12,
            borderColor: "rgba(255,180,90,0.30)",
            backgroundColor: "rgba(255,180,90,0.10)",
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900" }}>Video step needs a Face Studio face</Text>
          <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6 }}>
            You can create audio now. To continue to video, choose a face created in Face Studio.
          </Text>
        </GlassCard>
      )}

      <GlassCard style={{ marginTop: 12 }}>
        <Text style={{ color: DF.text, fontWeight: "900", marginBottom: 8 }}>Script</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write the script…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          multiline
          editable={!locked}
          style={{
            minHeight: 120,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.05)",
            color: DF.text,
            padding: 12,
            fontWeight: "700",
            textAlignVertical: "top",
          }}
        />

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <CompactChip
            label="Target"
            value={localeLabel}
            onPress={() => setOpenLocale(true)}
            disabled={locked || !filteredLocales.length || !tokenReady}
            active={!!targetLocale}
          />
          <CompactChip
            label="Voice"
            value={voiceLabel}
            onPress={() => setOpenVoice(true)}
            disabled={locked || !uiVoices.length || !tokenReady}
            active={!!voice}
          />
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <CompactChip
            label="Source"
            value={sourceLanguage ? sourceLabel : "Auto"}
            onPress={() => setOpenSource(true)}
            disabled={locked || !translate || !filteredLocales.length || !tokenReady}
            active={translate}
          />
          <Pressable
            onPress={() => {
              if (locked) return;
              setTranslate((v) => {
                const next = !v;
                if (!next) setSourceLanguage(null);
                return next;
              });
            }}
            disabled={locked || !tokenReady}
            style={{
              flex: 1,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: translate ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
              backgroundColor: translate ? "rgba(232,152,56,0.16)" : "rgba(255,255,255,0.06)",
              paddingVertical: 10,
              paddingHorizontal: 12,
              justifyContent: "center",
              opacity: locked ? 0.7 : 1,
            }}
          >
            <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 10 }}>Translate</Text>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12, marginTop: 6 }}>
              {translate ? "On" : "Off"}
            </Text>
          </Pressable>
        </View>

        <Text style={{ color: DF.muted, fontWeight: "800", fontSize: 12, marginTop: 12, marginBottom: 6 }}>
          Context (optional)
        </Text>
        <TextInput
          value={context}
          onChangeText={setContext}
          placeholder="e.g., warm, cinematic, energetic"
          placeholderTextColor="rgba(255,255,255,0.35)"
          editable={!locked}
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.05)",
            color: DF.text,
            padding: 12,
            fontWeight: "700",
          }}
        />
      </GlassCard>

      {(!!localesErr || !!voicesErr) && (
        <GlassCard
          style={{
            marginTop: 12,
            borderColor: "rgba(255,120,120,0.35)",
            backgroundColor: "rgba(255,120,120,0.08)",
          }}
        >
          <Text style={{ color: "rgba(255,210,210,0.95)", fontWeight: "900" }}>Audio masterdata failed</Text>
          {!!localesErr && (
            <Text style={{ color: "rgba(255,210,210,0.85)", fontWeight: "700", marginTop: 6 }}>
              Locales: {localesErr}
            </Text>
          )}
          {!!voicesErr && (
            <Text style={{ color: "rgba(255,210,210,0.85)", fontWeight: "700", marginTop: 6 }}>
              Voices: {voicesErr}
            </Text>
          )}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              onPress={() => localesQ.refetch()}
              disabled={locked}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                opacity: locked ? 0.7 : 1,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>Retry Locales</Text>
            </Pressable>

            <Pressable
              onPress={() => voicesQ.refetch()}
              disabled={locked}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(248,184,72,0.35)",
                backgroundColor: "rgba(232,152,56,0.12)",
                opacity: locked ? 0.7 : 1,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>Retry Voices</Text>
            </Pressable>
          </View>
        </GlassCard>
      )}


      {!!previewPendingMessage && (
        <GlassCard style={{ marginTop: 12 }}>
          <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>{previewPendingMessage}</Text>
        </GlassCard>
      )}

      {!!pricing?.insufficientBalance && (
        <GlassCard
          style={{
            marginTop: 12,
            borderColor: "rgba(255,180,90,0.30)",
            backgroundColor: "rgba(255,180,90,0.10)",
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900" }}>Not enough credits</Text>
          <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6 }}>
            You do not have enough credits for this voice generation. Upgrade your plan or top up to continue.
          </Text>
          <Pressable
            onPress={() => setShowUpgrade(true)}
            style={{
              marginTop: 10,
              borderRadius: 14,
              paddingVertical: 10,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>Upgrade or Top Up</Text>
          </Pressable>
        </GlassCard>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Pressable
          onPress={generate}
          disabled={locked || !faceImageUrl || !tokenReady || !text.trim() || !voice || !pricingReady || !!pricing?.insufficientBalance}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(248,184,72,0.55)",
            backgroundColor:
              !locked && !!faceImageUrl && !!tokenReady && !!text.trim() && !!voice && pricingReady && !pricing?.insufficientBalance
                ? "rgba(232,152,56,0.18)"
                : "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
            opacity: locked || !faceImageUrl || !tokenReady || !text.trim() || !voice || !pricingReady || !!pricing?.insufficientBalance ? 0.6 : 1,
          }}
        >
          {busy ? <ActivityIndicator /> : <Text style={{ color: DF.text, fontWeight: "900" }}>{pricing?.ctaLabel ?? "Create Audio"}</Text>}
        </Pressable>

        <Pressable
          onPress={onShare}
          disabled={locked || !cleanParam((selectedVariant as any)?.audio_url)}
          style={{
            width: 110,
            height: 52,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
            opacity: !locked && cleanParam((selectedVariant as any)?.audio_url) ? 1 : 0.5,
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900" }}>Share</Text>
        </Pressable>
      </View>

      {!!statusText && <ProgressBar progress01={progress} label={statusText} />}

      {!!backgroundNotice && (
        <GlassCard
          style={{
            marginTop: 12,
            borderColor: "rgba(248,184,72,0.22)",
            backgroundColor: "rgba(232,152,56,0.10)",
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>{backgroundNotice}</Text>
        </GlassCard>
      )}

      {variants.length > 0 && (
        <GlassCard style={{ marginTop: 12 }}>
          <View>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Choose your favorite</Text>
            <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 12 }}>
              Tap a tile, play it, then continue to Fusion.
            </Text>
          </View>
        </GlassCard>
      )}
    </View>
  );

  const openJob = useCallback(
    (job: StudioJobItem) => {
      if (job.resultReady) {
        setStatusText("Your voice is ready below. Pick a version, share it, or continue to Fusion.");
        animateTo(1, 300);
        return;
      }
      setStatusText(job.message || "This voice is still processing. You can continue using the app while we keep checking in the background.");
    },
    [animateTo]
  );

  const FooterContent = (
    <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 20 }}>
      {variants.length > 0 ? (
        <>
          <Pressable
            onPress={() => {
              if (selectedIdx == null) return;
              const v = variants[selectedIdx];
              if (!cleanParam((v as any)?.audio_url)) return;
              proceedToFusion(v);
            }}
            disabled={locked || selectedIdx == null || !cleanParam((selectedVariant as any)?.audio_url) || !hasFaceArtifact}
            style={{
              borderRadius: 16,
              paddingVertical: 14,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.35)",
              backgroundColor:
                !locked && selectedIdx != null && cleanParam((selectedVariant as any)?.audio_url)
                  ? "rgba(232,152,56,0.22)"
                  : "rgba(255,255,255,0.06)",
              opacity: locked ? 0.85 : 1,
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>
              {hasFaceArtifact ? "Continue to Video" : "Choose a Face Studio face"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setWorkflowSummaryOpen(true)}
            disabled={locked || selectedIdx == null || !cleanParam((selectedVariant as any)?.audio_url)}
            style={{
              marginTop: 10,
              borderRadius: 14,
              paddingVertical: 13,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.05)",
              opacity: locked ? 0.85 : 1,
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>Finish with Audio</Text>
          </Pressable>
        </>
      ) : (
        <View style={{ height: 8 }} />
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: DF.night }}>
      <DFHeader
        subtitle="Audio Studio"
        onMenuPress={() => router.push("/(tabs)/dashboard" as any)}
        onPressMeta={openPlanScreen}
      />
      <Stepper step={2} />

      <FlatList
        data={variants}
        keyExtractor={keyExtractor}
        renderItem={renderVariantTile}
        contentContainerStyle={{ paddingBottom: 0 }}
        ListHeaderComponent={HeaderContent}
        ListFooterComponent={FooterContent}
        ListEmptyComponent={<View style={{ height: 12 }} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews={false}
        initialNumToRender={6}
        windowSize={7}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
      />

      <SelectModal
        open={openLocale}
        title="Target Language"
        items={localeOptions}
        selectedCode={targetLocale}
        onClose={() => setOpenLocale(false)}
        onSelect={(x) => {
          setTargetLocale(x.code);
          setVoice(null);
        }}
      />

      <SelectModal
        open={openSource}
        title="Source Language"
        items={[{ code: "", label: "Auto detect" }, ...localeOptions]}
        selectedCode={sourceLanguage ?? ""}
        onClose={() => setOpenSource(false)}
        onSelect={(x) => setSourceLanguage(x.code || null)}
      />

      <SelectModal
        open={openVoice}
        title="Voice"
        items={voiceOptions}
        selectedCode={voice ?? ""}
        onClose={() => setOpenVoice(false)}
        onSelect={(x) => setVoice(x.code)}
      />

      <Modal
        visible={workflowSummaryOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setWorkflowSummaryOpen(false)}
      >
        <Pressable
          onPress={() => setWorkflowSummaryOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.78)",
          }}
        />
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            padding: 18,
          }}
        >
          <ScrollView
            style={{ maxHeight: "84%" }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: DF.night2,
                padding: 16,
              }}
            >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>Audio session summary</Text>
              <Pressable
                onPress={() => setWorkflowSummaryOpen(false)}
                hitSlop={10}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 16 }}>×</Text>
              </Pressable>
            </View>
            <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 6, fontSize: 12 }}>
              Your face and voice are ready. You can stop here or continue into Fusion when you’re ready.
            </Text>

            {!!faceImageUrl && (
              <View
                style={{
                  marginTop: 14,
                  borderRadius: 18,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(0,0,0,0.22)",
                }}
              >
                <Image source={{ uri: faceImageUrl }} style={{ width: "100%", height: 240 }} contentFit="contain" />
              </View>
            )}

            <View
              style={{
                marginTop: 14,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(248,184,72,0.18)",
                backgroundColor: "rgba(248,184,72,0.08)",
                padding: 12,
                gap: 8,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>What’s ready</Text>
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Face image saved for this workflow</Text>
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Selected audio variant ready to play or share</Text>
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Plan: {pricing?.planLabel ?? "Current plan"}</Text>
              {!!(finalPricingLabel ?? pricing?.estimateLabel) && (
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                  • Pricing: {finalPricingLabel ?? pricing?.estimateLabel}
                </Text>
              )}
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                • Next step available: {hasFaceArtifact ? "Fusion Studio longform video" : "Select a Face Studio artifact before Fusion"}
              </Text>
            </View>


            <View style={{ marginTop: 16 }}>
              <RunReceiptCard
                pricing={{ ...(pricing as any), stage: finalPricingState as any, reservationId: pricingConfirmation?.quote_id } as any}
                pricingSummary={{
                  estimateLabel: pricing?.estimateLabel,
                  finalLabel: finalPricingLabel ?? pricing?.estimateLabel,
                  message:
                    finalPricingMessage ??
                    (pricing?.preview
                      ? "Preview estimate shown until the service returns the final pricing snapshot."
                      : "Final pricing details appear after generation completes."),
                } as any}
              />
              <View style={{ marginTop: 10 }}>
                <JobPricingTimeline stage={finalPricingState as any} />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => setWorkflowSummaryOpen(false)}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.05)",
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>Done for now</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  if (selectedIdx == null) return;
                  const v = variants[selectedIdx];
                  if (!cleanParam((v as any)?.audio_url)) return;
                  setWorkflowSummaryOpen(false);
                  proceedToFusion(v);
                }}
                disabled={locked || selectedIdx == null || !cleanParam((selectedVariant as any)?.audio_url) || !hasFaceArtifact}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(248,184,72,0.35)",
                  backgroundColor: "rgba(232,152,56,0.22)",
                  opacity: locked || !hasFaceArtifact ? 0.85 : 1,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>Go to Fusion</Text>
              </Pressable>
            </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <GlobalJobsTray jobs={jobs} onOpenJob={openJob} onDismissJob={dismissJob} />


<PricingBreakdownSheet
  visible={showPricingBreakdown}
  studioName="Audio Studio"
  estimate={pricing?.estimateLabel ?? "Estimate pending"}
  billedUnitType={voice ? `Voice • ${voice}` : "Voice generation"}
  includedText={pricing?.availableLabel ?? "Included plan usage applies before wallet or postpaid settlement."}
  premiumText={pricing?.settlementLabel ?? "Premium voices or advanced options can change the final amount."}
  priceDriverText={pricing?.detailLabel ?? "Voice estimate appears before generate"}
  onClose={() => setShowPricingBreakdown(false)}
  onConfirm={() => setShowPricingBreakdown(false)}
/>

<UpgradePromptSheet
  visible={showUpgrade}
  title="Upgrade or top up to continue voice generation"
  description="Audio Studio uses your included usage first, then wallet or postpaid settlement depending on entitlements."
  currentPlan={pricing?.planLabel ?? "Current plan"}
  usageContext={pricing?.availableLabel ?? "Your current included usage or wallet balance is not enough for this run."}
  highlights={[
    "Keep face-to-voice creation moving without restart friction",
    "Use included monthly usage where your plan allows it",
    "Handle overages through wallet or postpaid billing based on entitlement rules",
  ]}
  onClose={() => setShowUpgrade(false)}
  onSecondary={() => setShowUpgrade(false)}
  onUpgrade={openUpgradeScreen}
/>

      <DFBlockingOverlay
        visible={navLocked}
        title="Opening Fusion Studio…"
        message="Locking your selected face + audio and moving to the next step."
      />
    </View>
  );
}
