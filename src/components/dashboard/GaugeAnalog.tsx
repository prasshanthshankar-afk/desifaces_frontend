import React, { useMemo } from "react";
import { View, Text } from "react-native";
import Svg, { Circle, Line, Path, G } from "react-native-svg";

type Props = {
  title: string;
  value01: number;
  size?: number;
  accent?: string;
  minValueLabel?: string;
  maxValueLabel?: string;
  minMeaningLabel?: string;
  maxMeaningLabel?: string;
  valueLabel?: string;
};

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export default function GaugeAnalog({
  title,
  value01,
  size = 104,
  accent = "#D86CFF",
  minValueLabel = "0",
  maxValueLabel = "100",
  minMeaningLabel = "Low",
  maxMeaningLabel = "High",
  valueLabel,
}: Props) {
  const v = clamp01(value01);

  const stroke = Math.max(7, Math.round(size * 0.06));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const startDeg = -135;
  const endDeg = 135;

  const angle = startDeg + (endDeg - startDeg) * v;
  const rad = (angle * Math.PI) / 180;

  const needleLen = r * 0.8;
  const x2 = cx + needleLen * Math.cos(rad);
  const y2 = cy + needleLen * Math.sin(rad);

  const arcPath = useMemo(() => {
    const a0 = (startDeg * Math.PI) / 180;
    const a1 = (endDeg * Math.PI) / 180;

    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);

    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`;
  }, [cx, cy, r]);

  return (
    <View style={{ width: size, alignItems: "center" }}>
      <Text
        style={{
          color: "rgba(255,255,255,0.88)",
          fontWeight: "800",
          marginBottom: 6,
          fontSize: 11,
          letterSpacing: 0.25,
        }}
      >
        {title}
      </Text>

      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={"rgba(255,255,255,0.08)"}
            strokeWidth={stroke}
            fill={"rgba(255,255,255,0.02)"}
          />

          <Path
            d={arcPath}
            stroke={"rgba(255,255,255,0.16)"}
            strokeWidth={Math.max(4, Math.round(stroke * 0.52))}
            fill="none"
            strokeLinecap="round"
          />

          <G>
            <Line
              x1={cx}
              y1={cy}
              x2={x2}
              y2={y2}
              stroke={accent}
              strokeWidth={Math.max(2, Math.round(size * 0.018))}
              strokeLinecap="round"
            />
            <Circle
              cx={cx}
              cy={cy}
              r={Math.max(4, Math.round(size * 0.038))}
              fill={accent}
            />
            <Circle
              cx={cx}
              cy={cy}
              r={Math.max(2, Math.round(size * 0.022))}
              fill={"#0B0F14"}
            />
          </G>
        </Svg>

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            inset: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "rgba(255,255,255,0.96)",
              fontWeight: "900",
              fontSize: 15,
            }}
          >
            {valueLabel ?? `${Math.round(v * 100)}`}
          </Text>
        </View>

        {/* Bottom-left label inside dial */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 10,
            bottom: 10,
            alignItems: "flex-start",
            maxWidth: size * 0.32,
          }}
        >
          <Text
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: 9,
              fontWeight: "800",
            }}
          >
            {minValueLabel}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: "rgba(255,255,255,0.44)",
              fontSize: 8,
              fontWeight: "700",
            }}
          >
            {minMeaningLabel}
          </Text>
        </View>

        {/* Bottom-right label inside dial */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: 10,
            bottom: 10,
            alignItems: "flex-end",
            maxWidth: size * 0.32,
          }}
        >
          <Text
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: 9,
              fontWeight: "800",
            }}
          >
            {maxValueLabel}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: "rgba(255,255,255,0.44)",
              fontSize: 8,
              fontWeight: "700",
            }}
          >
            {maxMeaningLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}