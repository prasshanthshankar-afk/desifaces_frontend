import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Pressable,
  Platform,
} from "react-native";

export type MediaKind = "image" | "video";

export type ThumbFanItem = {
  id: string;
  kind: MediaKind;
  url: string;
  title?: string;
  subtitle?: string;
  meta?: any;
};

export type RenderCardCtx = {
  isTop: boolean;
  playing: boolean;
  togglePlay: () => void;
  cardW: number;
  cardH: number;
};

type Props = {
  items: ThumbFanItem[];
  height?: number;
  width?: number;
  fanCount?: number;
  label?: string;
  renderCard: (item: ThumbFanItem, ctx: RenderCardCtx) => React.ReactNode;
  onPressItem?: (item: ThumbFanItem) => void;
  onIndexChange?: (index: number) => void;
  enableOuterPress?: boolean;
  loop?: boolean;
};

const { width: SCREEN_W } = Dimensions.get("window");

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function ThumbFanDeckCarousel({
  items,
  height,
  width,
  fanCount = 4,
  label,
  renderCard,
  onPressItem,
  onIndexChange,
  enableOuterPress = true,
  loop = true,
}: Props) {
  const cardW = width ?? clamp(SCREEN_W * 0.66, 190, 300);
  const cardH = height ?? Math.round(cardW * 1.18);
  const compact = cardW <= 170;

  const [index, setIndex] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const didDragRef = useRef(false);

  const hasItems = items?.length > 0;

  useEffect(() => {
    if (!items?.length) setIndex(0);
    else setIndex((prev) => clamp(prev, 0, items.length - 1));
  }, [items?.length]);

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  const visible = useMemo(() => {
    if (!hasItems) return [];
    const n = Math.max(1, Math.min(fanCount, items.length));
    const out: ThumbFanItem[] = [];
    for (let i = 0; i < n; i++) {
      const idx = loop
        ? (index + i) % items.length
        : clamp(index + i, 0, items.length - 1);
      out.push(items[idx]);
    }
    return out;
  }, [items, index, fanCount, hasItems, loop]);

  const SWIPE_THRESHOLD = Math.max(42, cardW * 0.16);

  const rotate = pan.x.interpolate({
    inputRange: [-cardW, 0, cardW],
    outputRange: ["-8deg", "0deg", "8deg"],
  });

  function goNext() {
    setPlayingId(null);
    setIndex((prev) => {
      if (!items.length) return 0;
      const next = prev + 1;
      return loop ? next % items.length : clamp(next, 0, items.length - 1);
    });
  }

  function goPrev() {
    setPlayingId(null);
    setIndex((prev) => {
      if (!items.length) return 0;
      const next = prev - 1;
      return loop
        ? (next + items.length) % items.length
        : clamp(next, 0, items.length - 1);
    });
  }

  function resetPan() {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
      friction: 7,
      tension: 60,
    }).start();
  }

  function swipeOut(dir: "left" | "right") {
    setPlayingId(null);
    const toX = dir === "right" ? cardW * 1.25 : -cardW * 1.25;

    Animated.timing(pan, {
      toValue: { x: toX, y: 0 },
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      didDragRef.current = false;

      if (dir === "left") goNext();
      else goPrev();
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_evt, g) => {
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        return ax > 4 && ax > ay;
      },
      onMoveShouldSetPanResponder: (_evt, g) => {
        const ax = Math.abs(g.dx);
        const ay = Math.abs(g.dy);
        return ax > 4 && ax > ay;
      },
      onPanResponderGrant: () => {
        didDragRef.current = false;
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (_evt, g) => {
        pan.setValue({ x: g.dx, y: g.dy });

        if (!didDragRef.current) {
          if (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6) {
            didDragRef.current = true;
          }
        }
      },
      onPanResponderRelease: (_evt, g) => {
        const dx = g.dx;

        if (dx > SWIPE_THRESHOLD) swipeOut("right");
        else if (dx < -SWIPE_THRESHOLD) swipeOut("left");
        else resetPan();
      },
      onPanResponderTerminate: () => resetPan(),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const stackOffsetX = compact ? 8 : 12;
  const stackOffsetY = compact ? 3 : 5;
  const baseLeft = compact ? 10 : 18;
  const trayWidth = cardW + (compact ? 30 : 54);

  if (!hasItems) {
    return (
      <View style={[styles.shell, { height: cardH + 14 }]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={[styles.empty, { width: cardW, height: cardH }]}>
          <Text style={styles.emptyText}>No items yet</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.shell, { height: cardH + (label ? 18 : 8) }]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={{ width: trayWidth, height: cardH, alignSelf: "center" }}>
        {visible
          .slice()
          .reverse()
          .map((item, revIdx) => {
            const i = visible.length - 1 - revIdx;
            const isTop = i === 0;

            const offsetX = i * stackOffsetX;
            const offsetY = i * stackOffsetY;
            const rot = `${i * 1.35}deg`;
            const scale = 1 - i * (compact ? 0.02 : 0.025);

            const baseStyle = {
              width: cardW,
              height: cardH,
              position: "absolute" as const,
              left: baseLeft + offsetX,
              top: offsetY,
              zIndex: 100 - i,
              ...(Platform.OS === "android" ? { elevation: 10 - i } : null),
              transform: [{ rotateZ: rot }, { scale }],
            };

            const topStyle = isTop
              ? {
                  transform: [
                    { translateX: pan.x },
                    {
                      translateY: pan.y.interpolate({
                        inputRange: [-50, 0, 50],
                        outputRange: [-6, 0, 6],
                      }),
                    },
                    { rotateZ: rotate as any },
                    { scale: 1 },
                  ],
                }
              : null;

            const ctx: RenderCardCtx = {
              isTop,
              playing: playingId === item.id,
              togglePlay: () =>
                setPlayingId((prev) => (prev === item.id ? null : item.id)),
              cardW,
              cardH,
            };

            const content = renderCard(item, ctx);
            const panHandlers = isTop ? panResponder.panHandlers : {};

            return (
              <Animated.View
                key={item.id}
                style={[styles.card, baseStyle, isTop ? topStyle : null]}
                {...panHandlers}
              >
                {enableOuterPress ? (
                  <Pressable
                    style={{ flex: 1 }}
                    onPress={() => {
                      if (didDragRef.current) {
                        didDragRef.current = false;
                        return;
                      }
                      if (item.kind === "video") ctx.togglePlay();
                      onPressItem?.(item);
                    }}
                  >
                    {content}
                  </Pressable>
                ) : (
                  <View style={{ flex: 1 }}>{content}</View>
                )}
              </Animated.View>
            );
          })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { width: "100%" },
  label: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 6,
    marginBottom: 6,
  },
  card: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  empty: {
    alignSelf: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "600",
  },
});