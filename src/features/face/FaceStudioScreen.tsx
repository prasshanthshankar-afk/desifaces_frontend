import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  Dimensions,
  ScrollView,
  Platform,
  Share as RNShare,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Slider from "@react-native-community/slider";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import { shareUrl } from "../../core/share/share";
import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import DFBlockingOverlay from "../../core/ui/DFBlockingOverlay";
import { saveCreateFlowContext } from "../../core/media/createFlow";
import { useResolvedPricingDisplay } from "../../core/pricing/resolvePricingDisplay";

import {
  apiCheckFaceSourceImageSafety,
  apiCreateFaceJob,
  apiGetFaceJobStatus,
  apiUploadSourceImage,
} from "./api/creatorFace";
import { fetchFaceMasterdata } from "./api/masterdataFace";

import GlobalJobsTray, {
  type StudioJobItem,
} from "../jobs/components/GlobalJobsTray";

type StudioJobStage = StudioJobItem["stage"];

import { RunReceiptCard } from "../../components/pricing/RunReceiptCard";
import { JobPricingTimeline } from "../../components/pricing/JobPricingTimeline";
import { PricingTopBar } from "../../components/pricing/PricingTopBar";
import PromptEnhancerSheet, {
  type PromptEnhancerResult,
} from "../../components/ai/PromptEnhancerSheet";
import StudioTipsRail, {
  type StudioCoachTip,
} from "../../components/ai/StudioTipsRail";
import { useFacePricingEstimate } from "./hooks/useFacePricingEstimate";

type Mode = "text-to-image" | "image-to-image";
type Opt = { code: string; label: string };

type FaceVariant = {
  image_url: string;
  face_profile_id?: string;
  media_asset_id?: string;
  artifact_id?: string;
  [k: string]: any;
};

type ImageSafetyState = "idle" | "checking" | "passed" | "blocked" | "error";

const COUNTRY_LABEL = "India";



const SHOT_TYPE_OPTIONS: Opt[] = [
  { code: "full_body", label: "Full-Length / Full-Body Shot" },
  { code: "portrait_headshot", label: "Portrait / Headshot" },
  { code: "medium_shot", label: "Medium Shot" },
  { code: "close_up_macro", label: "Close-Up / Macro" },
  { code: "wide_landscape", label: "Wide Shot / Landscape" },
  { code: "low_angle", label: "Low Angle" },
  { code: "high_angle", label: "High Angle" },
  { code: "eye_level", label: "Eye-Level" },
  { code: "three_quarter", label: "Three-Quarter Shot" },
  { code: "over_the_shoulder", label: "Over-the-Shoulder" },
];

function cleanParam(v: any): string {
  if (Array.isArray(v)) v = v[0];
  return String(v ?? "").trim().replace(/^"+|"+$/g, "");
}


function resolveVariantHandoffId(v?: FaceVariant | null): string {
  return cleanParam(
    (v as any)?.artifact_id ??
      (v as any)?.face_artifact_id ??
      (v as any)?.media_asset_id ??
      (v as any)?.face_media_asset_id ??
      ""
  );
}

function logFaceStudioFlow(step: string, payload: any) {
  try {
    console.log("[DF_FLOW][FaceStudio]", step, JSON.stringify(payload, null, 2));
  } catch {
    console.log("[DF_FLOW][FaceStudio]", step, payload);
  }
}


function normalizeFaceSafetyError(error: any): string {
  const status = Number(error?.status ?? error?.response?.status ?? error?.body?.status ?? NaN);
  const detail =
    cleanParam(error?.body?.detail) ||
    cleanParam(error?.body?.message) ||
    cleanParam(error?.body?.error) ||
    cleanParam(error?.reason) ||
    cleanParam(error?.message);

  const lower = detail.toLowerCase();

  if (status == 401 || lower.includes("auth_required") || lower.includes("unauthorized") || lower.includes("invalid_token") || lower.includes("session expired")) {
    return "Your session expired while checking image safety. Please log in again and retry.";
  }

  if (status == 404 || lower.includes("not found")) {
    return "Image safety check route is missing in the active deployment. The frontend should call /api/face/creator/i2i/content-safety/check.";
  }

  if (status == 415 || lower.includes("unsupported media type")) {
    return "This file type is not supported for image safety validation. Please choose a JPG or PNG image.";
  }

  if (status == 413 || lower.includes("too large") || lower.includes("payload too large")) {
    return "This image is too large for content safety validation. Please choose a smaller JPG or PNG image.";
  }

  if (status == 422 || lower.includes("field required") || lower.includes("validation error")) {
    return detail ? `Image safety check request was rejected: ${detail}` : "Image safety check request was rejected by the backend.";
  }

  if (!Number.isNaN(status) && detail) {
    return `Image safety check failed (${status}): ${detail}`;
  }

  return detail || "Image safety validation failed. Please try again with another photo.";
}

type FacePromptEnhancePayload = {
  mode: Mode;
  user_input: string;
  locked_fields?: Record<string, any>;
  context?: Record<string, any>;
  locale?: string;
  max_alternatives?: number;
};

type FaceTipsPayload = {
  mode: Mode;
  prompt?: string;
  form_state?: Record<string, any>;
  context?: Record<string, any>;
  locale?: string;
  limit?: number;
};

function friendlyLabel(v: any): string {
  const raw = cleanParam(v);
  if (!raw) return "";
  if (raw.toLowerCase() === "optional") return "";
  return raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function dedupeParts(parts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const value = cleanParam(part);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function getFaceApiBaseUrl(): string {
  const env = ((globalThis as any)?.process?.env ?? {}) as Record<string, string | undefined>;
  const raw =
    cleanParam(env.EXPO_PUBLIC_FACE_BASE_URL) ||
    cleanParam(env.EXPO_PUBLIC_API_FACE_URL) ||
    cleanParam(env.FACE_BASE_URL) ||
    "";
  return raw.replace(/\/+$/, "");
}

function resolveFaceApiUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const base = getFaceApiBaseUrl();

  if (!base) return `/api/face${suffix}`;
  if (/\/api\/face$/i.test(base) || /\/face$/i.test(base)) return `${base}${suffix}`;
  return `${base}/api/face${suffix}`;
}

function buildFaceAiHeaders(authLike: any): Record<string, string> {
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

async function postFaceAiJson<T>(path: string, body: any, authLike: any): Promise<T> {
  const response = await fetch(resolveFaceApiUrl(path), {
    method: "POST",
    headers: buildFaceAiHeaders(authLike),
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
    throw new Error(detail);
  }

  return parsed as T;
}

function buildLocalFacePrompt(
  userInput: string,
  lockedFields: Record<string, any>,
  flavor: "primary" | "commercial" | "natural" | "premium"
): string {
  const shot = friendlyLabel(lockedFields?.shot_type_label);
  const region = friendlyLabel(lockedFields?.region_label);
  const zone = friendlyLabel(lockedFields?.zone_label);
  const context = friendlyLabel(lockedFields?.context_label);
  const useCase = friendlyLabel(lockedFields?.use_case_label);
  const aspect = cleanParam(lockedFields?.aspect_ratio);
  const modeValue = cleanParam(lockedFields?.mode);
  const gender = cleanParam(lockedFields?.gender);

  const styleByFlavor =
    flavor === "commercial"
      ? "premium commercial photography, crisp composition, polished styling, realistic lighting"
      : flavor === "natural"
        ? "natural lifestyle realism, candid energy, believable styling, soft authentic light"
        : flavor === "premium"
          ? "premium editorial portrait, refined styling, cinematic realism, elegant lighting"
          : "high-quality portrait, realistic lighting, clean composition, culturally respectful";

  const identityGuard =
    modeValue === "image-to-image"
      ? "same person and identity preserved from the source photo"
      : gender
        ? `${gender} presentation preserved`
        : "";

  return dedupeParts([
    userInput,
    identityGuard,
    region ? `authentic ${region} visual cues` : zone ? `authentic ${zone} regional cues` : "",
    context ? `${context} context` : "",
    useCase ? `${useCase} use case` : "",
    shot ? `${shot} framing` : "",
    aspect ? `optimized for ${aspect} aspect ratio` : "",
    styleByFlavor,
    "family-friendly, culturally respectful",
  ]).join(", ");
}

function buildLocalFaceEnhancement(
  userInput: string,
  lockedFields: Record<string, any>,
  context: Record<string, any>
): PromptEnhancerResult {
  const variants = Number(lockedFields?.num_variants ?? context?.num_variants ?? 4);
  const preservation = Number(lockedFields?.preservation_strength ?? 0);
  const sourceHint =
    cleanParam(lockedFields?.mode) === "image-to-image"
      ? `Identity strength ${preservation.toFixed(2)} keeps the same person while allowing styling change.`
      : "The rewrite adds explicit framing, quality, and scene direction without changing your chosen identity inputs.";

  return {
    original_input: userInput,
    enhanced_input: buildLocalFacePrompt(userInput, lockedFields, "primary"),
    alternatives: [
      { label: "Commercial", text: buildLocalFacePrompt(userInput, lockedFields, "commercial") },
      { label: "Natural lifestyle", text: buildLocalFacePrompt(userInput, lockedFields, "natural") },
      { label: "Premium editorial", text: buildLocalFacePrompt(userInput, lockedFields, "premium") },
    ],
    tips: dedupeParts([
      friendlyLabel(lockedFields?.shot_type_label) ? "" : "Add one framing cue like close-up, medium shot, or full-body.",
      friendlyLabel(lockedFields?.context_label) ? "" : "Add a clear setting so the background looks intentional instead of generic.",
      variants > 4 ? "Run 2 to 4 variants first when you are testing a new idea to save credits." : "",
      cleanParam(lockedFields?.mode) === "image-to-image" ? "Keep the prompt focused on styling and scene changes when identity lock is on." : "Call out attire, lighting, and mood together for more reliable results.",
      sourceHint,
    ]),
    why_this_is_better: sourceHint,
    source: "fallback",
    fallback_used: true,
    structured: {
      shot_type: friendlyLabel(lockedFields?.shot_type_label),
      region: friendlyLabel(lockedFields?.region_label),
      context: friendlyLabel(lockedFields?.context_label),
      use_case: friendlyLabel(lockedFields?.use_case_label),
      aspect_ratio: cleanParam(lockedFields?.aspect_ratio),
      num_variants: variants,
    },
  };
}

function buildLocalFaceTips(input: {
  mode: Mode;
  prompt: string;
  shotTypeLabel: string;
  contextLabel: string;
  useCaseLabel: string;
  aspectRatio: string;
  numVariants: number;
  imageSafetyState: ImageSafetyState;
  planLabel?: string | null;
  availableLabel?: string | null;
}): StudioCoachTip[] {
  const tips: StudioCoachTip[] = [];
  const plan = cleanParam(input.planLabel).toLowerCase();

  if (!friendlyLabel(input.shotTypeLabel)) {
    tips.push({
      id: "face-tip-framing",
      title: "Lock the framing",
      body: "Use one framing term like headshot, medium shot, or full-body so composition stays consistent.",
      tone: "premium",
    });
  }

  if (!friendlyLabel(input.contextLabel)) {
    tips.push({
      id: "face-tip-context",
      title: "Name the setting",
      body: "Adding a clear environment helps the background feel intentional instead of generic.",
      tone: "neutral",
    });
  }

  if (!friendlyLabel(input.useCaseLabel)) {
    tips.push({
      id: "face-tip-usecase",
      title: "Match the use case",
      body: "Describe whether this is for profile, promo, editorial, or social so the styling fits the end use.",
      tone: "neutral",
    });
  }

  if (input.mode === "image-to-image") {
    tips.push({
      id: "face-tip-i2i",
      title: "Preserve identity cleanly",
      body:
        input.imageSafetyState === "passed"
          ? "With identity lock, ask for styling, lighting, attire, and background changes instead of changing the person."
          : "Use a clean, well-lit source photo facing the camera to improve Edit Face reliability.",
      tone: "success",
    });
  } else {
    tips.push({
      id: "face-tip-prompt",
      title: "Bundle mood and light",
      body: "Put attire, mood, and lighting in the same sentence to reduce flat or generic outputs.",
      tone: "premium",
    });
  }

  if (input.numVariants > 4 || plan.includes("free")) {
    tips.push({
      id: "face-tip-cost",
      title: "Save credits while testing",
      body: "Try 2 to 4 variants first, then scale up only after the prompt direction feels right.",
      tone: "warning",
    });
  }

  tips.push({
    id: "face-tip-aspect",
    title: "Choose the downstream frame",
    body: `You are currently building for ${input.aspectRatio}. Keep the face composition centered if you plan to continue into Audio and Fusion.`,
    tone: "neutral",
  });

  return tips.slice(0, 4);
}

function findPreferredOption(options: Opt[], preferredCodes: string[]) {
  const wanted = preferredCodes.map((x) => x.toLowerCase());
  return options.find((opt) => wanted.includes(String(opt.code).toLowerCase())) ?? null;
}

function normalizeAspectRatio(v: any): "9:16" | "16:9" | "1:1" {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "16:9" || s === "landscape") return "16:9";
  if (s === "1:1" || s === "square") return "1:1";
  return "9:16";
}

function stageFromStatus(status: string): StudioJobStage {
  const s = String(status || "").toLowerCase();
  if (s === "queued") return "queued";
  if (s === "preparing") return "preparing";
  if (s === "processing" || s === "running") return "running";
  if (s === "finalizing") return "finalizing";
  if (s === "succeeded") return "succeeded";
  if (s === "failed") return "failed";
  return "running";
}

function nextProgress(prev: number, stage: StudioJobStage): number {
  const floor =
    stage === "queued"
      ? 0.12
      : stage === "preparing"
        ? 0.24
        : stage === "running"
          ? Math.min(0.82, prev + 0.05)
          : stage === "finalizing"
            ? 0.92
            : stage === "succeeded"
              ? 1
              : prev;

  return Math.max(prev, floor);
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

function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.055)",
          padding: 14,
          shadowColor: "#000",
          shadowOpacity: Platform.OS === "ios" ? 0.18 : 0,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>{title}</Text>
        {!!subtitle && (
          <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 12 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

function SelectorChip({
  label,
  value,
  onPress,
  disabled,
  width,
  flex,
  emphasis = "default",
}: {
  label: string;
  value: string;
  onPress?: () => void;
  disabled?: boolean;
  width?: any;
  flex?: number;
  emphasis?: "default" | "wide" | "fixed";
}) {
  const clickable = !!onPress && !disabled;
  const isWide = emphasis === "wide";
  const isFixed = emphasis === "fixed";

  return (
    <Pressable
      disabled={!clickable}
      onPress={onPress}
      style={{
        width,
        flex,
        minHeight: isWide ? 72 : 64,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: isWide ? "rgba(248,184,72,0.18)" : "rgba(255,255,255,0.10)",
        backgroundColor: disabled
          ? "rgba(255,255,255,0.03)"
          : isWide
            ? "rgba(248,184,72,0.08)"
            : "rgba(255,255,255,0.05)",
        paddingVertical: 10,
        paddingHorizontal: 12,
        justifyContent: "center",
        opacity: disabled ? 0.72 : 1,
      }}
    >
      <Text style={{ color: isFixed ? "rgba(255,255,255,0.48)" : "rgba(255,255,255,0.58)", fontWeight: "900", fontSize: 10 }}>
        {label}
      </Text>

      <View
        style={{
          marginTop: 6,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            color: DF.text,
            fontWeight: "900",
            fontSize: isWide ? 13 : 12,
            lineHeight: isWide ? 16 : 15,
            flex: 1,
          }}
        >
          {value}
        </Text>

        {!!onPress && (
          <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900", fontSize: 14 }}>
            ›
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function Segmented({
  value,
  onChange,
  disabled,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
  disabled?: boolean;
}) {
  const Option = ({
    active,
    label,
    subtitle,
    onPress,
  }: {
    active: boolean;
    label: string;
    subtitle: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
        backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <Text
        style={{
          color: active ? "rgba(248,232,136,1)" : DF.text,
          fontWeight: "900",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 11 }}>
        {subtitle}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        padding: 4,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(248,184,72,0.18)",
        backgroundColor: "rgba(8,8,8,0.55)",
      }}
    >
      <Option
        active={value === "text-to-image"}
        label="Create Face"
        subtitle="Generate from prompt"
        onPress={() => onChange("text-to-image")}
      />
      <Option
        active={value === "image-to-image"}
        label="Edit Face"
        subtitle="Use a source photo"
        onPress={() => onChange("image-to-image")}
      />
    </View>
  );
}

function VariantsControl({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const clamp = (n: number) => Math.max(1, Math.min(8, n));
  const set = (n: number) => onChange(clamp(n));
  const presets = [2, 4, 6, 8];

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: 12,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Variants</Text>
        <View
          style={{
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(248,184,72,0.30)",
            backgroundColor: "rgba(232,152,56,0.12)",
          }}
        >
          <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900", fontSize: 12 }}>{value}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" }}>
        <Pressable
          onPress={() => set(value - 1)}
          disabled={disabled || value <= 1}
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(0,0,0,0.22)",
            opacity: disabled || value <= 1 ? 0.45 : 1,
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>–</Text>
        </Pressable>

        <Pressable
          onPress={() => set(value + 1)}
          disabled={disabled || value >= 8}
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(0,0,0,0.22)",
            opacity: disabled || value >= 8 ? 0.45 : 1,
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>+</Text>
        </Pressable>

        <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
          {presets.map((n) => {
            const active = value === n;
            return (
              <Pressable
                key={n}
                onPress={() => set(n)}
                disabled={disabled}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: active ? "rgba(248,184,72,0.40)" : "rgba(255,255,255,0.10)",
                  backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
                }}
              >
                <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900" }}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
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
  const BG = (DF as any)?.night ?? "#0E0F14";

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} onPress={onClose} />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: BG,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          maxHeight: "70%",
        }}
      >
        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>{title}</Text>
          <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 12 }}>
            Tap to select.
          </Text>
        </View>

        <FlatList
          data={items}
          keyExtractor={(x) => x.code}
          contentContainerStyle={{ padding: 10, paddingBottom: 18 }}
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

function ImageViewerModal({
  open,
  uri,
  title,
  canSelect,
  onBackToVariants,
  onSelectThis,
}: {
  open: boolean;
  uri: string | null;
  title?: string;
  canSelect: boolean;
  onBackToVariants: () => void;
  onSelectThis: () => void;
}) {
  const { width, height } = Dimensions.get("window");
  const cleanUri = useMemo(() => cleanParam(uri), [uri]);

  const onShare = useCallback(async () => {
    if (!cleanUri) return;

    try {
      await shareUrl(cleanUri, { title: "DesiFaces • Face", message: "Generated face" });
      return;
    } catch {}

    try {
      if (Platform.OS === "ios") {
        await RNShare.share({ url: cleanUri, message: cleanUri });
      } else {
        await RNShare.share({ message: cleanUri });
      }
    } catch {}
  }, [cleanUri]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onBackToVariants}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)" }} />

      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: 52,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={onBackToVariants}
          style={{
            borderRadius: 999,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            backgroundColor: "rgba(255,255,255,0.06)",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.92)", fontWeight: "900" }}>← Variants</Text>
        </Pressable>

        <Text style={{ color: "rgba(255,255,255,0.86)", fontWeight: "900", fontSize: 14 }}>
          {title ?? "Preview"}
        </Text>

        <View style={{ width: 92 }} />
      </View>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
        pointerEvents="box-none"
      >
        {!!cleanUri ? (
          <ScrollView
            style={{ width, height }}
            contentContainerStyle={{
              width,
              height,
              alignItems: "center",
              justifyContent: "center",
              paddingTop: Platform.OS === "ios" ? 12 : 0,
            }}
            maximumZoomScale={3}
            minimumZoomScale={1}
            bouncesZoom
            pinchGestureEnabled={Platform.OS === "ios"}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              key={cleanUri}
              source={{ uri: cleanUri }}
              style={{ width, height }}
              cachePolicy="none"
              contentFit="contain"
              transition={180}
            />
          </ScrollView>
        ) : null}
      </View>

      <View
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 22,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(10,10,12,0.72)",
          padding: 10,
        }}
      >
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={onShare}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.28)",
              backgroundColor: "rgba(232,152,56,0.12)",
            }}
          >
            <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900" }}>Share</Text>
          </Pressable>

          <Pressable
            onPress={onSelectThis}
            disabled={!canSelect}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.40)",
              backgroundColor: canSelect ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.06)",
              opacity: canSelect ? 1 : 0.6,
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>Continue</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={onBackToVariants}
          style={{
            marginTop: 10,
            height: 44,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.05)",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.88)", fontWeight: "900" }}>Back to Variants</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export default function FaceStudioScreen() {
  const auth = useAuth() as any;
  const queryClient = useQueryClient();
  const { isReady, isAuthed } = auth;
  const faceAiAuth = useMemo(
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

  const flow = useCreatorFlow() as any;
  const { setFaceSelection } = flow;
  const resetCreatorFlow = flow?.resetCreatorFlow as undefined | ((nextOwnerKey?: string) => void);
  const setCreatorFlowOwner = flow?.setCreatorFlowOwner as undefined | ((ownerKey?: string) => void);
  const authUserId = faceAiAuth.userId || "";
  const hasFacePricingAuth = Boolean(faceAiAuth.token && faceAiAuth.userId);
  const authSessionKey = authUserId || "anon";
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);

  const BG = (DF as any)?.night ?? "#0E0F14";
  const BG2 = (DF as any)?.night2 ?? "#141824";
  const screenWidth = Dimensions.get("window").width;
  const pageHorizontalPadding = 14;
  const cardHorizontalPadding = 14;
  const creativeGridGap = 10;
  const creativeSingleColumn = screenWidth < 360;
  const creativeAspectInline = screenWidth >= 382;
  const variantCardWidth = Math.min(Math.max(screenWidth * 0.72, 236), screenWidth - 76);

  const [mode, setMode] = useState<Mode>("text-to-image");
  const [prompt, setPrompt] = useState("");
  const [numVariants, setNumVariants] = useState(4);

  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [sourceImageAssetId, setSourceImageAssetId] = useState<string | null>(null);
  const [preservationStrength, setPreservationStrength] = useState(0.25);

  const [imageSafetyState, setImageSafetyState] = useState<ImageSafetyState>("idle");
  const [imageSafetyReason, setImageSafetyReason] = useState<string | null>(null);

  const [gender, setGender] = useState<"male" | "female">("female");
  const [zoneCode, setZoneCode] = useState<string | null>(null);
  const [regionCode, setRegionCode] = useState<string | null>(null);
  const [contextCode, setContextCode] = useState<string | null>(null);
  const [useCaseCode, setUseCaseCode] = useState<string | null>(null);
  const [shotTypeCode, setShotTypeCode] = useState<string | null>("portrait_headshot");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(normalizeAspectRatio(flow?.fusionAspectRatio || "9:16"));

  const [openZone, setOpenZone] = useState(false);
  const [openRegion, setOpenRegion] = useState(false);
  const [openContext, setOpenContext] = useState(false);
  const [openUseCase, setOpenUseCase] = useState(false);
  const [openShotType, setOpenShotType] = useState(false);

  const [uploadingSource, setUploadingSource] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [uiLocked, setUiLocked] = useState(false);

  const [inlineStatus, setInlineStatus] = useState<string | null>(null);

  const [variants, setVariants] = useState<FaceVariant[]>([]);

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

    resetCreatorFlow?.(authUserId || undefined);
    setVariants([]);
    setSelectedIdx(null);
    setPickedUri(null);
    setSourceImageUrl(null);
    setSourceImageAssetId(null);
    setImageSafetyState("idle");
    setImageSafetyReason(null);
    setInlineStatus(null);
    setUploadingSource(false);
    setCreatingJob(false);
    setFinalPricingLabel(null);
    setFinalPricingState("estimated");
    setFinalPricingMessage(null);

    void queryClient.removeQueries({
      predicate: (query: any) => {
        const key = JSON.stringify(query?.queryKey ?? "").toLowerCase();
        return (
          key.includes("pricing") ||
          key.includes("credit") ||
          key.includes("balance") ||
          key.includes("dashboard") ||
          key.includes("subscription") ||
          key.includes("plan")
        );
      },
    });
    void queryClient.invalidateQueries({
      predicate: (query: any) => {
        const key = JSON.stringify(query?.queryKey ?? "").toLowerCase();
        return key.includes("pricing") || key.includes("credit") || key.includes("balance") || key.includes("dashboard");
      },
    });
  }, [authSessionKey, authUserId, isReady, queryClient, resetCreatorFlow, setCreatorFlowOwner]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [resultsJobId, setResultsJobId] = useState<string | null>(null);

  const [jobs, setJobs] = useState<StudioJobItem[]>([]);
  const [backgroundNotice, setBackgroundNotice] = useState<string | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState<string>("Preview");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const [finalPricingLabel, setFinalPricingLabel] = useState<string | null>(null);
  const [finalPricingState, setFinalPricingState] = useState<"estimated" | "committed" | "released">("estimated");
  const [finalPricingMessage, setFinalPricingMessage] = useState<string | null>(null);
  const [workflowSummaryOpen, setWorkflowSummaryOpen] = useState(false);
  const [enhancerOpen, setEnhancerOpen] = useState(false);
  const [enhancerLoading, setEnhancerLoading] = useState(false);
  const [enhancerError, setEnhancerError] = useState<string | null>(null);
  const [enhancerResult, setEnhancerResult] = useState<PromptEnhancerResult | null>(null);
  const [studioTips, setStudioTips] = useState<StudioCoachTip[]>([]);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);

  const pollingCancelledRef = useRef(false);
  const tipsRequestSeq = useRef(0);

  useEffect(() => {
    return () => {
      pollingCancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!backgroundNotice) return;
    const t = setTimeout(() => setBackgroundNotice(null), 5000);
    return () => clearTimeout(t);
  }, [backgroundNotice]);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthed) router.replace("/(auth)/login");
  }, [isReady, isAuthed]);

  const mdQ = useQuery({
    queryKey: ["masterdata-face", "en"],
    queryFn: () => fetchFaceMasterdata("en"),
    enabled: isReady && isAuthed,
    staleTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0,
  });

  const md = mdQ.data as any;
  const mdLoading = mdQ.isFetching || mdQ.isLoading;
  const mdErr = (mdQ.error as any)?.message ? String((mdQ.error as any).message) : null;

  const zoneOptions: Opt[] = useMemo(() => {
    if (!md?.regions?.length) return [];

    const active = md.regions.filter((r: any) => r.is_active);
    const unique: string[] = Array.from(
      new Set(
        active
          .map((r: any) => r.sub_region)
          .filter((z: any): z is string => typeof z === "string" && z.trim().length > 0)
      )
    );

    unique.sort((a, b) => a.localeCompare(b));
    return unique.map((z) => ({ code: z, label: z }));
  }, [md]);

  const regionOptions: Opt[] = useMemo(() => {
    if (!md?.regions?.length) return [];
    const active = md.regions.filter((r: any) => r.is_active);
    const filtered = zoneCode ? active.filter((r: any) => r.sub_region === zoneCode) : active;
    filtered.sort(
      (a: any, b: any) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label))
    );
    return filtered.map((r: any) => ({ code: r.code, label: r.label }));
  }, [md, zoneCode]);

  const contextOptions: Opt[] = useMemo(() => {
    if (!md?.contexts?.length) return [];
    const active = md.contexts.filter((c: any) => c.is_active);
    active.sort(
      (a: any, b: any) =>
        (b.glamour_level ?? 0) - (a.glamour_level ?? 0) || String(a.label).localeCompare(String(b.label))
    );
    return active.map((c: any) => ({ code: c.code, label: c.label }));
  }, [md]);

  const useCaseOptions: Opt[] = useMemo(() => {
    if (!md?.use_cases?.length) return [];
    const active = md.use_cases.filter((u: any) => u.is_active);
    active.sort(
      (a: any, b: any) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label))
    );
    return active.map((u: any) => ({ code: u.code, label: u.label }));
  }, [md]);

  useEffect(() => {
    if (!md) return;

    if (!zoneCode) {
      const north = zoneOptions.find((x) => x.code.toLowerCase() === "north");
      setZoneCode(north?.code ?? zoneOptions[0]?.code ?? null);
    }

    if (!regionCode) {
      const delhi = md.regions?.find((r: any) => r.is_active && r.code === "delhi_ncr");
      setRegionCode(delhi?.code ?? regionOptions[0]?.code ?? null);
    }

    if (!contextCode) {
      const genericContext = findPreferredOption(contextOptions, [
        "generic",
        "general",
        "neutral",
        "lifestyle",
        "casual",
        "everyday",
        "standard",
      ]);
      setContextCode(genericContext?.code ?? null);
    }

    if (!useCaseCode) {
      const genericUseCase = findPreferredOption(useCaseOptions, [
        "generic",
        "general",
        "profile_photo",
        "profile",
        "personal",
        "social_profile",
        "everyday",
      ]);
      setUseCaseCode(genericUseCase?.code ?? null);
    }
  }, [md, zoneCode, zoneOptions, regionCode, regionOptions, contextCode, contextOptions, useCaseCode, useCaseOptions]);

  useEffect(() => {
    if (!zoneCode || !regionCode) return;
    const ok = regionOptions.some((r) => r.code === regionCode);
    if (!ok) setRegionCode(regionOptions[0]?.code ?? null);
  }, [zoneCode, regionOptions, regionCode]);

  const resetI2ISourceState = useCallback((clearPickedUri: boolean = true) => {
    if (clearPickedUri) setPickedUri(null);
    setSourceImageUrl(null);
    setSourceImageAssetId(null);
    setImageSafetyState("idle");
    setImageSafetyReason(null);
  }, []);

  useEffect(() => {
    if (mode === "text-to-image") {
      resetI2ISourceState(true);
    }
  }, [mode, resetI2ISourceState]);

  const regionLabel = zoneOptions.find((x) => x.code === zoneCode)?.label ?? "Select";
  const stateLabel = regionOptions.find((x) => x.code === regionCode)?.label ?? "Select";
  const contextLabel = contextOptions.find((x) => x.code === contextCode)?.label ?? "Optional";
  const useCaseLabel = useCaseOptions.find((x) => x.code === useCaseCode)?.label ?? "Optional";
  const shotTypeLabel = SHOT_TYPE_OPTIONS.find((x) => x.code === shotTypeCode)?.label ?? "Select";

  const faceEnhancerLockedFields = useMemo(
    () => ({
      mode,
      gender,
      country: COUNTRY_LABEL,
      zone_code: zoneCode,
      zone_label: regionLabel,
      region_code: regionCode,
      region_label: stateLabel,
      context_code: contextCode,
      context_label: contextLabel,
      use_case_code: useCaseCode,
      use_case_label: useCaseLabel,
      shot_type_code: shotTypeCode,
      shot_type_label: shotTypeLabel,
      aspect_ratio: aspectRatio,
      num_variants: numVariants,
      preservation_strength: mode === "image-to-image" ? preservationStrength : undefined,
    }),
    [
      mode,
      gender,
      zoneCode,
      regionLabel,
      regionCode,
      stateLabel,
      contextCode,
      contextLabel,
      useCaseCode,
      useCaseLabel,
      shotTypeCode,
      shotTypeLabel,
      aspectRatio,
      numVariants,
      preservationStrength,
    ]
  );

  const hasValidI2ISource =
    mode !== "image-to-image" ||
    ((!!sourceImageUrl || !!sourceImageAssetId) && imageSafetyState === "passed");

  const canGenerate = useMemo(() => {
    const hasPrompt = prompt.trim().length > 0;
    if (!hasPrompt) return false;
    if (!gender || !zoneCode || !regionCode) return false;
    if (mode === "image-to-image") return hasValidI2ISource;
    return true;
  }, [prompt, gender, zoneCode, regionCode, mode, hasValidI2ISource]);

  const pricingPreviewEligible =
    prompt.trim().length > 0 &&
    !mdLoading &&
    !mdErr &&
    !!gender &&
    !!zoneCode &&
    !!regionCode &&
    hasValidI2ISource;

  const pricingPreviewEnabled = hasFacePricingAuth && pricingPreviewEligible;

  const pricingQ = useFacePricingEstimate({
    mode,
    prompt,
    numVariants,
    preservationStrength,
    sourceImageUrl,
    sourceImageAssetId,
    aspectRatio,
    gender,
    regionCode,
    contextCode,
    useCaseCode,
    shotTypeCode,
    enabled: pricingPreviewEnabled,
  });

  const rawPricing = pricingQ.data;
  const pricing =
    mode === "image-to-image" && !hasValidI2ISource
      ? null
      : rawPricing;

  const pricingConfirmation = pricing?.confirmation ?? null;
  const pricingReady = Boolean(pricingConfirmation?.quote_id);
  const pricingHasResponse = pricing != null || pricingQ.data != null;

  useEffect(() => {
    if (!pricingPreviewEnabled) return;
    if (pricingReady) return;
    if (pricingHasResponse) return;
    if (pricingQ.isFetching) return;

    const t = setTimeout(() => {
      pricingQ.refetch().catch(() => {});
    }, 120);
    return () => clearTimeout(t);
  }, [
    pricingPreviewEnabled,
    pricingReady,
    pricingHasResponse,
    pricingQ.isFetching,
    pricingQ.refetch,
    mode,
    prompt,
    numVariants,
    preservationStrength,
    sourceImageUrl,
    sourceImageAssetId,
    aspectRatio,
    gender,
    regionCode,
    contextCode,
    useCaseCode,
    shotTypeCode,
  ]);
  const displayedEstimateLabel =
    finalPricingLabel ??
    pricing?.primaryEstimateLabel ??
    pricing?.estimateLabel ??
    (pricingQ.isFetching ? "Refreshing estimate…" : "Enter prompt to see estimate");
  const isPostpaidPricing =
    ((() => {
      const settlementMode = cleanParam(pricing?.pricing?.settlementMode).toLowerCase();
      const settlement = cleanParam(pricing?.settlementLabel).toLowerCase();
      const availability = cleanParam(pricing?.availableLabel).toLowerCase();
      return (
        settlementMode === "postpaid" ||
        settlement.includes("billed after completion") ||
        settlement.includes("enterprise invoicing") ||
        settlement.includes("postpaid") ||
        availability.includes("billed after completion")
      );
    })());
  const visiblePrimaryEstimate = isPostpaidPricing
    ? cleanParam(finalPricingLabel) || pricing?.moneyEstimateLabel || displayedEstimateLabel
    : pricing?.creditEstimateLabel || displayedEstimateLabel;
  const visibleSecondaryEstimate = undefined;
  const visibleCreditEstimate = isPostpaidPricing ? null : (pricing?.creditEstimateLabel ?? null);
  const visibleCashEstimate = isPostpaidPricing
    ? (cleanParam(finalPricingLabel) || pricing?.moneyEstimateLabel || null)
    : null;
  const displayedPricingDetail = isPostpaidPricing
    ? `Estimated bill: ${visibleCashEstimate ?? "—"}`
    : `Credits charged: ${visibleCreditEstimate ?? "—"}`;
  const displayedSettlementLabel =
    isPostpaidPricing
      ? "Billed after completion through your postpaid account."
      : "Covered by your available credits.";

  const refreshStudioTips = useCallback(async () => {
    const requestId = ++tipsRequestSeq.current;
    const fallbackTips = buildLocalFaceTips({
      mode,
      prompt,
      shotTypeLabel,
      contextLabel,
      useCaseLabel,
      aspectRatio,
      numVariants,
      imageSafetyState,
      planLabel: pricing?.planLabel ?? null,
      availableLabel: pricing?.availableLabel ?? null,
    });

    if (!isReady || !isAuthed) {
      setStudioTips(fallbackTips);
      setTipsError(null);
      return;
    }

    setTipsLoading(true);
    setTipsError(null);

    try {
      const response = await postFaceAiJson<{
        tips?: StudioCoachTip[];
      }>(
        "/creator/tips",
        {
          mode,
          prompt: prompt.trim(),
          form_state: {
            ...faceEnhancerLockedFields,
            image_safety_state: imageSafetyState,
          },
          context: {
            plan_name: pricing?.planLabel ?? null,
            available_label: pricing?.availableLabel ?? null,
            estimate_label: pricing?.estimateLabel ?? null,
            insufficient_balance: pricing?.insufficientBalance ?? false,
          },
          locale: "en",
          limit: 4,
        },
        faceAiAuth
      );

      if (requestId !== tipsRequestSeq.current) return;
      const nextTips = Array.isArray(response?.tips) && response.tips.length > 0 ? response.tips : fallbackTips;
      setStudioTips(nextTips);
      setTipsError(null);
    } catch {
      if (requestId !== tipsRequestSeq.current) return;
      setStudioTips(fallbackTips);
      setTipsError(null);
    } finally {
      if (requestId === tipsRequestSeq.current) setTipsLoading(false);
    }
  }, [
    mode,
    prompt,
    shotTypeLabel,
    contextLabel,
    useCaseLabel,
    aspectRatio,
    numVariants,
    imageSafetyState,
    pricing?.planLabel,
    pricing?.availableLabel,
    pricing?.estimateLabel,
    pricing?.insufficientBalance,
    faceEnhancerLockedFields,
    faceAiAuth,
    isReady,
    isAuthed,
  ]);

  const requestPromptEnhancement = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setInlineStatus("Add a prompt first, then tap Enhance.");
      return;
    }

    setEnhancerOpen(true);
    setEnhancerLoading(true);
    setEnhancerError(null);

    const fallbackResult = buildLocalFaceEnhancement(trimmed, faceEnhancerLockedFields, {
      plan_name: pricing?.planLabel ?? null,
      available_label: pricing?.availableLabel ?? null,
      estimate_label: pricing?.estimateLabel ?? null,
    });

    try {
      const response = await postFaceAiJson<PromptEnhancerResult>(
        "/creator/prompt/enhance",
        {
          mode,
          user_input: trimmed,
          locked_fields: faceEnhancerLockedFields,
          context: {
            plan_name: pricing?.planLabel ?? null,
            available_label: pricing?.availableLabel ?? null,
            estimate_label: pricing?.estimateLabel ?? null,
            image_safety_state: imageSafetyState,
          },
          locale: "en",
          max_alternatives: 3,
        },
        faceAiAuth
      );

      setEnhancerResult(response?.enhanced_input ? response : fallbackResult);
      setEnhancerError(null);
    } catch {
      setEnhancerResult(fallbackResult);
      setEnhancerError("Live prompt enhancement is unavailable right now. Showing a smart local rewrite instead.");
    } finally {
      setEnhancerLoading(false);
    }
  }, [
    prompt,
    faceEnhancerLockedFields,
    pricing?.planLabel,
    pricing?.availableLabel,
    pricing?.estimateLabel,
    imageSafetyState,
    faceAiAuth,
  ]);

  useEffect(() => {
    if (!isReady || !isAuthed) return;
    const timer = setTimeout(() => {
      void refreshStudioTips();
    }, 550);
    return () => clearTimeout(timer);
  }, [refreshStudioTips, isReady, isAuthed]);

  const openViewer = useCallback((uri: string, title?: string, index?: number) => {
    const u = cleanParam(uri);
    setViewerUri(u || null);
    setViewerTitle(title ?? "Preview");
    setViewerIndex(typeof index === "number" ? index : null);
    setViewerOpen(true);
  }, []);

  const closeViewer = useCallback(() => setViewerOpen(false), []);

  const updateJob = useCallback(
    (
      jobId: string,
      patch: Partial<StudioJobItem> | ((prev: StudioJobItem) => StudioJobItem)
    ) => {
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
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  function normalizeVariants(resp: any): FaceVariant[] {
    const v =
      (Array.isArray(resp?.variants) && resp.variants) ||
      (Array.isArray(resp?.result?.variants) && resp.result.variants) ||
      [];
    return v.filter((x: any) => !!cleanParam(x?.image_url));
  }

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setInlineStatus("Please allow Photos access to use Edit Face.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (result.canceled) return;

    const asset = result.assets?.[0] as any;
    const uri = cleanParam(asset?.uri);
    if (!uri) return;

    const mimeType = cleanParam(asset?.mimeType) || "image/jpeg";
    const fileName = cleanParam(asset?.fileName) || `source-${Date.now()}.jpg`;

    setPickedUri(uri);
    setSourceImageUrl(null);
    setSourceImageAssetId(null);
    setImageSafetyState("checking");
    setImageSafetyReason(null);
    setInlineStatus("Checking image safety…");
    setUploadingSource(true);

    try {
      const safety = await apiCheckFaceSourceImageSafety({
        localUri: uri,
        mimeType,
        fileName,
      });

      const allow = safety?.allow === true;

      if (!allow) {
        const reason =
          cleanParam(safety?.reason) ||
          "This image did not pass desifaces.ai content safety checks. Please choose another photo.";

        setImageSafetyState("blocked");
        setImageSafetyReason(reason);
        setPickedUri(null);
        setSourceImageUrl(null);
        setSourceImageAssetId(null);
        setInlineStatus(reason);
        return;
      }

      setImageSafetyState("passed");
      setImageSafetyReason(null);
      setInlineStatus("Image passed content safety. Uploading source image…");

      const up = await apiUploadSourceImage(uri, { mimeType, fileName });
      const nextUrl = cleanParam(up?.image_url);
      const nextAssetId = cleanParam(up?.asset_id);

      if (!nextUrl) {
        setImageSafetyState("error");
        setImageSafetyReason("Upload completed but source image URL was missing.");
        setSourceImageUrl(null);
        setSourceImageAssetId(null);
        setInlineStatus("Upload completed but source image URL was missing.");
        return;
      }

      setSourceImageUrl(nextUrl);
      setSourceImageAssetId(nextAssetId || null);
      setInlineStatus("Source image ready. Refreshing estimate…");
    } catch (e: any) {
      const message = normalizeFaceSafetyError(e);

      setImageSafetyState("error");
      setImageSafetyReason(message);
      setPickedUri(null);
      setSourceImageUrl(null);
      setSourceImageAssetId(null);
      setInlineStatus(message);
    } finally {
      setUploadingSource(false);
    }
  };

  const selectVariantIndex = useCallback(
    (index: number) => {
      if (uiLocked) return;
      const v = variants[index];
      const url = cleanParam(v?.image_url);
      if (!url) return;

      if (selectedIdx != null && selectedIdx !== index) {
        resetCreatorFlow?.();
      }

      setSelectedIdx(index);
      setFaceSelection?.({
        sasUrl: url,
        artifactId: v.artifact_id ?? undefined,
        mediaAssetId: v.media_asset_id ?? undefined,
        variantIndex: index,
        gender,
        ownerUserId: authUserId || undefined,
        owner_user_id: authUserId || undefined,
        userId: authUserId || undefined,
        user_id: authUserId || undefined,
      } as any);
    },
    [uiLocked, variants, selectedIdx, resetCreatorFlow, setFaceSelection, gender]
  );

  const launchPolling = useCallback(
    async (jobId: string, cycle: number = 0) => {
      let longRunningTimer: ReturnType<typeof setTimeout> | null = null;

      try {
        longRunningTimer = setTimeout(() => {
          updateJob(jobId, (prev) => {
            if (prev.stage === "succeeded" || prev.stage === "failed") return prev;
            return {
              ...prev,
              backgrounded: true,
              message: "Still generating in the background.",
            };
          });
          setBackgroundNotice(
            "Still generating in the background. Image, audio, and video jobs can take a little longer."
          );
        }, 15_000);

        for (let i = 0; i < 120; i++) {
          if (pollingCancelledRef.current) return;

          const last = await apiGetFaceJobStatus(jobId);
          const stage = stageFromStatus(last?.status);
          const nextVars = stage === "succeeded" ? normalizeVariants(last) : [];
          const pricingLabel = pickPricingLabel(last);

          updateJob(jobId, (prev) => ({
            ...prev,
            stage,
            progress: nextProgress(prev.progress, stage),
            resultReady: stage === "succeeded",
            resultCount: nextVars.length || prev.resultCount,
            pricingLabel: pricingLabel ?? prev.pricingLabel,
            message:
              stage === "queued"
                ? "Queued…"
                : stage === "running"
                  ? prev.backgrounded
                    ? "Generating in background…"
                    : "Generating…"
                  : stage === "finalizing"
                    ? "Finalizing…"
                    : stage === "succeeded"
                      ? "Ready"
                      : stage === "failed"
                        ? String(last?.error ?? "Job failed.")
                        : prev.message,
          }));

          if (stage === "succeeded") {
            const finalVars = normalizeVariants(last);
            if (!finalVars.length) {
              updateJob(jobId, { stage: "failed", message: "Succeeded but missing variants." });
              return;
            }

            setVariants(finalVars);
            setSelectedIdx(0);
            setResultsJobId(jobId);
            setFinalPricingLabel(pricingLabel ?? null);
            setFinalPricingState(
              (
                String(last?.pricing?.state ?? "").toLowerCase() === "released"
                  ? "released"
                  : String(last?.pricing?.state ?? "").toLowerCase() === "committed"
                    ? "committed"
                    : "estimated"
              ) as any
            );
            setFinalPricingMessage(pickFinalPricingMessage(last));
            refreshPricingCaches();
            setInlineStatus("Done. Open the result or choose a variant below.");
            setFaceSelection?.({
              sasUrl: cleanParam(finalVars[0]?.image_url),
              artifactId: finalVars[0]?.artifact_id ?? undefined,
              mediaAssetId: finalVars[0]?.media_asset_id ?? undefined,
              variantIndex: 0,
              gender,
              ownerUserId: authUserId || undefined,
              owner_user_id: authUserId || undefined,
              userId: authUserId || undefined,
              user_id: authUserId || undefined,
            } as any);
            return;
          }

          if (stage === "failed") {
            setFinalPricingMessage(pickFinalPricingMessage(last));
            refreshPricingCaches();
            setInlineStatus(String(last?.error ?? "Generate failed."));
            return;
          }

          await new Promise((r) => setTimeout(r, 1200));
        }

        if (cycle < 4) {
          updateJob(jobId, {
            stage: "running",
            backgrounded: true,
            message: "Still rendering. We’ll keep checking in the background.",
          });
          setInlineStatus("Your face is still rendering. You can keep using the app while we continue checking.");
          await new Promise((r) => setTimeout(r, 4000));
          return launchPolling(jobId, cycle + 1);
        }

        updateJob(jobId, {
          stage: "failed",
          message: "This run took longer than expected. Please reopen it from Jobs in a moment.",
        });
        setInlineStatus("This face is taking longer than usual. Please reopen it from Jobs in a moment.");
      } catch (e: any) {
        updateJob(jobId, {
          stage: "failed",
          message: e?.message ?? "Polling failed.",
        });
        setInlineStatus(e?.message ?? "Generate failed.");
      } finally {
        if (longRunningTimer) clearTimeout(longRunningTimer);
      }
    },
    [updateJob, setFaceSelection, gender, refreshPricingCaches]
  );

  const generate = async () => {
    if (!canGenerate || creatingJob) return;

    if (mode === "image-to-image" && imageSafetyState === "checking") {
      setInlineStatus("Image safety check is still running. Please wait a moment.");
      return;
    }

    if (mode === "image-to-image" && imageSafetyState !== "passed") {
      setInlineStatus(
        imageSafetyReason || "Please choose a source image that passes content safety."
      );
      return;
    }

    if (!pricingConfirmation?.quote_id) {
      setInlineStatus("Pricing preview is not ready yet. Please wait a moment and try again.");
      return;
    }

    if (pricing?.insufficientBalance) {
      setInlineStatus("You do not have enough credits for this face run. Top up or upgrade to continue.");
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

    resetCreatorFlow?.();
    closeViewer();
    setFinalPricingLabel(null);
    setFinalPricingState("estimated");
    setFinalPricingMessage(null);
    setInlineStatus("Creating job…");
    setCreatingJob(true);

    try {
      const req: any = {
        mode,
        num_variants: numVariants,
        user_prompt: prompt.trim(),
        gender,
        region_code: regionCode,
        context_code: contextCode ?? undefined,
        use_case: useCaseCode ?? undefined,
        shot_type_code: shotTypeCode ?? undefined,
        aspect_ratio: aspectRatio,
        source_image_url: mode === "image-to-image" ? sourceImageUrl : null,
        source_image_asset_id: mode === "image-to-image" ? sourceImageAssetId : null,
        preservation_strength: mode === "image-to-image" ? preservationStrength : undefined,
      };

      const created = await apiCreateFaceJob(req, pricingConfirmation);
      const id = created?.job_id;
      if (!id) throw new Error("No job_id returned.");

      const newJob: StudioJobItem = {
        id,
        kind: "face",
        title: mode === "image-to-image" ? "Edit Face" : "Create Face",
        stage: "queued",
        progress: 0.12,
        message: "Queued…",
        startedAt: Date.now(),
        backgrounded: false,
        resultReady: false,
        pricingLabel: pricing?.estimateLabel,
      };

      setJobs((prev) => [newJob, ...prev]);
      setInlineStatus("Job started. You can keep creating while it runs.");
      launchPolling(id);
    } catch (e: any) {
      setInlineStatus(e?.message ?? "Generate failed.");
    } finally {
      setCreatingJob(false);
    }
  };

  const selectedVariant = selectedIdx != null ? variants[selectedIdx] : null;

  const proceedToAudio = useCallback(
    async (vOverride?: FaceVariant, idxOverride?: number) => {
      if (uiLocked) return;

      const v = vOverride ?? selectedVariant;
      const idx = typeof idxOverride === "number" ? idxOverride : selectedIdx;
      const imageUrl = cleanParam(v?.image_url);
      const faceArtifactId = resolveVariantHandoffId(v);
      if (!imageUrl) return;

      logFaceStudioFlow("proceedToAudio", {
        authUserId,
        selectedIdx,
        idx,
        imageUrl,
        faceArtifactId,
        face_media_asset_id: cleanParam(v?.media_asset_id),
        face_profile_id: cleanParam(v?.face_profile_id),
        gender,
        aspectRatio,
      });

      try {
        setUiLocked(true);

        if (selectedIdx != null && idx != null && idx !== selectedIdx) {
          resetCreatorFlow?.();
        }

        setSelectedIdx(idx ?? 0);

        setFaceSelection?.({
          sasUrl: imageUrl,
          imageUrl,
          image_url: imageUrl,
          face_image_url: imageUrl,
          face_sas_url: imageUrl,
          artifactId: faceArtifactId || undefined,
          faceArtifactId: faceArtifactId || undefined,
          artifact_id: faceArtifactId || undefined,
          face_artifact_id: faceArtifactId || undefined,
          mediaAssetId: v?.media_asset_id ?? undefined,
          faceMediaAssetId: v?.media_asset_id ?? undefined,
          media_asset_id: v?.media_asset_id ?? undefined,
          face_media_asset_id: v?.media_asset_id ?? undefined,
          faceProfileId: v?.face_profile_id ?? undefined,
          face_profile_id: v?.face_profile_id ?? undefined,
          variantIndex: idx ?? undefined,
          gender,
        } as any);

        setFusionSettings?.({
          fusionAspectRatio: aspectRatio,
        } as any);

        await saveCreateFlowContext({
          image_url: imageUrl,
          face_image_url: imageUrl,
          face_sas_url: imageUrl,
          face_artifact_id: faceArtifactId || undefined,
          artifact_id: faceArtifactId || undefined,
          face_profile_id: v?.face_profile_id ?? undefined,
          face_media_asset_id: v?.media_asset_id ?? undefined,
          media_asset_id: v?.media_asset_id ?? undefined,
          gender,
          aspect_ratio: aspectRatio,
          stage: "face_done",
          ownerUserId: authUserId || undefined,
          owner_user_id: authUserId || undefined,
          userId: authUserId || undefined,
          user_id: authUserId || undefined,
        } as any);

        router.push({
          pathname: "/(tabs)/audio",
          params: {
            face_image_url: imageUrl,
            face_sas_url: imageUrl,
            image_url: imageUrl,
            face_artifact_id: faceArtifactId ?? "",
            face_media_asset_id: v?.media_asset_id ?? "",
            face_profile_id: v?.face_profile_id ?? "",
            gender,
            aspect_ratio: aspectRatio,
            stage: "face_done",
          },
        } as any);
      } finally {
        setUiLocked(false);
      }
    },
    [uiLocked, selectedVariant, selectedIdx, resetCreatorFlow, setFaceSelection, setFusionSettings, gender, aspectRatio, authUserId]
  );

  const openReadyJob = useCallback((job: StudioJobItem) => {
    if (job.kind !== "face" || !job.resultReady) return;

    if (job.id === resultsJobId && variants.length > 0) {
      const idx = selectedIdx ?? 0;
      const v = variants[idx] ?? variants[0];
      const uri = cleanParam(v?.image_url);
      if (uri) {
        openViewer(uri, `Variant ${(idx ?? 0) + 1}`, idx ?? 0);
        return;
      }
    }

    setInlineStatus("Result is ready below. Pick a face and continue to Audio Studio.");
  }, [resultsJobId, variants, selectedIdx, openViewer]);

  const openPlanScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "manage",
          source: "face",
          plan: pricing?.planLabel ?? "",
          availability: pricing?.availableLabel ?? "",
          settlement: pricing?.settlementLabel ?? "",
        },
      } as any);
    } catch {
      router.push("/(tabs)/dashboard" as any);
    }
  }, [pricing?.availableLabel, pricing?.planLabel, pricing?.settlementLabel]);

  const openUpgradeScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "upgrade",
          source: "face",
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
          source: "face",
          plan: pricing?.planLabel ?? "",
          availability: pricing?.availableLabel ?? "",
          settlement: pricing?.settlementLabel ?? "",
        },
      } as any);
    } catch {
      openPlanScreen();
    }
  }, [openPlanScreen, pricing?.availableLabel, pricing?.planLabel, pricing?.settlementLabel]);

  const waitingForEstimate =
    canGenerate &&
    pricingPreviewEnabled &&
    !pricingReady &&
    (!pricingHasResponse || pricingQ.isFetching);

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
    generate();
  }, [generate, openTopUpScreen, openUpgradeScreen, pricing?.insufficientBalance, pricing?.topUpVisible, pricing?.upgradeVisible]);

  const generateDisabled =
    !canGenerate ||
    waitingForEstimate ||
    creatingJob ||
    uploadingSource ||
    mdLoading ||
    !!mdErr ||
    (!!pricing?.insufficientBalance && !pricing?.topUpVisible && !pricing?.upgradeVisible) ||
    (mode === "image-to-image" && imageSafetyState === "checking") ||
    (mode === "image-to-image" && imageSafetyState !== "passed");

  const previewPendingMessage =
    mode === "image-to-image" && imageSafetyState === "checking"
      ? "Checking your source photo for content safety…"
      : mode === "image-to-image" && imageSafetyState === "blocked"
        ? imageSafetyReason || "This source photo did not pass content safety."
        : mode === "image-to-image" && imageSafetyState === "error"
          ? imageSafetyReason || "Image safety validation failed. Please choose another photo."
          : mode === "image-to-image" && !sourceImageUrl && !sourceImageAssetId
            ? "Upload a source photo that passes content safety to unlock the estimate and enable Generate."
            : canGenerate && !hasFacePricingAuth
              ? "We’re still syncing your sign-in state for live pricing. Please wait a moment."
              : canGenerate &&
                pricingPreviewEnabled &&
                !pricingReady &&
                pricingQ.isFetching
                  ? "Refreshing estimate for your current setup…"
                  : canGenerate &&
                    pricingPreviewEnabled &&
                    !pricingReady &&
                    !pricingHasResponse &&
                    !creatingJob &&
                    !mdLoading &&
                    !mdErr
                      ? "We’re still preparing the estimate for this edit. Please wait a moment."
                      : canGenerate &&
                        pricingPreviewEnabled &&
                        !pricingReady &&
                        !!pricingQ.error
                        ? "We couldn’t load the live estimate. Please adjust the setup or try again."
                        : null;

  useEffect(() => {
    console.log("[DF_FACE_PRICING_GATE]", {
      hasFacePricingAuth,
      pricingPreviewEligible,
      pricingPreviewEnabled,
      canGenerate,
      pricingReady,
      pricingHasResponse,
      pricingFetching: pricingQ.isFetching,
      pricingError: pricingQ.error ? String((pricingQ.error as any)?.message || pricingQ.error) : null,
      mode,
      hasPrompt: prompt.trim().length > 0,
      gender,
      zoneCode,
      regionCode,
      hasValidI2ISource,
      sourceImageUrl: !!sourceImageUrl,
      sourceImageAssetId: !!sourceImageAssetId,
      imageSafetyState,
    });
  }, [
    hasFacePricingAuth,
    pricingPreviewEligible,
    pricingPreviewEnabled,
    canGenerate,
    pricingReady,
    pricingHasResponse,
    pricingQ.isFetching,
    pricingQ.error,
    mode,
    prompt,
    gender,
    zoneCode,
    regionCode,
    hasValidI2ISource,
    sourceImageUrl,
    sourceImageAssetId,
    imageSafetyState,
  ]);

  const imageSafetyBanner =
    mode !== "image-to-image"
      ? null
      : imageSafetyState === "checking"
        ? {
            tone: "info" as const,
            title: "Checking image safety",
            message: "We’re validating your source photo before upload.",
          }
        : imageSafetyState === "passed"
          ? {
              tone: "success" as const,
              title: "Passed content safety",
              message: "This source photo is approved for Edit Face.",
            }
          : imageSafetyState === "blocked"
            ? {
                tone: "error" as const,
                title: "Blocked by content safety",
                message:
                  imageSafetyReason ||
                  "This source photo did not pass DesiFaces content safety checks.",
              }
            : imageSafetyState === "error"
              ? {
                  tone: "error" as const,
                  title: "Safety validation failed",
                  message:
                    imageSafetyReason ||
                    "We couldn’t validate this image. Please try another photo.",
                }
              : {
                  tone: "neutral" as const,
                  title: "Source photo required",
                  message: "Only photos that pass content safety can be used for Edit Face.",
                };

  const selectedVariantUri = cleanParam(selectedVariant?.image_url);


const pricingDisplay = useResolvedPricingDisplay({ enabled: isReady && isAuthed });
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

  const openHamburgerMenu = useCallback(() => {
    const menuNonce = `${Date.now()}`;
    router.push({
      pathname: "/(tabs)/dashboard" as any,
      params: {
        openMenu: "1",
        menu_nonce: menuNonce,
        menu_source: "face",
      } as any,
    } as any);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <DFHeader
        subtitle="Face Studio"
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
      <Stepper step={1} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 180 }}
      >
        <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 10 }}>
          <PricingTopBar
            studioName="Face Studio"
            estimate={visiblePrimaryEstimate}
            primaryEstimateLabel={visiblePrimaryEstimate}
            secondaryEstimateLabel={visibleSecondaryEstimate ?? undefined}
            creditEstimateLabel={visibleCreditEstimate ?? undefined}
            cashEstimateLabel={visibleCashEstimate ?? undefined}
            walletAfterRun={pricingDisplay.creditDetailLabel ?? liveAvailableLabel ?? undefined}
            planName={livePlanLabel ?? undefined}
            includedUsageLeft={pricingDisplay.includedLabel ?? liveCreditBreakdownLabel ?? liveAvailableLabel ?? undefined}
            availabilityLabel={pricingDisplay.creditDetailLabel ?? liveAvailableLabel ?? undefined}
            settlementLabel={displayedSettlementLabel}
            noteLabel={pricing?.settlementLabel ?? displayedSettlementLabel}
            entitlementLabel={pricingDisplay.creditBreakdownLabel ?? displayedPricingDetail}
            displayKind={isPostpaidPricing ? "postpaid" : "credits"}
            billingValue={isPostpaidPricing ? ((pricing?.planLabel && String(pricing.planLabel).toLowerCase().includes("enterprise")) ? "Enterprise" : "Postpaid") : "Credits"}
            canRun={pricing?.insufficientBalance ? false : null}
            insufficientTitle="Not enough available credits"
            insufficientMessage="You don’t have enough available credits for this run."
            onPressTopUp={pricing?.topUpVisible ? openTopUpScreen : undefined}
            onPressUpgrade={pricing?.upgradeVisible ? openUpgradeScreen : undefined}
            onPressBreakdown={undefined}
            onPressManagePlan={openPlanScreen}
          />

          <StudioTipsRail
            title="Studio coach"
            subtitle="Rolling tips based on your current Face setup."
            tips={studioTips}
            loading={tipsLoading}
            error={tipsError}
            onRefresh={() => {
              void refreshStudioTips();
            }}
          />

          <GlassCard>
            <SectionTitle
              title="Create your next face"
              subtitle="Premium creator-quality faces designed for Audio and Fusion."
            />

            <View style={{ marginTop: 12 }}>
              <Segmented
                value={mode}
                disabled={uiLocked}
                onChange={(m) => {
                  setMode(m);
                  setInlineStatus(null);
                }}
              />
            </View>
          </GlassCard>

          <GlassCard>
            <SectionTitle
              title="Creative setup"
              subtitle="Use compact controls to shape location, framing, and intent."
            />

            <View style={{ marginTop: 12, gap: creativeGridGap }}>
              <View
                style={{
                  flexDirection: creativeSingleColumn ? "column" : "row",
                  gap: creativeGridGap,
                }}
              >
                <SelectorChip
                  label="Country"
                  value={COUNTRY_LABEL}
                  disabled
                  flex={creativeSingleColumn ? undefined : 0.78}
                  width={creativeSingleColumn ? "100%" : undefined}
                  emphasis="fixed"
                />
                <SelectorChip
                  label="Region"
                  value={mdLoading ? "Loading…" : regionLabel}
                  onPress={() => setOpenZone(true)}
                  disabled={uiLocked || mdLoading || zoneOptions.length === 0}
                  flex={creativeSingleColumn ? undefined : 1.22}
                  width={creativeSingleColumn ? "100%" : undefined}
                  emphasis="wide"
                />
              </View>

              <View
                style={{
                  flexDirection: creativeSingleColumn ? "column" : "row",
                  gap: creativeGridGap,
                }}
              >
                <SelectorChip
                  label="State"
                  value={mdLoading ? "Loading…" : stateLabel}
                  onPress={() => setOpenRegion(true)}
                  disabled={uiLocked || mdLoading || regionOptions.length === 0}
                  flex={creativeSingleColumn ? undefined : 1.18}
                  width={creativeSingleColumn ? "100%" : undefined}
                  emphasis="wide"
                />
                <SelectorChip
                  label="Image Type"
                  value={shotTypeLabel}
                  onPress={() => setOpenShotType(true)}
                  disabled={uiLocked}
                  flex={creativeSingleColumn ? undefined : 0.82}
                  width={creativeSingleColumn ? "100%" : undefined}
                />
              </View>

              <View
                style={{
                  flexDirection: creativeSingleColumn ? "column" : "row",
                  gap: creativeGridGap,
                }}
              >
                <SelectorChip
                  label="Use Case"
                  value={mdLoading ? "Loading…" : useCaseLabel}
                  onPress={() => setOpenUseCase(true)}
                  disabled={uiLocked || mdLoading || useCaseOptions.length === 0}
                  flex={1}
                  width={creativeSingleColumn ? "100%" : undefined}
                />
                <SelectorChip
                  label="Context"
                  value={mdLoading ? "Loading…" : contextLabel}
                  onPress={() => setOpenContext(true)}
                  disabled={uiLocked || mdLoading || contextOptions.length === 0}
                  flex={1}
                  width={creativeSingleColumn ? "100%" : undefined}
                />
              </View>
            </View>

            <View
              style={{
                marginTop: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.045)",
                padding: 12,
              }}
            >
              <View
                style={{
                  flexDirection: creativeAspectInline ? "row" : "column",
                  alignItems: creativeAspectInline ? "center" : "stretch",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <View style={{ flex: creativeAspectInline ? 1 : undefined }}>
                  <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Aspect Ratio</Text>
                  <Text
                    numberOfLines={creativeAspectInline ? 2 : undefined}
                    style={{ color: DF.muted, fontWeight: "700", marginTop: 4, fontSize: 12, lineHeight: 15 }}
                  >
                    Pick the frame to carry into Audio and Fusion.
                  </Text>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    width: creativeAspectInline ? Math.min(186, Math.max(160, screenWidth * 0.43)) : "100%",
                  }}
                >
                  {(["9:16", "1:1", "16:9"] as const).map((ratio) => {
                    const active = aspectRatio === ratio;
                    return (
                      <Pressable
                        key={ratio}
                        onPress={() => setAspectRatio(ratio)}
                        disabled={uiLocked}
                        style={{
                          flex: 1,
                          borderRadius: 12,
                          paddingVertical: 10,
                          alignItems: "center",
                          borderWidth: 1,
                          borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
                          backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
                          opacity: uiLocked ? 0.75 : 1,
                        }}
                      >
                        <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900", fontSize: 12 }}>{ratio}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {!!mdErr && (
              <View
                style={{
                  marginTop: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,120,120,0.22)",
                  backgroundColor: "rgba(255,120,120,0.08)",
                  padding: 12,
                }}
              >
                <Text style={{ color: "rgba(255,220,220,0.96)", fontWeight: "900", fontSize: 12 }}>
                  Masterdata failed
                </Text>
                <Text style={{ color: "rgba(255,200,200,0.86)", fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                  {mdErr}
                </Text>

                <Pressable
                  onPress={() => mdQ.refetch()}
                  disabled={uiLocked}
                  style={{
                    marginTop: 10,
                    height: 40,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>Retry</Text>
                </Pressable>
              </View>
            )}
          </GlassCard>

          <GlassCard>
            <SectionTitle
              title={mode === "text-to-image" ? "Creative brief" : "Edit brief"}
              subtitle={
                mode === "text-to-image"
                  ? "Describe the look, vibe, styling, lighting, and scene."
                  : "Keep the same person, then describe what should change."
              }
              right={
                <Pressable
                  onPress={() => {
                    void requestPromptEnhancement();
                  }}
                  disabled={uiLocked || creatingJob || !prompt.trim()}
                  style={{
                    height: 36,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(248,184,72,0.28)",
                    backgroundColor: prompt.trim() ? "rgba(232,152,56,0.12)" : "rgba(255,255,255,0.05)",
                    opacity: uiLocked || creatingJob || !prompt.trim() ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: prompt.trim() ? "rgba(248,232,136,0.95)" : DF.muted, fontWeight: "900", fontSize: 12 }}>
                    Enhance
                  </Text>
                </Pressable>
              }
            />

            <View
              style={{
                marginTop: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: DF.border,
                backgroundColor: "rgba(0,0,0,0.24)",
                padding: 12,
              }}
            >
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder={
                  mode === "text-to-image"
                    ? "Luxury editorial portrait, elegant Indian outfit, soft golden-hour light, clean premium background…"
                    : "Same person, premium editorial styling, refined outfit, cinematic lighting, upscale background…"
                }
                placeholderTextColor="rgba(248,216,104,0.35)"
                multiline
                editable={!uiLocked && !creatingJob}
                style={{
                  color: DF.text,
                  fontWeight: "700",
                  minHeight: 104,
                  textAlignVertical: "top",
                }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable
                onPress={() => setGender("female")}
                disabled={uiLocked}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: gender === "female" ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.04)",
                  opacity: uiLocked ? 0.75 : 1,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>Female</Text>
              </Pressable>

              <Pressable
                onPress={() => setGender("male")}
                disabled={uiLocked}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: gender === "male" ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.04)",
                  opacity: uiLocked ? 0.75 : 1,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>Male</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 12 }}>
              <VariantsControl value={numVariants} onChange={setNumVariants} disabled={uiLocked} />
            </View>
          </GlassCard>

          {mode === "image-to-image" && (
            <GlassCard>
              <SectionTitle
                title="Identity lock"
                subtitle="Upload a source photo and tune how closely the result follows it."
              />

              <Pressable
                onPress={pickImage}
                disabled={uiLocked || creatingJob || imageSafetyState === "checking"}
                style={{
                  marginTop: 12,
                  height: 46,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(248,184,72,0.35)",
                  backgroundColor: "rgba(232,152,56,0.18)",
                  opacity: uiLocked || imageSafetyState === "checking" ? 0.75 : 1,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>
                  {uploadingSource
                    ? imageSafetyState === "checking"
                      ? "Checking Safety…"
                      : "Uploading…"
                    : pickedUri || sourceImageUrl
                      ? "Change Source Photo"
                      : "Upload Source Photo"}
                </Text>
              </Pressable>

              <View
                style={{
                  marginTop: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor:
                    imageSafetyBanner?.tone === "success"
                      ? "rgba(120,255,180,0.20)"
                      : imageSafetyBanner?.tone === "error"
                        ? "rgba(255,120,120,0.24)"
                        : imageSafetyBanner?.tone === "info"
                          ? "rgba(120,180,255,0.20)"
                          : "rgba(255,255,255,0.10)",
                  backgroundColor:
                    imageSafetyBanner?.tone === "success"
                      ? "rgba(120,255,180,0.08)"
                      : imageSafetyBanner?.tone === "error"
                        ? "rgba(255,120,120,0.08)"
                        : imageSafetyBanner?.tone === "info"
                          ? "rgba(120,180,255,0.08)"
                          : "rgba(255,255,255,0.04)",
                  padding: 12,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>
                  {imageSafetyBanner?.title}
                </Text>
                <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                  {imageSafetyBanner?.message}
                </Text>
              </View>

              {!!(pickedUri || sourceImageUrl) && (
                <View
                  style={{
                    marginTop: 12,
                    borderRadius: 14,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: DF.border,
                    backgroundColor: BG2,
                    height: 240,
                  }}
                >
                  <Image
                    source={{ uri: pickedUri ?? sourceImageUrl ?? "" }}
                    style={{ width: "100%", height: "100%" }}
                    cachePolicy="none"
              contentFit="contain"
                    contentPosition="center"
                  />
                </View>
              )}

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Identity strength</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 4, fontSize: 12 }}>
                  Lower = more creative change. Higher = closer to the source photo.
                </Text>

                <View style={{ marginTop: 8 }}>
                  <Slider
                    minimumValue={0}
                    maximumValue={1}
                    value={preservationStrength}
                    onValueChange={setPreservationStrength}
                    disabled={uiLocked || imageSafetyState === "checking"}
                  />
                  <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                    preservation_strength: {preservationStrength.toFixed(2)} (recommended 0.15–0.35)
                  </Text>
                </View>
              </View>
            </GlassCard>
          )}

          {!!previewPendingMessage && (
            <GlassCard style={{ padding: 12 }}>
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>
                {previewPendingMessage}
              </Text>
            </GlassCard>
          )}

          {!!pricing && (
            <GlassCard style={{ padding: 12 }}>
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Estimate</Text>
              <Text style={{ color: DF.text, fontWeight: "800", marginTop: 8, fontSize: 12 }}>
                {isPostpaidPricing ? "Estimated bill" : "Credits charged"}: {isPostpaidPricing ? (visibleCashEstimate ?? "—") : (visibleCreditEstimate ?? "—")}
              </Text>
              <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                {pricing.settlementLabel}
              </Text>
            </GlassCard>
          )}

          {!!pricing?.insufficientBalance && (
            <GlassCard
              style={{
                padding: 12,
                borderColor: "rgba(255,180,90,0.30)",
                backgroundColor: "rgba(255,180,90,0.10)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Not enough credits</Text>
              <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                {isPostpaidPricing ? `Estimated bill: ${visibleCashEstimate ?? "—"}` : `Credits charged: ${visibleCreditEstimate ?? "—"}`}
              </Text>
              <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                {pricing?.settlementLabel ?? "Not enough available credits for this run."}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
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
              </View>
            </GlassCard>
          )}

          <Pressable
            onPress={onPrimaryAction}
            disabled={generateDisabled}
            style={{
              borderRadius: 18,
              paddingVertical: 15,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.35)",
              backgroundColor: !generateDisabled ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.06)",
              shadowColor: "#000",
              shadowOpacity: Platform.OS === "ios" ? 0.18 : 0,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: 2,
            }}
          >
            {creatingJob ? (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ color: DF.text, fontWeight: "900" }}>Starting job…</Text>
              </View>
            ) : (
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>
                {pricing?.insufficientBalance ? (pricing?.ctaLabel ?? (pricing?.topUpVisible ? "Top up credits" : pricing?.upgradeVisible ? "Upgrade plan" : "Not enough credits")) : (displayedEstimateLabel ? `Create Face — ${displayedEstimateLabel}` : "Create Face")}
              </Text>
            )}
          </Pressable>

          {!!inlineStatus && (
            <GlassCard style={{ padding: 12 }}>
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>{inlineStatus}</Text>
            </GlassCard>
          )}

          {!!backgroundNotice && (
            <GlassCard
              style={{
                padding: 12,
                borderColor: "rgba(248,184,72,0.22)",
                backgroundColor: "rgba(232,152,56,0.10)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>{backgroundNotice}</Text>
            </GlassCard>
          )}

          {variants.length > 0 && (
            <GlassCard style={{ padding: 0, overflow: "hidden" }}>
              <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
                <SectionTitle
                  title="Results"
                  subtitle="Swipe through premium variants, open them full-screen, then continue to Audio Studio."
                  right={
                    <Pressable
                      onPress={() => {
                        const idx = selectedIdx ?? 0;
                        const v = variants[idx] ?? variants[0];
                        const uri = cleanParam(v?.image_url);
                        if (uri) openViewer(uri, `Variant ${idx + 1}`, idx);
                      }}
                      disabled={uiLocked || variants.length === 0}
                      style={{
                        height: 36,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: "rgba(248,184,72,0.28)",
                        backgroundColor: "rgba(232,152,56,0.12)",
                      }}
                    >
                      <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900", fontSize: 12 }}>
                        Open Result
                      </Text>
                    </Pressable>
                  }
                />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}
              >
                {variants.map((item, index) => {
                  const active = selectedIdx === index;
                  const uri = cleanParam(item?.image_url);

                  return (
                    <Pressable
                      key={item?.media_asset_id?.toString?.() || item?.face_profile_id?.toString?.() || item?.image_url || String(index)}
                      onPress={() => selectVariantIndex(index)}
                      disabled={uiLocked}
                      style={{
                        width: variantCardWidth,
                        marginRight: 12,
                        borderRadius: 20,
                        overflow: "hidden",
                        borderWidth: 2,
                        borderColor: active ? "rgba(248,184,72,0.55)" : "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <View style={{ height: Math.round(variantCardWidth * 1.16), backgroundColor: BG2 }}>
                        {!!uri ? (
                          <>
                            <Image
                              source={{ uri }}
                              style={{ width: "100%", height: "100%" }}
                              cachePolicy="none"
              contentFit="contain"
                              contentPosition="center"
                              transition={180}
                            />

                            <Pressable
                              onPress={() => openViewer(uri, `Variant ${index + 1}`, index)}
                              disabled={uiLocked}
                              hitSlop={10}
                              style={{
                                position: "absolute",
                                top: 12,
                                right: 12,
                                width: 36,
                                height: 36,
                                borderRadius: 12,
                                alignItems: "center",
                                justifyContent: "center",
                                borderWidth: 1,
                                borderColor: "rgba(255,255,255,0.18)",
                                backgroundColor: "rgba(0,0,0,0.35)",
                              }}
                            >
                              <Text style={{ color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 14 }}>⤢</Text>
                            </Pressable>
                          </>
                        ) : (
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ color: DF.muted, fontWeight: "800" }}>No image</Text>
                          </View>
                        )}
                      </View>

                      <View
                        style={{
                          padding: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>
                          Variant {index + 1}
                        </Text>

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
                            <Text style={{ color: "rgba(248,232,136,1)", fontWeight: "900", fontSize: 12 }}>
                              Selected
                            </Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ padding: 14, paddingTop: 10 }}>
                {selectedIdx != null && !resolveVariantHandoffId(selectedVariant) && (
                  <View
                    style={{
                      marginBottom: 10,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "rgba(255,180,90,0.30)",
                      backgroundColor: "rgba(255,180,90,0.10)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>Face artifact required</Text>
                    <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                      This face preview is ready. You can continue to Audio now. A saved artifact is optional for Audio and recommended for later Fusion steps.
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={() => proceedToAudio()}
                  disabled={selectedIdx == null || uiLocked || !cleanParam(selectedVariant?.image_url)}
                  style={{
                    height: 52,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(248,184,72,0.35)",
                    backgroundColor: selectedIdx != null ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.06)",
                    opacity: uiLocked || !cleanParam(selectedVariant?.image_url) ? 0.85 : 1,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>
                    Continue to Audio
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setWorkflowSummaryOpen(true)}
                  disabled={selectedIdx == null || uiLocked || !cleanParam(selectedVariant?.image_url)}
                  style={{
                    marginTop: 10,
                    height: 48,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    opacity: uiLocked ? 0.85 : 1,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Finish with Face</Text>
                </Pressable>
              </View>
            </GlassCard>
          )}
        </View>
      </ScrollView>

      <SelectModal
        open={openZone}
        title="Select Region"
        items={zoneOptions}
        selectedCode={zoneCode}
        onClose={() => setOpenZone(false)}
        onSelect={(x) => setZoneCode(x.code)}
      />
      <SelectModal
        open={openRegion}
        title="Select State"
        items={regionOptions}
        selectedCode={regionCode}
        onClose={() => setOpenRegion(false)}
        onSelect={(x) => setRegionCode(x.code)}
      />
      <SelectModal
        open={openUseCase}
        title="Select Use Case"
        items={useCaseOptions}
        selectedCode={useCaseCode}
        onClose={() => setOpenUseCase(false)}
        onSelect={(x) => setUseCaseCode(x.code)}
      />
      <SelectModal
        open={openContext}
        title="Select Context"
        items={contextOptions}
        selectedCode={contextCode}
        onClose={() => setOpenContext(false)}
        onSelect={(x) => setContextCode(x.code)}
      />
      <SelectModal
        open={openShotType}
        title="Select Image Type"
        items={SHOT_TYPE_OPTIONS}
        selectedCode={shotTypeCode}
        onClose={() => setOpenShotType(false)}
        onSelect={(x) => setShotTypeCode(x.code)}
      />

      <ImageViewerModal
        open={viewerOpen}
        uri={viewerUri}
        title={viewerTitle}
        canSelect={viewerIndex != null}
        onBackToVariants={closeViewer}
        onSelectThis={() => {
          if (viewerIndex == null) return;
          const v = variants[viewerIndex];
          closeViewer();
          proceedToAudio(v, viewerIndex);
        }}
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
                backgroundColor: BG2,
                padding: 16,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>Face session summary</Text>
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
                Your face is ready. You can stop here for now or continue into Audio Studio later.
              </Text>

              {!!selectedVariantUri && (
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
                    source={{ uri: selectedVariantUri }}
                    style={{ width: "100%", height: 320 }}
                    cachePolicy="none"
              contentFit="contain"
                  />
                </View>
              )}

              <View
                style={{
                  marginTop: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(248,184,72,0.18)",
                  backgroundColor: "rgba(248,184,72,0.08)",
                  padding: 12,
                  gap: 8,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>What’s ready</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Selected face image saved for this workflow</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Plan: {pricing?.planLabel ?? "Creator / Pro"}</Text>
                {!!(finalPricingLabel ?? pricing?.estimateLabel) && (
                  <>
                    <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                      • {isPostpaidPricing ? "Estimated bill" : "Credits charged"}: {isPostpaidPricing ? (visibleCashEstimate ?? "—") : (visibleCreditEstimate ?? "—")}
                    </Text>
                    <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                      • Settlement: {pricing?.settlementLabel ?? "Estimate shown before the run. Final pricing is confirmed after completion."}
                    </Text>
                  </>
                )}
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                  • Next step available: Audio Studio voice creation
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
                    setWorkflowSummaryOpen(false);
                    proceedToAudio();
                  }}
                  disabled={selectedIdx == null || uiLocked}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(248,184,72,0.35)",
                    backgroundColor: "rgba(232,152,56,0.22)",
                    opacity: uiLocked ? 0.85 : 1,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Go to Audio</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

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
          setPrompt(nextText);
          setEnhancerOpen(false);
          setInlineStatus("Enhanced prompt applied. Review it and generate when ready.");
        }}
      />

      <GlobalJobsTray
        jobs={jobs}
        onDismissJob={dismissJob}
        onOpenJob={openReadyJob}
      />

      <DFBlockingOverlay
        visible={uiLocked}
        title="Opening Audio Studio…"
        message="Locking your selected face and moving to the next step."
      />
    </View>
  );
}