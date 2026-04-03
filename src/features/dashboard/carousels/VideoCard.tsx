import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Video, ResizeMode } from "expo-av";
import { Image } from "expo-image";

import type {
  RenderCardCtx,
  ThumbFanItem,
} from "../../../core/ui/ThumbFanDeckCarousel";

type AnyMeta = Record<string, any>;

function pickPosterUrl(item: ThumbFanItem): string {
  const meta: AnyMeta = (item?.meta ?? {}) as AnyMeta;
  return (
    meta.thumbnail_url ||
    meta.poster_url ||
    meta.preview_url ||
    meta.image_url ||
    meta.still_url ||
    ""
  );
}

function pickVideoUrl(item: ThumbFanItem): string {
  const meta: AnyMeta = (item?.meta ?? {}) as AnyMeta;
  return (
    item?.url ||
    meta.video_url ||
    meta.video_sas_url ||
    meta.mp4_url ||
    meta.artifact_url ||
    meta.media_url ||
    ""
  );
}

function looksLikePlayableVideoUrl(url: string): boolean {
  const u = String(url ?? "").trim().toLowerCase();
  if (!u) return false;
  return (
    u.includes(".mp4") ||
    u.includes(".mov") ||
    u.includes(".m4v") ||
    u.includes(".webm")
  );
}

const FALLBACK_CTX: RenderCardCtx = {
  isTop: false,
  playing: false,
  togglePlay: () => {},
  cardW: 320,
  cardH: 410,
};

export default function VideoCard({
  item,
  ctx,
}: {
  item: ThumbFanItem;
  ctx?: RenderCardCtx;
}) {
  const ref = useRef<Video | null>(null);

  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rawVideoUrl = useMemo(() => pickVideoUrl(item), [item]);
  const posterUrl = useMemo(() => pickPosterUrl(item), [item]);

  const safeCtx = ctx ?? FALLBACK_CTX;

  const hasPlayableVideo = looksLikePlayableVideoUrl(rawVideoUrl);
  const hasPoster = !!posterUrl;
  const shouldPlay = !!safeCtx.isTop && !!safeCtx.playing && hasPlayableVideo && !err;

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      try {
        if (!ref.current) return;

        if (shouldPlay) {
          await ref.current.playAsync();
        } else {
          await ref.current.pauseAsync();
          await ref.current.setPositionAsync(0);
        }
      } catch {
        // player may not be ready yet
      }
    }

    if (!cancelled) sync();
    return () => {
      cancelled = true;
    };
  }, [shouldPlay]);

  const showPoster = hasPoster && (!shouldPlay || !ready || !!err);

  return (
    <View
      style={{
        width: safeCtx.cardW,
        height: safeCtx.cardH,
        borderRadius: 18,
        overflow: "hidden",
        backgroundColor: "#0E0F14",
      }}
    >
      {/* Base media frame */}
      <View
        style={{
          flex: 1,
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: "#0E0F14",
        }}
      >
        {hasPlayableVideo ? (
          <Video
            ref={(r) => {
              ref.current = r;
            }}
            source={{ uri: rawVideoUrl }}
            style={{ width: "100%", height: "100%" }}
            resizeMode={ResizeMode.COVER}
            useNativeControls={false}
            isLooping
            shouldPlay={shouldPlay}
            isMuted
            onLoad={() => {
              setReady(true);
              setErr(null);
            }}
            onError={(e) => {
              const msg = (e as any)?.error ?? "Video failed to load";
              setErr(String(msg));
              console.warn("VideoCard onError:", msg, {
                videoUrl: rawVideoUrl,
                id: item?.id,
                kind: item?.kind,
                metaKeys: Object.keys((item?.meta ?? {}) as AnyMeta),
              });
            }}
          />
        ) : null}

        {showPoster ? (
          <Image
            source={{ uri: posterUrl }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
            }}
            contentFit="cover"
          />
        ) : null}

        {!hasPlayableVideo && !hasPoster ? (
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
              padding: 14,
            }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.78)",
                textAlign: "center",
                fontWeight: "800",
                fontSize: 13,
              }}
            >
              Video unavailable
            </Text>
          </View>
        ) : null}

        {hasPlayableVideo && !ready && !err && !hasPoster ? (
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator />
          </View>
        ) : null}

        {/* Decorative inner border */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            top: 10,
            bottom: 10,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.07)",
          }}
        />

        {/* Error / unavailable badge, subtle instead of noisy tile */}
        {!!err ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,180,90,0.24)",
              backgroundColor: "rgba(0,0,0,0.32)",
            }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.82)",
                fontWeight: "900",
                fontSize: 11,
              }}
            >
              Unavailable
            </Text>
          </View>
        ) : null}

        {!hasPlayableVideo && hasPoster ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(0,0,0,0.28)",
            }}
          >
            <Text
              style={{
                color: "rgba(255,255,255,0.82)",
                fontWeight: "900",
                fontSize: 11,
              }}
            >
              Preview only
            </Text>
          </View>
        ) : null}

        {!shouldPlay && !err && hasPlayableVideo ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: "rgba(0,0,0,0.35)",
              }}
            >
              <Text
                style={{
                  color: "rgba(255,255,255,0.85)",
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                Tap to play
              </Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}