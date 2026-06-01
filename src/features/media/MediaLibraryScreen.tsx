import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import { endpoints } from "../../core/api/endpoints";
import { DASH_BASE, FACE_BASE } from "../../core/config/env";
import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import { saveCreateFlowContext } from "../../core/media/createFlow";
import { useAccountPricingSnapshot } from "../../core/pricing/useAccountPricingSnapshot";

const DF = {
  bg: "#090B10",
  surface: "rgba(255,255,255,0.05)",
  surface2: "rgba(255,255,255,0.07)",
  text: "rgba(255,255,255,0.94)",
  textStrong: "#FFFFFF",
  textSoft: "rgba(255,255,255,0.66)",
  line: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  gold: "#D2B07A",
  goldSoft: "rgba(210,176,122,0.14)",
  success: "#84EFA2",
  warn: "#F3C46B",
  danger: "#FF8E8E",
};

type LibraryMode = "browse" | "pick-face" | "pick-audio" | "build-fusion";
type LibraryFilter = "all" | "face" | "audio" | "video";

type LibraryItem = {
  library_id?: string;
  studio?: LibraryFilter | string;
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

type LibraryResponse = {
  items?: LibraryItem[];
  total?: number;
  limit?: number;
  offset?: number;
  source?: string;
  partial?: boolean;
};

const AUDIO_THUMB = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#1A1720"/>
      <stop offset="100%" stop-color="#3A284B"/>
    </linearGradient>
  </defs>
  <rect width="480" height="480" rx="40" fill="url(#g)"/>
  <circle cx="240" cy="240" r="120" fill="#D2B07A" opacity="0.18"/>
  <path d="M294 128v142.5c-14-11-36.3-14.5-56.3-8.1c-29.5 9.5-47.2 35.5-39.6 58.1
           c7.5 22.6 37.5 33.2 66.9 23.8c27.1-8.7 44.3-31.7 40.6-53.1h0.4V188l71-20v97.5
           c-14-11-36.3-14.5-56.3-8.1c-29.5 9.5-47.2 35.5-39.6 58.1c7.5 22.6 37.5 33.2 66.9 23.8
           c27.1-8.7 44.3-31.7 40.6-53.1H389V136c0-8.1-7.7-13.9-15.4-11.7L294 128z"
        fill="#F7E6C2"/>
  <text x="240" y="418" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="28" fill="#F7E6C2" opacity="0.88">Audio</text>
</svg>
`)}`;

const VIDEO_THUMB = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <defs>
    <linearGradient id="vg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#141A24"/>
      <stop offset="100%" stop-color="#2A3142"/>
    </linearGradient>
  </defs>
  <rect width="480" height="480" rx="40" fill="url(#vg)"/>
  <rect x="92" y="92" width="296" height="296" rx="28" fill="rgba(210,176,122,0.14)" stroke="#D2B07A" stroke-width="6"/>
  <path d="M205 172l108 68-108 68z" fill="#F7E6C2"/>
  <text x="240" y="418" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="28" fill="#F7E6C2" opacity="0.88">Video</text>
</svg>
`)}`;

function cleanParam(v: any): string {
  if (Array.isArray(v)) v = v[0];
  return String(v ?? "").trim().replace(/^"+|"+$/g, "");
}

function parseMode(value: any): LibraryMode {
  const v = cleanParam(value).toLowerCase();
  if (v === "pick-face") return "pick-face";
  if (v === "pick-audio") return "pick-audio";
  if (v === "build-fusion") return "build-fusion";
  return "browse";
}

function parseFilter(value: any): LibraryFilter {
  const v = cleanParam(value).toLowerCase();
  if (v === "face" || v === "audio" || v === "video") return v;
  return "all";
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

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
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

function looksLikeVideoUrl(url: string): boolean {
  const s = cleanParam(url).toLowerCase();
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(s);
}

function pickImageThumbnailUrl(item: LibraryItem): string {
  return cleanParam(
    item?.thumbnail_url ||
      item?.poster_url ||
      item?.preview_image_url ||
      item?.image_url ||
      item?.reuse_payload?.thumbnail_url ||
      item?.reuse_payload?.poster_url ||
      item?.reuse_payload?.preview_image_url ||
      item?.reuse_payload?.image_url ||
      item?.metadata_json?.thumbnail_url ||
      item?.metadata_json?.poster_url ||
      item?.metadata_json?.preview_image_url ||
      item?.metadata_json?.artifact_meta?.thumbnail_url ||
      item?.metadata_json?.artifact_meta?.poster_url ||
      item?.metadata_json?.artifact_meta?.image_url ||
      item?.meta?.thumbnail_url ||
      item?.meta?.poster_url ||
      item?.meta?.image_url ||
      ""
  );
}

function pickPreviewUrl(item: LibraryItem): string {
  return cleanParam(
    pickImageThumbnailUrl(item) ||
      item?.preview_url ||
      item?.download_url ||
      item?.reuse_payload?.audio_url ||
      item?.url ||
      ""
  );
}

function pickAudioUrl(item: LibraryItem): string {
  return cleanParam(
    item?.preview_url ||
      item?.download_url ||
      item?.reuse_payload?.audio_url ||
      item?.url ||
      ""
  );
}

function pickVideoUrl(item: LibraryItem): string {
  return cleanParam(
    item?.reuse_payload?.video_url ||
      item?.video_url ||
      item?.preview_url ||
      item?.download_url ||
      (looksLikeVideoUrl(cleanParam(item?.url)) ? item?.url : "") ||
      ""
  );
}

function pickFaceUrl(item: LibraryItem): string {
  return cleanParam(
    item?.preview_url ||
      item?.download_url ||
      item?.reuse_payload?.image_url ||
      item?.url ||
      ""
  );
}

function pickFaceArtifactId(item: LibraryItem): string {
  return cleanParam(
    item?.reuse_payload?.face_artifact_id ||
      item?.reuse_payload?.artifact_id ||
      item?.artifact_id ||
      item?.metadata_json?.face_artifact_id ||
      item?.metadata_json?.artifact_id ||
      item?.metadata_json?.artifact_meta?.face_artifact_id ||
      item?.metadata_json?.artifact_meta?.artifact_id ||
      item?.metadata_json?.reuse_payload?.face_artifact_id ||
      item?.metadata_json?.reuse_payload?.artifact_id ||
      item?.meta?.artifact_id ||
      item?.meta?.face_artifact_id ||
      item?.face_artifact_id ||
      item?.variants?.[0]?.face_artifact_id ||
      item?.variants?.[0]?.artifact_id ||
      item?.variants?.[0]?.metadata_json?.face_artifact_id ||
      item?.variants?.[0]?.metadata_json?.artifact_id ||
      item?.variants?.[0]?.meta?.artifact_id ||
      ""
  );
}

function pickFaceMediaAssetId(item: LibraryItem): string {
  return cleanParam(
    item?.reuse_payload?.face_media_asset_id ||
      item?.reuse_payload?.media_asset_id ||
      item?.media_asset_id ||
      item?.metadata_json?.face_media_asset_id ||
      item?.metadata_json?.media_asset_id ||
      item?.metadata_json?.artifact_meta?.face_media_asset_id ||
      item?.metadata_json?.artifact_meta?.media_asset_id ||
      item?.meta?.media_asset_id ||
      item?.face_media_asset_id ||
      item?.variants?.[0]?.face_media_asset_id ||
      item?.variants?.[0]?.media_asset_id ||
      item?.variants?.[0]?.metadata_json?.face_media_asset_id ||
      item?.variants?.[0]?.metadata_json?.media_asset_id ||
      item?.variants?.[0]?.meta?.media_asset_id ||
      ""
  );
}

function pickFaceProfileId(item: LibraryItem): string {
  return cleanParam(
    item?.reuse_payload?.face_profile_id ||
      item?.metadata_json?.face_profile_id ||
      item?.metadata_json?.artifact_meta?.face_profile_id ||
      item?.meta?.face_profile_id ||
      item?.face_profile_id ||
      item?.variants?.[0]?.face_profile_id ||
      item?.variants?.[0]?.metadata_json?.face_profile_id ||
      item?.variants?.[0]?.meta?.face_profile_id ||
      ""
  );
}

function pickFaceGender(item: LibraryItem): string {
  return cleanParam(
    item?.reuse_payload?.gender ||
      item?.metadata_json?.gender ||
      item?.metadata_json?.artifact_meta?.gender ||
      item?.meta?.gender ||
      item?.gender ||
      item?.variants?.[0]?.gender ||
      item?.variants?.[0]?.metadata_json?.gender ||
      item?.variants?.[0]?.meta?.gender ||
      ""
  );
}

function pickFaceAspectRatio(item: LibraryItem): string {
  return (
    cleanParam(
      item?.reuse_payload?.aspect_ratio ||
        item?.metadata_json?.aspect_ratio ||
        item?.metadata_json?.artifact_meta?.aspect_ratio ||
        item?.meta?.aspect_ratio ||
        item?.aspect_ratio ||
        item?.resolution ||
        item?.variants?.[0]?.aspect_ratio ||
        item?.variants?.[0]?.metadata_json?.aspect_ratio ||
        item?.variants?.[0]?.meta?.aspect_ratio ||
        "9:16"
    ) || "9:16"
  );
}

function formatDateLabel(value: string | null | undefined) {
  const s = cleanParam(value);
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function formatDurationLabel(item: LibraryItem) {
  const sec = firstNumericValue(
    item?.duration_sec,
    item?.reuse_payload?.duration_sec,
    item?.metadata_json?.artifact_meta?.duration_sec,
    item?.metadata_json?.artifact_meta?.duration_ms != null
      ? Number(item?.metadata_json?.artifact_meta?.duration_ms) / 1000
      : null
  );
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  if (sec < 60) return `${Math.round(sec)} sec`;
  const m = Math.floor(sec / 60);
  const r = Math.round(sec % 60);
  return `${m}m ${r}s`;
}

function itemSubtitle(item: LibraryItem) {
  const bits = [
    item?.studio === "audio"
      ? cleanParam(item?.reuse_payload?.voice) || cleanParam(item?.reuse_payload?.locale)
      : item?.studio === "video"
        ? cleanParam(item?.reuse_payload?.provider)
        : cleanParam(item?.reuse_payload?.gender),
    formatDurationLabel(item),
    formatDateLabel(item?.created_at),
  ].filter(Boolean);
  return bits.join(" • ");
}

async function fetchLibrary({
  token,
  logout,
  type,
  limit = 50,
  offset = 0,
}: {
  token: string;
  logout: () => Promise<void>;
  type: LibraryFilter;
  limit?: number;
  offset?: number;
}) {
  const candidatePath = (endpoints as any)?.dashboard?.library ?? "/api/dashboard/library";
  const qs = `?type=${encodeURIComponent(type)}&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;

  const res = await fetch(joinUrl(DASH_BASE, `${candidatePath}${qs}`), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    await logout();
    throw new Error("AUTH_EXPIRED");
  }

  const data = await safeJson(res);
  if (!res.ok) {
    const msg = data?.detail || data?.message || data?._raw || `HTTP ${res.status}`;
    throw new Error(`Media library failed: ${msg}`);
  }

  return data as LibraryResponse;
}

function getFaceApiBaseUrl(): string {
  const raw = cleanParam(FACE_BASE);
  return raw.replace(/\/+$/, "");
}

async function fetchFaceJobStatusForLibrary({
  sourceJobId,
  token,
  userId,
}: {
  sourceJobId: string;
  token: string;
  userId?: string;
}) {
  const base = getFaceApiBaseUrl();
  if (!base || !sourceJobId || !token) return null;

  const res = await fetch(`${base}/api/face/creator/jobs/${encodeURIComponent(sourceJobId)}/status`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(userId ? { "X-User-Id": userId } : {}),
      Accept: "application/json",
    },
  });

  if (!res.ok) return null;
  const data = await safeJson(res);
  return data;
}

async function resolveFaceReuseData(
  item: LibraryItem,
  authLike: { token?: string; userId?: string }
) {
  const imageUrl = pickFaceUrl(item);
  const faceMediaAssetId = pickFaceMediaAssetId(item);
  const faceProfileId = pickFaceProfileId(item);
  const gender = pickFaceGender(item);
  const aspectRatio = pickFaceAspectRatio(item);

  let faceArtifactId = pickFaceArtifactId(item);
  if (!faceArtifactId) {
    const sourceJobId = cleanParam(item?.source_job_id);
    const token = cleanParam(authLike?.token);
    if (sourceJobId && token) {
      const status = await fetchFaceJobStatusForLibrary({
        sourceJobId,
        token,
        userId: cleanParam(authLike?.userId),
      });
      const variants = Array.isArray((status as any)?.variants) ? ((status as any)?.variants as any[]) : [];
      const matched =
        (faceMediaAssetId
          ? variants.find((v) => cleanParam(v?.media_asset_id) === faceMediaAssetId)
          : null) ||
        (faceProfileId
          ? variants.find((v) => cleanParam(v?.face_profile_id) === faceProfileId)
          : null) ||
        (imageUrl
          ? variants.find((v) => cleanParam(v?.image_url) === imageUrl)
          : null) ||
        variants[0] ||
        null;

      faceArtifactId = cleanParam(
        matched?.artifact_id ??
          matched?.face_artifact_id ??
          matched?.metadata_json?.artifact_id ??
          matched?.metadata_json?.face_artifact_id ??
          matched?.meta?.artifact_id ??
          matched?.meta?.face_artifact_id ??
          ""
      );
    }
  }

  return {
    imageUrl,
    faceArtifactId,
    faceMediaAssetId,
    faceProfileId,
    gender,
    aspectRatio,
  };
}

function hasReusableFaceArtifact(item: LibraryItem | null | undefined): boolean {
  return !!pickFaceArtifactId((item ?? undefined) as any);
}

function HeaderPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.filterPill, active ? styles.filterPillActive : null]}>
      <Text style={[styles.filterPillText, active ? styles.filterPillTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="albums-outline" size={26} color={DF.textSoft} />
      <Text style={styles.emptyStateTitle}>Nothing here yet</Text>
      <Text style={styles.emptyStateText}>{text}</Text>
    </View>
  );
}

function LibraryThumbnail({
  item,
  onPress,
}: {
  item: LibraryItem;
  onPress: () => void;
}) {
  const isAudio = item?.studio === "audio";
  const isVideo = item?.studio === "video";

  const rawThumbUrl = pickImageThumbnailUrl(item);
  const imageThumbUrl = isAudio
    ? AUDIO_THUMB
    : isVideo
      ? rawThumbUrl && !looksLikeVideoUrl(rawThumbUrl)
        ? rawThumbUrl
        : VIDEO_THUMB
      : pickPreviewUrl(item);

  return (
    <Pressable onPress={onPress} style={styles.thumbWrap}>
      <ExpoImage
        source={{ uri: imageThumbUrl }}
        style={styles.thumb}
        contentFit="cover"
        cachePolicy="none"
        transition={120}
      />

      {isVideo ? (
        <View style={styles.videoPlayOverlay}>
          <Ionicons name="play-circle" size={28} color="#F7E6C2" />
        </View>
      ) : null}

      <View style={styles.thumbBadge}>
        <Text style={styles.thumbBadgeText}>{isAudio ? "Audio" : isVideo ? "Video" : "Face"}</Text>
      </View>
    </Pressable>
  );
}

export default function MediaLibraryScreen() {
  const params = useLocalSearchParams<{
    mode?: string | string[];
    type?: string | string[];
  }>();

  const mode = parseMode(params.mode);
  const initialFilter = parseFilter(params.type);

  const auth = useAuth() as any;
  const { token, isReady, isAuthed, logout } = auth;
  const snapshot = useAccountPricingSnapshot() as any;
  const authUserId =
    cleanParam(auth?.userId) ||
    cleanParam(auth?.user?.id) ||
    cleanParam(auth?.session?.user?.id) ||
    cleanParam(auth?.authState?.user?.id) ||
    "";

  const flow = useCreatorFlow() as any;
  const setFaceSelection = flow?.setFaceSelection as undefined | ((x: any) => void);
  const setAudioSelection = flow?.setAudioSelection as undefined | ((x: any) => void);
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);

  const [filter, setFilter] = useState<LibraryFilter>(
    mode === "pick-face" ? "face" :
    mode === "pick-audio" ? "audio" :
    initialFilter
  );
  const [selectedFaceId, setSelectedFaceId] = useState<string>("");
  const [selectedAudioId, setSelectedAudioId] = useState<string>("");

  const availableCredits = firstNumericValue(
    snapshot?.availableCredits,
    snapshot?.available_credits,
    snapshot?.pricingSummary?.available_credits,
    snapshot?.usageSummary?.available_credits
  );
  const reservedCredits = firstNumericValue(
    snapshot?.reservedCredits,
    snapshot?.reserved_credits,
    snapshot?.pricingSummary?.reserved_credits
  );
  const usedCredits = firstNumericValue(
    snapshot?.usedCredits,
    snapshot?.used_credits,
    snapshot?.usageSummary?.used_credits,
    snapshot?.consumedCredits,
    snapshot?.consumed_credits
  );
  const planLabel = String(snapshot?.planName || "Free").trim() || "Free";
  const usageLabel = `${formatCredits(availableCredits)} available • ${formatCredits(reservedCredits, "0 credits")} reserved • ${formatCredits(usedCredits)} used`;

  const query = useQuery({
    queryKey: ["dashboard-library-screen", token ? String(token).slice(0, 8) : "t0", filter],
    enabled: !!token && isReady && isAuthed,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: 0,
    queryFn: async () =>
      fetchLibrary({
        token,
        logout: logout ?? (async () => {}),
        type: filter,
        limit: 50,
        offset: 0,
      }),
  });

  const items = useMemo(() => {
    const raw = Array.isArray(query.data?.items) ? query.data?.items ?? [] : [];
    return raw.filter((item) => {
      if (mode === "pick-face") return item?.studio === "face";
      if (mode === "build-fusion") return item?.studio === "face" || item?.studio === "audio";
      if (mode === "pick-audio") return item?.studio === "audio";
      return item?.studio === "face" || item?.studio === "video";
    });
  }, [query.data, mode]);

  const selectedFace = useMemo(
    () => items.find((item) => item?.library_id === selectedFaceId) ?? null,
    [items, selectedFaceId]
  );
  const selectedAudio = useMemo(
    () => items.find((item) => item?.library_id === selectedAudioId) ?? null,
    [items, selectedAudioId]
  );

  const selectedFaceHasArtifact = !!pickFaceArtifactId(selectedFace as any);
  const selectedFaceLabel = selectedFace ? cleanParam(selectedFace?.title) || "Selected face" : "Not selected";
  const selectedAudioLabel = selectedAudio ? cleanParam(selectedAudio?.title) || "Selected audio" : "Not selected";

  const applyFace = useCallback(
    async (item: LibraryItem) => {
      const { imageUrl, faceArtifactId, faceMediaAssetId, faceProfileId, gender, aspectRatio } =
        await resolveFaceReuseData(item, { token, userId: authUserId });

      setFaceSelection?.({
        sasUrl: imageUrl || undefined,
        imageUrl: imageUrl || undefined,
        image_url: imageUrl || undefined,
        face_image_url: imageUrl || undefined,
        face_sas_url: imageUrl || undefined,
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
        gender: gender || undefined,
        ownerUserId: authUserId || undefined,
        owner_user_id: authUserId || undefined,
        userId: authUserId || undefined,
        user_id: authUserId || undefined,
      } as any);

      setFusionSettings?.({
        fusionAspectRatio: aspectRatio,
        fusionFaceArtifactId: faceArtifactId || undefined,
      } as any);

      await saveCreateFlowContext({
        image_url: imageUrl || undefined,
        face_image_url: imageUrl || undefined,
        face_sas_url: imageUrl || undefined,
        face_artifact_id: faceArtifactId || undefined,
        artifact_id: faceArtifactId || undefined,
        face_profile_id: faceProfileId || undefined,
        face_media_asset_id: faceMediaAssetId || undefined,
        media_asset_id: faceMediaAssetId || undefined,
        aspect_ratio: aspectRatio || undefined,
        ...(gender ? ({ gender } as any) : {}),
        ownerUserId: authUserId || undefined,
        owner_user_id: authUserId || undefined,
        userId: authUserId || undefined,
        user_id: authUserId || undefined,
      } as any).catch(() => {});
    },
    [setFaceSelection, setFusionSettings, authUserId, token]
  );

  const applyAudio = useCallback((item: LibraryItem) => {
    const audioUrl = pickAudioUrl(item);
    const audioArtifactId = cleanParam(item?.reuse_payload?.audio_artifact_id || item?.artifact_id);
    const locale = cleanParam(item?.reuse_payload?.locale);
    const voice = cleanParam(item?.reuse_payload?.voice || item?.reuse_payload?.voice_id);
    const durationSec = firstNumericValue(item?.reuse_payload?.duration_sec, item?.duration_sec);

    setAudioSelection?.({
      audioUrl: audioUrl || undefined,
      sasUrl: audioUrl || undefined,
      audio_url: audioUrl || undefined,
      artifactId: audioArtifactId || undefined,
      audioArtifactId: audioArtifactId || undefined,
      artifact_id: audioArtifactId || undefined,
      audio_artifact_id: audioArtifactId || undefined,
      locale: locale || undefined,
      voice: voice || undefined,
      durationSec: durationSec ?? undefined,
      title: cleanParam(item?.title) || undefined,
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
    } as any);

    saveCreateFlowContext({
      audio_url: audioUrl || undefined,
      audio_sas_url: audioUrl || undefined,
      audio_artifact_id: audioArtifactId || undefined,
      artifact_id: audioArtifactId || undefined,
      audio_locale: locale || undefined,
      audio_voice: voice || undefined,
      audio_duration_sec: durationSec ?? undefined,
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
    } as any).catch(() => {});
  }, [setAudioSelection, authUserId]);

  const openItem = useCallback(
    async (item: LibraryItem) => {
      if (item?.studio === "face") {
        const { imageUrl, faceArtifactId, faceMediaAssetId, faceProfileId, gender, aspectRatio } =
          await resolveFaceReuseData(item, { token, userId: authUserId });
        await applyFace(item);

        router.push({
          pathname: "/media/viewer",
          params: {
            type: "image",
            image_url: imageUrl,
            face_image_url: imageUrl,
            face_sas_url: imageUrl,
            url: imageUrl,
            title: cleanParam(item?.title) || "Face",
            subtitle: itemSubtitle(item),
            stage: "face_done",
            face_artifact_id: faceArtifactId,
            artifact_id: faceArtifactId,
            face_profile_id: faceProfileId,
            face_media_asset_id: faceMediaAssetId,
            media_asset_id: faceMediaAssetId,
            gender,
            aspect_ratio: aspectRatio,
          } as any,
        } as any);
        return;
      }

      if (item?.studio === "video") {
        const videoUrl = pickVideoUrl(item);
        router.push({
          pathname: "/media/viewer",
          params: {
            type: "video",
            video_url: videoUrl,
            url: videoUrl,
            title: cleanParam(item?.title) || "Fusion video",
            subtitle: itemSubtitle(item),
            stage: "video_done",
          } as any,
        } as any);
        return;
      }

      if (item?.studio === "audio") {
        const audioUrl = pickAudioUrl(item);
        router.push({
          pathname: "/media/viewer",
          params: {
            type: "audio",
            audio_url: audioUrl,
            audio_sas_url: audioUrl,
            url: audioUrl,
            title: cleanParam(item?.title) || "Audio",
            subtitle: itemSubtitle(item),
            stage: "audio_done",
            audio_artifact_id: cleanParam(item?.reuse_payload?.audio_artifact_id || item?.artifact_id),
            artifact_id: cleanParam(item?.reuse_payload?.audio_artifact_id || item?.artifact_id),
            audio_voice: cleanParam(item?.reuse_payload?.voice || item?.reuse_payload?.voice_id),
            audio_locale: cleanParam(item?.reuse_payload?.locale),
            audio_duration_sec: String(firstNumericValue(item?.reuse_payload?.duration_sec, item?.duration_sec) ?? ""),
          } as any,
        } as any);
      }
    },
    [applyFace, token, authUserId]
  );

  const primaryActionLabel = useCallback((item: LibraryItem) => {
    if (mode === "pick-face" && item?.studio === "face") return "Use face";
    if (mode === "pick-audio" && item?.studio === "audio") return "Use audio";
    if (mode === "build-fusion") {
      if (item?.studio === "face") return selectedFaceId === item?.library_id ? "Face selected" : "Select face";
      if (item?.studio === "audio") return selectedAudioId === item?.library_id ? "Audio selected" : "Select audio";
      return "Open";
    }
    if (item?.studio === "face") return "Use face";
    if (item?.studio === "audio") return "Use audio";
    return "Preview";
  }, [mode, selectedFaceId, selectedAudioId]);

  const onPrimaryAction = useCallback(
    async (item: LibraryItem) => {
      if (mode === "pick-face" && item?.studio === "face") {
        await applyFace(item);
        router.back();
        return;
      }
      if (mode === "pick-audio" && item?.studio === "audio") {
        applyAudio(item);
        router.back();
        return;
      }
      if (mode === "build-fusion") {
        if (item?.studio === "face") {
          setSelectedFaceId(cleanParam(item?.library_id));
          await applyFace(item);
          return;
        }
        if (item?.studio === "audio") {
          setSelectedAudioId(cleanParam(item?.library_id));
          applyAudio(item);
          return;
        }
      }
      if (item?.studio === "face") {
        await applyFace(item);
        router.push("/(tabs)/audio" as any);
        return;
      }
      await openItem(item);
    },
    [mode, applyFace, applyAudio, openItem]
  );

  const continueToFusion = useCallback(() => {
    if (!selectedFace || !selectedAudio || !selectedFaceHasArtifact) return;
    router.push("/(tabs)/fusion" as any);
  }, [selectedFace, selectedAudio, selectedFaceHasArtifact]);

  const renderRow = useCallback(
    ({ item }: { item: LibraryItem }) => {
      const isAudio = item?.studio === "audio";
      const isVideo = item?.studio === "video";
      const active =
        (item?.studio === "face" && selectedFaceId === item?.library_id) ||
        (item?.studio === "audio" && selectedAudioId === item?.library_id);

      return (
        <View style={[styles.rowCard, active ? styles.rowCardActive : null]}>
          <LibraryThumbnail item={item} onPress={() => void openItem(item)} />

          <View style={styles.rowBody}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {cleanParam(item?.title) || (isAudio ? "Audio" : isVideo ? "Fusion video" : "Face")}
            </Text>
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {itemSubtitle(item)}
            </Text>

            <View style={styles.rowMetaWrap}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{String(item?.status || "ready").toUpperCase()}</Text>
              </View>
              {!!cleanParam(item?.source_job_id) && (
                <View style={styles.metaChip}>
                  <Text style={styles.metaChipText}>Job linked</Text>
                </View>
              )}
            </View>

            <View style={styles.rowActions}>
              <Pressable onPress={() => void openItem(item)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>{isVideo ? "Preview" : "Open"}</Text>
              </Pressable>
              {!isVideo ? (
                <Pressable onPress={() => void onPrimaryAction(item)} style={[styles.primaryBtn, active ? styles.primaryBtnActive : null]}>
                  <Text style={styles.primaryBtnText}>{primaryActionLabel(item)}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      );
    },
    [openItem, onPrimaryAction, primaryActionLabel, selectedFaceId, selectedAudioId]
  );

  const title =
    mode === "pick-face"
      ? "Choose a Face"
      : mode === "pick-audio"
        ? "Choose Audio"
        : mode === "build-fusion"
          ? "Choose a Face"
          : "Your saved work";

  const subtitle =
    mode === "pick-face"
      ? "Pick an existing face and carry it forward."
      : mode === "pick-audio"
        ? "Tap the thumbnail to preview and play audio, then use the one you want."
        : mode === "build-fusion"
          ? "Pick a face first. Audio selection happens inside Audio Studio."
          : "Browse saved faces and videos.";

  return (
    <View style={styles.root}>
      <DFHeader
        subtitle={subtitle}
        planLabel={planLabel}
        usageLabel={usageLabel}
        onMenuPress={() => router.back()}
        onPressMeta={() => router.push({ pathname: "/pricing/plan-billing" } as any)}
      />

      <View style={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroText}>{subtitle}</Text>

          <View style={styles.filterRow}>
            {mode === "pick-audio" ? (
              <HeaderPill label="Audio" active />
            ) : mode === "pick-face" || mode === "build-fusion" ? (
              <HeaderPill label="Faces" active />
            ) : (
              <>
                <HeaderPill label="All" active={filter === "all"} onPress={() => setFilter("all")} />
                <HeaderPill label="Faces" active={filter === "face"} onPress={() => setFilter("face")} />
                <HeaderPill label="Videos" active={filter === "video"} onPress={() => setFilter("video")} />
              </>
            )}
          </View>

          {mode === "build-fusion" ? (
            <View style={styles.selectionSummary}>
              <View style={styles.selectionRow}>
                <Text style={styles.selectionLabel}>Face</Text>
                <Text style={styles.selectionValue}>{selectedFaceLabel}</Text>
              </View>
              <View style={styles.selectionRow}>
                <Text style={styles.selectionLabel}>Audio</Text>
                <Text style={styles.selectionValue}>{selectedAudioLabel}</Text>
              </View>

              {selectedFace && !selectedFaceHasArtifact ? (
                <Text style={styles.selectionWarning}>
                  This saved face does not include a reusable face artifact yet. It can preview in Audio/Fusion, but it cannot generate a Fusion job until the backend library payload includes face_artifact_id or the face job status resolves one.
                </Text>
              ) : null}

              <Pressable
                onPress={continueToFusion}
                disabled={!selectedFace || !selectedAudio || !selectedFaceHasArtifact}
                style={[
                  styles.continueBtn,
                  !selectedFace || !selectedAudio || !selectedFaceHasArtifact ? styles.continueBtnDisabled : null,
                ]}
              >
                <Text style={styles.continueBtnText}>
                  {selectedFace && !selectedFaceHasArtifact ? "Selected face is preview-only" : "Continue to Fusion"}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {query.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={DF.gold} />
            <Text style={styles.centerStateText}>Loading your creations…</Text>
          </View>
        ) : query.isError ? (
          <View style={styles.centerState}>
            <Ionicons name="alert-circle-outline" size={24} color={DF.warn} />
            <Text style={styles.centerStateTitle}>Could not load library</Text>
            <Text style={styles.centerStateText}>{String((query.error as any)?.message ?? "Please retry.")}</Text>
            <Pressable onPress={() => void query.refetch()} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <EmptyState text="Create a few Face, Audio, or Fusion outputs, then come back here to reuse them." />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item, index) => cleanParam(item?.library_id) || `${item?.studio}:${index}`}
            renderItem={renderRow}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DF.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface,
    padding: 14,
    gap: 12,
    marginBottom: 12,
  },
  heroTitle: {
    color: DF.textStrong,
    fontSize: 18,
    fontWeight: "900",
  },
  heroText: {
    color: DF.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface2,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterPillActive: {
    borderColor: DF.gold,
    backgroundColor: DF.goldSoft,
  },
  filterPillText: {
    color: DF.text,
    fontSize: 11,
    fontWeight: "800",
  },
  filterPillTextActive: {
    color: DF.textStrong,
  },
  selectionSummary: {
    gap: 10,
    marginTop: 4,
  },
  selectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  selectionLabel: {
    color: DF.textSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  selectionValue: {
    flex: 1,
    textAlign: "right",
    color: DF.textStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  selectionWarning: {
    color: DF.warn,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "800",
  },
  continueBtn: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: DF.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnDisabled: {
    opacity: 0.45,
  },
  continueBtnText: {
    color: "#1F1408",
    fontWeight: "900",
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 24,
    gap: 10,
  },
  rowCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface,
    padding: 10,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
  },
  rowCardActive: {
    borderColor: DF.gold,
    backgroundColor: DF.goldSoft,
  },
  thumbWrap: {
    width: 98,
    height: 98,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface2,
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  videoThumbFallback: {
    backgroundColor: "#1B2230",
  },
  videoPlayOverlay: {
    position: "absolute",
    right: 8,
    bottom: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.38)",
    padding: 2,
  },
  thumbBadge: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.48)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  thumbBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "space-between",
  },
  rowTitle: {
    color: DF.textStrong,
    fontSize: 14,
    fontWeight: "900",
  },
  rowSubtitle: {
    color: DF.textSoft,
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "700",
    marginTop: 4,
  },
  rowMetaWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  metaChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaChipText: {
    color: DF.text,
    fontSize: 10,
    fontWeight: "800",
  },
  rowActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  secondaryBtnText: {
    color: DF.text,
    fontSize: 11,
    fontWeight: "800",
  },
  primaryBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: DF.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  primaryBtnActive: {
    backgroundColor: "#E8C48C",
  },
  primaryBtnText: {
    color: "#1F1408",
    fontSize: 11,
    fontWeight: "900",
  },
  centerState: {
    marginTop: 28,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface,
    padding: 18,
    alignItems: "center",
  },
  centerStateTitle: {
    color: DF.textStrong,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 8,
  },
  centerStateText: {
    color: DF.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
  },
  retryBtn: {
    marginTop: 12,
    minHeight: 40,
    minWidth: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  retryBtnText: {
    color: DF.textStrong,
    fontSize: 12,
    fontWeight: "900",
  },
  emptyState: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface,
    padding: 18,
    alignItems: "center",
  },
  emptyStateTitle: {
    color: DF.textStrong,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 10,
  },
  emptyStateText: {
    color: DF.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
  },
});
