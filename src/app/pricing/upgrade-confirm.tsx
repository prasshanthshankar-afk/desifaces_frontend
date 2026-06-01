import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { Colors, Radii, Spacing, Shadows } from "../../../constants/theme";
import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import * as PaymentsApi from "../../core/payments/apiPayments";
import {
  appleSubscriptionProductIdForPlan,
  isAppleBillingPlatform,
  purchaseAppleSubscriptionAndConfirm,
} from "../../core/payments/appleIap";
import {
  googleSubscriptionBasePlanIdForPlan,
  googleSubscriptionProductIdForPlan,
  purchaseGoogleSubscriptionAndConfirm,
} from "../../core/payments/googlePlayIap";

type PlanUiMeta = {
  planCode: string;
  planName: string;
  priceLabel: string;
  billingCycle: string;
  renewalLabel: string;
  summary: string;
  entitlements: string[];
  billingFamily: string;
  intervalCode: string;
  contactSales?: boolean;
  action?: string;
  ctaLabel?: string;
  ctaEnabled?: boolean;
  appleProductId?: string | null;
  googleProductId?: string | null;
  googleBasePlanId?: string | null;
  stripePriceId?: string | null;
  metadata?: Record<string, any> | null;
};

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return String(value ?? fallback);
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

function asRecord(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function platformPurchaseProvider(rawProvider: string): "apple_iap" | "google_play" | "stripe" {
  // Native platform billing must always win over stale/deep-link route params.
  // This prevents Android builds from accidentally falling through to Stripe
  // when an old compare screen or cached route passes purchaseProvider=stripe.
  if (Platform.OS === "ios" && isAppleBillingPlatform()) return "apple_iap";
  if (Platform.OS === "android") return "google_play";

  const normalized = String(rawProvider || "").trim().toLowerCase();
  if (normalized === "apple_iap" || normalized === "google_play" || normalized === "stripe") {
    return normalized as "apple_iap" | "google_play" | "stripe";
  }
  return "stripe";
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

function formatWhole(value?: number | null, fallback = "0") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.max(0, Math.round(value))}`;
}

function formatCredits(value?: number | null, fallback = "0 credits") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.max(0, Math.round(value))} credits`;
}

function deriveRemainingCredits(
  rawAvailable: unknown,
  totalCredits: unknown,
  usedCredits: unknown,
  reservedCredits: unknown
): number | null {
  const raw = firstNumericValue(rawAvailable);
  const total = firstNumericValue(totalCredits);
  const used = Math.max(0, firstNumericValue(usedCredits) ?? 0);
  const reserved = Math.max(0, firstNumericValue(reservedCredits) ?? 0);

  if (total != null && total > 0) {
    const derived = Math.max(0, total - used - reserved);
    if (raw == null) return derived;
    return Math.abs(raw - derived) > 1 ? derived : raw;
  }

  return raw;
}

function buildCreditUsageLabel(
  availableCredits?: number | null,
  reservedCredits?: number | null,
  usedCredits?: number | null,
  totalCredits?: number | null
) {
  const parts = [
    `${formatWhole(availableCredits)} available now`,
    `${formatWhole(reservedCredits, "0")} reserved`,
    `${formatWhole(usedCredits)} used this cycle`,
  ];

  if (totalCredits != null && Number.isFinite(totalCredits) && totalCredits > 0) {
    parts.push(`${formatWhole(totalCredits)} included in current cycle`);
  }

  return parts.join(" • ");
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

function normalizePlanCode(rawPlanCode: string) {
  const normalized = String(rawPlanCode || "free").trim().toLowerCase();
  if (/(enterprise)/.test(normalized)) return "enterprise_contract_v1";
  if (/business_yearly/.test(normalized)) return "business_yearly_v1";
  if (/(business)/.test(normalized)) return "business_monthly_v1";
  if (/pro_yearly/.test(normalized)) return "pro_yearly_v1";
  if (/(pro|creator pro)/.test(normalized)) return "pro_monthly_v1";
  return "free";
}

function planRank(planCode?: string | null) {
  const code = normalizePlanCode(String(planCode || ""));
  if (code === "enterprise_contract_v1") return 40;
  if (code === "business_yearly_v1") return 31;
  if (code === "business_monthly_v1") return 30;
  if (code === "pro_yearly_v1") return 21;
  if (code === "pro_monthly_v1") return 20;
  return 10;
}

function makeIdempotencyKey(planCode: string, prefix = "billing") {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${planCode}-${Date.now()}-${rand}`;
}

const PLAN_CHANGE_CREDIT_RESET_ACKNOWLEDGEMENT_TEXT =
  "I understand that changing my plan may reset or overwrite unused plan-included credits from my current billing cycle. Purchased top-up credits are preserved.";

const PLAN_CHANGE_CREDIT_RESET_NOTICE =
  "Changing your plan can reset or overwrite unused plan-included credits from your current billing cycle. Purchased top-up credits are preserved. We recommend using your remaining plan-included credits before changing plans.";

const SOURCE_ROUTE_MAP: Record<string, string> = {
  face: "/(tabs)/face",
  audio: "/(tabs)/audio",
  fusion: "/(tabs)/fusion",
  dashboard: "/(tabs)/dashboard",
  settings: "/(tabs)/settings",
  billing: "/pricing/plan-billing",
  studio: "/pricing/plan-billing",
};

const BILLING_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  retry: 1,
};

async function refreshBillingQueries(
  queryClient: QueryClient,
  countryCode?: string
) {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const first = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
      return (
        typeof first === "string" &&
        (first.includes("payments") ||
          first.includes("pricing") ||
          first.includes("dashboard") ||
          first.includes("account"))
      );
    },
  });

  if (countryCode) {
    await Promise.all([
      queryClient.refetchQueries({
        queryKey: ["payments-overview-upgrade-confirm", countryCode],
        type: "active",
      }),
      queryClient.refetchQueries({
        queryKey: ["payments-plan-catalog-upgrade-confirm", countryCode],
        type: "active",
      }),
    ]);
  }
}

function itemToPlan(item: PaymentsApi.PaymentPlanCatalogItem): PlanUiMeta {
  const raw = item as Record<string, any>;
  const metadata = asRecord(raw.metadata || raw.metadata_json);
  const intervalCode = String(item.interval_code || "monthly");
  return {
    planCode: item.plan_code,
    planName: item.plan_name,
    priceLabel: item.price_label,
    billingCycle:
      intervalCode.includes("year")
        ? "Yearly"
        : intervalCode === "custom"
          ? "Custom"
          : "Monthly",
    renewalLabel:
      intervalCode === "custom"
        ? "Custom contract terms"
        : intervalCode.includes("year")
          ? "Renews yearly"
          : "Renews monthly",
    summary: String(item.summary || ""),
    entitlements: Array.isArray(item.feature_bullets) ? item.feature_bullets : [],
    billingFamily: String(item.billing_family || ""),
    intervalCode,
    contactSales: Boolean(item.contact_sales),
    action: item.action,
    ctaLabel: item.cta_label,
    ctaEnabled: typeof item.cta_enabled === "boolean" ? item.cta_enabled : true,
    appleProductId: firstNonEmptyString(
      raw.apple_product_id,
      raw.ios_product_id,
      metadata.apple_product_id,
      metadata.ios_product_id
    ),
    googleProductId: firstNonEmptyString(
      raw.google_product_id,
      raw.android_product_id,
      metadata.google_product_id,
      metadata.android_product_id
    ),
    googleBasePlanId: firstNonEmptyString(
      raw.google_base_plan_id,
      raw.base_plan_id,
      metadata.google_base_plan_id,
      metadata.base_plan_id
    ),
    stripePriceId: firstNonEmptyString(
      raw.stripe_price_id,
      raw.stripePriceId,
      raw.gateway_price_id,
      metadata.stripe_price_id,
      metadata.gateway_price_id
    ),
    metadata,
  };
}

function applyAccountActionPolicy(
  plan: PlanUiMeta,
  currentPlanCode: string,
  actions?: PaymentsApi.PaymentOverviewResponse["allowed_actions"] | null
): PlanUiMeta {
  const normalizedCurrent = normalizePlanCode(currentPlanCode);
  const normalizedTarget = normalizePlanCode(plan.planCode);
  const currentRank = planRank(normalizedCurrent);
  const targetRank = planRank(normalizedTarget);

  if (normalizedTarget === normalizedCurrent) {
    return {
      ...plan,
      action: "current",
      ctaLabel: "Current plan",
      ctaEnabled: false,
    };
  }

  if (plan.contactSales || plan.action === "contact_sales") {
    return {
      ...plan,
      action: "contact_sales",
      ctaLabel: plan.ctaLabel || "Contact sales",
      ctaEnabled: true,
    };
  }

  if (targetRank > currentRank) {
    if (actions?.can_upgrade === false) {
      return {
        ...plan,
        action: "manual_change",
        ctaLabel: "Contact support",
        ctaEnabled: true,
      };
    }
    return {
      ...plan,
      action: plan.action || "change",
      ctaEnabled: plan.ctaEnabled !== false,
    };
  }

  if (actions?.can_downgrade === false) {
    return {
      ...plan,
      action: "manual_change",
      ctaLabel: "Contact support",
      ctaEnabled: true,
    };
  }

  return {
    ...plan,
    action: plan.action || "downgrade",
    ctaEnabled: plan.ctaEnabled !== false,
  };
}

function buildSupportMailto(currentPlanName: string, targetPlanName: string) {
  const subject = encodeURIComponent("DesiFaces billing plan change request");
  const body = encodeURIComponent(
    `Hello DesiFaces support,\n\nI need help changing my plan.\nCurrent plan: ${currentPlanName}\nRequested plan: ${targetPlanName}\n\nPlease advise on the next steps.\n`
  );
  return `mailto:support@desifaces.ai?subject=${subject}&body=${body}`;
}

function buildSalesMailto(planName: string) {
  const subject = encodeURIComponent(`DesiFaces ${planName} plan inquiry`);
  const body = encodeURIComponent(
    `Hello DesiFaces sales,\n\nI would like to discuss the ${planName} plan.\n\nPlease contact me with next steps.\n`
  );
  return `mailto:sales@desifaces.ai?subject=${subject}&body=${body}`;
}

function BillingFooterNav() {
  const items = [
    { key: "dashboard", label: "Home", icon: "home-outline", route: "/(tabs)/dashboard" },
    { key: "face", label: "Face", icon: "person-outline", route: "/(tabs)/face" },
    { key: "audio", label: "Audio", icon: "mic-outline", route: "/(tabs)/audio" },
    { key: "fusion", label: "Fusion", icon: "videocam-outline", route: "/(tabs)/fusion" },
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

export default function UpgradeConfirmScreen() {
  const params = useLocalSearchParams<{
    planCode?: string;
    source?: string;
    workflow?: string;
    intent?: string;
    requiredFeature?: string;
    purchaseProvider?: string;
    appleProductId?: string;
    googleProductId?: string;
    googleBasePlanId?: string;
  }>();

  const queryClient = useQueryClient();
  const source = readString(params.source, "dashboard");
  const workflow = readString(params.workflow, source);
  const requiredFeature = readString(params.requiredFeature);
  const selectedPlanCode = normalizePlanCode(
    readString(params.planCode, "pro_monthly_v1")
  );
  const purchaseProvider = platformPurchaseProvider(readString(params.purchaseProvider, ""));
  const appleProductIdParam = readString(params.appleProductId, "");
  const googleProductIdParam = readString(params.googleProductId, "");
  const googleBasePlanIdParam = readString(params.googleBasePlanId, "");
  const returnRoute = SOURCE_ROUTE_MAP[source] || "/(tabs)/dashboard";

  const auth = useAuth() as any;
  const countryCode =
    auth?.countryCode ||
    auth?.country_code ||
    auth?.user?.countryCode ||
    auth?.user?.country_code ||
    "US";

  const isAppleBilling =
    Platform.OS === "ios" &&
    isAppleBillingPlatform() &&
    purchaseProvider === "apple_iap";
  const isGooglePlayBilling = Platform.OS === "android" && purchaseProvider === "google_play";
  const isStripeBilling = purchaseProvider === "stripe";
  const currentUserId = String(
    auth?.userId || auth?.user_id || auth?.user?.id || auth?.user?.user_id || ""
  ).trim();

  const {
    data: overview,
    isLoading: overviewLoading,
    isFetching: overviewFetching,
    refetch: refetchOverview,
  } = useQuery<PaymentsApi.PaymentOverviewResponse | null>({
    queryKey: ["payments-overview-upgrade-confirm", countryCode],
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
    queryKey: ["payments-plan-catalog-upgrade-confirm", countryCode],
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

  const planSummary = (overview as any)?.plan_summary || null;
  const pricingSummary = (overview as any)?.pricing_summary || null;
  const usageSummary = (overview as any)?.usage_summary || null;
  const credits = overview?.credits || null;
  const header = overview?.header || null;

  const rawAvailableCredits = firstNumericValue(
    planSummary?.included_credits_remaining,
    credits?.included_credits_remaining,
    credits?.available_credits,
    pricingSummary?.included_credits_remaining,
    pricingSummary?.available_credits,
    usageSummary?.available_credits
  );

  const normalizedReservedCredits = firstNumericValue(
    credits?.reserved_credits,
    pricingSummary?.reserved_credits,
    usageSummary?.reserved_credits
  );

  const normalizedUsedCredits = firstNumericValue(
    planSummary?.included_credits_used,
    credits?.included_credits_used,
    credits?.used_credits,
    pricingSummary?.included_credits_used,
    usageSummary?.used_credits
  );

  const normalizedTotalCredits = firstNumericValue(
    planSummary?.included_credits_total,
    credits?.included_credits_total,
    credits?.credit_cap,
    pricingSummary?.included_credits_total,
    pricingSummary?.total_credits,
    pricingSummary?.credit_cap,
    usageSummary?.total_credits,
    usageSummary?.credit_cap,
    header?.total_credits,
    credits?.total_credits
  );

  const normalizedAvailableCredits = deriveRemainingCredits(
    rawAvailableCredits,
    normalizedTotalCredits,
    normalizedUsedCredits,
    normalizedReservedCredits
  );

  const planIncludedAvailable = firstNumericValue(
    (credits as any)?.included_available,
    (pricingSummary as any)?.included_available,
    normalizedAvailableCredits
  );

  const topupCreditsAvailable = firstNumericValue(
    (credits as any)?.wallet_available,
    (pricingSummary as any)?.wallet_available,
    (pricingSummary as any)?.purchased_available
  );

  const totalAvailableCredits = firstNumericValue(
    (credits as any)?.total_available,
    (credits as any)?.total_spendable,
    (pricingSummary as any)?.total_available,
    (pricingSummary as any)?.total_spendable,
    normalizedAvailableCredits
  );

  const settlementRaw = String(
    overview?.settlement_mode || overview?.billing_mode || ""
  )
    .trim()
    .toLowerCase();

  const isPostpaidLike = settlementRaw.includes("postpaid");

  const normalizedUsageLabel = isPostpaidLike
    ? buildPostpaidUsageLabel(
        normalizedUsedCredits,
        normalizedReservedCredits
      )
    : buildCreditUsageLabel(
        normalizedAvailableCredits,
        normalizedReservedCredits,
        normalizedUsedCredits,
        normalizedTotalCredits
      );

  const liveCatalog = useMemo(() => {
    const items = Array.isArray(planCatalog?.items) ? planCatalog.items : [];
    return items.map(itemToPlan);
  }, [planCatalog]);

  const currentPlanCode = normalizePlanCode(
    overview?.current_plan?.plan_code ||
      overview?.current_subscription?.plan_code ||
      planCatalog?.current_plan_code ||
      "free"
  );

  const currentPlan = useMemo(() => {
    const found =
      liveCatalog.find(
        (x) => normalizePlanCode(x.planCode) === currentPlanCode
      ) ||
      (overview?.current_plan
        ? {
            planCode: String(overview.current_plan.plan_code || currentPlanCode),
            planName: String(overview.current_plan.plan_name || "Current plan"),
            priceLabel: String(overview.current_plan.price_label || ""),
            billingCycle: String(
              overview.current_plan.interval_code || "monthly"
            ).includes("year")
              ? "Yearly"
              : "Monthly",
            renewalLabel: "",
            summary: String(overview.current_plan.summary || ""),
            entitlements: Array.isArray(overview.current_plan.feature_bullets)
              ? overview.current_plan.feature_bullets
              : [],
            billingFamily: String(overview.current_plan.billing_family || ""),
            intervalCode: String(overview.current_plan.interval_code || "monthly"),
            contactSales: Boolean(overview.current_plan.contact_sales),
            action: "current",
            ctaLabel: "Current plan",
            ctaEnabled: false,
          }
        : null);

    return (
      found || {
        planCode: currentPlanCode,
        planName: currentPlanCode === "free" ? "Free" : currentPlanCode,
        priceLabel: "",
        billingCycle: "Monthly",
        renewalLabel: "",
        summary: "",
        entitlements: [],
        billingFamily: "free",
        intervalCode: "monthly",
        action: "current",
        ctaLabel: "Current plan",
        ctaEnabled: false,
      }
    );
  }, [currentPlanCode, liveCatalog, overview?.current_plan]);

  const selectedPlan = useMemo(() => {
    const found = liveCatalog.find(
      (x) => normalizePlanCode(x.planCode) === selectedPlanCode
    );
    const base =
      found || {
        planCode: selectedPlanCode,
        planName: selectedPlanCode,
        priceLabel: "",
        billingCycle: "Monthly",
        renewalLabel: "",
        summary: "",
        entitlements: [],
        billingFamily: "",
        intervalCode: "monthly",
        action: "unavailable",
        ctaLabel: "Loading plan",
        ctaEnabled: false,
      };

    return applyAccountActionPolicy(
      base,
      currentPlanCode,
      overview?.allowed_actions
    );
  }, [liveCatalog, selectedPlanCode, currentPlanCode, overview?.allowed_actions]);

  const selectedAppleProductId = useMemo(() => {
    if (!isAppleBilling) return null;
    return (
      appleProductIdParam ||
      selectedPlan.appleProductId ||
      appleSubscriptionProductIdForPlan(selectedPlan.planCode)
    );
  }, [isAppleBilling, appleProductIdParam, selectedPlan.appleProductId, selectedPlan.planCode]);

  const selectedGoogleProductId = useMemo(() => {
    if (!isGooglePlayBilling) return null;
    return (
      googleProductIdParam ||
      selectedPlan.googleProductId ||
      googleSubscriptionProductIdForPlan(selectedPlan.planCode)
    );
  }, [isGooglePlayBilling, googleProductIdParam, selectedPlan.googleProductId, selectedPlan.planCode]);

  const selectedGoogleBasePlanId = useMemo(() => {
    if (!isGooglePlayBilling) return null;
    return (
      googleBasePlanIdParam ||
      selectedPlan.googleBasePlanId ||
      googleSubscriptionBasePlanIdForPlan(selectedPlan.planCode)
    );
  }, [isGooglePlayBilling, googleBasePlanIdParam, selectedPlan.googleBasePlanId, selectedPlan.planCode]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [planCreditResetAcknowledged, setPlanCreditResetAcknowledged] = useState(false);

  const sessionIdempotencyKey = useMemo(
    () => makeIdempotencyKey(selectedPlan.planCode, "billing-checkout"),
    [selectedPlan.planCode]
  );

  const changeIdempotencyKey = useMemo(
    () => makeIdempotencyKey(selectedPlan.planCode, "billing-change"),
    [selectedPlan.planCode]
  );

  const successUrl = useMemo(
    () => PaymentsApi.buildBillingReturnUrl("success"),
    []
  );
  const cancelUrl = useMemo(
    () => PaymentsApi.buildBillingReturnUrl("cancel"),
    []
  );

  const isSelfServePlanChange = useMemo(() => {
    const current = normalizePlanCode(currentPlan.planCode);
    const target = normalizePlanCode(selectedPlan.planCode);
    if (!selectedPlan.ctaEnabled) return false;
    if (!current || !target || current === target) return false;
    if (selectedPlan.action === "current") return false;
    if (selectedPlan.action === "contact_sales" || selectedPlan.contactSales) return false;
    if (selectedPlan.action === "manual_change") return false;
    return true;
  }, [currentPlan.planCode, selectedPlan]);

  const isPeriodEndChange = useMemo(() => {
    if (!isSelfServePlanChange) return false;
    if (selectedPlan.action === "downgrade") return true;
    return planRank(selectedPlan.planCode) <= planRank(currentPlan.planCode);
  }, [currentPlan.planCode, isSelfServePlanChange, selectedPlan.action, selectedPlan.planCode]);

  useEffect(() => {
    setPlanCreditResetAcknowledged(false);
  }, [currentPlan.planCode, selectedPlan.planCode, purchaseProvider]);

  const planChangeWarningBody = useMemo(() => {
    if (!isSelfServePlanChange) return "";
    const timing = isPeriodEndChange
      ? "This change is expected to take effect at the end of your current billing period."
      : "This change may take effect immediately after the billing provider confirms it.";
    return [
      `You are changing from ${currentPlan.planName} to ${selectedPlan.planName}.`,
      PLAN_CHANGE_CREDIT_RESET_NOTICE,
      timing,
      `Current plan-included credits: ${formatCredits(planIncludedAvailable, "0 credits")}.`,
      `Purchased top-up credits preserved: ${formatCredits(topupCreditsAvailable, "0 credits")}.`,
      `Total credits currently available: ${formatCredits(totalAvailableCredits, "0 credits")}.`,
    ].join("\n\n");
  }, [
    currentPlan.planName,
    isPeriodEndChange,
    isSelfServePlanChange,
    planIncludedAvailable,
    selectedPlan.planName,
    topupCreditsAvailable,
    totalAvailableCredits,
  ]);

  const actionBlockedByAcknowledgement =
    isSelfServePlanChange && !planCreditResetAcknowledged;

  const actionCopy = useMemo(() => {
    if (!selectedPlan.ctaEnabled) return selectedPlan.ctaLabel || "Current plan";
    if (selectedPlan.action === "manual_change") return "Contact support";
    if (selectedPlan.action === "contact_sales" || selectedPlan.contactSales) {
      return selectedPlan.ctaLabel || "Contact sales";
    }
    return selectedPlan.ctaLabel || `Continue with ${selectedPlan.planName}`;
  }, [selectedPlan]);

  const noteText = useMemo(() => {
    if (selectedPlan.action === "current") {
      return "This plan is already active for your account.";
    }
    if (selectedPlan.action === "contact_sales" || selectedPlan.contactSales) {
      return "This plan is handled through DesiFaces sales rather than self-serve billing.";
    }
    if (selectedPlan.action === "manual_change") {
      return "This change is not available as a self-serve action for your current billing setup. Contact DesiFaces support for help.";
    }
    if (selectedPlan.action === "downgrade") {
      return "Downgrades should usually be scheduled for the end of the current billing period.";
    }
    if (selectedPlan.action === "upgrade" || selectedPlan.action === "change") {
      if (isAppleBilling) return "This plan change will be completed through Apple In-App Purchase. Your credits and features refresh after Apple confirms the subscription.";
      if (isGooglePlayBilling) return "This plan change will be completed through Google Play Billing. Your credits and features refresh after Google confirms the subscription.";
      return "This plan change will be completed through Stripe. Your credits and features refresh after checkout confirms.";
    }
    if (requiredFeature) {
      return `${requiredFeature} will be available after billing updates complete and the app refreshes your entitlements.`;
    }
    return "Your billing status will refresh after this action completes.";
  }, [selectedPlan, requiredFeature, isAppleBilling, isGooglePlayBilling]);

  const handleConfirm = async () => {
    try {
      setBusy(true);
      setError("");
      setMessage("");

      if (!selectedPlan.ctaEnabled || selectedPlan.action === "current") {
        setMessage("This is already your active plan.");
        return;
      }

      if (selectedPlan.action === "contact_sales" || selectedPlan.contactSales) {
        await Linking.openURL(buildSalesMailto(selectedPlan.planName));
        return;
      }

      if (selectedPlan.action === "manual_change") {
        await Linking.openURL(
          buildSupportMailto(currentPlan.planName, selectedPlan.planName)
        );
        return;
      }

      if (isSelfServePlanChange && !planCreditResetAcknowledged) {
        setError("Please confirm the plan-credit reset notice before changing plans.");
        return;
      }

      if (isAppleBilling) {
        if (!currentUserId) {
          throw new Error("Apple billing requires a signed-in user id.");
        }
        if (!selectedAppleProductId) {
          throw new Error("Apple product mapping was not found for this plan.");
        }

        const confirmed = await purchaseAppleSubscriptionAndConfirm({
          productId: selectedAppleProductId as any,
          userId: currentUserId,
          countryCode,
          currency: countryCode === "IN" ? "INR" : "USD",
        });

        await refreshBillingQueries(queryClient, countryCode);

        setMessage(
          confirmed?.current_period_end
            ? `Subscription confirmed. Current period ends on ${confirmed.current_period_end}.`
            : "Subscription confirmed."
        );

        router.replace({
          pathname: "/pricing/plan-billing",
          params: {
            billing_result: "success",
            source,
            workflow,
          },
        });
        return;
      }

      if (isGooglePlayBilling) {
        if (!currentUserId) {
          throw new Error("Google Play Billing requires a signed-in user id.");
        }
        if (!selectedGoogleProductId) {
          throw new Error("Google Play product mapping was not found for this plan.");
        }

        const confirmed = await purchaseGoogleSubscriptionAndConfirm({
          productId: selectedGoogleProductId as any,
          basePlanId: selectedGoogleBasePlanId || undefined,
          userId: currentUserId,
          countryCode,
          currency: countryCode === "IN" ? "INR" : "USD",
        });

        await refreshBillingQueries(queryClient, countryCode);

        setMessage(
          confirmed?.current_period_end
            ? `Google Play subscription confirmed. Current period ends on ${confirmed.current_period_end}.`
            : "Google Play subscription confirmed."
        );

        router.replace({
          pathname: "/pricing/plan-billing",
          params: {
            billing_result: "success",
            source,
            workflow,
          },
        });
        return;
      }

      if (!isStripeBilling) {
        throw new Error("Unsupported billing provider for this platform.");
      }

      if (Platform.OS === "ios" || Platform.OS === "android") {
        throw new Error(
          "Native app subscription changes must use Apple In-App Purchase or Google Play Billing. Stripe checkout is only allowed on web."
        );
      }

      const upgrade =
        planRank(selectedPlan.planCode) > planRank(currentPlan.planCode);
      const result = await PaymentsApi.apiChangeSubscription({
        targetPlanCode: selectedPlan.planCode,
        changeMode: upgrade ? "immediate" : "period_end",
        countryCode,
        idempotencyKey: upgrade
          ? sessionIdempotencyKey
          : changeIdempotencyKey,
        successUrl,
        cancelUrl,
        returnUrl: successUrl,
        creditResetAcknowledged: isSelfServePlanChange
          ? planCreditResetAcknowledged
          : false,
        creditResetAcknowledgedAt: isSelfServePlanChange
          ? new Date().toISOString()
          : undefined,
        creditResetAcknowledgementText: isSelfServePlanChange
          ? PLAN_CHANGE_CREDIT_RESET_ACKNOWLEDGEMENT_TEXT
          : undefined,
      });

      if (result.checkout_url) {
        await Linking.openURL(result.checkout_url);
        return;
      }
      if (result.portal_url) {
        await Linking.openURL(result.portal_url);
        return;
      }
      if (result.status === "contact_sales_required") {
        await Linking.openURL(buildSalesMailto(selectedPlan.planName));
        return;
      }
      if (result.status === "manual_change_required") {
        setMessage(result.message || "This change requires manual support.");
        return;
      }

      await refreshBillingQueries(queryClient, countryCode);

      setMessage(
        result?.effective_at
          ? `Billing change scheduled. It should take effect on ${result.effective_at}.`
          : result?.message || "Billing change submitted."
      );

      if (result.status === "scheduled" || result.status === "active") {
        router.replace({
          pathname: "/pricing/plan-billing",
          params: {
            billing_result: "success",
            source,
            workflow,
          },
        });
      }
    } catch (e: any) {
      setError(String(e?.message || e || "Unable to complete billing action."));
    } finally {
      setBusy(false);
    }
  };

  const loading =
    overviewLoading || overviewFetching || catalogLoading || catalogFetching;

  return (
    <View style={styles.root}>
      <DFHeader
        subtitle="confirm billing change"
        planLabel={header?.plan_label || currentPlan.planName}
        usageLabel={normalizedUsageLabel}
        availableCredits={normalizedAvailableCredits}
        reservedCredits={normalizedReservedCredits}
        usedCredits={normalizedUsedCredits}
        totalCredits={normalizedTotalCredits}
        displayKindOverride={isPostpaidLike ? "postpaid" : "credits"}
        billingValueLabelOverride={header?.billing_value_label || null}
        onMenuPress={() => router.back()}
        onPressMeta={() => router.push("/pricing/plan-billing")}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={Colors.dark.tintSoft} />
            <Text style={styles.loadingText}>Refreshing live billing data…</Text>
          </View>
        ) : null}

        {!loading && catalogError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to load live billing data</Text>
            <Text style={styles.errorText}>
              {String((catalogError as any)?.message || "Please try again shortly.")}
            </Text>
          </View>
        ) : null}

        {overview?.messages?.status_body ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>
              {overview.messages.status_title || "Billing note"}
            </Text>
            <Text style={styles.noteText}>{overview.messages.status_body}</Text>
          </View>
        ) : null}

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Selected plan</Text>
          <Text style={styles.heroTitle}>{selectedPlan.planName}</Text>
          <Text style={styles.heroPrice}>
            {selectedPlan.priceLabel || "Refreshing live pricing"}
          </Text>
          <Text style={styles.heroSummary}>
            {selectedPlan.summary || "Live plan details are being loaded from billing."}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Row label="Current plan" value={currentPlan.planName} />
          <Row label="Selected plan" value={selectedPlan.planName} />
          <Row label="Billing cycle" value={selectedPlan.billingCycle} />
          <Row label="Renewal" value={selectedPlan.renewalLabel} />
          <Row
            label="Change type"
            value={String(selectedPlan.action || "change").replace(/_/g, " ")}
          />
          <Row label="Available now" value={formatCredits(normalizedAvailableCredits)} />
          <Row
            label="Reserved"
            value={formatCredits(normalizedReservedCredits, "0 credits")}
          />
          <Row label="Used" value={formatCredits(normalizedUsedCredits, "0 credits")} />
          {normalizedTotalCredits != null ? (
            <Row
              label="Current cycle total"
              value={formatCredits(normalizedTotalCredits)}
            />
          ) : null}
          <Row label="Plan code" value={selectedPlan.planCode} />
          <Row label="Currency" value={countryCode === "IN" ? "INR" : "USD"} />
          <Row
            label="Billing provider"
            value={
              isAppleBilling
                ? "Apple In-App Purchase"
                : isGooglePlayBilling
                  ? "Google Play Billing"
                  : "Stripe"
            }
          />
          {isGooglePlayBilling && selectedGoogleProductId ? (
            <Row
              label="Google Play product"
              value={selectedGoogleBasePlanId ? `${selectedGoogleProductId} / ${selectedGoogleBasePlanId}` : selectedGoogleProductId}
            />
          ) : null}
          {isAppleBilling && selectedAppleProductId ? (
            <Row label="Apple product" value={selectedAppleProductId} />
          ) : null}
          {overview?.current_subscription?.current_period_end ? (
            <Row
              label="Current period ends"
              value={String(overview.current_subscription.current_period_end)}
            />
          ) : null}
          {requiredFeature ? (
            <Row label="Needed feature" value={requiredFeature} />
          ) : null}
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Current usage snapshot</Text>
          <Text style={styles.noteText}>{normalizedUsageLabel}</Text>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>What changes next</Text>
          <Text style={styles.noteText}>{noteText}</Text>
        </View>

        {isSelfServePlanChange ? (
          <View style={styles.warningCard}>
            <View style={styles.warningHeaderRow}>
              <Ionicons name="warning-outline" size={20} color="#FFD166" />
              <Text style={styles.warningTitle}>Confirm plan-credit reset</Text>
            </View>
            <Text style={styles.warningText}>{planChangeWarningBody}</Text>
            <Pressable
              style={styles.ackRow}
              onPress={() => setPlanCreditResetAcknowledged((value) => !value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: planCreditResetAcknowledged }}
              disabled={busy}
            >
              <View
                style={[
                  styles.checkbox,
                  planCreditResetAcknowledged && styles.checkboxChecked,
                ]}
              >
                {planCreditResetAcknowledged ? (
                  <Ionicons name="checkmark" size={15} color="#2A1606" />
                ) : null}
              </View>
              <Text style={styles.ackText}>
                {PLAN_CHANGE_CREDIT_RESET_ACKNOWLEDGEMENT_TEXT}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {selectedPlan.entitlements.length > 0 ? (
          <View style={styles.benefitsCard}>
            <Text style={styles.benefitsTitle}>Included with this plan</Text>
            {selectedPlan.entitlements.map((item) => (
              <View key={item} style={styles.benefitRow}>
                <View style={styles.benefitDot} />
                <Text style={styles.benefitText}>{item}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {message ? <Text style={styles.successText}>{message}</Text> : null}
        {error ? <Text style={styles.errorBodyText}>{error}</Text> : null}

        <Pressable
          style={[
            styles.primaryBtn,
            (busy || !selectedPlan.ctaEnabled || loading || actionBlockedByAcknowledgement) && styles.btnDisabled,
          ]}
          onPress={handleConfirm}
          disabled={busy || !selectedPlan.ctaEnabled || loading || actionBlockedByAcknowledgement}
        >
          {busy ? (
            <ActivityIndicator color="#2A1606" />
          ) : (
            <Text style={styles.primaryText}>{actionCopy}</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.replace(returnRoute as any)}
          disabled={busy}
        >
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>
      </ScrollView>

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
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: 112,
    gap: Spacing.lg,
  },
  loadingCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  errorCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(255,120,120,0.24)",
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
  },
  errorTitle: {
    color: "#ffb5b5",
    fontSize: 15,
    fontWeight: "700",
  },
  errorText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  heroCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.24)",
    borderRadius: Radii.xxl,
    padding: Spacing.xl,
    ...Shadows.card,
  },
  heroLabel: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  heroTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    marginTop: 6,
  },
  heroPrice: {
    color: Colors.dark.tintSoft,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 6,
  },
  heroSummary: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
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
  rowKey: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    flex: 1,
  },
  rowValue: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    maxWidth: "55%",
    textAlign: "right",
  },
  noteCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
  },
  noteTitle: {
    color: Colors.dark.tintSoft,
    fontSize: 15,
    fontWeight: "700",
  },
  noteText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  warningCard: {
    backgroundColor: "rgba(255, 209, 102, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 209, 102, 0.42)",
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
  },
  warningHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  warningTitle: {
    color: "#FFD166",
    fontSize: 15,
    fontWeight: "800",
  },
  warningText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  ackRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "rgba(255, 209, 102, 0.70)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: "#FFD166",
    borderColor: "#FFD166",
  },
  ackText: {
    flex: 1,
    color: Colors.dark.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  benefitsCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
  },
  benefitsTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 8,
  },
  benefitDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.dark.tint,
    marginTop: 6,
  },
  benefitText: {
    flex: 1,
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  successText: {
    color: "#7dffb0",
    fontSize: 13,
    lineHeight: 18,
  },
  errorBodyText: {
    color: "#ff9a9a",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    minHeight: 52,
    borderRadius: Radii.xl,
    backgroundColor: Colors.dark.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: {
    opacity: 0.7,
  },
  primaryText: {
    color: "#2A1606",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryBtn: {
    minHeight: 48,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: "700",
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