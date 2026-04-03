import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Linking,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { Colors, Radii, Spacing, Shadows } from "../../../constants/theme";
import { useAuth } from "../../core/auth/AuthContext";
import {
  apiCreateSubscriptionCheckoutSession,
  buildBillingReturnUrl,
} from "../../core/payments/apiPayments";

type PlanUiMeta = {
  planCode: string;
  planName: string;
  priceLabel: string;
  billingCycle: string;
  renewalLabel: string;
  summary: string;
  entitlements: string[];
};

const PLAN_MAP: Record<string, PlanUiMeta> = {
  free: {
    planCode: "free",
    planName: "Free",
    priceLabel: "$0 / month",
    billingCycle: "Monthly",
    renewalLabel: "No charge",
    summary: "Starter access for exploration across Face and Audio.",
    entitlements: [],
  },

  pro: {
    planCode: "pro_monthly_v1",
    planName: "Pro",
    priceLabel: "$29 / month",
    billingCycle: "Monthly",
    renewalLabel: "Renews monthly",
    summary: "Balanced plan for regular creators with Talking Video included.",
    entitlements: ["TALKING_VIDEO"],
  },
  pro_monthly: {
    planCode: "pro_monthly_v1",
    planName: "Pro",
    priceLabel: "$29 / month",
    billingCycle: "Monthly",
    renewalLabel: "Renews monthly",
    summary: "Balanced plan for regular creators with Talking Video included.",
    entitlements: ["TALKING_VIDEO"],
  },
  pro_monthly_v1: {
    planCode: "pro_monthly_v1",
    planName: "Pro",
    priceLabel: "$29 / month",
    billingCycle: "Monthly",
    renewalLabel: "Renews monthly",
    summary: "Balanced plan for regular creators with Talking Video included.",
    entitlements: ["TALKING_VIDEO"],
  },
  pro_yearly: {
    planCode: "pro_yearly_v1",
    planName: "Pro Yearly",
    priceLabel: "$290 / year",
    billingCycle: "Yearly",
    renewalLabel: "Renews yearly",
    summary: "Annual Pro plan with Talking Video included.",
    entitlements: ["TALKING_VIDEO"],
  },
  pro_yearly_v1: {
    planCode: "pro_yearly_v1",
    planName: "Pro Yearly",
    priceLabel: "$290 / year",
    billingCycle: "Yearly",
    renewalLabel: "Renews yearly",
    summary: "Annual Pro plan with Talking Video included.",
    entitlements: ["TALKING_VIDEO"],
  },

  business: {
    planCode: "business_monthly_v1",
    planName: "Business",
    priceLabel: "$99 / month",
    billingCycle: "Monthly",
    renewalLabel: "Renews monthly",
    summary: "Higher scale with Talking Video and Cinematic Video Direction included.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },
  business_monthly: {
    planCode: "business_monthly_v1",
    planName: "Business",
    priceLabel: "$99 / month",
    billingCycle: "Monthly",
    renewalLabel: "Renews monthly",
    summary: "Higher scale with Talking Video and Cinematic Video Direction included.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },
  business_monthly_v1: {
    planCode: "business_monthly_v1",
    planName: "Business",
    priceLabel: "$99 / month",
    billingCycle: "Monthly",
    renewalLabel: "Renews monthly",
    summary: "Higher scale with Talking Video and Cinematic Video Direction included.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },
  business_yearly: {
    planCode: "business_yearly_v1",
    planName: "Business Yearly",
    priceLabel: "$990 / year",
    billingCycle: "Yearly",
    renewalLabel: "Renews yearly",
    summary: "Annual Business plan with Talking and Cinematic access included.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },
  business_yearly_v1: {
    planCode: "business_yearly_v1",
    planName: "Business Yearly",
    priceLabel: "$990 / year",
    billingCycle: "Yearly",
    renewalLabel: "Renews yearly",
    summary: "Annual Business plan with Talking and Cinematic access included.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },

  enterprise: {
    planCode: "enterprise_monthly_v1",
    planName: "Enterprise",
    priceLabel: "Custom pricing",
    billingCycle: "Custom",
    renewalLabel: "Custom contract terms",
    summary: "Enterprise controls, scale, and custom entitlement rollout.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },
  enterprise_monthly: {
    planCode: "enterprise_monthly_v1",
    planName: "Enterprise",
    priceLabel: "Custom pricing",
    billingCycle: "Custom",
    renewalLabel: "Custom contract terms",
    summary: "Enterprise controls, scale, and custom entitlement rollout.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },
  enterprise_monthly_v1: {
    planCode: "enterprise_monthly_v1",
    planName: "Enterprise",
    priceLabel: "Custom pricing",
    billingCycle: "Custom",
    renewalLabel: "Custom contract terms",
    summary: "Enterprise controls, scale, and custom entitlement rollout.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },
  enterprise_yearly: {
    planCode: "enterprise_yearly_v1",
    planName: "Enterprise Yearly",
    priceLabel: "Custom pricing",
    billingCycle: "Custom",
    renewalLabel: "Custom contract terms",
    summary: "Enterprise controls, scale, and custom entitlement rollout.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },
  enterprise_yearly_v1: {
    planCode: "enterprise_yearly_v1",
    planName: "Enterprise Yearly",
    priceLabel: "Custom pricing",
    billingCycle: "Custom",
    renewalLabel: "Custom contract terms",
    summary: "Enterprise controls, scale, and custom entitlement rollout.",
    entitlements: ["TALKING_VIDEO", "CINEMATIC_VIDEO_DIRECTION"],
  },
};

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return String(value ?? fallback);
}

function resolvePlanMeta(rawPlanCode: string): PlanUiMeta {
  const normalized = String(rawPlanCode || "pro_monthly_v1").trim().toLowerCase();
  return PLAN_MAP[normalized] || PLAN_MAP.pro_monthly_v1;
}

function makeIdempotencyKey(planCode: string) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `billing-${planCode}-${Date.now()}-${rand}`;
}

const SOURCE_ROUTE_MAP: Record<string, string> = {
  face: "/(tabs)/face",
  audio: "/(tabs)/audio",
  fusion: "/(tabs)/fusion",
  dashboard: "/(tabs)/dashboard",
  settings: "/(tabs)/settings",
  billing: "/pricing/plan-billing",
};

export default function UpgradeConfirmScreen() {
  const params = useLocalSearchParams<{
    planCode?: string;
    source?: string;
    workflow?: string;
    intent?: string;
    requiredFeature?: string;
    currentPlanCode?: string;
    currentPlanName?: string;
  }>();

  const source = readString(params.source, "dashboard");
  const workflow = readString(params.workflow, source);
  const requiredFeature = readString(params.requiredFeature);
  const currentPlanName = readString(params.currentPlanName, "Free");
  const currentPlanCode = readString(params.currentPlanCode, "free");
  const selectedPlan = resolvePlanMeta(readString(params.planCode, "pro_monthly_v1"));
  const returnRoute = SOURCE_ROUTE_MAP[source] || "/(tabs)/dashboard";

  const auth = useAuth() as any;
  const countryCode =
    auth?.countryCode ||
    auth?.country_code ||
    auth?.user?.countryCode ||
    auth?.user?.country_code ||
    "US";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const idempotencyKey = useMemo(
    () => makeIdempotencyKey(selectedPlan.planCode),
    [selectedPlan.planCode]
  );

  const successUrl = useMemo(() => buildBillingReturnUrl("success"), []);
  const cancelUrl = useMemo(() => buildBillingReturnUrl("cancel"), []);

  const actionCopy = useMemo(() => {
    const current = String(currentPlanCode || currentPlanName).toLowerCase();
    const next = String(selectedPlan.planCode).toLowerCase();

    if (current === next) return `Continue with ${selectedPlan.planName}`;
    if (current.includes("free")) return `Start ${selectedPlan.planName}`;
    return `Continue to secure ${selectedPlan.planName} checkout`;
  }, [currentPlanCode, currentPlanName, selectedPlan.planCode, selectedPlan.planName]);

  const noteText = useMemo(() => {
    if (requiredFeature) {
      return `${requiredFeature} will be unlocked after Stripe completes checkout and the app refreshes your subscription and entitlements.`;
    }
    return "Your included usage and feature entitlements will refresh after Stripe checkout completes and the billing screen confirms the updated subscription.";
  }, [requiredFeature]);

  const handleConfirm = async () => {
    try {
      setBusy(true);
      setError("");

      const result = await apiCreateSubscriptionCheckoutSession({
        planCode: selectedPlan.planCode,
        idempotencyKey,
        successUrl,
        cancelUrl,
        countryCode,
      });

      if (!result?.checkout_url) {
        throw new Error("Checkout session was created without a checkout URL.");
      }

      await Linking.openURL(result.checkout_url);
    } catch (e: any) {
      setError(String(e?.message || e || "Unable to start secure checkout."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Confirm upgrade</Text>
          <Text style={styles.subtitle}>
            Review the selected plan before continuing. Checkout is completed securely in Stripe,
            and your billing screen will refresh when you return.
          </Text>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>Selected plan</Text>
          <Text style={styles.heroTitle}>{selectedPlan.planName}</Text>
          <Text style={styles.heroPrice}>{selectedPlan.priceLabel}</Text>
          <Text style={styles.heroSummary}>{selectedPlan.summary}</Text>
        </View>

        <View style={styles.infoCard}>
          <Row label="Current plan" value={currentPlanName} />
          <Row label="Selected plan" value={selectedPlan.planName} />
          <Row label="Billing cycle" value={selectedPlan.billingCycle} />
          <Row label="Renewal" value={selectedPlan.renewalLabel} />
          <Row label="Plan code" value={selectedPlan.planCode} />
          <Row label="Currency" value={countryCode === "IN" ? "INR" : "USD"} />
          <Row label="Source" value={source.replace(/_/g, " ")} />
          <Row label="Workflow" value={workflow.replace(/_/g, " ")} />
          {requiredFeature ? <Row label="Needed feature" value={requiredFeature} /> : null}
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>What changes after upgrade</Text>
          <Text style={styles.noteText}>{noteText}</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={[styles.primaryBtn, busy && styles.btnDisabled]} onPress={handleConfirm} disabled={busy}>
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
  errorText: {
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
});