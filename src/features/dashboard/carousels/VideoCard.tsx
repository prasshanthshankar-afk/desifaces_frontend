import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
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

let ExpoVideo: any = null;
let ExpoCore: any = null;

try {
  ExpoVideo = require("expo-video");
  ExpoCore = require("expo");
} catch (error) {
  console.warn("[VideoCard] expo-video unavailable; using poster fallback", error);
}

function NativeVideoCard({
  rawVideoUrl,
  posterUrl,
  safeCtx,
}: {
  rawVideoUrl: string;
  posterUrl: string;
  safeCtx: RenderCardCtx;
}) {
  const [ready, setReady] = useState(false);

  const hasPlayableVideo = looksLikePlayableVideoUrl(rawVideoUrl);
  const hasPoster = !!posterUrl;
  const shouldPlay = !!safeCtx.isTop && !!safeCtx.playing && hasPlayableVideo;

  const player = ExpoVideo.useVideoPlayer(hasPlayableVideo ? rawVideoUrl : null, (instance: any) => {
    instance.loop = true;
    instance.muted = true;
    instance.staysActiveInBackground = false;
  });

  ExpoCore.useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  useEffect(() => {
    setReady(false);
    try {
      player.pause();
      player.currentTime = 0;
    } catch {}
  }, [rawVideoUrl, player]);

  useEffect(() => {
    try {
      if (shouldPlay) {
        player.play();
      } else {
        player.pause();
        player.currentTime = 0;
      }
    } catch {}
  }, [player, shouldPlay]);

  const showPoster = hasPoster && (!shouldPlay || !ready);

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
      <View
        style={{
          flex: 1,
          borderRadius: 18,
          overflow: "hidden",
          backgroundColor: "#0E0F14",
        }}
      >
        {hasPlayableVideo ? (
          <ExpoVideo.VideoView
            player={player}
            style={{ width: "100%", height: "100%" }}
            nativeControls={false}
            contentFit="cover"
            onFirstFrameRender={() => {
              setReady(true);
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

        {hasPlayableVideo && !ready && !hasPoster ? (
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

        {!shouldPlay && hasPlayableVideo ? (
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

        {shouldPlay && !ready ? (
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
              Loading
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function FallbackVideoCard({
  posterUrl,
  safeCtx,
}: {
  posterUrl: string;
  safeCtx: RenderCardCtx;
}) {
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
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <Text
            style={{
              color: "rgba(255,255,255,0.82)",
              fontWeight: "800",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Video preview unavailable
          </Text>
        </View>
      )}

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
    </View>
  );
}

export default function VideoCard({
  item,
  ctx,
}: {
  item: ThumbFanItem;
  ctx?: RenderCardCtx;
}) {
  const rawVideoUrl = useMemo(() => pickVideoUrl(item), [item]);
  const posterUrl = useMemo(() => pickPosterUrl(item), [item]);
  const safeCtx = ctx ?? FALLBACK_CTX;

  if (!ExpoVideo || !ExpoCore) {
    return <FallbackVideoCard posterUrl={posterUrl} safeCtx={safeCtx} />;
  }

  return <NativeVideoCard rawVideoUrl={rawVideoUrl} posterUrl={posterUrl} safeCtx={safeCtx} />;
}
