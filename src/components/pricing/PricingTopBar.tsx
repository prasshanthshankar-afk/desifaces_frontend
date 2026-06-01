import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors, Radii, Spacing, Shadows } from "../../../constants/theme";
import { isMeaningfulPricingLabel } from "../../core/pricing/useAccountPricingSnapshot";
import { useResolvedPricingDisplay } from "../../core/pricing/resolvePricingDisplay";

type Props = {
  studioName: string;
  estimate?: string | null;
  primaryEstimateLabel?: string | null;
  secondaryEstimateLabel?: string | null;
  creditEstimateLabel?: string | null;
  cashEstimateLabel?: string | null;
  noteLabel?: string | null;
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
  displayKind?: "credits" | "postpaid" | null;
  billingValue?: string | null;
  canRun?: boolean | null;
  insufficientTitle?: string | null;
  insufficientMessage?: string | null;
  primaryActionLabel?: string | null;
  topUpLabel?: string | null;
  upgradeLabel?: string | null;
  onPressBreakdown?: () => void;
  onPressManagePlan?: () => void;
  onPressPrimaryAction?: () => void;
  onPressTopUp?: () => void;
  onPressUpgrade?: () => void;
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



function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumericValue(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseNumericValue(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function parseDetailMetrics(detail?: string | null) {
  const text = cleanText(detail);
  if (!text) return { credit: null as string | null, cash: null as string | null };

  const creditMatch = text.match(/credits? used:\s*([^•]+)/i);
  const cashMatch = text.match(/cash charged:\s*([^•]+)/i);
  return {
    credit: cleanText(creditMatch?.[1] ?? null),
    cash: cleanText(cashMatch?.[1] ?? null),
  };
}

function isMoneyDisplayText(value?: string | null) {
  const text = cleanText(value)?.toLowerCase() ?? "";
  if (!text) return false;
  return (
    text.includes("$") ||
    text.includes("usd") ||
    text.includes("inr") ||
    text.includes("eur") ||
    text.includes("gbp") ||
    text.includes("aud") ||
    text.includes("cad") ||
    text.includes("¥") ||
    text.includes("€") ||
    text.includes("£") ||
    text.includes("₹")
  );
}

function isCreditDisplayText(value?: string | null) {
  const text = cleanText(value)?.toLowerCase() ?? "";
  if (!text) return false;
  return text.includes("credit");
}


function normalizePlanName(raw?: string | null) {
  const text = cleanText(raw)?.toLowerCase() ?? "";
  if (!text) return null;
  if (text.includes("enterprise")) return "Enterprise";
  if (text.includes("business")) return "Business";
  if (text.includes("pro")) return "Pro";
  if (text.includes("free")) return "Free";
  return cleanText(raw);
}

function planNameFromSignals(...values: Array<unknown>): "Enterprise" | "Business" | "Pro" | "Free" | null {
  for (const value of values) {
    const text = String(value ?? "").trim().toLowerCase();
    if (!text) continue;
    if (text.includes("enterprise")) return "Enterprise";
    if (text.includes("business")) return "Business";
    if (text.includes("pro")) return "Pro";
    if (text.includes("free")) return "Free";
  }
  return null;
}

function pickBestPlanName(options: {
  accountPlanName?: string | null;
  explicitPlanName?: string | null;
  tierSignals?: Array<unknown>;
  planCodeSignals?: Array<unknown>;
  labelSignals?: Array<unknown>;
  snapshotPlanName?: string | null;
  postpaid?: boolean;
}) {
  const accountPlan = normalizePlanName(options.accountPlanName);
  if (accountPlan) return accountPlan;

  const explicit = normalizePlanName(options.explicitPlanName);
  if (explicit) return explicit;

  const tierPlan = planNameFromSignals(...(options.tierSignals ?? []));
  if (tierPlan && tierPlan !== "Free") return tierPlan;

  const codePlan = planNameFromSignals(...(options.planCodeSignals ?? []));
  if (codePlan && codePlan !== "Free") return codePlan;

  const labelPlan = planNameFromSignals(...(options.labelSignals ?? []));
  if (labelPlan && labelPlan !== "Free") return labelPlan;

  const snapshotPlan = normalizePlanName(options.snapshotPlanName);
  if (snapshotPlan) return snapshotPlan;

  if (options.postpaid) return "Enterprise";
  return "Loading";
}

function resolveAccountPlanName(snapshot: any, runwaySummary: any, pricingSummary: any, usageSummary: any) {
  return normalizePlanName(
    cleanText(runwaySummary?.plan_name) ||
      cleanText(runwaySummary?.planName) ||
      cleanText(snapshot?.plan_summary?.plan_name) ||
      cleanText(snapshot?.planSummary?.plan_name) ||
      cleanText(snapshot?.plan_summary?.planName) ||
      cleanText(snapshot?.planSummary?.planName) ||
      cleanText(snapshot?.plan_name) ||
      cleanText(snapshot?.planName) ||
      cleanText(pricingSummary?.plan_name) ||
      cleanText(pricingSummary?.planName) ||
      cleanText(usageSummary?.plan_name) ||
      cleanText(usageSummary?.planName)
  );
}

function normalizeBillingKind(raw?: string | null): "credits" | "postpaid" | null {
  const text = cleanText(raw)?.toLowerCase() ?? "";
  if (!text) return null;
  if (text.includes("postpaid") || text.includes("billed after completion") || text.includes("enterprise invoicing")) {
    return "postpaid";
  }
  if (text.includes("credit") || text.includes("covered by plan") || text.includes("included")) {
    return "credits";
  }
  return null;
}

function pickBillingKindFromInputs(values: Array<string | null | undefined>): "credits" | "postpaid" | null {
  for (const value of values) {
    const kind = normalizeBillingKind(value);
    if (kind) return kind;
  }
  return null;
}

function hasExplicitStudioPricingContext(values: Array<unknown>) {
  return values.some((value) => {
    const text = cleanText(value as any);
    return !!text;
  });
}

export function PricingTopBar({
  studioName,
  estimate,
  primaryEstimateLabel,
  secondaryEstimateLabel,
  creditEstimateLabel,
  cashEstimateLabel,
  noteLabel,
  walletAfterRun,
  planName,
  availabilityLabel,
  settlementLabel,
  entitlementLabel,
  availableCreditsLabel,
  reservedCreditsLabel,
  requiredCreditsLabel,
  shortfallCreditsLabel,
  displayKind,
  billingValue,
  canRun,
  insufficientTitle,
  insufficientMessage,
  primaryActionLabel,
  topUpLabel,
  upgradeLabel,
  onPressBreakdown,
  onPressManagePlan,
  onPressPrimaryAction,
  onPressTopUp,
  onPressUpgrade,
}: Props) {
  const resolved = useResolvedPricingDisplay();

  const parsedMetrics = parseDetailMetrics(entitlementLabel);
  const hasExplicitStudioPricing = hasExplicitStudioPricingContext([
    planName,
    availabilityLabel,
    settlementLabel,
    entitlementLabel,
    availableCreditsLabel,
    reservedCreditsLabel,
    requiredCreditsLabel,
    shortfallCreditsLabel,
    creditEstimateLabel,
    cashEstimateLabel,
    primaryEstimateLabel,
    secondaryEstimateLabel,
    estimate,
    billingValue,
    noteLabel,
    walletAfterRun,
    displayKind,
  ]);

  const effectiveDisplayKind =
    displayKind ||
    pickBillingKindFromInputs([
      settlementLabel,
      entitlementLabel,
      billingValue,
      cashEstimateLabel,
      creditEstimateLabel,
      primaryEstimateLabel,
      estimate,
    ]) ||
    resolved.displayKind;

  const isPostpaid = effectiveDisplayKind === "postpaid";

  const effectivePlanName =
    normalizePlanName(planName) ||
    (!hasExplicitStudioPricing ? normalizePlanName(resolved.planName) : null) ||
    normalizePlanName(resolved.planName) ||
    "Loading";

  const numericAvailable = firstNumericValue(
    availableCreditsLabel,
    walletAfterRun,
    hasExplicitStudioPricing ? null : resolved.availableCredits,
    resolved.availableCredits
  );

  const numericReserved = firstNumericValue(
    reservedCreditsLabel,
    hasExplicitStudioPricing ? null : resolved.reservedCredits,
    resolved.reservedCredits
  );

  const safeAvailableCredits = Math.max(0, numericAvailable ?? 0);
  const usagePct = Math.max(0, Math.min(1, resolved.usagePercent ?? 0));

  const totalCredits =
    (resolved.totalCredits != null && resolved.totalCredits > 0
      ? resolved.totalCredits
      : null) ??
    (effectivePlanName.toLowerCase() === "free" ? 100 : null) ??
    (safeAvailableCredits > 0 && usagePct > 0 && usagePct < 1
      ? Math.round(safeAvailableCredits / Math.max(0.01, 1 - usagePct))
      : null);

  const effectiveAvailable = !isPostpaid
    ? (
        resolved.availableOutOfTotalLabel ||
        (
          totalCredits && totalCredits > 0
            ? `${Math.max(0, Math.floor(safeAvailableCredits))} / ${Math.max(0, Math.floor(totalCredits))} credits available`
            : (
                formatCreditLabel(
                  (numericAvailable != null ? String(Math.max(0, Math.floor(numericAvailable))) : null) ||
                    resolved.readableAvailableLabel ||
                    (isMeaningfulPricingLabel(availableCreditsLabel) ? availableCreditsLabel : null) ||
                    (isMeaningfulPricingLabel(walletAfterRun) ? walletAfterRun : null),
                  "credits available"
                ) || "Credits unavailable"
              )
        )
      )
    : null;

  const effectiveRequired = !isPostpaid
    ? formatCreditLabel(
        isMeaningfulPricingLabel(requiredCreditsLabel) ? requiredCreditsLabel : null,
        "credits"
      )
    : null;

  const effectiveShortfall = !isPostpaid
    ? formatCreditLabel(
        isMeaningfulPricingLabel(shortfallCreditsLabel) ? shortfallCreditsLabel : null,
        "credits"
      )
    : null;

  const effectiveCreditEstimate = !isPostpaid
    ? cleanText(creditEstimateLabel) || parsedMetrics.credit || effectiveRequired || null
    : null;

  const effectiveCashEstimate = isPostpaid
    ? cleanText(cashEstimateLabel) || parsedMetrics.cash || cleanText(primaryEstimateLabel) || cleanText(estimate) || null
    : null;

  const prepaidPrimaryFallback =
    effectiveCreditEstimate ||
    (isCreditDisplayText(primaryEstimateLabel) ? cleanText(primaryEstimateLabel) : null) ||
    (!isMoneyDisplayText(primaryEstimateLabel) ? cleanText(primaryEstimateLabel) : null) ||
    (isCreditDisplayText(estimate) ? cleanText(estimate) : null) ||
    (!isMoneyDisplayText(estimate) ? cleanText(estimate) : null) ||
    "—";

  const primary = isPostpaid
    ? effectiveCashEstimate || cleanText(primaryEstimateLabel) || cleanText(estimate) || "—"
    : prepaidPrimaryFallback;

  const secondary =
    isPostpaid
      ? (
          !cleanText(secondaryEstimateLabel) || cleanText(secondaryEstimateLabel) === primary
            ? null
            : cleanText(secondaryEstimateLabel)
        )
      : null;

  const note =
    cleanText(noteLabel) ||
    cleanText(settlementLabel) ||
    (isPostpaid
      ? "Billed after completion through your postpaid billing account."
      : "Covered by your included monthly credits. Final credits are confirmed after completion.");

  const explicitBillingValue = cleanText(billingValue);
  const resolvedBillingValue = cleanText(resolved.billingValue);
  const availabilityBits = isPostpaid
    ? [
        cleanText(availabilityLabel),
        explicitBillingValue ? `${explicitBillingValue} account` : null,
        !hasExplicitStudioPricing && resolvedBillingValue ? `${resolvedBillingValue} account` : null,
        !hasExplicitStudioPricing ? cleanText(resolved.usageLabel) : null,
      ].filter(Boolean) as string[]
    : [
        cleanText(availabilityLabel) || effectiveAvailable || (!hasExplicitStudioPricing ? resolved.availableOutOfTotalLabel : null),
      ].filter(Boolean) as string[];

  const availability = availabilityBits.length
    ? availabilityBits.join(" • ")
    : (
        isPostpaid
          ? (cleanText(availabilityLabel) || (!hasExplicitStudioPricing ? resolved.usageLabel : null) || "Billed after completion")
          : (cleanText(availabilityLabel) || effectiveAvailable || (!hasExplicitStudioPricing ? resolved.compactUsageLabel : null))
      );

  React.useEffect(() => {
    if (!__DEV__) return;
    try {
      console.log(
        `[DF_PRICING][PricingTopBar:${studioName}]`,
        JSON.stringify(
          {
            resolved: {
              source: resolved.source,
              planName: resolved.planName,
              displayKind: resolved.displayKind,
              settlementKind: resolved.settlementKind,
              availableCredits: resolved.availableCredits,
              reservedCredits: resolved.reservedCredits,
              usedCredits: resolved.usedCredits,
              totalCredits: resolved.totalCredits,
              usageLabel: resolved.usageLabel,
            },
            explicit: {
              hasExplicitStudioPricing,
              planName,
              displayKind,
              availabilityLabel,
              billingValue,
              settlementLabel,
              noteLabel,
            },
            rendered: {
              effectiveDisplayKind,
              effectivePlanName,
              availability,
              primary,
              secondary,
              note,
            },
          },
          null,
          2
        )
      );
    } catch {}
  }, [
    studioName,
    resolved.source,
    resolved.planName,
    resolved.displayKind,
    resolved.settlementKind,
    resolved.availableCredits,
    resolved.reservedCredits,
    resolved.usedCredits,
    resolved.totalCredits,
    resolved.usageLabel,
    hasExplicitStudioPricing,
    planName,
    displayKind,
    availabilityLabel,
    billingValue,
    settlementLabel,
    noteLabel,
    effectiveDisplayKind,
    effectivePlanName,
    availability,
    primary,
    secondary,
    note,
  ]);

  const warningTitle =
    insufficientTitle ||
    (isPostpaid ? "Unable to continue" : "Not enough available credits");
  const warningBody =
    insufficientMessage ||
    (isPostpaid
      ? "Please review your billing access and refresh the estimate to continue."
      : "Add more credits, then refresh the estimate to continue without losing your setup.");

  const showCreditMetric = !isPostpaid && !!effectiveCreditEstimate;
  const showCashMetric = isPostpaid && !!effectiveCashEstimate;
  const showMetricRow = showCreditMetric || showCashMetric;

  const showAnyActions =
    !!onPressTopUp ||
    !!onPressUpgrade ||
    !!onPressPrimaryAction ||
    !!onPressBreakdown ||
    !!onPressManagePlan;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>{studioName}</Text>
          <Text style={styles.estimateValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
            {primary}
          </Text>
          {!!secondary && <Text style={styles.secondaryEstimate}>{secondary}</Text>}
        </View>

        <View style={styles.planBadge}>
          <Text style={styles.planBadgeText} numberOfLines={1}>
            {effectivePlanName}
          </Text>
        </View>
      </View>

      {showMetricRow && (
        <View style={styles.metricRow}>
          {showCreditMetric && (
            <View style={styles.metricChip}>
              <Text style={styles.metricLabel}>Credits estimated</Text>
              <Text style={styles.metricValue}>{effectiveCreditEstimate}</Text>
            </View>
          )}
          {showCashMetric && (
            <View style={styles.metricChip}>
              <Text style={styles.metricLabel}>Estimated bill</Text>
              <Text style={styles.metricValue}>{effectiveCashEstimate}</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.metaBlock}>
        {!!availability && (
          <Text style={styles.metaPrimary} numberOfLines={2}>
            {availability}
          </Text>
        )}
        <Text style={styles.metaSecondary} numberOfLines={2}>
          {note}
        </Text>
      </View>

      {canRun === false && (
        <View style={styles.warningRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.warningTitle}>{warningTitle}</Text>
            <Text style={styles.warningBody}>{warningBody}</Text>
          </View>
        </View>
      )}

      {showAnyActions && (
        <View style={styles.actionRow}>
          {!!onPressTopUp && canRun === false && (
            <Pressable onPress={onPressTopUp} style={[styles.actionBtn, styles.primaryAction]}>
              <Text style={styles.primaryActionText}>{topUpLabel || "Top Up"}</Text>
            </Pressable>
          )}
          {!!onPressUpgrade && canRun === false && (
            <Pressable onPress={onPressUpgrade} style={[styles.actionBtn, styles.primaryAction]}>
              <Text style={styles.primaryActionText}>{upgradeLabel || "Upgrade"}</Text>
            </Pressable>
          )}
          {!!onPressPrimaryAction && canRun === false && !onPressTopUp && !onPressUpgrade && (
            <Pressable onPress={onPressPrimaryAction} style={[styles.actionBtn, styles.primaryAction]}>
              <Text style={styles.primaryActionText}>{primaryActionLabel || "Add credits"}</Text>
            </Pressable>
          )}
          {!!onPressBreakdown && (
            <Pressable onPress={onPressBreakdown} style={[styles.actionBtn, styles.secondaryAction]}>
              <Text style={styles.secondaryActionText}>Breakdown</Text>
            </Pressable>
          )}
          {!!onPressManagePlan && (
            <Pressable onPress={onPressManagePlan} style={[styles.actionBtn, styles.secondaryAction]}>
              <Text style={styles.secondaryActionText}>Manage plan</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radii.xxl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.cardElevated,
    padding: Spacing.md,
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
    fontSize: 11,
    fontWeight: "700",
  },
  estimateValue: {
    color: Colors.dark.textPrimary,
    fontSize: 26,
    fontWeight: "800",
    marginTop: 4,
  },
  secondaryEstimate: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  planBadge: {
    maxWidth: 132,
    borderRadius: Radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.22)",
    backgroundColor: "rgba(248,184,72,0.12)",
  },
  planBadgeText: {
    color: Colors.dark.tintSoft,
    fontSize: 11,
    fontWeight: "800",
  },
  metricRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  metricChip: {
    flex: 1,
    borderRadius: Radii.lg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  metricLabel: {
    color: Colors.dark.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
  metricValue: {
    color: Colors.dark.textPrimary,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  metaBlock: {
    marginTop: 10,
    gap: 3,
  },
  metaPrimary: {
    color: Colors.dark.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  metaSecondary: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: "700",
  },
  warningRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,180,90,0.14)",
    paddingTop: 10,
  },
  warningTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  warningBody: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    minHeight: 38,
    borderRadius: Radii.xl,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
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
