import React, { useMemo, useEffect, useRef, useState, useCallback } from "react";
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
import {
  Video,
  ResizeMode,
  Audio,
  InterruptionModeIOS,
  InterruptionModeAndroid,
  AVPlaybackStatus,
} from "expo-av";

import { DF } from "../../../core/theme/colors";
import DFHeader from "../../../core/ui/DFHeader";
import * as ShareModule from "../../../core/share/share";
import { useCreatorFlow } from "../../../core/flow/creatorFlowStore";
import { saveCreateFlowContext } from "../../../core/media/createFlow";

type Stage = "face_done" | "audio_done" | "video_done";

function firstParam(v: unknown, fallback = ""): string {
  return Array.isArray(v) ? String(v[0] ?? fallback) : String(v ?? fallback);
}

function cleanUrl(v: unknown): string {
  const s = firstParam(v, "").trim().replace(/^"+|"+$/g, "");
  if (!s) return "";
  if (s === "undefined" || s === "null") return "";
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

/**
 * Decode only until it becomes a real URL.
 * This avoids double-decoding an already-correct SAS (which breaks sig).
 */
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

/**
 * If SAS URL was passed unencoded, Expo Router can split it into separate params.
 * Example:
 *   image_url = "...?se=..."
 *   sp="r" sv="..." sr="b" sig="..."
 * This reconstructs a complete query string.
 */
function rebuildSasIfSplit(rawUrl: string, params: Record<string, any>) {
  const u0 = cleanUrl(rawUrl);
  if (!u0) return "";

  const hasQuery = u0.includes("?");
  if (!hasQuery) return u0;

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

/**
 * Ensure Azure SAS signature is URL-encoded.
 * If sig is already encoded (contains %xx), leave it alone.
 * If it's raw base64 with / + =, encode it.
 */
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

function encodeNavUrl(url: string) {
  const clean = String(url ?? "").trim().replace(/^"+|"+$/g, "");
  return encodeURIComponent(clean);
}

async function shareMediaToSheet(url: string, type: "image" | "video") {
  const safeUrl = cleanUrl(url);
  if (!safeUrl) {
    Alert.alert("Missing media URL", "There is no valid media URL to share.");
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

/**
 * Media Viewer
 * - type=image => guided pipeline (Face -> Voice -> Video)
 * - type=video => final product viewer (share-first, no pipeline CTAs)
 */
export default function MediaViewer() {
  const params = useLocalSearchParams();
  const flow = useCreatorFlow() as any;
  const { setFaceSelection, setFusionSettings } = flow;

  const urlParam = decodeNavUrl(params.url);

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

  const rawType = firstParam(params.type, "").trim().toLowerCase();
  const type: "image" | "video" =
    rawType === "video"
      ? "video"
      : rawType === "image"
        ? "image"
        : videoUrlParam
          ? "video"
          : looksLikeVideoUrl(urlParam)
            ? "video"
            : "image";

  const safeUrl = useMemo(() => {
    const picked =
      type === "video"
        ? videoUrlParam || urlParam || imageUrlParam
        : imageUrlParam || urlParam || videoUrlParam;

    const rebuilt = rebuildSasIfSplit(picked, params as any);
    return ensureAzureSigEncoded(rebuilt);
  }, [type, videoUrlParam, urlParam, imageUrlParam, params]);

  const title = firstParam(params.title, type === "video" ? "Fusion Video" : "Face Preview");
  const subtitle = firstParam(params.subtitle, "");

  const stageDefault: Stage = type === "video" ? "video_done" : "face_done";
  const stageParam = firstParam(params.stage, stageDefault);
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

  const BG = (DF as any)?.night ?? "#0E0F14";
  const BG2 = (DF as any)?.night2 ?? "#141824";

  const showStepper = type !== "video";
  const currentStep: 1 | 2 | 3 = stage === "video_done" ? 3 : stage === "audio_done" ? 2 : 1;

  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (e) {
        console.log("configureAppAudio failed", e);
      }
    })();
  }, []);

  useEffect(() => {
    if (type !== "image") return;
    if (!safeUrl) return;

    setFaceSelection?.({
      sasUrl: safeUrl,
      imageUrl: safeUrl,
      artifactId: faceArtifactId || undefined,
      mediaAssetId: faceMediaAssetId || undefined,
      faceProfileId: faceProfileId || undefined,
      gender: gender || undefined,
    });

    if (aspectRatio) {
      setFusionSettings?.({
        fusionAspectRatio: aspectRatio as "9:16" | "16:9" | "1:1",
      });
    }

    saveCreateFlowContext({
      image_url: safeUrl,
      face_artifact_id: faceArtifactId || undefined,
      face_profile_id: faceProfileId || undefined,
      media_asset_id: faceMediaAssetId || undefined,
      gender: gender || undefined,
      aspect_ratio: aspectRatio || undefined,
    } as any).catch(() => {});
  }, [
    type,
    safeUrl,
    faceArtifactId,
    faceMediaAssetId,
    faceProfileId,
    gender,
    aspectRatio,
    setFaceSelection,
    setFusionSettings,
  ]);

  const goToAudio = useCallback(() => {
    if (!safeUrl) {
      Alert.alert(
        "Missing media URL",
        "Viewer did not receive a valid media URL.\nExpected: image_url (preferred) or url."
      );
      return;
    }

    setFaceSelection?.({
      sasUrl: safeUrl,
      imageUrl: safeUrl,
      artifactId: faceArtifactId || undefined,
      mediaAssetId: faceMediaAssetId || undefined,
      faceProfileId: faceProfileId || undefined,
      gender: gender || undefined,
    });

    saveCreateFlowContext({
      image_url: safeUrl,
      face_artifact_id: faceArtifactId || undefined,
      face_profile_id: faceProfileId || undefined,
      media_asset_id: faceMediaAssetId || undefined,
      gender: gender || undefined,
      aspect_ratio: aspectRatio || undefined,
    } as any).catch(() => {});

    router.push({
      pathname: "/(tabs)/audio",
      params: {
        face_sas_url: encodeNavUrl(safeUrl),
        face_image_url: encodeNavUrl(safeUrl),
        image_url: encodeNavUrl(safeUrl),
        face_artifact_id: faceArtifactId || "",
        face_profile_id: faceProfileId || "",
        face_media_asset_id: faceMediaAssetId || "",
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
    setFaceSelection,
  ]);

  const handleShare = useCallback(async () => {
    await shareMediaToSheet(safeUrl, type);
  }, [safeUrl, type]);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <DFHeader subtitle={subtitle ? `${title} • ${subtitle}` : title} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>

        {showStepper ? (
          <View style={{ paddingLeft: 54 }}>
            <FlowStepper currentStep={currentStep} />
          </View>
        ) : (
          <View style={{ paddingLeft: 54 }}>
            <View style={styles.finalPill}>
              <Text style={styles.finalPillText}>Final Video</Text>
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
                  Expected <Text style={{ fontWeight: "900" }}>image_url</Text> or{" "}
                  <Text style={{ fontWeight: "900" }}>url</Text>.
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
            ) : (
              <VideoHero url={safeUrl} bg={BG2} />
            )}
          </View>

          {!!safeUrl && (
            <Text
              style={{
                color: "rgba(255,255,255,0.55)",
                marginTop: 8,
                fontWeight: "800",
                fontSize: 11,
              }}
              numberOfLines={2}
            >
              {safeUrl}
            </Text>
          )}

          {type === "video" ? (
            <>
              <Text style={styles.stepTitle}>Your video is ready ✨</Text>
              <Text style={styles.stepDesc}>Share it instantly or create your next one.</Text>

              <View style={styles.actionGrid}>
                <ActionButton
                  label="Share"
                  icon="⤴"
                  primary
                  onPress={handleShare}
                />
                <ActionButton label="Dashboard" icon="⌂" onPress={() => router.push("/(tabs)/dashboard")} />
                <ActionButton label="Create Face" icon="＋" onPress={() => router.push("/(tabs)/face")} />
                <ActionButton label="Make Video" icon="⚡" onPress={() => router.push("/(tabs)/fusion")} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.stepTitle}>Step 1 complete: Face created</Text>
              <Text style={styles.stepDesc}>Next: add voice → then generate video.</Text>

              <View style={styles.actionGrid}>
                <ActionButton label="Add Voice" icon="♪" primary onPress={goToAudio} />
                <ActionButton label="Remix" icon="✎" onPress={() => router.push("/(tabs)/face")} />
                <ActionButton
                  label="Share"
                  icon="⤴"
                  onPress={handleShare}
                />
                <ActionButton label="Dashboard" icon="⌂" onPress={() => router.push("/(tabs)/dashboard")} />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function VideoHero({ url, bg }: { url: string; bg: string }) {
  const ref = useRef<Video>(null);

  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async () => {
    if (!ref.current) return;
    try {
      if (playing) {
        await ref.current.pauseAsync();
      } else {
        await ref.current.playAsync();
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? "Playback failed"));
    }
  };

  const onStatus = (st: AVPlaybackStatus) => {
    if (!st.isLoaded) {
      if (st.error) setErr(String(st.error));
      return;
    }
    if (loading) setLoading(false);

    if (st.didJustFinish) {
      setPlaying(false);
      ref.current?.pauseAsync?.().catch?.(() => {});
      ref.current?.setPositionAsync?.(0).catch?.(() => {});
      return;
    }

    setPlaying(!!st.isPlaying);
  };

  useEffect(() => {
    setLoading(true);
    setPlaying(false);
    setErr(null);
  }, [url]);

  useEffect(() => {
    return () => {
      (ref.current as any)?.stopAsync?.().catch?.(() => {});
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <Video
        ref={ref}
        style={{ width: "100%", height: "100%" }}
        source={{ uri: url }}
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
        useNativeControls={false}
        shouldPlay={false}
        isMuted={false}
        volume={1.0}
        onLoadStart={() => {
          setLoading(true);
          setErr(null);
        }}
        onLoad={() => {
          setLoading(false);
          setErr(null);
        }}
        onError={(e) => {
          const msg = (e as any)?.error ?? "Video failed to load";
          setErr(String(msg));
          setLoading(false);
          console.warn("MediaViewer VideoHero onError:", msg, { url });
        }}
        onPlaybackStatusUpdate={onStatus}
      />

      <Pressable onPress={toggle} style={styles.videoOverlay}>
        {loading ? (
          <ActivityIndicator />
        ) : err ? (
          <View style={{ paddingHorizontal: 18 }}>
            <Text style={{ color: "white", fontWeight: "900", fontSize: 14, textAlign: "center" }}>
              Video failed to load
            </Text>
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
          <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>
            {playing ? "Pause" : "Play"}
          </Text>
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