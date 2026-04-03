import type { PricingLifecycleState, PricingSnapshot, PricingUiStage, PricingUiSummary } from "./types";
import { derivePricingUiSummary } from "../../core/pricing/pricingSummary";

function str(v: any) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function mapPricingState(value?: string | null): PricingLifecycleState {
  switch (String(value || "").toLowerCase()) {
    case "quoted":
    case "estimated":
      return "quoted";
    case "pending_reservation":
      return "pending_reservation";
    case "reserved":
      return "reserved";
    case "running":
    case "processing":
    case "processing_audio":
    case "processing_video":
      return "running";
    case "finalizing":
      return "finalizing";
    case "committed":
    case "succeeded":
      return "committed";
    case "released":
      return "released";
    case "reservation_failed":
      return "reservation_failed";
    case "commit_failed":
      return "commit_failed";
    case "release_failed":
      return "release_failed";
    case "failed":
    case "error":
      return "failed";
    default:
      return "idle";
  }
}

export function mapPricingStage(state: PricingLifecycleState): PricingUiStage {
  switch (state) {
    case "quoted":
    case "idle":
      return "estimated";
    case "pending_reservation":
    case "reserved":
      return "reserved";
    case "running":
      return "running";
    case "finalizing":
      return "finalizing";
    case "committed":
      return "committed";
    case "released":
      return "released";
    case "reservation_failed":
    case "commit_failed":
    case "release_failed":
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

export function normalizePricing(pricing: any, pricingSummary?: any): PricingSnapshot | null {
  if (!pricing && !pricingSummary) return null;

  const rawState = mapPricingState(pricing?.state || pricingSummary?.state || pricing?.status);
  const snapshot: PricingSnapshot = {
    enabled: Boolean(pricing?.enabled ?? true),
    state: rawState,
    stage: mapPricingStage(rawState),
    amount: str(pricing?.amount ?? pricingSummary?.final_amount ?? pricingSummary?.estimate_amount),
    currency: str(pricing?.currency ?? pricingSummary?.currency) || "USD",
    billedUnits: str(pricing?.billed_units),
    actualUnits: str(pricing?.actual_units),
    estimatedUnits: str(pricing?.estimated_units),
    unitsKind: str(pricing?.units_kind),
    billingMode: str(pricing?.billing_mode),
    settlementMode: str(pricing?.settlement_mode),
    skuCode: str(pricing?.sku_code),
    variantCode: str(pricing?.variant_code),
    ledgerEntryId: str(pricing?.ledger_entry_id),
    reservationId: str(pricing?.reservation_id),
    quoteId: str(pricing?.quote_id),
    previewFingerprint: str(pricing?.preview_fingerprint),
    billingAccountId: str(pricing?.billing_account_id),
    tierCode: str(pricing?.tier_code),
    entitlementSource: str(pricing?.entitlement_source),
    entitlementReason: str(pricing?.entitlement_reason),
    message: str(pricing?.message || pricingSummary?.message),
    meta: pricing?.meta ?? null,
    raw: pricing ?? pricingSummary,
  };

  return snapshot;
}

export function normalizePricingSummary(pricing: any, pricingSummary?: any): PricingUiSummary | null {
  return derivePricingUiSummary(normalizePricing(pricing, pricingSummary), {
    estimateLabel: str(pricingSummary?.estimate_label),
    finalLabel: str(pricingSummary?.final_label),
    deltaLabel: str(pricingSummary?.delta_label),
    estimateAmount: str(pricingSummary?.estimate_amount),
    finalAmount: str(pricingSummary?.final_amount),
    deltaAmount: str(pricingSummary?.delta_amount),
    currency: str(pricingSummary?.currency),
    message: str(pricingSummary?.message),
    receiptLabel: str(pricingSummary?.label),
  });
}

export function pickPricingContainer(jobOrStatus: any) {
  if (!jobOrStatus) return { pricing: null, pricingSummary: null };

  return {
    pricing:
      jobOrStatus?.pricing ??
      jobOrStatus?.payload_json?.pricing ??
      jobOrStatus?.meta_json?.pricing ??
      null,
    pricingSummary:
      jobOrStatus?.pricing_summary ??
      jobOrStatus?.payload_json?.pricing_summary ??
      jobOrStatus?.meta_json?.pricing_summary ??
      null,
  };
}
