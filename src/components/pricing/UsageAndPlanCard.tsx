import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Radii, Shadows, Spacing } from "../../../constants/theme";

type Props = {
  planName: string;
  monthLabel: string;
  totalUsagePercent?: number;
  walletBalance?: string;
  monthlySpend?: string;
  reservedAmount?: string;
  includedUsageLabel?: string;
  billingModeLabel?: string;
  entitlementNote?: string;
  onPressManage?: () => void;
};

type ProgressDisplay = {
  percent: number;
  suffix: string;
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function roundPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function formatPercent(value: number) {
  const rounded = roundPercent(value);
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded.toFixed(1)}`;
}

function firstNumber(value?: string | null): number | null {
  if (!value) return null;
  const match = String(value)
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function includedAvailableAndTotal(
  value?: string | null,
): { available: number; total: number } | null {
  if (!value) return null;
  const match = String(value)
    .replace(/,/g, "")
    .match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const available = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(available) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return { available: Math.max(0, available), total };
}

function deriveProgressDisplay({
  totalUsagePercent,
  includedUsageLabel,
  reservedAmount,
}: {
  totalUsagePercent?: number;
  includedUsageLabel?: string;
  reservedAmount?: string;
}): ProgressDisplay {
  const explicitPercent = clampPercent(Number(totalUsagePercent ?? 0));
  if (explicitPercent > 0) {
    return {
      percent: explicitPercent,
      suffix: `${formatPercent(explicitPercent)}% used`,
    };
  }

  const included = includedAvailableAndTotal(includedUsageLabel);
  if (included) {
    const unavailable = Math.max(0, included.total - included.available);
    const derivedPercent = clampPercent((unavailable / included.total) * 100);
    if (derivedPercent > 0) {
      const reservedCredits = Math.max(0, firstNumber(reservedAmount) ?? 0);
      const suffixLabel =
        reservedCredits > 0 && unavailable <= reservedCredits + 0.5
          ? "reserved"
          : reservedCredits > 0
            ? "used / reserved"
            : "used";

      return {
        percent: derivedPercent,
        suffix: `${formatPercent(derivedPercent)}% ${suffixLabel}`,
      };
    }
  }

  return { percent: 0, suffix: "0% used" };
}

function Stat({ label, value }: { label: string; value: string }) {
  const safeValue =
    String(value || "—")
      .replace(/\s+/g, " ")
      .trim() || "—";

  return (
    <View style={styles.statCard}>
      <Text
        style={styles.statLabel}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.86}
        maxFontSizeMultiplier={1.05}
      >
        {label}
      </Text>
      <Text
        style={styles.statValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.68}
        maxFontSizeMultiplier={1.05}
      >
        {safeValue}
      </Text>
    </View>
  );
}

export function UsageAndPlanCard({
  planName,
  monthLabel,
  totalUsagePercent = 0,
  walletBalance,
  monthlySpend,
  reservedAmount,
  includedUsageLabel,
  billingModeLabel,
  entitlementNote,
  onPressManage,
}: Props) {
  const progress = useMemo(
    () =>
      deriveProgressDisplay({
        totalUsagePercent,
        includedUsageLabel,
        reservedAmount,
      }),
    [totalUsagePercent, includedUsageLabel, reservedAmount],
  );
  const safePercent = clampPercent(progress.percent);
  const fillFlex = safePercent <= 0 ? 0 : Math.min(100, Math.max(4, safePercent));
  const restFlex = Math.max(0, 100 - fillFlex);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            Plan & usage
          </Text>
          <Text
            style={styles.subtitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {planName}
          </Text>
        </View>

        {!!onPressManage && (
          <Pressable
            onPress={onPressManage}
            style={styles.manageBtn}
            accessibilityRole="button"
          >
            <Text style={styles.manageText} numberOfLines={1}>
              Manage
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.progressTrack}>
        {fillFlex > 0 ? (
          <View style={[styles.progressFill, { flex: fillFlex }]} />
        ) : null}
        {restFlex > 0 ? <View style={{ flex: restFlex }} /> : null}
      </View>
      <Text
        style={styles.progressLabel}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {monthLabel} · {progress.suffix}
      </Text>

      {!!entitlementNote && (
        <View style={styles.noteWrap}>
          <Text style={styles.noteText}>{entitlementNote}</Text>
        </View>
      )}

      <View style={styles.statsGrid}>
        <Stat label="Included" value={includedUsageLabel || "—"} />
        <Stat label="Wallet" value={walletBalance || "—"} />
        <Stat label="This month" value={monthlySpend || "—"} />
        <Stat label="Reserved" value={reservedAmount || "—"} />
      </View>

      {!!billingModeLabel && (
        <View style={styles.modePill}>
          <Text
            style={styles.modePillText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {billingModeLabel}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.dark.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    includeFontPadding: false,
  },
  subtitle: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 4,
    includeFontPadding: false,
  },
  manageBtn: {
    borderRadius: Radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.22)",
    backgroundColor: "rgba(248,184,72,0.12)",
    flexShrink: 0,
  },
  manageText: {
    color: Colors.dark.tintSoft,
    fontSize: 12,
    fontWeight: "700",
    includeFontPadding: false,
  },
  progressTrack: {
    height: 10,
    borderRadius: Radii.pill,
    backgroundColor: "rgba(248,232,136,0.10)",
    overflow: "hidden",
    marginTop: 14,
    flexDirection: "row",
  },
  progressFill: {
    height: "100%",
    borderRadius: Radii.pill,
    backgroundColor: Colors.dark.tintBright,
  },
  progressLabel: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 8,
    includeFontPadding: false,
  },
  noteWrap: {
    marginTop: 12,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.14)",
    backgroundColor: "rgba(248,184,72,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noteText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 14,
  },
  statCard: {
    flexBasis: "47.7%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 66,
    backgroundColor: Colors.dark.surface2,
    borderRadius: Radii.lg,
    paddingHorizontal: 10,
    paddingVertical: 12,
    justifyContent: "center",
  },
  statLabel: {
    color: Colors.dark.textSubtle,
    fontSize: 11,
    includeFontPadding: false,
  },
  statValue: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.15,
    marginTop: 6,
    includeFontPadding: false,
  },
  modePill: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    marginTop: 14,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modePillText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    includeFontPadding: false,
  },
});
