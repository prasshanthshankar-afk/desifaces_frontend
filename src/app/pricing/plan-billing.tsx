import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { Colors, Radii, Spacing, Shadows } from "../../../constants/theme";
import { UsageAndPlanCard } from "../../components/pricing/UsageAndPlanCard";
import { PlanCompareCard } from "../../components/pricing/PlanCompareCard";
import { useAccountPricingSnapshot } from "../../core/pricing/useAccountPricingSnapshot";
import { useAuth } from "../../core/auth/AuthContext";
import {
  apiCreateCustomerPortalSession,
  apiGetCurrentSubscription,
  type PaymentSubscriptionCurrent,
} from "../../core/payments/apiPayments";

const PLAN_OPTIONS = [
  {
    planCode: "free",
    planName: "Free",
    priceLabel: "$0 / month",
    features: [
      "Starter access for exploration",
      "Face and Audio basics",
      "Upgrade when you need more monthly usage or premium Fusion access",
    ],
    limits: {
      face: "Starter access",
      audio: "Starter access",
      fusion: "Limited / gated",
      retail: "Not included",
      music: "Not included",
    },
  },
  {
    planCode: "pro_monthly_v1",
    planName: "Pro",
    priceLabel: "$29 / month",
    recommended: true,
    features: [
      "Higher included monthly usage",
      "TALKING_VIDEO entitlement included",
      "Better day-to-day creator capacity across Face, Audio, and Fusion",
    ],
    limits: {
      face: "Expanded usage",
      audio: "Expanded usage",
      fusion: "Talking Video",
      retail: "Plan dependent",
      music: "Plan dependent",
    },
  },
  {
    planCode: "business_monthly_v1",
    planName: "Business",
    priceLabel: "$99 / month",
    features: [
      "Higher scale for teams and campaigns",
      "TALKING_VIDEO + CINEMATIC_VIDEO_DIRECTION included",
      "Broader premium feature access across studios",
    ],
    limits: {
      face: "High capacity",
      audio: "High capacity",
      fusion: "Talking + Cinematic",
      retail: "Expanded",
      music: "Expanded",
    },
  },
  {
    planCode: "enterprise_monthly_v1",
    planName: "Enterprise",
    priceLabel: "Custom pricing",
    features: [
      "Contract billing and enterprise controls",
      "Custom rollout and entitlement policy",
      "Support for broader operational needs",
    ],
    limits: {
      face: "Custom",
      audio: "Custom",
      fusion: "Custom",
      retail: "Custom",
      music: "Custom",
    },
  },
];

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return String(value ?? fallback);
}

function normalizePlanDisplay(planCodeOrName: string) {
  const normalized = String(planCodeOrName || "").trim().toLowerCase();
  if (/(enterprise)/.test(normalized)) return { code: "enterprise_monthly_v1", label: "Enterprise" };
  if (/(business)/.test(normalized)) return { code: "business_monthly_v1", label: "Business" };
  if (/(pro|creator pro)/.test(normalized)) return { code: "pro_monthly_v1", label: "Pro" };
  return { code: "free", label: "Free" };
}

function stringifyState(v?: string | null, fallback = "Not active") {
  return String(v || fallback).replace(/_/g, " ");
}

export default function PlanBillingScreen() {
  const params = useLocalSearchParams<{
    source?: string;
    workflow?: string;
    intent?: string;
    requiredFeature?: string;
    plan?: string;
    availability?: string;
    settlement?: string;
    estimate?: string;
    estimate_label?: string;
    billing_result?: string;
  }>();

  const auth = useAuth() as any;
  const snapshot = useAccountPricingSnapshot();
  const source = readString(params.source, "studio");
  const workflow = readString(params.workflow, source);
  const intent = readString(params.intent, "upgrade");
  const requiredFeature = readString(params.requiredFeature);
  const fallbackPlan = readString(params.plan, "Free");
  const availability =
    readString(params.availability) ||
    (snapshot.availableLabel ? `${snapshot.availableLabel} available` : "Live account snapshot loading");
  const settlement =
    readString(params.settlement) ||
    "Included usage first, then wallet or postpaid when allowed";
  const estimateLabel = readString(params.estimate_label) || "Plan guidance";
  const billingResult = readString(params.billing_result);

  const countryCode =
    auth?.countryCode ||
    auth?.country_code ||
    auth?.user?.countryCode ||
    auth?.user?.country_code ||
    "US";

  const {
    data: currentSubscription,
    isLoading: subscriptionLoading,
    isFetching: subscriptionFetching,
    refetch: refetchSubscription,
  } = useQuery<PaymentSubscriptionCurrent>({
    queryKey: ["payments-subscription-current", countryCode],
    queryFn: () => apiGetCurrentSubscription(countryCode),
    staleTime: 10_000,
    retry: 1,
  });

  useFocusEffect(
    useCallback(() => {
      refetchSubscription();
    }, [refetchSubscription])
  );

  useEffect(() => {
    if (billingResult !== "success") return;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      const next = await refetchSubscription();
      const sub = next.data;
      const entitlement = String(sub?.entitlement_state || "").toLowerCase();
      if (entitlement === "active" || entitlement === "grace" || attempts >= maxAttempts) return;
      setTimeout(tick, 2500);
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [billingResult, refetchSubscription]);

  const currentPlan = useMemo(() => {
    const live = currentSubscription?.plan_code || fallbackPlan || snapshot.planName || "Free";
    return normalizePlanDisplay(live).label;
  }, [currentSubscription?.plan_code, fallbackPlan, snapshot.planName]);

  const currentOptionCode = useMemo(() => {
    const live = currentSubscription?.plan_code || currentPlan;
    return normalizePlanDisplay(String(live)).code;
  }, [currentSubscription?.plan_code, currentPlan]);

  const planOptions = PLAN_OPTIONS.map((option) => ({
    ...option,
    current: option.planCode === currentOptionCode,
    recommended: option.planCode === "pro_monthly_v1" ? true : option.recommended,
  }));

  const onSelectPlan = (planCode: string) => {
    router.push({
      pathname: "./upgrade-confirm",
      params: {
        planCode,
        source,
        workflow,
        intent,
        requiredFeature: requiredFeature || undefined,
        currentPlanCode: currentOptionCode,
        currentPlanName: currentPlan,
      },
    });
  };

  const [portalBusy, setPortalBusy] = useState(false);
  const openManageBilling = async () => {
    try {
      setPortalBusy(true);
      const result = await apiCreateCustomerPortalSession({ countryCode });
      if (result?.portal_url) {
        await Linking.openURL(result.portal_url);
      }
    } finally {
      setPortalBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Plan & Billing</Text>
          <Text style={styles.subtitle}>
            Review your current plan, compare options, and complete a secure upgrade without interrupting your studio workflow.
          </Text>
        </View>

        {billingResult ? (
          <View style={[styles.banner, billingResult === "success" ? styles.bannerSuccess : styles.bannerNeutral]}>
            <Text style={styles.bannerTitle}>
              {billingResult === "success" ? "Confirming your subscription" : "Checkout canceled"}
            </Text>
            <Text style={styles.bannerBody}>
              {billingResult === "success"
                ? "We are refreshing your plan and entitlements now. This can take a few seconds after Stripe completes."
                : "No changes were made. You can review plans and try again whenever you are ready."}
            </Text>
          </View>
        ) : null}

        <UsageAndPlanCard
          planName={currentPlan}
          monthLabel="Current cycle"
          totalUsagePercent={snapshot.usagePercent ?? 0}
          walletBalance={availability}
          monthlySpend={estimateLabel}
          reservedAmount={snapshot.reservedLabel ?? "0 credits"}
          includedUsageLabel={snapshot.availableLabel ?? "Snapshot loading"}
          billingModeLabel={settlement}
          entitlementNote={
            requiredFeature
              ? `You opened this from ${workflow.replace(/_/g, " ")} because ${requiredFeature} is required or because you need more available usage.`
              : `You opened this from ${workflow.replace(/_/g, " ")} to review or upgrade your plan.`
          }
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>What you have now</Text>
            <Pressable
              style={[styles.manageBtn, portalBusy && styles.manageBtnDisabled]}
              onPress={openManageBilling}
              disabled={portalBusy}
            >
              <Text style={styles.manageBtnText}>{portalBusy ? "Opening..." : "Manage billing"}</Text>
            </Pressable>
          </View>

          <View style={styles.infoCard}>
            <Row label="Current plan" value={currentPlan} />
            <Row label="Source" value={source.replace(/_/g, " ")} />
            <Row label="Workflow" value={workflow.replace(/_/g, " ")} />
            <Row label="Available now" value={availability} />
            <Row label="Settlement" value={settlement} />
            <Row
              label="Subscription state"
              value={
                subscriptionLoading || subscriptionFetching
                  ? "Refreshing..."
                  : stringifyState(currentSubscription?.subscription_state, "No active subscription")
              }
            />
            <Row
              label="Entitlement state"
              value={
                subscriptionLoading || subscriptionFetching
                  ? "Refreshing..."
                  : stringifyState(currentSubscription?.entitlement_state, "Inactive")
              }
            />
            {currentSubscription?.current_period_end ? (
              <Row label="Current period ends" value={currentSubscription.current_period_end} />
            ) : null}
            {requiredFeature ? <Row label="Needed feature" value={requiredFeature} /> : null}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Compare plans</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "./compare",
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

          <View style={styles.planList}>
            {planOptions.map((option) => (
              <PlanCompareCard key={option.planCode} option={option as any} onPressSelect={onSelectPlan} />
            ))}
          </View>
        </View>
      </ScrollView>
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
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  header: {
    marginTop: Spacing.sm,
  },
  backBtn: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.pill,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    marginBottom: 12,
  },
  backText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  title: {
    color: Colors.dark.textPrimary,
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    color: Colors.dark.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  banner: {
    borderRadius: Radii.xxl,
    padding: Spacing.lg,
    borderWidth: 1,
  },
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
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: Colors.dark.textPrimary,
    fontSize: 18,
    fontWeight: "700",
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
  manageBtnDisabled: {
    opacity: 0.7,
  },
  manageBtnText: {
    color: Colors.dark.textPrimary,
    fontSize: 12,
    fontWeight: "800",
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
  planList: {
    gap: 12,
  },
});
