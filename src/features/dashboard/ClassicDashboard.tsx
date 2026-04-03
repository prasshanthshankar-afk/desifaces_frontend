
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import GaugeAnalog from "../../components/dashboard/GaugeAnalog";
import { useAuth } from "../../core/auth/AuthContext";
import { endpoints } from "../../core/api/endpoints";
import { DASH_BASE } from "../../core/config/env";
import ThumbFanDeckCarousel, {
  ThumbFanItem,
} from "../../core/ui/ThumbFanDeckCarousel";
import DFHeader from "../../core/ui/DFHeader";
import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import { saveCreateFlowContext } from "../../core/media/createFlow";

import FaceCard from "./carousels/FaceCard";
import VideoCard from "./carousels/VideoCard";

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
  ai: "#D86CFF",
  green: "#84EFA2",
  success: "#6ED39C",
  cyan: "#9EB3D8",
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
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

function pickFaceUrl(item: any): string {
  return (
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

function pickVideoUrl(item: any): string {
  return (
    item?.video_url ||
    item?.url ||
    item?.asset_url ||
    item?.signed_url ||
    item?.meta?.video_url ||
    item?.meta?.url ||
    item?.meta?.signed_url ||
    item?.meta?.output_url ||
    item?.output_url ||
    item?.result_url ||
    item?.variants?.[0]?.video_url ||
    item?.variants?.[0]?.url ||
    ""
  );
}

function pickVariantNumber(item: any): number {
  const v =
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
    item?.artifact_id ??
      item?.face_artifact_id ??
      item?.meta?.artifact_id ??
      item?.meta?.face_artifact_id ??
      item?.variants?.[0]?.artifact_id ??
      item?.variants?.[0]?.meta?.artifact_id ??
      ""
  ).trim();
}

function pickFaceMediaAssetId(item: any): string {
  return String(
    item?.media_asset_id ??
      item?.meta?.media_asset_id ??
      item?.variants?.[0]?.media_asset_id ??
      item?.variants?.[0]?.meta?.media_asset_id ??
      ""
  ).trim();
}

function pickFaceProfileId(item: any): string {
  return String(
    item?.face_profile_id ??
      item?.meta?.face_profile_id ??
      item?.variants?.[0]?.face_profile_id ??
      item?.variants?.[0]?.meta?.face_profile_id ??
      ""
  ).trim();
}

function pickFaceGender(item: any): string {
  return String(
    item?.gender ??
      item?.meta?.gender ??
      item?.variants?.[0]?.gender ??
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
    item?.aspect_ratio ??
      item?.meta?.aspect_ratio ??
      item?.resolution ??
      item?.meta?.resolution ??
      item?.variants?.[0]?.aspect_ratio ??
      item?.variants?.[0]?.meta?.aspect_ratio ??
      "9:16"
  );
}

export default function ClassicDashboard({
  onMenuPress,
}: {
  onMenuPress?: () => void;
}) {
  const { token, isReady, isAuthed, logout } = useAuth();
  const { width } = useWindowDimensions();
  const flow = useCreatorFlow() as any;
  const setFaceSelection = flow?.setFaceSelection as undefined | ((x: any) => void);
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);

  const demo = React.useMemo(
    () => ({
      creditsRemaining: 820,
      creditsCap: 1000,
      queuePressure: 62,
      jobsPerMin: 18,
      providerHealth: 88,
      assetsThisWeek: 124,
      successRate: 96,
    }),
    []
  );

  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);

  const loadOnce = React.useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const d = await fetchDashHomeOrThrow({ token, logout });
      setData(d);
    } catch (e) {
      console.log("DF_CLASSIC_DASH_HOME_ERR", (e as any)?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  React.useEffect(() => {
    if (!isReady) return;
    if (!isAuthed || !token) return;
    loadOnce();
  }, [isReady, isAuthed, token, loadOnce]);

  const m = React.useMemo(() => {
    const d = data ?? {};
    const g = d?.gauges ?? {};
    const speed = g?.speedometer ?? {};
    const fuel = g?.fuel ?? {};
    const health = g?.health ?? {};

    const faces60m = Number(speed?.faces_last_60m ?? 0);
    const videos60m = Number(speed?.videos_last_60m ?? 0);

    const jobsPerMin = clamp(faces60m + videos60m, 0, 60);
    const queuePressure = clamp(
      Number(speed?.queue_pressure ?? jobsPerMin * 2),
      0,
      100
    );
    const creditsRemaining = Number(
      fuel?.credits_remaining ?? demo.creditsRemaining
    );
    const creditsCap =
      typeof fuel?.cap === "number" && fuel.cap > 0
        ? Number(fuel.cap)
        : demo.creditsCap;

    const providerHealth = clamp(
      Number(health?.value_norm ?? 1) * 100,
      0,
      100
    );
    const successRate = clamp(
      Number(d?.success_rate ?? demo.successRate),
      0,
      100
    );

    return {
      creditsRemaining,
      creditsCap,
      queuePressure,
      jobsPerMin,
      providerHealth,
      successRate,
    };
  }, [data, demo]);

  const pricingCard = React.useMemo(() => {
    const planSummary = data?.plan_summary ?? data?.pricing_summary ?? {};
    const usageSummary = data?.usage_summary ?? data?.usage ?? {};

    const fallbackPercent = clamp(
      ((Number(m.creditsCap) - Number(m.creditsRemaining)) /
        Math.max(Number(m.creditsCap), 1)) *
        100,
      0,
      100
    );

    const walletBalance =
      planSummary?.walletBalance ??
      planSummary?.wallet_balance ??
      `${Math.floor(m.creditsRemaining)} credits`;

    const monthlySpend =
      usageSummary?.totalSpend ??
      usageSummary?.total_spend ??
      usageSummary?.monthly_spend ??
      "—";

    const reservedAmount =
      usageSummary?.reservedAmount ??
      usageSummary?.reserved_amount ??
      planSummary?.reservedAmount ??
      planSummary?.reserved_amount ??
      "—";

    return {
      planName:
        planSummary?.planName ??
        planSummary?.plan_name ??
        planSummary?.name ??
        "Creator Pro",
      monthLabel:
        usageSummary?.monthLabel ??
        usageSummary?.month_label ??
        "This month",
      totalUsagePercent: clamp(
        Number(
          usageSummary?.totalUsagePercent ??
            usageSummary?.total_usage_percent ??
            fallbackPercent
        ),
        0,
        100
      ),
      walletBalance,
      monthlySpend,
      reservedAmount,
    };
  }, [data, m.creditsCap, m.creditsRemaining]);

  const faces = React.useMemo(() => {
    return Array.isArray(data?.face_carousel) ? data.face_carousel : [];
  }, [data]);

  const videos = React.useMemo(() => {
    return Array.isArray(data?.video_carousel) ? data.video_carousel : [];
  }, [data]);

  const activity = clamp(Number(m.jobsPerMin ?? demo.jobsPerMin), 0, 60);
  const load = clamp(Number(m.queuePressure ?? demo.queuePressure), 0, 100);
  const success = clamp(Number(m.successRate ?? demo.successRate), 0, 100);

  const providerHealthPct = Math.floor(m.providerHealth ?? demo.providerHealth);

  const healthTone: "green" | "amber" | "red" =
    providerHealthPct >= 80
      ? "green"
      : providerHealthPct >= 55
        ? "amber"
        : "red";

  const compactUsageLabel = `${pricingCard.walletBalance} • ${pricingCard.totalUsagePercent}% used`;

  const goFace = () => router.push("/(tabs)/face");
  const goAudio = () => router.push("/(tabs)/audio");
  const goFusion = () => router.push("/(tabs)/fusion");
  const goRetail = () => router.push("/(tabs)/commerce" as any);
  const goMusic = () => router.push("/(tabs)/music" as any);
  const goPricing = () => router.push({ pathname: "/pricing/plan-billing" });

  const studioGrid = React.useMemo(() => {
    const horizontalPadding = 32;
    const gap = 10;
    const safeWidth = Math.max(width - horizontalPadding, 320);
    const compactTileWidth = Math.floor((safeWidth - gap * 2) / 3);
    const compactTileHeight = Math.round(compactTileWidth * 0.68);
    const wideTileWidth = Math.floor((safeWidth - gap) / 2);
    const wideTileHeight = Math.round(compactTileHeight * 0.98);
    return { gap, compactTileWidth, compactTileHeight, wideTileWidth, wideTileHeight };
  }, [width]);

  const FACE_DECK_W = 136;
  const FACE_DECK_H = 156;
  const VIDEO_DECK_W = 136;
  const VIDEO_DECK_H = 156;
  const FAN_COUNT = 3;

  const faceItems: ThumbFanItem[] = React.useMemo(() => {
    return (faces ?? []).slice(0, 10).map((a: any, i: number) => ({
      id: a?.id ?? a?.meta?.artifact_id ?? a?.storage_path ?? String(i),
      kind: "image",
      url: pickFaceUrl(a),
      meta: a,
    }));
  }, [faces]);

  const videoItems: ThumbFanItem[] = React.useMemo(() => {
    return (videos ?? []).slice(0, 10).map((a: any, i: number) => ({
      id: a?.id ?? a?.meta?.artifact_id ?? a?.storage_path ?? String(i),
      kind: "image" as any,
      url: pickVideoUrl(a),
      meta: a,
    }));
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
      artifactId: faceArtifactId || undefined,
      mediaAssetId: faceMediaAssetId || undefined,
      faceProfileId: faceProfileId || undefined,
      gender: faceGender || undefined,
    } as any);

    setFusionSettings?.({
      fusionAspectRatio: aspectRatio,
      fusionFaceArtifactId: faceArtifactId || undefined,
    } as any);

    saveCreateFlowContext({
      image_url: url,
      face_artifact_id: faceArtifactId || undefined,
      face_profile_id: faceProfileId || undefined,
      media_asset_id: faceMediaAssetId || undefined,
      aspect_ratio: aspectRatio,
      ...(faceGender ? ({ gender: faceGender } as any) : {}),
    } as any).catch(() => {});

    router.push({
      pathname: "/media/viewer",
      params: {
        type: "image",
        image_url: url,
        face_image_url: url,
        face_sas_url: url,
        url,
        title: `Face • v${vnum}`,
        subtitle: ts,
        stage: "face_done",
        face_artifact_id: faceArtifactId || "",
        face_profile_id: faceProfileId || "",
        face_media_asset_id: faceMediaAssetId || "",
        media_asset_id: faceMediaAssetId || "",
        gender: faceGender || "",
        aspect_ratio: aspectRatio,
      },
    });
  }, [setFaceSelection, setFusionSettings]);

  const openVideoItem = React.useCallback((it: ThumbFanItem) => {
    const meta = it?.meta ?? {};
    const url = String(it?.url ?? pickVideoUrl(meta) ?? "");
    if (!url) return;

    const vnum = pickVariantNumber(meta);
    const ts = pickCreatedAtLabel(meta);

    router.push({
      pathname: "/media/viewer",
      params: {
        type: "video",
        url,
        title: `Fusion • v${vnum}`,
        subtitle: ts,
        stage: "video_done",
      },
    });
  }, []);

  return (
    <View style={styles.root}>
      <DFHeader
        subtitle="Workspace overview"
        statusTone={healthTone}
        onMenuPress={onMenuPress}
        onPressMeta={goPricing}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading && !data ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={DF.gold} />
          </View>
        ) : null}

        <View style={styles.gaugeRow}>
          <GaugeAnalog
            title="Throughput"
            value01={activity / 60}
            valueLabel={`${Math.round(activity)}`}
            minValueLabel="0"
            maxValueLabel="60"
            minMeaningLabel="Idle"
            maxMeaningLabel="Jobs/min"
            accent={DF.gold}
            size={94}
          />
          <GaugeAnalog
            title="Queue Pressure"
            value01={load / 100}
            valueLabel={`${Math.round(load)}%`}
            minValueLabel="0"
            maxValueLabel="100"
            minMeaningLabel="Clear"
            maxMeaningLabel="Full"
            accent={DF.cyan}
            size={94}
          />
          <GaugeAnalog
            title="Success Rate"
            value01={success / 100}
            valueLabel={`${Math.round(success)}%`}
            minValueLabel="0"
            maxValueLabel="100"
            minMeaningLabel="Poor"
            maxMeaningLabel="Best"
            accent={DF.ai}
            size={94}
          />
        </View>

        <View style={styles.studiosSection}>
          <SectionTitle title="Studios" />
          <View style={styles.studioGrid}>
            <View style={[styles.studioGridRow, { gap: studioGrid.gap }]}>
              <StudioHeroTile
                onPress={goFace}
                fallbackTitle="Face Studio"
                iconName="person-outline"
                width={studioGrid.compactTileWidth}
                height={studioGrid.compactTileHeight}
              />
              <StudioHeroTile
                onPress={goAudio}
                fallbackTitle="Audio Studio"
                iconName="mic-outline"
                width={studioGrid.compactTileWidth}
                height={studioGrid.compactTileHeight}
              />
              <StudioHeroTile
                onPress={goFusion}
                fallbackTitle="Fusion Studio"
                iconName="videocam-outline"
                width={studioGrid.compactTileWidth}
                height={studioGrid.compactTileHeight}
              />
            </View>
            <View style={[styles.studioGridRow, { gap: studioGrid.gap, marginTop: studioGrid.gap }]}>
              <StudioHeroTile
                onPress={goRetail}
                fallbackTitle="Retail Studio"
                iconName="bag-handle-outline"
                width={studioGrid.wideTileWidth}
                height={studioGrid.wideTileHeight}
              />
              <StudioHeroTile
                onPress={goMusic}
                fallbackTitle="Music Studio"
                iconName="musical-notes-outline"
                width={studioGrid.wideTileWidth}
                height={studioGrid.wideTileHeight}
              />
            </View>
          </View>
        </View>

        <View style={styles.mediaRow}>
          <View style={styles.mediaCol}>
            <SectionTitle
              title="Recent Faces"
              rightLabel={
                faces?.length
                  ? `${Math.min(faces.length, 10)}/${faces.length}`
                  : undefined
              }
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
              <EmptyCompact text="No faces yet" />
            )}
          </View>

          <View style={styles.mediaCol}>
            <SectionTitle
              title="Recent Videos"
              rightLabel={
                videos?.length
                  ? `${Math.min(videos.length, 10)}/${videos.length}`
                  : undefined
              }
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
                  renderCard={(it, ctx) => (
                    <VideoCard
                      item={{
                        ...(it.meta ?? {}),
                        url: it.url,
                        video_url: it.url,
                      }}
                      ctx={ctx}
                    />
                  )}
                />
              </View>
            ) : (
              <EmptyCompact text="No videos yet" />
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function StudioHeroTile({
  onPress,
  fallbackTitle,
  width,
  height,
  iconName,
}: {
  onPress?: () => void;
  fallbackTitle: string;
  width: number;
  height: number;
  iconName?: keyof typeof Ionicons.glyphMap;
}) {
  const radius = 22;

  return (
    <Pressable
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: DF.border,
        backgroundColor: "#050505",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 10,
      }}
      onPress={onPress}
    >
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
        {iconName ? (
          <Ionicons name={iconName} size={Math.max(24, Math.min(34, Math.round(Math.min(width, height) * 0.24)))} color={DF.cyan} />
        ) : null}
        <Text
          style={{
            color: DF.text,
            fontWeight: "900",
            fontSize: width < 120 ? 14 : 16,
            textAlign: "center",
          }}
        >
          {fallbackTitle}
        </Text>
      </View>
    </Pressable>
  );
}

function SectionTitle({
  title,
  rightLabel,
}: {
  title: string;
  rightLabel?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {!!rightLabel ? (
        <View style={styles.sectionBadge}>
          <Text style={styles.sectionBadgeText}>{rightLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

function EmptyCompact({ text }: { text: string }) {
  return (
    <View style={styles.emptyWrapCompact}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DF.bg,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },

  loadingWrap: {
    marginTop: 8,
    marginBottom: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  gaugeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },

  studiosSection: {
    marginTop: 14,
  },
  studioGrid: {
    gap: 0,
  },
  studioGridRow: {
    flexDirection: "row",
  },
  studioHeroTile: {
    backgroundColor: "#050505",
    borderWidth: 1,
    borderColor: DF.line,
    borderRadius: 22,
    overflow: "hidden",
  },
  studioHeroImageWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: "#050505",
  },
  studioHeroFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: DF.surface,
  },
  studioHeroFallbackText: {
    color: DF.text,
    fontWeight: "900",
    fontSize: 18,
    textAlign: "center",
  },
  studioHeroBorder: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },

  mediaRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  mediaCol: {
    flex: 1,
    minWidth: 0,
  },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    color: DF.text,
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 0.25,
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface2,
  },
  sectionBadgeText: {
    color: DF.textSoft,
    fontWeight: "800",
    fontSize: 10,
    letterSpacing: 0.3,
  },

  deckOuterCompact: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
  },

  emptyWrapCompact: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.surface,
    padding: 14,
    minHeight: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: DF.textSoft,
    fontWeight: "600",
    fontSize: 12,
    textAlign: "center",
  },
});
