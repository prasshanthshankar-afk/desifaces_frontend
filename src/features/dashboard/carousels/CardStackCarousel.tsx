import React, { useCallback, useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, LayoutChangeEvent } from "react-native";
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

const SPRING = { damping: 18, stiffness: 170, mass: 0.9 };

export type CardStackCarouselCtx = {
  width: number;
  height: number;
  index: number;
  isActive: boolean;
};

export function CardStackCarousel<T>({
  data,
  height,
  width: widthProp,
  peekCount = 4,

  // Fan style
  fanOffsetX = 16,
  fanOffsetY = 8,
  fanScaleStep = 0.03,
  fanRotateBaseDeg = 3.2,
  fanRotateStepDeg = 1.05,

  showHint = true,

  // ✅ Optional: deck-owned tap handler (safer than nested Pressables)
  // If provided, it will fire for the ACTIVE card index.
  onPressActiveIndex,

  renderCard,
}: {
  data: T[];
  height: number;
  width?: number;
  peekCount?: number;
  fanOffsetX?: number;
  fanOffsetY?: number;
  fanScaleStep?: number;
  fanRotateBaseDeg?: number;
  fanRotateStepDeg?: number;
  showHint?: boolean;

  // optional deck tap (index-based to avoid passing objects from UI thread)
  onPressActiveIndex?: (index: number) => void;

  renderCard: (item: T, ctx: CardStackCarouselCtx) => React.ReactNode;
}) {
  const count = Array.isArray(data) ? data.length : 0;

  const [measuredW, setMeasuredW] = useState<number>(widthProp ?? 0);
  const width = widthProp ?? measuredW;

  const [activeIndex, setActiveIndex] = useState(0);

  // UI-thread source of truth
  const activeIndexSV = useSharedValue(0);

  // Small “pop” when index changes
  const pulse = useSharedValue(1);

  // Interactive drag for top card
  const dragX = useSharedValue(0);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (widthProp) return;
      const w = e.nativeEvent.layout.width;
      if (w && Math.abs(w - measuredW) > 1) setMeasuredW(w);
    },
    [widthProp, measuredW]
  );

  // ✅ When data shrinks, clamp index so we never point outside array
  useEffect(() => {
    if (count <= 0) {
      if (activeIndex !== 0) setActiveIndex(0);
      activeIndexSV.value = 0;
      return;
    }
    if (activeIndex > count - 1) {
      const n = Math.max(0, count - 1);
      setActiveIndex(n);
      activeIndexSV.value = n;
    }
  }, [count, activeIndex, activeIndexSV]);

  // Reserve right-side room so peeks show
  const cardWidth = useMemo(() => {
    if (!width) return 0;
    const reserved = Math.min(84, Math.max(0, peekCount) * fanOffsetX + 10);
    return Math.max(220, width - reserved);
  }, [width, peekCount, fanOffsetX]);

  const cardHeight = height;

  const goTo = useCallback(
    (next: number) => {
      if (count <= 0) return;
      const n = Math.max(0, Math.min(count - 1, next));
      setActiveIndex(n);
      activeIndexSV.value = n;
    },
    [count, activeIndexSV]
  );

  const pan = useMemo(() => {
    return Gesture.Pan()
      // ✅ easier swipe: small horizontal motion triggers
      .activeOffsetX([-10, 10])
      // ✅ allow more vertical wiggle inside ScrollView
      .failOffsetY([-40, 40])
      .onUpdate((e) => {
        "worklet";
        const dx = Math.max(-120, Math.min(120, e.translationX));
        dragX.value = dx;
      })
      .onEnd((e) => {
        "worklet";
        if (count <= 1) {
          dragX.value = withSpring(0, SPRING);
          return;
        }

        const dx = e.translationX;
        const vx = e.velocityX;

        const goNext = dx < -28 || vx < -520;
        const goPrev = dx > 28 || vx > 520;

        const cur = activeIndexSV.value;
        let nextIndex = cur;

        if (goNext) nextIndex = Math.min(count - 1, cur + 1);
        if (goPrev) nextIndex = Math.max(0, cur - 1);

        dragX.value = withSpring(0, SPRING);

        if (nextIndex !== cur) {
          pulse.value = 0;
          pulse.value = withSpring(1, SPRING);
          runOnJS(goTo)(nextIndex);
        }
      })
      .onFinalize(() => {
        "worklet";
        dragX.value = withSpring(0, SPRING);
      });
  }, [count, goTo, activeIndexSV, dragX, pulse]);

  // ✅ Optional deck tap gesture (only if caller provides handler)
  const tap = useMemo(() => {
    const enabled = !!onPressActiveIndex;
    return Gesture.Tap()
      .enabled(enabled)
      .maxDistance(14)
      .maxDuration(250)
      .onEnd(() => {
        "worklet";
        if (!enabled) return;
        runOnJS(onPressActiveIndex!)(activeIndexSV.value);
      });
  }, [onPressActiveIndex, activeIndexSV]);

  const composed = useMemo(() => Gesture.Simultaneous(pan, tap), [pan, tap]);

  if (!count) return null;

  const visible = useMemo(() => {
    const start = Math.max(0, Math.min(count - 1, activeIndex));
    return data.slice(start, Math.min(count, start + 1 + peekCount));
  }, [data, activeIndex, count, peekCount]);

  // Render back cards first, active last (top)
  const renderOrder = useMemo(() => {
    const arr = visible.map((item, i) => ({ item, i }));
    return arr.reverse();
  }, [visible]);

  return (
    <View onLayout={onLayout} style={{ height, width: widthProp ?? "100%" }}>
      <GestureDetector gesture={composed}>
        <View style={[styles.stackWrap, { height, width: widthProp ?? "100%" }]}>
          {width > 0 &&
            renderOrder.map(({ item, i }) => (
              <DeckCard
                key={`deck-${activeIndex + i}`}
                i={i}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                fanOffsetX={fanOffsetX}
                fanOffsetY={fanOffsetY}
                fanScaleStep={fanScaleStep}
                fanRotateBaseDeg={fanRotateBaseDeg}
                fanRotateStepDeg={fanRotateStepDeg}
                pulse={pulse}
                dragX={dragX}
                isActive={i === 0}
              >
                <View style={{ flex: 1 }}>
                  {renderCard(item, {
                    width: cardWidth,
                    height: cardHeight,
                    index: activeIndex + i,
                    isActive: i === 0,
                  })}
                </View>
              </DeckCard>
            ))}

          {showHint && count > 1 ? (
            <View pointerEvents="none" style={styles.hintWrap}>
              <Text style={styles.hintText}>Swipe</Text>
              <Text style={styles.hintArrows}>‹   ›</Text>
            </View>
          ) : null}

          {count > 1 ? (
            <View pointerEvents="none" style={styles.countPill}>
              <Text style={styles.countText}>
                {activeIndex + 1}/{count}
              </Text>
            </View>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
}

function DeckCard({
  children,
  i,
  cardWidth,
  cardHeight,
  fanOffsetX,
  fanOffsetY,
  fanScaleStep,
  fanRotateBaseDeg,
  fanRotateStepDeg,
  pulse,
  dragX,
  isActive,
}: {
  children: React.ReactNode;
  i: number;
  cardWidth: number;
  cardHeight: number;
  fanOffsetX: number;
  fanOffsetY: number;
  fanScaleStep: number;
  fanRotateBaseDeg: number;
  fanRotateStepDeg: number;
  pulse: Animated.SharedValue<number>;
  dragX: Animated.SharedValue<number>;
  isActive: boolean;
}) {
  const s = useAnimatedStyle(() => {
    const d = i;

    const shiftX = fanOffsetX * d;
    const shiftY = fanOffsetY * d;

    const baseScale = 1 - fanScaleStep * d;

    const rot =
      d === 0 ? 0 : (d % 2 === 0 ? 1 : -1) * (fanRotateBaseDeg + d * fanRotateStepDeg);

    const opacity = interpolate(d, [0, 5], [1, 0.78], Extrapolate.CLAMP);

    const popY = d === 0 ? interpolate(pulse.value, [0, 1], [10, 0], Extrapolate.CLAMP) : 0;
    const popS = d === 0 ? interpolate(pulse.value, [0, 1], [0.985, 1], Extrapolate.CLAMP) : 1;

    const dx = d === 0 ? dragX.value : 0;
    const dragRot =
      d === 0 ? interpolate(dx, [-120, 0, 120], [-2.4, 0, 2.4], Extrapolate.CLAMP) : 0;

    const z = 100 - d;
    const elev = Math.max(1, 22 - d);

    return {
      opacity,
      transform: [
        { translateX: shiftX + dx },
        { translateY: shiftY + popY },
        { scale: baseScale * popS },
        { rotate: `${rot + dragRot}deg` },
      ],
      zIndex: z,
      elevation: elev,
    } as any;
  });

  return (
    <Animated.View
      pointerEvents={isActive ? "auto" : "none"}
      style={[
        styles.cardAbs,
        s,
        {
          width: cardWidth,
          height: cardHeight,
        },
      ]}
    >
      <View style={{ flex: 1 }}>{children}</View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stackWrap: {
    position: "relative",
    overflow: "hidden",
  },
  cardAbs: {
    position: "absolute",
    top: 0,
    left: 0,
  },

  hintWrap: {
    position: "absolute",
    right: 10,
    top: 10,
    alignItems: "flex-end",
    zIndex: 999,
    elevation: 999,
  },
  hintText: {
    fontSize: 11,
    fontWeight: "900",
    color: "rgba(255,255,255,0.75)",
  },
  hintArrows: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "900",
    color: "rgba(255,255,255,0.70)",
    letterSpacing: 2,
  },
  countPill: {
    position: "absolute",
    left: 10,
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    zIndex: 999,
    elevation: 999,
  },
  countText: {
    fontSize: 11,
    fontWeight: "900",
    color: "rgba(255,255,255,0.90)",
  },
});