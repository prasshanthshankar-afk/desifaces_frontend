import { useEffect } from "react";
import type { ResolvedPricingDisplay } from "./resolvePricingDisplay";

export function usePricingDebugLog(
  screen: string,
  payload: {
    resolved: ResolvedPricingDisplay;
    dashboardData?: any;
    snapshot?: any;
    estimate?: any;
    extras?: Record<string, unknown>;
  }
) {
  useEffect(() => {
    if (!__DEV__) return;

    const message = {
      screen,
      source: payload.resolved.source,
      resolved: {
        planName: payload.resolved.planName,
        displayKind: payload.resolved.displayKind,
        settlementKind: payload.resolved.settlementKind,
        tierCode: payload.resolved.tierCode,
        planCode: payload.resolved.planCode,
        billingAccountId: payload.resolved.billingAccountId,
        availableCredits: payload.resolved.availableCredits,
        reservedCredits: payload.resolved.reservedCredits,
        usedCredits: payload.resolved.usedCredits,
        totalCredits: payload.resolved.totalCredits,
        usagePercent: payload.resolved.usagePercent,
        readableAvailableLabel: payload.resolved.readableAvailableLabel,
        usageLabel: payload.resolved.usageLabel,
      },
      dashboard: {
        plan_summary: payload.dashboardData?.plan_summary ?? null,
        pricing_summary: payload.dashboardData?.pricing_summary ?? null,
        usage_summary: payload.dashboardData?.usage_summary ?? null,
      },
      snapshot: {
        planName:
          payload.snapshot?.planName ??
          payload.snapshot?.plan_name ??
          payload.snapshot?.planSummary?.plan_name ??
          payload.snapshot?.plan_summary?.plan_name ??
          null,
        tierCode: payload.snapshot?.tierCode ?? payload.snapshot?.tier_code ?? null,
        availableCredits:
          payload.snapshot?.availableCredits ??
          payload.snapshot?.available_credits ??
          payload.snapshot?.pricingSummary?.available_credits ??
          payload.snapshot?.pricing_summary?.available_credits ??
          null,
        reservedCredits:
          payload.snapshot?.reservedCredits ??
          payload.snapshot?.reserved_credits ??
          payload.snapshot?.pricingSummary?.reserved_credits ??
          payload.snapshot?.pricing_summary?.reserved_credits ??
          null,
        usedCredits:
          payload.snapshot?.usedCredits ??
          payload.snapshot?.used_credits ??
          payload.snapshot?.usageSummary?.used_credits ??
          payload.snapshot?.usage_summary?.used_credits ??
          null,
      },
      estimate: payload.estimate ?? null,
      extras: payload.extras ?? {},
    };

    try {
      console.log(`[DF_PRICING][${screen}]`, JSON.stringify(message, null, 2));
    } catch {
      console.log(`[DF_PRICING][${screen}]`, message);
    }
  }, [
    screen,
    payload.resolved.source,
    payload.resolved.planName,
    payload.resolved.displayKind,
    payload.resolved.settlementKind,
    payload.resolved.tierCode,
    payload.resolved.planCode,
    payload.resolved.billingAccountId,
    payload.resolved.availableCredits,
    payload.resolved.reservedCredits,
    payload.resolved.usedCredits,
    payload.resolved.totalCredits,
    payload.resolved.usagePercent,
    payload.resolved.readableAvailableLabel,
    payload.resolved.usageLabel,
    payload.dashboardData,
    payload.snapshot,
    payload.estimate,
    payload.extras,
  ]);
}
