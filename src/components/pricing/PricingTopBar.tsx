import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Radii, Spacing, Shadows } from "../../../constants/theme";
import {
  useAccountPricingSnapshot,
  isMeaningfulPricingLabel,
} from "../../core/pricing/useAccountPricingSnapshot";

type Props = {
  studioName: string;
  estimate?: string | null;
  walletAfterRun?: string | null;
  planName?: string | null;
  includedUsageLeft?: string | null;
  availabilityLabel?: string | null;
  settlementLabel?: string | null;
  entitlementLabel?: string | null;
  availableCreditsLabel?: string | null;
  reservedCreditsLabel?: string | null;
  consumedCreditsLabel?: string | null;
  requiredCreditsLabel?: string | null;
  shortfallCreditsLabel?: string | null;
  canRun?: boolean | null;
  insufficientTitle?: string | null;
  insufficientMessage?: string | null;
  primaryActionLabel?: string | null;
  onPressBreakdown?: () => void;
  onPressManagePlan?: () => void;
  onPressPrimaryAction?: () => void;
};

function cleanText(value?: string | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function looksNumericOnly(value?: string | null) {
  const text = cleanText(value);
  return !!text && /^\d+(?:\.\d+)?$/.test(text);
}

function formatCreditLabel(value?: string | null, suffix?: string) {
  const text = cleanText(value);
  if (!text) return null;
  if (looksNumericOnly(text) && suffix) return `${text} ${suffix}`;
  return text;
}

function isWeirdAvailability(text?: string | null) {
  const value = cleanText(text)?.toLowerCase() ?? "";
  if (!value) return true;
  return value.includes(" of 0 used") || value.includes("0 left") || value.includes("used •") || value.includes("used -") || value.includes("used • 0 left");
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export function PricingTopBar({
  studioName,
  estimate,
  walletAfterRun,
  planName,
  availabilityLabel,
  settlementLabel,
  entitlementLabel,
  availableCreditsLabel,
  reservedCreditsLabel,
  consumedCreditsLabel,
  requiredCreditsLabel,
  shortfallCreditsLabel,
  canRun,
  insufficientTitle,
  insufficientMessage,
  primaryActionLabel,
  onPressBreakdown,
  onPressManagePlan,
  onPressPrimaryAction,
}: Props) {
  const snapshot = useAccountPricingSnapshot() as any;

  const effectivePlanName =
    snapshot?.planName ||
    (isMeaningfulPricingLabel(planName) ? String(planName).trim() : null) ||
    "Plan unavailable";

  const effectiveAvailable =
    formatCreditLabel(
      (isMeaningfulPricingLabel(availableCreditsLabel) ? availableCreditsLabel : null) ||
        snapshot?.availableLabel ||
        (isMeaningfulPricingLabel(walletAfterRun) ? walletAfterRun : null),
      "credits available"
    ) || "Credits unavailable";

  const effectiveUsed =
    formatCreditLabel(
      (isMeaningfulPricingLabel(consumedCreditsLabel) ? consumedCreditsLabel : null) ||
        snapshot?.usedLabel,
      "credits used"
    ) || "Usage unavailable";

  const effectiveReserved = formatCreditLabel(
    (isMeaningfulPricingLabel(reservedCreditsLabel) ? reservedCreditsLabel : null) ||
      snapshot?.reservedLabel,
    "credits reserved"
  );

  const effectiveRequired = formatCreditLabel(
    isMeaningfulPricingLabel(requiredCreditsLabel) ? requiredCreditsLabel : null,
    "credits"
  );

  const effectiveShortfall = formatCreditLabel(
    isMeaningfulPricingLabel(shortfallCreditsLabel) ? shortfallCreditsLabel : null,
    "credits"
  );

  const availability =
    (!isWeirdAvailability(availabilityLabel) ? cleanText(availabilityLabel) : null) ||
    (!isWeirdAvailability(snapshot?.headerLine2) ? cleanText(snapshot?.headerLine2) : null) ||
    `Available now: ${effectiveAvailable}`;

  const settlement =
    cleanText(settlementLabel) ||
    "Estimate shown before the run. Final pricing is confirmed after completion.";

  const compactEntitlement = cleanText(entitlementLabel);

  const trailingStatLabel = effectiveRequired
    ? "This task"
    : effectiveReserved && !effectiveReserved.toLowerCase().startsWith("0 ")
      ? "Reserved"
      : "Plan";

  const trailingStatValue = effectiveRequired || effectiveReserved || effectivePlanName;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{studioName}</Text>
          <Text style={styles.estimateValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
            {estimate || "—"}
          </Text>
          <Text style={styles.helper}>Live estimate before the job starts</Text>
        </View>

        <View style={styles.badgeColumn}>
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText} numberOfLines={1}>
              {effectivePlanName}
            </Text>
          </View>
          {!!compactEntitlement && (
            <Text style={styles.badgeSubtext} numberOfLines={2}>
              {compactEntitlement}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.infoWrap}>
        <Text style={styles.infoPrimary} numberOfLines={2}>
          {availability}
        </Text>
        <Text style={styles.infoSecondary} numberOfLines={2}>
          {settlement}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <MiniStat label="Available" value={effectiveAvailable} />
        <MiniStat label="Used" value={effectiveUsed} />
        <MiniStat label={trailingStatLabel} value={trailingStatValue} />
      </View>

      {!!effectiveShortfall && (
        <View style={styles.statsRow}>
          <MiniStat label="Shortfall" value={effectiveShortfall} />
          <MiniStat label="Status" value={canRun === false ? "Needs more credits" : "Ready"} />
        </View>
      )}

      {canRun === false && (
        <View style={styles.warningWrap}>
          <Text style={styles.warningTitle}>
            {insufficientTitle || "Not enough credits for this task"}
          </Text>
          <Text style={styles.warningBody}>
            {insufficientMessage || "Add more credits, then refresh the estimate to continue without losing your setup."}
          </Text>
        </View>
      )}

      <View style={styles.actionRow}>
        {!!onPressPrimaryAction && canRun === false && (
          <Pressable onPress={onPressPrimaryAction} style={[styles.actionBtn, styles.primaryAction]}>
            <Text style={styles.primaryActionText}>{primaryActionLabel || "Add credits"}</Text>
          </Pressable>
        )}
        {!!onPressBreakdown && (
          <Pressable onPress={onPressBreakdown} style={[styles.actionBtn, styles.secondaryAction]}>
            <Text style={styles.secondaryActionText}>View breakdown</Text>
          </Pressable>
        )}
        {!!onPressManagePlan && (
          <Pressable onPress={onPressManagePlan} style={[styles.actionBtn, styles.secondaryAction]}>
            <Text style={styles.secondaryActionText}>Manage plan</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.xxl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.cardElevated,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    color: Colors.dark.textMuted,
    fontSize: 12,
  },
  estimateValue: {
    color: Colors.dark.textPrimary,
    fontSize: 30,
    fontWeight: "800",
    marginTop: 4,
  },
  helper: {
    color: Colors.dark.textSubtle,
    fontSize: 12,
    marginTop: 4,
  },
  badgeColumn: {
    width: 138,
    alignItems: "flex-end",
  },
  planBadge: {
    maxWidth: "100%",
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.22)",
    backgroundColor: "rgba(248,184,72,0.12)",
  },
  planBadgeText: {
    color: Colors.dark.tintSoft,
    fontSize: 11,
    fontWeight: "800",
  },
  badgeSubtext: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginTop: 8,
    textAlign: "right",
  },
  infoWrap: {
    marginTop: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.18)",
    backgroundColor: "rgba(248,184,72,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  infoPrimary: {
    color: Colors.dark.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  infoSecondary: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  miniStat: {
    flex: 1,
    minWidth: 0,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: Colors.dark.surface2,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  miniStatLabel: {
    color: Colors.dark.textSubtle,
    fontSize: 11,
  },
  miniStatValue: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },
  warningWrap: {
    marginTop: 14,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255,180,90,0.24)",
    backgroundColor: "rgba(255,180,90,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  warningTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  warningBody: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    marginTop: 5,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  actionBtn: {
    minHeight: 42,
    borderRadius: Radii.xl,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryAction: {
    backgroundColor: "rgba(248,184,72,0.14)",
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.24)",
  },
  secondaryAction: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  primaryActionText: {
    color: Colors.dark.tintSoft,
    fontSize: 12,
    fontWeight: "800",
  },
  secondaryActionText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
});
