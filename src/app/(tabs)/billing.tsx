import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import DFHeader from "../../core/ui/DFHeader";
import { DF } from "../../core/theme/colors";
import { PricingTopBar } from "../../components/pricing/PricingTopBar";
import { UsageAndPlanCard } from "../../components/pricing/UsageAndPlanCard";
import { PlanCompareCard } from "../../components/pricing/PlanCompareCard";
import { UpgradePromptSheet } from "../../components/pricing/UpgradePromptSheet";
import { StudioPricingFooter } from "../../components/pricing/StudioPricingFooter";
import { useAccountPricingSnapshot } from "../../core/pricing/useAccountPricingSnapshot";

function GlassCard({
  children,
  accent = "rgba(255,255,255,0.10)",
}: {
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: "rgba(255,255,255,0.05)",
        padding: 14,
      }}
    >
      {children}
    </View>
  );
}

function TinyChip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  const borderColor =
    tone === "good"
      ? "rgba(113, 213, 144, 0.35)"
      : tone === "warn"
      ? "rgba(232, 152, 56, 0.40)"
      : tone === "danger"
      ? "rgba(255, 99, 99, 0.38)"
      : "rgba(255,255,255,0.12)";

  const textColor =
    tone === "good"
      ? "#9CE8B0"
      : tone === "warn"
      ? "#E89838"
      : tone === "danger"
      ? "#FF9191"
      : DF.text;

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor,
        backgroundColor: "rgba(255,255,255,0.03)",
      }}
    >
      <Text style={{ color: textColor, fontSize: 11, fontWeight: "800" }}>{label}</Text>
    </View>
  );
}

function MetricBlock({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 100,
        borderRadius: 16,
        padding: 12,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "800" }}>{label}</Text>
      <Text style={{ color: DF.text, fontSize: 18, fontWeight: "900", marginTop: 6 }}>{value}</Text>
      {!!helper && (
        <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "700", marginTop: 6, lineHeight: 16 }}>
          {helper}
        </Text>
      )}
    </View>
  );
}

function parseNumber(value?: string | string[] | null) {
  if (Array.isArray(value)) value = value[0];
  if (value == null) return null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function prettyMoney(raw?: string | string[] | null, fallback = "—") {
  const n = parseNumber(raw);
  if (n == null) return fallback;
  return `$${n.toFixed(2)}`;
}

function formatWholeCredits(value: number | null | undefined, fallback = "Unavailable") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.max(0, Math.round(value))} credits`;
}

export default function BillingScreen() {
  const params = useLocalSearchParams<{
    intent?: string;
    source?: string;
    plan?: string;
    availability?: string;
    settlement?: string;
    included_left?: string;
    wallet?: string;
    monthly_spend?: string;
    reserved?: string;
    estimate?: string;
    estimate_label?: string;
    stage?: string;
    workflow?: string;
  }>();

  const intent = String(params.intent || "manage");
  const source = String(params.source || "studio");
  const workflow = String(params.workflow || source || "creation");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const snapshot = useAccountPricingSnapshot();

  const currentPlan =
    snapshot.planName ||
    String(params.plan || "").trim() ||
    "Free";

  const billingMode = String(
    params.settlement || "Included usage first, then wallet or postpaid when allowed"
  );

  const wallet = prettyMoney(params.wallet);
  const monthlySpend = prettyMoney(params.monthly_spend);
  const estimate = prettyMoney(params.estimate);
  const estimateLabel = String(params.estimate_label || "Estimated for current workflow");

  const availableCredits = snapshot.availableCredits;
  const reservedCredits = snapshot.reservedCredits;
  const usedCredits = snapshot.usedCredits;
  const usagePercent = snapshot.usagePercent ?? 0;

  const requiredCredits =
    /credit/i.test(estimateLabel) ? parseNumber(params.estimate) : null;
  const shortfallCredits =
    requiredCredits != null && availableCredits != null
      ? Math.max(0, requiredCredits - availableCredits)
      : null;

  const canRun =
    requiredCredits != null && availableCredits != null
      ? availableCredits >= requiredCredits
      : null;

  const headerTitle =
    intent === "upgrade"
      ? "Upgrade or top up"
      : intent === "topup"
      ? "Top up wallet"
      : "Plan & billing";

  const heroTone: "good" | "warn" | "danger" =
    canRun === false
      ? "danger"
      : shortfallCredits != null && shortfallCredits > 0
      ? "warn"
      : "good";

  const heroTitle =
    canRun === false
      ? "Not enough credits for this workflow"
      : snapshot.isLoading
      ? "Loading your billing snapshot"
      : "Billing is ready for creation";

  const heroMessage =
    canRun === false
      ? `This workflow needs ${formatWholeCredits(requiredCredits)}. Your account currently has ${formatWholeCredits(
          availableCredits
        )}. Add more credits or upgrade to continue without losing your setup.`
      : snapshot.isLoading
      ? "We are refreshing your live account snapshot so plan, available credits, reserved credits, and used credits stay consistent across all screens."
      : "This screen now uses your shared account-pricing snapshot so the plan and credit story stays aligned with Dashboard, Face, Audio, and Fusion.";

  const nextStepLabel =
    canRun === false
      ? "Add credits"
      : intent === "upgrade"
      ? "Choose a better plan"
      : intent === "topup"
      ? "Top up wallet"
      : "Manage billing";

  const statusChips = [
    { label: currentPlan, tone: "neutral" as const },
    {
      label: snapshot.availableLabel ?? "Credits loading",
      tone: canRun === false ? ("danger" as const) : ("good" as const),
    },
    {
      label: snapshot.reservedLabel ?? "0 credits reserved",
      tone: "neutral" as const,
    },
    {
      label: workflow.replace(/_/g, " "),
      tone: "neutral" as const,
    },
  ];

  const planOptions = useMemo(
    () => [
      {
        planCode: "free",
        planName: "Free",
        priceLabel: "$0 / month",
        billingLabel: "Included usage only",
        entitlementLabel: "Best for evaluation and light personal use",
        current: currentPlan.toLowerCase() === "free",
        features: [
          "Starter credits for evaluation",
          "Entry-level face and audio creation",
          "Top up or upgrade when more usage is needed",
        ],
        limits: {
          face: "Starter access",
          audio: "Starter access",
          fusion: "Pay-per-use or gated",
          retail: "Not included",
          music: "Not included",
        },
      },
      {
        planCode: "pro",
        planName: "Pro",
        priceLabel: "$29 / month",
        billingLabel: "Monthly subscription + pay-as-you-go fallback",
        entitlementLabel: "For regular creators who need predictable included usage",
        recommended: true,
        current: currentPlan.toLowerCase() === "pro",
        features: [
          "Higher monthly included usage",
          "Access to Face, Audio, and Fusion workflows",
          "Wallet or metered overage support after included usage is consumed",
        ],
        limits: {
          face: "Higher included usage",
          audio: "Higher included usage",
          fusion: "Included + overage",
          retail: "Plan dependent",
          music: "Plan dependent",
        },
      },
      {
        planCode: "enterprise",
        planName: "Enterprise",
        priceLabel: "Custom pricing",
        billingLabel: "Postpaid / invoiced",
        entitlementLabel: "Operational teams with centralized billing and controls",
        current: currentPlan.toLowerCase() === "enterprise",
        features: [
          "Postpaid settlement",
          "Centralized billing account",
          "Policy-based entitlement controls across studios",
        ],
        limits: {
          face: "Contracted",
          audio: "Contracted",
          fusion: "Contracted",
          retail: "Contracted",
          music: "Contracted",
        },
      },
    ],
    [currentPlan]
  );

  const recommendation =
    canRun === false
      ? "Use Add credits or choose a higher plan, then refresh the estimate from the source studio and continue."
      : "No urgent billing change is required right now. Use this screen to review the shared account snapshot and compare upgrade paths.";

  return (
    <View style={{ flex: 1, backgroundColor: DF.bg || "#080808" }}>
      <DFHeader
        subtitle={headerTitle}
        onMenuPress={() => router.push("/(tabs)/dashboard" as any)}
        onPressMeta={() => setUpgradeOpen(true)}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 36, gap: 12 }}
      >
        <PricingTopBar
          studioName="Billing"
          estimate={estimate === "—" ? currentPlan : estimate}
          walletAfterRun={wallet}
          planName={currentPlan}
          availabilityLabel={snapshot.availableLabel ? `${snapshot.availableLabel} available` : "Credit snapshot loading"}
          settlementLabel={billingMode}
          entitlementLabel={`Opened from ${source}. Shared account snapshot for plan, available credits, reserved credits, and used credits.`}
          availableCreditsLabel={snapshot.availableLabel}
          reservedCreditsLabel={snapshot.reservedLabel}
          consumedCreditsLabel={snapshot.usedLabel}
          requiredCreditsLabel={requiredCredits != null ? formatWholeCredits(requiredCredits) : null}
          shortfallCreditsLabel={shortfallCredits && shortfallCredits > 0 ? formatWholeCredits(shortfallCredits) : null}
          canRun={canRun}
          insufficientTitle="Not enough credits for this workflow"
          insufficientMessage={
            canRun === false
              ? `Required ${formatWholeCredits(requiredCredits)} • Available ${formatWholeCredits(availableCredits)} • Shortfall ${formatWholeCredits(shortfallCredits)}`
              : null
          }
          primaryActionLabel="Add credits"
          onPressManagePlan={() => setUpgradeOpen(true)}
          onPressPrimaryAction={() => setUpgradeOpen(true)}
        />

        <GlassCard
          accent={
            heroTone === "danger"
              ? "rgba(255,99,99,0.30)"
              : heroTone === "warn"
              ? "rgba(232,152,56,0.35)"
              : "rgba(113,213,144,0.28)"
          }
        >
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              {statusChips.map((chip) => (
                <TinyChip key={chip.label} label={chip.label} tone={chip.tone} />
              ))}
            </View>

            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>{heroTitle}</Text>
            <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, lineHeight: 18 }}>
              {heroMessage}
            </Text>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 2 }}>
              <MetricBlock
                label="Available credits"
                value={snapshot.availableLabel ?? "Loading"}
                helper="Live balance from the shared account snapshot"
              />
              <MetricBlock
                label="Reserved credits"
                value={snapshot.reservedLabel ?? "0 credits"}
                helper="Current holds for in-flight work"
              />
              <MetricBlock
                label="Used credits"
                value={snapshot.usedLabel ?? "Loading"}
                helper="Consumed credits for the current summary window"
              />
            </View>

            <View
              style={{
                borderRadius: 14,
                backgroundColor: "rgba(255,255,255,0.04)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
                padding: 12,
                gap: 8,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 13 }}>What happens next</Text>
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, lineHeight: 18 }}>
                {recommendation}
              </Text>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 2 }}>
                <Pressable
                  onPress={() => setUpgradeOpen(true)}
                  style={{
                    flex: 1,
                    borderRadius: 14,
                    paddingVertical: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#E89838",
                  }}
                >
                  <Text style={{ color: DF.bg || "#080808", fontWeight: "900", fontSize: 13 }}>
                    {nextStepLabel}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => router.back()}
                  style={{
                    borderRadius: 14,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.03)",
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Back</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </GlassCard>

        <UsageAndPlanCard
          planName={currentPlan}
          monthLabel="Current billing cycle"
          totalUsagePercent={usagePercent}
          walletBalance={wallet}
          monthlySpend={monthlySpend}
          reservedAmount={snapshot.reservedLabel ?? "0 credits"}
          includedUsageLabel={snapshot.availableLabel ?? "Credit snapshot loading"}
          billingModeLabel={billingMode}
          entitlementNote="This card now reflects the same account snapshot story used in the top-right header and pricing bar."
        />

        <GlassCard>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>Why you opened this screen</Text>
          <View style={{ gap: 10, marginTop: 10 }}>
            <View
              style={{
                borderRadius: 16,
                padding: 12,
                backgroundColor: "rgba(255,255,255,0.04)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 13 }}>
                Source: {source.replace(/_/g, " ")}
              </Text>
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, lineHeight: 18, marginTop: 6 }}>
                This hub was opened from the studio flow so the user can review plan posture and credit availability before continuing with Face, Audio, or Fusion.
              </Text>
            </View>

            <View
              style={{
                borderRadius: 16,
                padding: 12,
                backgroundColor: "rgba(255,255,255,0.04)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 13 }}>
                Workflow: {workflow.replace(/_/g, " ")}
              </Text>
              <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, lineHeight: 18, marginTop: 6 }}>
                Required credits, shortfall, available balance, reserved credits, and used credits should all stay consistent with the shared account snapshot.
              </Text>
            </View>
          </View>
        </GlassCard>

        {planOptions.map((option) => (
          <PlanCompareCard
            key={option.planCode}
            option={option as any}
            onPressSelect={(planCode) => {
              setSelectedPlan(planCode);
              setUpgradeOpen(true);
            }}
          />
        ))}

        <StudioPricingFooter
          primaryLabel={nextStepLabel}
          secondaryLabel="Back"
          helperText="Replace the primary action with your real checkout, subscription-management, or wallet top-up path when that backend is ready."
          onPrimaryPress={() => setUpgradeOpen(true)}
          onSecondaryPress={() => router.back()}
        />
      </ScrollView>

      <UpgradePromptSheet
        visible={upgradeOpen}
        title={
          selectedPlan
            ? `Continue with ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}`
            : headerTitle
        }
        description={
          canRun === false
            ? `This workflow needs ${formatWholeCredits(requiredCredits)} and your account currently has ${formatWholeCredits(availableCredits)}. Add credits or change plan, then continue from the source studio.`
            : "This billing hub now reflects the shared account snapshot used across the app. Replace this sheet action with your real checkout, wallet top-up, or subscription-management destination."
        }
        currentPlan={currentPlan}
        usageContext={billingMode}
        highlights={[
          `Available: ${snapshot.availableLabel ?? "Loading"}`,
          `Reserved: ${snapshot.reservedLabel ?? "0 credits"}`,
          `Used: ${snapshot.usedLabel ?? "Loading"}`,
        ]}
        onClose={() => setUpgradeOpen(false)}
        onSecondary={() => setUpgradeOpen(false)}
        onUpgrade={() => setUpgradeOpen(false)}
      />
    </View>
  );
}
