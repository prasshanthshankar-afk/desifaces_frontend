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
import { useIsFocused } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import { shareUrl } from "../../core/share/share";
import { saveCreateFlowContext } from "../../core/media/createFlow";
import { useResolvedPricingDisplay } from "../../core/pricing/resolvePricingDisplay";
import { derivePricingUiSummary } from "../../core/pricing/pricingSummary";
import {
  computeAffordabilityDecision,
  normalizePricingErrorForUser,
} from "../../core/pricing/studioAffordability";

import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import DFBlockingOverlay from "../../core/ui/DFBlockingOverlay";

import {
  apiCreateFusionJob,
  apiGetFusionJobStatus,
  previewFusionPricing,
  type FusionCreateRequest,
} from "./api/creatorFusion";

import { normalizePricing, normalizePricingSummary, pickPricingContainer } from "../pricing/normalizers";
import { PricingTopBar } from "../../components/pricing/PricingTopBar";
import PromptEnhancerSheet, {
  type PromptEnhancerResult,
} from "../../components/ai/PromptEnhancerSheet";
import StudioTipsRail, {
  type StudioCoachTip,
} from "../../components/ai/StudioTipsRail";
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
type CinematicOutputProfile = "fast" | "premium";

const TALKING_VIDEO_BETA_RELEASE = true;
const CINEMATIC_VIDEO_COMING_SOON = true;

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function cleanParam(v: any): string {
  if (Array.isArray(v)) v = v[0];
  return String(v ?? "").trim().replace(/^"+|"+$/g, "");
}

function logFusionStudioFlow(step: string, payload: any) {
  try {
    console.log("[DF_FLOW][FusionStudio]", step, JSON.stringify(payload, null, 2));
  } catch {
    console.log("[DF_FLOW][FusionStudio]", step, payload);
  }
}



function decodeNavUrl(v: unknown): string {
  let s = cleanParam(v);
  if (!s) return "";

  for (let i = 0; i < 2; i++) {
    if (/^https?:\/\//i.test(s)) break;
    try {
      s = decodeURIComponent(s);
    } catch {
      break;
    }
  }
  return s;
}

function rebuildSasIfSplit(rawUrl: string, params: Record<string, any>) {
  const u0 = cleanParam(rawUrl);
  if (!u0) return "";

  const hasQuery = u0.includes("?");
  if (!hasQuery) return u0;

  const [base, qs] = u0.split("?");
  if (!qs) return u0;

  const sp = cleanParam((params as any).sp);
  const sv = cleanParam((params as any).sv);
  const sr = cleanParam((params as any).sr);
  const se = cleanParam((params as any).se);
  const sig = cleanParam((params as any).sig);

  if (!(sp || sv || sr || se || sig)) return u0;

  const parts = qs.split("&").filter(Boolean);
  const seen = new Set(parts.map((p) => p.split("=")[0]));

  const addIfMissing = (k: string, v: string) => {
    if (!v) return;
    if (!seen.has(k)) {
      parts.push(`${k}=${v}`);
      seen.add(k);
    }
  };

  addIfMissing("sp", sp);
  addIfMissing("sv", sv);
  addIfMissing("sr", sr);
  addIfMissing("se", se);
  addIfMissing("sig", sig);

  return `${base}?${parts.join("&")}`;
}

function ensureAzureSigEncoded(url: string) {
  const u = cleanParam(url);
  const qIdx = u.indexOf("?");
  if (qIdx < 0) return u;

  const base = u.slice(0, qIdx);
  const qs = u.slice(qIdx + 1);

  const parts = qs.split("&").filter(Boolean);
  const out = parts.map((p) => {
    const eq = p.indexOf("=");
    const k = eq >= 0 ? p.slice(0, eq) : p;
    const v = eq >= 0 ? p.slice(eq + 1) : "";

    if (k !== "sig") return p;
    if (!v) return p;
    if (/%[0-9A-Fa-f]{2}/.test(v)) return p;
    return `sig=${encodeURIComponent(v)}`;
  });

  return `${base}?${out.join("&")}`;
}

function normalizeIncomingMediaUrl(raw: unknown, params: Record<string, any>) {
  const decoded = decodeNavUrl(raw);
  const rebuilt = rebuildSasIfSplit(decoded, params);
  return ensureAzureSigEncoded(rebuilt);
}


function normalizePromptText(v: any): string {
  return cleanParam(v).replace(/\s+/g, " ").trim();
}

function promptPreviewText(v: string, max = 160): string {
  const normalized = normalizePromptText(v);
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}


function estimateSpeechDurationSec(text: string): number {
  const normalized = normalizePromptText(text);
  if (!normalized) return 0;
  const words = normalized.split(/\s+/).filter(Boolean).length;
  const sec = Math.ceil(words / 2.6);
  return Math.max(5, Math.min(30, sec));
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
  return mode === "CINEMATIC_VIDEO_DIRECTION" ? "Cinematic Video Direction" : talkingVideoDisplayLabel();
}

function modeShortTitle(mode: VideoMode) {
  return mode === "CINEMATIC_VIDEO_DIRECTION" ? "Cinematic Video" : "Talking Video";
}

function modeBadgeLabel(mode: VideoMode): string | null {
  if (mode === "CINEMATIC_VIDEO_DIRECTION" && CINEMATIC_VIDEO_COMING_SOON) return "Coming Soon";
  return null;
}

function talkingVideoDisplayLabel() {
  return "Talking Video";
}

function profileForMode(mode: VideoMode): string {
  return mode === "CINEMATIC_VIDEO_DIRECTION" ? "cinematic_video_direction" : "talking_video";
}

function orchestrationLabelForMode(mode: VideoMode): string {
  return mode === "CINEMATIC_VIDEO_DIRECTION" ? "Directed orchestration" : "Talking-video orchestration";
}

function normalizeCinematicOutputProfile(v: any): CinematicOutputProfile {
  const s = cleanParam(v).toLowerCase();
  return s === "fast" ? "fast" : "premium";
}

function cinematicOutputProfileLabel(profile: CinematicOutputProfile): string {
  return profile === "fast" ? "Cinematic Fast" : "Cinematic Premium";
}

function modeActionLabel(mode: VideoMode, cinematicOutputProfile: CinematicOutputProfile): string {
  if (mode === "CINEMATIC_VIDEO_DIRECTION") {
    return cinematicOutputProfileLabel(cinematicOutputProfile);
  }
  return talkingVideoDisplayLabel();
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
  const picked = pickPricingContainer(resp);
  const pricing = picked.pricing ?? resp?.pricing ?? null;
  const summary = picked.pricingSummary ?? resp?.pricing_summary ?? pricing?.summary ?? null;
  const state = String(pricing?.state ?? summary?.state ?? "").toLowerCase();
  const billingMode = String(pricing?.billing_mode ?? pricing?.billingMode ?? "").toLowerCase();
  const settlementMode = String(pricing?.settlement_mode ?? pricing?.settlementMode ?? "").toLowerCase();

  if (
    state === "suppressed" ||
    billingMode === "internal" ||
    settlementMode === "internal" ||
    pricing?.suppressed === true ||
    pricing?.pricing_suppressed === true ||
    pricing?.suppress_pricing === true
  ) {
    return undefined;
  }

  if (state === "released") {
    return (
      summary?.display_final ||
      summary?.displayFinal ||
      summary?.finalLabel ||
      summary?.final_label ||
      (pricing?.currency ? `${pricing.currency} 0.00` : "0.00")
    );
  }

  if (state === "committed") {
    return (
      summary?.display_final ||
      summary?.displayFinal ||
      summary?.finalLabel ||
      summary?.final_label ||
      summary?.receiptLabel ||
      summary?.receipt_label ||
      (pricing?.final_amount != null && pricing?.currency ? `${pricing.currency} ${pricing.final_amount}` : undefined) ||
      (pricing?.finalAmount != null && pricing?.currency ? `${pricing.currency} ${pricing.finalAmount}` : undefined) ||
      (pricing?.amount != null && pricing?.currency ? `${pricing.currency} ${pricing.amount}` : undefined)
    );
  }

  return (
    summary?.display_estimate ||
    summary?.displayEstimate ||
    summary?.estimateLabel ||
    summary?.estimate_label ||
    summary?.display_final ||
    summary?.displayFinal ||
    (pricing?.estimated_amount != null && pricing?.currency ? `${pricing.currency} ${pricing.estimated_amount}` : undefined) ||
    (pricing?.estimatedAmount != null && pricing?.currency ? `${pricing.currency} ${pricing.estimatedAmount}` : undefined) ||
    (pricing?.amount != null && pricing?.currency ? `${pricing.currency} ${pricing.amount}` : undefined)
  );
}

function pickFinalPricingMessage(resp: any): string | null {
  const picked = pickPricingContainer(resp);
  const pricing = picked.pricing ?? resp?.pricing ?? null;
  const summary = picked.pricingSummary ?? resp?.pricing_summary ?? pricing?.summary ?? null;
  const state = String(pricing?.state ?? summary?.state ?? "").toLowerCase();

  if (typeof summary?.display_note === "string" && summary.display_note.trim()) return summary.display_note;
  if (typeof summary?.displayNote === "string" && summary.displayNote.trim()) return summary.displayNote;
  if (typeof summary?.message === "string" && summary.message.trim()) return summary.message;
  if (typeof summary?.detail === "string" && summary.detail.trim()) return summary.detail;

  if (state === "suppressed") return null;
  if (state === "released") return "Reservation released. No final charge was applied.";
  if (state === "committed") return "Final charge recorded after execution.";

  return null;
}

type EstimateResult = {
  preview: boolean;
  estimateLabel: string;
  primaryEstimateLabel: string;
  secondaryEstimateLabel: string;
  creditEstimateLabel: string;
  moneyEstimateLabel: string;
  noteLabel: string;
  detailLabel: string;
  settlementLabel: string;
  settlementMode?: string;
  tierCode?: string;
  planLabel: string;
  availableLabel: string;
  holdLabel?: string;
  ctaLabel: string;
  insufficientBalance: boolean;
  topUpVisible: boolean;
  upgradeVisible: boolean;
  entitlementReason?: string;
  raw?: any;
  pricing?: ReturnType<typeof normalizePricing>;
  pricingSummary?: ReturnType<typeof normalizePricingSummary>;
};

function fusionReceiptLifecycleState(resp: any): "estimated" | "committed" | "released" {
  const picked = pickPricingContainer(resp);
  const state = cleanParam(
    picked.pricing?.state ??
      picked.pricingSummary?.state ??
      resp?.run_receipt?.state ??
      resp?.runReceipt?.state ??
      resp?.pricing?.state
  ).toLowerCase();

  if (state === "released") return "released";
  if (state === "committed" || state === "succeeded" || state === "charged") return "committed";
  return "estimated";
}

function buildFusionRunReceiptViews(latestStatus: any, estimate?: EstimateResult | null) {
  const picked = pickPricingContainer(latestStatus);

  const previewPricing =
    estimate?.raw?.pricing ??
    estimate?.pricing?.raw ??
    estimate?.pricing ??
    null;

  const previewSummary =
    estimate?.raw?.pricing_summary ??
    estimate?.raw?.pricingSummary ??
    estimate?.pricingSummary ??
    null;

  const merged = {
    ...(previewPricing ?? {}),
    ...(previewSummary ?? {}),
    ...(picked.pricing ?? {}),
    ...(picked.pricingSummary ?? {}),
  };

  const hasMerged = Object.keys(merged).length > 0;
  const pricing = hasMerged ? normalizePricing(merged, merged) : estimate?.pricing ?? null;
  const pricingSummary = hasMerged
    ? normalizePricingSummary(merged, merged)
    : estimate?.pricingSummary ?? null;

  return { pricing, pricingSummary };
}

function hasCommittedLedgerReceipt(pricing: any): boolean {
  const state = cleanParam(pricing?.state).toLowerCase();
  const stage = cleanParam(pricing?.stage).toLowerCase();
  return Boolean(
    (state === "committed" || stage === "committed") &&
      cleanParam(pricing?.ledgerEntryId || pricing?.ledger_entry_id)
  );
}

function fallbackEstimate(args: { hasFaceArtifact: boolean; hasAudio: boolean; videoMode: VideoMode }): EstimateResult {
  return {
    preview: true,
    estimateLabel: "Estimate preview",
    primaryEstimateLabel: "Estimate preview",
    secondaryEstimateLabel: "$0.00",
    creditEstimateLabel: "1 credit",
    moneyEstimateLabel: "$0.00",
    noteLabel: "Covered by your available credits.",
    detailLabel: `${args.hasFaceArtifact ? "face artifact ready" : "missing face artifact"} • ${args.hasAudio ? "audio ready" : "missing audio"} • ${modeShortTitle(args.videoMode)}`,
    settlementLabel: "Preview estimate only. Final actual should come from the committed pricing snapshot.",
    planLabel: "Estimate preview",
    availableLabel: "Balance preview unavailable",
    ctaLabel: `Create ${modeShortTitle(args.videoMode)}`,
    insufficientBalance: false,
    topUpVisible: false,
    upgradeVisible: false,
    entitlementReason: undefined,
  };
}

function formatMoney(amount: number, currency = "USD"): string {
  const safeCurrency = cleanParam(currency).toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${safeCurrency} ${amount.toFixed(2)}`;
  }
}

function asEstimateNumber(value: any): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function chooseFusionSettlementLabel(pricing: any, insufficientBalance: boolean): string {
  const settlementMode = cleanParam(pricing?.settlementMode).toLowerCase();
  if (insufficientBalance) return "Not enough available credits for this run.";
  if (settlementMode === "postpaid") {
    return "Billed after completion through enterprise invoicing.";
  }
  return "Covered by your available credits.";
}

function buildLocalFusionPrompt(
  userInput: string,
  lockedFields: Record<string, any>,
  flavor: "primary" | "cinematic" | "expressive" | "steady"
): string {
  const modeLabel = cleanParam(lockedFields?.video_mode_label || lockedFields?.video_mode);
  const aspectRatio = cleanParam(lockedFields?.aspect_ratio);
  const camera = [
    cleanParam(lockedFields?.camera_angle_label),
    cleanParam(lockedFields?.camera_framing_label),
    cleanParam(lockedFields?.camera_motion_style_label),
  ].filter(Boolean).join(", ");
  const styleByFlavor =
    flavor === "cinematic"
      ? "cinematic pacing, premium visual rhythm, emotionally directed performance, graceful motion"
      : flavor === "expressive"
        ? "expressive hands, natural body language, confident face performance, scene-aware delivery"
        : flavor === "steady"
          ? "steady performance, clean upper-body motion, balanced expression, polished delivery"
          : "authentic performance, natural gestures, believable body movement, camera-aware delivery";

  return [
    userInput,
    modeLabel ? `mode ${modeLabel}` : "",
    aspectRatio ? `aspect ratio ${aspectRatio}` : "",
    camera ? `camera ${camera}` : "",
    styleByFlavor,
  ]
    .map((x) => cleanParam(x))
    .filter(Boolean)
    .join(", ");
}

function buildLocalFusionEnhancement(
  userInput: string,
  lockedFields: Record<string, any>
): PromptEnhancerResult {
  const why = cleanParam(lockedFields?.video_mode) === "CINEMATIC_VIDEO_DIRECTION"
    ? "The rewrite adds stronger direction for performance, camera behavior, and scene intent without changing your core idea."
    : "The rewrite makes the talking-video prompt clearer about delivery, gesture, and body movement.";

  return {
    original_input: userInput,
    enhanced_input: buildLocalFusionPrompt(userInput, lockedFields, "primary"),
    alternatives: [
      { label: "Cinematic", text: buildLocalFusionPrompt(userInput, lockedFields, "cinematic") },
      { label: "Expressive", text: buildLocalFusionPrompt(userInput, lockedFields, "expressive") },
      { label: "Steady", text: buildLocalFusionPrompt(userInput, lockedFields, "steady") },
    ],
    tips: [
      cleanParam(lockedFields?.video_mode) === "CINEMATIC_VIDEO_DIRECTION"
        ? "Include the emotional arc and intended outcome so the cinematic planner has a clear goal."
        : "Mention facial expression, hand movement, and body language in the same sentence.",
      cleanParam(lockedFields?.background_mode) === "movement_based"
        ? "Call out the scene energy so movement-based backgrounds feel intentional."
        : "Describe whether you want a clean static backdrop or visible scene energy.",
      why,
    ].filter(Boolean),
    why_this_is_better: why,
    source: "fallback",
    fallback_used: true,
    structured: {
      video_mode: cleanParam(lockedFields?.video_mode),
      aspect_ratio: cleanParam(lockedFields?.aspect_ratio),
      background_mode: cleanParam(lockedFields?.background_mode),
      cinematic_intent: cleanParam(lockedFields?.cinematic_intent),
    },
  };
}

function buildLocalFusionTips(input: {
  videoMode: VideoMode;
  prompt: string;
  aspectRatio: string;
  hasFaceArtifact: boolean;
  hasUsableFaceInput?: boolean;
  hasAudio: boolean;
  cinematicIntent: string;
  backgroundMode: TalkingBackgroundMode;
  planLabel?: string | null;
}): StudioCoachTip[] {
  const tips: StudioCoachTip[] = [];
  const plan = cleanParam(input.planLabel).toLowerCase();

  if (input.videoMode === "CINEMATIC_VIDEO_DIRECTION" && !input.hasFaceArtifact) {
    tips.push({
      id: "fusion-tip-face",
      title: "Use a saved face artifact",
      body: "Cinematic Premium (Beta) works most reliably when the face comes from a saved Face Studio artifact.",
      tone: "warning",
    });
  }

  if (input.videoMode === "TALKING_VIDEO" && input.hasUsableFaceInput === false) {
    tips.push({
      id: "fusion-tip-face-preview",
      title: "Carry over the face preview",
      body: "Talking Video now requires a saved Face Studio artifact. Re-open Fusion from a saved Face result or select a face from your library that includes a face artifact.",
      tone: "warning",
    });
  }

  if (!input.hasAudio) {
    tips.push({
      id: "fusion-tip-audio",
      title: "Carry over audio first",
      body: "Select an Audio Studio result before generating the final video so lipsync and timing stay aligned.",
      tone: "warning",
    });
  }

  if (cleanParam(input.prompt).length < 24) {
    tips.push({
      id: "fusion-tip-prompt",
      title: "Be explicit about performance",
      body: "Mention emotion, gesture, and body movement together so the output feels directed instead of generic.",
      tone: "premium",
    });
  }

  if (input.videoMode === "CINEMATIC_VIDEO_DIRECTION" && cleanParam(input.cinematicIntent).length < 16) {
    tips.push({
      id: "fusion-tip-intent",
      title: "State the cinematic goal",
      body: "Add the purpose and desired outcome so the cinematic planner can shape scenes and pacing more intelligently.",
      tone: "neutral",
    });
  }

  if (input.videoMode === "TALKING_VIDEO") {
    tips.push({
      id: "fusion-tip-background",
      title: input.backgroundMode === "movement_based" ? "Support scene motion" : "Keep the scene clean",
      body: input.backgroundMode === "movement_based"
        ? "Describe the environment mood so background movement feels intentional and premium."
        : "Use a prompt that emphasizes face performance when the background is fixed.",
      tone: "success",
    });
  }

  tips.push({
    id: "fusion-tip-frame",
    title: "Match the final frame",
    body: `You are currently composing for ${input.aspectRatio}. Keep motion and framing cues aligned with that output format.`,
    tone: "neutral",
  });

  if (plan.includes("free")) {
    tips.push({
      id: "fusion-tip-cost",
      title: "Refine before render",
      body: "Use prompt enhancement before generate so you spend credits only when the direction is strong and specific.",
      tone: "warning",
    });
  }

  return tips.slice(0, 4);
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
  const auth = useAuth() as any;
  const { isReady, isAuthed } = auth;
  const queryClient = useQueryClient();
  const flow = useCreatorFlow() as any;

  const setFaceSelection = flow?.setFaceSelection as undefined | ((x: any) => void);
  const setAudioSelection = flow?.setAudioSelection as undefined | ((x: any) => void);
  const setFusionPrompt = flow?.setFusionPrompt as undefined | ((x: string) => void);
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);
  const resetCreatorFlow = flow?.resetCreatorFlow as undefined | ((nextOwnerKey?: string) => void);
  const setCreatorFlowOwner = flow?.setCreatorFlowOwner as undefined | ((ownerKey?: string) => void);
  const authUserId =
    cleanParam(auth?.userId) ||
    cleanParam(auth?.user?.id) ||
    cleanParam(auth?.session?.user?.id) ||
    cleanParam(auth?.authState?.user?.id) ||
    "";
  const authSessionKey = authUserId || "anon";

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
    output_profile?: string | string[];
  }>();

  const rawStoreFace = flow?.faceSelection ?? flow?.face ?? null;
  const rawStoreAudio = flow?.audioSelection ?? flow?.audio ?? null;

  const storeFaceOwnerUserId = cleanParam(
    rawStoreFace?.ownerUserId ??
      rawStoreFace?.owner_user_id ??
      rawStoreFace?.userId ??
      rawStoreFace?.user_id ??
      ""
  );
  const storeAudioOwnerUserId = cleanParam(
    rawStoreAudio?.ownerUserId ??
      rawStoreAudio?.owner_user_id ??
      rawStoreAudio?.userId ??
      rawStoreAudio?.user_id ??
      ""
  );

  const storeFace =
    authUserId && storeFaceOwnerUserId && storeFaceOwnerUserId !== authUserId ? null : rawStoreFace;
  const storeAudio =
    authUserId && storeAudioOwnerUserId && storeAudioOwnerUserId !== authUserId ? null : rawStoreAudio;

  const storeImageUrl = cleanParam(storeFace?.sasUrl ?? storeFace?.imageUrl ?? storeFace?.faceImageUrl ?? storeFace?.image_url ?? storeFace?.face_image_url ?? storeFace?.previewUrl ?? storeFace?.preview_url ?? storeFace?.url ?? "");
  const storeFaceArtifactId = cleanParam(storeFace?.artifactId ?? storeFace?.faceArtifactId ?? storeFace?.artifact_id ?? storeFace?.face_artifact_id ?? storeFace?.selectedFaceArtifactId ?? storeFace?.selected_face_artifact_id ?? storeFace?.fusionFaceArtifactId ?? storeFace?.fusion_face_artifact_id ?? "");
  const storeFaceMediaAssetId = cleanParam(storeFace?.mediaAssetId ?? storeFace?.media_asset_id ?? "");
  const storeFaceProfileId = cleanParam(storeFace?.faceProfileId ?? storeFace?.face_profile_id ?? "");
  const storeAudioUrl = cleanParam(storeAudio?.sasUrl ?? storeAudio?.audioUrl ?? storeAudio?.audio_url ?? storeAudio?.url ?? "");
  const storeAudioArtifactId = cleanParam(storeAudio?.artifactId ?? storeAudio?.artifact_id ?? "");
  const storeAudioDurationSec = Number(storeAudio?.durationSec ?? storeAudio?.duration_sec ?? 0) || 0;
  const storeAudioDurationMs = Number(storeAudio?.durationMs ?? storeAudio?.duration_ms ?? 0) || 0;
  const storeAudioScriptText = cleanParam(storeAudio?.scriptText ?? storeAudio?.script_text ?? "");
  const storeAudioLocale = cleanParam(storeAudio?.locale ?? "");
  const storeAudioVoice = cleanParam(storeAudio?.voice ?? "");

  const paramImageUrl = normalizeIncomingMediaUrl(
    cleanParam((params as any).face_sas_url) ||
      cleanParam((params as any).face_image_url) ||
      cleanParam((params as any).image_url) ||
      cleanParam((params as any).preview_url) ||
      cleanParam((params as any).previewUrl) ||
      cleanParam((params as any).url) ||
      "",
    params as any
  );
  const paramFaceArtifactId = cleanParam((params as any).face_artifact_id) || cleanParam((params as any).selected_face_artifact_id) || cleanParam((params as any).fusion_face_artifact_id) || "";
  const paramFaceMediaAssetId = cleanParam((params as any).face_media_asset_id) || cleanParam((params as any).media_asset_id) || "";
  const paramFaceProfileId = cleanParam((params as any).face_profile_id) || "";
  const paramAudioUrl = normalizeIncomingMediaUrl(
    cleanParam(params.audio_sas_url) || cleanParam(params.audio_url) || "",
    params as any
  );
  const paramAudioArtifactId = cleanParam(params.audio_artifact_id) || cleanParam(params.artifact_id) || "";
  const paramAudioDurationSec = Number(cleanParam(params.audio_duration_sec) || 0) || 0;
  const paramAudioDurationMs = Number(cleanParam(params.audio_duration_ms) || 0) || 0;
  const paramScriptText = cleanParam(params.script_text) || cleanParam(params.audio_script_text) || "";
  const paramAudioLocale = cleanParam(params.audio_locale) || "";
  const paramAudioVoice = cleanParam(params.audio_voice) || "";

  const flowOwnerUserId = cleanParam(
    flow?.ownerUserId ??
      flow?.owner_user_id ??
      flow?.userId ??
      flow?.user_id ??
      ""
  );
  const safeFlow =
    authUserId && flowOwnerUserId && flowOwnerUserId !== authUserId ? null : flow;

  const requestedInitialVideoMode = normalizeVideoMode(
    cleanParam(params.video_mode) ||
      cleanParam(params.mode) ||
      cleanParam(params.generation_mode) ||
      cleanParam(safeFlow?.fusionVideoMode) ||
      "TALKING_VIDEO"
  );
  const initialVideoMode =
    CINEMATIC_VIDEO_COMING_SOON && requestedInitialVideoMode === "CINEMATIC_VIDEO_DIRECTION"
      ? "TALKING_VIDEO"
      : requestedInitialVideoMode;
  const [videoMode, setVideoMode] = useState<VideoMode>(initialVideoMode);

  const orchestrationLabel = orchestrationLabelForMode(videoMode);

  const initialAspectRatio = normalizeAspectRatio(
    cleanParam((params as any).aspect_ratio) ||
      cleanParam(params.resolution) ||
      cleanParam(safeFlow?.fusionAspectRatio) ||
      (initialVideoMode === "CINEMATIC_VIDEO_DIRECTION" ? "16:9" : "9:16")
  );
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(initialAspectRatio);

  const [cameraAngle, setCameraAngle] = useState<CameraAngle>(
    (cleanParam(params.camera_angle) || cleanParam(safeFlow?.fusionCameraAngle) || "eye_level") as CameraAngle
  );
  const [cameraFraming, setCameraFraming] = useState<CameraFraming>(
    (cleanParam(params.camera_framing) || cleanParam(safeFlow?.fusionCameraFraming) || "medium_close_up") as CameraFraming
  );
  const [cameraMotionStyle, setCameraMotionStyle] = useState<CameraMotionStyle>(
    (cleanParam(params.camera_motion_style) || cleanParam(safeFlow?.fusionCameraMotionStyle) || "steady") as CameraMotionStyle
  );

  const [talkingBackgroundMode, setTalkingBackgroundMode] = useState<TalkingBackgroundMode>(
    (cleanParam((params as any).background_mode) ||
      cleanParam(safeFlow?.fusionBackgroundMode) ||
      "fixed") as TalkingBackgroundMode
  );

  const [cinematicIntent, setCinematicIntent] = useState<string>(
    normalizePromptText((params as any).intent ?? safeFlow?.fusionIntent ?? "")
  );

  const [cinematicVideoType, setCinematicVideoType] = useState<CinematicVideoType>(
    (cleanParam((params as any).video_type) ||
      cleanParam(safeFlow?.fusionVideoType) ||
      "brand_story") as CinematicVideoType
  );

  const [cinematicOutputProfile, setCinematicOutputProfile] = useState<CinematicOutputProfile>(
    normalizeCinematicOutputProfile(
      cleanParam((params as any).output_profile) || cleanParam(safeFlow?.fusionOutputProfile) || "premium"
    )
  );

  const providerWarningMessage =
    videoMode === "CINEMATIC_VIDEO_DIRECTION"
      ? `${cinematicOutputProfileLabel(cinematicOutputProfile)} uses directed orchestration and can take longer than Talking Video, especially for 16:9 renders.`
      : null;

  const cinematicComingSoonMessage = CINEMATIC_VIDEO_COMING_SOON
    ? "Cinematic Video Direction is coming soon. Talking Video Economy is included now, and Talking Video Premium is available as Beta Release."
    : null;

  const aspectRatioManuallyChangedRef = useRef(false);
  const lastFusionSettingsKeyRef = useRef("");
  const routeAspectRatio = useMemo(() => {
    const raw = cleanParam((params as any).aspect_ratio) || cleanParam(params.resolution);
    return raw ? normalizeAspectRatio(raw) : null;
  }, [params.resolution, (params as any).aspect_ratio]);

  const faceGender = cleanParam(params.gender) || cleanParam(safeFlow?.faceGender) || "";

  const flowVideoPrompt = normalizePromptText(
    safeFlow?.fusionVideoPrompt ??
      safeFlow?.fusionPrompt ??
      safeFlow?.videoPrompt ??
      safeFlow?.userPrompt ??
      safeFlow?.prompt ??
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
  const [previewVideoPrompt, setPreviewVideoPrompt] = useState<string>(normalizePromptText(initialVideoPrompt));

  const [resolvedFaceUrl, setResolvedFaceUrl] = useState<string | null>(null);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
  const [faceImageAttempt, setFaceImageAttempt] = useState<"primary" | "resolved">("primary");
  const [statusText, setStatusText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [finalPricingLabel, setFinalPricingLabel] = useState<string | null>(null);
  const [finalPricingState, setFinalPricingState] = useState<"estimated" | "committed" | "released">("estimated");
  const [showPricingBreakdown, setShowPricingBreakdown] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [enhancerOpen, setEnhancerOpen] = useState(false);
  const [enhancerLoading, setEnhancerLoading] = useState(false);
  const [enhancerError, setEnhancerError] = useState<string | null>(null);
  const [enhancerResult, setEnhancerResult] = useState<PromptEnhancerResult | null>(null);
  const [studioTips, setStudioTips] = useState<StudioCoachTip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);
  const [finalPricingMessage, setFinalPricingMessage] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [backgroundWatching, setBackgroundWatching] = useState(false);
  const [backgroundNotice, setBackgroundNotice] = useState<string | null>(null);
  const [jobs, setJobs] = useState<StudioJobItem[]>([]);
  const [lastStatusCheckAt, setLastStatusCheckAt] = useState<number | null>(null);
  const [statusRetryCount, setStatusRetryCount] = useState(0);
  const [latestFusionJobStatus, setLatestFusionJobStatus] = useState<any | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const isFocused = useIsFocused();

  const lastAuthSessionKeyRef = useRef<string | null>(null);
  const receiptRefreshInFlightRef = useRef(false);

  useEffect(() => {
    if (!isReady) return;

    const prevAuthSessionKey = lastAuthSessionKeyRef.current;
    if (prevAuthSessionKey === authSessionKey) {
      setCreatorFlowOwner?.(authUserId || undefined);
      return;
    }

    lastAuthSessionKeyRef.current = authSessionKey;
    setCreatorFlowOwner?.(authUserId || undefined);

    if (prevAuthSessionKey == null) return;

    resetCreatorFlow?.();
    setResolvedFaceUrl(null);
    setResolvedAudioUrl(null);
    setFaceImageAttempt("primary");
    setStatusText(null);
    setVideoUrl(null);
    setJobId(null);
    setFinalPricingLabel(null);
    setFinalPricingState("estimated");
    setFinalPricingMessage(null);
    setBackgroundWatching(false);
    setBackgroundNotice(null);
    setJobs([]);
    setLastStatusCheckAt(null);
    setStatusRetryCount(0);
    setLatestFusionJobStatus(null);
    setPreviewReady(false);
    setVideoPrompt("");
    setPreviewVideoPrompt("");
    setCinematicIntent("");

    void queryClient.removeQueries({
      predicate: (query: any) => {
        const key = JSON.stringify(query?.queryKey ?? "").toLowerCase();
        return (
          key.includes("pricing") ||
          key.includes("credit") ||
          key.includes("balance") ||
          key.includes("dashboard") ||
          key.includes("subscription") ||
          key.includes("plan") ||
          key.includes("fusion-pricing-estimate")
        );
      },
    });

    router.replace("/(tabs)/fusion" as any);
  }, [authSessionKey, authUserId, isReady, queryClient, resetCreatorFlow, setCreatorFlowOwner]);

  const refreshPricingCaches = useCallback(() => {
    const predicate = (query: any) => {
      const key = JSON.stringify(query?.queryKey ?? "").toLowerCase();
      return (
        key.includes("pricing") ||
        key.includes("credit") ||
        key.includes("balance") ||
        key.includes("dashboard") ||
        key.includes("subscription") ||
        key.includes("plan")
      );
    };

    void queryClient.invalidateQueries({ predicate });
    void queryClient.refetchQueries({ predicate, type: "active" as any });
  }, [queryClient]);

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

  const primaryImageUrl = cleanParam(paramImageUrl || storeImageUrl);
  const primaryAudioUrl = cleanParam(paramAudioUrl || storeAudioUrl);
  const fallbackFaceUrl = cleanParam(resolvedFaceUrl);
  const fallbackAudioUrl = cleanParam(resolvedAudioUrl);
  const imageUrl = cleanParam(
    faceImageAttempt === "resolved"
      ? fallbackFaceUrl || primaryImageUrl
      : primaryImageUrl || fallbackFaceUrl
  );
  const audioUrl = cleanParam(primaryAudioUrl || fallbackAudioUrl);
  const effectiveFaceArtifactId = paramFaceArtifactId || storeFaceArtifactId;
  const effectiveFaceMediaAssetId = paramFaceMediaAssetId || storeFaceMediaAssetId;
  const effectiveFaceProfileId = paramFaceProfileId || storeFaceProfileId;
  const effectiveAudioArtifactId = paramAudioArtifactId || storeAudioArtifactId;
  const effectiveAudioDurationSec = paramAudioDurationSec || storeAudioDurationSec || 0;
  const effectiveAudioDurationMs = paramAudioDurationMs || storeAudioDurationMs || 0;
  const effectiveScriptText = paramScriptText || storeAudioScriptText;
  const effectiveAudioLocale = paramAudioLocale || storeAudioLocale;
  const effectiveAudioVoice = paramAudioVoice || storeAudioVoice;

  const normalizedVideoPrompt = useMemo(() => normalizePromptText(videoPrompt), [videoPrompt]);
  const normalizedCinematicIntent = useMemo(() => normalizePromptText(cinematicIntent), [cinematicIntent]);
  const effectiveVideoPrompt = normalizedVideoPrompt;
  const pricingVideoPrompt = previewVideoPrompt;
  const promptPreview = useMemo(() => promptPreviewText(normalizedVideoPrompt, 180), [normalizedVideoPrompt]);
  const requestedDurationSec = useMemo(() => {
    if (effectiveAudioDurationSec > 0) return Math.ceil(effectiveAudioDurationSec);
    if (effectiveAudioDurationMs > 0) return Math.ceil(effectiveAudioDurationMs / 1000);
    return estimateSpeechDurationSec(effectiveScriptText || effectiveVideoPrompt);
  }, [effectiveAudioDurationSec, effectiveAudioDurationMs, effectiveScriptText, effectiveVideoPrompt]);
  const pricingRequestedDurationSec = useMemo(() => {
    if (effectiveAudioDurationSec > 0) return Math.ceil(effectiveAudioDurationSec);
    if (effectiveAudioDurationMs > 0) return Math.ceil(effectiveAudioDurationMs / 1000);
    return estimateSpeechDurationSec(effectiveScriptText || pricingVideoPrompt);
  }, [effectiveAudioDurationSec, effectiveAudioDurationMs, effectiveScriptText, pricingVideoPrompt]);
  const hasMeaningfulPrompt = effectiveVideoPrompt.length >= 12;
  const hasMeaningfulCinematicIntent = normalizedCinematicIntent.length >= 12;
  const isCinematic = videoMode === "CINEMATIC_VIDEO_DIRECTION";
  const videoProfile = profileForMode(videoMode);
  const hasFacePreview = !!imageUrl || !!effectiveFaceArtifactId;
  const hasFaceArtifact = !!effectiveFaceArtifactId;
  const hasUsableFaceInput = hasFaceArtifact;
  const hasAudio = !!audioUrl || !!effectiveAudioArtifactId;
  const missingFaceArtifact = !hasFaceArtifact;
  const locked = busy;

  const pricingDisplay = useResolvedPricingDisplay({ enabled: isReady && isAuthed });
  const pricingDisplayAny = pricingDisplay as any;
  const canonicalPricingTierCode = cleanParam(pricingDisplay.tierCode).toLowerCase();
  const canonicalPricingPlanCode = cleanParam(pricingDisplay.planCode).toLowerCase();
  const canonicalPricingPlanName = cleanParam(pricingDisplayAny.planName || pricingDisplayAny.plan_name || pricingDisplay.planCode || pricingDisplay.tierCode);
  const canonicalPricingPlanBlob = `${canonicalPricingTierCode} ${canonicalPricingPlanCode} ${canonicalPricingPlanName}`.toLowerCase();
  const canonicalPaidFusionAccess = /\b(pro|business|enterprise)\b/.test(canonicalPricingPlanBlob);
  const pricingAccountFingerprint = [
    canonicalPricingTierCode || "tier_unknown",
    canonicalPricingPlanCode || canonicalPricingPlanName || "plan_unknown",
    pricingDisplay.availableCredits ?? "available_unknown",
    pricingDisplay.reservedCredits ?? "reserved_unknown",
    pricingDisplay.usedCredits ?? "used_unknown",
    pricingDisplay.totalCredits ?? "total_unknown",
    pricingDisplayAny.creditBreakdownLabel ?? "breakdown_unknown",
  ].join("|");

  useEffect(() => {
    setFaceImageAttempt("primary");
  }, [primaryImageUrl, fallbackFaceUrl]);

  useEffect(() => {
    if (!CINEMATIC_VIDEO_COMING_SOON) return;
    if (requestedInitialVideoMode !== "CINEMATIC_VIDEO_DIRECTION") return;
    setStatusText("Cinematic Video is coming soon. Talking Video Economy is included now, and Talking Video Premium is available as Beta Release.");
  }, [requestedInitialVideoMode]);

  useEffect(() => {
    if (setFaceSelection && !storeImageUrl && (paramImageUrl || effectiveFaceArtifactId)) {
      setFaceSelection({
        sasUrl: cleanParam(paramImageUrl) || undefined,
        imageUrl: cleanParam(paramImageUrl) || undefined,
        image_url: cleanParam(paramImageUrl) || undefined,
        face_image_url: cleanParam(paramImageUrl) || undefined,
        face_sas_url: cleanParam(paramImageUrl) || undefined,
        artifactId: effectiveFaceArtifactId || undefined,
        faceArtifactId: effectiveFaceArtifactId || undefined,
        artifact_id: effectiveFaceArtifactId || undefined,
        face_artifact_id: effectiveFaceArtifactId || undefined,
        mediaAssetId: effectiveFaceMediaAssetId || undefined,
        faceMediaAssetId: effectiveFaceMediaAssetId || undefined,
        media_asset_id: effectiveFaceMediaAssetId || undefined,
        face_media_asset_id: effectiveFaceMediaAssetId || undefined,
        faceProfileId: effectiveFaceProfileId || undefined,
        face_profile_id: effectiveFaceProfileId || undefined,
        gender: faceGender || undefined,
        ownerUserId: authUserId || undefined,
        owner_user_id: authUserId || undefined,
        userId: authUserId || undefined,
        user_id: authUserId || undefined,
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
        ownerUserId: authUserId || undefined,
        owner_user_id: authUserId || undefined,
        userId: authUserId || undefined,
        user_id: authUserId || undefined,
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
    const timer = setTimeout(() => {
      setPreviewVideoPrompt(normalizePromptText(videoPrompt));
    }, 280);

    return () => clearTimeout(timer);
  }, [videoPrompt]);

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
    if (setFusionPrompt) setFusionPrompt(pricingVideoPrompt);
  }, [pricingVideoPrompt, setFusionPrompt]);

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
      fusionOutputProfile: cinematicOutputProfile,
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
    cinematicOutputProfile,
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
      face_image_url: imageUrl || undefined,
      face_sas_url: imageUrl || undefined,
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
      video_prompt: pricingVideoPrompt || undefined,
      output_profile: isCinematic ? cinematicOutputProfile : (talkingBackgroundMode === "movement_based" ? "premium" : "economy"),
      aspect_ratio: aspectRatio,
      ...(faceGender ? ({ gender: faceGender } as any) : {}),
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
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
    pricingVideoPrompt,
    cinematicOutputProfile,
    isCinematic,
    aspectRatio,
    faceGender,
  ]);

  useEffect(() => {
    if (!isReady || !isAuthed || !hasUsableFaceInput || !hasAudio || !hasMeaningfulPrompt) return;
    if (isCinematic && !hasMeaningfulCinematicIntent) return;

    const task = InteractionManager.runAfterInteractions(() => setPreviewReady(true));
    return () => {
      task?.cancel?.();
      setPreviewReady(false);
    };
  }, [
    isReady,
    isAuthed,
    hasUsableFaceInput,
    hasAudio,
    hasMeaningfulPrompt,
    isCinematic,
    hasMeaningfulCinematicIntent,
  ]);

  const previewPayload = useMemo<FusionCreateRequest>(() => {
    const promptText = effectiveVideoPrompt || undefined;
    const safeRequestedDurationSec = Math.max(1, Math.ceil(requestedDurationSec || 0));
    const safeRequestedUnits = Math.max(1, Math.ceil(safeRequestedDurationSec / 60));

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
    const outputProfile = isCinematic ? cinematicOutputProfile : (talkingBackgroundMode === "movement_based" ? "premium" : "economy");
    const qualityTier = isCinematic
      ? (cinematicOutputProfile === "fast" ? "fast" : "premium")
      : (talkingBackgroundMode === "movement_based" ? "premium" : "economy");
    const talkingProvider = talkingBackgroundMode === "movement_based" ? "kling" : "veed_fabric";
    const providerHint = !isCinematic ? talkingProvider : undefined;
    const scenarioName = isCinematic
      ? (cinematicOutputProfile === "fast" ? "cinematic_fast" : "cinematic_premium")
      : (talkingBackgroundMode === "movement_based" ? "talking_video_premium" : "talking_video_economy");
    const goalText = isCinematic ? normalizedCinematicIntent || promptText : promptText;
    const titleText = isCinematic
      ? `Fusion Studio • ${cinematicOutputProfileLabel(cinematicOutputProfile)}`
      : `Fusion Studio • ${talkingVideoDisplayLabel()}`;

    return {
      consent: { external_provider_ok: true },
      face_artifact_id: effectiveFaceArtifactId || undefined,
      face_image_url: imageUrl || undefined,
      image_url: imageUrl || undefined,

      voice_mode: "audio",
      voice_audio: {
        type: "audio",
        audio_artifact_id: effectiveAudioArtifactId || undefined,
        audio_url: audioUrl || undefined,
      },
      audio_artifact_id: effectiveAudioArtifactId || undefined,
      audio_url: audioUrl || undefined,
      provider: !isCinematic ? talkingProvider : undefined,
      provider_hint: providerHint,
      quality_tier: qualityTier,
      scenario_name: scenarioName,

      video_mode: videoMode,
      generation_mode: videoMode,
      product_code: videoMode,
      profile: videoProfile,
      profile_code: videoProfile,
      output_profile: outputProfile,
      title: titleText,
      goal: goalText,
      requested_duration_sec: safeRequestedDurationSec,
      pricing_duration_sec: safeRequestedDurationSec,
      video_duration_sec: safeRequestedDurationSec,
      minutes: safeRequestedUnits,
      requested_units: safeRequestedUnits,

      ...promptAliases,
      ...(!hasAudio
        ? {
            script_text: effectiveScriptText || undefined,
            audio_locale: effectiveAudioLocale || undefined,
            audio_voice: effectiveAudioVoice || undefined,
          }
        : {}),
      ...cinematicFields,

      background_mode: !isCinematic ? talkingBackgroundMode : "movement_based",
      intent: {
        goal: goalText,
        duration_sec: safeRequestedDurationSec,
      },
      video_type: isCinematic ? cinematicVideoType : undefined,

      video: {
        ...buildVideoSettings(
          aspectRatio,
          safeRequestedDurationSec || undefined,
          effectiveAudioDurationMs || undefined
        ),
        requested_duration_sec: safeRequestedDurationSec,
        pricing_duration_sec: safeRequestedDurationSec,
        video_duration_sec: safeRequestedDurationSec,
        profile: videoProfile,
        video_mode: videoMode,
        ...cinematicFields,
      },

      tags: {
        source: "fusion_studio",
        client_surface: "fusion_studio",
        api_mode: isCinematic ? "directed" : "legacy",
        face_gender: faceGender || undefined,
        face_artifact_id: effectiveFaceArtifactId || undefined,
        selected_face_artifact_id: effectiveFaceArtifactId || undefined,
        fusion_face_artifact_id: effectiveFaceArtifactId || undefined,
        storytelling_mode: !isCinematic,
        cinematic_mode: isCinematic,
        video_mode: videoMode,
        product_code: videoMode,
        profile: videoProfile,
        profile_code: videoProfile,
        requested_longform_profile: videoProfile,
        output_profile: outputProfile,
        quality_tier: qualityTier,
        provider_hint: providerHint,
        scenario_name: scenarioName,
        background_mode: !isCinematic ? talkingBackgroundMode : "movement_based",
        intent: isCinematic ? normalizedCinematicIntent : goalText,
        video_type: isCinematic ? cinematicVideoType : undefined,
        prompt_preview: promptText ? promptText.slice(0, 160) : undefined,
        ...(!hasAudio
          ? {
              script_text: effectiveScriptText || undefined,
              audio_locale: effectiveAudioLocale || undefined,
              audio_voice: effectiveAudioVoice || undefined,
            }
          : {}),
        minutes: safeRequestedUnits,
        requested_units: safeRequestedUnits,
        duration_sec: safeRequestedDurationSec,
        requested_duration_sec: safeRequestedDurationSec,
        pricing_duration_sec: safeRequestedDurationSec,
        video_duration_sec: safeRequestedDurationSec,
        ...(effectiveAudioDurationMs > 0 ? { duration_ms: Math.ceil(effectiveAudioDurationMs) } : {}),
        ...cinematicFields,
      },
    };
  }, [
    effectiveFaceArtifactId,
    imageUrl,
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
    effectiveVideoPrompt,
    talkingBackgroundMode,
    normalizedCinematicIntent,
    cinematicVideoType,
    cinematicOutputProfile,
    cameraAngle,
    cameraFraming,
    cameraMotionStyle,
    requestedDurationSec,
  ]);

  const pricingPreviewPayload = useMemo<FusionCreateRequest>(() => {
    const promptText = pricingVideoPrompt || undefined;
    const safeRequestedDurationSec = Math.max(1, Math.ceil(pricingRequestedDurationSec || 0));
    const safeRequestedUnits = Math.max(1, Math.ceil(safeRequestedDurationSec / 60));

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

    const outputProfile = isCinematic ? cinematicOutputProfile : (talkingBackgroundMode === "movement_based" ? "premium" : "economy");
    const qualityTier = isCinematic
      ? (cinematicOutputProfile === "fast" ? "fast" : "premium")
      : (talkingBackgroundMode === "movement_based" ? "premium" : "economy");
    const talkingProvider = talkingBackgroundMode === "movement_based" ? "kling" : "veed_fabric";
    const providerHint = !isCinematic ? talkingProvider : undefined;
    const scenarioName = isCinematic
      ? (cinematicOutputProfile === "fast" ? "cinematic_fast" : "cinematic_premium")
      : (talkingBackgroundMode === "movement_based" ? "talking_video_premium" : "talking_video_economy");
    const goalText = isCinematic ? normalizedCinematicIntent || promptText : promptText;
    const titleText = isCinematic
      ? `Fusion Studio • ${cinematicOutputProfileLabel(cinematicOutputProfile)}`
      : `Fusion Studio • ${talkingVideoDisplayLabel()}`;

    return {
      ...previewPayload,
      provider: !isCinematic ? talkingProvider : undefined,
      provider_hint: providerHint,
      quality_tier: qualityTier,
      scenario_name: scenarioName,
      output_profile: outputProfile,
      title: titleText,
      goal: goalText,
      requested_duration_sec: safeRequestedDurationSec,
      pricing_duration_sec: safeRequestedDurationSec,
      video_duration_sec: safeRequestedDurationSec,
      minutes: safeRequestedUnits,
      requested_units: safeRequestedUnits,
      ...promptAliases,
      intent: {
        goal: goalText,
        duration_sec: safeRequestedDurationSec,
      },
      video: {
        ...(previewPayload.video as any),
        requested_duration_sec: safeRequestedDurationSec,
        pricing_duration_sec: safeRequestedDurationSec,
        video_duration_sec: safeRequestedDurationSec,
      },
      tags: {
        ...(previewPayload.tags as any),
        quality_tier: qualityTier,
        provider_hint: providerHint,
        scenario_name: scenarioName,
        output_profile: outputProfile,
        intent: isCinematic ? normalizedCinematicIntent : goalText,
        prompt_preview: promptText ? promptText.slice(0, 160) : undefined,
        minutes: safeRequestedUnits,
        requested_units: safeRequestedUnits,
      },
    } as FusionCreateRequest;
  }, [
    previewPayload,
    pricingVideoPrompt,
    pricingRequestedDurationSec,
    isCinematic,
    cinematicOutputProfile,
    talkingBackgroundMode,
    normalizedCinematicIntent,
  ]);

  const pricingQ = useQuery<EstimateResult>({
    queryKey: [
      "fusion-pricing-estimate",
      authSessionKey,
      pricingAccountFingerprint,
      canonicalPricingTierCode,
      canonicalPricingPlanCode,
      effectiveFaceArtifactId,
      imageUrl,
      audioUrl,
      effectiveAudioArtifactId,
      aspectRatio,
      videoMode,
      talkingBackgroundMode,
      normalizedCinematicIntent,
      cinematicVideoType,
      cinematicOutputProfile,
      cameraAngle,
      cameraFraming,
      cameraMotionStyle,
      pricingRequestedDurationSec,
      effectiveAudioDurationSec,
      effectiveAudioDurationMs,
      effectiveScriptText,
      pricingVideoPrompt,
      effectiveAudioLocale,
      effectiveAudioVoice,
    ],
    enabled:
      previewReady &&
      isReady &&
      isAuthed &&
      hasFaceArtifact &&
      hasAudio &&
      hasMeaningfulPrompt &&
      (!isCinematic || hasMeaningfulCinematicIntent),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    retry: 0,
    queryFn: async () => {
      try {
        logFusionStudioFlow("pricingPreview.request", pricingPreviewPayload);
      const raw = await previewFusionPricing(pricingPreviewPayload);
      logFusionStudioFlow("pricingPreview.response", raw);
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

        const creditUnits =
          asEstimateNumber(raw?.estimated_credits) ??
          asEstimateNumber(raw?.credits_used) ??
          asEstimateNumber(raw?.estimated_units) ??
          asEstimateNumber(raw?.units) ??
          (videoMode === "CINEMATIC_VIDEO_DIRECTION" ? 4 : 2);
        const creditEstimateLabel = `${Math.max(0, Math.round(creditUnits))} credit${Math.max(0, Math.round(creditUnits)) === 1 ? "" : "s"}`;

        const moneyAmount =
          asEstimateNumber(raw?.estimated_amount) ??
          asEstimateNumber(raw?.amount) ??
          asEstimateNumber(raw?.pricing?.estimated_amount) ??
          asEstimateNumber(raw?.pricing?.amount) ??
          0;
        const moneyCurrency = cleanParam(raw?.currency) || cleanParam(raw?.pricing?.currency) || "USD";
        const moneyEstimateLabel = formatMoney(moneyAmount, moneyCurrency);

        const settlementMode = cleanParam(pricing?.settlementMode).toLowerCase();
        const useMoneyPrimary = settlementMode === "postpaid";
        const primaryEstimateLabel = useMoneyPrimary ? moneyEstimateLabel : creditEstimateLabel;
        const secondaryEstimateLabel = useMoneyPrimary ? creditEstimateLabel : moneyEstimateLabel;
        const planLabel =
          canonicalPricingPlanName ||
          pricing?.tierCode ||
          "Current plan";
        const isEnterprisePlan =
          pricingDisplay.isEnterprisePlan ||
          String(planLabel).toLowerCase().includes("enterprise") ||
          canonicalPricingTierCode === "enterprise";
        const blockingReason = cleanParam(
          raw?.quote_breakdown?.blocking_reason ||
          raw?.summary?.blocking_reason ||
          raw?.pricing_summary?.blocking_reason ||
          raw?.pricing?.entitlement_reason ||
          raw?.entitlement_reason
        );
        const rawFeatureBlocked =
          blockingReason === "ENTITLEMENT_BLOCKED_FEATURE_FLAG" ||
          cleanParam(raw?.summary?.cta_intent).toLowerCase() === "upgrade";
        const stalePaidPlanFeatureBlock =
          rawFeatureBlocked &&
          canonicalPaidFusionAccess &&
          videoMode === "TALKING_VIDEO";
        const featureBlocked = rawFeatureBlocked && !stalePaidPlanFeatureBlock;
        if (stalePaidPlanFeatureBlock) {
          logFusionStudioFlow("pricingPreview.ignoredStaleFeatureBlock", {
            blockingReason,
            canonicalPricingTierCode,
            canonicalPricingPlanCode,
            canonicalPricingPlanName,
          });
        }
        const affordability = computeAffordabilityDecision({
          preview: raw,
          hasRequiredInputs: hasUsableFaceInput && hasAudio && hasMeaningfulPrompt,
          studioTitle: "Video",
          canTopUp: !isEnterprisePlan && !useMoneyPrimary,
          canUpgrade: true,
          isEnterprise: isEnterprisePlan,
        });
        const insufficientBalance = !featureBlocked && Boolean(
          raw?.insufficient_balance === true ||
            raw?.insufficientBalance === true ||
            affordability.insufficientBalance
        );
        const noteLabel = featureBlocked
          ? "Upgrade your plan to use this video feature."
          : chooseFusionSettlementLabel(pricing, insufficientBalance);

        return {
          preview: false,
          estimateLabel: primaryEstimateLabel,
          primaryEstimateLabel,
          secondaryEstimateLabel,
          creditEstimateLabel,
          moneyEstimateLabel,
          noteLabel,
          detailLabel: `${hasFaceArtifact ? "face artifact ready" : "missing face artifact"} • ${hasAudio ? "audio ready" : "missing audio"} • ${modeActionLabel(videoMode, cinematicOutputProfile)}`,
          settlementLabel: noteLabel,
          planLabel,
          availableLabel:
            featureBlocked
              ? "Upgrade required for this feature"
              : insufficientBalance
                ? "Not enough credits for this run"
                : settlementMode === "postpaid"
                  ? "Billed after completion"
                  : pricing?.settlementMode === "included"
                    ? "Covered by plan"
                    : "Credits available",
          holdLabel:
            pricing?.stage === "reserved"
              ? pricingSummary?.message || "Credits reserved"
              : settlementMode === "postpaid"
                ? "No credit hold"
                : undefined,
          ctaLabel: featureBlocked
            ? "Upgrade plan"
            : insufficientBalance
              ? (affordability.ctaLabel || "Top up credits")
              : `Generate ${modeActionLabel(videoMode, cinematicOutputProfile)} — ${primaryEstimateLabel}`,
          insufficientBalance,
          topUpVisible: insufficientBalance && !useMoneyPrimary,
          upgradeVisible: featureBlocked || (insufficientBalance && !useMoneyPrimary),
          entitlementReason: featureBlocked ? (blockingReason || "ENTITLEMENT_BLOCKED_FEATURE_FLAG") : undefined,
          raw,
          pricing,
          pricingSummary,
        };
      } catch {
        return fallbackEstimate({ hasFaceArtifact, hasAudio, videoMode });
      }
    },
  });

  useEffect(() => {
    if (!isFocused || !isReady || !isAuthed) return;
    if (!pricingAccountFingerprint) return;
    void queryClient.invalidateQueries({ queryKey: ["fusion-pricing-estimate"], exact: false });
    if (
      previewReady &&
      hasFaceArtifact &&
      hasAudio &&
      hasMeaningfulPrompt &&
      (!isCinematic || hasMeaningfulCinematicIntent)
    ) {
      void pricingQ.refetch?.();
    }
  }, [
    pricingAccountFingerprint,
    isFocused,
    isReady,
    isAuthed,
    queryClient,
    previewReady,
    hasFaceArtifact,
    hasAudio,
    hasMeaningfulPrompt,
    isCinematic,
    hasMeaningfulCinematicIntent,
  ]);

  const pricing = pricingQ.data;
  const displayedPrimaryEstimate = pricing?.primaryEstimateLabel ?? pricing?.estimateLabel ?? "Estimate pending";
  const isPostpaidPricing =
    ((() => {
      const settlementMode = cleanParam(pricing?.pricing?.settlementMode ?? pricing?.settlementMode).toLowerCase();
      const settlement = cleanParam(pricing?.settlementLabel ?? pricing?.noteLabel).toLowerCase();
      const availability = cleanParam(pricing?.availableLabel).toLowerCase();
      return (
        settlementMode === "postpaid" ||
        settlement.includes("billed after completion") ||
        settlement.includes("enterprise invoicing") ||
        settlement.includes("postpaid") ||
        availability.includes("billed after completion")
      );
    })());
  const displayedSecondaryEstimate = undefined;
  const displayedCreditEstimate = isPostpaidPricing ? null : (pricing?.creditEstimateLabel ?? null);
  const displayedCashEstimate = isPostpaidPricing
    ? (cleanParam(finalPricingLabel) || pricing?.moneyEstimateLabel || null)
    : null;
  const visiblePrimaryEstimate = isPostpaidPricing
    ? displayedCashEstimate || displayedPrimaryEstimate
    : displayedCreditEstimate || displayedPrimaryEstimate;
  const displayedNoteLabel = pricing?.noteLabel ?? pricing?.settlementLabel ?? (isPostpaidPricing
    ? "Billed after completion through your postpaid account."
    : "Covered by your available credits.");

  const runReceiptViews = useMemo(
    () => buildFusionRunReceiptViews(latestFusionJobStatus, pricing),
    [latestFusionJobStatus, pricing]
  );
  const runReceiptStage = (runReceiptViews.pricing?.stage ?? finalPricingState) as any;

  useEffect(() => {
    if (!isFocused || !jobId || !videoUrl) return;
    if (hasCommittedLedgerReceipt(runReceiptViews.pricing)) return;
    if (receiptRefreshInFlightRef.current) return;

    let cancelled = false;
    receiptRefreshInFlightRef.current = true;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const refreshFinalReceipt = async () => {
      try {
        for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
          const latest = await apiGetFusionJobStatus(jobId, videoMode);
          if (cancelled) return;

          setLatestFusionJobStatus(latest);
          const latestUrl = extractVideoUrl(latest);
          if (latestUrl && !videoUrl) setVideoUrl(latestUrl);
          setFinalPricingLabel(pickPricingLabel(latest) ?? null);
          setFinalPricingState(fusionReceiptLifecycleState(latest) as any);
          setFinalPricingMessage(pickFinalPricingMessage(latest));

          const picked = pickPricingContainer(latest);
          const normalized = normalizePricing(
            { ...(picked.pricing ?? {}), ...(picked.pricingSummary ?? {}) },
            { ...(picked.pricingSummary ?? {}), ...(picked.pricing ?? {}) }
          );
          if (hasCommittedLedgerReceipt(normalized)) break;

          await sleep(attempt < 2 ? 900 : 1500);
        }
      } catch {
        // Best-effort only. The next focus/status refresh will try again.
      } finally {
        if (!cancelled) receiptRefreshInFlightRef.current = false;
      }
    };

    void refreshFinalReceipt();

    return () => {
      cancelled = true;
      receiptRefreshInFlightRef.current = false;
    };
  }, [
    isFocused,
    jobId,
    videoUrl,
    videoMode,
    runReceiptStage,
    runReceiptViews.pricing?.ledgerEntryId,
    runReceiptViews.pricing?.state,
  ]);

  const fusionEnhancerLockedFields = useMemo(() => ({
    video_mode: videoMode,
    video_mode_label: modeTitle(videoMode),
    aspect_ratio: aspectRatio,
    background_mode: talkingBackgroundMode,
    camera_angle_label: cameraAngle.replace(/_/g, " "),
    camera_framing_label: cameraFraming.replace(/_/g, " "),
    camera_motion_style_label: cameraMotionStyle.replace(/_/g, " "),
    cinematic_intent: normalizedCinematicIntent,
  }), [videoMode, aspectRatio, talkingBackgroundMode, cameraAngle, cameraFraming, cameraMotionStyle, normalizedCinematicIntent]);

  const refreshStudioTips = useCallback(async () => {
    setTipsLoading(true);
    setTipsError(null);
    try {
      setStudioTips(
        buildLocalFusionTips({
          videoMode,
          prompt: effectiveVideoPrompt,
          aspectRatio,
          hasFaceArtifact,
          hasUsableFaceInput,
          hasAudio,
          cinematicIntent: normalizedCinematicIntent,
          backgroundMode: talkingBackgroundMode,
          planLabel: pricing?.planLabel ?? null,
        })
      );
    } catch {
      setTipsError(null);
    } finally {
      setTipsLoading(false);
    }
  }, [videoMode, effectiveVideoPrompt, aspectRatio, hasFaceArtifact, hasAudio, normalizedCinematicIntent, talkingBackgroundMode, pricing?.planLabel]);

  const requestPromptEnhancement = useCallback(async () => {
    if (!effectiveVideoPrompt) {
      setStatusText("Add a video direction prompt first, then tap Enhance.");
      return;
    }
    setEnhancerOpen(true);
    setEnhancerLoading(true);
    setEnhancerError(null);
    try {
      setEnhancerResult(buildLocalFusionEnhancement(effectiveVideoPrompt, fusionEnhancerLockedFields));
    } catch {
      setEnhancerError("Prompt enhancement is unavailable right now.");
    } finally {
      setEnhancerLoading(false);
    }
  }, [effectiveVideoPrompt, fusionEnhancerLockedFields]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshStudioTips();
    }, 350);
    return () => clearTimeout(timer);
  }, [refreshStudioTips]);


useEffect(() => {
  if (!isFocused) return;
  if (
    previewReady &&
    isReady &&
    isAuthed &&
    hasUsableFaceInput &&
    hasAudio &&
    hasMeaningfulPrompt &&
    (!isCinematic || hasMeaningfulCinematicIntent)
  ) {
    pricingQ.refetch?.();
  }
  if (jobId && !videoUrl) {
    setBackgroundWatching(true);
  }
}, [isFocused, previewReady, isReady, isAuthed, hasUsableFaceInput, hasAudio, hasMeaningfulPrompt, isCinematic, hasMeaningfulCinematicIntent, jobId, videoUrl, pricingAccountFingerprint]);


  const canPrimaryAction =
    hasFaceArtifact &&
    hasAudio &&
    !busy &&
    hasMeaningfulPrompt &&
    (!isCinematic || hasMeaningfulCinematicIntent);

  const canGenerate = canPrimaryAction && !pricing?.insufficientBalance && !pricing?.upgradeVisible;

  useEffect(() => {
    logFusionStudioFlow("snapshot", {
      authUserId,
      params: {
        face_image_url: cleanParam((params as any).face_image_url),
        face_sas_url: cleanParam((params as any).face_sas_url),
        image_url: cleanParam((params as any).image_url),
        face_artifact_id: cleanParam((params as any).face_artifact_id),
        selected_face_artifact_id: cleanParam((params as any).selected_face_artifact_id),
        fusion_face_artifact_id: cleanParam((params as any).fusion_face_artifact_id),
        face_media_asset_id: cleanParam((params as any).face_media_asset_id),
        face_profile_id: cleanParam((params as any).face_profile_id),
        audio_artifact_id: cleanParam((params as any).audio_artifact_id),
        artifact_id: cleanParam((params as any).artifact_id),
        audio_url: cleanParam((params as any).audio_url),
        audio_sas_url: cleanParam((params as any).audio_sas_url),
        script_text: cleanParam((params as any).script_text),
        audio_script_text: cleanParam((params as any).audio_script_text),
      },
      storeFace,
      storeAudio,
      derived: {
        paramImageUrl,
        storeImageUrl,
        imageUrl,
        paramFaceArtifactId,
        storeFaceArtifactId,
        effectiveFaceArtifactId,
        effectiveFaceMediaAssetId,
        effectiveFaceProfileId,
        paramAudioUrl,
        storeAudioUrl,
        audioUrl,
        paramAudioArtifactId,
        storeAudioArtifactId,
        effectiveAudioArtifactId,
        effectiveScriptText,
        normalizedVideoPrompt,
      },
      hasFacePreview,
      hasFaceArtifact,
      hasAudio,
      canGenerate,
    });
  }, [authUserId, params, storeFace, storeAudio, paramImageUrl, storeImageUrl, imageUrl, paramFaceArtifactId, storeFaceArtifactId, effectiveFaceArtifactId, effectiveFaceMediaAssetId, effectiveFaceProfileId, paramAudioUrl, storeAudioUrl, audioUrl, paramAudioArtifactId, storeAudioArtifactId, effectiveAudioArtifactId, effectiveScriptText, normalizedVideoPrompt, hasFacePreview, hasFaceArtifact, hasAudio, canGenerate]);

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

  const openTopUpScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "top_up",
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
    setLatestFusionJobStatus(resp);
    const v = extractVideoUrl(resp);
    if (!v) {
      setStatusText("The render finished, but the video file is not ready yet. We’ll keep checking.");
      setBackgroundWatching(true);
      return;
    }
    setVideoUrl(v);
    setFinalPricingLabel(pickPricingLabel(resp) ?? null);
    setFinalPricingState(fusionReceiptLifecycleState(resp) as any);
    setFinalPricingMessage(pickFinalPricingMessage(resp));
    refreshPricingCaches();
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
  }, [animateTo, jobId, updateJob, refreshPricingCaches]);

  const generate = useCallback(async () => {
    if (!hasUsableFaceInput || !hasAudio || busy) return;

    if (!hasFaceArtifact) {
      setStatusText(
        "This face preview does not include a saved Face Studio artifact. Re-open Fusion from a saved Face result or select a library face that carries face_artifact_id."
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

    if (pricing?.upgradeVisible && String(pricing?.entitlementReason || "").includes("ENTITLEMENT_BLOCKED_FEATURE_FLAG")) {
      setStatusText("Upgrade your plan to use this video feature.");
      openUpgradeScreen();
      return;
    }

    if (pricing?.insufficientBalance) {
      if (pricing?.topUpVisible) {
        setStatusText("You do not have enough credits for this video. Use Top Up to continue.");
        openTopUpScreen();
        return;
      }
      if (pricing?.upgradeVisible) {
        setStatusText("You do not have enough credits for this video. Upgrade your plan to continue.");
        openUpgradeScreen();
        return;
      }
      setStatusText("You do not have enough credits for this video.");
      return;
    }

    setBusy(true);
    resetProgress(0);
    setVideoUrl(null);
    setResolvedFaceUrl(null);
    setResolvedAudioUrl(null);
    setJobId(null);
    setLatestFusionJobStatus(null);
    setBackgroundWatching(false);
    setFinalPricingLabel(null);
    setFinalPricingState("estimated");
    setFinalPricingMessage(null);
    setLastStatusCheckAt(null);
    setStatusRetryCount(0);
    setStatusText(`Submitting ${modeActionLabel(videoMode, cinematicOutputProfile)}…`);
    animateTo(0.12, 450);

    try {
      logFusionStudioFlow("generate.before_apiCreateFusionJob", { previewPayload, pricingConfirmation: pricing?.raw?.quote_id && pricing?.raw?.preview_fingerprint ? { quote_id: pricing.raw.quote_id, preview_fingerprint: pricing.raw.preview_fingerprint } : undefined });
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
      logFusionStudioFlow("generate.apiCreateFusionJob.response", created);
      const id = String((created as any)?.job_id || (created as any)?.id || "");
      if (!id) throw new Error("Fusion create returned no job.");
      if (!mountedRef.current) return;

      setJobId(id);
      setLatestFusionJobStatus(created);
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
        `Your ${modeActionLabel(videoMode, cinematicOutputProfile).toLowerCase()} job has started. It will keep running in the background while you continue using the app.`
      );
      animateTo(0.2, 500);
    } catch (e: any) {
      if (!mountedRef.current) return;
      if (e?.status === 401 || e?.code === "UNAUTHORIZED" || e?.message === "UNAUTHORIZED") {
        router.replace("/(auth)/login");
        return;
      }
      setStatusText(normalizePricingErrorForUser(e, "Video"));
      resetProgress(0);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [
    hasUsableFaceInput,
    hasAudio,
    busy,
    hasMeaningfulPrompt,
    isCinematic,
    hasMeaningfulCinematicIntent,
    previewPayload,
    animateTo,
    pricing?.raw,
    pricing?.estimateLabel,
    pricing?.insufficientBalance,
    pricing?.topUpVisible,
    pricing?.upgradeVisible,
    resetProgress,
    openTopUpScreen,
    openUpgradeScreen,
    videoMode,
    cinematicOutputProfile,
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
          const last = await apiGetFusionJobStatus(jobId, videoMode);
          if (cancelled) return;

          setLatestFusionJobStatus(last);
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
          if (!primaryImageUrl && rf) setResolvedFaceUrl(rf);
          if (!primaryAudioUrl && ra) setResolvedAudioUrl(ra);

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
            setFinalPricingState(fusionReceiptLifecycleState(last) as any);
            setFinalPricingMessage(pickFinalPricingMessage(last));
            refreshPricingCaches();
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
  }, [backgroundWatching, jobId, videoUrl, finishSucceededJob, animateTo, resetProgress, updateJob, videoMode, primaryImageUrl, primaryAudioUrl]);

  useEffect(() => {
    if (!isFocused || !jobId || backgroundWatching) return;

    let cancelled = false;

    const refreshLatestJobStatus = async () => {
      try {
        const last = await apiGetFusionJobStatus(jobId, videoMode);
        if (cancelled) return;

        setLatestFusionJobStatus(last);
        const latestVideoUrl = extractVideoUrl(last);
        if (latestVideoUrl && !videoUrl) {
          setVideoUrl(latestVideoUrl);
        }
        setFinalPricingLabel(pickPricingLabel(last) ?? null);
        setFinalPricingState(fusionReceiptLifecycleState(last) as any);
        setFinalPricingMessage(pickFinalPricingMessage(last));
      } catch {
        // Best-effort refresh only; do not disturb the already-rendered output screen.
      }
    };

    void refreshLatestJobStatus();

    return () => {
      cancelled = true;
    };
  }, [isFocused, jobId, backgroundWatching, videoMode, videoUrl]);

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

  const onShare = useCallback(async () => {
    if (!videoUrl) return;
    try {
      await shareUrl(videoUrl, { title: `DesiFaces • ${modeShortTitle(videoMode)}`, message: "Generated video" });
    } catch {
      await openLink(videoUrl);
    }
  }, [videoUrl, openLink, videoMode]);


  const handlePrimaryAction = useCallback(() => {
    if (pricing?.upgradeVisible && String(pricing?.entitlementReason || "").includes("ENTITLEMENT_BLOCKED_FEATURE_FLAG")) {
      setStatusText("Upgrade your plan to use this video feature.");
      openUpgradeScreen();
      return;
    }

    if (pricing?.insufficientBalance) {
      if (pricing?.topUpVisible) {
        setStatusText("You do not have enough credits for this video. Use Top Up to continue.");
        openTopUpScreen();
        return;
      }
      if (pricing?.upgradeVisible) {
        setStatusText("You do not have enough credits for this video. Upgrade your plan to continue.");
        openUpgradeScreen();
        return;
      }
      setStatusText("You do not have enough credits for this video.");
      return;
    }

    void generate();
  }, [
    generate,
    openTopUpScreen,
    openUpgradeScreen,
    pricing?.entitlementReason,
    pricing?.upgradeVisible,
    pricing?.insufficientBalance,
    pricing?.topUpVisible,
  ]);

  const promptRequiredMessage =
    !hasMeaningfulPrompt
      ? `Enter a specific video direction prompt. ${modeShortTitle(videoMode)} sends this to the backend together with your Audio Studio audio to guide the final video.`
      : !normalizedVideoPrompt && effectiveScriptText
        ? `Using your Audio Studio script as the starting video prompt. Edit it here if you want stronger direction for performance, gesture, or scene energy.`
        : null;

  const cinematicIntentRequiredMessage =
    isCinematic && !hasMeaningfulCinematicIntent
      ? "Describe the purpose and expected outcome of the cinematic video."
      : null;

  const faceArtifactRequiredMessage =
    hasFacePreview && !hasFaceArtifact
      ? "A saved Face Studio artifact is required before Fusion can generate the final video. Re-open Fusion from a saved Face result or select a library face that includes face_artifact_id."
      : null;

  const previewPendingMessage =
    hasMeaningfulPrompt &&
    hasUsableFaceInput &&
    hasAudio &&
    !pricingQ.isFetching &&
    !busy &&
    !pricing
      ? "Pricing preview is temporarily unavailable right now. You can still create the video, and the final pricing summary will appear after completion."
      : pricing && pricing.preview
        ? `Estimate shown: ${displayedPrimaryEstimate}. Final pricing confirmation will appear after completion.`
        : null;


const livePlanLabel =
  canonicalPricingPlanName ||
  pricing?.planLabel ||
  undefined;
const liveCreditBreakdownLabel =
  pricingDisplayAny.creditDetailLabel ||
  pricingDisplayAny.creditBreakdownLabel ||
  undefined;
const liveUsageLabel =
  liveCreditBreakdownLabel ||
  pricingDisplay.usageLabel ||
  pricingDisplay.availableOutOfTotalLabel ||
  pricingDisplay.readableAvailableLabel ||
  pricing?.availableLabel ||
  undefined;
const liveAvailableLabel =
  pricingDisplay.availableOutOfTotalLabel ||
  pricingDisplay.readableAvailableLabel ||
  pricing?.availableLabel ||
  undefined;
const liveBillingValueLabel =
  pricingDisplay.billingValue ? `${pricingDisplay.billingValue} billing` : null;

  const openHamburgerMenu = useCallback(() => {
    const menuNonce = `${Date.now()}`;
    router.push({
      pathname: "/(tabs)/dashboard" as any,
      params: {
        openMenu: "1",
        menu_nonce: menuNonce,
        menu_source: "fusion",
      } as any,
    } as any);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: DF.night }}>
      <DFHeader
        subtitle="Fusion Studio"
        planLabel={livePlanLabel}
        usageLabel={liveUsageLabel}
        availableCredits={pricingDisplay.availableCredits}
        reservedCredits={pricingDisplay.reservedCredits}
        usedCredits={pricingDisplay.usedCredits}
        totalCredits={pricingDisplay.totalCredits}
        displayKindOverride={pricingDisplay.displayKind}
        billingValueLabelOverride={liveBillingValueLabel}
        onMenuPress={openHamburgerMenu}
        onPressMeta={openPlanScreen}
      />
      <Stepper step={3} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 120 }}
      >
        <PricingTopBar
          studioName="Fusion Studio"
          estimate={visiblePrimaryEstimate}
          primaryEstimateLabel={visiblePrimaryEstimate}
          secondaryEstimateLabel={undefined}
          creditEstimateLabel={displayedCreditEstimate}
          cashEstimateLabel={displayedCashEstimate}
          walletAfterRun={pricingDisplayAny.creditDetailLabel ?? liveAvailableLabel ?? undefined}
          planName={livePlanLabel ?? undefined}
          includedUsageLeft={pricingDisplay.includedLabel ?? liveCreditBreakdownLabel ?? liveAvailableLabel ?? undefined}
          availabilityLabel={pricingDisplayAny.creditDetailLabel ?? liveAvailableLabel ?? undefined}
          settlementLabel={displayedNoteLabel}
          noteLabel={displayedNoteLabel}
          entitlementLabel={pricingDisplayAny.creditBreakdownLabel ?? pricing?.detailLabel ?? undefined}
          displayKind={isPostpaidPricing ? "postpaid" : "credits"}
            billingValue={isPostpaidPricing ? ((pricing?.planLabel && String(pricing.planLabel).toLowerCase().includes("enterprise")) ? "Enterprise" : "Postpaid") : "Credits"}
            canRun={pricing?.insufficientBalance ? false : null}
          insufficientTitle="Not enough available credits"
          insufficientMessage="You don’t have enough available credits for this run."
          onPressTopUp={pricing?.topUpVisible ? openTopUpScreen : undefined}
          onPressUpgrade={pricing?.upgradeVisible ? openUpgradeScreen : undefined}
          onPressBreakdown={() => setShowPricingBreakdown(true)}
          onPressManagePlan={openPlanScreen}
        />

        <StudioTipsRail
          title="Studio coach"
          subtitle="Rolling tips based on your current Fusion setup."
          tips={studioTips}
          loading={tipsLoading}
          error={tipsError}
          onRefresh={() => {
            void refreshStudioTips();
          }}
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
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Launch lineup</Text>
          <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
            Talking Video Economy is included in the product today. Talking Video Premium is available as Beta Release, and Cinematic Video Direction is the next release.
          </Text>

          <View style={{ gap: 10, marginTop: 12 }}>
            {([
              {
                code: "TALKING_VIDEO" as VideoMode,
                label: talkingVideoDisplayLabel(),
                detail: "Includes Economy today, with Premium available as Beta Release for richer motion and performance.",
              },
              {
                code: "CINEMATIC_VIDEO_DIRECTION" as VideoMode,
                label: "Cinematic Video Direction",
                detail: "Coming soon. Directed cinematic storytelling will follow after the Talking Video Beta launch.",
              },
            ]).map((item) => {
              const active = videoMode === item.code;
              const disabled = locked || (item.code === "CINEMATIC_VIDEO_DIRECTION" && CINEMATIC_VIDEO_COMING_SOON);
              const badge = modeBadgeLabel(item.code);
              return (
                <Pressable
                  key={item.code}
                  onPress={() => {
                    if (item.code === "CINEMATIC_VIDEO_DIRECTION" && CINEMATIC_VIDEO_COMING_SOON) {
                      setStatusText("Cinematic Video Direction is coming soon. Talking Video Beta is available now.");
                      return;
                    }
                    setVideoMode(item.code);
                    if (item.code === "CINEMATIC_VIDEO_DIRECTION" && !aspectRatioManuallyChangedRef.current && aspectRatio === "9:16") {
                      setAspectRatio("16:9");
                    }
                  }}
                  disabled={disabled}
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor:
                      item.code === "CINEMATIC_VIDEO_DIRECTION" && CINEMATIC_VIDEO_COMING_SOON
                        ? "rgba(255,255,255,0.14)"
                        : active
                          ? "rgba(248,184,72,0.42)"
                          : "rgba(255,255,255,0.10)",
                    backgroundColor:
                      item.code === "CINEMATIC_VIDEO_DIRECTION" && CINEMATIC_VIDEO_COMING_SOON
                        ? "rgba(255,255,255,0.04)"
                        : active
                          ? "rgba(232,152,56,0.16)"
                          : "rgba(255,255,255,0.05)",
                    padding: 12,
                    opacity: disabled ? 0.72 : 1,
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
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      {badge ? (
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            backgroundColor: "rgba(255,255,255,0.07)",
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.14)",
                          }}
                        >
                          <Text style={{ color: DF.muted, fontWeight: "900", fontSize: 11 }}>{badge}</Text>
                        </View>
                      ) : null}
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
                  </View>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        {videoMode === "TALKING_VIDEO" && (
          <GlassCard style={{ marginTop: 12 }}>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>
              Talking Video options
            </Text>
            <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
              Economy is included in the product. Premium is the Beta Release path for richer motion and scene-aware performance.
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {([
                {
                  key: "fixed" as const,
                  label: "Economy (Included)",
                  detail: "Included talking-video product path with a clean still scene",
                },
                {
                  key: "movement_based" as const,
                  label: "Premium (Beta Release)",
                  detail: "Beta Release path with scene-aware motion and richer performance styling",
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
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Cinematic quality</Text>
            <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700", fontSize: 12 }}>
              Choose the render profile for directed cinematic generation.
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {([
                {
                  key: "fast" as const,
                  label: "Cinematic Fast",
                  detail: "Quicker directed render for iteration and review.",
                },
                {
                  key: "premium" as const,
                  label: "Cinematic Premium",
                  detail: "Higher-touch directed render for launch-ready output.",
                },
              ]).map((item) => {
                const active = cinematicOutputProfile === item.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setCinematicOutputProfile(item.key)}
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
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Video direction</Text>
            <Pressable
              onPress={() => {
                void requestPromptEnhancement();
              }}
              disabled={locked || !effectiveVideoPrompt}
              style={{
                height: 34,
                borderRadius: 12,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(248,184,72,0.28)",
                backgroundColor: effectiveVideoPrompt ? "rgba(232,152,56,0.12)" : "rgba(255,255,255,0.05)",
                opacity: locked || !effectiveVideoPrompt ? 0.6 : 1,
              }}
            >
              <Text style={{ color: effectiveVideoPrompt ? "rgba(248,232,136,0.95)" : DF.muted, fontWeight: "900", fontSize: 12 }}>Enhance</Text>
            </Pressable>
          </View>
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
              {effectiveVideoPrompt.length} chars
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
              <Image source={{ uri: imageUrl }} style={{ width: "100%", height: 250 }} cachePolicy="none"
              contentFit="contain" />
            ) : hasFacePreview ? (
              <View style={{ height: 220, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: DF.text, fontWeight: "800" }}>Face connected</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                  {hasFaceArtifact
                    ? "The selected face artifact is ready for Fusion."
                    : "Face preview is visible, but Fusion still requires a saved Face Studio artifact before generate can run."}
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

        {!!pricing?.insufficientBalance && !pricing?.topUpVisible && !pricing?.upgradeVisible && (
          <GlassCard
            style={{
              marginTop: 12,
              borderColor: "rgba(255,180,90,0.30)",
              backgroundColor: "rgba(255,180,90,0.10)",
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Not enough credits</Text>
            <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
              This video run needs more available usage than your current balance supports.
            </Text>
          </GlassCard>
        )}

        {!!(pricing?.topUpVisible || pricing?.upgradeVisible) && (
          <GlassCard
            style={{
              marginTop: 12,
              borderColor: "rgba(255,180,90,0.30)",
              backgroundColor: "rgba(255,180,90,0.10)",
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>
              {pricing?.upgradeVisible && String(pricing?.entitlementReason || "").includes("ENTITLEMENT_BLOCKED_FEATURE_FLAG")
                ? "Upgrade required"
                : "Not enough credits"}
            </Text>
            <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
              {pricing?.noteLabel ||
                (pricing?.upgradeVisible && String(pricing?.entitlementReason || "").includes("ENTITLEMENT_BLOCKED_FEATURE_FLAG")
                  ? "Upgrade your plan to use this video feature."
                  : "Top up or upgrade to continue with this video run.")}
            </Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              {!!pricing?.topUpVisible && (
                <Pressable
                  onPress={openTopUpScreen}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "rgba(248,184,72,0.35)",
                    backgroundColor: "rgba(232,152,56,0.22)",
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Top Up</Text>
                </Pressable>
              )}

              {!!pricing?.upgradeVisible && (
                <Pressable
                  onPress={openUpgradeScreen}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.14)",
                    backgroundColor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Upgrade</Text>
                </Pressable>
              )}
            </View>
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
          onPress={handlePrimaryAction}
          disabled={!canPrimaryAction}
          style={{
            marginTop: 12,
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "rgba(248,184,72,0.35)",
            backgroundColor:
              canPrimaryAction ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.06)",
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
              {!hasUsableFaceInput
                ? isCinematic
                  ? "Select a Face Studio result to continue"
                  : "Select a face preview to continue"
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
              pricing={
                runReceiptViews.pricing
                  ? ({ ...(runReceiptViews.pricing as any), stage: runReceiptStage } as any)
                  : ({ ...(pricing as any), stage: finalPricingState as any } as any)
              }
              pricingSummary={{
                ...((runReceiptViews.pricingSummary ?? {}) as any),
                estimateLabel: (runReceiptViews.pricingSummary as any)?.estimateLabel ?? visiblePrimaryEstimate,
                finalLabel:
                  (runReceiptViews.pricingSummary as any)?.finalLabel ??
                  (runReceiptStage === "committed" ? finalPricingLabel ?? visiblePrimaryEstimate : visiblePrimaryEstimate),
                message:
                  (runReceiptViews.pricingSummary as any)?.message ??
                  finalPricingMessage ??
                  (pricing?.preview
                    ? "Preview estimate shown until the service returns the final pricing snapshot."
                    : "Final pricing details appear after generation completes."),
              } as any}
            />
            <JobPricingTimeline stage={runReceiptStage} />
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
                  <Image
                    source={{ uri: imageUrl }}
                    style={{ width: "100%", height: 220 }}
                    cachePolicy="none"
              contentFit="contain"
                    contentPosition="center"
                    transition={180}
                    onError={() => {
                      if (faceImageAttempt === "primary" && fallbackFaceUrl && fallbackFaceUrl !== primaryImageUrl) {
                        setFaceImageAttempt("resolved");
                        return;
                      }
                      setStatusText("Face image preview could not be loaded. Fusion will still use the selected face artifact or preview if available.");
                    }}
                  />
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
                    • Render profile: {cinematicOutputProfileLabel(cinematicOutputProfile)}
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
                {!!(finalPricingLabel ?? displayedPrimaryEstimate) && (
                  <>
                    <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                      • {isPostpaidPricing ? "Estimated bill" : "Credits charged"}: {finalPricingLabel ?? visiblePrimaryEstimate}
                    </Text>
                  </>
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
        estimate={visiblePrimaryEstimate}
        billedUnitType={`${modeActionLabel(videoMode, cinematicOutputProfile)} • ${orchestrationLabel}`}
        includedText={pricingDisplayAny.creditDetailLabel ?? liveAvailableLabel ?? "Included plan usage applies before wallet or postpaid settlement."}
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
        usageContext={pricingDisplayAny.creditDetailLabel ?? liveAvailableLabel ?? "Your current included usage or wallet balance is not enough for this render."}
        highlights={[
          "Continue face-to-video workflows without broken handoffs",
          "Use included monthly usage where your plan allows it",
          "Handle overages through wallet or postpaid billing based on entitlement rules",
        ]}
        onClose={() => setShowUpgrade(false)}
        onSecondary={() => setShowUpgrade(false)}
        onUpgrade={openUpgradeScreen}
      />


      <PromptEnhancerSheet
        visible={enhancerOpen}
        loading={enhancerLoading}
        error={enhancerError}
        result={enhancerResult}
        onClose={() => setEnhancerOpen(false)}
        onRefresh={() => {
          void requestPromptEnhancement();
        }}
        onApply={(nextText) => {
          setVideoPrompt(nextText);
          setEnhancerOpen(false);
          setStatusText("Enhanced video direction applied. Review it and generate when ready.");
        }}
      />

      <DFBlockingOverlay
        visible={false}
        title="Working…"
        message="Locking your inputs and finishing the action."
      />
    </View>
  );
}