import { useMemo } from "react";
import { normalizePricing, normalizePricingSummary, pickPricingContainer } from "../normalizers";

export function useStudioPricing(jobOrStatus: any) {
  return useMemo(() => {
    const { pricing, pricingSummary } = pickPricingContainer(jobOrStatus);
    const snapshot = normalizePricing(pricing, pricingSummary);
    const summary = normalizePricingSummary(pricing, pricingSummary);

    return {
      pricing: snapshot,
      pricingSummary: summary,
      stage: snapshot?.stage ?? "idle",
      isTerminal:
        snapshot?.stage === "committed" ||
        snapshot?.stage === "released" ||
        snapshot?.stage === "failed",
      receiptLabel: summary?.receiptLabel || summary?.finalLabel || summary?.estimateLabel || null,
    };
  }, [jobOrStatus]);
}
