import React, { useMemo, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";

import { DF } from "../../../core/theme/colors";
import DFHeader from "../../../core/ui/DFHeader";
import { useAuth } from "../../../core/auth/AuthContext";
import { useCreatorFlow } from "../../../core/flow/creatorFlowStore";
import { saveCreateFlowContext } from "../../../core/media/createFlow";

let ExpoAudio: any = null;
let ExpoVideo: any = null;
let ExpoCore: any = null;
let ShareModule: any = null;

try {
  ExpoAudio = require("expo-audio");
} catch (e) {
  console.warn("[MediaViewer] expo-audio unavailable", e);
}
try {
  ExpoVideo = require("expo-video");
} catch (e) {
  console.warn("[MediaViewer] expo-video unavailable", e);
}
try {
  ExpoCore = require("expo");
} catch (e) {
  console.warn("[MediaViewer] expo core unavailable", e);
}
try {
  ShareModule = require("../../../core/share/share");
} catch (e) {
  console.warn("[MediaViewer] share module unavailable", e);
}

type Stage = "face_done" | "audio_done" | "video_done";
type MediaType = "image" | "video" | "audio";

function firstParam(v: unknown, fallback = ""): string {
  return Array.isArray(v) ? String(v[0] ?? fallback) : String(v ?? fallback);
}

function cleanUrl(v: unknown): string {
  const s = firstParam(v, "").trim().replace(/^"+|"+$/g, "");
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function cleanValue(v: unknown): string {
  const s = firstParam(v, "").trim().replace(/^"+|"+$/g, "");
  if (!s || s === "undefined" || s === "null") return "";
  return s;
}

function looksLikeVideoUrl(u: string) {
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u);
}

function decodeNavUrl(v: unknown): string {
  let s = cleanUrl(v);
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
  const u0 = cleanUrl(rawUrl);
  if (!u0) return "";
  if (!u0.includes("?")) return u0;

  const [base, qs] = u0.split("?");
  if (!qs) return u0;

  const sp = cleanUrl(params.sp);
  const sv = cleanUrl(params.sv);
  const sr = cleanUrl(params.sr);
  const se = cleanUrl(params.se);
  const sig = cleanUrl(params.sig);

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
  const u = cleanUrl(url);
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

function logMediaViewerFlow(step: string, payload: any) {
  try {
    console.log("[DF_FLOW][MediaViewer]", step, JSON.stringify(payload, null, 2));
  } catch {
    console.log("[DF_FLOW][MediaViewer]", step, payload);
  }
}

function readVideoEventError(errorLike: unknown): string {
  if (!errorLike) return "";
  if (typeof errorLike === "string") return errorLike.trim();

  const asAny = errorLike as any;
  return (
    cleanValue(asAny?.message) ||
    cleanValue(asAny?.description) ||
    cleanValue(asAny?.code) ||
    cleanValue(asAny)
  );
}

async function shareMediaToSheet(url: string, type: MediaType) {
  const safeUrl = cleanUrl(url);
  if (!safeUrl) {
    Alert.alert("Missing media URL", "There is no valid media URL to share.");
    return;
  }

  if (!ShareModule) {
    Alert.alert("Share unavailable", "Sharing is not available in the current development build.");
    return;
  }

  const mod = ShareModule as any;

  try {
    if (typeof mod.shareToSheet === "function") {
      await mod.shareToSheet({ url: safeUrl, type });
      return;
    }

    if (typeof mod.default === "function") {
      await mod.default({ url: safeUrl, type });
      return;
    }

    if (typeof mod.shareUrl === "function") {
      await mod.shareUrl(safeUrl);
      return;
    }

    throw new Error("No compatible share function exported from core/share/share");
  } catch (e: any) {
    const message = String(e?.message ?? e ?? "Share failed");
    console.warn("shareMediaToSheet failed", { message, safeUrl, type });
    Alert.alert("Share failed", message);
  }
}

export default function MediaViewer() {
  const params = useLocalSearchParams();
  const flow = useCreatorFlow() as any;
  const { setFaceSelection, setFusionSettings, setAudioSelection } = flow;
  const auth = useAuth() as any;
  const authUserId =
    cleanValue(auth?.userId) ||
    cleanValue(auth?.user?.id) ||
    cleanValue(auth?.session?.user?.id) ||
    cleanValue(auth?.authState?.user?.id) ||
    "";

  const urlParam = decodeNavUrl((params as any).url);

  const imageUrlParam =
    decodeNavUrl((params as any).image_url) ||
    decodeNavUrl((params as any).image_sas_url) ||
    decodeNavUrl((params as any).face_image_url) ||
    decodeNavUrl((params as any).face_sas_url) ||
    decodeNavUrl((params as any).image) ||
    "";

  const videoUrlParam =
    decodeNavUrl((params as any).video_url) ||
    decodeNavUrl((params as any).video_sas_url) ||
    decodeNavUrl((params as any).mp4_url) ||
    decodeNavUrl((params as any).media_url) ||
    decodeNavUrl((params as any).artifact_url) ||
    "";

  const audioUrlParam =
    decodeNavUrl((params as any).audio_url) ||
    decodeNavUrl((params as any).audio_sas_url) ||
    decodeNavUrl((params as any).audio) ||
    "";

  const rawType = firstParam((params as any).type, "").trim().toLowerCase();
  const type: MediaType =
    rawType === "audio"
      ? "audio"
      : rawType === "video"
      ? "video"
      : rawType === "image"
      ? "image"
      : audioUrlParam
      ? "audio"
      : videoUrlParam
      ? "video"
      : looksLikeVideoUrl(urlParam)
      ? "video"
      : "image";

  const safeUrl = useMemo(() => {
    const picked =
      type === "audio"
        ? audioUrlParam || urlParam || imageUrlParam || videoUrlParam
        : type === "video"
        ? videoUrlParam || urlParam || imageUrlParam || audioUrlParam
        : imageUrlParam || urlParam || videoUrlParam || audioUrlParam;

    const rebuilt = rebuildSasIfSplit(picked, params as any);
    return ensureAzureSigEncoded(rebuilt);
  }, [type, audioUrlParam, videoUrlParam, urlParam, imageUrlParam, params]);

  const title = firstParam(
    (params as any).title,
    type === "video" ? "Fusion Video" : type === "audio" ? "Audio Preview" : "Face Preview"
  );
  const subtitle = firstParam((params as any).subtitle, "");

  const stageDefault: Stage =
    type === "video" ? "video_done" : type === "audio" ? "audio_done" : "face_done";
  const stageParam = firstParam((params as any).stage, stageDefault);
  const stage: Stage =
    stageParam === "face_done" || stageParam === "audio_done" || stageParam === "video_done"
      ? (stageParam as Stage)
      : stageDefault;

  const currentFace = flow?.faceSelection ?? flow?.face ?? null;

  const faceArtifactId =
    cleanValue((params as any).face_artifact_id) ||
    cleanValue((params as any).image_artifact_id) ||
    cleanValue((params as any).artifact_id) ||
    cleanValue(currentFace?.artifactId) ||
    cleanValue(currentFace?.artifact_id) ||
    "";

  const faceMediaAssetId =
    cleanValue((params as any).face_media_asset_id) ||
    cleanValue((params as any).image_media_asset_id) ||
    cleanValue((params as any).media_asset_id) ||
    cleanValue((params as any).output_asset_id) ||
    cleanValue((params as any).image_output_asset_id) ||
    cleanValue(currentFace?.mediaAssetId) ||
    cleanValue(currentFace?.media_asset_id) ||
    "";

  const faceProfileId =
    cleanValue((params as any).face_profile_id) ||
    cleanValue((params as any).image_face_profile_id) ||
    cleanValue(currentFace?.faceProfileId) ||
    cleanValue(currentFace?.face_profile_id) ||
    "";

  const gender =
    cleanValue((params as any).gender) ||
    cleanValue((params as any).face_gender) ||
    cleanValue(currentFace?.gender) ||
    "";

  const aspectRatio =
    cleanValue((params as any).aspect_ratio) ||
    cleanValue((params as any).resolution) ||
    cleanValue(flow?.fusionAspectRatio) ||
    "";

  const audioArtifactId =
    cleanValue((params as any).audio_artifact_id) ||
    cleanValue((params as any).artifact_id) ||
    "";

  const audioVoice =
    cleanValue((params as any).audio_voice) ||
    cleanValue((params as any).voice) ||
    "";

  const audioLocale =
    cleanValue((params as any).audio_locale) ||
    cleanValue((params as any).locale) ||
    "";

  const audioDurationSec =
    cleanValue((params as any).audio_duration_sec) ||
    cleanValue((params as any).duration_sec) ||
    "";

  const buildViewerFaceSelection = useCallback(
    (imageUrl: string) =>
      ({
        sasUrl: imageUrl,
        imageUrl,
        image_url: imageUrl,
        face_image_url: imageUrl,
        face_sas_url: imageUrl,
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
      } as any),
    [faceArtifactId, faceMediaAssetId, faceProfileId, gender, authUserId]
  );

  const buildViewerAudioSelection = useCallback(
    (audioUrl: string) =>
      ({
        audioUrl,
        sasUrl: audioUrl,
        audio_url: audioUrl,
        artifactId: audioArtifactId || undefined,
        audioArtifactId: audioArtifactId || undefined,
        artifact_id: audioArtifactId || undefined,
        audio_artifact_id: audioArtifactId || undefined,
        locale: audioLocale || undefined,
        voice: audioVoice || undefined,
        durationSec: audioDurationSec ? Number(audioDurationSec) : undefined,
        title: title || undefined,
        ownerUserId: authUserId || undefined,
        owner_user_id: authUserId || undefined,
        userId: authUserId || undefined,
        user_id: authUserId || undefined,
      } as any),
    [audioArtifactId, audioLocale, audioVoice, audioDurationSec, title, authUserId]
  );

  const BG = (DF as any)?.night ?? "#0E0F14";
  const BG2 = (DF as any)?.night2 ?? "#141824";

  const showStepper = type === "image";
  const currentStep: 1 | 2 | 3 = stage === "video_done" ? 3 : stage === "audio_done" ? 2 : 1;

  useEffect(() => {
    if (!ExpoAudio?.setAudioModeAsync) return;
    (async () => {
      try {
        await ExpoAudio.setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: false,
          interruptionMode: "mixWithOthers",
        });
      } catch (e) {
        console.log("configureAppAudio failed", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (type !== "image") return;
    if (!safeUrl) return;

    setFaceSelection?.(buildViewerFaceSelection(safeUrl));

    if (aspectRatio) {
      setFusionSettings?.({
        fusionAspectRatio: aspectRatio as "9:16" | "16:9" | "1:1",
      });
    }

    saveCreateFlowContext({
      image_url: safeUrl,
      face_image_url: safeUrl,
      face_sas_url: safeUrl,
      face_artifact_id: faceArtifactId || undefined,
      artifact_id: faceArtifactId || undefined,
      face_profile_id: faceProfileId || undefined,
      face_media_asset_id: faceMediaAssetId || undefined,
      media_asset_id: faceMediaAssetId || undefined,
      gender: gender || undefined,
      aspect_ratio: aspectRatio || undefined,
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
    } as any).catch(() => {});
  }, [
    type,
    safeUrl,
    faceArtifactId,
    faceMediaAssetId,
    faceProfileId,
    gender,
    aspectRatio,
    authUserId,
    setFaceSelection,
    setFusionSettings,
    buildViewerFaceSelection,
  ]);

  const goToAudio = useCallback(() => {
    if (!safeUrl) {
      Alert.alert(
        "Missing media URL",
        "Viewer did not receive a valid media URL.\nExpected: image_url (preferred) or url."
      );
      return;
    }

    logMediaViewerFlow("goToAudio.before_routerPush", {
      authUserId,
      safeUrl,
      faceArtifactId,
      faceMediaAssetId,
      faceProfileId,
      gender,
      aspectRatio,
    });

    setFaceSelection?.(buildViewerFaceSelection(safeUrl));

    saveCreateFlowContext({
      image_url: safeUrl,
      face_image_url: safeUrl,
      face_sas_url: safeUrl,
      face_artifact_id: faceArtifactId || undefined,
      artifact_id: faceArtifactId || undefined,
      face_profile_id: faceProfileId || undefined,
      face_media_asset_id: faceMediaAssetId || undefined,
      media_asset_id: faceMediaAssetId || undefined,
      gender: gender || undefined,
      aspect_ratio: aspectRatio || undefined,
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
    } as any).catch(() => {});

    router.push({
      pathname: "/(tabs)/audio",
      params: {
        face_sas_url: safeUrl,
        face_image_url: safeUrl,
        image_url: safeUrl,
        face_artifact_id: faceArtifactId || "",
        artifact_id: faceArtifactId || "",
        face_profile_id: faceProfileId || "",
        face_media_asset_id: faceMediaAssetId || "",
        media_asset_id: faceMediaAssetId || "",
        gender: gender || "",
        aspect_ratio: aspectRatio || "",
        stage: "face_done",
      },
    } as any);
  }, [
    safeUrl,
    faceArtifactId,
    faceMediaAssetId,
    faceProfileId,
    gender,
    aspectRatio,
    authUserId,
    setFaceSelection,
    buildViewerFaceSelection,
  ]);

  const useAudioInStudio = useCallback(() => {
    if (!safeUrl) {
      Alert.alert("Missing media URL", "Viewer did not receive a valid audio URL.");
      return;
    }

    logMediaViewerFlow("useAudioInStudio.before_routerPush", {
      authUserId,
      safeUrl,
      audioArtifactId,
      audioLocale,
      audioVoice,
      audioDurationSec,
    });

    setAudioSelection?.(buildViewerAudioSelection(safeUrl));

    saveCreateFlowContext({
      audio_url: safeUrl,
      audio_sas_url: safeUrl,
      audio_artifact_id: audioArtifactId || undefined,
      artifact_id: audioArtifactId || undefined,
      audio_locale: audioLocale || undefined,
      audio_voice: audioVoice || undefined,
      audio_duration_sec: audioDurationSec ? Number(audioDurationSec) : undefined,
      ownerUserId: authUserId || undefined,
      owner_user_id: authUserId || undefined,
      userId: authUserId || undefined,
      user_id: authUserId || undefined,
    } as any).catch(() => {});

    router.push({
      pathname: "/(tabs)/audio",
      params: {
        audio_sas_url: safeUrl,
        audio_url: safeUrl,
        audio_artifact_id: audioArtifactId || "",
        artifact_id: audioArtifactId || "",
        audio_locale: audioLocale || "",
        audio_voice: audioVoice || "",
        audio_duration_sec: audioDurationSec || "",
        stage: "audio_done",
      },
    } as any);
  }, [
    safeUrl,
    setAudioSelection,
    audioArtifactId,
    audioLocale,
    audioVoice,
    audioDurationSec,
    authUserId,
    buildViewerAudioSelection,
  ]);

  const handleBackPress = useCallback(() => {
    try {
      if (typeof (router as any)?.canGoBack === "function" && (router as any).canGoBack()) {
        router.back();
        return;
      }
    } catch {}
    router.replace("/(tabs)/media" as any);
  }, []);

  const handleShare = useCallback(async () => {
    await shareMediaToSheet(safeUrl, type);
  }, [safeUrl, type]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <DFHeader subtitle={subtitle ? `${title} • ${subtitle}` : title} />

      <View style={styles.topBar}>
        <Pressable onPress={handleBackPress} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        {showStepper ? (
          <View style={{ paddingLeft: 54 }}>
            <FlowStepper currentStep={currentStep} />
          </View>
        ) : (
          <View style={{ paddingLeft: 54 }}>
            <View style={styles.finalPill}>
              <Text style={styles.finalPillText}>
                {type === "audio" ? "Audio Preview" : "Final Video"}
              </Text>
            </View>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 22 }} showsVerticalScrollIndicator={false}>
        <View style={styles.centerWrap}>
          <View style={[styles.heroCard, { backgroundColor: "rgba(255,255,255,0.06)" }]}>
            {!safeUrl ? (
              <View style={[styles.heroFallback, { backgroundColor: BG2 }]}>
                <Text style={{ color: "#FF6B6B", fontWeight: "900", fontSize: 16 }}>
                  Missing media URL
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 8, fontWeight: "800" }}>
                  Expected <Text style={{ fontWeight: "900" }}>image_url</Text>, <Text style={{ fontWeight: "900" }}>video_url</Text>, <Text style={{ fontWeight: "900" }}>audio_url</Text> or <Text style={{ fontWeight: "900" }}>url</Text>.
                </Text>
                <Text
                  style={{
                    color: "rgba(255,255,255,0.55)",
                    marginTop: 10,
                    fontWeight: "800",
                    fontSize: 12,
                  }}
                >
                  Keys: {Object.keys(params as any).join(", ")}
                </Text>
              </View>
            ) : type === "image" ? (
              <Image
                key={safeUrl}
                source={{ uri: safeUrl }}
                style={{ width: "100%", height: "100%", backgroundColor: BG2 }}
                contentFit="contain"
                contentPosition="center"
                transition={180}
                cachePolicy="none"
                onLoad={() => console.log("MediaViewer: image loaded")}
                onError={(e) => console.warn("MediaViewer: image error", e, { safeUrl })}
              />
            ) : type === "audio" ? (
              <AudioHero url={safeUrl} bg={BG2} />
            ) : (
              <VideoHero url={safeUrl} bg={BG2} />
            )}
          </View>

          {!!safeUrl && (
            <>
              <Text style={{ color: "rgba(255,255,255,0.70)", marginTop: 8, fontWeight: "900", fontSize: 11 }}>
                Active media URL
              </Text>
              <Text
                style={{ color: "rgba(255,255,255,0.55)", marginTop: 4, fontWeight: "800", fontSize: 11 }}
                numberOfLines={3}
              >
                {safeUrl}
              </Text>
            </>
          )}

          {type === "video" ? (
            <>
              <Text style={styles.stepTitle}>Your video is ready ✨</Text>
              <Text style={styles.stepDesc}>Share it instantly or create your next one.</Text>

              <View style={styles.actionGrid}>
                <ActionButton label="Share" icon="⤴" primary onPress={handleShare} />
                <ActionButton label="Dashboard" icon="⌂" onPress={() => router.push("/(tabs)/dashboard" as any)} />
                <ActionButton label="Create Face" icon="＋" onPress={() => router.push("/(tabs)/face" as any)} />
                <ActionButton label="Make Video" icon="⚡" onPress={() => router.push("/(tabs)/fusion" as any)} />
              </View>
            </>
          ) : type === "audio" ? (
            <>
              <Text style={styles.stepTitle}>Audio preview</Text>
              <Text style={styles.stepDesc}>
                {[audioVoice ? `Voice: ${audioVoice}` : "", audioLocale ? `Locale: ${audioLocale}` : "", audioDurationSec ? `${audioDurationSec}s` : ""]
                  .filter(Boolean)
                  .join(" • ") || "Play this audio and use it in Audio Studio if you like it."}
              </Text>

              <View style={styles.actionGrid}>
                <ActionButton label="Use in Audio" icon="♪" primary onPress={useAudioInStudio} />
                <ActionButton label="Share" icon="⤴" onPress={handleShare} />
                <ActionButton label="Dashboard" icon="⌂" onPress={() => router.push("/(tabs)/dashboard" as any)} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.stepTitle}>Step 1 complete: Face created</Text>
              <Text style={styles.stepDesc}>Next: add voice → then generate video.</Text>

              <View style={styles.actionGrid}>
                <ActionButton label="Add Voice" icon="♪" primary onPress={goToAudio} />
                <ActionButton label="Remix" icon="✎" onPress={() => router.push("/(tabs)/face" as any)} />
                <ActionButton label="Share" icon="⤴" onPress={handleShare} />
                <ActionButton label="Dashboard" icon="⌂" onPress={() => router.push("/(tabs)/dashboard" as any)} />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function VideoHero({ url, bg }: { url: string; bg: string }) {
  if (!ExpoVideo || !ExpoCore) {
    return (
      <View style={[styles.heroFallback, { backgroundColor: bg }]}>
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Video unavailable</Text>
        <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 8, fontWeight: "800", textAlign: "center" }}>
          Video playback is unavailable in the current development build.
        </Text>
      </View>
    );
  }

  const player = ExpoVideo.useVideoPlayer(url, (instance: any) => {
    instance.loop = false;
    instance.muted = false;
    instance.staysActiveInBackground = false;
  });

  const statusEvent = ExpoCore.useEvent(player, "statusChange", { status: player.status });
  const playingEvent = ExpoCore.useEvent(player, "playingChange", { isPlaying: player.playing });

  const status = statusEvent?.status;
  const statusErrorText = readVideoEventError((statusEvent as any)?.error);
  const isPlaying = !!playingEvent?.isPlaying;
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    player.pause();
    player.currentTime = 0;
  }, [url, player]);

  useEffect(() => {
    if (status === "error") {
      setErr(statusErrorText || "Video failed to load");
      return;
    }
    if (status === "readyToPlay") {
      setErr(null);
    }
  }, [status, statusErrorText]);

  const loading = status === "loading" || status === "idle";
  const playing = isPlaying;

  const toggle = async () => {
    try {
      if (playing) {
        player.pause();
        return;
      }
      if (player.duration && player.currentTime >= Math.max(player.duration - 0.25, 0)) {
        player.currentTime = 0;
      }
      player.play();
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "Playback failed"));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <ExpoVideo.VideoView player={player} style={{ width: "100%", height: "100%" }} nativeControls={false} contentFit="contain" />

      <Pressable onPress={() => void toggle()} style={styles.videoOverlay}>
        {loading ? (
          <ActivityIndicator />
        ) : err ? (
          <View style={{ paddingHorizontal: 18 }}>
            <Text style={{ color: "white", fontWeight: "900", fontSize: 14, textAlign: "center" }}>Video failed to load</Text>
            <Text
              style={{
                color: "rgba(255,255,255,0.75)",
                fontWeight: "800",
                fontSize: 12,
                marginTop: 6,
                textAlign: "center",
              }}
              numberOfLines={3}
            >
              {err}
            </Text>
            <Text
              style={{
                color: "rgba(255,255,255,0.80)",
                fontWeight: "900",
                fontSize: 12,
                marginTop: 10,
                textAlign: "center",
              }}
            >
              Tap to retry
            </Text>
          </View>
        ) : (
          <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>{playing ? "Pause" : "Play"}</Text>
        )}
      </Pressable>

      {Platform.OS === "ios" && (
        <View style={styles.iosHint}>
          <Text style={styles.iosHintText}>
            If audio is silent, ensure device volume is up (and Silent Mode is off on a real device).
          </Text>
        </View>
      )}
    </View>
  );
}

function AudioHero({ url, bg }: { url: string; bg: string }) {
  if (!ExpoAudio) {
    return (
      <View style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center", padding: 20 }}>
        <Text style={{ color: "white", fontWeight: "900", fontSize: 16 }}>Audio unavailable</Text>
        <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 8, fontWeight: "800", textAlign: "center" }}>
          Audio playback is unavailable in the current development build.
        </Text>
      </View>
    );
  }

  const player = ExpoAudio.useAudioPlayer(url, { updateInterval: 250 });
  const status = ExpoAudio.useAudioPlayerStatus(player);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    player.pause();
    void player.seekTo(0).catch(() => undefined);
  }, [url, player]);

  useEffect(() => {
    if (status.isLoaded) {
      setErr(null);
    }
  }, [status.isLoaded]);

  const loading = !status.isLoaded || !!status.isBuffering;
  const playing = !!status.playing;

  const toggle = useCallback(async () => {
    try {
      if (playing) {
        player.pause();
        return;
      }

      if ((status.duration ?? 0) > 0 && (status.currentTime ?? 0) >= Math.max((status.duration ?? 0) - 0.1, 0)) {
        await player.seekTo(0);
      }

      player.play();
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "Audio failed to load"));
    }
  }, [player, playing, status.duration, status.currentTime]);

  return (
    <View style={{ flex: 1, backgroundColor: bg, alignItems: "center", justifyContent: "center", padding: 20 }}>
      <View
        style={{
          width: 132,
          height: 132,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 18,
        }}
      >
        <Text style={{ color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 28 }}>♪</Text>
      </View>

      <Pressable onPress={() => void toggle()} style={styles.videoOverlay}>
        {loading ? (
          <ActivityIndicator />
        ) : err ? (
          <View style={{ paddingHorizontal: 18 }}>
            <Text style={{ color: "white", fontWeight: "900", fontSize: 14, textAlign: "center" }}>Audio failed to load</Text>
            <Text
              style={{
                color: "rgba(255,255,255,0.75)",
                fontWeight: "800",
                fontSize: 12,
                marginTop: 6,
                textAlign: "center",
              }}
              numberOfLines={3}
            >
              {err}
            </Text>
            <Text
              style={{
                color: "rgba(255,255,255,0.80)",
                fontWeight: "900",
                fontSize: 12,
                marginTop: 10,
                textAlign: "center",
              }}
            >
              Tap to retry
            </Text>
          </View>
        ) : (
          <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>{playing ? "Pause" : "Play"}</Text>
        )}
      </Pressable>
    </View>
  );
}

function FlowStepper({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  return (
    <View style={styles.flowWrap}>
      <StepPill label="Face" active={currentStep === 1} done={currentStep > 1} />
      <View style={styles.flowDot} />
      <StepPill label="Voice" active={currentStep === 2} done={currentStep > 2} />
      <View style={styles.flowDot} />
      <StepPill label="Video" active={currentStep === 3} done={false} />
    </View>
  );
}

function StepPill({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <View style={[styles.stepPill, done && styles.stepPillDone, active && styles.stepPillActive]}>
      <Text style={[styles.stepPillText, done && styles.stepPillTextDone, active && styles.stepPillTextActive]}>
        {done ? "✓ " : ""}
        {label}
      </Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  primary,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.actionBtn, primary && styles.actionBtnPrimary]}>
      <Text style={[styles.actionIcon, primary && styles.actionIconPrimary]}>{icon}</Text>
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  backBtn: {
    position: "absolute",
    left: 12,
    top: 10,
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  backText: { color: "rgba(255,255,255,0.8)", fontWeight: "900", fontSize: 20 },
  finalPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  finalPillText: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.2,
  },
  flowWrap: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flowDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.16)" },
  stepPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  stepPillActive: {
    backgroundColor: "rgba(70,160,255,0.22)",
    borderColor: "rgba(70,160,255,0.38)",
  },
  stepPillDone: { backgroundColor: "rgba(0,0,0,0.10)", borderColor: "rgba(255,255,255,0.10)" },
  stepPillText: { color: "rgba(255,255,255,0.68)", fontWeight: "900", fontSize: 12 },
  stepPillTextActive: { color: "rgba(255,255,255,0.92)" },
  stepPillTextDone: { color: "rgba(255,255,255,0.78)" },
  centerWrap: { paddingHorizontal: 16, paddingTop: 6 },
  heroCard: {
    height: 420,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  heroFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  videoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  iosHint: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  iosHintText: {
    color: "rgba(255,255,255,0.75)",
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
  },
  stepTitle: {
    marginTop: 14,
    color: "rgba(255,255,255,0.90)",
    fontWeight: "900",
    fontSize: 18,
    textAlign: "center",
  },
  stepDesc: {
    marginTop: 6,
    color: "rgba(255,255,255,0.60)",
    fontWeight: "800",
    fontSize: 14,
    textAlign: "center",
  },
  actionGrid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  actionBtn: {
    width: "48%",
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  actionBtnPrimary: {
    backgroundColor: "rgba(70,160,255,0.22)",
    borderColor: "rgba(70,160,255,0.42)",
  },
  actionIcon: { color: "rgba(255,255,255,0.70)", fontWeight: "900", fontSize: 16 },
  actionIconPrimary: { color: "rgba(255,255,255,0.92)" },
  actionText: { color: "rgba(255,255,255,0.72)", fontWeight: "900", fontSize: 14 },
  actionTextPrimary: { color: "rgba(255,255,255,0.95)" },
});
