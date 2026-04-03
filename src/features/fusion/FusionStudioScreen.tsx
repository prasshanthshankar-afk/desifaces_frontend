import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  ScrollView,
  Modal,
  InteractionManager,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import { shareUrl } from "../../core/share/share";
import { saveCreateFlowContext } from "../../core/media/createFlow";
import { derivePricingUiSummary } from "../../core/pricing/pricingSummary";

import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import DFBlockingOverlay from "../../core/ui/DFBlockingOverlay";

import {
  apiCreateFusionJob,
  apiGetFusionJobStatus,
  previewFusionPricing,
  type FusionCreateRequest,
} from "./api/creatorFusion";

import { normalizePricing, normalizePricingSummary } from "../pricing/normalizers";
import { PricingTopBar } from "../../components/pricing/PricingTopBar";
import { UpgradePromptSheet } from "../../components/pricing/UpgradePromptSheet";
import { PricingBreakdownSheet } from "../../components/pricing/PricingBreakdownSheet";
import { RunReceiptCard } from "../../components/pricing/RunReceiptCard";
import { JobPricingTimeline } from "../../components/pricing/JobPricingTimeline";
import GlobalJobsTray, { type StudioJobItem } from "../jobs/components/GlobalJobsTray";

type VideoMode = "TALKING_VIDEO" | "CINEMATIC_VIDEO_DIRECTION";
type CameraAngle = "eye_level" | "low_angle" | "high_angle";
type CameraFraming = "medium_close_up" | "medium_shot" | "wide_shot";
type CameraMotionStyle = "steady" | "slow_push_in" | "gentle_parallax";
type TalkingBackgroundMode = "fixed" | "movement_based";
type CinematicVideoType =
  | "brand_story"
  | "promo"
  | "festival_greeting"
  | "explainer";

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function cleanParam(v: any): string {
  if (Array.isArray(v)) v = v[0];
  return String(v ?? "").trim().replace(/^"+|"+$/g, "");
}

function normalizePromptText(v: any): string {
  return cleanParam(v).replace(/\s+/g, " ").trim();
}

function promptPreviewText(v: string, max = 160): string {
  const normalized = normalizePromptText(v);
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function normalizeAspectRatio(v: string): "9:16" | "16:9" | "1:1" {
  const s = cleanParam(v).toLowerCase();
  if (s === "16:9" || s === "landscape") return "16:9";
  if (s === "1:1" || s === "square") return "1:1";
  return "9:16";
}

function normalizeVideoMode(v: any): VideoMode {
  const s = cleanParam(v).toUpperCase();
  if (
    s === "CINEMATIC_VIDEO_DIRECTION" ||
    s === "CINEMATIC" ||
    s === "CINEMATIC_VIDEO" ||
    s === "DIRECTED" ||
    s === "DIRECTED_VIDEO"
  ) {
    return "CINEMATIC_VIDEO_DIRECTION";
  }
  return "TALKING_VIDEO";
}

function modeTitle(mode: VideoMode) {
  return mode === "CINEMATIC_VIDEO_DIRECTION" ? "Cinematic Video Direction" : "Talking Video";
}

function modeShortTitle(mode: VideoMode) {
  return mode === "CINEMATIC_VIDEO_DIRECTION" ? "Cinematic Video" : "Talking Video";
}

function profileForMode(mode: VideoMode): string {
  return mode === "CINEMATIC_VIDEO_DIRECTION" ? "cinematic_video_direction" : "talking_video";
}

function orchestrationLabelForMode(mode: VideoMode): string {
  return mode === "CINEMATIC_VIDEO_DIRECTION" ? "Directed orchestration" : "Talking-video orchestration";
}

function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View
      style={[
        {
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.06)",
          padding: 12,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
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
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10 }}>
      <Item n={1} label="Face" />
      <View style={{ width: 22, height: 1, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.10)" }} />
      <Item n={2} label="Audio" />
      <View style={{ width: 22, height: 1, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.10)" }} />
      <Item n={3} label="Fusion" />
    </View>
  );
}

function artifactUrl(resp: any, kind: string): string | null {
  const arts = resp?.artifacts;
  if (!Array.isArray(arts)) return null;
  const want = kind.toLowerCase();
  const hit =
    arts.find((a: any) => String(a?.kind ?? "").toLowerCase() === want && a?.url) ??
    arts.find((a: any) => String(a?.kind ?? "").toLowerCase().includes(want) && a?.url);
  const u = cleanParam(hit?.url);
  return u || null;
}

function extractVideoUrl(resp: any): string | null {
  const direct =
    resp?.output_video_url ||
    resp?.share_url ||
    resp?.video_url ||
    resp?.final_video_url ||
    resp?.final_url ||
    resp?.result?.video_url ||
    resp?.variants?.[0]?.video_url ||
    resp?.variants?.[0]?.url ||
    null;

  const fromArtifacts =
    artifactUrl(resp, "video") ||
    artifactUrl(resp, "share_url") ||
    artifactUrl(resp, "resolved_video_sas_url") ||
    artifactUrl(resp, "resolved_video_url") ||
    null;

  const u = cleanParam(fromArtifacts || direct);
  return u || null;
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

type EstimateResult = {
  preview: boolean;
  estimateLabel: string;
  detailLabel: string;
  settlementLabel: string;
  planLabel: string;
  availableLabel: string;
  holdLabel?: string;
  ctaLabel: string;
  insufficientBalance: boolean;
  raw?: any;
  pricing?: ReturnType<typeof normalizePricing>;
  pricingSummary?: ReturnType<typeof normalizePricingSummary>;
};

function fallbackEstimate(args: { hasFaceArtifact: boolean; hasAudio: boolean; videoMode: VideoMode }): EstimateResult {
  return {
    preview: true,
    estimateLabel: "Estimate preview",
    detailLabel: `${args.hasFaceArtifact ? "face artifact ready" : "missing face artifact"} • ${args.hasAudio ? "audio ready" : "missing audio"} • ${modeShortTitle(args.videoMode)}`,
    settlementLabel: "Preview estimate only. Final actual should come from the committed pricing snapshot.",
    planLabel: "Estimate preview",
    availableLabel: "Balance preview unavailable",
    ctaLabel: `Create ${modeShortTitle(args.videoMode)}`,
    insufficientBalance: false,
  };
}

function buildVideoSettings(
  aspectRatio: "9:16" | "16:9" | "1:1",
  durationSec?: number,
  durationMs?: number
) {
  const safeDurationSec =
    typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0
      ? Math.ceil(durationSec)
      : typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
        ? Math.ceil(durationMs / 1000)
        : 60;

  return {
    aspect_ratio: aspectRatio,
    duration_sec: Math.max(1, safeDurationSec),
    duration_ms:
      typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
        ? Math.ceil(durationMs)
        : Math.max(1000, safeDurationSec * 1000),
  };
}

function describeStage(videoMode: VideoMode, stage: string): string {
  const st = cleanParam(stage).toLowerCase();

  if (st === "queued" || st === "pending") return "Preparing your video…";
  if (st === "processing" || st === "running") {
    return videoMode === "CINEMATIC_VIDEO_DIRECTION"
      ? "Planning and rendering your cinematic video…"
      : "Rendering your talking video…";
  }
  if (st === "finalizing") return "Finalizing your video…";
  return videoMode === "CINEMATIC_VIDEO_DIRECTION"
    ? "Checking cinematic render status…"
    : "Checking talking-video status…";
}

function progressFloorForStage(stage: string): number {
  const st = cleanParam(stage).toLowerCase();
  if (st === "queued" || st === "pending") return 0.24;
  if (st === "processing" || st === "running") return 0.58;
  if (st === "finalizing") return 0.86;
  if (st === "succeeded") return 1;
  return 0.12;
}

export default function FusionStudioScreen() {
  const { isReady, isAuthed } = useAuth();
  const flow = useCreatorFlow() as any;

  const setFaceSelection = flow?.setFaceSelection as undefined | ((x: any) => void);
  const setAudioSelection = flow?.setAudioSelection as undefined | ((x: any) => void);
  const setFusionPrompt = flow?.setFusionPrompt as undefined | ((x: string) => void);
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);

  const params = useLocalSearchParams<{
    face_image_url?: string | string[];
    face_sas_url?: string | string[];
    face_artifact_id?: string | string[];
    face_media_asset_id?: string | string[];
    face_profile_id?: string | string[];
    media_asset_id?: string | string[];
    image_url?: string | string[];
    audio_artifact_id?: string | string[];
    artifact_id?: string | string[];
    audio_url?: string | string[];
    audio_sas_url?: string | string[];
    resolution?: string | string[];
    aspect_ratio?: string | string[];
    gender?: string | string[];
    video_prompt?: string | string[];
    user_prompt?: string | string[];
    performance_prompt?: string | string[];
    motion_prompt?: string | string[];
    movement_prompt?: string | string[];
    gesture_prompt?: string | string[];
    body_motion_prompt?: string | string[];
    emotion_prompt?: string | string[];
    expression_prompt?: string | string[];
    creative_direction?: string | string[];
    prompt?: string | string[];
    audio_duration_sec?: string | string[];
    audio_duration_ms?: string | string[];
    script_text?: string | string[];
    audio_script_text?: string | string[];
    audio_locale?: string | string[];
    audio_voice?: string | string[];
    video_mode?: string | string[];
    mode?: string | string[];
    generation_mode?: string | string[];
    camera_angle?: string | string[];
    camera_framing?: string | string[];
    camera_motion_style?: string | string[];
    background_mode?: string | string[];
    intent?: string | string[];
    video_type?: string | string[];
  }>();

  const storeFace = flow?.faceSelection ?? flow?.face ?? null;
  const storeAudio = flow?.audioSelection ?? flow?.audio ?? null;

  const storeImageUrl = cleanParam(storeFace?.sasUrl ?? storeFace?.imageUrl ?? storeFace?.image_url ?? "");
  const storeFaceArtifactId = cleanParam(storeFace?.artifactId ?? storeFace?.artifact_id ?? "");
  const storeFaceMediaAssetId = cleanParam(storeFace?.mediaAssetId ?? storeFace?.media_asset_id ?? "");
  const storeFaceProfileId = cleanParam(storeFace?.faceProfileId ?? storeFace?.face_profile_id ?? "");
  const storeAudioUrl = cleanParam(storeAudio?.sasUrl ?? storeAudio?.audioUrl ?? storeAudio?.audio_url ?? "");
  const storeAudioArtifactId = cleanParam(storeAudio?.artifactId ?? storeAudio?.artifact_id ?? "");
  const storeAudioDurationSec = Number(storeAudio?.durationSec ?? storeAudio?.duration_sec ?? 0) || 0;
  const storeAudioDurationMs = Number(storeAudio?.durationMs ?? storeAudio?.duration_ms ?? 0) || 0;
  const storeAudioScriptText = cleanParam(storeAudio?.scriptText ?? storeAudio?.script_text ?? "");
  const storeAudioLocale = cleanParam(storeAudio?.locale ?? "");
  const storeAudioVoice = cleanParam(storeAudio?.voice ?? "");

  const paramImageUrl =
    cleanParam(params.face_sas_url) || cleanParam(params.face_image_url) || cleanParam(params.image_url) || "";
  const paramFaceArtifactId = cleanParam(params.face_artifact_id) || "";
  const paramFaceMediaAssetId = cleanParam((params as any).face_media_asset_id) || cleanParam((params as any).media_asset_id) || "";
  const paramFaceProfileId = cleanParam((params as any).face_profile_id) || "";
  const paramAudioUrl = cleanParam(params.audio_sas_url) || cleanParam(params.audio_url) || "";
  const paramAudioArtifactId = cleanParam(params.audio_artifact_id) || cleanParam(params.artifact_id) || "";
  const paramAudioDurationSec = Number(cleanParam(params.audio_duration_sec) || 0) || 0;
  const paramAudioDurationMs = Number(cleanParam(params.audio_duration_ms) || 0) || 0;
  const paramScriptText = cleanParam(params.script_text) || cleanParam(params.audio_script_text) || "";
  const paramAudioLocale = cleanParam(params.audio_locale) || "";
  const paramAudioVoice = cleanParam(params.audio_voice) || "";

  const initialVideoMode = normalizeVideoMode(
    cleanParam(params.video_mode) ||
      cleanParam(params.mode) ||
      cleanParam(params.generation_mode) ||
      cleanParam(flow?.fusionVideoMode) ||
      "TALKING_VIDEO"
  );
  const [videoMode, setVideoMode] = useState<VideoMode>(initialVideoMode);

  const orchestrationLabel = orchestrationLabelForMode(videoMode);
  const providerWarningMessage =
    videoMode === "CINEMATIC_VIDEO_DIRECTION"
      ? "Cinematic Video Direction is an orchestrated premium flow. It may take longer than Talking Video, especially for 16:9 renders."
      : null;

  const initialAspectRatio = normalizeAspectRatio(
    cleanParam((params as any).aspect_ratio) ||
      cleanParam(params.resolution) ||
      cleanParam(flow?.fusionAspectRatio) ||
      (initialVideoMode === "CINEMATIC_VIDEO_DIRECTION" ? "16:9" : "9:16")
  );
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(initialAspectRatio);

  const [cameraAngle, setCameraAngle] = useState<CameraAngle>(
    (cleanParam(params.camera_angle) || cleanParam(flow?.fusionCameraAngle) || "eye_level") as CameraAngle
  );
  const [cameraFraming, setCameraFraming] = useState<CameraFraming>(
    (cleanParam(params.camera_framing) || cleanParam(flow?.fusionCameraFraming) || "medium_close_up") as CameraFraming
  );
  const [cameraMotionStyle, setCameraMotionStyle] = useState<CameraMotionStyle>(
    (cleanParam(params.camera_motion_style) || cleanParam(flow?.fusionCameraMotionStyle) || "steady") as CameraMotionStyle
  );

  const [talkingBackgroundMode, setTalkingBackgroundMode] = useState<TalkingBackgroundMode>(
    (cleanParam((params as any).background_mode) ||
      cleanParam(flow?.fusionBackgroundMode) ||
      "fixed") as TalkingBackgroundMode
  );

  const [cinematicIntent, setCinematicIntent] = useState<string>(
    normalizePromptText((params as any).intent ?? flow?.fusionIntent ?? "")
  );

  const [cinematicVideoType, setCinematicVideoType] = useState<CinematicVideoType>(
    (cleanParam((params as any).video_type) ||
      cleanParam(flow?.fusionVideoType) ||
      "brand_story") as CinematicVideoType
  );

  const aspectRatioManuallyChangedRef = useRef(false);
  const lastFusionSettingsKeyRef = useRef("");
  const routeAspectRatio = useMemo(() => {
    const raw = cleanParam((params as any).aspect_ratio) || cleanParam(params.resolution);
    return raw ? normalizeAspectRatio(raw) : null;
  }, [params.resolution, (params as any).aspect_ratio]);

  const faceGender = cleanParam(params.gender) || cleanParam(flow?.faceGender) || "";

  const flowVideoPrompt = normalizePromptText(
    flow?.fusionVideoPrompt ??
      flow?.fusionPrompt ??
      flow?.videoPrompt ??
      flow?.userPrompt ??
      flow?.prompt ??
      ""
  );
  const paramVideoPrompt = normalizePromptText(
    params.video_prompt ??
      params.user_prompt ??
      params.performance_prompt ??
      params.gesture_prompt ??
      params.body_motion_prompt ??
      params.emotion_prompt ??
      params.expression_prompt ??
      params.creative_direction ??
      params.motion_prompt ??
      params.movement_prompt ??
      params.prompt ??
      ""
  );
  const initialVideoPrompt = paramVideoPrompt || flowVideoPrompt;
  const [videoPrompt, setVideoPrompt] = useState<string>(initialVideoPrompt);

  const [resolvedFaceUrl, setResolvedFaceUrl] = useState<string | null>(null);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [finalPricingLabel, setFinalPricingLabel] = useState<string | null>(null);
  const [finalPricingState, setFinalPricingState] = useState<"estimated" | "committed" | "released">("estimated");
  const [showPricingBreakdown, setShowPricingBreakdown] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [finalPricingMessage, setFinalPricingMessage] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [backgroundWatching, setBackgroundWatching] = useState(false);
  const [backgroundNotice, setBackgroundNotice] = useState<string | null>(null);
  const [jobs, setJobs] = useState<StudioJobItem[]>([]);
  const [lastStatusCheckAt, setLastStatusCheckAt] = useState<number | null>(null);
  const [statusRetryCount, setStatusRetryCount] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);

  const updateJob = useCallback(
    (jobKey: string, patch: Partial<StudioJobItem> | ((prev: StudioJobItem) => StudioJobItem)) => {
      setJobs((prev) =>
        prev.map((job) => {
          if (job.id !== jobKey) return job;
          return typeof patch === "function" ? patch(job) : { ...job, ...patch };
        })
      );
    },
    []
  );

  const dismissJob = useCallback((jobKey: string) => {
    setJobs((prev) => prev.filter((job) => job.id !== jobKey));
  }, []);

  useEffect(() => {
    if (!backgroundNotice) return;
    const t = setTimeout(() => setBackgroundNotice(null), 5000);
    return () => clearTimeout(t);
  }, [backgroundNotice]);

  const imageUrl = cleanParam(resolvedFaceUrl || storeImageUrl || paramImageUrl);
  const audioUrl = cleanParam(resolvedAudioUrl || storeAudioUrl || paramAudioUrl);
  const effectiveFaceArtifactId = storeFaceArtifactId || paramFaceArtifactId;
  const effectiveFaceMediaAssetId = storeFaceMediaAssetId || paramFaceMediaAssetId;
  const effectiveFaceProfileId = storeFaceProfileId || paramFaceProfileId;
  const effectiveAudioArtifactId = storeAudioArtifactId || paramAudioArtifactId;
  const effectiveAudioDurationSec = storeAudioDurationSec || paramAudioDurationSec || 0;
  const effectiveAudioDurationMs = storeAudioDurationMs || paramAudioDurationMs || 0;
  const effectiveScriptText = storeAudioScriptText || paramScriptText;
  const effectiveAudioLocale = storeAudioLocale || paramAudioLocale;
  const effectiveAudioVoice = storeAudioVoice || paramAudioVoice;

  const normalizedVideoPrompt = useMemo(() => normalizePromptText(videoPrompt), [videoPrompt]);
  const normalizedCinematicIntent = useMemo(() => normalizePromptText(cinematicIntent), [cinematicIntent]);
  const promptPreview = useMemo(() => promptPreviewText(normalizedVideoPrompt, 180), [normalizedVideoPrompt]);
  const hasMeaningfulPrompt = normalizedVideoPrompt.length >= 12;
  const hasMeaningfulCinematicIntent = normalizedCinematicIntent.length >= 12;
  const isCinematic = videoMode === "CINEMATIC_VIDEO_DIRECTION";
  const videoProfile = profileForMode(videoMode);
  const hasFacePreview = !!imageUrl || !!effectiveFaceArtifactId;
  const hasFaceArtifact = !!effectiveFaceArtifactId;
  const hasAudio = !!audioUrl || !!effectiveAudioArtifactId;
  const locked = busy;

  useEffect(() => {
    if (setFaceSelection && !storeImageUrl && (paramImageUrl || effectiveFaceArtifactId)) {
      setFaceSelection({
        sasUrl: cleanParam(paramImageUrl) || undefined,
        imageUrl: cleanParam(paramImageUrl) || undefined,
        artifactId: effectiveFaceArtifactId || undefined,
        mediaAssetId: effectiveFaceMediaAssetId || undefined,
        faceProfileId: effectiveFaceProfileId || undefined,
        gender: faceGender || undefined,
      } as any);
    }
    if (setAudioSelection && !storeAudioUrl && (paramAudioUrl || effectiveAudioArtifactId)) {
      setAudioSelection({
        sasUrl: cleanParam(paramAudioUrl) || undefined,
        audioUrl: cleanParam(paramAudioUrl) || undefined,
        artifactId: effectiveAudioArtifactId || undefined,
        locale: paramAudioLocale || undefined,
        voice: paramAudioVoice || undefined,
        scriptText: paramScriptText || undefined,
        durationSec: paramAudioDurationSec || undefined,
        durationMs: paramAudioDurationMs || undefined,
      } as any);
    }
  }, [
    setFaceSelection,
    setAudioSelection,
    storeImageUrl,
    storeAudioUrl,
    paramImageUrl,
    paramAudioUrl,
    effectiveFaceArtifactId,
    effectiveFaceMediaAssetId,
    effectiveFaceProfileId,
    effectiveAudioArtifactId,
    faceGender,
    paramAudioLocale,
    paramAudioVoice,
    paramScriptText,
    paramAudioDurationSec,
    paramAudioDurationMs,
  ]);

  useEffect(() => {
    const nextPrompt = paramVideoPrompt || flowVideoPrompt;
    if (nextPrompt && !normalizedVideoPrompt) {
      setVideoPrompt(nextPrompt);
    }
  }, [paramVideoPrompt, flowVideoPrompt, normalizedVideoPrompt]);

  useEffect(() => {
    if (!routeAspectRatio) return;
    setAspectRatio((prev) => (prev === routeAspectRatio ? prev : routeAspectRatio));
  }, [routeAspectRatio]);

  useEffect(() => {
    if (videoMode !== "CINEMATIC_VIDEO_DIRECTION") return;
    if (routeAspectRatio) return;
    if (aspectRatioManuallyChangedRef.current) return;
    setAspectRatio((prev) => (prev === "16:9" ? prev : "16:9"));
  }, [videoMode, routeAspectRatio]);

  useEffect(() => {
    if (setFusionPrompt) setFusionPrompt(videoPrompt);
  }, [videoPrompt, setFusionPrompt]);

  useEffect(() => {
    if (!setFusionSettings) return;

    const nextSettings = {
      fusionAspectRatio: aspectRatio,
      fusionVideoMode: videoMode,
      fusionCameraAngle: cameraAngle,
      fusionCameraFraming: cameraFraming,
      fusionCameraMotionStyle: cameraMotionStyle,
      fusionBackgroundMode: talkingBackgroundMode,
      fusionIntent: normalizedCinematicIntent || undefined,
      fusionVideoType: cinematicVideoType,
      fusionProfile: videoProfile,
      fusionFaceArtifactId: effectiveFaceArtifactId || undefined,
    };

    const nextKey = JSON.stringify(nextSettings);
    if (lastFusionSettingsKeyRef.current === nextKey) return;

    lastFusionSettingsKeyRef.current = nextKey;
    setFusionSettings(nextSettings);
  }, [
    setFusionSettings,
    aspectRatio,
    videoMode,
    cameraAngle,
    cameraFraming,
    cameraMotionStyle,
    talkingBackgroundMode,
    normalizedCinematicIntent,
    cinematicVideoType,
    videoProfile,
    effectiveFaceArtifactId,
  ]);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthed) router.replace("/(auth)/login");
  }, [isReady, isAuthed]);

  useEffect(() => {
    if (!imageUrl && !audioUrl && !effectiveFaceArtifactId && !effectiveAudioArtifactId) return;
    saveCreateFlowContext({
      image_url: imageUrl || undefined,
      face_artifact_id: effectiveFaceArtifactId || undefined,
      face_profile_id: effectiveFaceProfileId || undefined,
      media_asset_id: effectiveFaceMediaAssetId || undefined,
      audio_url: audioUrl || undefined,
      audio_artifact_id: effectiveAudioArtifactId || undefined,
      audio_duration_sec: effectiveAudioDurationSec || undefined,
      audio_duration_ms: effectiveAudioDurationMs || undefined,
      script_text: effectiveScriptText || undefined,
      audio_locale: effectiveAudioLocale || undefined,
      audio_voice: effectiveAudioVoice || undefined,
      video_prompt: normalizedVideoPrompt || undefined,
      aspect_ratio: aspectRatio,
      ...(faceGender ? ({ gender: faceGender } as any) : {}),
    } as any).catch(() => {});
  }, [
    imageUrl,
    effectiveFaceArtifactId,
    effectiveFaceProfileId,
    effectiveFaceMediaAssetId,
    audioUrl,
    effectiveAudioArtifactId,
    effectiveAudioDurationSec,
    effectiveAudioDurationMs,
    effectiveScriptText,
    effectiveAudioLocale,
    effectiveAudioVoice,
    normalizedVideoPrompt,
    aspectRatio,
    faceGender,
  ]);

  useEffect(() => {
    if (!isReady || !isAuthed || !hasFaceArtifact || !hasAudio || !hasMeaningfulPrompt) return;
    if (isCinematic && !hasMeaningfulCinematicIntent) return;

    const task = InteractionManager.runAfterInteractions(() => setPreviewReady(true));
    return () => {
      task?.cancel?.();
      setPreviewReady(false);
    };
  }, [
    isReady,
    isAuthed,
    hasFaceArtifact,
    hasAudio,
    hasMeaningfulPrompt,
    isCinematic,
    hasMeaningfulCinematicIntent,
  ]);

  const previewPayload = useMemo<FusionCreateRequest>(() => {
    const promptText = normalizedVideoPrompt || undefined;

    const promptAliases = {
      prompt: promptText,
      user_prompt: promptText,
      video_prompt: promptText,
      performance_prompt: promptText,
      motion_prompt: promptText,
      movement_prompt: promptText,
      gesture_prompt: promptText,
      body_motion_prompt: promptText,
      emotion_prompt: promptText,
      expression_prompt: promptText,
      creative_direction: promptText,
    };

    const cinematicFields = isCinematic
      ? {
          camera_angle: cameraAngle,
          camera_framing: cameraFraming,
          camera_motion_style: cameraMotionStyle,
        }
      : {};

    return {
      face_artifact_id: effectiveFaceArtifactId || undefined,

      voice_mode: "audio",
      voice_audio: {
        type: "audio",
        audio_artifact_id: effectiveAudioArtifactId || undefined,
        audio_url: effectiveAudioArtifactId ? undefined : audioUrl || undefined,
      },
      audio_artifact_id: effectiveAudioArtifactId || undefined,
      audio_url: effectiveAudioArtifactId ? undefined : audioUrl || undefined,

      video_mode: videoMode,
      generation_mode: videoMode,
      product_code: videoMode,
      profile: videoProfile,
      profile_code: videoProfile,

      ...promptAliases,
      script_text: effectiveScriptText || undefined,
      audio_locale: effectiveAudioLocale || undefined,
      audio_voice: effectiveAudioVoice || undefined,
      ...cinematicFields,

      background_mode: !isCinematic ? talkingBackgroundMode : "movement_based",
      intent: isCinematic ? normalizedCinematicIntent : undefined,
      video_type: isCinematic ? cinematicVideoType : undefined,

      video: {
        ...buildVideoSettings(
          aspectRatio,
          effectiveAudioDurationSec || undefined,
          effectiveAudioDurationMs || undefined
        ),
        profile: videoProfile,
        video_mode: videoMode,
        ...cinematicFields,
      },

      tags: {
        face_gender: faceGender || undefined,
        storytelling_mode: !isCinematic,
        cinematic_mode: isCinematic,
        video_mode: videoMode,
        product_code: videoMode,
        profile: videoProfile,
        profile_code: videoProfile,
        background_mode: !isCinematic ? talkingBackgroundMode : "movement_based",
        intent: isCinematic ? normalizedCinematicIntent : undefined,
        video_type: isCinematic ? cinematicVideoType : undefined,
        prompt_preview: promptText ? promptText.slice(0, 160) : undefined,
        script_text: effectiveScriptText || undefined,
        audio_locale: effectiveAudioLocale || undefined,
        audio_voice: effectiveAudioVoice || undefined,
        ...cinematicFields,
      },
    };
  }, [
    effectiveFaceArtifactId,
    effectiveAudioArtifactId,
    audioUrl,
    videoMode,
    videoProfile,
    isCinematic,
    aspectRatio,
    effectiveAudioDurationSec,
    effectiveAudioDurationMs,
    effectiveScriptText,
    effectiveAudioLocale,
    effectiveAudioVoice,
    faceGender,
    normalizedVideoPrompt,
    talkingBackgroundMode,
    normalizedCinematicIntent,
    cinematicVideoType,
    cameraAngle,
    cameraFraming,
    cameraMotionStyle,
  ]);

  const pricingQ = useQuery<EstimateResult>({
    queryKey: [
      "fusion-pricing-estimate",
      effectiveFaceArtifactId,
      audioUrl,
      effectiveAudioArtifactId,
      aspectRatio,
      videoMode,
      talkingBackgroundMode,
      normalizedCinematicIntent,
      cinematicVideoType,
      cameraAngle,
      cameraFraming,
      cameraMotionStyle,
    ],
    enabled:
      previewReady &&
      isReady &&
      isAuthed &&
      hasFaceArtifact &&
      hasAudio &&
      hasMeaningfulPrompt &&
      (!isCinematic || hasMeaningfulCinematicIntent),
    staleTime: 20_000,
    retry: 0,
    queryFn: async () => {
      try {
        const raw = await previewFusionPricing(previewPayload);
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

        const estimateLabel = pricingSummary?.estimateLabel || pricingSummary?.receiptLabel || "Estimate pending";

        return {
          preview: false,
          estimateLabel,
          detailLabel: `${hasFaceArtifact ? "face artifact ready" : "missing face artifact"} • ${hasAudio ? "audio ready" : "missing audio"} • ${modeShortTitle(videoMode)}`,
          settlementLabel:
            pricing?.settlementMode === "postpaid"
              ? "Final billed amount is confirmed after completion."
              : pricing?.settlementMode === "included"
                ? "This run is covered by plan or included quota."
                : pricing?.message || pricingSummary?.message || "Reservation is finalized after completion.",
          planLabel: pricing?.tierCode || "Current plan",
          availableLabel:
            pricing?.billingMode === "bill"
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
          ctaLabel: `Generate ${modeShortTitle(videoMode)} — ${estimateLabel}`,
          insufficientBalance: false,
          raw,
          pricing,
          pricingSummary,
        };
      } catch {
        return fallbackEstimate({ hasFaceArtifact, hasAudio, videoMode });
      }
    },
  });

  const pricing = pricingQ.data;

  const canGenerate =
    hasFaceArtifact &&
    hasAudio &&
    !busy &&
    !pricing?.insufficientBalance &&
    hasMeaningfulPrompt &&
    (!isCinematic || hasMeaningfulCinematicIntent);

  const progress = useRef(new Animated.Value(0)).current;
  const progressFloorRef = useRef(0);

  const animateTo = useCallback((to01: number, ms = 650) => {
    const next = Math.max(progressFloorRef.current, clamp01(to01));
    progressFloorRef.current = next;
    Animated.timing(progress, {
      toValue: next,
      duration: ms,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const resetProgress = useCallback((to01 = 0) => {
    progress.stopAnimation();
    const next = clamp01(to01);
    progressFloorRef.current = next;
    progress.setValue(next);
  }, [progress]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const openLink = useCallback(async (url: string) => {
    const u = cleanParam(url);
    if (!u) return;
    try {
      const can = await Linking.canOpenURL(u);
      if (!can) return;
      await Linking.openURL(u);
    } catch {}
  }, []);

  const openVideoViewer = useCallback((url: string) => {
    const u = cleanParam(url);
    if (!u) return;
    router.push({
      pathname: "/media/viewer",
      params: {
        type: "video",
        video_url: u,
        url: u,
        title: modeShortTitle(videoMode),
        subtitle: orchestrationLabel,
        stage: "video_done",
      },
    } as any);
  }, [orchestrationLabel, videoMode]);

  const finishSucceededJob = useCallback((resp: any) => {
    const v = extractVideoUrl(resp);
    if (!v) {
      setStatusText("The render finished, but the video file is not ready yet. We’ll keep checking.");
      setBackgroundWatching(true);
      return;
    }
    setVideoUrl(v);
    setFinalPricingLabel(pickPricingLabel(resp) ?? null);
    setFinalPricingState(
      (String(resp?.pricing?.state ?? "").toLowerCase() === "released"
        ? "released"
        : String(resp?.pricing?.state ?? "").toLowerCase() === "committed"
          ? "committed"
          : "estimated") as any
    );
    setFinalPricingMessage(pickFinalPricingMessage(resp));
    if (jobId) {
      updateJob(jobId, (prev) => ({
        ...prev,
        stage: "succeeded",
        progress: 1,
        resultReady: true,
        pricingLabel: pickPricingLabel(resp) ?? prev.pricingLabel,
        message: "Video ready",
      }));
    }
    setStatusText("Your video is ready. Open it from the output card or from Jobs.");
    animateTo(1, 450);
    setBackgroundWatching(false);
  }, [animateTo, jobId, updateJob]);

  const generate = useCallback(async () => {
    if (!hasFaceArtifact || !hasAudio || busy) return;

    if (!hasFaceArtifact) {
      setStatusText(
        "To create a video, choose a face created in Face Studio."
      );
      return;
    }

    if (!hasMeaningfulPrompt) {
      setStatusText(
        "Add a clear video direction prompt so the selected mode can follow the intended emotion, gesture, body movement, and scene energy."
      );
      return;
    }

    if (isCinematic && !hasMeaningfulCinematicIntent) {
      setStatusText(
        "Add the cinematic intent so the backend can plan direction, structure, and final composition."
      );
      return;
    }

    setBusy(true);
    resetProgress(0);
    setVideoUrl(null);
    setJobId(null);
    setBackgroundWatching(false);
    setFinalPricingLabel(null);
    setFinalPricingState("estimated");
    setFinalPricingMessage(null);
    setLastStatusCheckAt(null);
    setStatusRetryCount(0);
    setStatusText(`Submitting ${modeShortTitle(videoMode)}…`);
    animateTo(0.12, 450);

    try {
      const created = await apiCreateFusionJob({
        ...previewPayload,
        pricing_confirmation:
          pricing?.raw?.quote_id && pricing?.raw?.preview_fingerprint
            ? {
                quote_id: pricing.raw.quote_id,
                preview_fingerprint: pricing.raw.preview_fingerprint,
              }
            : undefined,
      });
      const id = String((created as any)?.job_id || (created as any)?.id || "");
      if (!id) throw new Error("Fusion create returned no job.");
      if (!mountedRef.current) return;

      setJobId(id);
      setJobs((prev) => [
        {
          id,
          kind: "fusion",
          title: `Create ${modeShortTitle(videoMode)}`,
          stage: "queued",
          progress: 0.2,
          message: "Queued…",
          startedAt: Date.now(),
          backgrounded: false,
          resultReady: false,
          pricingLabel: pricing?.estimateLabel,
        },
        ...prev,
      ]);
      setBackgroundWatching(true);
      setStatusText(
        `Your ${modeShortTitle(videoMode).toLowerCase()} job has started. It will keep running in the background while you continue using the app.`
      );
      animateTo(0.2, 500);
    } catch (e: any) {
      if (!mountedRef.current) return;
      if (e?.status === 401 || e?.code === "UNAUTHORIZED" || e?.message === "UNAUTHORIZED") {
        router.replace("/(auth)/login");
        return;
      }
      setStatusText(e?.message ?? `The ${modeShortTitle(videoMode).toLowerCase()} could not be created this time.`);
      resetProgress(0);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [
    hasFaceArtifact,
    hasAudio,
    busy,
    hasMeaningfulPrompt,
    isCinematic,
    hasMeaningfulCinematicIntent,
    previewPayload,
    animateTo,
    pricing?.raw,
    pricing?.estimateLabel,
    resetProgress,
    videoMode,
  ]);

  useEffect(() => {
    if (!jobId || !!videoUrl || !backgroundWatching) return;
    let cancelled = false;
    let attempt = 0;
    let processingTicks = 0;

    const longRunningTimer = setTimeout(() => {
      updateJob(jobId, (prev) => ({
        ...prev,
        backgrounded: true,
        message: "Still rendering in the background.",
      }));
      setBackgroundNotice(`Your ${modeShortTitle(videoMode).toLowerCase()} is still rendering in the background. You can keep working in other studios.`);
    }, 15000);

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const watch = async () => {
      while (!cancelled) {
        try {
          const last = await apiGetFusionJobStatus(jobId);
          if (cancelled) return;

          attempt = 0;
          setStatusRetryCount(0);
          setLastStatusCheckAt(Date.now());

          const st = String((last as any)?.status ?? "").toLowerCase();
          const stage =
            st === "queued" || st === "pending"
              ? "queued"
              : st === "processing" || st === "running"
                ? "running"
                : st === "finalizing"
                  ? "finalizing"
                  : st === "succeeded"
                    ? "succeeded"
                    : st === "failed" || st === "blocked" || st === "canceled"
                      ? "failed"
                      : "running";

          updateJob(jobId, (prev) => ({
            ...prev,
            stage,
            progress: Math.max(prev.progress, progressFloorForStage(st)),
            backgrounded: prev.backgrounded || processingTicks >= 4,
            pricingLabel: pickPricingLabel(last) ?? prev.pricingLabel,
            resultReady: stage === "succeeded",
            message:
              stage === "queued"
                ? "Queued…"
                : stage === "running"
                  ? prev.backgrounded
                    ? "Rendering in background…"
                    : "Rendering…"
                  : stage === "finalizing"
                    ? "Finalizing…"
                    : stage === "succeeded"
                      ? "Video ready"
                      : (last as any)?.error_message || "Video failed",
          }));

          const rf = artifactUrl(last, "resolved_face_sas_url");
          const ra = artifactUrl(last, "resolved_audio_sas_url");
          if (rf) setResolvedFaceUrl(rf);
          if (ra) setResolvedAudioUrl(ra);

          if (st === "succeeded") {
            finishSucceededJob(last);
            return;
          }

          if (st === "failed" || st === "blocked" || st === "canceled") {
            updateJob(jobId, {
              stage: "failed",
              progress: 1,
              message: (last as any)?.error_message || "The video could not be completed this time.",
            });
            setFinalPricingLabel(pickPricingLabel(last) ?? null);
            setFinalPricingState(
              (String(last?.pricing?.state ?? "").toLowerCase() === "released"
                ? "released"
                : String(last?.pricing?.state ?? "").toLowerCase() === "committed"
                  ? "committed"
                  : "estimated") as any
            );
            setFinalPricingMessage(pickFinalPricingMessage(last));
            setStatusText((last as any)?.error_message || "The video could not be completed this time.");
            resetProgress(0);
            setBackgroundWatching(false);
            return;
          }

          processingTicks += 1;
          const baseMessage = describeStage(videoMode, st);
          if ((st === "processing" || st === "running") && processingTicks >= 10) {
            setStatusText(`${baseMessage} This can take a few minutes. We’ll keep retrying in the background until the final video is ready.`);
          } else {
            setStatusText(baseMessage);
          }

          const stageFloor = progressFloorForStage(st);
          const creepBoost =
            st === "processing" || st === "running"
              ? Math.min(0.94, stageFloor + Math.min(processingTicks * 0.01, 0.22))
              : stageFloor;
          animateTo(creepBoost, 700);
        } catch {
          attempt += 1;
          if (cancelled) return;
          setStatusRetryCount(attempt);
          updateJob(jobId, (prev) => ({
            ...prev,
            stage: prev.stage === "queued" ? "queued" : "running",
            backgrounded: true,
            message: "Checking video status in the background…",
          }));
          setStatusText(
            attempt >= 3
              ? "The service is slow to respond right now. We’re still retrying in the background and will update this screen as soon as the video is ready."
              : "Checking your video status…"
          );
        }

        await sleep(3500);
      }
    };

    watch();
    return () => {
      cancelled = true;
      clearTimeout(longRunningTimer);
    };
  }, [backgroundWatching, jobId, videoUrl, finishSucceededJob, animateTo, resetProgress, updateJob, videoMode]);

  const openJob = useCallback(
    (job: StudioJobItem) => {
      if (job.resultReady && videoUrl) {
        openVideoViewer(videoUrl);
        return;
      }
      setStatusText(
        job.message ||
          "Your Fusion job is running in the background. You can keep using the app and return when it is ready."
      );
    },
    [openVideoViewer, videoUrl]
  );

  const openPlanScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "manage",
          source: "fusion",
          plan: pricing?.planLabel ?? "",
          availability: pricing?.availableLabel ?? "",
          settlement: pricing?.settlementLabel ?? "",
          video_mode: videoMode,
        },
      } as any);
    } catch {
      router.push("/(tabs)/dashboard" as any);
    }
  }, [pricing?.availableLabel, pricing?.planLabel, pricing?.settlementLabel, videoMode]);

  const openUpgradeScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "upgrade",
          source: "fusion",
          plan: pricing?.planLabel ?? "",
          availability: pricing?.availableLabel ?? "",
          settlement: pricing?.settlementLabel ?? "",
          video_mode: videoMode,
        },
      } as any);
    } catch {
      openPlanScreen();
    }
  }, [openPlanScreen, pricing?.availableLabel, pricing?.planLabel, pricing?.settlementLabel, videoMode]);

  const onShare = useCallback(async () => {
    if (!videoUrl) return;
    try {
      await shareUrl(videoUrl, { title: `DesiFaces • ${modeShortTitle(videoMode)}`, message: "Generated video" });
    } catch {
      await openLink(videoUrl);
    }
  }, [videoUrl, openLink, videoMode]);

  const promptRequiredMessage =
    !hasMeaningfulPrompt
      ? `Enter a specific video direction prompt. ${modeShortTitle(videoMode)} sends this to the backend together with your Audio Studio audio to guide the final video.`
      : null;

  const cinematicIntentRequiredMessage =
    isCinematic && !hasMeaningfulCinematicIntent
      ? "Describe the purpose and expected outcome of the cinematic video."
      : null;

  const faceArtifactRequiredMessage =
    hasFacePreview && !hasFaceArtifact
      ? "This face is ready to view, but creating a video needs a saved Face Studio result. Choose a face created in Face Studio, then come back to Video."
      : null;

  const previewPendingMessage =
    hasMeaningfulPrompt &&
    hasFaceArtifact &&
    hasAudio &&
    !pricingQ.isFetching &&
    !busy &&
    !pricing
      ? "Pricing preview is temporarily unavailable right now. You can still create the video, and the final pricing summary will appear after completion."
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: DF.night }}>
      <DFHeader
        subtitle="Fusion Studio"
        onMenuPress={() => router.push("/(tabs)/dashboard" as any)}
        onPressMeta={openPlanScreen}
      />
      <Stepper step={3} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 120 }}
      >
        <PricingTopBar
          studioName="Fusion Studio"
          estimate={finalPricingLabel ?? pricing?.estimateLabel ?? "Estimate pending"}
          walletAfterRun={pricing?.availableLabel ?? undefined}
          planName={pricing?.planLabel ?? undefined}
          includedUsageLeft={pricing?.availableLabel ?? undefined}
          availabilityLabel={pricing?.availableLabel ?? undefined}
          settlementLabel={pricing?.settlementLabel ?? "Pre-execution estimate • Final actual after completion"}
          entitlementLabel={pricing?.detailLabel ?? undefined}
          onPressBreakdown={() => setShowPricingBreakdown(true)}
          onPressManagePlan={openPlanScreen}
        />

        <GlassCard>
          <View>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>Create final video</Text>
            <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700" }}>
              Choose how you want your final video to look and feel.
            </Text>
          </View>
        </GlassCard>

        <GlassCard style={{ marginTop: 12 }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Video mode</Text>
          <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
            Select how Fusion should generate your final video.
          </Text>

          <View style={{ gap: 10, marginTop: 12 }}>
            {([
              {
                code: "TALKING_VIDEO" as VideoMode,
                label: "Talking Video",
                detail: "Fast face + audio performance generation",
              },
              {
                code: "CINEMATIC_VIDEO_DIRECTION" as VideoMode,
                label: "Cinematic Video Direction",
                detail: "Directed premium storytelling with cinematic motion",
              },
            ]).map((item) => {
              const active = videoMode === item.code;
              return (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    setVideoMode(item.code);
                    if (item.code === "CINEMATIC_VIDEO_DIRECTION" && !aspectRatioManuallyChangedRef.current && aspectRatio === "9:16") {
                      setAspectRatio("16:9");
                    }
                  }}
                  disabled={locked}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
                    backgroundColor: active ? "rgba(232,152,56,0.16)" : "rgba(255,255,255,0.05)",
                    padding: 12,
                    opacity: locked ? 0.75 : 1,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900", fontSize: 13 }}>
                        {item.label}
                      </Text>
                      <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, marginTop: 5 }}>
                        {item.detail}
                      </Text>
                    </View>
                    {active ? (
                      <View
                        style={{
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          backgroundColor: "rgba(248,184,72,0.18)",
                          borderWidth: 1,
                          borderColor: "rgba(248,184,72,0.28)",
                        }}
                      >
                        <Text style={{ color: "rgba(248,232,136,1)", fontWeight: "900", fontSize: 11 }}>Selected</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        {videoMode === "TALKING_VIDEO" && (
          <GlassCard style={{ marginTop: 12 }}>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>
              Talking video options
            </Text>
            <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
              Choose whether the background stays fixed or includes movement based on the background context.
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {([
                {
                  key: "fixed" as const,
                  label: "Fixed background",
                  detail: "Clean talking video with a still scene",
                },
                {
                  key: "movement_based" as const,
                  label: "Movement-based background",
                  detail: "Talking video with subtle scene motion based on background context",
                },
              ]).map((item) => {
                const active = talkingBackgroundMode === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setTalkingBackgroundMode(item.key)}
                    style={{
                      flex: 1,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
                      backgroundColor: active ? "rgba(232,152,56,0.16)" : "rgba(255,255,255,0.05)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900", fontSize: 12 }}>
                      {item.label}
                    </Text>
                    <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 11, marginTop: 6 }}>
                      {item.detail}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </GlassCard>
        )}

        <GlassCard style={{ marginTop: 12 }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Aspect ratio</Text>
          <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
            Choose the output frame for this {modeShortTitle(videoMode).toLowerCase()}.
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            {(["9:16", "1:1", "16:9"] as const).map((ratio) => {
              const active = aspectRatio === ratio;
              return (
                <Pressable
                  key={ratio}
                  onPress={() => {
                    aspectRatioManuallyChangedRef.current = true;
                    setAspectRatio(ratio);
                  }}
                  disabled={locked}
                  style={{
                    flex: 1,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
                    backgroundColor: active ? "rgba(232,152,56,0.16)" : "rgba(255,255,255,0.05)",
                    paddingVertical: 12,
                    alignItems: "center",
                    opacity: locked ? 0.75 : 1,
                  }}
                >
                  <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900", fontSize: 13 }}>
                    {ratio}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        {isCinematic && (
          <GlassCard style={{ marginTop: 12 }}>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>
              Cinematic intent
            </Text>
            <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
              Tell us the purpose of the video. The backend can use this for direction,
              segment planning, shot structure, and final stitching.
            </Text>

            <View
              style={{
                marginTop: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: hasMeaningfulCinematicIntent
                  ? "rgba(248,184,72,0.22)"
                  : "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(0,0,0,0.22)",
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <TextInput
                value={cinematicIntent}
                onChangeText={setCinematicIntent}
                editable={!locked}
                multiline
                textAlignVertical="top"
                placeholder="Example: Create a premium launch intro for Instagram and YouTube that starts intimate, expands into a celebratory visual mood, and ends with a strong brand close."
                placeholderTextColor="rgba(255,255,255,0.32)"
                style={{
                  minHeight: 110,
                  color: DF.text,
                  fontWeight: "700",
                  fontSize: 13,
                  lineHeight: 20,
                  padding: 0,
                }}
              />
            </View>

            <Text
              style={{
                color: hasMeaningfulCinematicIntent ? DF.muted : "rgba(248,184,72,0.92)",
                fontWeight: "800",
                fontSize: 11,
                marginTop: 10,
              }}
            >
              {hasMeaningfulCinematicIntent
                ? "Intent will be used for direction and orchestration."
                : "Describe the purpose and expected outcome of the cinematic video."}
            </Text>

            <Text style={{ color: DF.muted, fontWeight: "800", fontSize: 11, marginTop: 14, marginBottom: 8 }}>
              Video type
            </Text>

            <View style={{ gap: 8 }}>
              {([
                { key: "brand_story" as const, label: "Brand story" },
                { key: "promo" as const, label: "Promo" },
                { key: "festival_greeting" as const, label: "Festival greeting" },
                { key: "explainer" as const, label: "Explainer" },
              ]).map((item) => {
                const active = cinematicVideoType === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setCinematicVideoType(item.key)}
                    style={{
                      borderRadius: 14,
                      paddingVertical: 10,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
                      backgroundColor: active ? "rgba(232,152,56,0.16)" : "rgba(255,255,255,0.05)",
                    }}
                  >
                    <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900", fontSize: 12 }}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </GlassCard>
        )}

        {isCinematic && (
          <GlassCard style={{ marginTop: 12 }}>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Cinematic direction</Text>
            <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
              These controls shape the directed cinematic plan.
            </Text>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: DF.muted, fontWeight: "800", fontSize: 11, marginBottom: 8 }}>Camera angle</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([
                  { key: "eye_level", label: "Eye level" },
                  { key: "low_angle", label: "Low angle" },
                  { key: "high_angle", label: "High angle" },
                ] as const).map((item) => {
                  const active = cameraAngle === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setCameraAngle(item.key)}
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        paddingVertical: 10,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
                        backgroundColor: active ? "rgba(232,152,56,0.16)" : "rgba(255,255,255,0.05)",
                      }}
                    >
                      <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900", fontSize: 11 }}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: DF.muted, fontWeight: "800", fontSize: 11, marginBottom: 8 }}>Framing</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {([
                  { key: "medium_close_up", label: "MCU" },
                  { key: "medium_shot", label: "Medium" },
                  { key: "wide_shot", label: "Wide" },
                ] as const).map((item) => {
                  const active = cameraFraming === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setCameraFraming(item.key)}
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        paddingVertical: 10,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
                        backgroundColor: active ? "rgba(232,152,56,0.16)" : "rgba(255,255,255,0.05)",
                      }}
                    >
                      <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900", fontSize: 11 }}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: DF.muted, fontWeight: "800", fontSize: 11, marginBottom: 8 }}>Motion style</Text>
              <View style={{ gap: 8 }}>
                {([
                  { key: "steady", label: "Steady" },
                  { key: "slow_push_in", label: "Slow push-in" },
                  { key: "gentle_parallax", label: "Gentle parallax" },
                ] as const).map((item) => {
                  const active = cameraMotionStyle === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setCameraMotionStyle(item.key)}
                      style={{
                        borderRadius: 14,
                        paddingVertical: 10,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
                        backgroundColor: active ? "rgba(232,152,56,0.16)" : "rgba(255,255,255,0.05)",
                      }}
                    >
                      <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900", fontSize: 11 }}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </GlassCard>
        )}

        <GlassCard style={{ marginTop: 12 }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Video direction</Text>
          <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
            Required. Describe the performance you want, including expression, hand gestures, body language, and scene energy.
          </Text>

          <View
            style={{
              marginTop: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: hasMeaningfulPrompt ? "rgba(248,184,72,0.22)" : "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(0,0,0,0.22)",
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <TextInput
              value={videoPrompt}
              onChangeText={setVideoPrompt}
              editable={!locked}
              multiline
              textAlignVertical="top"
              placeholder="Example: Warm festive delivery, expressive hands, natural upper-body movement, bright eyes, graceful body language, premium cinematic background motion."
              placeholderTextColor="rgba(255,255,255,0.32)"
              style={{
                minHeight: 118,
                color: DF.text,
                fontWeight: "700",
                fontSize: 13,
                lineHeight: 20,
                padding: 0,
              }}
            />
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <Text
              style={{
                color: hasMeaningfulPrompt ? DF.muted : "rgba(248,184,72,0.92)",
                fontWeight: "800",
                fontSize: 11,
                flex: 1,
                paddingRight: 12,
              }}
            >
              {promptRequiredMessage ??
                `This prompt is sent to the orchestration layer together with your Audio Studio audio to guide the final video.`}
            </Text>
            <Text style={{ color: DF.muted, fontWeight: "800", fontSize: 11 }}>
              {normalizedVideoPrompt.length} chars
            </Text>
          </View>
        </GlassCard>

        <GlassCard style={{ marginTop: 12 }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Inputs</Text>
          <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
            Face + Audio will be used to create your final {modeShortTitle(videoMode).toLowerCase()}.
          </Text>

          <View
            style={{
              marginTop: 12,
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: DF.border,
              backgroundColor: DF.night2,
            }}
          >
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 250 }} contentFit="contain" />
            ) : hasFacePreview ? (
              <View style={{ height: 220, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: DF.text, fontWeight: "800" }}>Face connected</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                  {hasFaceArtifact
                    ? "The selected face artifact is ready for Fusion."
                    : "A face preview is present, but Fusion needs a saved Face Studio artifact before create."}
                </Text>
              </View>
            ) : (
              <View style={{ height: 220, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: DF.muted, fontWeight: "800" }}>Missing face input</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                  Go back and select a face first.
                </Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => audioUrl && openLink(audioUrl)}
              disabled={(!audioUrl && !effectiveAudioArtifactId) || locked}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(0,0,0,0.22)",
                opacity: (audioUrl || effectiveAudioArtifactId) && !locked ? 1 : 0.6,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>
                {audioUrl ? "Open Audio" : effectiveAudioArtifactId ? "Audio connected" : "Missing audio"}
              </Text>
            </Pressable>

            <GlassCard
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <Text style={{ color: DF.muted, fontWeight: "800", fontSize: 10 }}>Mode / Flow</Text>
              <Text style={{ color: DF.text, fontWeight: "900", marginTop: 4, textAlign: "center" }}>
                {modeShortTitle(videoMode)} • {orchestrationLabel}
              </Text>
            </GlassCard>
          </View>
        </GlassCard>

        {!!faceArtifactRequiredMessage && (
          <GlassCard
            style={{
              marginTop: 12,
              borderColor: "rgba(255,180,90,0.30)",
              backgroundColor: "rgba(255,180,90,0.10)",
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Face artifact required</Text>
            <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
              {faceArtifactRequiredMessage}
            </Text>
          </GlassCard>
        )}

        {!!promptRequiredMessage && (
          <GlassCard style={{ marginTop: 12, borderColor: "rgba(248,184,72,0.24)", backgroundColor: "rgba(248,184,72,0.10)" }}>
            <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>{promptRequiredMessage}</Text>
          </GlassCard>
        )}

        {!!cinematicIntentRequiredMessage && (
          <GlassCard style={{ marginTop: 12, borderColor: "rgba(248,184,72,0.24)", backgroundColor: "rgba(248,184,72,0.10)" }}>
            <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>{cinematicIntentRequiredMessage}</Text>
          </GlassCard>
        )}

        {!!providerWarningMessage && (
          <GlassCard style={{ marginTop: 12, borderColor: "rgba(255,180,90,0.30)", backgroundColor: "rgba(255,180,90,0.10)" }}>
            <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>{providerWarningMessage}</Text>
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
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Not enough credits</Text>
            <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
              This video run needs more available usage than your current included balance or wallet supports.
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

        {!!statusText && (
          <GlassCard style={{ marginTop: 12 }}>
            <Text style={{ color: DF.muted, fontWeight: "800" }}>{statusText}</Text>
            <View
              style={{
                height: 10,
                borderRadius: 999,
                marginTop: 10,
                overflow: "hidden",
                backgroundColor: "rgba(255,255,255,0.08)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
              }}
            >
              <Animated.View
                style={{
                  height: "100%",
                  width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
                  backgroundColor: "rgba(232,152,56,0.55)",
                }}
              />
            </View>
            {!!jobId && (
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 11, marginTop: 10 }}>
                {lastStatusCheckAt
                  ? `Last checked ${new Date(lastStatusCheckAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
                  : "Waiting for first status update…"}
                {statusRetryCount > 0 ? ` • retrying (${statusRetryCount})` : ""}
              </Text>
            )}
          </GlassCard>
        )}

        {!!backgroundNotice && (
          <GlassCard
            style={{
              marginTop: 12,
              borderColor: "rgba(248,184,72,0.22)",
              backgroundColor: "rgba(232,152,56,0.10)",
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>
              {backgroundNotice}
            </Text>
          </GlassCard>
        )}

        <Pressable
          onPress={generate}
          disabled={!canGenerate}
          style={{
            marginTop: 12,
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "rgba(248,184,72,0.35)",
            backgroundColor:
              hasFaceArtifact && hasAudio && !pricing?.insufficientBalance ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.06)",
            opacity: locked ? 0.85 : 1,
          }}
        >
          {busy ? (
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <ActivityIndicator />
              <Text style={{ color: DF.text, fontWeight: "900" }}>Working…</Text>
            </View>
          ) : (
            <Text style={{ color: DF.text, fontWeight: "900" }}>
              {!hasFaceArtifact
                ? "Select a Face Studio result to continue"
                : !hasMeaningfulPrompt
                  ? "Enter video prompt to continue"
                  : isCinematic && !hasMeaningfulCinematicIntent
                    ? "Add cinematic intent to continue"
                    : pricing?.ctaLabel ?? "Create Video"}
            </Text>
          )}
        </Pressable>

        {!!videoUrl && (
          <GlassCard style={{ marginTop: 12 }}>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Output</Text>
            {!!promptPreview && (
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, marginTop: 6 }}>
                Direction: {promptPreview}
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={() => openVideoViewer(videoUrl)}
                disabled={locked}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: "rgba(0,0,0,0.22)",
                  opacity: locked ? 0.7 : 1,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>Open Video</Text>
              </Pressable>

              <Pressable
                onPress={onShare}
                disabled={locked}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(248,184,72,0.28)",
                  backgroundColor: "rgba(232,152,56,0.12)",
                  opacity: locked ? 0.7 : 1,
                }}
              >
                <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900" }}>Share</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setSummaryOpen(true)}
              style={{
                marginTop: 10,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.05)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>View Summary</Text>
            </Pressable>

            <RunReceiptCard
              pricing={{ ...(pricing as any), stage: finalPricingState as any } as any}
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
            <JobPricingTimeline stage={finalPricingState as any} />
          </GlassCard>
        )}
      </ScrollView>

      <Modal
        visible={summaryOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSummaryOpen(false)}
      >
        <Pressable
          onPress={() => setSummaryOpen(false)}
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
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>Fusion session summary</Text>
                <Pressable
                  onPress={() => setSummaryOpen(false)}
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
                Your Face, Audio, and Fusion workflow is complete.
              </Text>

              {!!imageUrl && (
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
                  <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 220 }} contentFit="contain" />
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
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Face artifact selected for the final video</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Voice audio selected for the final flow</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Final video ready to open or share</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Mode: {modeTitle(videoMode)}</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Flow: {orchestrationLabel}</Text>
                {videoMode === "TALKING_VIDEO" ? (
                  <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                    • Background: {talkingBackgroundMode === "movement_based" ? "Movement-based" : "Fixed"}
                  </Text>
                ) : (
                  <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                    • Background: Dynamic, directed by intent
                  </Text>
                )}
                {isCinematic && !!normalizedCinematicIntent ? (
                  <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                    • Intent: {promptPreviewText(normalizedCinematicIntent, 120)}
                  </Text>
                ) : null}
                {isCinematic ? (
                  <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                    • Video type: {cinematicVideoType.replace(/_/g, " ")}
                  </Text>
                ) : null}
                {!!promptPreview && (
                  <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Direction: {promptPreview}</Text>
                )}
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Plan: {pricing?.planLabel ?? "Fusion"}</Text>
                {!!(finalPricingLabel ?? pricing?.estimateLabel) && (
                  <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                    • Pricing: {finalPricingLabel ?? pricing?.estimateLabel}
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Pressable
                  onPress={() => setSummaryOpen(false)}
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
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Done</Text>
                </Pressable>

                <Pressable
                  onPress={() => videoUrl && openVideoViewer(videoUrl)}
                  disabled={!videoUrl}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(248,184,72,0.35)",
                    backgroundColor: "rgba(232,152,56,0.22)",
                    opacity: videoUrl ? 1 : 0.6,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Open Video</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <GlobalJobsTray jobs={jobs} onOpenJob={openJob} onDismissJob={dismissJob} />

      <PricingBreakdownSheet
        visible={showPricingBreakdown}
        studioName="Fusion Studio"
        estimate={pricing?.estimateLabel ?? "Estimate pending"}
        billedUnitType={`${modeTitle(videoMode)} • ${orchestrationLabel}`}
        includedText={pricing?.availableLabel ?? "Included plan usage applies before wallet or postpaid settlement."}
        premiumText={pricing?.settlementLabel ?? "Advanced orchestration and output complexity can change the final amount."}
        priceDriverText={pricing?.detailLabel ?? `${hasFaceArtifact ? "face artifact ready" : "missing face artifact"} • ${hasAudio ? "audio ready" : "missing audio"} • ${modeShortTitle(videoMode)}${promptPreview ? " • video direction" : ""}`}
        onClose={() => setShowPricingBreakdown(false)}
        onConfirm={() => setShowPricingBreakdown(false)}
      />

      <UpgradePromptSheet
        visible={showUpgrade}
        title="Upgrade or top up to keep rendering"
        description="Fusion Studio uses included usage first, then wallet or postpaid settlement depending on your plan entitlements."
        currentPlan={pricing?.planLabel ?? "Current plan"}
        usageContext={pricing?.availableLabel ?? "Your current included usage or wallet balance is not enough for this render."}
        highlights={[
          "Continue face-to-video workflows without broken handoffs",
          "Use included monthly usage where your plan allows it",
          "Handle overages through wallet or postpaid billing based on entitlement rules",
        ]}
        onClose={() => setShowUpgrade(false)}
        onSecondary={() => setShowUpgrade(false)}
        onUpgrade={openUpgradeScreen}
      />

      <DFBlockingOverlay
        visible={false}
        title="Working…"
        message="Locking your inputs and finishing the action."
      />
    </View>
  );
}
