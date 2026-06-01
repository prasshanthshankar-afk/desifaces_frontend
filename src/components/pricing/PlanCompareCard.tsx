import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Radii, Shadows, Spacing } from "../../../constants/theme";

type PlanOption = {
  planCode: string;
  planName: string;
  priceLabel: string;
  summary?: string;
  recommended?: boolean;
  current?: boolean;
  isCurrent?: boolean;
  billingLabel?: string;
  entitlementLabel?: string;
  badgeLabel?: string;
  action?: "current" | "upgrade" | "downgrade" | "change" | "contact_sales" | "unavailable" | string;
  ctaLabel?: string;
  ctaEnabled?: boolean;
  disabledReason?: string | null;
  contactSales?: boolean;
  features: string[];
  limits: {
    face?: string;
    audio?: string;
    fusion?: string;
    retail?: string;
    music?: string;
  };
};

type Props = {
  option: PlanOption;
  onPressSelect?: (planCode: string) => void;
};

function Limit({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.limitCard}>
      <Text style={styles.limitLabel}>{label}</Text>
      <Text style={styles.limitValue}>{value || "—"}</Text>
    </View>
  );
}

function Badge({ label, tone = "gold" }: { label: string; tone?: "gold" | "green" }) {
  return (
    <View style={[styles.badge, tone === "green" ? styles.badgeGreen : null]}>
      <Text style={[styles.badgeText, tone === "green" ? styles.badgeTextGreen : null]}>
        {label}
      </Text>
    </View>
  );
}

export function PlanCompareCard({ option, onPressSelect }: Props) {
  const isCurrent = Boolean(option.current || option.isCurrent || option.action === "current");
  const badgeLabel =
    option.badgeLabel || (isCurrent ? "Current" : option.recommended ? "Recommended" : undefined);

  const ctaLabel =
    option.ctaLabel ||
    (isCurrent
      ? "Current plan"
      : option.contactSales || option.action === "contact_sales"
      ? "Contact sales"
      : "Choose plan");

  const ctaEnabled =
    typeof option.ctaEnabled === "boolean" ? option.ctaEnabled : !isCurrent;

  const handlePress = () => {
    if (!ctaEnabled) return;
    onPressSelect?.(option.planCode);
  };

  return (
    <View
      style={[
        styles.card,
        option.recommended && styles.cardRecommended,
        isCurrent && styles.cardCurrent,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.planName}>{option.planName}</Text>
          <Text style={styles.price}>{option.priceLabel}</Text>
          {!!option.billingLabel && <Text style={styles.subcopy}>{option.billingLabel}</Text>}
          {!!option.entitlementLabel && <Text style={styles.subcopy}>{option.entitlementLabel}</Text>}
          {!!option.summary && <Text style={styles.summary}>{option.summary}</Text>}
        </View>

        {badgeLabel ? <Badge label={badgeLabel} tone={isCurrent ? "green" : "gold"} /> : null}
      </View>

      <View style={styles.limitWrap}>
        <Limit label="Face" value={option.limits.face} />
        <Limit label="Audio" value={option.limits.audio} />
        <Limit label="Fusion" value={option.limits.fusion} />
        <Limit label="Retail" value={option.limits.retail} />
        <Limit label="Music" value={option.limits.music} />
      </View>

      <View style={styles.featureList}>
        {option.features.map((feature) => (
          <View key={feature} style={styles.featureRow}>
            <View style={styles.featureDot} />
            <Text style={styles.featureItem}>{feature}</Text>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.selectBtn, !ctaEnabled && styles.selectBtnDisabled]}
        onPress={handlePress}
        disabled={!ctaEnabled}
      >
        <Text style={[styles.selectText, !ctaEnabled && styles.selectTextDisabled]}>
          {ctaLabel}
        </Text>
      </Pressable>

      {!!option.disabledReason && !ctaEnabled ? (
        <Text style={styles.disabledReason}>{option.disabledReason}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.cardElevated,
    borderRadius: Radii.xxl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  cardRecommended: {
    borderColor: "rgba(248,184,72,0.32)",
  },
  cardCurrent: {
    borderColor: "rgba(74,222,128,0.32)",
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  planName: {
    color: Colors.dark.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  price: {
    color: Colors.dark.tintSoft,
    fontSize: 14,
    marginTop: 4,
  },
  subcopy: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  summary: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(248,184,72,0.12)",
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.22)",
  },
  badgeGreen: {
    backgroundColor: "rgba(74,222,128,0.12)",
    borderColor: "rgba(74,222,128,0.22)",
  },
  badgeText: {
    color: Colors.dark.tintSoft,
    fontSize: 11,
    fontWeight: "800",
  },
  badgeTextGreen: {
    color: "rgba(220,255,232,0.98)",
  },
  limitWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  limitCard: {
    width: "31%",
    minWidth: 96,
    flexGrow: 1,
    backgroundColor: Colors.dark.surface2,
    borderRadius: Radii.lg,
    padding: 10,
  },
  limitLabel: {
    color: Colors.dark.textSubtle,
    fontSize: 11,
  },
  limitValue: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  featureList: {
    marginTop: 14,
    gap: 9,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.dark.tint,
    marginTop: 6,
  },
  featureItem: {
    flex: 1,
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  selectBtn: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  selectBtnDisabled: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  selectText: {
    color: "#2A1606",
    fontSize: 14,
    fontWeight: "800",
  },
  selectTextDisabled: {
    color: Colors.dark.textMuted,
  },
  disabledReason: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: 8,
    lineHeight: 16,
  },
});