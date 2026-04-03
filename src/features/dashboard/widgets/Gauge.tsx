import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { DF } from "../../../core/theme/colors";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function Gauge({
  title,
  value01,
  accent,
  subtitle,
}: {
  title: string;      // KPI name (e.g. Credits, Active Jobs)
  value01: number;    // normalized 0..1
  accent: string;     // DF.halo / DF.ember / DF.gold etc
  subtitle?: string;  // small helper label (e.g. "balance", "running")
}) {
  const size = 118;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  const vClamped = Math.max(0, Math.min(1, value01));

  // Animated needle/progress value
  const vAnim = useRef(new Animated.Value(vClamped)).current;
  const [pct, setPct] = useState(Math.round(vClamped * 100));

  useEffect(() => {
    // Smooth needle motion
    Animated.timing(vAnim, {
      toValue: vClamped,
      duration: 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // required for SVG props
    }).start();
  }, [vClamped, vAnim]);

  useEffect(() => {
    // Drive center percentage text from animated value (so it “ticks” smoothly)
    const id = vAnim.addListener(({ value }) => {
      setPct(Math.round(Math.max(0, Math.min(1, value)) * 100));
    });
    return () => vAnim.removeListener(id);
  }, [vAnim]);

  // SVG ring dashoffset animated from vAnim
  const dashOffset = useMemo(() => {
    // dash = c * (1 - v)
    return Animated.multiply(Animated.subtract(1, vAnim), c);
  }, [c, vAnim]);

  // Needle rotation: -135deg .. +135deg (car-like sweep)
  const needleRotate = useMemo(() => {
    return vAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ["-135deg", "135deg"],
      extrapolate: "clamp",
    });
  }, [vAnim]);

  const gradId = useMemo(
    () => `g_${title.replace(/\s+/g, "_").toLowerCase()}`,
    [title]
  );

  return (
    <View style={styles.shell}>
      <Text numberOfLines={1} style={styles.kicker}>
        {title}
      </Text>

      <View style={styles.ringWrap}>
        {/* glow */}
        <View style={[styles.glow, { shadowColor: accent }]} />

        {/* SVG ring */}
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={accent} stopOpacity={0.98} />
              <Stop offset="100%" stopColor="#FFF2E6" stopOpacity={0.18} />
            </LinearGradient>
          </Defs>

          {/* track */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={DF.border}
            strokeWidth={stroke}
            fill="transparent"
          />

          {/* progress */}
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            fill="transparent"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={dashOffset as any}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />

          {/* inner subtle ring */}
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r - 16}
            stroke="rgba(255,180,90,0.14)"
            strokeWidth={2}
            fill="transparent"
          />
        </Svg>

        {/* Needle (pure RN View for stability) */}
        <View style={styles.needleStage} pointerEvents="none">
          <Animated.View style={[styles.needleWrap, { transform: [{ rotate: needleRotate }] }]}>
            <View style={[styles.needle, { backgroundColor: accent }]} />
          </Animated.View>

          {/* hub */}
          <View style={styles.hubOuter} />
          <View style={[styles.hubInner, { borderColor: accent }]} />
        </View>

        {/* Center value */}
        <View style={styles.center}>
          <Text style={styles.value}>{pct}</Text>
          <Text style={styles.unit}>%</Text>
        </View>
      </View>

      {!!subtitle && (
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: 128,
    height: 168,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DF.border,
    backgroundColor: DF.card,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 10,
    paddingBottom: 10,
  },
  kicker: {
    color: "rgba(255,225,200,0.78)",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.35,
    marginBottom: 8,
    textTransform: "uppercase",
  },

  ringWrap: {
    width: 118,
    height: 118,
    alignItems: "center",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 84,
    height: 84,
    borderRadius: 42,
    opacity: 0.9,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },

  // Needle overlay (stable)
  needleStage: {
    position: "absolute",
    width: 118,
    height: 118,
    alignItems: "center",
    justifyContent: "center",
  },
  needleWrap: {
    position: "absolute",
    width: 118,
    height: 118,
    alignItems: "center",
    justifyContent: "center",
  },
  needle: {
    position: "absolute",
    width: 2.5,
    height: 44,
    borderRadius: 2,
    top: 16, // start near top, like a real dial
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  hubOuter: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,180,90,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,180,90,0.22)",
  },
  hubInner: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "rgba(18,11,10,0.85)",
    borderWidth: 2,
  },

  center: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  value: {
    color: DF.text,
    fontWeight: "900",
    fontSize: 28,
    letterSpacing: 0.4,
  },
  unit: {
    color: DF.muted,
    fontWeight: "900",
    fontSize: 12,
    marginLeft: 4,
    marginTop: 10,
  },

  subtitle: {
    color: DF.muted,
    fontSize: 11,
    marginTop: 8,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});