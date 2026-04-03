import React from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { PlanCompareCard } from "../../components/pricing/PlanCompareCard";
import { Colors, Radii, Spacing, Shadows } from "../../../constants/theme";
import { useAccountPricingSnapshot } from "../../core/pricing/useAccountPricingSnapshot";

const PLAN_OPTIONS = [
  {
    planCode: "free",
    planName: "Free",
    priceLabel: "$0 / month",
    features: [
      "Starter access for exploration",
      "Face and Audio basics",
      "Upgrade when you need more premium features or higher usage",
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
    planCode: "pro",
    planName: "Pro",
    priceLabel: "$29 / month",
    recommended: true,
    features: [
      "Higher included monthly usage",
      "TALKING_VIDEO entitlement included",
      "Better creator throughput across Face, Audio, and Fusion",
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
    planCode: "business",
    planName: "Business",
    priceLabel: "$99 / month",
    features: [
      "Higher scale for teams and campaigns",
      "TALKING_VIDEO + CINEMATIC_VIDEO_DIRECTION included",
      "Broader premium access across studios",
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
    planCode: "enterprise",
    planName: "Enterprise",
    priceLabel: "Contact sales",
    features: [
      "Custom contract and billing model",
      "Enterprise controls and governance",
      "Custom entitlements and rollout paths",
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

export default function ComparePlansScreen() {
  const params = useLocalSearchParams<{
    source?: string;
    workflow?: string;
    intent?: string;
    requiredFeature?: string;
  }>();
  const snapshot = useAccountPricingSnapshot();
  const source = readString(params.source, "studio");
  const workflow = readString(params.workflow, source);
  const intent = readString(params.intent, "upgrade");
  const requiredFeature = readString(params.requiredFeature);

  const currentTier = String(snapshot.tierCode || snapshot.planName || "").trim().toLowerCase();
  const handleSelectPlan = (planCode: string) => {
    router.push({
      pathname: "/pricing/upgrade-confirm",
      params: {
        planCode,
        source,
        workflow,
        intent,
        requiredFeature: requiredFeature || undefined,
      },
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <Text style={styles.title}>Compare plans</Text>
          <Text style={styles.subtitle}>
            The upgrade journey is the same no matter where you started. Choose the plan that unlocks the feature or capacity you need, then confirm once.
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Why this is showing</Text>
          <Text style={styles.infoText}>
            You came from {workflow.replace(/_/g, " ")} in {source}. {requiredFeature ? `${requiredFeature} is currently needed for this journey. ` : ""}Your current plan is {snapshot.planName || "loading"}.
          </Text>
        </View>

        <View style={styles.list}>
          {PLAN_OPTIONS.map((option) => (
            <PlanCompareCard
              key={option.planCode}
              option={{
                ...option,
                current:
                  (option.planCode === "enterprise" && /enterprise/.test(currentTier)) ||
                  (option.planCode === "business" && /business/.test(currentTier)) ||
                  (option.planCode === "pro" && /(pro|creator pro)/.test(currentTier)) ||
                  (option.planCode === "free" && /free/.test(currentTier)),
              } as any}
              onPressSelect={handleSelectPlan}
            />
          ))}
        </View>
      </ScrollView>
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
  list: {
    gap: 12,
  },
});
