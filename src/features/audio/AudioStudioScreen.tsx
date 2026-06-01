
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
import { useIsFocused } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import { shareUrl } from "../../core/share/share";
import { saveCreateFlowContext } from "../../core/media/createFlow";
import { useResolvedPricingDisplay } from "../../core/pricing/resolvePricingDisplay";
import { api } from "../../core/api/client";
import { endpoints } from "../../core/api/endpoints";
import { AUDIO_BASE, FACE_BASE } from "../../core/config/env";
import { derivePricingUiSummary } from "../../core/pricing/pricingSummary";
import { computeAffordabilityDecision } from "../../core/pricing/studioAffordability";

import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import DFBlockingOverlay from "../../core/ui/DFBlockingOverlay";
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

function encodeNavUrl(url: string) {
  const clean = String(url ?? "").trim().replace(/^"+|"+$/g, "");
  return encodeURIComponent(clean);
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

function logAudioStudioFlow(step: string, payload: any) {
  try {
    console.log("[DF_FLOW][AudioStudio]", step, JSON.stringify(payload, null, 2));
  } catch {
    console.log("[DF_FLOW][AudioStudio]", step, payload);
  }
}


function normalizeAspectRatio(v: any): "9:16" | "16:9" | "1:1" {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "16:9" || s === "landscape") return "16:9";
  if (s === "1:1" || s === "square") return "1:1";
  return "9:16";
}

function readBackendLocaleOrder(locale: UiLocale | null | undefined): number | null {
  if (!locale) return null;

  const raw = (locale as any)?.raw ?? {};
  const candidates = [
    (locale as any)?.display_rank,
    (locale as any)?.displayRank,
    (locale as any)?.sort_order,
    (locale as any)?.sortOrder,
    (locale as any)?.rank,
    (locale as any)?.priority,
    raw?.display_rank,
    raw?.displayRank,
    raw?.sort_order,
    raw?.sortOrder,
    raw?.rank,
    raw?.priority,
    raw?.order,
    raw?.position,
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n)) return n;
  }

  return null;
}


type UiAudioDuration = {
  duration_sec?: number;
  duration_ms?: number;
};

type AudioPlayerHandle = ReturnType<typeof createAudioPlayer>;
type AudioPlayerSubscription = { remove?: () => void } | null;

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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAudioPlayerToLoad(player: AudioPlayerHandle, timeoutMs = 4000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const loaded = Boolean((player as any)?.isLoaded);
    const durationSeconds = asPositiveNumber((player as any)?.duration);
    if (loaded || durationSeconds) return;
    await delay(100);
  }
}

async function releaseAudioPlayer(player: AudioPlayerHandle | null | undefined): Promise<void> {
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
}

async function probeRemoteAudioDuration(audioUrl: string): Promise<UiAudioDuration> {
  const url = cleanParam(audioUrl);
  if (!url) return {};

  let player: AudioPlayerHandle | null = null;
  try {
    player = createAudioPlayer(url, {
      updateInterval: 250,
      downloadFirst: true,
    });
    await waitForAudioPlayerToLoad(player, 3000);
    const durationSeconds = asPositiveNumber((player as any)?.duration);
    if (durationSeconds) {
      return toDuration(durationSeconds * 1000, durationSeconds);
    }
  } catch {}
  finally {
    await releaseAudioPlayer(player);
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
  const [progressPct, setProgressPct] = useState(0);

  useEffect(() => {
    const id = progress01.addListener(({ value }) => {
      setProgressPct(Math.round(clamp01(value) * 100));
    });
    return () => {
      progress01.removeListener(id);
    };
  }, [progress01]);

  return (
    <GlassCard style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: DF.text, fontWeight: "900" }}>{label ?? "Progress"}</Text>
        <Text style={{ color: DF.muted, fontWeight: "800" }}>{progressPct}%</Text>
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
  const pricing = resp?.pricing ?? null;
  const summary = resp?.pricing_summary ?? pricing?.summary ?? null;
  const state = String(pricing?.state ?? summary?.state ?? "").toLowerCase();
  const billingMode = String(pricing?.billing_mode ?? "").toLowerCase();
  const settlementMode = String(pricing?.settlement_mode ?? "").toLowerCase();

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
      summary?.finalLabel ||
      summary?.final_label ||
      (pricing?.currency ? `${pricing.currency} 0.00` : "0.00")
    );
  }

  if (state === "committed") {
    return (
      summary?.display_final ||
      summary?.finalLabel ||
      summary?.final_label ||
      summary?.receiptLabel ||
      summary?.receipt_label ||
      (pricing?.final_amount != null && pricing?.currency ? `${pricing.currency} ${pricing.final_amount}` : undefined) ||
      (pricing?.amount != null && pricing?.currency ? `${pricing.currency} ${pricing.amount}` : undefined)
    );
  }

  return (
    summary?.display_estimate ||
    summary?.estimateLabel ||
    summary?.estimate_label ||
    summary?.display_final ||
    (pricing?.estimated_amount != null && pricing?.currency ? `${pricing.currency} ${pricing.estimated_amount}` : undefined) ||
    (pricing?.amount != null && pricing?.currency ? `${pricing.currency} ${pricing.amount}` : undefined)
  );
}

function pickFinalPricingMessage(resp: any): string | null {
  const pricing = resp?.pricing ?? null;
  const summary = resp?.pricing_summary ?? pricing?.summary ?? null;
  const state = String(pricing?.state ?? summary?.state ?? "").toLowerCase();

  if (typeof summary?.display_note === "string" && summary.display_note.trim()) return summary.display_note;
  if (typeof summary?.message === "string" && summary.message.trim()) return summary.message;
  if (typeof summary?.detail === "string" && summary.detail.trim()) return summary.detail;

  if (state === "suppressed") return null;
  if (state === "released") return "Reservation released. No final charge was applied.";
  if (state === "committed") return "Final charge recorded after execution.";

  return null;
}

function readFinalPricingState(resp: any): "estimated" | "committed" | "released" {
  const state = String(resp?.pricing?.state ?? "").toLowerCase();
  if (state === "committed") return "committed";
  if (state === "released") return "released";
  return "estimated";
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

function chooseAudioSettlementLabel(pricing: any, insufficientBalance: boolean): string {
  const settlementMode = cleanParam(pricing?.settlementMode).toLowerCase();

  if (insufficientBalance) return "Not enough available credits for this run.";
  if (settlementMode === "postpaid") {
    return "Billed after completion through enterprise invoicing.";
  }
  return "Covered by your available credits.";
}

function normalizeSpeechScript(input: string): string {
  return cleanParam(input)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?!\s|$)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksMostlyLatinScript(input: string): boolean {
  const sample = cleanParam(input);
  if (!sample) return true;
  const letters = sample.match(/[A-Za-z]/g)?.length ?? 0;
  const nonSpace = sample.replace(/\s+/g, "").length;
  if (!nonSpace) return true;
  return letters / nonSpace >= 0.45;
}

function shortenLongEnglishClauses(input: string): string {
  const normalized = normalizeSpeechScript(input);
  if (!normalized || !looksMostlyLatinScript(normalized)) return normalized;

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      if (words.length <= 20 || !sentence.includes(',')) return sentence.trim();
      const parts = sentence.split(/,\s+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 2) return sentence.trim();
      return parts.join('. ');
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureTerminalPunctuation(input: string): string {
  const normalized = normalizeSpeechScript(input);
  if (!normalized) return normalized;
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function buildAudioSpeechRewrite(
  userInput: string,
  flavor: "primary" | "clear" | "warm" | "expressive"
): string {
  const normalized = normalizeSpeechScript(userInput);
  if (!normalized) return "";

  const base = flavor === "clear"
    ? shortenLongEnglishClauses(normalized)
    : normalized;

  const withEnding = ensureTerminalPunctuation(base);

  if (!looksMostlyLatinScript(withEnding)) return withEnding;

  if (flavor === "expressive") {
    return withEnding
      .replace(/\bwe're\b/gi, "we are")
      .replace(/\bi'm\b/gi, "I am");
  }

  if (flavor === "warm") {
    return withEnding
      .replace(/\bcan't\b/gi, "cannot")
      .replace(/\bwon't\b/gi, "will not");
  }

  return withEnding;
}

function getAudioApiBaseUrl(): string {
  const env = ((globalThis as any)?.process?.env ?? {}) as Record<string, string | undefined>;
  const raw =
    cleanParam(AUDIO_BASE) ||
    cleanParam(env.EXPO_PUBLIC_AUDIO_BASE_URL) ||
    cleanParam(env.EXPO_PUBLIC_API_AUDIO_URL) ||
    cleanParam(env.AUDIO_BASE_URL) ||
    "";
  return raw.replace(/\/+$/, "");
}

function resolveAudioApiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const base = getAudioApiBaseUrl();

  if (!base) return `/api/audio${suffix}`;
  if (/\/api\/audio$/i.test(base) || /\/audio$/i.test(base)) return `${base}${suffix}`;
  return `${base}/api/audio${suffix}`;
}

function buildAudioAiHeaders(authLike: any): Record<string, string> {
  const token =
    cleanParam(authLike?.token) ||
    cleanParam(authLike?.accessToken) ||
    cleanParam(authLike?.authToken) ||
    cleanParam(authLike?.session?.accessToken) ||
    cleanParam(authLike?.authState?.accessToken);

  const userId =
    cleanParam(authLike?.userId) ||
    cleanParam(authLike?.user?.id) ||
    cleanParam(authLike?.session?.user?.id) ||
    cleanParam(authLike?.authState?.user?.id);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (token) headers.Authorization = token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
  if (userId) headers["X-User-Id"] = userId;
  return headers;
}

async function postAudioAiJson<T>(paths: string | string[], body: any, authLike: any): Promise<T> {
  const candidates = Array.isArray(paths) ? paths : [paths];
  let lastError: Error | null = null;

  for (const path of candidates) {
    try {
      const response = await fetch(resolveAudioApiUrl(path), {
        method: "POST",
        headers: buildAudioAiHeaders(authLike),
        body: JSON.stringify(body ?? {}),
      });

      const rawText = await response.text();
      let parsed: any = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch {
        parsed = rawText;
      }

      if (!response.ok) {
        const detail =
          cleanParam(parsed?.detail?.message) ||
          cleanParam(parsed?.detail?.error) ||
          cleanParam(parsed?.detail) ||
          cleanParam(parsed?.message) ||
          `Request failed (${response.status})`;

        if (response.status === 404 || response.status === 405 || response.status === 501) {
          lastError = new Error(detail);
          continue;
        }
        throw new Error(detail);
      }

      return parsed as T;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error ?? "Request failed"));
    }
  }

  throw lastError ?? new Error("Request failed");
}

function normalizeAudioEnhancerResult(raw: any, fallback: PromptEnhancerResult): PromptEnhancerResult {
  const enhancedInput =
    cleanParam(raw?.enhanced_input) ||
    cleanParam(raw?.enhanced_script) ||
    cleanParam(raw?.enhanced_text) ||
    cleanParam(raw?.rewrite) ||
    cleanParam(raw?.result?.enhanced_input) ||
    cleanParam(raw?.result?.enhanced_script) ||
    cleanParam(raw?.result?.enhanced_text);

  const rawAlternatives = Array.isArray(raw?.alternatives)
    ? raw.alternatives
    : Array.isArray(raw?.result?.alternatives)
      ? raw.result.alternatives
      : Array.isArray(raw?.variants)
        ? raw.variants
        : [];

  const alternatives = rawAlternatives
    .map((item: any, index: number) => {
      const label = cleanParam(item?.label) || cleanParam(item?.title) || `Option ${index + 1}`;
      const text =
        cleanParam(item?.text) ||
        cleanParam(item?.value) ||
        cleanParam(item?.enhanced_input) ||
        cleanParam(item?.enhanced_script) ||
        cleanParam(item?.enhanced_text);
      return text ? { label, text } : null;
    })
    .filter(Boolean) as Array<{ label: string; text: string }>;

  const tips = Array.isArray(raw?.tips)
    ? raw.tips.map((tip: any) => cleanParam(tip?.body ?? tip?.text ?? tip)).filter(Boolean)
    : Array.isArray(raw?.result?.tips)
      ? raw.result.tips.map((tip: any) => cleanParam(tip?.body ?? tip?.text ?? tip)).filter(Boolean)
      : fallback.tips;

  return {
    ...fallback,
    ...raw,
    enhanced_input: enhancedInput || fallback.enhanced_input,
    alternatives: alternatives.length ? alternatives : fallback.alternatives,
    tips: tips.length ? tips : fallback.tips,
    why_this_is_better:
      cleanParam(raw?.why_this_is_better) ||
      cleanParam(raw?.message) ||
      cleanParam(raw?.detail) ||
      fallback.why_this_is_better,
    source: enhancedInput ? cleanParam(raw?.source) || "llm" : fallback.source,
    fallback_used: !enhancedInput,
  };
}

function normalizeStudioCoachTips(raw: any, fallback: StudioCoachTip[]): StudioCoachTip[] {
  const source = Array.isArray(raw?.tips) ? raw.tips : Array.isArray(raw) ? raw : [];
  const tips = source
    .map((tip: any, index: number) => {
      if (typeof tip === "string") {
        const body = cleanParam(tip);
        return body
          ? {
              id: `audio-tip-llm-${index + 1}`,
              title: `Tip ${index + 1}`,
              body,
              tone: "neutral" as const,
            }
          : null;
      }

      const title = cleanParam(tip?.title) || `Tip ${index + 1}`;
      const body = cleanParam(tip?.body) || cleanParam(tip?.text) || cleanParam(tip?.message);
      if (!body) return null;
      const toneRaw = cleanParam(tip?.tone).toLowerCase();
      const tone = ["neutral", "premium", "success", "warning"].includes(toneRaw) ? (toneRaw as StudioCoachTip["tone"]) : "neutral";
      return {
        id: cleanParam(tip?.id) || `audio-tip-llm-${index + 1}`,
        title,
        body,
        tone,
      };
    })
    .filter(Boolean) as StudioCoachTip[];

  return tips.length ? tips.slice(0, 4) : fallback;
}

function buildLocalAudioEnhancement(
  userInput: string,
  lockedFields: Record<string, any>
): PromptEnhancerResult {
  const chars = cleanParam(userInput).length;
  const locale = cleanParam(lockedFields?.target_locale_label || lockedFields?.target_locale);
  const voiceLabel = cleanParam(lockedFields?.voice_label);
  const context = cleanParam(lockedFields?.context);
  const why = chars > 280
    ? "The rewrite tightens pacing and punctuation so the script sounds cleaner when spoken aloud."
    : "The rewrite preserves your words while making the spoken delivery sound more natural.";

  return {
    original_input: userInput,
    enhanced_input: buildAudioSpeechRewrite(userInput, "primary"),
    alternatives: [
      { label: "Clear narration", text: buildAudioSpeechRewrite(userInput, "clear") },
      { label: "Warm delivery", text: buildAudioSpeechRewrite(userInput, "warm") },
      { label: "Expressive", text: buildAudioSpeechRewrite(userInput, "expressive") },
    ],
    tips: [
      chars > 360 ? "Shorter sentences usually sound better in generated speech." : "Use short sentences for cleaner speech pacing.",
      locale ? `Keep pronunciation-sensitive words natural for ${locale}.` : "Choose the target locale before generate so pronunciation stays predictable.",
      voiceLabel ? `Review the rewritten script against the ${voiceLabel} voice before you apply it.` : "Choose a voice before you enhance so the script matches the performer.",
      context ? `Keep the spoken wording aligned with the ${context} tone you selected.` : "Add a tone cue like warm, energetic, premium, or calm if you want stronger delivery control.",
      why,
    ].filter(Boolean),
    why_this_is_better: why,
    source: "fallback",
    fallback_used: true,
    structured: {
      target_locale: cleanParam(lockedFields?.target_locale),
      voice: cleanParam(lockedFields?.voice_label),
      translate: Boolean(lockedFields?.translate),
      context,
      script_length: chars,
    },
  };
}

function buildLocalAudioTips(input: {
  text: string;
  localeLabel: string;
  voiceLabel: string;
  translate: boolean;
  context: string;
  hasFacePreview: boolean;
  planLabel?: string | null;
}): StudioCoachTip[] {
  const tips: StudioCoachTip[] = [];
  const chars = cleanParam(input.text).length;
  const plan = cleanParam(input.planLabel).toLowerCase();

  if (!input.hasFacePreview) {
    tips.push({
      id: "audio-tip-face",
      title: "Carry over a face first",
      body: "Audio Studio works best when it starts from a Face Studio selection so the voice matches the final video flow.",
      tone: "warning",
    });
  }

  if (!cleanParam(input.voiceLabel) || cleanParam(input.voiceLabel) === "Select") {
    tips.push({
      id: "audio-tip-voice",
      title: "Pick the voice first",
      body: "Choose a voice before refining the script so delivery cues match the final performer.",
      tone: "neutral",
    });
  }

  if (chars > 360) {
    tips.push({
      id: "audio-tip-length",
      title: "Tighten long scripts",
      body: "Longer scripts can sound flatter. Break them into shorter lines for cleaner pacing and emphasis.",
      tone: "premium",
    });
  } else {
    tips.push({
      id: "audio-tip-rhythm",
      title: "Add spoken rhythm",
      body: "Use short sentences and clear pauses so the output sounds more natural when spoken aloud.",
      tone: "premium",
    });
  }

  if (!cleanParam(input.context)) {
    tips.push({
      id: "audio-tip-context",
      title: "Name the delivery tone",
      body: "Add a context cue like warm, festive, premium, calm, or energetic to shape delivery style.",
      tone: "neutral",
    });
  }

  if (input.translate) {
    tips.push({
      id: "audio-tip-translate",
      title: "Translation is on",
      body: `Review proper nouns and brand names before generate so they sound correct in ${input.localeLabel || "the target locale"}.`,
      tone: "success",
    });
  }

  if (plan.includes("free")) {
    tips.push({
      id: "audio-tip-cost",
      title: "Refine before you run",
      body: "Use enhancement and script tightening before generate so you spend credits only on the strongest version.",
      tone: "warning",
    });
  }

  return tips.slice(0, 4);
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
  confirmation?: { quote_id?: string; preview_fingerprint?: string } | null;
  raw?: any;
  pricing?: ReturnType<typeof normalizePricing>;
  pricingSummary?: ReturnType<typeof normalizePricingSummary>;
};

export default function AudioStudioScreen() {
  const auth = useAuth() as any;
  const { isReady, isAuthed, token } = auth;
  const tokenReady = !!token && isReady && isAuthed;
  const audioAiAuth = useMemo(
    () => ({
      token:
        cleanParam(auth?.token) ||
        cleanParam(auth?.accessToken) ||
        cleanParam(auth?.authToken) ||
        cleanParam(auth?.session?.accessToken) ||
        cleanParam(auth?.authState?.accessToken) ||
        "",
      userId:
        cleanParam(auth?.userId) ||
        cleanParam(auth?.user?.id) ||
        cleanParam(auth?.session?.user?.id) ||
        cleanParam(auth?.authState?.user?.id) ||
        "",
    }),
    [
      auth?.token,
      auth?.accessToken,
      auth?.authToken,
      auth?.session?.accessToken,
      auth?.authState?.accessToken,
      auth?.userId,
      auth?.user?.id,
      auth?.session?.user?.id,
      auth?.authState?.user?.id,
    ]
  );

  const queryClient = useQueryClient();
  const flow = useCreatorFlow() as any;
  const setFaceSelection = flow?.setFaceSelection as undefined | ((x: any) => void);
  const setAudioSelection = flow?.setAudioSelection as undefined | ((x: any) => void);
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);
  const resetCreatorFlow = flow?.resetCreatorFlow as undefined | ((nextOwnerKey?: string) => void);
  const setCreatorFlowOwner = flow?.setCreatorFlowOwner as undefined | ((ownerKey?: string) => void);
  const authUserId = audioAiAuth.userId || "";
  const authSessionKey = authUserId || "anon";

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
  const faceImageUrlParam = normalizeIncomingMediaUrl(
    cleanParam(params.face_sas_url) || cleanParam(params.face_image_url) || cleanParam(params.image_url) || "",
    params as any
  );
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
  const [enhancerOpen, setEnhancerOpen] = useState(false);
  const [enhancerLoading, setEnhancerLoading] = useState(false);
  const [enhancerError, setEnhancerError] = useState<string | null>(null);
  const [enhancerResult, setEnhancerResult] = useState<PromptEnhancerResult | null>(null);
  const [studioTips, setStudioTips] = useState<StudioCoachTip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);
  const isFocused = useIsFocused();

  const [text, setText] = useState("");
  const [targetLocale, setTargetLocale] = useState("hi-IN");
  const [sourceLanguage, setSourceLanguage] = useState<string | null>(null);
  const [translate, setTranslate] = useState(true);

  const [voice, setVoice] = useState<string | null>(null);
  const [context, setContext] = useState<string>("");
  const [debouncedText, setDebouncedText] = useState("");
  const [debouncedContext, setDebouncedContext] = useState("");

  const [variants, setVariants] = useState<VariantAudio[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const lastAuthSessionKeyRef = useRef<string | null>(null);

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
    setVariants([]);
    setSelectedIdx(null);
    setStatusText(null);
    setNeedsLogin(false);
    setFinalPricingLabel(null);
    setFinalPricingMessage(null);
    setFinalPricingState("estimated");
    setBackgroundNotice(null);

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
          key.includes("face-status") ||
          key.includes("audio-")
        );
      },
    });

    router.replace("/(tabs)/audio" as any);
  }, [authSessionKey, authUserId, isReady, queryClient, resetCreatorFlow, setCreatorFlowOwner]);

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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(text.trim());
    }, 700);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContext(context.trim());
    }, 700);
    return () => clearTimeout(timer);
  }, [context]);

  const rawFlowFace = flow?.faceSelection ?? flow?.face ?? null;
  const flowFaceOwnerUserId = cleanParam(
    rawFlowFace?.ownerUserId ??
      rawFlowFace?.owner_user_id ??
      rawFlowFace?.userId ??
      rawFlowFace?.user_id ??
      ""
  );
  const flowFace =
    authUserId && flowFaceOwnerUserId && flowFaceOwnerUserId !== authUserId ? null : rawFlowFace;
  const flowFaceUrl = cleanParam(
    flowFace?.sasUrl ?? flowFace?.imageUrl ?? flowFace?.image_url ?? flowFace?.face_image_url ?? ""
  );
  const flowFaceMediaAssetId = cleanParam(
    flowFace?.mediaAssetId ?? flowFace?.faceMediaAssetId ?? flowFace?.media_asset_id ?? flowFace?.face_media_asset_id ?? ""
  );
  const flowFaceArtifactId = cleanParam(
    flowFace?.artifactId ??
      flowFace?.faceArtifactId ??
      flowFace?.artifact_id ??
      flowFace?.face_artifact_id ??
      ""
  );
  const flowFaceGender = cleanParam(flowFace?.gender ?? "");

  const effectiveFaceMediaAssetId = flowFaceMediaAssetId || faceMediaAssetIdParam;
  const effectiveFaceGender = flowFaceGender || faceGenderParam || "";
  const effectiveFaceArtifactId = flowFaceArtifactId || faceArtifactIdParam;

  const rawFlowAudio = flow?.audioSelection ?? flow?.audio ?? null;
  const flowAudioOwnerUserId = cleanParam(
    rawFlowAudio?.ownerUserId ??
      rawFlowAudio?.owner_user_id ??
      rawFlowAudio?.userId ??
      rawFlowAudio?.user_id ??
      ""
  );
  const flowAudio =
    authUserId && flowAudioOwnerUserId && flowAudioOwnerUserId !== authUserId ? null : rawFlowAudio;
  const existingAudioUrl = cleanParam(flowAudio?.audioUrl ?? flowAudio?.sasUrl ?? "");
  const existingAudioArtifactId = cleanParam(
    flowAudio?.artifactId ??
      flowAudio?.audioArtifactId ??
      flowAudio?.artifact_id ??
      flowAudio?.audio_artifact_id ??
      ""
  );
  const existingAudioTitle = cleanParam(flowAudio?.title ?? "");
  const existingAudioDuration = toDuration(
    asPositiveNumber(flowAudio?.durationMs ?? flowAudio?.duration_ms),
    asPositiveNumber(flowAudio?.durationSec ?? flowAudio?.duration_sec)
  );
  const hasExistingLibraryAudio = !!existingAudioUrl;

  type FaceStatus = { variants?: Array<{ media_asset_id?: string; image_url?: string }> };

  const faceStatusQ = useQuery({
    queryKey: ["face-status", authSessionKey, faceJobId],
    queryFn: () => api.get<FaceStatus>(FACE_BASE, `/api/face/creator/jobs/${faceJobId}/status`),
    enabled: tokenReady && !!faceJobId && !flowFaceUrl && !faceImageUrlParam,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
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

  const hasFacePreview = !!faceImageUrl || !!effectiveFaceArtifactId;
  const hasFaceArtifact = !!effectiveFaceArtifactId;

  useEffect(() => {
    if (!setFaceSelection) return;
    if (flowFaceUrl) return;
    if (!faceImageUrl) return;

    setFaceSelection({
      artifactId: effectiveFaceArtifactId || undefined,
      faceArtifactId: effectiveFaceArtifactId || undefined,
      artifact_id: effectiveFaceArtifactId || undefined,
      face_artifact_id: effectiveFaceArtifactId || undefined,

      mediaAssetId: effectiveFaceMediaAssetId || undefined,
      faceMediaAssetId: effectiveFaceMediaAssetId || undefined,
      media_asset_id: effectiveFaceMediaAssetId || undefined,
      face_media_asset_id: effectiveFaceMediaAssetId || undefined,

      faceProfileId: faceProfileId || undefined,
      face_profile_id: faceProfileId || undefined,

      sasUrl: faceImageUrl,
      imageUrl: faceImageUrl,
      image_url: faceImageUrl,
      face_image_url: faceImageUrl,
      face_sas_url: faceImageUrl,

      variantIndex: undefined,
      ...(effectiveFaceGender ? ({ gender: effectiveFaceGender } as any) : {}),
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
    } as any);
  }, [faceImageUrl, setFaceSelection, flowFaceUrl, effectiveFaceArtifactId, effectiveFaceMediaAssetId, effectiveFaceGender]);

  useEffect(() => {
    if (!faceImageUrl) return;
    saveCreateFlowContext({
      image_url: faceImageUrl || undefined,
      face_image_url: faceImageUrl || undefined,
      face_sas_url: faceImageUrl || undefined,

      face_artifact_id: effectiveFaceArtifactId || undefined,
      artifact_id: effectiveFaceArtifactId || undefined,

      face_profile_id: faceProfileId || undefined,
      face_media_asset_id: effectiveFaceMediaAssetId || undefined,
      media_asset_id: effectiveFaceMediaAssetId || undefined,

      aspect_ratio: selectedAspectRatio,
      ...(effectiveFaceGender ? ({ gender: effectiveFaceGender } as any) : {}),
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
    } as any).catch(() => {});
  }, [faceImageUrl, effectiveFaceArtifactId, faceProfileId, effectiveFaceMediaAssetId, effectiveFaceGender, selectedAspectRatio]);

  const localesQ = useQuery({
    queryKey: ["audio-locales", authSessionKey],
    queryFn: () => fetchAudioLocales(token),
    enabled: tokenReady,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    retry: 0,
  });

  const localesErr = (localesQ.error as any)?.message ? String((localesQ.error as any).message) : null;
  const uiLocales: UiLocale[] = useMemo(() => normalizeLocales(localesQ.data as any), [localesQ.data]);

  const filteredLocales: UiLocale[] = useMemo(() => {
    const list = uiLocales.filter((l) => cleanParam(l.code));

    const withIndex = list.map((locale, index) => ({
      locale,
      index,
      backendOrder: readBackendLocaleOrder(locale),
    }));

    const hasBackendOrdering = withIndex.some((item) => item.backendOrder != null);

    if (!hasBackendOrdering) {
      return withIndex.map((item) => item.locale);
    }

    withIndex.sort((a, b) => {
      if (a.backendOrder == null && b.backendOrder == null) return a.index - b.index;
      if (a.backendOrder == null) return 1;
      if (b.backendOrder == null) return -1;
      if (a.backendOrder !== b.backendOrder) return a.backendOrder - b.backendOrder;
      return a.index - b.index;
    });

    return withIndex.map((item) => item.locale);
  }, [uiLocales]);

  useEffect(() => {
    try {
      console.log(
        "[DF_AUDIO][locales][backend_raw]",
        JSON.stringify(localesQ.data ?? null, null, 2)
      );
      console.log(
        "[DF_AUDIO][locales][normalized]",
        JSON.stringify(
          uiLocales.map((locale: any, index: number) => ({
            index,
            code: locale?.code,
            label: locale?.label,
            display_rank: locale?.display_rank ?? locale?.displayRank ?? locale?.raw?.display_rank ?? locale?.raw?.displayRank,
            sort_order: locale?.sort_order ?? locale?.sortOrder ?? locale?.raw?.sort_order ?? locale?.raw?.sortOrder,
            rank: locale?.rank ?? locale?.raw?.rank,
            priority: locale?.priority ?? locale?.raw?.priority,
          })),
          null,
          2
        )
      );
      console.log(
        "[DF_AUDIO][locales][final_screen_list]",
        JSON.stringify(
          filteredLocales.map((locale: any, index: number) => ({
            index,
            code: locale?.code,
            label: locale?.label,
            backend_order:
              readBackendLocaleOrder(locale),
          })),
          null,
          2
        )
      );
    } catch (error) {
      console.log("[DF_AUDIO][locales][log_error]", String(error));
    }
  }, [localesQ.data, uiLocales, filteredLocales]);

  useEffect(() => {
    if (!filteredLocales.length) return;
    const ok = filteredLocales.some((l) => l.code === targetLocale);
    if (!ok) {
      setTargetLocale(filteredLocales[0].code);
      setVoice(null);
    }
  }, [filteredLocales, targetLocale]);

  const voicesQ = useQuery({
    queryKey: ["audio-voices", authSessionKey, targetLocale],
    queryFn: () => fetchAudioVoices(token, targetLocale),
    enabled: tokenReady && !!targetLocale,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
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
      text: debouncedText || undefined,
      target_locale: targetLocale || undefined,
      source_language: translate ? sourceLanguage || undefined : undefined,
      translate,
      voice: voice || undefined,
      voice_id: voice || undefined,
      context: debouncedContext || undefined,
    }),
    [debouncedText, targetLocale, sourceLanguage, translate, voice, debouncedContext]
  );

  const pricingPreviewEnabled = tokenReady && !!faceImageUrl && !!debouncedText && !!voice;

  const pricingQ = useQuery<AudioEstimateResult>({
    queryKey: ["audio-pricing-estimate", authSessionKey, pricingPreviewPayload],
    enabled: pricingPreviewEnabled,
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
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

      const messageText = String(raw?.message || pricingSummary?.message || pricing?.message || "").toLowerCase();

      const creditUnits =
        asEstimateNumber(raw?.estimated_credits) ??
        asEstimateNumber(raw?.credits_used) ??
        asEstimateNumber(raw?.estimated_units) ??
        asEstimateNumber(raw?.units) ??
        Math.max(1, Math.ceil((debouncedText || text.trim()).length / 250));
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
        pricing?.tierCode ||
        raw?.pricing?.tier_code ||
        raw?.tier_code ||
        raw?.entitlement?.tier_code ||
        "Current plan";
      const isEnterprisePlan = String(planLabel).toLowerCase().includes("enterprise");

      const affordability = computeAffordabilityDecision({
        preview: raw,
        hasRequiredInputs: true,
        studioTitle: "Audio",
        canTopUp: !isEnterprisePlan && !useMoneyPrimary,
        canUpgrade: !isEnterprisePlan && !useMoneyPrimary,
        isEnterprise: isEnterprisePlan,
      });

      const insufficientBalance = Boolean(
        affordability.insufficientBalance ||
          raw?.insufficient_balance ||
          raw?.insufficientBalance ||
          (pricing as any)?.insufficientBalance ||
          (pricingSummary as any)?.insufficientBalance ||
          messageText.includes("insufficient") ||
          messageText.includes("not enough credit")
      );

      const noteLabel = insufficientBalance
        ? [affordability.primaryMessage, affordability.secondaryMessage].filter(Boolean).join(" ")
        : chooseAudioSettlementLabel(pricing, false);

      return {
        preview: !confirmation.quote_id,
        estimateLabel: primaryEstimateLabel,
        primaryEstimateLabel,
        secondaryEstimateLabel,
        creditEstimateLabel,
        moneyEstimateLabel,
        noteLabel,
        detailLabel: `${(debouncedText || text.trim()).length} characters • ${targetLocale} • ${voiceLabel}`,
        settlementLabel: noteLabel,
        planLabel,
        availableLabel:
          insufficientBalance
            ? affordability.secondaryMessage || affordability.primaryMessage
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
        ctaLabel: insufficientBalance
          ? affordability.ctaLabel
          : confirmation.quote_id
            ? `Create Audio — ${primaryEstimateLabel}`
            : "Create Audio",
        insufficientBalance,
        topUpVisible: insufficientBalance && !useMoneyPrimary && !isEnterprisePlan,
        upgradeVisible: insufficientBalance && !useMoneyPrimary,
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

  const audioEnhancerLockedFields = useMemo(() => ({
    target_locale: targetLocale,
    target_locale_label: localeLabel,
    voice: voice ?? undefined,
    voice_label: voiceLabel,
    translate,
    source_language: sourceLanguage ?? undefined,
    source_language_label: sourceLabel,
    context: context?.trim() || undefined,
    face_ready: hasFacePreview,
  }), [targetLocale, localeLabel, voice, voiceLabel, translate, sourceLanguage, sourceLabel, context, hasFacePreview]);

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
  const pricingDisplay = useResolvedPricingDisplay({ enabled: isReady && isAuthed && isFocused });
  const livePlanLabel =
    pricingDisplay.planName ||
    pricing?.planLabel ||
    undefined;
  const liveCreditBreakdownLabel =
    pricingDisplay.creditDetailLabel ||
    pricingDisplay.creditBreakdownLabel ||
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

  useEffect(() => {
    if (!__DEV__) return;
    logAudioStudioFlow("pricing_display", {
      resolved: {
        source: pricingDisplay.source,
        planName: pricingDisplay.planName,
        displayKind: pricingDisplay.displayKind,
        settlementKind: pricingDisplay.settlementKind,
        availableCredits: pricingDisplay.availableCredits,
        reservedCredits: pricingDisplay.reservedCredits,
        usedCredits: pricingDisplay.usedCredits,
        totalCredits: pricingDisplay.totalCredits,
        usageLabel: pricingDisplay.usageLabel,
      },
      rendered: {
        livePlanLabel,
        liveUsageLabel,
        liveAvailableLabel,
        liveBillingValueLabel,
      },
      estimate: pricing
        ? {
            planLabel: pricing.planLabel,
            availableLabel: pricing.availableLabel,
            settlementLabel: pricing.settlementLabel,
            estimateLabel: pricing.estimateLabel,
            primaryEstimateLabel: pricing.primaryEstimateLabel,
          }
        : null,
    });
  }, [
    pricingDisplay.source,
    pricingDisplay.planName,
    pricingDisplay.displayKind,
    pricingDisplay.settlementKind,
    pricingDisplay.availableCredits,
    pricingDisplay.reservedCredits,
    pricingDisplay.usedCredits,
    pricingDisplay.totalCredits,
    pricingDisplay.usageLabel,
    livePlanLabel,
    liveUsageLabel,
    liveAvailableLabel,
    liveBillingValueLabel,
    pricing?.planLabel,
    pricing?.availableLabel,
    pricing?.settlementLabel,
    pricing?.estimateLabel,
    pricing?.primaryEstimateLabel,
  ]);

  const refreshStudioTips = useCallback(async () => {
    const fallbackTips = buildLocalAudioTips({
      text,
      localeLabel,
      voiceLabel,
      translate,
      context,
      hasFacePreview,
      planLabel: pricing?.planLabel ?? null,
    });

    setTipsLoading(true);
    setTipsError(null);

    if (!tokenReady) {
      setStudioTips(fallbackTips);
      setTipsLoading(false);
      return;
    }

    try {
      const response = await postAudioAiJson<any>(
        ["/api/audio/tts/tips"],
        {
          mode: "tts",
          prompt: text.trim(),
          form_state: {
            ...audioEnhancerLockedFields,
            face_artifact_ready: hasFaceArtifact,
          },
          context: {
            plan_name: pricing?.planLabel ?? null,
            available_label: pricing?.availableLabel ?? null,
            estimate_label: pricing?.estimateLabel ?? null,
            insufficient_balance: pricing?.insufficientBalance ?? false,
          },
          locale: targetLocale || "en",
          limit: 4,
        },
        audioAiAuth
      );

      setStudioTips(normalizeStudioCoachTips(response, fallbackTips));
      setTipsError(null);
    } catch {
      setStudioTips(fallbackTips);
      setTipsError(null);
    } finally {
      setTipsLoading(false);
    }
  }, [
    text,
    localeLabel,
    voiceLabel,
    translate,
    context,
    hasFacePreview,
    hasFaceArtifact,
    pricing?.planLabel,
    pricing?.availableLabel,
    pricing?.estimateLabel,
    pricing?.insufficientBalance,
    audioEnhancerLockedFields,
    targetLocale,
    tokenReady,
    audioAiAuth,
  ]);

  const requestPromptEnhancement = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      setStatusText("Add a script first, then tap Enhance.");
      return;
    }

    setEnhancerOpen(true);
    setEnhancerLoading(true);
    setEnhancerError(null);

    const fallback = buildLocalAudioEnhancement(trimmed, audioEnhancerLockedFields);

    if (!tokenReady) {
      setEnhancerResult(fallback);
      setEnhancerError("Live script enhancement is unavailable right now. Showing a smart local rewrite instead.");
      setEnhancerLoading(false);
      return;
    }

    try {
      const response = await postAudioAiJson<any>(
        ["/api/audio/tts/prompt/enhance"],
        {
          mode: "tts",
          user_input: trimmed,
          locked_fields: {
            ...audioEnhancerLockedFields,
            face_artifact_ready: hasFaceArtifact,
          },
          context: {
            plan_name: pricing?.planLabel ?? null,
            available_label: pricing?.availableLabel ?? null,
            estimate_label: pricing?.estimateLabel ?? null,
            insufficient_balance: pricing?.insufficientBalance ?? false,
            has_face_preview: hasFacePreview,
          },
          locale: targetLocale || "en",
          max_alternatives: 3,
        },
        audioAiAuth
      );

      const normalized = normalizeAudioEnhancerResult(response, fallback);
      setEnhancerResult(normalized);
      setEnhancerError(
        normalized.fallback_used
          ? "Live script enhancement is unavailable right now. Showing a smart local rewrite instead."
          : null
      );
    } catch {
      setEnhancerResult(fallback);
      setEnhancerError("Live script enhancement is unavailable right now. Showing a smart local rewrite instead.");
    } finally {
      setEnhancerLoading(false);
    }
  }, [
    text,
    audioEnhancerLockedFields,
    hasFaceArtifact,
    hasFacePreview,
    pricing?.planLabel,
    pricing?.availableLabel,
    pricing?.estimateLabel,
    pricing?.insufficientBalance,
    targetLocale,
    tokenReady,
    audioAiAuth,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshStudioTips();
    }, 550);
    return () => clearTimeout(timer);
  }, [refreshStudioTips]);


useEffect(() => {
  if (!isFocused) return;
  if (!tokenReady) return;
  if (faceJobId && !flowFaceUrl && !faceImageUrlParam) faceStatusQ.refetch?.();
  localesQ.refetch?.();
  if (targetLocale) voicesQ.refetch?.();
  if (pricingPreviewEnabled) pricingQ.refetch?.();
}, [isFocused, tokenReady, faceJobId, flowFaceUrl, faceImageUrlParam, targetLocale, pricingPreviewEnabled]);

  const previewPendingMessage =
    !!text.trim() &&
    !!voice &&
    !!faceImageUrl &&
    text.trim() !== debouncedText
      ? "Estimate refreshes shortly after you pause typing."
      : !!debouncedText &&
        !!voice &&
        !!faceImageUrl &&
        !pricingReady &&
        !pricingQ.isFetching &&
        !pricingQ.error
          ? `Estimate shown: ${displayedPrimaryEstimate}. Generate will unlock as soon as pricing confirmation is ready.`
          : null;

  const soundRef = useRef<AudioPlayerHandle | null>(null);
  const playbackSubscriptionRef = useRef<AudioPlayerSubscription>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  const stopSound = useCallback(async () => {
    try {
      playbackSubscriptionRef.current?.remove?.();
    } catch {}
    playbackSubscriptionRef.current = null;

    const activePlayer = soundRef.current;
    soundRef.current = null;

    try {
      await releaseAudioPlayer(activePlayer);
    } catch {}

    setPlayingIdx(null);
  }, []);

  useEffect(() => {
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      interruptionMode: "duckOthers",
    }).catch(() => {});
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
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          shouldRouteThroughEarpiece: false,
          interruptionMode: "duckOthers",
        });

        const player = createAudioPlayer(u, {
          updateInterval: 250,
          downloadFirst: true,
        });

        soundRef.current = player;
        playbackSubscriptionRef.current = (player as any)?.addListener?.(
          "playbackStatusUpdate",
          (st: any) => {
            if (st?.error) {
              setStatusText(String(st.error));
              void stopSound();
              return;
            }
            if (st?.didJustFinish) {
              void stopSound();
            }
          }
        ) ?? null;
        setPlayingIdx(idx);

        await waitForAudioPlayerToLoad(player, 4000);
        const loaded = Boolean((player as any)?.isLoaded) || Boolean(asPositiveNumber((player as any)?.duration));
        if (!loaded) {
          throw new Error("Audio could not be loaded for playback.");
        }

        await Promise.resolve((player as any)?.seekTo?.(0));
        await Promise.resolve((player as any)?.play?.());
      } catch (error: any) {
        setStatusText(error?.message || "Audio playback failed.");
        await stopSound();
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

  const openTopUpScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "top_up",
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

  const openAudioLibrary = useCallback(() => {
    router.push({
      pathname: "/media/library" as any,
      params: { mode: "pick-audio", type: "audio" } as any,
    } as any);
  }, []);

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
      setStatusText("You do not have enough credits for this voice generation. Top up or upgrade to continue.");
      animateTo(0, 350);
      if (pricing?.topUpVisible) {
        openTopUpScreen();
        return;
      }
      if (pricing?.upgradeVisible) {
        openUpgradeScreen();
        return;
      }
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
                ownerUserId: authUserId || undefined,
                owner_user_id: authUserId || undefined,
                userId: authUserId || undefined,
                user_id: authUserId || undefined,
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

    logAudioStudioFlow("proceedToFusion", {
      authUserId,
      imageUrl,
      faceArtifactId,
      face_media_asset_id: cleanParam(effectiveFaceMediaAssetId),
      face_profile_id: cleanParam(faceProfileId),
      audioUrl,
      audioArtifactId,
      targetLocale,
      voice,
      selectedAspectRatio,
      text: text.trim(),
    });

    if (!audioUrl || !imageUrl) return;

    await stopSound();

    try {
      setNavLocked(true);

      const duration = await resolveVariantDuration(variant);

      setFaceSelection?.({
        artifactId: faceArtifactId || undefined,
        faceArtifactId: faceArtifactId || undefined,
        artifact_id: faceArtifactId || undefined,
        face_artifact_id: faceArtifactId || undefined,

        mediaAssetId: effectiveFaceMediaAssetId || undefined,
        faceMediaAssetId: effectiveFaceMediaAssetId || undefined,
        media_asset_id: effectiveFaceMediaAssetId || undefined,
        face_media_asset_id: effectiveFaceMediaAssetId || undefined,

        faceProfileId: faceProfileId || undefined,
        face_profile_id: faceProfileId || undefined,

        sasUrl: imageUrl,
        imageUrl: imageUrl,
        image_url: imageUrl,
        face_image_url: imageUrl,
        face_sas_url: imageUrl,

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
        face_image_url: imageUrl,
        face_sas_url: imageUrl,

        face_artifact_id: faceArtifactId || undefined,
        artifact_id: faceArtifactId || undefined,

        audio_url: audioUrl,
        audio_sas_url: audioUrl,
        script_text: text.trim() || undefined,
        audio_locale: targetLocale || undefined,
        audio_voice: voice || undefined,

        face_profile_id: faceProfileId || undefined,
        face_media_asset_id: effectiveFaceMediaAssetId || undefined,
        media_asset_id: effectiveFaceMediaAssetId || undefined,

        audio_artifact_id: audioArtifactId || undefined,
        audio_duration_sec: duration.duration_sec,
        audio_duration_ms: duration.duration_ms,
        aspect_ratio: selectedAspectRatio,
        stage: "audio_done",
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
              disabled={locked || !active || !audioUrl || !hasFacePreview}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: active ? "rgba(248,184,72,0.55)" : "rgba(255,255,255,0.10)",
                backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.06)",
                alignItems: "center",
                justifyContent: "center",
                opacity: locked || !active || !hasFacePreview ? 0.6 : 1,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>
                {hasFacePreview ? "Continue to Video" : "Choose a Face Studio face"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      );
    },
    [selectedIdx, locked, playingIdx, playPause, proceedToFusion, setAudioSelection]
  );

  const onPrimaryAction = useCallback(() => {
    if (pricing?.insufficientBalance) {
      if (pricing?.topUpVisible) {
        openTopUpScreen();
        return;
      }
      if (pricing?.upgradeVisible) {
        openUpgradeScreen();
        return;
      }
    }
    void generate();
  }, [generate, openTopUpScreen, openUpgradeScreen, pricing?.insufficientBalance, pricing?.topUpVisible, pricing?.upgradeVisible]);

  const HeaderContent = (
    <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
      <PricingTopBar
        studioName="Audio Studio"
        estimate={visiblePrimaryEstimate}
        primaryEstimateLabel={visiblePrimaryEstimate}
        secondaryEstimateLabel={undefined}
        creditEstimateLabel={displayedCreditEstimate}
        cashEstimateLabel={displayedCashEstimate}
        walletAfterRun={pricingDisplay.creditDetailLabel ?? liveAvailableLabel ?? undefined}
        planName={livePlanLabel ?? undefined}
        includedUsageLeft={pricingDisplay.includedLabel ?? liveCreditBreakdownLabel ?? liveAvailableLabel ?? undefined}
        availabilityLabel={pricingDisplay.creditDetailLabel ?? liveAvailableLabel ?? undefined}
        settlementLabel={displayedNoteLabel}
        noteLabel={displayedNoteLabel}
        entitlementLabel={pricingDisplay.creditBreakdownLabel ?? pricing?.detailLabel ?? undefined}
        displayKind={isPostpaidPricing ? "postpaid" : "credits"}
        billingValue={
          isPostpaidPricing
            ? (
                pricing?.planLabel && String(pricing.planLabel).toLowerCase().includes("enterprise")
                  ? "Enterprise"
                  : "Postpaid"
              )
            : "Credits"
        }
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
        subtitle="Rolling tips based on your current Audio setup."
        tips={studioTips}
        loading={tipsLoading}
        error={tipsError}
        onRefresh={() => {
          void refreshStudioTips();
        }}
      />

      <GlassCard>
        <View>
          <Text style={{ color: DF.text, fontSize: 18, fontWeight: "900" }}>Create voice</Text>
          <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700" }}>
            Match the selected face with the right voice, or pick existing audio from your library, then continue to Fusion.
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={openAudioLibrary}
              disabled={locked || !tokenReady}
              style={{
                flex: 1,
                borderRadius: 14,
                paddingVertical: 12,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.06)",
                opacity: locked || !tokenReady ? 0.7 : 1,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>Use existing audio</Text>
            </Pressable>
          </View>
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
              cachePolicy="none"
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

      {hasExistingLibraryAudio && variants.length === 0 && (
        <GlassCard style={{ marginTop: 12 }}>
          <Text style={{ color: DF.muted, fontWeight: "800", fontSize: 12, marginBottom: 10 }}>Selected Audio</Text>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>
            {existingAudioTitle || "Existing library audio"}
          </Text>
          <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, marginTop: 6 }}>
            {[
              formatDurationLabel(existingAudioDuration),
            ].filter(Boolean).join(" • ") || "Ready to continue"}
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => playPause(-1, existingAudioUrl)}
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
              <Text style={{ color: DF.text, fontWeight: "900" }}>{playingIdx === -1 ? "Pause" : "Play"}</Text>
            </Pressable>

            <Pressable
              onPress={() =>
                proceedToFusion({
                  artifact_id: existingAudioArtifactId || undefined,
                  audio_url: existingAudioUrl,
                  duration_ms: existingAudioDuration.duration_ms ?? undefined,
                  duration_sec: existingAudioDuration.duration_sec ?? undefined,
                } as any)
              }
              disabled={locked || !hasFacePreview}
              style={{
                flex: 1,
                height: 46,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(248,184,72,0.35)",
                backgroundColor: "rgba(232,152,56,0.18)",
                alignItems: "center",
                justifyContent: "center",
                opacity: locked || !hasFacePreview ? 0.6 : 1,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>
                {hasFacePreview ? "Continue to Video" : "Choose a Face Studio face"}
              </Text>
            </Pressable>
          </View>
        </GlassCard>
      )}

      {hasFacePreview && !hasFaceArtifact && (
        <GlassCard
          style={{
            marginTop: 12,
            borderColor: "rgba(255,180,90,0.30)",
            backgroundColor: "rgba(255,180,90,0.10)",
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900" }}>Cinematic video needs a saved Face Studio artifact</Text>
          <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6 }}>
            Talking Video can continue with the selected face preview, but Cinematic Video Direction works best with a saved Face Studio artifact.
          </Text>
        </GlassCard>
      )}

      <GlassCard style={{ marginTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 12 }}>
          <Text style={{ color: DF.text, fontWeight: "900" }}>Script</Text>
          <Pressable
            onPress={() => {
              void requestPromptEnhancement();
            }}
            disabled={locked || !text.trim()}
            style={{
              height: 34,
              borderRadius: 12,
              paddingHorizontal: 12,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.28)",
              backgroundColor: text.trim() ? "rgba(232,152,56,0.12)" : "rgba(255,255,255,0.05)",
              opacity: locked || !text.trim() ? 0.6 : 1,
            }}
          >
            <Text style={{ color: text.trim() ? "rgba(248,232,136,0.95)" : DF.muted, fontWeight: "900", fontSize: 12 }}>
              Enhance
            </Text>
          </Pressable>
        </View>
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
            {pricing?.settlementLabel || "You do not have enough credits for this voice generation right now."}
          </Text>
          {(pricing?.topUpVisible || pricing?.upgradeVisible) && (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              {pricing?.topUpVisible ? (
                <Pressable
                  onPress={openTopUpScreen}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Top Up</Text>
                </Pressable>
              ) : null}
              {pricing?.upgradeVisible ? (
                <Pressable
                  onPress={openUpgradeScreen}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.06)",
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Upgrade</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </GlassCard>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
        <Pressable
          onPress={onPrimaryAction}
          disabled={locked || !faceImageUrl || !tokenReady || !text.trim() || !voice || (!pricingReady && !pricing?.insufficientBalance)}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(248,184,72,0.55)",
            backgroundColor:
              !locked && !!faceImageUrl && !!tokenReady && !!text.trim() && !!voice && (pricingReady || !!pricing?.insufficientBalance)
                ? "rgba(232,152,56,0.18)"
                : "rgba(255,255,255,0.06)",
            alignItems: "center",
            justifyContent: "center",
            opacity: locked || !faceImageUrl || !tokenReady || !text.trim() || !voice || (!pricingReady && !pricing?.insufficientBalance) ? 0.6 : 1,
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
            disabled={locked || selectedIdx == null || !cleanParam((selectedVariant as any)?.audio_url) || !hasFacePreview}
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

  const openHamburgerMenu = useCallback(() => {
    const menuNonce = `${Date.now()}`;
    router.push({
      pathname: "/(tabs)/dashboard" as any,
      params: {
        openMenu: "1",
        menu_nonce: menuNonce,
        menu_source: "audio",
      } as any,
    } as any);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: DF.night }}>
      <DFHeader
        subtitle="Audio Studio"
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
                <Image source={{ uri: faceImageUrl }} style={{ width: "100%", height: 240 }} cachePolicy="none"
              contentFit="contain" />
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
              {!!(finalPricingLabel ?? displayedPrimaryEstimate) && (
                <>
                  <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                    • {isPostpaidPricing ? "Estimated bill" : "Credits charged"}: {visiblePrimaryEstimate}
                  </Text>
                </>
              )}
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                • Next step available: {hasFacePreview ? "Fusion Studio video" : "Select a Face Studio face first"}
              </Text>
            </View>


            <View style={{ marginTop: 16 }}>
              <RunReceiptCard
                pricing={{ ...(pricing as any), stage: finalPricingState as any, reservationId: pricingConfirmation?.quote_id } as any}
                pricingSummary={{
                  estimateLabel: visiblePrimaryEstimate,
                  finalLabel: visiblePrimaryEstimate,
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
                disabled={locked || selectedIdx == null || !cleanParam((selectedVariant as any)?.audio_url) || !hasFacePreview}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(248,184,72,0.35)",
                  backgroundColor: "rgba(232,152,56,0.22)",
                  opacity: locked || !hasFacePreview ? 0.85 : 1,
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
  estimate={visiblePrimaryEstimate}
  billedUnitType={voice ? `Voice • ${voice}` : "Voice generation"}
  includedText={pricingDisplay.creditDetailLabel ?? liveAvailableLabel ?? "Included plan usage applies before wallet or postpaid settlement."}
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
  usageContext={pricingDisplay.creditDetailLabel ?? liveAvailableLabel ?? "Your current included usage or wallet balance is not enough for this run."}
  highlights={[
    "Keep face-to-voice creation moving without restart friction",
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
          setText(nextText);
          setEnhancerOpen(false);
          setStatusText("Enhanced script applied. Review it and generate when ready.");
        }}
      />

      <DFBlockingOverlay
        visible={navLocked}
        title="Opening Fusion Studio…"
        message="Locking your selected face + audio and moving to the next step."
      />
    </View>
  );
}
