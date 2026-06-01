import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ImageBackground,
  type DimensionValue,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../../core/auth/AuthContext";
import { endpoints } from "../../core/api/endpoints";
import { DASH_BASE } from "../../core/config/env";
import ThumbFanDeckCarousel, { ThumbFanItem } from "../../core/ui/ThumbFanDeckCarousel";
import DFHeader from "../../core/ui/DFHeader";
import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import { saveCreateFlowContext } from "../../core/media/createFlow";
import { useAccountPricingSnapshot } from "../../core/pricing/useAccountPricingSnapshot";
import { resolvePricingDisplay, useResolvedPricingDisplay } from "../../core/pricing/resolvePricingDisplay";

import FaceCard from "./carousels/FaceCard";

const DF = {
  bg: "#02050C",
  bg2: "#07101C",
  surface: "rgba(12,24,38,0.78)",
  surface2: "rgba(18,35,55,0.72)",
  glass: "rgba(255,255,255,0.06)",
  text: "rgba(240,248,255,0.94)",
  textStrong: "#FFFFFF",
  textSoft: "rgba(208,226,247,0.68)",
  line: "rgba(116,212,255,0.16)",
  border: "rgba(148,224,255,0.22)",
  gold: "#D2B07A",
  goldSoft: "rgba(210,176,122,0.14)",
  ai: "#D86CFF",
  aiSoft: "rgba(216,108,255,0.16)",
  cyan: "#34D5FF",
  cyanSoft: "rgba(52,213,255,0.15)",
  mint: "#24F0A5",
  mintSoft: "rgba(36,240,165,0.14)",
  amber: "#FFCB6B",
  red: "#FF6B8A",
};

type RunwayEstimate = {
  studio?: string;
  mode?: string;
  label?: string;
  unit?: string;
  remaining_units?: number | null;
};

type RunwaySummary = {
  plan_name?: string;
  available_credits?: number | null;
  reserved_credits?: number | null;
  used_credits?: number | null;
  usage_percent?: number | null;
  top_line?: string;
  hero_lines?: string[];
  estimates?: RunwayEstimate[];
  cta?: {
    primary?: string | null;
    secondary?: string | null;
  };
};

type DashboardLibraryItem = {
  library_id?: string;
  studio?: "face" | "audio" | "video" | string;
  asset_type?: string;
  title?: string;
  status?: string;
  created_at?: string;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  download_url?: string | null;
  duration_sec?: number | null;
  source_job_id?: string | null;
  artifact_id?: string | null;
  media_asset_id?: string | null;
  reuse_payload?: Record<string, any> | null;
  metadata_json?: Record<string, any> | null;
  [key: string]: any;
};

type DashboardLibraryResponse = {
  items?: DashboardLibraryItem[];
  total?: number;
  limit?: number;
  offset?: number;
  source?: string;
  partial?: boolean;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumericValue(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseNumericValue(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function formatCredits(value: number | null, fallback = "—") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.round(Math.max(0, value))} credits`;
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)}%` : `${rounded.toFixed(1)}%`;
}

function formatWhole(value: number | null | undefined, fallback = "0") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.max(0, Math.floor(value))}`;
}

function cleanParam(v: any): string {
  if (Array.isArray(v)) v = v[0];
  return String(v ?? "").trim().replace(/^"+|"+$/g, "");
}


function cleanText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  return text;
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function normalizePlanCode(rawPlanCode: unknown) {
  const normalized = String(rawPlanCode || "free").trim().toLowerCase();
  if (/(enterprise)/.test(normalized)) return "enterprise_monthly_v1";
  if (/business_yearly/.test(normalized)) return "business_yearly_v1";
  if (/(business)/.test(normalized)) return "business_monthly_v1";
  if (/pro_yearly/.test(normalized)) return "pro_yearly_v1";
  if (/(pro|creator pro)/.test(normalized)) return "pro_monthly_v1";
  return "free";
}

function normalizeBillingKind(raw: unknown): "postpaid" | "credits" | "free" | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("postpaid")) return "postpaid";
  if (value.includes("credit")) return "credits";
  if (value.includes("free")) return "free";
  return null;
}

function joinUrl(base: string, path: any) {
  const b = String(base ?? "").replace(/\/+$/, "");
  const raw =
    typeof path === "string"
      ? path
      : typeof path?.path === "string"
        ? path.path
        : typeof path?.url === "string"
          ? path.url
          : "";
  const p0 = String(raw ?? "");
  const p = p0.startsWith("/") ? p0 : `/${p0}`;
  return `${b}${p}`;
}

function encodeNavUrl(url: string) {
  const clean = String(url ?? "").trim().replace(/^"+|"+$/g, "");
  return encodeURIComponent(clean);
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

async function fetchDashHomeOrThrow({
  token,
  logout,
}: {
  token: string;
  logout: () => Promise<void>;
}) {
  const candidates = [
    (endpoints as any)?.dashboard?.home,
    (endpoints as any)?.dashboard?.homeV1,
    "/api/dashboard/home",
  ];

  const homePath =
    candidates.find((v) => typeof v === "string" && v.length > 0) ??
    "/api/dashboard/home";

  const res = await fetch(joinUrl(DASH_BASE, homePath), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    await logout();
    throw new Error("AUTH_EXPIRED");
  }

  const data = await safeJson(res);
  if (!res.ok) {
    const msg =
      data?.detail || data?.message || data?._raw || `HTTP ${res.status}`;
    throw new Error(`Dashboard home failed: ${msg}`);
  }

  return data;
}

async function fetchDashboardLibraryOrThrow({
  token,
  logout,
  type = "all",
  limit = 50,
  offset = 0,
}: {
  token: string;
  logout: () => Promise<void>;
  type?: "all" | "face" | "audio" | "video";
  limit?: number;
  offset?: number;
}) {
  const candidatePath =
    (endpoints as any)?.dashboard?.library ??
    "/api/dashboard/library";

  const qs = `?type=${encodeURIComponent(type)}&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}&final_only=1&exclude_child_segments=1&library_scope=final_outputs`;

  const res = await fetch(joinUrl(DASH_BASE, `${candidatePath}${qs}`), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    await logout();
    throw new Error("AUTH_EXPIRED");
  }

  const data = await safeJson(res);
  if (!res.ok) {
    const msg =
      data?.detail || data?.message || data?._raw || `HTTP ${res.status}`;
    throw new Error(`Dashboard library failed: ${msg}`);
  }

  return data as DashboardLibraryResponse;
}

function pickFaceUrl(item: any): string {
  return (
    item?.preview_url ||
    item?.download_url ||
    item?.thumbnail_url ||
    item?.reuse_payload?.image_url ||
    item?.image_url ||
    item?.url ||
    item?.asset_url ||
    item?.signed_url ||
    item?.meta?.image_url ||
    item?.meta?.url ||
    item?.meta?.signed_url ||
    item?.meta?.output_url ||
    item?.output_url ||
    item?.result_url ||
    item?.variants?.[0]?.image_url ||
    item?.variants?.[0]?.url ||
    ""
  );
}

function looksLikeVideoUrl(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(text);
}

function looksLikeImageUrl(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  if (text.startsWith("data:image/")) return true;
  return /\.(jpg|jpeg|png|webp|gif|avif)(\?|#|$)/i.test(text);
}

function pickVideoThumbnailUrl(item: any): string {
  const candidates = [
    item?.thumbnail_url,
    item?.poster_url,
    item?.preview_image_url,
    item?.image_url,
    item?.reuse_payload?.thumbnail_url,
    item?.reuse_payload?.poster_url,
    item?.reuse_payload?.preview_image_url,
    item?.reuse_payload?.image_url,
    item?.metadata_json?.thumbnail_url,
    item?.metadata_json?.poster_url,
    item?.metadata_json?.preview_image_url,
    item?.metadata_json?.image_url,
    item?.metadata_json?.artifact_meta?.thumbnail_url,
    item?.metadata_json?.artifact_meta?.poster_url,
    item?.metadata_json?.artifact_meta?.image_url,
    item?.meta?.thumbnail_url,
    item?.meta?.poster_url,
    item?.meta?.preview_image_url,
    item?.meta?.image_url,
    item?.meta?.artifact_meta?.thumbnail_url,
    item?.meta?.artifact_meta?.poster_url,
    item?.variants?.[0]?.thumbnail_url,
    item?.variants?.[0]?.poster_url,
    item?.variants?.[0]?.image_url,
  ];

  for (const value of candidates) {
    const url = String(value ?? "").trim();
    if (!url) continue;
    if (looksLikeVideoUrl(url)) continue;
    if (looksLikeImageUrl(url) || /^https?:\/\//i.test(url)) return url;
  }

  return "";
}

function pickVideoUrl(item: any): string {
  const candidates = [
    item?.reuse_payload?.video_url,
    item?.video_url,
    item?.preview_url,
    item?.download_url,
    item?.url,
    item?.asset_url,
    item?.signed_url,
    item?.meta?.video_url,
    item?.meta?.url,
    item?.meta?.signed_url,
    item?.meta?.output_url,
    item?.output_url,
    item?.result_url,
    item?.variants?.[0]?.video_url,
    item?.variants?.[0]?.url,
  ];

  for (const value of candidates) {
    const url = String(value ?? "").trim();
    if (!url) continue;
    if (looksLikeImageUrl(url) && !looksLikeVideoUrl(url)) continue;
    return url;
  }

  return "";
}


function isPlainObject(value: unknown): value is Record<string, any> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function nestedObject(value: unknown, key: string): Record<string, any> {
  if (!isPlainObject(value)) return {};
  const next = value[key];
  return isPlainObject(next) ? next : {};
}

function cleanLowerText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function firstPresentValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function truthyFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const text = cleanLowerText(value);
  return text === "1" || text === "true" || text === "yes" || text === "y" || text === "on";
}

function anyTextIncludes(values: unknown[], needles: string[]): boolean {
  const text = values.map(cleanLowerText).filter(Boolean).join(" ");
  return needles.some((needle) => text.includes(needle));
}

function hasSegmentIndex(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  const text = String(value).trim();
  if (!text) return false;
  return /^\d+$/.test(text);
}

function isLongformChildVideo(item: any): boolean {
  if (!item) return false;

  const meta = isPlainObject(item?.meta) ? item.meta : {};
  const metadata = isPlainObject(item?.metadata_json) ? item.metadata_json : {};
  const reuse = isPlainObject(item?.reuse_payload) ? item.reuse_payload : {};
  const artifactMeta = {
    ...nestedObject(metadata, "artifact_meta"),
    ...nestedObject(meta, "artifact_meta"),
    ...nestedObject(reuse, "artifact_meta"),
  };

  const explicitChildFlag = [
    item?.is_child,
    item?.is_segment,
    item?.child_job,
    item?.internal_artifact,
    item?.billing_suppressed,
    item?.suppress_pricing,
    meta?.is_child,
    meta?.is_segment,
    meta?.child_job,
    meta?.internal_artifact,
    meta?.billing_suppressed,
    meta?.suppress_pricing,
    metadata?.is_child,
    metadata?.is_segment,
    metadata?.child_job,
    metadata?.internal_artifact,
    metadata?.billing_suppressed,
    metadata?.suppress_pricing,
    reuse?.is_child,
    reuse?.is_segment,
    reuse?.child_job,
    reuse?.internal_artifact,
    reuse?.billing_suppressed,
    reuse?.suppress_pricing,
    artifactMeta?.is_child,
    artifactMeta?.is_segment,
    artifactMeta?.internal_artifact,
  ].some(truthyFlag);
  if (explicitChildFlag) return true;

  const segmentId = firstPresentValue(
    item?.longform_segment_id,
    item?.segment_id,
    item?.segment_job_id,
    item?.shot_id,
    meta?.longform_segment_id,
    meta?.segment_id,
    meta?.segment_job_id,
    meta?.shot_id,
    metadata?.longform_segment_id,
    metadata?.segment_id,
    metadata?.segment_job_id,
    metadata?.shot_id,
    reuse?.longform_segment_id,
    reuse?.segment_id,
    reuse?.segment_job_id,
    reuse?.shot_id,
    artifactMeta?.longform_segment_id,
    artifactMeta?.segment_id,
    artifactMeta?.segment_job_id,
    artifactMeta?.shot_id
  );
  if (segmentId != null) return true;

  const segmentIndex = firstPresentValue(
    item?.segment_index,
    item?.segment_number,
    item?.shot_index,
    meta?.segment_index,
    meta?.segment_number,
    meta?.shot_index,
    metadata?.segment_index,
    metadata?.segment_number,
    metadata?.shot_index,
    reuse?.segment_index,
    reuse?.segment_number,
    reuse?.shot_index,
    artifactMeta?.segment_index,
    artifactMeta?.segment_number,
    artifactMeta?.shot_index
  );
  if (hasSegmentIndex(segmentIndex)) return true;

  const roleLikeValues = [
    item?.asset_role,
    item?.artifact_role,
    item?.output_role,
    item?.library_role,
    item?.generation_role,
    item?.billing_entity,
    item?.job_role,
    item?.stage,
    meta?.asset_role,
    meta?.artifact_role,
    meta?.output_role,
    meta?.library_role,
    meta?.generation_role,
    meta?.billing_entity,
    meta?.job_role,
    meta?.stage,
    metadata?.asset_role,
    metadata?.artifact_role,
    metadata?.output_role,
    metadata?.library_role,
    metadata?.generation_role,
    metadata?.billing_entity,
    metadata?.job_role,
    metadata?.stage,
    reuse?.asset_role,
    reuse?.artifact_role,
    reuse?.output_role,
    reuse?.library_role,
    reuse?.generation_role,
    reuse?.billing_entity,
    reuse?.job_role,
    reuse?.stage,
    artifactMeta?.asset_role,
    artifactMeta?.artifact_role,
    artifactMeta?.output_role,
    artifactMeta?.library_role,
    artifactMeta?.generation_role,
    artifactMeta?.billing_entity,
    artifactMeta?.job_role,
    artifactMeta?.stage,
  ];

  if (
    anyTextIncludes(roleLikeValues, [
      "child_fusion_job",
      "child_job",
      "child segment",
      "internal_child",
      "longform_segment",
      "segment_output",
      "segment-final",
      "segment_final",
      "shot_output",
      "background_segment",
      "presenter_segment",
    ])
  ) {
    return true;
  }

  const pathLikeValues = [
    item?.storage_path,
    item?.blob_path,
    item?.path,
    item?.title,
    item?.name,
    item?.source,
    meta?.storage_path,
    meta?.blob_path,
    meta?.path,
    meta?.title,
    metadata?.storage_path,
    metadata?.blob_path,
    metadata?.path,
    metadata?.title,
    reuse?.storage_path,
    reuse?.blob_path,
    reuse?.path,
    reuse?.title,
  ];

  return anyTextIncludes(pathLikeValues, [
    "/segments/",
    "longform-segment",
    "longform_segment",
    "segment_",
    "segment-",
    "/shots/",
    "shot_",
    "shot-",
  ]);
}

function isDisplayableFinalVideo(item: any): boolean {
  if (!item || item?.studio !== "video") return false;
  if (isLongformChildVideo(item)) return false;
  return Boolean(String(pickVideoUrl(item) || "").trim());
}

function uniqueFinalVideos(items: DashboardLibraryItem[]): DashboardLibraryItem[] {
  const seen = new Set<string>();
  const output: DashboardLibraryItem[] = [];

  for (const item of items) {
    if (!isDisplayableFinalVideo(item)) continue;
    const url = String(pickVideoUrl(item) || "").trim();
    const identity = String(
      item?.library_id ||
        item?.media_asset_id ||
        item?.artifact_id ||
        item?.source_job_id ||
        item?.metadata_json?.longform_job_id ||
        item?.metadata_json?.job_id ||
        item?.meta?.longform_job_id ||
        item?.meta?.job_id ||
        url.split("?")[0]
    );
    if (seen.has(identity)) continue;
    seen.add(identity);
    output.push(item);
  }

  return output;
}

function pickVariantNumber(item: any): number {
  const v =
    item?.reuse_payload?.variant_number ??
    item?.meta?.variant_number ??
    item?.variant_number ??
    item?.variants?.[0]?.meta?.variant_number ??
    item?.variants?.[0]?.variant_number ??
    1;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function pickCreatedAtLabel(item: any): string {
  const t = item?.created_at ?? item?.meta?.created_at;
  return t ? new Date(t).toLocaleString() : "—";
}

function pickFaceArtifactId(item: any): string {
  return String(
    item?.reuse_payload?.face_artifact_id ??
      item?.reuse_payload?.artifact_id ??
      item?.artifact_id ??
      item?.face_artifact_id ??
      item?.metadata_json?.face_artifact_id ??
      item?.metadata_json?.artifact_id ??
      item?.metadata_json?.artifact_meta?.face_artifact_id ??
      item?.metadata_json?.artifact_meta?.artifact_id ??
      item?.metadata_json?.reuse_payload?.face_artifact_id ??
      item?.metadata_json?.reuse_payload?.artifact_id ??
      item?.meta?.artifact_id ??
      item?.meta?.face_artifact_id ??
      item?.variants?.[0]?.face_artifact_id ??
      item?.variants?.[0]?.artifact_id ??
      item?.variants?.[0]?.metadata_json?.face_artifact_id ??
      item?.variants?.[0]?.metadata_json?.artifact_id ??
      item?.variants?.[0]?.meta?.artifact_id ??
      ""
  ).trim();
}

function pickFaceMediaAssetId(item: any): string {
  return String(
    item?.reuse_payload?.face_media_asset_id ??
      item?.reuse_payload?.media_asset_id ??
      item?.media_asset_id ??
      item?.face_media_asset_id ??
      item?.metadata_json?.face_media_asset_id ??
      item?.metadata_json?.media_asset_id ??
      item?.metadata_json?.artifact_meta?.face_media_asset_id ??
      item?.metadata_json?.artifact_meta?.media_asset_id ??
      item?.meta?.media_asset_id ??
      item?.variants?.[0]?.face_media_asset_id ??
      item?.variants?.[0]?.media_asset_id ??
      item?.variants?.[0]?.metadata_json?.face_media_asset_id ??
      item?.variants?.[0]?.metadata_json?.media_asset_id ??
      item?.variants?.[0]?.meta?.media_asset_id ??
      ""
  ).trim();
}

function pickFaceProfileId(item: any): string {
  return String(
    item?.reuse_payload?.face_profile_id ??
      item?.face_profile_id ??
      item?.metadata_json?.face_profile_id ??
      item?.metadata_json?.artifact_meta?.face_profile_id ??
      item?.meta?.face_profile_id ??
      item?.variants?.[0]?.face_profile_id ??
      item?.variants?.[0]?.metadata_json?.face_profile_id ??
      item?.variants?.[0]?.meta?.face_profile_id ??
      ""
  ).trim();
}

function pickFaceGender(item: any): string {
  return String(
    item?.reuse_payload?.gender ??
      item?.gender ??
      item?.metadata_json?.gender ??
      item?.metadata_json?.artifact_meta?.gender ??
      item?.meta?.gender ??
      item?.variants?.[0]?.gender ??
      item?.variants?.[0]?.metadata_json?.gender ??
      item?.variants?.[0]?.meta?.gender ??
      ""
  ).trim();
}

function normalizeAspectRatio(v: any): "9:16" | "16:9" | "1:1" {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "16:9" || s === "landscape") return "16:9";
  if (s === "1:1" || s === "square") return "1:1";
  return "9:16";
}

function pickFaceAspectRatio(item: any): "9:16" | "16:9" | "1:1" {
  return normalizeAspectRatio(
    item?.reuse_payload?.aspect_ratio ??
      item?.aspect_ratio ??
      item?.metadata_json?.aspect_ratio ??
      item?.metadata_json?.artifact_meta?.aspect_ratio ??
      item?.meta?.aspect_ratio ??
      item?.resolution ??
      item?.meta?.resolution ??
      item?.variants?.[0]?.aspect_ratio ??
      item?.variants?.[0]?.metadata_json?.aspect_ratio ??
      item?.variants?.[0]?.meta?.aspect_ratio ??
      "9:16"
  );
}

function getRunwayEstimateByMode(runway: RunwaySummary | null | undefined, studio: string, modes: string[]) {
  const estimates = Array.isArray(runway?.estimates) ? runway?.estimates ?? [] : [];
  return estimates.find((item) => item?.studio === studio && modes.includes(String(item?.mode ?? ""))) ?? null;
}

function formatRunwayHeroLine(item: RunwayEstimate | null | undefined): string | null {
  const remaining = Number(item?.remaining_units ?? 0);
  if (!Number.isFinite(remaining)) return null;

  if (item?.studio === "face" && item?.mode === "i2i") {
    return `~${formatWhole(remaining)} face edit runs`;
  }
  if (item?.studio === "face") {
    return `~${formatWhole(remaining)} face runs`;
  }
  if (item?.studio === "audio") {
    return `~${formatWhole(remaining)} audio 1K-char blocks`;
  }
  if (item?.studio === "fusion" && item?.mode === "cinematic_video") {
    return `~${formatWhole(remaining)} sec of cinematic fusion`;
  }
  if (item?.studio === "fusion") {
    return `~${formatWhole(remaining)} sec of fusion`;
  }
  return item?.label ? `~${formatWhole(remaining)} ${String(item.label).toLowerCase()}` : null;
}

function uniqueLines(lines: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const line = String(raw ?? "").trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function extractUsageLabelFromTopLine(topLine: string | null | undefined, planName: string) {
  const top = String(topLine ?? "").trim();
  if (!top) return "";
  const prefix = `${String(planName ?? "").trim()} • `;
  return top.startsWith(prefix) ? top.slice(prefix.length) : top;
}

function buildRunwayDisplay(data: any, snapshot: any) {
  const runway = (data?.runway_summary ?? null) as RunwaySummary | null;
  const pricing = data?.pricing_summary ?? {};
  const usage = data?.usage_summary ?? {};

  const availableCredits = firstNumericValue(
    runway?.available_credits,
    pricing?.available_credits,
    snapshot?.availableCredits,
    snapshot?.available_credits,
    snapshot?.pricingSummary?.available_credits,
    snapshot?.usageSummary?.available_credits,
    data?.gauges?.fuel?.credits_remaining
  );

  const reservedCredits = firstNumericValue(
    runway?.reserved_credits,
    pricing?.reserved_credits,
    snapshot?.reservedCredits,
    snapshot?.reserved_credits,
    snapshot?.pricingSummary?.reserved_credits,
    snapshot?.usageSummary?.reserved_credits,
    data?.gauges?.fuel?.reserved_credits
  );

  const usedCredits = firstNumericValue(
    runway?.used_credits,
    usage?.used_credits,
    snapshot?.usedCredits,
    snapshot?.used_credits,
    snapshot?.usageSummary?.used_credits,
    snapshot?.consumedCredits,
    snapshot?.consumed_credits
  );

  const usagePercent = firstNumericValue(
    runway?.usage_percent,
    usage?.usage_percent,
    snapshot?.usagePercent,
    snapshot?.usage_percent,
    snapshot?.usageSummary?.usage_percent
  );

  const planName = String(
    runway?.plan_name ??
      data?.plan_summary?.plan_name ??
      snapshot?.planName ??
      "Free"
  ).trim() || "Free";

  const settlementKind = normalizeBillingKind(
    pickText(
      pricing?.settlement_mode,
      pricing?.settlementMode,
      pricing?.billing_mode,
      pricing?.billingMode,
      usage?.settlement_mode,
      usage?.settlementMode,
      snapshot?.settlement_mode,
      snapshot?.settlementMode,
      snapshot?.billing_mode,
      snapshot?.billingMode,
      snapshot?.pricingSummary?.settlement_mode,
      snapshot?.pricingSummary?.settlementMode,
      snapshot?.usageSummary?.settlement_mode,
      snapshot?.usageSummary?.settlementMode
    )
  );

  const tierCode = pickText(
    snapshot?.tier_code,
    snapshot?.tierCode,
    snapshot?.plan_summary?.tier_code,
    snapshot?.planSummary?.tier_code,
    pricing?.tier_code,
    pricing?.tierCode,
    usage?.tier_code,
    usage?.tierCode
  );

  const billingAccountId = pickText(
    snapshot?.billing_account_id,
    snapshot?.billingAccountId,
    snapshot?.billing_account?.id,
    snapshot?.billingAccount?.id,
    snapshot?.plan_summary?.billing_account_id,
    snapshot?.planSummary?.billing_account_id,
    pricing?.billing_account_id,
    pricing?.billingAccountId
  );

  const isEnterprisePlan = normalizePlanCode(planName) === "enterprise_monthly_v1" || String(tierCode || "").trim().toLowerCase().includes("enterprise");
  const isPostpaidLike =
    settlementKind === "postpaid" ||
    (billingAccountId && isEnterprisePlan) ||
    isEnterprisePlan;

  const topLine = String(
    runway?.top_line ||
      (isPostpaidLike
        ? `${planName} • billed after completion`
        : `${planName} • ${formatWhole(availableCredits)} available • ${formatWhole(reservedCredits)} reserved • ${formatWhole(usedCredits)} used`)
  );

  const faceEstimate = getRunwayEstimateByMode(runway, "face", ["t2i", "i2i"]);
  const fusionEstimate = getRunwayEstimateByMode(runway, "fusion", ["talking_video", "cinematic_video"]);

  const heroLines = uniqueLines([
    formatRunwayHeroLine(faceEstimate),
    formatRunwayHeroLine(fusionEstimate),
    isPostpaidLike ? "Usage billed after completion" : null,
  ]);

  const usageLabel = isPostpaidLike
    ? `${formatWhole(usedCredits, "0")} used • ${formatWhole(reservedCredits, "0")} reserved • billed after completion`
    : extractUsageLabelFromTopLine(topLine, planName);

  return {
    planName,
    availableCredits,
    reservedCredits,
    usedCredits,
    usagePercent: usagePercent ?? 0,
    compactUsageLabel: isPostpaidLike
      ? `${formatWhole(usedCredits, "0")} used • ${formatWhole(reservedCredits, "0")} reserved • billed after completion`
      : `${formatCredits(availableCredits, "—")} available • ${formatCredits(reservedCredits, "0 credits")} reserved • ${formatCredits(usedCredits, "—")} used`,
    runwayTopLine: topLine,
    usageLabel,
    heroLines,
    displayKind: isPostpaidLike ? "postpaid" : "credits",
    billingValue: isEnterprisePlan ? "Enterprise" : "Postpaid",
  };
}

function buildLibrarySummary(library: DashboardLibraryResponse | null | undefined) {
  const items = Array.isArray(library?.items) ? library?.items ?? [] : [];
  const faces = items.filter((item) => item?.studio === "face");
  const videos = uniqueFinalVideos(items.filter((item) => item?.studio === "video"));

  return {
    faces,
    videos,
    total: faces.length + videos.length,
    faceCount: faces.length,
    videoCount: videos.length,
  };
}

export default function TeslaDashboard({
  onMenuPress,
}: {
  onMenuPress?: () => void;
}) {
  const auth = useAuth() as any;
  const menuParams = useLocalSearchParams<{ openMenu?: string | string[]; menu_nonce?: string | string[] }>();
  const { token, isReady, isAuthed, logout } = auth;
  const authUserId =
    cleanParam(auth?.userId) ||
    cleanParam(auth?.user?.id) ||
    cleanParam(auth?.session?.user?.id) ||
    cleanParam(auth?.authState?.user?.id) ||
    "";
  const snapshot = useAccountPricingSnapshot() as any;
  const flow = useCreatorFlow() as any;
  const setFaceSelection = flow?.setFaceSelection as undefined | ((x: any) => void);
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);
  const isFocused = useIsFocused();
  const pricingOverview = useResolvedPricingDisplay({ enabled: isFocused && Boolean(isReady) && Boolean(isAuthed) });
  const handledMenuNonceRef = React.useRef<string>("");

  const [data, setData] = React.useState<any>(null);
  const [libraryData, setLibraryData] = React.useState<DashboardLibraryResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const lastAuthSessionKeyRef = React.useRef<string>("");

  React.useEffect(() => {
    if (!isReady) return;
    const next = authUserId || "anon";
    if (lastAuthSessionKeyRef.current === next) return;
    lastAuthSessionKeyRef.current = next;
    setData(null);
    setLibraryData(null);
  }, [authUserId, isReady]);

  const loadOnce = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [home, library] = await Promise.all([
        fetchDashHomeOrThrow({ token, logout }),
        fetchDashboardLibraryOrThrow({
          token,
          logout,
          type: "all",
          limit: 50,
          offset: 0,
        }),
      ]);
      setData(home);
      setLibraryData(library);
    } catch (e) {
      console.log("DF_TESLA_DASH_HOME_ERR", (e as any)?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [token, logout, authUserId]);

  const openMenuFlag = cleanParam(menuParams.openMenu);
  const menuNonce = cleanParam(menuParams.menu_nonce);

  React.useEffect(() => {
    if (!isFocused) return;
    if (!isReady) return;
    if (!isAuthed || !token) return;
    loadOnce();
  }, [isFocused, isReady, isAuthed, token, authUserId, loadOnce]);

  React.useEffect(() => {
    if (!isFocused) return;
    if (!onMenuPress) return;
    if (openMenuFlag !== "1" || !menuNonce) return;
    if (handledMenuNonceRef.current === menuNonce) return;
    handledMenuNonceRef.current = menuNonce;

    const timer = setTimeout(() => {
      onMenuPress();
    }, 60);

    return () => clearTimeout(timer);
  }, [isFocused, onMenuPress, openMenuFlag, menuNonce]);


  const libraryVm = React.useMemo(() => buildLibrarySummary(libraryData), [libraryData]);

  const dashboardVm = React.useMemo(() => {
    const d = data ?? {};
    const g = d?.gauges ?? {};
    const speed = g?.speedometer ?? {};
    const health = g?.health ?? {};
    const fallbackRunway = resolvePricingDisplay({ dashboardData: d, snapshot });
    const hasCanonicalPricing =
      pricingOverview.accountTruthSource === "payments_overview" ||
      pricingOverview.source === "payments_overview";
    const runway = hasCanonicalPricing ? pricingOverview : fallbackRunway;

    const faces60m = Number(speed?.faces_last_60m ?? 0);
    const videos60m = Number(speed?.videos_last_60m ?? 0);
    const providerHealth = clamp(Number(health?.value_norm ?? 1) * 100, 0, 100);
    const successRate = clamp(Number(g?.success_rate?.raw_value ?? d?.success_rate ?? 0), 0, 100);

    return {
      planName: runway.planName || "Free",
      compactUsageLabel: runway.compactUsageLabel,
      totalUsagePercent: runway.usagePercent,
      usedPercentLabel: formatPercent(runway.usagePercent || 0),
      faces60m,
      videos60m,
      providerHealth,
      successRate,
      runwayTopLine: runway.topLine,
      heroLines: runway.heroLines,
      usageLabel: runway.usageLabel,
      availableCredits: runway.availableCredits,
      reservedCredits: runway.reservedCredits,
      usedCredits: runway.usedCredits,
      totalCredits: runway.totalCredits,
      availableOutOfTotalLabel: runway.availableOutOfTotalLabel,
      includedAvailableCredits: runway.includedAvailableCredits,
      walletAvailableCredits: runway.walletAvailableCredits,
      promoAvailableCredits: runway.promoAvailableCredits,
      includedLabel: runway.includedLabel,
      walletLabel: runway.walletLabel,
      promoLabel: runway.promoLabel,
      creditBreakdownLabel: runway.creditBreakdownLabel,
      creditDetailLabel: runway.creditDetailLabel,
      totalSpendableCredits: runway.totalSpendableCredits,
      displayKind: runway.displayKind,
      billingValue: runway.billingValue,
    };
  }, [data, snapshot, pricingOverview]);

  const providerHealthPct = Math.floor(dashboardVm.providerHealth);

  const healthTone: "green" | "amber" | "red" =
    providerHealthPct >= 80
      ? "green"
      : providerHealthPct >= 55
        ? "amber"
        : "red";

  const goPricing = () => router.push({ pathname: "/pricing/plan-billing" });
  const goLibrary = () => router.push({ pathname: "/media/library" as any } as any);
  const goFace = () => router.push("/(tabs)/face");

  const FACE_DECK_W = 136;
  const FACE_DECK_H = 156;
  const VIDEO_DECK_W = 136;
  const VIDEO_DECK_H = 156;
  const FAN_COUNT = 3;

  const faces = React.useMemo(() => {
    return libraryVm.faces.length
      ? libraryVm.faces
      : Array.isArray(data?.face_carousel)
        ? data.face_carousel
        : [];
  }, [data, libraryVm]);

  const videos = React.useMemo(() => {
    return libraryVm.videos.length
      ? libraryVm.videos
      : Array.isArray(data?.video_carousel)
        ? uniqueFinalVideos(data.video_carousel)
        : [];
  }, [data, libraryVm]);

  const faceItems: ThumbFanItem[] = React.useMemo(() => {
    return (faces ?? []).slice(0, 10).map((a: any, i: number) => ({
      id: String(a?.library_id ?? a?.id ?? a?.meta?.artifact_id ?? a?.storage_path ?? String(i)),
      kind: "image",
      url: pickFaceUrl(a),
      meta: a,
    }));
  }, [faces]);

  const videoItems: ThumbFanItem[] = React.useMemo(() => {
    return (videos ?? []).slice(0, 10).map((a: any, i: number) => {
      const videoUrl = String(pickVideoUrl(a) || "").trim();
      const thumbnailUrl = String(pickVideoThumbnailUrl(a) || "").trim();
      return {
        id: String(a?.library_id ?? a?.id ?? a?.source_job_id ?? a?.meta?.artifact_id ?? a?.storage_path ?? String(i)),
        kind: "image" as any,
        // ThumbFanDeckCarousel/VideoCard should render the JPEG poster, while openVideoItem uses __video_url.
        url: thumbnailUrl || videoUrl,
        meta: {
          ...a,
          __thumbnail_url: thumbnailUrl,
          __video_url: videoUrl,
        },
      };
    });
  }, [videos]);

  const openFaceItem = React.useCallback((it: ThumbFanItem) => {
    const meta = it?.meta ?? {};
    const url = String(it?.url ?? pickFaceUrl(meta) ?? "").trim();
    if (!url) return;

    const vnum = pickVariantNumber(meta);
    const ts = pickCreatedAtLabel(meta);
    const faceArtifactId = pickFaceArtifactId(meta);
    const faceMediaAssetId = pickFaceMediaAssetId(meta);
    const faceProfileId = pickFaceProfileId(meta);
    const faceGender = pickFaceGender(meta);
    const aspectRatio = pickFaceAspectRatio(meta);

    setFaceSelection?.({
      sasUrl: url,
      imageUrl: url,
      image_url: url,
      face_image_url: url,
      face_sas_url: url,

      artifactId: faceArtifactId || undefined,
      faceArtifactId: faceArtifactId || undefined,
      artifact_id: faceArtifactId || undefined,
      face_artifact_id: faceArtifactId || undefined,

      mediaAssetId: faceMediaAssetId || undefined,
      faceMediaAssetId: faceMediaAssetId || undefined,
      media_asset_id: faceMediaAssetId || undefined,
      face_media_asset_id: faceMediaAssetId || undefined,

      faceProfileId: faceProfileId || undefined,
      face_profile_id: faceProfileId || undefined,

      gender: faceGender || undefined,
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
    } as any);

    setFusionSettings?.({
      fusionAspectRatio: aspectRatio,
      fusionFaceArtifactId: faceArtifactId || undefined,
    } as any);

    saveCreateFlowContext({
      image_url: url,
      face_image_url: url,
      face_sas_url: url,

      face_artifact_id: faceArtifactId || undefined,
      artifact_id: faceArtifactId || undefined,

      face_profile_id: faceProfileId || undefined,
      face_media_asset_id: faceMediaAssetId || undefined,
      media_asset_id: faceMediaAssetId || undefined,

      aspect_ratio: aspectRatio,
      ...(faceGender ? ({ gender: faceGender } as any) : {}),
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
    } as any).catch(() => {});

    router.push({
      pathname: "/media/viewer",
      params: {
        type: "image",
        image_url: url,
        face_image_url: url,
        face_sas_url: url,
        url: url,
        title: String(meta?.title ?? `Face • v${vnum}`),
        subtitle: ts,
        stage: "face_done",
        face_artifact_id: faceArtifactId || "",
        artifact_id: faceArtifactId || "",
        face_profile_id: faceProfileId || "",
        face_media_asset_id: faceMediaAssetId || "",
        media_asset_id: faceMediaAssetId || "",
        gender: faceGender || "",
        aspect_ratio: aspectRatio,
      },
    } as any);
  }, [setFaceSelection, setFusionSettings, authUserId]);

  const openVideoItem = React.useCallback((it: ThumbFanItem) => {
    const meta = it?.meta ?? {};
    const url = String(meta?.__video_url ?? pickVideoUrl(meta) ?? "").trim();
    if (!url) return;

    const vnum = pickVariantNumber(meta);
    const ts = pickCreatedAtLabel(meta);
    const encodedUrl = encodeNavUrl(url);

    router.push({
      pathname: "/media/viewer",
      params: {
        type: "video",
        video_url: encodedUrl,
        url: encodedUrl,
        title: String(meta?.title ?? `Fusion • v${vnum}`),
        subtitle: ts,
        stage: "video_done",
      },
    } as any);
  }, []);


  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.backdropGlowOne} />
      <View pointerEvents="none" style={styles.backdropGlowTwo} />
      <DFHeader
        subtitle="Digital Command Center"
        planLabel={dashboardVm.planName ?? undefined}
        usageLabel={dashboardVm.usageLabel ?? dashboardVm.compactUsageLabel ?? undefined}
        statusTone={healthTone}
        onMenuPress={onMenuPress}
        onPressMeta={goPricing}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            tintColor={DF.cyan}
            refreshing={loading}
            onRefresh={loadOnce}
          />
        }
      >
        {loading && !data ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={DF.cyan} />
          </View>
        ) : null}

        <View style={styles.cockpitCard}>
          <View pointerEvents="none" style={styles.cockpitGridOverlay} />
          <View style={styles.cockpitTopRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.kickerRow}>
                <View style={styles.liveDot} />
                <Text style={styles.kickerText}>DESIFACES CONTROL / LIVE</Text>
              </View>
              <Text style={styles.cockpitTitle}>Creative cockpit</Text>
              <Text style={styles.cockpitSubtitle} numberOfLines={2}>
                {dashboardVm.creditDetailLabel || dashboardVm.runwayTopLine || "Create, monitor, and reuse your digital assets."}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                loadOnce();
                pricingOverview.refetch?.();
              }}
              style={styles.refreshOrb}
            >
              <Ionicons name="sync" size={18} color={DF.textStrong} />
            </Pressable>
          </View>

          <View style={styles.cockpitBodyRow}>
            <View style={styles.creditCore}>
              <Text style={styles.creditCoreLabel}>{dashboardVm.displayKind === "postpaid" ? "BILLING MODE" : "AVAILABLE CREDITS"}</Text>
              <Text style={styles.creditCoreValue} numberOfLines={1}>
                {dashboardVm.displayKind === "postpaid" ? String(dashboardVm.billingValue ?? "Postpaid") : formatWhole(dashboardVm.availableCredits, "—")}
              </Text>
              <Text style={styles.creditCoreSub} numberOfLines={2}>
                {dashboardVm.displayKind === "postpaid"
                  ? `${formatWhole(dashboardVm.usedCredits, "0")} used • ${formatWhole(dashboardVm.reservedCredits, "0")} reserved`
                  : dashboardVm.availableOutOfTotalLabel || dashboardVm.compactUsageLabel || "Credits ready"}
              </Text>
            </View>

            <View style={styles.healthStack}>
              <SignalMetric
                icon="pulse-outline"
                label="Provider health"
                value={`${providerHealthPct}%`}
                detail={healthTone === "green" ? "stable" : healthTone === "amber" ? "watch" : "attention"}
                progress={providerHealthPct / 100}
                accent={healthTone === "green" ? DF.mint : healthTone === "amber" ? DF.amber : DF.red}
                compact
              />
              <SignalMetric
                icon="shield-checkmark-outline"
                label="Success rate"
                value={Number.isFinite(Number(dashboardVm.successRate)) ? `${Math.round(Number(dashboardVm.successRate))}%` : "—"}
                detail="24h quality"
                progress={Number.isFinite(Number(dashboardVm.successRate)) ? Number(dashboardVm.successRate) / 100 : 0}
                accent={DF.ai}
                compact
              />
            </View>
          </View>

          <View style={styles.cockpitActionRow}>
            <Pressable onPress={goFace} style={styles.primaryNeoButton}>
              <Ionicons name="sparkles-outline" size={15} color={DF.bg} />
              <Text style={styles.primaryNeoButtonText}>Create fresh</Text>
            </Pressable>
            <Pressable onPress={goLibrary} style={styles.secondaryNeoButton}>
              <Ionicons name="folder-open-outline" size={15} color={DF.cyan} />
              <Text style={styles.secondaryNeoButtonText}>Saved work</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.signalGrid}>
          <SignalMetric
            icon="person-outline"
            label="Faces"
            value={Number.isFinite(Number(dashboardVm.faces60m)) ? `${Math.round(Number(dashboardVm.faces60m))}` : "—"}
            detail="last hour"
            progress={Math.max(0, Math.min(1, (Number(dashboardVm.faces60m || 0) || 0) / 20))}
            accent={DF.gold}
          />
          <SignalMetric
            icon="videocam-outline"
            label="Videos"
            value={Number.isFinite(Number(dashboardVm.videos60m)) ? `${Math.round(Number(dashboardVm.videos60m))}` : "—"}
            detail="last hour"
            progress={Math.max(0, Math.min(1, (Number(dashboardVm.videos60m || 0) || 0) / 10))}
            accent={DF.cyan}
          />
          <SignalMetric
            icon="analytics-outline"
            label="Usage"
            value={dashboardVm.usedPercentLabel || "—"}
            detail="cycle"
            progress={Math.max(0, Math.min(1, (dashboardVm.totalUsagePercent || 0) / 100))}
            accent={DF.mint}
          />
        </View>

        <View style={styles.matrixCard}>
          <View style={styles.matrixHeaderRow}>
            <View style={styles.matrixIconBox}>
              <Ionicons name="hardware-chip-outline" size={18} color={DF.cyan} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.matrixTitle}>{dashboardVm.displayKind === "postpaid" ? "Billing Matrix" : "Credit Matrix"}</Text>
              <Text style={styles.matrixSubtitle} numberOfLines={3}>
                {dashboardVm.creditDetailLabel || dashboardVm.runwayTopLine}
              </Text>
            </View>
            <Pressable onPress={goPricing} style={styles.matrixPlanButton}>
              <Text style={styles.matrixPlanButtonText}>Plan</Text>
            </Pressable>
          </View>

          <View style={styles.metricRow}>
            {dashboardVm.displayKind === "postpaid" ? (
              <>
                <MiniMetric title="Billing" value={String(dashboardVm.billingValue ?? "Postpaid")} sublabel="account" />
                <MiniMetric title="Used" value={formatWhole(dashboardVm.usedCredits, "0")} sublabel="activity" />
                <MiniMetric title="Reserved" value={formatWhole(dashboardVm.reservedCredits, "0")} sublabel="activity" />
              </>
            ) : (
              <>
                <MiniMetric title="Available" value={formatWhole(dashboardVm.availableCredits, "—")} sublabel="total credits" />
                <MiniMetric
                  title="Plan"
                  value={formatWhole(dashboardVm.includedAvailableCredits ?? dashboardVm.totalCredits, "—")}
                  sublabel={dashboardVm.totalCredits != null ? `of ${formatWhole(dashboardVm.totalCredits)} monthly` : "monthly credits"}
                />
                <MiniMetric title="Top-up" value={formatWhole(dashboardVm.walletAvailableCredits, "0")} sublabel="purchased" />
              </>
            )}
          </View>

          <View style={styles.runwayLinesWrap}>
            {dashboardVm.displayKind !== "postpaid" && dashboardVm.creditBreakdownLabel ? (
              <View style={styles.runwayChip}>
                <Text style={styles.runwayChipText}>{dashboardVm.creditBreakdownLabel}</Text>
              </View>
            ) : null}
            {dashboardVm.displayKind !== "postpaid" ? (
              <View style={styles.runwayChip}>
                <Text style={styles.runwayChipText}>{`${formatWhole(dashboardVm.reservedCredits, "0")} reserved • ${formatWhole(dashboardVm.usedCredits, "0")} used`}</Text>
              </View>
            ) : null}
            {dashboardVm.heroLines.slice(0, dashboardVm.creditBreakdownLabel ? 1 : 2).map((line, idx) => (
              <View key={`${line}:${idx}`} style={styles.runwayChipAlt}>
                <Text style={styles.runwayChipText}>{line}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.vaultCard}>
          <View style={styles.vaultTopRow}>
            <View style={styles.vaultIconFrame}>
              <Ionicons name="albums-outline" size={18} color={DF.textStrong} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.vaultTitle}>Asset Vault</Text>
              <Text style={styles.vaultSubtitle}>Saved faces and final videos, ready for reuse.</Text>
            </View>
          </View>
          <View style={styles.vaultStatsRow}>
            <VaultMetric value={String(libraryVm.total)} label="items" />
            <VaultMetric value={String(libraryVm.faceCount)} label="faces" />
            <VaultMetric value={String(libraryVm.videoCount)} label="videos" />
          </View>
          <Pressable onPress={goLibrary} style={styles.vaultButton}>
            <Text style={styles.vaultButtonText}>Browse saved work</Text>
            <Ionicons name="arrow-forward" size={15} color={DF.bg} />
          </Pressable>
        </View>

        <View style={styles.mediaStack}>
          <View style={styles.mediaPanel}>
            <SectionTitle
              title="Recent Faces"
              rightLabel={faces?.length ? `${Math.min(faces.length, 10)}/${faces.length}` : undefined}
              icon="aperture-outline"
            />
            {faceItems.length > 0 ? (
              <View style={styles.deckOuterCompact}>
                <ThumbFanDeckCarousel
                  items={faceItems}
                  width={FACE_DECK_W}
                  height={FACE_DECK_H}
                  fanCount={FAN_COUNT}
                  enableOuterPress
                  onPressItem={openFaceItem}
                  renderCard={(it) => (
                    <FaceCard
                      item={{
                        ...(it.meta ?? {}),
                        url: it.url,
                        image_url: it.url,
                      }}
                      mode="deck"
                      hosted
                      fillParent
                      disablePress
                      disableActions
                    />
                  )}
                />
              </View>
            ) : (
              <EmptyCompact text={loading ? "Loading saved faces…" : "No saved faces yet"} />
            )}
          </View>

          <View style={styles.mediaPanelAccent}>
            <SectionTitle
              title="Recent Videos"
              rightLabel={videos?.length ? `${Math.min(videos.length, 10)}/${videos.length}` : undefined}
              icon="film-outline"
            />
            {videoItems.length > 0 ? (
              <View style={styles.deckOuterCompact}>
                <ThumbFanDeckCarousel
                  items={videoItems}
                  width={VIDEO_DECK_W}
                  height={VIDEO_DECK_H}
                  fanCount={FAN_COUNT}
                  enableOuterPress
                  onPressItem={openVideoItem}
                  renderCard={(it) => {
                    const meta: any = it.meta ?? {};
                    const videoUrl = String(meta.__video_url ?? pickVideoUrl(meta) ?? "").trim();
                    const thumbnailUrl = String(meta.__thumbnail_url ?? pickVideoThumbnailUrl(meta) ?? "").trim();
                    return (
                      <DashboardVideoPosterCard
                        title={String(meta.title ?? "Talking Video")}
                        thumbnailUrl={thumbnailUrl}
                        videoUrl={videoUrl}
                      />
                    );
                  }}
                />
              </View>
            ) : (
              <EmptyCompact text={loading ? "Loading saved videos…" : "No saved videos yet"} />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({
  title,
  rightLabel,
  icon,
}: {
  title: string;
  rightLabel?: string;
  icon?: any;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {icon ? (
          <View style={styles.sectionIconBubble}>
            <Ionicons name={icon} size={14} color={DF.cyan} />
          </View>
        ) : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {!!rightLabel ? (
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{rightLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

function MiniMetric({ title, value, sublabel }: { title: string; value: string; sublabel: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricSublabel} numberOfLines={1}>{sublabel}</Text>
    </View>
  );
}

function SignalMetric({
  icon,
  label,
  value,
  detail,
  progress,
  accent,
  compact,
}: {
  icon: any;
  label: string;
  value: string;
  detail: string;
  progress: number;
  accent: string;
  compact?: boolean;
}) {
  const width: DimensionValue = `${Math.round(clamp(progress, 0, 1) * 100)}%`;
  return (
    <View style={[styles.signalCard, compact ? styles.signalCardCompact : null]}>
      <View style={styles.signalTopRow}>
        <View style={[styles.signalIcon, { borderColor: accent, backgroundColor: `${accent}22` }]}>
          <Ionicons name={icon} size={compact ? 13 : 15} color={accent} />
        </View>
        <Text style={styles.signalLabel} numberOfLines={1}>{label}</Text>
      </View>
      <View style={styles.signalValueRow}>
        <Text style={styles.signalValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.signalDetail} numberOfLines={1}>{detail}</Text>
      </View>
      <View style={styles.signalRail}>
        <View style={[styles.signalRailFill, { width, backgroundColor: accent }]} />
      </View>
    </View>
  );
}

function VaultMetric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.vaultMetric}>
      <Text style={styles.vaultMetricValue}>{value}</Text>
      <Text style={styles.vaultMetricLabel}>{label}</Text>
    </View>
  );
}

function EmptyCompact({ text }: { text: string }) {
  return (
    <View style={styles.emptyWrapCompact}>
      <View style={styles.emptyPulse} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function DashboardVideoPosterCard({
  title,
  thumbnailUrl,
  videoUrl,
}: {
  title: string;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
}) {
  const hasThumbnail = Boolean(String(thumbnailUrl || "").trim());
  const hasVideo = Boolean(String(videoUrl || "").trim());

  return (
    <View style={styles.videoPosterCard}>
      {hasThumbnail ? (
        <ImageBackground
          source={{ uri: String(thumbnailUrl) }}
          style={styles.videoPosterImage}
          imageStyle={styles.videoPosterImageRadius}
          resizeMode="cover"
        >
          <View style={styles.videoPosterShade} />
          <View style={styles.videoPosterPlayPill}>
            <Ionicons name="play" size={14} color={DF.bg} />
          </View>
          <View style={styles.videoPosterFooter}>
            <Text style={styles.videoPosterEyebrow}>Video</Text>
            <Text numberOfLines={1} style={styles.videoPosterTitle}>{title || "Talking Video"}</Text>
          </View>
        </ImageBackground>
      ) : (
        <View style={styles.videoPosterFallback}>
          <Ionicons name={hasVideo ? "play-circle-outline" : "alert-circle-outline"} size={24} color={DF.textSoft} />
          <Text style={styles.videoPosterFallbackText}>{hasVideo ? "Tap to play" : "Video unavailable"}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DF.bg,
  },
  backdropGlowOne: {
    position: "absolute",
    top: -120,
    right: -110,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(52,213,255,0.13)",
  },
  backdropGlowTwo: {
    position: "absolute",
    top: 240,
    left: -160,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(216,108,255,0.12)",
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 30,
  },

  loadingWrap: {
    marginTop: 8,
    marginBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  cockpitCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: DF.border,
    backgroundColor: "rgba(5,16,28,0.92)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  cockpitGridOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.03)",
    backgroundColor: "rgba(52,213,255,0.035)",
  },
  cockpitTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 8,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: DF.mint,
  },
  kickerText: {
    color: DF.cyan,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1.4,
  },
  cockpitTitle: {
    color: DF.textStrong,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
  },
  cockpitSubtitle: {
    color: DF.textSoft,
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  refreshOrb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: DF.border,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  cockpitBodyRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "stretch",
  },
  creditCore: {
    flex: 1.08,
    minHeight: 142,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(52,213,255,0.22)",
    backgroundColor: "rgba(52,213,255,0.08)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    justifyContent: "space-between",
  },
  creditCoreLabel: {
    color: DF.cyan,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 1,
  },
  creditCoreValue: {
    color: DF.textStrong,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.4,
  },
  creditCoreSub: {
    color: DF.textSoft,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "800",
  },
  healthStack: {
    flex: 1,
    gap: 10,
  },
  cockpitActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryNeoButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 22,
    backgroundColor: DF.cyan,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 14,
  },
  primaryNeoButtonText: {
    color: DF.bg,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  secondaryNeoButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: DF.border,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 14,
  },
  secondaryNeoButtonText: {
    color: DF.text,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.2,
  },

  signalGrid: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },
  signalCard: {
    flex: 1,
    minHeight: 96,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: "rgba(10,24,38,0.74)",
    paddingHorizontal: 11,
    paddingVertical: 11,
    justifyContent: "space-between",
  },
  signalCardCompact: {
    minHeight: 66,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  signalTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  signalIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  signalLabel: {
    flex: 1,
    color: DF.textSoft,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.25,
  },
  signalValueRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 6,
  },
  signalValue: {
    color: DF.textStrong,
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: -0.5,
  },
  signalDetail: {
    color: DF.textSoft,
    fontWeight: "800",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  signalRail: {
    marginTop: 9,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  signalRailFill: {
    height: 4,
    borderRadius: 999,
  },

  matrixCard: {
    marginTop: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: "rgba(8,18,30,0.80)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  matrixHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  matrixIconBox: {
    width: 38,
    height: 38,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(52,213,255,0.30)",
    backgroundColor: DF.cyanSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  matrixTitle: {
    color: DF.textStrong,
    fontWeight: "900",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  matrixSubtitle: {
    color: DF.textSoft,
    fontWeight: "700",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  matrixPlanButton: {
    minWidth: 58,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: DF.border,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  matrixPlanButtonText: {
    color: DF.textStrong,
    fontWeight: "900",
    fontSize: 11,
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
  },
  metricCard: {
    flex: 1,
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "space-between",
  },
  metricTitle: {
    color: DF.textSoft,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.35,
  },
  metricValue: {
    color: DF.textStrong,
    fontWeight: "900",
    fontSize: 19,
    letterSpacing: -0.55,
  },
  metricSublabel: {
    color: DF.textSoft,
    fontWeight: "700",
    fontSize: 9,
  },
  runwayLinesWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  runwayChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(36,240,165,0.22)",
    backgroundColor: DF.mintSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  runwayChipAlt: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: "rgba(216,108,255,0.10)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  runwayChipText: {
    color: DF.text,
    fontWeight: "800",
    fontSize: 11,
  },

  vaultCard: {
    marginTop: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(216,108,255,0.20)",
    backgroundColor: "rgba(18,14,34,0.78)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  vaultTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  vaultIconFrame: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(216,108,255,0.30)",
    backgroundColor: DF.aiSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  vaultTitle: {
    color: DF.textStrong,
    fontWeight: "900",
    fontSize: 15,
  },
  vaultSubtitle: {
    color: DF.textSoft,
    fontWeight: "700",
    fontSize: 11,
    marginTop: 2,
  },
  vaultStatsRow: {
    flexDirection: "row",
    gap: 8,
  },
  vaultMetric: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  vaultMetricValue: {
    color: DF.textStrong,
    fontSize: 18,
    fontWeight: "900",
  },
  vaultMetricLabel: {
    color: DF.textSoft,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    marginTop: 2,
  },
  vaultButton: {
    minHeight: 42,
    borderRadius: 22,
    backgroundColor: DF.gold,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  vaultButtonText: {
    color: DF.bg,
    fontWeight: "900",
    fontSize: 12,
  },

  mediaStack: {
    marginTop: 14,
    gap: 12,
  },
  mediaPanel: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: "rgba(8,18,30,0.76)",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  mediaPanelAccent: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(52,213,255,0.22)",
    backgroundColor: "rgba(4,24,39,0.80)",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  sectionIconBubble: {
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.cyanSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    color: DF.text,
    fontWeight: "900",
    fontSize: 13,
    letterSpacing: 0.35,
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  sectionBadgeText: {
    color: DF.textSoft,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.35,
  },

  deckOuterCompact: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(0,0,0,0.18)",
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  videoPosterCard: {
    width: "100%",
    height: "100%",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.48)",
    borderWidth: 1,
    borderColor: "rgba(125,231,255,0.18)",
  },
  videoPosterImage: {
    width: "100%",
    height: "100%",
    justifyContent: "flex-end",
  },
  videoPosterImageRadius: {
    borderRadius: 20,
  },
  videoPosterShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  videoPosterPlayPill: {
    position: "absolute",
    right: 10,
    bottom: 38,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(125,231,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoPosterFooter: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  videoPosterEyebrow: {
    color: DF.cyan,
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  videoPosterTitle: {
    color: DF.textStrong,
    fontWeight: "900",
    fontSize: 12,
    marginTop: 2,
  },
  videoPosterFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    gap: 8,
  },
  videoPosterFallbackText: {
    color: DF.textSoft,
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
  },

  emptyWrapCompact: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 16,
    minHeight: 124,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyPulse: {
    width: 28,
    height: 4,
    borderRadius: 999,
    backgroundColor: DF.cyan,
    opacity: 0.65,
    marginBottom: 10,
  },
  emptyText: {
    color: DF.textSoft,
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },
});