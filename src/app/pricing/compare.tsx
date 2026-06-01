import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Platform,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import { PlanCompareCard } from "../../components/pricing/PlanCompareCard";
import { Colors, Radii, Spacing, Shadows } from "../../../constants/theme";
import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";
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

function findRawPlanItem(
  catalog: PaymentsApi.PaymentPlanCatalogResponse | null | undefined,
  planCode: string
): Record<string, any> {
  const normalized = normalizePlanCode(planCode);
  const item = (Array.isArray(catalog?.items) ? catalog?.items : [])?.find(
    (row) => normalizePlanCode(row.plan_code) === normalized
  );
  return (item || {}) as Record<string, any>;
}

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return String(value ?? fallback);
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
    await queryClient.refetchQueries({
      queryKey: ["payments-plan-catalog-compare", countryCode],
      type: "active",
    });
    await queryClient.refetchQueries({
      queryKey: ["payments-overview-compare", countryCode],
      type: "active",
    });
  }
}

function normalizePlanCode(raw?: string | null) {
  const code = String(raw || "").trim().toLowerCase();
  if (!code) return "free";
  if (code.includes("enterprise")) return "enterprise_contract_v1";
  if (code.includes("business_yearly")) return "business_yearly_v1";
  if (code.includes("business")) return "business_monthly_v1";
  if (code.includes("pro_yearly")) return "pro_yearly_v1";
  if (code.includes("pro")) return "pro_monthly_v1";
  return "free";
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

function applyAccountActionPolicy(
  item: PaymentsApi.PaymentPlanCatalogItem,
  currentPlanCode: string,
  actions?: PaymentsApi.PaymentOverviewResponse["allowed_actions"] | null
) {
  const normalizedCurrent = normalizePlanCode(currentPlanCode);
  const normalizedTarget = normalizePlanCode(item.plan_code);
  const currentRank = planRank(normalizedCurrent);
  const targetRank = planRank(normalizedTarget);
  const isCurrent = normalizedTarget === normalizedCurrent;

  if (isCurrent) {
    return {
      ...item,
      is_current: true,
      action: "current",
      cta_label: "Current plan",
      cta_enabled: false,
      disabled_reason: undefined,
    };
  }

  if (item.contact_sales || item.action === "contact_sales") {
    return {
      ...item,
      action: "contact_sales",
      cta_label: item.cta_label || "Contact sales",
      cta_enabled: true,
    };
  }

  if (targetRank > currentRank) {
    if (actions?.can_upgrade === false) {
      return {
        ...item,
        action: "manual_change",
        cta_label: "Contact support",
        cta_enabled: true,
        disabled_reason:
          "This account requires manual support for plan upgrades.",
      };
    }
    return item;
  }

  if (actions?.can_downgrade === false) {
    return {
      ...item,
      action: "manual_change",
      cta_label: "Contact support",
      cta_enabled: true,
      disabled_reason:
        "This account requires manual support for downgrades or same-tier changes.",
    };
  }

  return item;
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

export default function ComparePlansScreen() {
  const params = useLocalSearchParams<{
    source?: string;
    workflow?: string;
    intent?: string;
    requiredFeature?: string;
  }>();

  const queryClient = useQueryClient();
  const auth = useAuth() as any;
  const source = readString(params.source, "studio");
  const workflow = readString(params.workflow, source);
  const requiredFeature = readString(params.requiredFeature);

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
    data: planCatalog,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<PaymentsApi.PaymentPlanCatalogResponse | null>({
    queryKey: ["payments-plan-catalog-compare", countryCode],
    queryFn: async () => PaymentsApi.apiGetPlansCatalog(countryCode),
    ...BILLING_QUERY_OPTIONS,
  });

  const {
    data: overview,
    isLoading: overviewLoading,
    isFetching: overviewFetching,
    refetch: refetchOverview,
  } = useQuery<PaymentsApi.PaymentOverviewResponse | null>({
    queryKey: ["payments-overview-compare", countryCode],
    queryFn: async () => PaymentsApi.apiGetPaymentsOverview(countryCode),
    ...BILLING_QUERY_OPTIONS,
  });

  useFocusEffect(
    useCallback(() => {
      refreshBillingQueries(queryClient, countryCode);
      refetch();
      refetchOverview();
    }, [queryClient, countryCode, refetch, refetchOverview])
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

  const currentPlanCode = normalizePlanCode(
    overview?.current_plan?.plan_code ||
      overview?.current_subscription?.plan_code ||
      planCatalog?.current_plan_code ||
      "free"
  );

  const currentPlanName =
    overview?.current_plan?.plan_name ||
    planCatalog?.items?.find(
      (item) => normalizePlanCode(item.plan_code) === currentPlanCode
    )?.plan_name ||
    "Free";

  const planOptions = useMemo(() => {
    const items = Array.isArray(planCatalog?.items) ? [...planCatalog.items] : [];
    items.sort(
      (a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0)
    );

    return items.map((item) => {
      const patched = applyAccountActionPolicy(
        item,
        currentPlanCode,
        overview?.allowed_actions
      );
      return {
        planCode: patched.plan_code,
        planName: patched.plan_name,
        priceLabel: patched.price_label,
        summary: patched.summary || undefined,
        recommended: Boolean(patched.recommended),
        current: Boolean(patched.is_current),
        action: patched.action,
        ctaLabel: patched.cta_label,
        ctaEnabled:
          typeof patched.cta_enabled === "boolean" ? patched.cta_enabled : true,
        disabledReason: patched.disabled_reason || undefined,
        contactSales: Boolean(patched.contact_sales),
        features: Array.isArray(patched.feature_bullets)
          ? patched.feature_bullets
          : [],
        limits: (patched.limits || {}) as any,
      };
    });
  }, [planCatalog, currentPlanCode, overview?.allowed_actions]);

  const handleSelectPlan = (planCode: string) => {
    const rawPlan = findRawPlanItem(planCatalog, planCode);
    const metadata = rawPlan?.metadata && typeof rawPlan.metadata === "object" ? rawPlan.metadata : {};
    const appleProductId = isAppleBilling
      ? firstNonEmptyString(
          rawPlan.apple_product_id,
          rawPlan.ios_product_id,
          metadata.apple_product_id,
          metadata.ios_product_id,
          appleSubscriptionProductIdForPlan(planCode)
        )
      : null;
    const googleProductId = isGooglePlayBilling
      ? firstNonEmptyString(
          rawPlan.google_product_id,
          rawPlan.android_product_id,
          metadata.google_product_id,
          metadata.android_product_id,
          googleSubscriptionProductIdForPlan(planCode)
        )
      : null;
    const googleBasePlanId = isGooglePlayBilling
      ? firstNonEmptyString(
          rawPlan.google_base_plan_id,
          rawPlan.base_plan_id,
          metadata.google_base_plan_id,
          metadata.base_plan_id,
          googleSubscriptionBasePlanIdForPlan(planCode)
        )
      : null;

    router.push({
      pathname: "/pricing/upgrade-confirm",
      params: {
        planCode,
        source,
        workflow,
        requiredFeature: requiredFeature || undefined,
        purchaseProvider,
        appleProductId: appleProductId || undefined,
        googleProductId: googleProductId || undefined,
        googleBasePlanId: googleBasePlanId || undefined,
      },
    });
  };

  const loading =
    isLoading || isFetching || overviewLoading || overviewFetching;

  return (
    <View style={styles.root}>
      <DFHeader
        subtitle="compare plans"
        planLabel={header?.plan_label || currentPlanName}
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
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Why this is showing</Text>
          <Text style={styles.infoText}>
            You came from {workflow.replace(/_/g, " ")} in {source}.{" "}
            {requiredFeature
              ? `${requiredFeature} is currently needed for this journey. `
              : ""}
            Your current plan is {currentPlanName || "loading"}.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Current usage snapshot</Text>
          <Text style={styles.infoText}>{normalizedUsageLabel}</Text>
          <View style={styles.snapshotRows}>
            <Text style={styles.snapshotLine}>
              Available now: {formatCredits(normalizedAvailableCredits)}
            </Text>
            <Text style={styles.snapshotLine}>
              Reserved: {formatCredits(normalizedReservedCredits, "0 credits")}
            </Text>
            <Text style={styles.snapshotLine}>
              Used: {formatCredits(normalizedUsedCredits, "0 credits")}
            </Text>
            {normalizedTotalCredits != null ? (
              <Text style={styles.snapshotLine}>
                Current cycle total: {formatCredits(normalizedTotalCredits)}
              </Text>
            ) : null}
          </View>
        </View>

        {overview?.messages?.status_body ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Billing note</Text>
            <Text style={styles.infoText}>{overview.messages.status_body}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={Colors.dark.tintSoft} />
            <Text style={styles.loadingText}>Loading live plans…</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Unable to load live plans</Text>
            <Text style={styles.errorText}>
              {String((error as any)?.message || "Please try again shortly.")}
            </Text>
          </View>
        ) : null}

        {!loading && !error && planOptions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No live plans available</Text>
            <Text style={styles.emptyText}>
              Billing did not return any plan tiles yet. Refresh after the pricing
              service finishes loading its catalog.
            </Text>
          </View>
        ) : null}

        <View style={styles.list}>
          {planOptions.map((option) => (
            <PlanCompareCard
              key={option.planCode}
              option={option as any}
              onPressSelect={handleSelectPlan}
            />
          ))}
        </View>
      </ScrollView>

      <BillingFooterNav />
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
  infoCard: {
    backgroundColor: Colors.dark.cardElevated,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    ...Shadows.card,
  },
  infoTitle: {
    color: Colors.dark.tintSoft,
    fontSize: 16,
    fontWeight: "700",
  },
  infoText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  snapshotRows: {
    marginTop: 10,
    gap: 6,
  },
  snapshotLine: {
    color: Colors.dark.textPrimary,
    fontSize: 13,
    lineHeight: 18,
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
  list: {
    gap: 12,
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