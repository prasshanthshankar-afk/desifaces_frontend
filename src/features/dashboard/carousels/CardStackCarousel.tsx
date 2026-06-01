import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

const SPRING = { damping: 20, stiffness: 190, mass: 0.9 };
const RETURN_SPRING = { damping: 24, stiffness: 210, mass: 0.85 };
const THROW_DURATION_MS = 150;

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

  fanOffsetX = 16,
  fanOffsetY = 8,
  fanScaleStep = 0.03,
  fanRotateBaseDeg = 3.2,
  fanRotateStepDeg = 1.05,

  showHint = true,
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
  onPressActiveIndex?: (index: number) => void;
  renderCard: (item: T, ctx: CardStackCarouselCtx) => React.ReactNode;
}) {
  const count = Array.isArray(data) ? data.length : 0;

  const [measuredW, setMeasuredW] = useState<number>(widthProp ?? 0);
  const width = widthProp ?? measuredW;

  const [activeIndex, setActiveIndex] = useState(0);

  const activeIndexSV = useSharedValue(0);
  const pulse = useSharedValue(1);
  const dragX = useSharedValue(0);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      if (widthProp) return;
      const w = e.nativeEvent.layout.width;
      if (w && Math.abs(w - measuredW) > 1) setMeasuredW(w);
    },
    [widthProp, measuredW]
  );

  useEffect(() => {
    if (count <= 0) {
      if (activeIndex !== 0) setActiveIndex(0);
      activeIndexSV.value = 0;
      dragX.value = 0;
      return;
    }

    if (activeIndex > count - 1) {
      const next = Math.max(0, count - 1);
      setActiveIndex(next);
      activeIndexSV.value = next;
      dragX.value = 0;
    }
  }, [count, activeIndex, activeIndexSV, dragX]);

  const cardWidth = useMemo(() => {
    if (!width) return 0;
    const reserved = Math.min(84, Math.max(0, peekCount) * fanOffsetX + 10);
    return Math.max(220, width - reserved);
  }, [width, peekCount, fanOffsetX]);

  const cardHeight = height;

  const goTo = useCallback(
    (next: number) => {
      if (count <= 0) return;
      const clamped = Math.max(0, Math.min(count - 1, next));
      setActiveIndex(clamped);
      activeIndexSV.value = clamped;
    },
    [count, activeIndexSV]
  );

  const goPrev = useCallback(() => goTo(activeIndex - 1), [activeIndex, goTo]);
  const goNext = useCallback(() => goTo(activeIndex + 1), [activeIndex, goTo]);

  const pan = useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-72, 72])
      .onUpdate((e) => {
        "worklet";
        const dx = Math.max(-cardWidth * 0.42, Math.min(cardWidth * 0.42, e.translationX));
        dragX.value = dx;
      })
      .onEnd((e) => {
        "worklet";
        if (count <= 1 || cardWidth <= 0) {
          dragX.value = withSpring(0, RETURN_SPRING);
          return;
        }

        const dx = e.translationX;
        const vx = e.velocityX;
        const threshold = Math.max(34, cardWidth * 0.12);

        const current = activeIndexSV.value;
        const wantsNext = dx < -threshold || vx < -460;
        const wantsPrev = dx > threshold || vx > 460;

        let nextIndex = current;
        let throwTo = 0;

        if (wantsNext && current < count - 1) {
          nextIndex = current + 1;
          throwTo = -cardWidth * 0.82;
        } else if (wantsPrev && current > 0) {
          nextIndex = current - 1;
          throwTo = cardWidth * 0.82;
        }

        if (nextIndex === current) {
          dragX.value = withSpring(0, RETURN_SPRING);
          return;
        }

        dragX.value = withTiming(throwTo, { duration: THROW_DURATION_MS }, (finished) => {
          if (!finished) return;
          runOnJS(goTo)(nextIndex);
          dragX.value = 0;
          pulse.value = 0;
          pulse.value = withSpring(1, SPRING);
        });
      })
      .onFinalize(() => {
        "worklet";
        if (Math.abs(dragX.value) < 2) {
          dragX.value = 0;
        }
      });
  }, [count, cardWidth, goTo, activeIndexSV, dragX, pulse]);

  const tap = useMemo(() => {
    const enabled = !!onPressActiveIndex;
    return Gesture.Tap()
      .enabled(enabled)
      .maxDistance(12)
      .maxDuration(240)
      .onEnd(() => {
        "worklet";
        if (!enabled) return;
        runOnJS(onPressActiveIndex!)(activeIndexSV.value);
      });
  }, [onPressActiveIndex, activeIndexSV]);

  const composed = useMemo(() => Gesture.Simultaneous(pan, tap), [pan, tap]);

  const visible = useMemo(() => {
    if (!count) return [] as Array<{ item: T; i: number }>;
    const start = Math.max(0, Math.min(count - 1, activeIndex));
    return data
      .slice(start, Math.min(count, start + 1 + peekCount))
      .map((item, i) => ({ item, i }));
  }, [data, activeIndex, count, peekCount]);

  const renderOrder = useMemo(() => [...visible].reverse(), [visible]);

  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < count - 1;

  if (!count) return null;

  return (
    <View onLayout={onLayout} style={[styles.root, { height, width: widthProp ?? "100%" }]}> 
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

      {count > 1 ? (
        <View pointerEvents="box-none" style={styles.navWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous card"
            disabled={!canGoPrev}
            hitSlop={10}
            onPress={goPrev}
            style={({ pressed }) => [
              styles.navButton,
              !canGoPrev && styles.navButtonDisabled,
              pressed && canGoPrev && styles.navButtonPressed,
            ]}
          >
            <Text style={styles.navText}>‹</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next card"
            disabled={!canGoNext}
            hitSlop={10}
            onPress={goNext}
            style={({ pressed }) => [
              styles.navButton,
              !canGoNext && styles.navButtonDisabled,
              pressed && canGoNext && styles.navButtonPressed,
            ]}
          >
            <Text style={styles.navText}>›</Text>
          </Pressable>
        </View>
      ) : null}
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
  pulse: SharedValue<number>;
  dragX: SharedValue<number>;
  isActive: boolean;
}) {
  const s = useAnimatedStyle(() => {
    const d = i;

    const shiftX = fanOffsetX * d;
    const shiftY = fanOffsetY * d;
    const baseScale = 1 - fanScaleStep * d;

    const rot = d === 0 ? 0 : (d % 2 === 0 ? 1 : -1) * (fanRotateBaseDeg + d * fanRotateStepDeg);
    const opacity = interpolate(d, [0, 5], [1, 0.78], Extrapolate.CLAMP);

    const popY = d === 0 ? interpolate(pulse.value, [0, 1], [8, 0], Extrapolate.CLAMP) : 0;
    const popS = d === 0 ? interpolate(pulse.value, [0, 1], [0.985, 1], Extrapolate.CLAMP) : 1;

    const dx = d === 0 ? dragX.value : 0;
    const dragRot = d === 0 ? interpolate(dx, [-160, 0, 160], [-3.2, 0, 3.2], Extrapolate.CLAMP) : 0;

    return {
      opacity,
      transform: [
        { translateX: shiftX + dx },
        { translateY: shiftY + popY },
        { scale: baseScale * popS },
        { rotate: `${rot + dragRot}deg` },
      ],
      zIndex: 100 - d,
      elevation: Math.max(1, 22 - d),
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
  root: {
    position: "relative",
  },
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
  navWrap: {
    position: "absolute",
    right: 8,
    bottom: 8,
    flexDirection: "row",
    gap: 8,
    zIndex: 1200,
    elevation: 1200,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  navButtonPressed: {
    transform: [{ scale: 0.96 }],
    backgroundColor: "rgba(0,0,0,0.58)",
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  navText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "900",
    marginTop: -2,
  },
});
