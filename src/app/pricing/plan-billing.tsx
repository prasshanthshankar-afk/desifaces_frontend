import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Radii, Spacing, Shadows } from "../../../constants/theme";
import { UsageAndPlanCard } from "../../components/pricing/UsageAndPlanCard";
import DFHeader from "../../core/ui/DFHeader";
import { DF } from "../../core/theme/colors";
import { useAuth } from "../../core/auth/AuthContext";
import * as PaymentsApi from "../../core/payments/apiPayments";
import {
  appleSubscriptionProductIdForPlan,
  isAppleBillingPlatform,
} from "../../core/payments/appleIap";
import {
  googleSubscriptionBasePlanIdForPlan,
  googleSubscriptionProductIdForPlan,
} from "../../core/payments/googlePlayIap";
import {
  BILLING_QUERY_OPTIONS,
  refreshBillingQueries,
} from "../../core/payments/billingQueries";

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return String(value ?? fallback);
}

function platformPurchaseProvider(): "apple_iap" | "google_play" | "stripe" {
  if (Platform.OS === "ios" && isAppleBillingPlatform()) return "apple_iap";
  if (Platform.OS === "android") return "google_play";
  return "stripe";
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstNonEmptyString(...value);
      if (nested) return nested;
      continue;
    }
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

function stringifyState(v?: string | null, fallback = "—") {
  return String(v || fallback).replace(/_/g, " ");
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

type LooseRecord = Record<string, unknown>;

function asLooseRecord(value: unknown): LooseRecord {
  return value != null && typeof value === "object"
    ? (value as LooseRecord)
    : {};
}

function looseGet(record: LooseRecord, key: string): unknown {
  return record[key];
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text ? text : null;
}

function roundTo2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function formatWhole(value?: number | null, fallback = "0") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.max(0, Math.round(value))}`;
}

function formatCredits(value?: number | null, fallback = "0 credits") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.max(0, Math.round(value))} credits`;
}

function formatDate(value?: unknown, fallback = "—") {
  const raw = cleanString(value);
  if (!raw) return fallback;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function buildPlanCreditLine(args: { includedAvailable: number | null; includedTotal: number | null; includedUsed: number | null }) {
  const available = formatWhole(args.includedAvailable, "0");
  const used = formatWhole(args.includedUsed, "0");
  const total = formatWhole(args.includedTotal, "0");
  if (args.includedTotal != null && args.includedTotal > 0) {
    return `${available} available • ${used} used • ${total} included`;
  }
  return `${available} available`;
}

function buildIncludedCreditTileLabel(args: {
  includedAvailable: number | null;
  includedTotal: number | null;
  includedUsed: number | null;
}) {
  let available = args.includedAvailable;

  // UsageAndPlanCard renders this as the main value inside the "Included"
  // tile. Keep it short so it uses the same visual scale as Wallet and
  // Reserved instead of shrinking a long sentence to fit.
  if (
    available == null &&
    args.includedTotal != null &&
    args.includedTotal > 0
  ) {
    available = Math.max(
      0,
      Math.round(args.includedTotal - Math.max(args.includedUsed ?? 0, 0))
    );
  }

  return formatCredits(available, "0 credits");
}

function buildExtraCreditLine(extraAvailable: number | null) {
  const extra = Math.max(0, Math.round(extraAvailable ?? 0));
  if (extra <= 0) return "No extra top-up credits available yet";
  return `${extra} extra credits available from top-ups`;
}

function deriveRemainingCredits(
  rawAvailable: unknown,
  totalCredits: unknown,
  usedCredits: unknown,
  reservedCredits: unknown
): number | null {
  const raw = firstNumericValue(rawAvailable);

  // Backend live account balance is authoritative. Do not overwrite it with
  // plan entitlement math because included_credits_remaining can remain at the
  // monthly grant while the spendable account balance has already changed.
  if (raw != null) return Math.max(0, raw);

  const total = firstNumericValue(totalCredits);
  const used = Math.max(0, firstNumericValue(usedCredits) ?? 0);
  const reserved = Math.max(0, firstNumericValue(reservedCredits) ?? 0);

  if (total != null && total > 0) {
    return Math.max(0, total - used - reserved);
  }

  return null;
}

function buildPostpaidUsageLabel(
  usedCredits?: number | null,
  reservedCredits?: number | null
) {
  return `${formatWhole(usedCredits)} used • ${formatWhole(
    reservedCredits,
    "0"
  )} reserved • billed after completion`;
}

function humanizePlanCode(code?: string | null) {
  const raw = String(code || "").trim().toLowerCase();
  const normalized = raw.replace(/[\s-]+/g, "_");
  if (!normalized) return "Plan";
  if (normalized === "free") return "Free";

  if (normalized.includes("enterprise")) {
    if (normalized.includes("monthly")) return "Enterprise Monthly";
    if (normalized.includes("yearly")) return "Enterprise";
    return "Enterprise";
  }

  if (normalized.includes("business")) {
    if (normalized.includes("yearly")) return "Business Yearly";
    if (normalized.includes("monthly")) return "Business Monthly";
    return "Business";
  }

  if (normalized.includes("pro")) {
    if (normalized.includes("yearly")) return "Pro Yearly";
    if (normalized.includes("monthly")) return "Pro Monthly";
    return "Pro";
  }

  return normalized
    .replace(/_v\d+$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function normalizePlanCode(raw?: string | null) {
  const code = String(raw || "").trim().toLowerCase();
  const normalized = code.replace(/[\s-]+/g, "_");
  if (!normalized) return "free";
  if (normalized.includes("enterprise")) return "enterprise_contract_v1";
  if (normalized.includes("business_yearly")) return "business_yearly_v1";
  if (normalized.includes("business_monthly")) return "business_monthly_v1";
  if (normalized === "business") return "business_monthly_v1";
  if (normalized.includes("business")) return "business_monthly_v1";
  if (normalized.includes("pro_yearly")) return "pro_yearly_v1";
  if (normalized.includes("pro_monthly")) return "pro_monthly_v1";
  if (normalized === "pro") return "pro_monthly_v1";
  if (normalized.includes("pro")) return "pro_monthly_v1";
  return "free";
}

function findRawPlanItem(
  catalog: PaymentsApi.PaymentPlanCatalogResponse | null | undefined,
  planCode: string
): Record<string, any> {
  const normalized = normalizePlanCode(planCode);
  const item = (Array.isArray(catalog?.items) ? catalog?.items : []).find(
    (row) => normalizePlanCode(row.plan_code) === normalized
  );
  return (item || {}) as Record<string, any>;
}

function planRank(planCode?: string | null) {
  const code = normalizePlanCode(planCode);
  if (code === "enterprise_contract_v1") return 40;
  if (code === "business_yearly_v1") return 31;
  if (code === "business_monthly_v1") return 30;
  if (code === "pro_yearly_v1") return 21;
  if (code === "pro_monthly_v1") return 20;
  return 10;
}

type DisplayPlanOption = {
  planCode: string;
  planName: string;
  priceLabel: string;
  summary?: string;
  recommended: boolean;
  current: boolean;
  action?: string;
  ctaLabel?: string;
  ctaEnabled: boolean;
  disabledReason?: string;
  contactSales: boolean;
  features: string[];
  limits: Record<string, unknown>;
};

function dedupePlanItems(
  items: PaymentsApi.PaymentPlanCatalogItem[] | undefined | null
): PaymentsApi.PaymentPlanCatalogItem[] {
  const source = Array.isArray(items) ? [...items] : [];
  source.sort(
    (a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)
  );

  const seen = new Map<string, PaymentsApi.PaymentPlanCatalogItem>();

  for (const item of source) {
    const code = normalizePlanCode(item.plan_code);
    if (!code) continue;

    const existing = seen.get(code);
    if (!existing) {
      seen.set(code, item);
      continue;
    }

    const existingCurrent = Boolean(existing.is_current);
    const nextCurrent = Boolean(item.is_current);
    if (nextCurrent && !existingCurrent) {
      seen.set(code, item);
      continue;
    }

    const existingOrder = Number(existing.display_order ?? 999999);
    const nextOrder = Number(item.display_order ?? 999999);
    if (nextOrder < existingOrder) {
      seen.set(code, item);
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)
  );
}

function applyAccountActionPolicy(
  option: DisplayPlanOption,
  currentPlanCode: string,
  actions?: PaymentsApi.PaymentOverviewResponse["allowed_actions"] | null
): DisplayPlanOption {
  const normalizedCurrent = normalizePlanCode(currentPlanCode);
  const normalizedTarget = normalizePlanCode(option.planCode);
  const currentRank = planRank(normalizedCurrent);
  const targetRank = planRank(normalizedTarget);

  if (normalizedTarget === normalizedCurrent) {
    return {
      ...option,
      current: true,
      action: "current",
      ctaLabel: "Current plan",
      ctaEnabled: false,
      disabledReason: undefined,
    };
  }

  if (option.contactSales || option.action === "contact_sales") {
    return {
      ...option,
      action: "contact_sales",
      ctaLabel: option.ctaLabel || "Contact sales",
      ctaEnabled: true,
    };
  }

  if (targetRank > currentRank) {
    if (actions?.can_upgrade === false) {
      return {
        ...option,
        action: "manual_change",
        ctaLabel: "Contact support",
        ctaEnabled: true,
        disabledReason:
          "This account requires manual support for plan upgrades.",
      };
    }
    return option;
  }

  if (actions?.can_downgrade === false) {
    return {
      ...option,
      action: "manual_change",
      ctaLabel: "Contact support",
      ctaEnabled: true,
      disabledReason:
        "This account requires manual support for downgrades or same-tier changes.",
    };
  }

  return option;
}

function normalizePlanOptions(
  items: PaymentsApi.PaymentPlanCatalogItem[] | undefined | null,
  currentPlanCode: string,
  actions?: PaymentsApi.PaymentOverviewResponse["allowed_actions"] | null
): DisplayPlanOption[] {
  return dedupePlanItems(items).map((item) =>
    applyAccountActionPolicy(
      {
        planCode: String(item.plan_code || "").trim(),
        planName:
          String(item.plan_name || "").trim() ||
          humanizePlanCode(item.plan_code),
        priceLabel:
          String(item.price_label || "").trim() || "Pricing unavailable",
        summary: String(item.summary || "").trim() || undefined,
        recommended: Boolean(item.recommended),
        current: Boolean(item.is_current),
        action: item.action || undefined,
        ctaLabel: item.cta_label || undefined,
        ctaEnabled:
          typeof item.cta_enabled === "boolean" ? item.cta_enabled : true,
        disabledReason: item.disabled_reason || undefined,
        contactSales: Boolean(item.contact_sales),
        features: Array.isArray(item.feature_bullets)
          ? item.feature_bullets.filter(Boolean).map((x) => String(x))
          : [],
        limits:
          item.limits && typeof item.limits === "object"
            ? (item.limits as Record<string, unknown>)
            : {},
      },
      currentPlanCode,
      actions
    )
  );
}

function deriveCurrentPlanPriceLabel(
  overview: PaymentsApi.PaymentOverviewResponse | null | undefined,
  currentPlanName: string
) {
  const currentPlanCode = normalizePlanCode(
    overview?.current_plan?.plan_code ||
      overview?.current_subscription?.plan_code ||
      ""
  );

  const currency = String(overview?.currency || "USD").trim().toUpperCase();
  const rawPrice = String(overview?.current_plan?.price_label || "").trim();

  const isFree =
    currentPlanCode === "free" ||
    String(currentPlanName || "").trim().toLowerCase() === "free";

  if (isFree) {
    return currency === "INR" ? "₹0 / month" : "$0 / month";
  }

  return rawPrice || "Pricing unavailable";
}

function ComparePlanTile({
  option,
  onPressSelect,
}: {
  option: DisplayPlanOption;
  onPressSelect: (planCode: string) => void;
}) {
  const buttonLabel = option.current
    ? "Current plan"
    : option.contactSales
      ? option.ctaLabel || "Contact sales"
      : option.ctaLabel || "Choose plan";

  const features = option.features.slice(0, 3);
  const limitsPreview = Object.entries(option.limits || {})
    .slice(0, 2)
    .map(([k, v]) => `${humanizePlanCode(k)}: ${String(v)}`);

  return (
    <View
      style={[
        styles.compareCard,
        option.current && styles.compareCardCurrent,
        option.recommended && styles.compareCardRecommended,
      ]}
    >
      <View style={styles.compareHeaderRow}>
        <View style={styles.compareHeaderText}>
          <View style={styles.compareTitleRow}>
            <Text style={styles.compareTitle}>{option.planName}</Text>
            {option.recommended ? (
              <View style={styles.compareBadge}>
                <Text style={styles.compareBadgeText}>Recommended</Text>
              </View>
            ) : null}
            {option.current ? (
              <View style={[styles.compareBadge, styles.compareBadgeCurrent]}>
                <Text style={styles.compareBadgeText}>Current</Text>
              </View>
            ) : null}
          </View>
          {!!option.summary ? (
            <Text style={styles.compareSummary}>{option.summary}</Text>
          ) : null}
        </View>

        <View style={styles.comparePricePill}>
          <Text style={styles.comparePrice}>{option.priceLabel}</Text>
        </View>
      </View>

      {features.length ? (
        <View style={styles.compareBullets}>
          {features.map((feature, idx) => (
            <Text
              key={`${option.planCode}-feature-${idx}`}
              style={styles.compareBullet}
            >
              • {feature}
            </Text>
          ))}
        </View>
      ) : null}

      {!features.length && limitsPreview.length ? (
        <View style={styles.compareBullets}>
          {limitsPreview.map((line, idx) => (
            <Text
              key={`${option.planCode}-limit-${idx}`}
              style={styles.compareBullet}
            >
              • {line}
            </Text>
          ))}
        </View>
      ) : null}

      {!!option.disabledReason ? (
        <Text style={styles.compareDisabledReason}>
          {option.disabledReason}
        </Text>
      ) : null}

      <Pressable
        style={[
          styles.compareActionBtn,
          (option.current || !option.ctaEnabled) &&
            styles.compareActionBtnDisabled,
        ]}
        disabled={option.current || !option.ctaEnabled}
        onPress={() => onPressSelect(option.planCode)}
      >
        <Text
          style={[
            styles.compareActionText,
            (option.current || !option.ctaEnabled) &&
              styles.compareActionTextDisabled,
          ]}
        >
          {buttonLabel}
        </Text>
      </Pressable>
    </View>
  );
}

function BillingFooterNav() {
  const items = [
    {
      key: "dashboard",
      label: "Home",
      icon: "home-outline",
      route: "/(tabs)/dashboard",
    },
    {
      key: "face",
      label: "Face",
      icon: "person-outline",
      route: "/(tabs)/face",
    },
    {
      key: "audio",
      label: "Audio",
      icon: "mic-outline",
      route: "/(tabs)/audio",
    },
    {
      key: "fusion",
      label: "Fusion",
      icon: "videocam-outline",
      route: "/(tabs)/fusion",
    },
  ] as const;

  return (
    <View style={styles.footerWrap}>
      <View style={styles.footerNav}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            style={styles.footerItem}
            onPress={() => router.replace(item.route as any)}
          >
            <Ionicons
              name={item.icon as any}
              size={19}
              color={"rgba(255,255,255,0.62)"}
              style={{ marginBottom: 2 }}
            />
            <Text style={styles.footerLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function PlanBillingScreen() {
  const params = useLocalSearchParams<{
    source?: string;
    workflow?: string;
    intent?: string;
    requiredFeature?: string;
    billing_result?: string;
  }>();

  const queryClient = useQueryClient();
  const auth = useAuth() as any;

  const source = readString(params.source, "studio");
  const workflow = readString(params.workflow, source);
  const intent = readString(params.intent, "upgrade");
  const requiredFeature = readString(params.requiredFeature);
  const billingResult = readString(params.billing_result);

  const countryCode =
    auth?.countryCode ||
    auth?.country_code ||
    auth?.user?.countryCode ||
    auth?.user?.country_code ||
    "US";

  const purchaseProvider = platformPurchaseProvider();
  const isAppleBilling = purchaseProvider === "apple_iap";
  const isGooglePlayBilling = purchaseProvider === "google_play";

  const {
    data: overview,
    isLoading: overviewLoading,
    isFetching: overviewFetching,
    error: overviewError,
    refetch: refetchOverview,
  } = useQuery<PaymentsApi.PaymentOverviewResponse | null>({
    queryKey: ["payments-overview", countryCode],
    queryFn: async () => PaymentsApi.apiGetPaymentsOverview(countryCode),
    ...BILLING_QUERY_OPTIONS,
  });

  const {
    data: planCatalog,
    isLoading: catalogLoading,
    isFetching: catalogFetching,
    error: catalogError,
    refetch: refetchCatalog,
  } = useQuery<PaymentsApi.PaymentPlanCatalogResponse | null>({
    queryKey: ["payments-plan-catalog", countryCode],
    queryFn: async () => PaymentsApi.apiGetPlansCatalog(countryCode),
    ...BILLING_QUERY_OPTIONS,
  });

  useFocusEffect(
    useCallback(() => {
      refreshBillingQueries(queryClient, countryCode);
      refetchOverview();
      refetchCatalog();
    }, [queryClient, countryCode, refetchOverview, refetchCatalog])
  );

  useEffect(() => {
    if (billingResult !== "success") return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 15;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;

      await refreshBillingQueries(queryClient, countryCode);
      const [overviewRes, catalogRes] = await Promise.all([
        refetchOverview(),
        refetchCatalog(),
      ]);

      const ov = overviewRes.data;
      const pending = ov?.pending_change || catalogRes.data?.pending_change;
      const ent = String(
        ov?.current_subscription?.entitlement_state || ""
      ).toLowerCase();
      const stable =
        !pending && (ent === "active" || ent === "free" || ent === "grace");

      if (stable || attempts >= maxAttempts) return;
      setTimeout(tick, 2000);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [billingResult, queryClient, countryCode, refetchOverview, refetchCatalog]);

  const currentPlanCode = normalizePlanCode(
    overview?.current_plan?.plan_code ||
      overview?.current_subscription?.plan_code ||
      planCatalog?.current_plan_code ||
      "free"
  );

  const planOptions = useMemo(
    () =>
      normalizePlanOptions(
        planCatalog?.items,
        currentPlanCode,
        overview?.allowed_actions
      ),
    [planCatalog, currentPlanCode, overview?.allowed_actions]
  );

  const currentSubscription = overview?.current_subscription || null;
  const pendingChange =
    overview?.pending_change || planCatalog?.pending_change || null;

  const currentActivePlanCode = String(
    currentSubscription?.plan_code ||
      overview?.current_plan?.plan_code ||
      planCatalog?.current_plan_code ||
      "free"
  ).trim();

  const currentPlanDisplayName = String(
    overview?.current_plan?.plan_name ||
      (currentActivePlanCode
        ? humanizePlanCode(currentActivePlanCode)
        : "Free")
  ).trim() || "Free";

  const pendingTargetPlanDisplayName = String(
    (pendingChange as any)?.target_plan_name || ""
  ).trim() ||
    (String((pendingChange as any)?.target_plan_code || "").trim()
      ? humanizePlanCode(String((pendingChange as any)?.target_plan_code || ""))
      : "Pending");
  const credits = overview?.credits || null;
  const header = overview?.header || null;
  const actions = overview?.allowed_actions || null;
  const messages = overview?.messages || null;

  const overviewLoose = asLooseRecord(overview);
  const creditsLoose = asLooseRecord(credits);
  const headerLoose = asLooseRecord(header);
  const messagesLoose = asLooseRecord(messages);
  const planSummary = asLooseRecord(looseGet(overviewLoose, "plan_summary"));
  const pricingSummary = asLooseRecord(looseGet(overviewLoose, "pricing_summary"));
  const usageSummary = asLooseRecord(looseGet(overviewLoose, "usage_summary"));

  const headerPlanLabel =
    currentPlanDisplayName || cleanString(looseGet(headerLoose, "plan_label")) || "Free";
  const headerBillingValueLabel = cleanString(looseGet(headerLoose, "billing_value_label"));
  const statusTitle = cleanString(looseGet(messagesLoose, "status_title"));
  const statusBody = cleanString(looseGet(messagesLoose, "status_body"));

  const rawNormalizedAvailableCredits = firstNumericValue(
    looseGet(creditsLoose, "total_available"),
    looseGet(creditsLoose, "total_spendable"),
    looseGet(pricingSummary, "total_available"),
    looseGet(usageSummary, "total_available"),
    looseGet(headerLoose, "total_available"),
    looseGet(overviewLoose, "total_available"),
    looseGet(creditsLoose, "available_credits"),
    looseGet(pricingSummary, "available_credits"),
    looseGet(usageSummary, "available_credits"),
    looseGet(headerLoose, "available_credits"),
    looseGet(overviewLoose, "available_credits"),
    looseGet(creditsLoose, "spendable_credits"),
    looseGet(pricingSummary, "spendable_credits"),
    // Entitlement/cycle remaining is only a last-resort fallback.
    looseGet(creditsLoose, "included_credits_remaining"),
    looseGet(pricingSummary, "included_credits_remaining"),
    looseGet(usageSummary, "included_credits_remaining"),
    looseGet(planSummary, "included_credits_remaining")
  );

  const normalizedReservedCredits = firstNumericValue(
    looseGet(creditsLoose, "reserved_credits"),
    looseGet(pricingSummary, "reserved_credits"),
    looseGet(usageSummary, "reserved_credits"),
    looseGet(headerLoose, "reserved_credits")
  );

  const normalizedUsedCredits = firstNumericValue(
    looseGet(creditsLoose, "included_used"),
    looseGet(creditsLoose, "included_credits_used"),
    looseGet(pricingSummary, "included_used"),
    looseGet(pricingSummary, "included_credits_used"),
    looseGet(usageSummary, "included_used"),
    looseGet(usageSummary, "included_credits_used"),
    looseGet(planSummary, "included_credits_used"),
    looseGet(creditsLoose, "used_credits"),
    looseGet(pricingSummary, "used_credits"),
    looseGet(usageSummary, "used_credits"),
    looseGet(headerLoose, "used_credits"),
    looseGet(overviewLoose, "used_credits"),
    looseGet(creditsLoose, "consumed_credits"),
    looseGet(pricingSummary, "consumed_credits"),
    // Entitlement/cycle used is only a last-resort fallback.
    looseGet(creditsLoose, "included_credits_used"),
    looseGet(pricingSummary, "included_credits_used"),
    looseGet(planSummary, "included_credits_used")
  );

  const normalizedTotalCredits = firstNumericValue(
    looseGet(planSummary, "included_credits_total"),
    looseGet(creditsLoose, "included_credits_total"),
    looseGet(creditsLoose, "credit_cap"),
    looseGet(creditsLoose, "monthly_credit_cap"),
    looseGet(pricingSummary, "included_credits_total"),
    looseGet(pricingSummary, "total_credits"),
    looseGet(pricingSummary, "credit_cap"),
    looseGet(usageSummary, "total_credits"),
    looseGet(usageSummary, "credit_cap"),
    looseGet(headerLoose, "total_credits"),
    looseGet(creditsLoose, "total_credits")
  );

  const normalizedWalletCredits = firstNumericValue(
    looseGet(creditsLoose, "wallet_available"),
    looseGet(creditsLoose, "topup_available"),
    looseGet(creditsLoose, "top_up_available"),
    looseGet(creditsLoose, "purchased_available"),
    looseGet(creditsLoose, "purchased_credits_available"),
    looseGet(pricingSummary, "wallet_available"),
    looseGet(pricingSummary, "topup_available"),
    looseGet(pricingSummary, "top_up_available"),
    looseGet(pricingSummary, "purchased_available"),
    looseGet(pricingSummary, "purchased_credits_available"),
    looseGet(usageSummary, "wallet_available"),
    looseGet(usageSummary, "topup_available"),
    looseGet(usageSummary, "purchased_available"),
    looseGet(headerLoose, "wallet_available"),
    looseGet(headerLoose, "topup_available"),
    looseGet(headerLoose, "purchased_available"),
    looseGet(creditsLoose, "wallet_credits"),
    looseGet(creditsLoose, "wallet_balance_credits"),
    looseGet(creditsLoose, "topup_credits_remaining"),
    looseGet(creditsLoose, "top_up_credits_remaining"),
    looseGet(creditsLoose, "purchased_credits_remaining"),
    looseGet(pricingSummary, "wallet_credits"),
    looseGet(pricingSummary, "wallet_balance_credits"),
    looseGet(pricingSummary, "topup_credits_remaining"),
    looseGet(pricingSummary, "top_up_credits_remaining"),
    looseGet(pricingSummary, "purchased_credits_remaining"),
    looseGet(usageSummary, "wallet_credits"),
    looseGet(usageSummary, "wallet_balance_credits"),
    looseGet(headerLoose, "wallet_credits"),
    looseGet(headerLoose, "wallet_balance_credits")
  );

  const normalizedAvailableCredits = deriveRemainingCredits(
    rawNormalizedAvailableCredits,
    normalizedTotalCredits,
    normalizedUsedCredits,
    normalizedReservedCredits
  );

  const normalizedIncludedAvailableCredits = firstNumericValue(
    looseGet(creditsLoose, "included_available"),
    looseGet(creditsLoose, "included_credits_remaining"),
    looseGet(pricingSummary, "included_available"),
    looseGet(pricingSummary, "included_credits_remaining"),
    looseGet(usageSummary, "included_available"),
    looseGet(usageSummary, "included_credits_remaining"),
    looseGet(planSummary, "included_credits_remaining")
  );

  const normalizedIncludedUsedCredits = firstNumericValue(
    looseGet(creditsLoose, "included_used"),
    looseGet(creditsLoose, "included_credits_used"),
    looseGet(pricingSummary, "included_used"),
    looseGet(pricingSummary, "included_credits_used"),
    looseGet(usageSummary, "included_used"),
    looseGet(usageSummary, "included_credits_used"),
    looseGet(planSummary, "included_credits_used"),
    normalizedUsedCredits
  );

  const normalizedExtraCredits = Math.max(0, Math.round(normalizedWalletCredits ?? 0));

  const settlementRaw = String(
    overview?.settlement_mode || overview?.billing_mode || ""
  )
    .trim()
    .toLowerCase();

  const isPostpaidLike = settlementRaw.includes("postpaid");

  const normalizedHeaderUsageLabel = isPostpaidLike
    ? buildPostpaidUsageLabel(
        normalizedUsedCredits,
        normalizedReservedCredits
      )
    : `${formatWhole(normalizedAvailableCredits)} available • ${formatWhole(
        normalizedReservedCredits,
        "0"
      )} reserved`;

  const planCreditLine = buildPlanCreditLine({
    includedAvailable: normalizedIncludedAvailableCredits,
    includedTotal: normalizedTotalCredits,
    includedUsed: normalizedIncludedUsedCredits,
  });
  const includedCreditTileLabel = buildIncludedCreditTileLabel({
    includedAvailable: normalizedIncludedAvailableCredits,
    includedTotal: normalizedTotalCredits,
    includedUsed: normalizedIncludedUsedCredits,
  });
  const extraCreditLine = buildExtraCreditLine(normalizedExtraCredits);
  const normalizedIncludedLabel = planCreditLine;
  const renewalDateLabel = formatDate(currentSubscription?.current_period_end);
  const reservationLine = `${formatCredits(normalizedReservedCredits, "0 credits")} currently reserved for in-progress jobs`;

  const currentCycleUsagePercent =
    !isPostpaidLike &&
    normalizedUsedCredits != null &&
    normalizedTotalCredits != null &&
    normalizedTotalCredits > 0
      ? roundTo2(
          Math.max(
            0,
            Math.min(
              (Number(normalizedUsedCredits) /
                Math.max(Number(normalizedTotalCredits), 1)) *
                100,
              100
            )
          )
        )
      : 0;

  const onSelectPlan = (planCode: string) => {
    const rawPlan = findRawPlanItem(planCatalog, planCode);
    const metadata = asLooseRecord(rawPlan.metadata || rawPlan.metadata_json);

    const appleProductId = isAppleBilling
      ? firstNonEmptyString(
          rawPlan.apple_product_id,
          rawPlan.ios_product_id,
          looseGet(metadata, "apple_product_id"),
          looseGet(metadata, "ios_product_id"),
          appleSubscriptionProductIdForPlan(planCode)
        )
      : null;

    const googleProductId = isGooglePlayBilling
      ? firstNonEmptyString(
          rawPlan.google_product_id,
          rawPlan.android_product_id,
          looseGet(metadata, "google_product_id"),
          looseGet(metadata, "android_product_id"),
          googleSubscriptionProductIdForPlan(planCode)
        )
      : null;

    const googleBasePlanId = isGooglePlayBilling
      ? firstNonEmptyString(
          rawPlan.google_base_plan_id,
          rawPlan.base_plan_id,
          looseGet(metadata, "google_base_plan_id"),
          looseGet(metadata, "base_plan_id"),
          googleSubscriptionBasePlanIdForPlan(planCode)
        )
      : null;

    router.push({
      pathname: "/pricing/upgrade-confirm",
      params: {
        planCode,
        source,
        workflow,
        intent,
        requiredFeature: requiredFeature || undefined,
        purchaseProvider,
        appleProductId: appleProductId || undefined,
        googleProductId: googleProductId || undefined,
        googleBasePlanId: googleBasePlanId || undefined,
      },
    });
  };

  const [portalBusy, setPortalBusy] = useState(false);
  const [subActionBusy, setSubActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const openManageBilling = async () => {
    try {
      setPortalBusy(true);
      setActionError("");
      setActionMessage("");

      const result = await PaymentsApi.apiCreateCustomerPortalSession({
        countryCode,
        returnUrl: PaymentsApi.buildBillingReturnUrl("success"),
      });

      if (result?.portal_url) {
        await Linking.openURL(result.portal_url);
      } else {
        throw new Error("Billing portal URL was not returned.");
      }
    } catch (e: any) {
      setActionError(
        String(e?.message || e || "Unable to open billing management.")
      );
    } finally {
      setPortalBusy(false);
    }
  };

  const handleCancelAtPeriodEnd = async () => {
    try {
      setSubActionBusy(true);
      setActionError("");
      setActionMessage("");

      const result = await PaymentsApi.apiCancelSubscription({
        countryCode,
        returnUrl: PaymentsApi.buildBillingReturnUrl("success"),
      });

      if (result?.portal_url) {
        await Linking.openURL(result.portal_url);
        return;
      }

      await refreshBillingQueries(queryClient, countryCode);
      await Promise.all([refetchOverview(), refetchCatalog()]);
      setActionMessage(result?.message || "Cancellation scheduled.");
    } catch (e: any) {
      setActionError(
        String(e?.message || e || "Unable to schedule cancellation.")
      );
    } finally {
      setSubActionBusy(false);
    }
  };

  const handleReactivate = async () => {
    try {
      setSubActionBusy(true);
      setActionError("");
      setActionMessage("");

      const result = await PaymentsApi.apiReactivateSubscription({
        countryCode,
        returnUrl: PaymentsApi.buildBillingReturnUrl("success"),
      });

      if (result?.portal_url) {
        await Linking.openURL(result.portal_url);
        return;
      }

      await refreshBillingQueries(queryClient, countryCode);
      await Promise.all([refetchOverview(), refetchCatalog()]);
      setActionMessage(result?.message || "Subscription reactivated.");
    } catch (e: any) {
      setActionError(
        String(e?.message || e || "Unable to reactivate subscription.")
      );
    } finally {
      setSubActionBusy(false);
    }
  };

  const loading =
    overviewLoading || overviewFetching || catalogLoading || catalogFetching;

  const currentPriceLabel = deriveCurrentPlanPriceLabel(
    overview,
    currentPlanDisplayName
  );

  const goToTopUpCredits = useCallback(() => {
    router.push({
      pathname: "/pricing/top-up",
      params: { source: "billing", workflow, intent: "topup" },
    });
  }, [workflow]);

  return (
    <View style={styles.root}>
      <DFHeader
        subtitle="plan & billing"
        planLabel={headerPlanLabel}
        usageLabel={normalizedHeaderUsageLabel}
        availableCredits={normalizedAvailableCredits}
        reservedCredits={normalizedReservedCredits}
        usedCredits={normalizedUsedCredits}
        totalCredits={normalizedTotalCredits}
        displayKindOverride={isPostpaidLike ? "postpaid" : "credits"}
        billingValueLabelOverride={isPostpaidLike ? headerBillingValueLabel : null}
        onMenuPress={() => router.back()}
        onPressMeta={goToTopUpCredits}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {billingResult ? (
          <View
            style={[
              styles.banner,
              billingResult === "success"
                ? styles.bannerSuccess
                : styles.bannerNeutral,
            ]}
          >
            <Text style={styles.bannerTitle}>
              {billingResult === "success"
                ? "Refreshing billing status"
                : "Checkout canceled"}
            </Text>
            <Text style={styles.bannerBody}>
              {billingResult === "success"
                ? "We are confirming your updated plan, entitlements, and credits now."
                : "No changes were made. You can review plans and try again when ready."}
            </Text>
          </View>
        ) : null}

        {!!pendingChange ? (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingTitle}>
              {statusTitle || "Pending billing change"}
            </Text>
            <Text style={styles.pendingBody}>
              {statusBody ||
                "A billing change is pending on your current subscription timeline."}
            </Text>
            <Row
              label="Current plan"
              value={String(currentPlanDisplayName)}
            />
            <Row
              label="Target plan"
              value={String(pendingTargetPlanDisplayName)}
            />
            {pendingChange?.effective_at ? (
              <Row
                label="Effective at"
                value={String(pendingChange.effective_at)}
              />
            ) : null}
            {pendingChange?.status ? (
              <Row
                label="Status"
                value={stringifyState(String(pendingChange.status))}
              />
            ) : null}
          </View>
        ) : null}

        <UsageAndPlanCard
          planName={String(currentPlanDisplayName)}
          monthLabel="Current cycle"
          totalUsagePercent={currentCycleUsagePercent}
          walletBalance={formatCredits(normalizedExtraCredits, "0 credits")}
          monthlySpend={currentPriceLabel}
          reservedAmount={formatCredits(normalizedReservedCredits, "0 credits")}
          includedUsageLabel={includedCreditTileLabel || "Refreshing live usage"}
          billingModeLabel={stringifyState(
            overview?.settlement_mode || overview?.billing_mode,
            "Refreshing"
          )}
          entitlementNote={
            requiredFeature
              ? `${requiredFeature} is required for this journey. Your live plan and credit status are shown here before you continue.`
              : statusBody || "Your live billing state is shown here."
          }
        />

        <View style={styles.topupPromptCard} testID="plan-billing-topup-prompt">
          <View style={styles.topupPromptIcon}>
            <Ionicons name="flash-outline" size={20} color={Colors.dark.tintSoft} />
          </View>
          <View style={styles.topupPromptBody}>
            <Text style={styles.topupPromptTitle}>Need more credits?</Text>
            <Text style={styles.topupPromptText}>
              Buy extra credits anytime without changing your plan. Starter Pack 1,000 • Value Pack 5,000 • Pro Pack 15,000.
            </Text>
            <Text style={styles.topupPromptRail}>
              {isAppleBilling
                ? "Uses Apple In-App Purchase on iOS."
                : isGooglePlayBilling
                  ? "Uses Google Play Billing on Android."
                  : "Uses Stripe checkout on web."}
            </Text>
          </View>
          <Pressable
            testID="plan-billing-topup-prompt-button"
            accessibilityRole="button"
            accessibilityLabel="Top up credits"
            style={styles.topupPromptButton}
            onPress={goToTopUpCredits}
          >
            <Text style={styles.topupPromptButtonText}>Top up</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>What you have now</Text>
            <View style={styles.sectionHeaderActions}>
              <Pressable
                testID="plan-billing-topup-header-button"
                accessibilityRole="button"
                accessibilityLabel="Top up credits"
                style={[styles.manageBtn, styles.topupHeaderBtn]}
                onPress={goToTopUpCredits}
              >
                <Text style={[styles.manageBtnText, styles.topupHeaderBtnText]}>
                  Top up credits
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.manageBtn,
                  (portalBusy || !actions?.can_manage_billing) &&
                    styles.manageBtnDisabled,
                ]}
                onPress={openManageBilling}
                disabled={portalBusy || !actions?.can_manage_billing}
              >
                <Text style={styles.manageBtnText}>
                  {portalBusy ? "Opening..." : "Manage billing"}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.infoCard}>
            <Row label="Current plan" value={String(currentPlanDisplayName)} />
            <Row label="Currency" value={String(overview?.currency || "USD")} />
            <Row
              label="Subscription state"
              value={stringifyState(currentSubscription?.subscription_state)}
            />
            <Row
              label="Entitlement state"
              value={stringifyState(currentSubscription?.entitlement_state)}
            />
            <Row
              label="Settlement"
              value={stringifyState(
                overview?.settlement_mode || overview?.billing_mode
              )}
            />
            <Row label="Available now" value={formatCredits(normalizedAvailableCredits)} />
            <Row label="Plan credits" value={planCreditLine} />
            <Row label="Extra top-up credits" value={extraCreditLine} />
            <View style={styles.inlineTopupCard}>
              <View style={styles.inlineTopupCopy}>
                <Text style={styles.inlineTopupTitle}>Need more credits?</Text>
                <Text style={styles.inlineTopupText}>
                  Starter, Value, and Pro credit packs are available without changing your plan.
                </Text>
              </View>
              <Pressable
                testID="plan-billing-inline-buy-credits-button"
                accessibilityRole="button"
                accessibilityLabel="Buy credits"
                style={styles.inlineTopupButton}
                onPress={goToTopUpCredits}
              >
                <Text style={styles.inlineTopupButtonText}>Buy credits</Text>
              </Pressable>
            </View>
            <Row label="Reservations" value={reservationLine} />
            <Row label="Renews on" value={renewalDateLabel} />
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.miniSectionTitle}>Reservations and ledger</Text>
            <Text style={styles.sectionHint}>
              In-progress creations temporarily reserve credits. Completed jobs commit ledger entries; failed or canceled jobs release reservations.
            </Text>
            <Row label="Reserved now" value={formatCredits(normalizedReservedCredits, "0 credits")} />
            <Row label="Used this cycle" value={formatCredits(normalizedUsedCredits, "0 credits")} />
          </View>

          <View style={styles.actionsRow}>
            {actions?.can_cancel ? (
              <Pressable
                style={[
                  styles.secondaryActionBtn,
                  subActionBusy && styles.manageBtnDisabled,
                ]}
                onPress={handleCancelAtPeriodEnd}
                disabled={subActionBusy}
              >
                <Text style={styles.secondaryActionText}>
                  {subActionBusy ? "Working..." : "Cancel at period end"}
                </Text>
              </Pressable>
            ) : null}

            {actions?.can_reactivate ? (
              <Pressable
                style={[
                  styles.primaryInlineBtn,
                  subActionBusy && styles.manageBtnDisabled,
                ]}
                onPress={handleReactivate}
                disabled={subActionBusy}
              >
                <Text style={styles.primaryInlineText}>
                  {subActionBusy ? "Working..." : "Reactivate"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {actionMessage ? (
            <Text style={styles.successText}>{actionMessage}</Text>
          ) : null}
          {actionError ? (
            <Text style={styles.errorText}>{actionError}</Text>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={Colors.dark.tintSoft} />
            <Text style={styles.loadingText}>Loading live billing data…</Text>
          </View>
        ) : null}

        {!loading && (overviewError || catalogError) ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              Unable to load live billing data
            </Text>
            <Text style={styles.errorText}>
              {String(
                (overviewError as any)?.message ||
                  (catalogError as any)?.message ||
                  "Please try again shortly."
              )}
            </Text>
          </View>
        ) : null}

        {!loading && !overviewError && !catalogError ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Compare plans</Text>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: "/pricing/compare",
                    params: {
                      source,
                      workflow,
                      intent,
                      requiredFeature: requiredFeature || undefined,
                    },
                  })
                }
              >
                <Text style={styles.linkText}>Full comparison</Text>
              </Pressable>
            </View>

            {statusBody ? (
              <Text style={styles.sectionHint}>{statusBody}</Text>
            ) : null}

            {planOptions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No live plans available</Text>
                <Text style={styles.emptyText}>
                  The pricing service did not return any plan tiles yet.
                </Text>
              </View>
            ) : (
              <View style={styles.planList}>
                {planOptions.map((option) => (
                  <ComparePlanTile
                    key={option.planCode}
                    option={option}
                    onPressSelect={onSelectPlan}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.stickyTopupBar} testID="plan-billing-sticky-topup-bar">
        <View style={styles.stickyTopupCopy}>
          <Text style={styles.stickyTopupTitle}>Need more credits?</Text>
          <Text style={styles.stickyTopupText}>Add credit packs without changing your plan.</Text>
        </View>
        <Pressable
          testID="plan-billing-sticky-topup-button"
          accessibilityRole="button"
          accessibilityLabel="Top up credits"
          style={styles.stickyTopupButton}
          onPress={goToTopUpCredits}
        >
          <Ionicons name="flash-outline" size={16} color="#2A1606" />
          <Text style={styles.stickyTopupButtonText}>Top up credits</Text>
        </Pressable>
      </View>

      <BillingFooterNav />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.dark.background },
  content: { padding: Spacing.lg, paddingBottom: 188, gap: Spacing.lg },
  banner: { borderRadius: Radii.xxl, padding: Spacing.lg, borderWidth: 1 },
  bannerSuccess: {
    backgroundColor: Colors.dark.cardElevated,
    borderColor: Colors.dark.tintSoft,
  },
  bannerNeutral: {
    backgroundColor: Colors.dark.cardElevated,
    borderColor: Colors.dark.border,
  },
  bannerTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 16,
    fontWeight: "800",
  },
  bannerBody: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  pendingCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.24)",
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
  },
  pendingTitle: {
    color: Colors.dark.tintSoft,
    fontSize: 16,
    fontWeight: "800",
  },
  pendingBody: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 6,
  },
  section: { gap: 12 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  sectionHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
  },
  sectionTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  sectionHint: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  linkText: {
    color: Colors.dark.tintSoft,
    fontSize: 13,
    fontWeight: "700",
  },
  manageBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radii.pill,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  manageBtnDisabled: { opacity: 0.7 },
  manageBtnText: {
    color: Colors.dark.textPrimary,
    fontSize: 12,
    fontWeight: "800",
  },
  stickyTopupBar: {
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.dark.cardElevated,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(248,184,72,0.24)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stickyTopupCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stickyTopupTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  stickyTopupText: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  stickyTopupButton: {
    minHeight: 44,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.tint,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
  },
  stickyTopupButtonText: {
    color: "#2A1606",
    fontSize: 13,
    fontWeight: "900",
  },
  topupHeaderBtn: {
    backgroundColor: Colors.dark.tint,
    borderColor: Colors.dark.tint,
  },
  topupHeaderBtnText: {
    color: "#2A1606",
  },
  inlineTopupCard: {
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.28)",
    backgroundColor: "rgba(248,184,72,0.08)",
    padding: Spacing.md,
    gap: 10,
  },
  inlineTopupCopy: {
    gap: 3,
  },
  inlineTopupTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  inlineTopupText: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  inlineTopupButton: {
    minHeight: 42,
    borderRadius: Radii.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.tint,
    paddingHorizontal: 14,
  },
  inlineTopupButtonText: {
    color: "#2A1606",
    fontSize: 13,
    fontWeight: "900",
  },
  topupPromptCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.34)",
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    gap: 12,
    ...Shadows.card,
  },
  topupPromptIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(248,184,72,0.13)",
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.24)",
  },
  topupPromptBody: {
    gap: 4,
  },
  topupPromptTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 16,
    fontWeight: "900",
  },
  topupPromptText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  topupPromptRail: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  topupPromptButton: {
    minHeight: 46,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.tint,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  topupPromptButtonText: {
    color: "#2A1606",
    fontSize: 14,
    fontWeight: "900",
  },
  miniSectionTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 6,
  },
  infoCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
  },
  rowKey: { color: Colors.dark.textMuted, fontSize: 13, flex: 1 },
  rowValue: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    maxWidth: "55%",
    textAlign: "right",
  },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  secondaryActionBtn: {
    minHeight: 44,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryActionText: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  primaryInlineBtn: {
    minHeight: 44,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.tint,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryInlineText: {
    color: "#2A1606",
    fontSize: 13,
    fontWeight: "800",
  },
  successText: { color: "#7dffb0", fontSize: 13, lineHeight: 18 },
  errorText: { color: "#ff9a9a", fontSize: 13, lineHeight: 18 },
  loadingCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    alignItems: "center",
    gap: 10,
  },
  loadingText: { color: Colors.dark.textSecondary, fontSize: 13 },
  errorCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(255,120,120,0.24)",
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
  },
  errorTitle: { color: "#ffb5b5", fontSize: 15, fontWeight: "700" },
  emptyCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
  },
  emptyTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  planList: { gap: 12 },
  compareCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    gap: 12,
    ...Shadows.card,
  },
  compareCardCurrent: {
    borderColor: "rgba(125,255,176,0.38)",
  },
  compareCardRecommended: {
    borderColor: "rgba(248,184,72,0.34)",
  },
  compareHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  compareHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  compareTitleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  compareTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  compareBadge: {
    borderRadius: Radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(248,184,72,0.18)",
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.34)",
  },
  compareBadgeCurrent: {
    backgroundColor: "rgba(125,255,176,0.16)",
    borderColor: "rgba(125,255,176,0.34)",
  },
  compareBadgeText: {
    color: Colors.dark.textPrimary,
    fontSize: 10,
    fontWeight: "900",
  },
  compareSummary: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  comparePricePill: {
    alignSelf: "flex-start",
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  comparePrice: {
    color: Colors.dark.tintSoft,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "right",
  },
  compareBullets: {
    gap: 6,
  },
  compareBullet: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  compareDisabledReason: {
    color: "#ffb5b5",
    fontSize: 12,
    lineHeight: 17,
  },
  compareActionBtn: {
    minHeight: 46,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.tint,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  compareActionBtnDisabled: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  compareActionText: {
    color: "#2A1606",
    fontSize: 13,
    fontWeight: "900",
  },
  compareActionTextDisabled: {
    color: Colors.dark.textMuted,
  },
  footerWrap: {
    backgroundColor: DF.night,
    borderTopColor: "rgba(255,255,255,0.10)",
    borderTopWidth: 1,
    height: 72,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  footerNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerItem: {
    minWidth: 74,
    maxWidth: 92,
    marginHorizontal: 6,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.1,
    marginTop: 2,
    color: "rgba(255,255,255,0.62)",
  },
});