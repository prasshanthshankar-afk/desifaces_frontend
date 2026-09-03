import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { DF } from "../theme/colors";

// V3 convergence rule: Story/Multi-person uses the same desifaces typography
// hierarchy and default app font as the established single-studio experience.
// Do not introduce a separate Story font family or oversized V3 hierarchy here.
export const STUDIO = {
  bg: (DF as any)?.night ?? "#0E0F14",
  surface: (DF as any)?.night2 ?? "#141824",
  surfaceSoft: "rgba(255,255,255,0.035)",
  raised: "#181D28",
  text: (DF as any)?.text ?? "#FFFFFF",
  muted: (DF as any)?.muted ?? "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.40)",
  border: (DF as any)?.border ?? "rgba(255,255,255,0.09)",
  accent: "#F8B848",
  accentText: "#FFE0A2",
  accentFill: "rgba(248,184,72,0.10)",
  accentBorder: "rgba(248,184,72,0.30)",
  danger: "#FF7B86",
  success: "#43D17B",
};

export function useStudioViewport() {
  const { width, height } = useWindowDimensions();
  const compact = width < 390;
  const wide = width >= 700;
  const veryWide = width >= 980;

  return {
    width,
    height,
    compact,
    wide,
    veryWide,
    contentMaxWidth: veryWide ? 1180 : wide ? 980 : 760,
    horizontalPadding: compact ? 10 : 14,
    mediaSize: veryWide ? 152 : wide ? 140 : compact ? 92 : 110,
    actionWidth: veryWide ? 136 : wide ? 124 : compact ? 96 : 104,
  };
}

export function StudioHero({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.heroRow}>
      <View style={styles.heroText}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.heroRight}>{right}</View> : null}
    </View>
  );
}

export function Surface({
  children,
  style,
  accent,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accent?: boolean;
}) {
  return (
    <View style={[styles.surface, accent && styles.surfaceAccent, style]}>
      {children}
    </View>
  );
}

export function StatusPill({
  value,
  tone = "neutral",
}: {
  value: string;
  tone?: "neutral" | "accent" | "success" | "danger";
}) {
  return (
    <View
      style={[
        styles.statusPill,
        tone === "accent" && styles.statusPillAccent,
        tone === "success" && styles.statusPillSuccess,
        tone === "danger" && styles.statusPillDanger,
      ]}
    >
      <Text
        style={[
          styles.statusText,
          tone === "accent" && styles.statusTextAccent,
          tone === "success" && styles.statusTextSuccess,
          tone === "danger" && styles.statusTextDanger,
        ]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export function CompactButton({
  label,
  onPress,
  disabled,
  tone = "secondary",
  fill = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
  fill?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        fill && styles.buttonFill,
        tone === "primary" && styles.buttonPrimary,
        tone === "danger" && styles.buttonDanger,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          tone === "primary" && styles.buttonTextPrimary,
          tone === "danger" && styles.buttonTextDanger,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ProgressLine({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label?: string;
}) {
  const progress = total > 0 ? Math.max(0, Math.min(100, (current / total) * 100)) : 0;
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressHead}>
        <Text style={styles.progressLabel}>{label || "Progress"}</Text>
        <Text style={styles.progressCount}>{current}/{total}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
      </View>
    </View>
  );
}

export function SectionLabel({ title, meta }: { title: string; meta?: string | null }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function humanState(value: unknown) {
  return String(value || "pending")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 2,
  },
  heroText: { flex: 1, minWidth: 220, gap: 4 },
  heroRight: { flexShrink: 0, alignSelf: "flex-start", minWidth: 110 },
  eyebrow: {
    color: STUDIO.accentText,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.55,
  },
  title: {
    color: STUDIO.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
    letterSpacing: -0.15,
  },
  subtitle: {
    color: STUDIO.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    maxWidth: 720,
  },
  surface: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surface,
    padding: 12,
  },
  surfaceAccent: {
    borderColor: STUDIO.accentBorder,
    backgroundColor: STUDIO.accentFill,
  },
  statusPill: {
    alignSelf: "flex-start",
    minHeight: 26,
    maxWidth: "100%",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusPillAccent: { borderColor: STUDIO.accentBorder, backgroundColor: STUDIO.accentFill },
  statusPillSuccess: { borderColor: "rgba(67,209,123,0.35)", backgroundColor: "rgba(67,209,123,0.09)" },
  statusPillDanger: { borderColor: "rgba(255,123,134,0.32)", backgroundColor: "rgba(255,123,134,0.08)" },
  statusText: { color: "rgba(255,255,255,0.74)", fontSize: 10, lineHeight: 14, fontWeight: "900", textAlign: "center" },
  statusTextAccent: { color: STUDIO.accentText },
  statusTextSuccess: { color: "#A8F1C4" },
  statusTextDanger: { color: "#FFC0C6" },
  button: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.035)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  buttonFill: { width: "100%" },
  buttonPrimary: { borderColor: STUDIO.accentBorder, backgroundColor: "rgba(248,184,72,0.18)" },
  buttonDanger: { borderColor: "rgba(255,123,134,0.28)", backgroundColor: "rgba(255,123,134,0.07)" },
  buttonText: { color: "rgba(255,255,255,0.88)", fontSize: 12, lineHeight: 16, fontWeight: "900", textAlign: "center" },
  buttonTextPrimary: { color: STUDIO.accentText },
  buttonTextDanger: { color: "#FFC0C6" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  progressWrap: { gap: 5, minWidth: 110 },
  progressHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  progressLabel: { color: STUDIO.muted, fontSize: 11, lineHeight: 15, fontWeight: "800" },
  progressCount: { color: STUDIO.accentText, fontSize: 11, lineHeight: 15, fontWeight: "900" },
  progressTrack: { height: 4, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 99, backgroundColor: STUDIO.accent },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  sectionTitle: { flexShrink: 1, color: STUDIO.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  sectionMeta: { flexShrink: 1, color: STUDIO.muted, fontSize: 11, lineHeight: 15, fontWeight: "800", textAlign: "right" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.06)" },
});
