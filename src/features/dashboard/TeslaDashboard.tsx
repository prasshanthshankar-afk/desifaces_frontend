
import React, { useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Image,
  useWindowDimensions,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { fetchDashboardHome } from "../../core/api/dashboard";
import { api } from "../../core/api/client";
import { endpoints } from "../../core/api/endpoints";
import { DASH_BASE } from "../../core/config/env";

import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import { saveCreateFlowContext } from "../../core/media/createFlow";

import Gauge from "./widgets/Gauge";
import FaceCard from "./carousels/FaceCard";
import VideoCard from "./carousels/VideoCard";
import ThumbFanDeckCarousel, { ThumbFanItem } from "../../core/ui/ThumbFanDeckCarousel";

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function speedLabel(latencyP95Sec: number) {
  if (!isFinite(latencyP95Sec) || latencyP95Sec <= 0) return "—";
  if (latencyP95Sec <= 2) return "Fast";
  if (latencyP95Sec <= 5) return "OK";
  return "Slow";
}

function is401(err: any) {
  const status = err?.status ?? err?.response?.status ?? err?.cause?.status;
  const msg = String(err?.message ?? "");
  return status === 401 || /401|unauthorized|auth_expired/i.test(msg);
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

export default function TeslaDashboard({
  onMenuPress,
}: {
  onMenuPress?: () => void;
}) {
  const { isReady, isAuthed, token, logout } = useAuth() as any;
  const { width } = useWindowDimensions();
  const flow = useCreatorFlow() as any;
  const setFaceSelection = flow?.setFaceSelection as undefined | ((x: any) => void);
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);

  const homeQ = useQuery({
    queryKey: [
      "dash-home",
      "modern",
      isAuthed ? "authed" : "guest",
      token ? `t:${String(token).slice(0, 8)}` : "t0",
    ],
    queryFn: async () => {
      try {
        const d = await fetchDashboardHome(false);
        return d;
      } catch (e: any) {
        if (is401(e)) {
          try {
            await logout?.();
          } catch {}
        }
        throw e;
      }
    },
    enabled: isReady && isAuthed && !!token,
    staleTime: 15_000,
    retry: 0,
  });

  const refreshM = useMutation({
    mutationFn: () => api.post(DASH_BASE, endpoints.dashboard.refresh, {}),
    onSuccess: () => homeQ.refetch(),
  });

  const data = homeQ.data as any;

  const {
    kpis,
    faces,
    videos,
    alerts,
    pricingCard,
    updatedAt,
    healthTone,
    compactUsageLabel,
    speedText,
  } = useMemo(() => {
    const g = data?.gauges ?? {};
    const speed = g?.speedometer ?? {};
    const fuel = g?.fuel ?? {};
    const temp = g?.temp ?? {};
    const health = g?.health ?? {};

    const faces60m = Number(speed?.faces_last_60m ?? 0);
    const videos60m = Number(speed?.videos_last_60m ?? 0);

    const creditsRemaining = Number(fuel?.credits_remaining ?? 0);
    const creditsCap =
      typeof fuel?.cap === "number" && fuel.cap > 0 ? Number(fuel.cap) : 1000;

    const latencyP95 = Number(temp?.p95_latency_sec ?? 0);
    const healthNorm = clamp01(Number(health?.value_norm ?? 1));
    const providerHealthPct = clamp(Math.round(healthNorm * 100), 0, 100);

    const arrFaces = Array.isArray(data?.face_carousel) ? data.face_carousel : [];
    const arrVideos = Array.isArray(data?.video_carousel) ? data.video_carousel : [];
    const arrAlerts = Array.isArray(data?.alerts) ? data.alerts : [];

    const createGoalFaces = 3;
    const createGoalVideos = 1;

    const goalFacesNorm = clamp01(faces60m / createGoalFaces);
    const goalVideosNorm = clamp01(videos60m / createGoalVideos);

    const dailyChallenge =
      faces60m >= createGoalFaces && videos60m >= createGoalVideos
        ? "Challenge complete"
        : faces60m < createGoalFaces
          ? "Make 3 new looks"
          : "Make 1 talking video";

    const nextBestAction =
      videos60m === 0
        ? "Turn a photo into a video"
        : faces60m === 0
          ? "Create a fresh face"
          : "Try a new style";

    const planSummary = data?.plan_summary ?? data?.pricing_summary ?? {};
    const usageSummary = data?.usage_summary ?? data?.usage ?? {};

    const fallbackPercent = clamp(
      ((creditsCap - creditsRemaining) / Math.max(creditsCap, 1)) * 100,
      0,
      100
    );

    const walletBalance =
      planSummary?.walletBalance ??
      planSummary?.wallet_balance ??
      `${Math.floor(creditsRemaining)} credits`;

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

    const pricingCard = {
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

    const healthTone =
      providerHealthPct >= 80
        ? "green"
        : providerHealthPct >= 55
          ? "amber"
          : "red";

    const compactUsageLabel = `${pricingCard.walletBalance} • ${pricingCard.totalUsagePercent}% used`;

    return {
      kpis: {
        faces60m,
        videos60m,
        latencyP95,
        healthNorm,
        goalFacesNorm,
        goalVideosNorm,
        dailyChallenge,
        nextBestAction,
      },
      faces: arrFaces,
      videos: arrVideos,
      alerts: arrAlerts,
      pricingCard,
      updatedAt: data?.updated_at ? new Date(data.updated_at).toLocaleString() : "—",
      healthTone,
      compactUsageLabel,
      speedText: speedLabel(latencyP95),
    };
  }, [data]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: DF.night, justifyContent: "center", padding: 16 }}>
        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 16 }}>Loading…</Text>
        <Text style={{ color: DF.muted, marginTop: 8, fontWeight: "700" }}>
          Preparing dashboard.
        </Text>
      </View>
    );
  }

  if (!isAuthed) {
    return (
      <View style={{ flex: 1, backgroundColor: DF.night, justifyContent: "center", padding: 16 }}>
        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 16 }}>Please log in</Text>
        <Text style={{ color: DF.muted, marginTop: 8, fontWeight: "700" }}>
          Dashboard needs an authenticated session.
        </Text>
      </View>
    );
  }

  if (homeQ.isError) {
    const msg = (homeQ.error as any)?.message ?? "Dashboard failed.";
    const authExpired = is401(homeQ.error);

    return (
      <View style={{ flex: 1, backgroundColor: DF.night }}>
        <DFHeader
          subtitle="modern dashboard • error"
          onMenuPress={onMenuPress}
        />
        <View style={{ padding: 16 }}>
          <View
            style={{
              borderWidth: 1,
              borderColor: DF.danger ?? "rgba(255,80,80,0.6)",
              backgroundColor: DF.surface ?? "rgba(255,180,90,0.035)",
              padding: 12,
              borderRadius: 14,
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>
              {authExpired ? "Session expired" : "Could not load dashboard"}
            </Text>
            <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700" }}>
              {authExpired ? "Please log in again." : msg}
            </Text>

            <Pressable
              onPress={async () => {
                if (authExpired) {
                  try {
                    await logout?.();
                  } catch {}
                }
                homeQ.refetch();
              }}
              style={{
                marginTop: 12,
                borderRadius: 14,
                paddingVertical: 10,
                alignItems: "center",
                borderWidth: 1,
                borderColor: DF.border,
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900" }}>
                {authExpired ? "Log in" : "Retry"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const FACE_DECK_H = 260;
  const VIDEO_DECK_H = 250;
  const FAN_COUNT = 4;

  const faceItems: ThumbFanItem[] = useMemo(() => {
    const arr = (faces ?? []).slice(0, 12);
    return arr.map((a: any, i: number) => {
      const url = pickFaceUrl(a);
      const baseId =
        a?.id ??
        a?.meta?.artifact_id ??
        a?.storage_path ??
        url ??
        String(i);

      return {
        id: `${String(baseId)}:${i}`,
        kind: "image",
        url,
        meta: a,
        title: "Face",
        subtitle: pickCreatedAtLabel(a),
      };
    });
  }, [faces]);

  const videoItems: ThumbFanItem[] = useMemo(() => {
    const arr = (videos ?? []).slice(0, 12);
    return arr.map((a: any, i: number) => {
      const url = pickVideoUrl(a);
      const baseId =
        a?.id ??
        a?.meta?.artifact_id ??
        a?.storage_path ??
        url ??
        String(i);

      return {
        id: `${String(baseId)}:${i}`,
        kind: "image" as any,
        url,
        meta: a,
        title: "Fusion",
        subtitle: pickCreatedAtLabel(a),
      };
    });
  }, [videos]);

  const openFaceItem = useCallback((it: ThumbFanItem) => {
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

  const openVideoItem = useCallback((it: ThumbFanItem) => {
    const meta = it?.meta ?? {};
    const url = String(it?.url ?? pickVideoUrl(meta) ?? "").trim();
    if (!url) return;

    const vnum = pickVariantNumber(meta);
    const ts = pickCreatedAtLabel(meta);

    router.push({
      pathname: "/media/viewer",
      params: {
        type: "video",
        video_url: url,
        url,
        title: `Fusion • v${vnum}`,
        subtitle: ts,
        stage: "video_done",
      },
    });
  }, []);

  const goPricing = () => router.push({ pathname: "/pricing/plan-billing" });
  const goFace = () => router.push("/(tabs)/face");
  const goAudio = () => router.push("/(tabs)/audio");
  const goFusion = () => router.push("/(tabs)/fusion");
  const goRetail = () => router.push("/(tabs)/commerce" as any);
  const goMusic = () => router.push("/(tabs)/music" as any);

  const studioGrid = useMemo(() => {
    const horizontalPadding = 32;
    const gap = 10;
    const safeWidth = Math.max(width - horizontalPadding, 320);
    const compactTileWidth = Math.floor((safeWidth - gap * 2) / 3);
    const compactTileHeight = Math.round(compactTileWidth * 0.68);
    const wideTileWidth = Math.floor((safeWidth - gap) / 2);
    const wideTileHeight = Math.round(compactTileHeight * 0.98);
    return { gap, compactTileWidth, compactTileHeight, wideTileWidth, wideTileHeight };
  }, [width]);

  return (
    <View style={{ flex: 1, backgroundColor: DF.night }}>
      <DFHeader
        subtitle={`modern dashboard • updated ${updatedAt}`}
        statusTone={healthTone as any}
        onMenuPress={onMenuPress}
        onPressMeta={goPricing}
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={
          <RefreshControl
            tintColor={DF.text}
            refreshing={homeQ.isFetching}
            onRefresh={() => homeQ.refetch()}
          />
        }
      >
        {alerts?.length > 0 && (
          <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
            {alerts.slice(0, 2).map((a: any, idx: number) => (
              <View
                key={`${a.code}:${idx}`}
                style={{
                  borderWidth: 1,
                  borderColor:
                    a.severity === "error"
                      ? DF.danger
                      : a.severity === "warn"
                        ? DF.warn
                        : DF.border,
                  backgroundColor: DF.surface ?? "rgba(255,180,90,0.035)",
                  padding: 12,
                  borderRadius: 14,
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>
                  {String(a.severity ?? "info").toUpperCase()} • {a.code}
                </Text>
                <Text style={{ color: DF.muted, marginTop: 2, fontWeight: "700" }}>
                  {a.message}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Gauge
              title="Recent Faces"
              value01={clamp01(kpis.faces60m / 20)}
              accent={DF.halo}
              subtitle={`${kpis.faces60m} in last hour`}
            />
            <Gauge
              title="Recent Videos"
              value01={clamp01(kpis.videos60m / 10)}
              accent={DF.ember}
              subtitle={`${kpis.videos60m} in last hour`}
            />
            <Gauge
              title="Daily Challenge"
              value01={clamp01((kpis.goalFacesNorm + kpis.goalVideosNorm) / 2)}
              accent={DF.cyan}
              subtitle={kpis.dailyChallenge}
            />
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
            <ActionCard
              title={refreshM.isPending ? "Refreshing…" : "Refresh"}
              subtitle="Sync latest creations"
              onPress={() => refreshM.mutate()}
            />
            <ActionCard
              title="Next Best Step"
              subtitle={kpis.nextBestAction}
              onPress={goFace}
            />
            <ActionCard
              title="App Speed"
              subtitle={speedText === "—" ? "—" : `${speedText} • ~${kpis.latencyP95.toFixed(1)}s`}
            />
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <SectionTitle title="Studios" subtitle="Jump into any workspace" />

          <View style={{ paddingHorizontal: 16, gap: studioGrid.gap }}>
            <View style={{ flexDirection: "row", gap: studioGrid.gap }}>
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
            <View style={{ flexDirection: "row", gap: studioGrid.gap }}>
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

        <View style={{ marginTop: 18 }}>
          <SectionTitle title="Recent Faces" subtitle="Swipe • tap to view • then add voice" />

          {faceItems?.length > 0 ? (
            <View style={{ paddingHorizontal: 16 }}>
              <ThumbFanDeckCarousel
                items={faceItems}
                height={FACE_DECK_H}
                fanCount={FAN_COUNT}
                loop={true}
                enableOuterPress={true}
                onPressItem={openFaceItem}
                renderCard={(it) => (
                  <View style={{ flex: 1 }} pointerEvents="none">
                    <FaceCard
                      item={{
                        ...(it?.meta ?? {}),
                        url: it?.url,
                        image_url: it?.url,
                      }}
                      mode="deck"
                      hosted
                      fillParent
                      disablePress
                      disableActions={true}
                    />
                  </View>
                )}
              />
            </View>
          ) : (
            <EmptyRow text="No faces returned from dashboard yet." />
          )}
        </View>

        <View style={{ marginTop: 18 }}>
          <SectionTitle title="Recent Fusion Videos" subtitle="Swipe • tap to open final video" />

          {videoItems?.length > 0 ? (
            <View style={{ paddingHorizontal: 16 }}>
              <ThumbFanDeckCarousel
                items={videoItems}
                height={VIDEO_DECK_H}
                fanCount={FAN_COUNT}
                loop={true}
                enableOuterPress={true}
                onPressItem={openVideoItem}
                renderCard={(it, ctx) => (
                  <View style={{ flex: 1 }} pointerEvents="none">
                    <VideoCard
                      item={{
                        ...(it?.meta ?? {}),
                        url: it?.url,
                        id: it?.id,
                        kind: "video",
                        meta: it?.meta,
                        title: it?.title,
                        subtitle: it?.subtitle,
                      } as any}
                      ctx={ctx as any}
                    />
                  </View>
                )}
              />
            </View>
          ) : (
            <EmptyRow text="No videos returned from dashboard yet." />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ paddingHorizontal: 16, marginBottom: 10 }}>
      <Text
        style={{
          color: DF.textStrong ?? DF.text,
          fontSize: 14,
          fontWeight: "900",
          letterSpacing: 0.4,
        }}
      >
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ color: DF.muted, marginTop: 2, fontWeight: "700" }}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: DF.border,
          backgroundColor: DF.surface ?? "rgba(255,180,90,0.035)",
          borderRadius: 16,
          padding: 14,
        }}
      >
        <Text style={{ color: DF.muted, fontWeight: "700" }}>{text}</Text>
      </View>
    </View>
  );
}

function ActionCard({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 128,
        height: 168,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: DF.border,
        backgroundColor: DF.surface ?? "rgba(255,180,90,0.035)",
        alignItems: "center",
        justifyContent: "center",
        padding: 12,
      }}
    >
      <Text
        style={{
          color: DF.textStrong ?? DF.text,
          fontWeight: "900",
          textAlign: "center",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          color: DF.muted,
          marginTop: 6,
          textAlign: "center",
          fontWeight: "700",
          fontSize: 12,
        }}
      >
        {subtitle}
      </Text>
    </Pressable>
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

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      />
    </Pressable>
  );
}
