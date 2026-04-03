import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Line, Circle } from "react-native-svg";

const DF = {
  bg: "#080808",
  surface: "#180808",
  text: "#F8E888",
  text2: "#F8D868",
  gold: "#E89838",
  goldBright: "#F8B848",
  border: "rgba(248,184,72,0.16)",
};

export default function GaugeMini({
  title,
  value, // 0-100
  left,
  right,
}: {
  title: string;
  value: number;
  left: string;
  right: string;
}) {
  const size = 70;
  const r = size / 2;
  const cx = r;
  const cy = r;

  const startAngle = -200;
  const endAngle = 20;
  const norm = clamp(value / 100, 0, 1);
  const progAngle = startAngle + (endAngle - startAngle) * norm;

  const arcOuter = arcPath(cx, cy, r * 0.70, startAngle, endAngle);
  const arcProg = arcPath(cx, cy, r * 0.70, startAngle, progAngle);

  const needleStart = polar(cx, cy, r * 0.15, progAngle);
  const needleEnd = polar(cx, cy, r * 0.62, progAngle);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Svg width={size} height={size}>
        <Path d={arcOuter} stroke="rgba(248,184,72,0.18)" strokeWidth={7} fill="none" strokeLinecap="round" />
        <Path d={arcProg} stroke="rgba(248,184,72,0.75)" strokeWidth={7} fill="none" strokeLinecap="round" />

        <Line x1={needleStart.x} y1={needleStart.y} x2={needleEnd.x} y2={needleEnd.y} stroke="rgba(248,184,72,0.92)" strokeWidth={2.2} />
        <Circle cx={cx} cy={cy} r={r * 0.06} fill="rgba(248,184,72,0.85)" />

        {/* End labels */}
        <MiniLabel x={cx - r * 0.62} y={cy + r * 0.48} text={left} />
        <MiniLabel x={cx + r * 0.62} y={cy + r * 0.48} text={right} />
      </Svg>

      <Text style={styles.value}>{Math.round(value)}%</Text>
    </View>
  );
}

function MiniLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    // SVG Text is annoying to style consistently; use a tiny overlay in parent if you want.
    // Here we omit labels inside SVG to keep it robust.
    null
  );
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function polar(cx: number, cy: number, radius: number, angleDeg: number) {
  const a = (Math.PI / 180) * angleDeg;
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polar(cx, cy, radius, startAngle);
  const end = polar(cx, cy, radius, endAngle);
  const largeArcFlag = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`;
}

const styles = StyleSheet.create({
  wrap: {
    width: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "rgba(248,216,104,0.55)",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  value: {
    marginTop: 6,
    color: "rgba(248,232,136,1)",
    fontWeight: "900",
    fontSize: 12,
  },
});