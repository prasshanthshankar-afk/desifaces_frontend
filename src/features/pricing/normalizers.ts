import type { PricingLifecycleState, PricingSnapshot, PricingUiStage, PricingUiSummary } from "./types";
import { derivePricingUiSummary } from "../../core/pricing/pricingSummary";

function str(v: any) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}


function formatMoneyNumber(value: any): string | null {
  const raw = str(value);
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

function normalizeMoneyLabel(label: any, currency?: any): string | null {
  const raw = str(label);
  if (!raw) return null;

  const currencyCode = str(currency)?.toUpperCase() || null;
  const codeMatch = raw.match(/^([A-Za-z]{3})\s+(-?\d+(?:\.\d+)?)/);
  if (codeMatch) {
    const fixed = formatMoneyNumber(codeMatch[2]);
    return fixed ? `${codeMatch[1].toUpperCase()} ${fixed}` : raw;
  }

  const dollarMatch = raw.match(/^\$\s*(-?\d+(?:\.\d+)?)/);
  if (dollarMatch) {
    const fixed = formatMoneyNumber(dollarMatch[1]);
    return fixed ? `$${fixed}` : raw;
  }

  // Only convert plain numeric labels when a currency is known.
  // Leave labels such as "2 credits" untouched.
  if (currencyCode && /^-?\d+(?:\.\d+)?$/.test(raw)) {
    const fixed = formatMoneyNumber(raw);
    return fixed ? `${currencyCode} ${fixed}` : raw;
  }

  return raw;
}

function moneyLabelFromAmount(value: any, currency?: any): string | null {
  const fixed = formatMoneyNumber(value);
  if (!fixed) return null;
  const code = str(currency)?.toUpperCase() || "USD";
  return `${code} ${fixed}`;
}

function firstStr(...values: any[]) {
  for (const value of values) {
    const next = str(value);
    if (next) return next;
  }
  return null;
}

function isPlainRecord(value: any): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeRecords(...values: any[]): Record<string, any> | null {
  const out: Record<string, any> = {};
  for (const value of values) {
    if (!isPlainRecord(value)) continue;
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined && item !== null && item !== "") out[key] = item;
    }
  }
  return Object.keys(out).length ? out : null;
}

function pickRunReceipt(source: any): Record<string, any> | null {
  return mergeRecords(
    source?.run_receipt,
    source?.runReceipt,
    source?.payload_json?.run_receipt,
    source?.payload_json?.runReceipt,
    source?.meta_json?.run_receipt,
    source?.meta_json?.runReceipt
  );
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

  const merged = mergeRecords(pricing, pricingSummary) ?? {};
  const rawState = mapPricingState(firstStr(merged.state, merged.status, pricing?.state, pricingSummary?.state, pricing?.status));
  const snapshot: PricingSnapshot = {
    enabled: Boolean(merged.enabled ?? true),
    state: rawState,
    stage: mapPricingStage(rawState),
    amount: firstStr(
      merged.amount,
      merged.final_amount,
      merged.finalAmount,
      pricingSummary?.final_amount,
      pricingSummary?.finalAmount,
      pricingSummary?.amount,
      pricingSummary?.estimated_amount,
      pricingSummary?.estimatedAmount
    ),
    currency: firstStr(merged.currency, pricingSummary?.currency) || "USD",
    billedUnits: firstStr(merged.billed_units, merged.billedUnits, pricingSummary?.billed_units, pricingSummary?.billedUnits),
    actualUnits: firstStr(merged.actual_units, merged.actualUnits, pricingSummary?.actual_units, pricingSummary?.actualUnits),
    estimatedUnits: firstStr(merged.estimated_units, merged.estimatedUnits, pricingSummary?.estimated_units, pricingSummary?.estimatedUnits),
    unitsKind: firstStr(merged.units_kind, merged.unitsKind),
    billingMode: firstStr(merged.billing_mode, merged.billingMode, pricingSummary?.billing_mode, pricingSummary?.billingMode),
    settlementMode: firstStr(merged.settlement_mode, merged.settlementMode, pricingSummary?.settlement_mode, pricingSummary?.settlementMode),
    skuCode: firstStr(merged.sku_code, merged.skuCode, pricingSummary?.sku_code, pricingSummary?.skuCode),
    variantCode: firstStr(merged.variant_code, merged.variantCode, pricingSummary?.variant_code, pricingSummary?.variantCode),
    ledgerEntryId: firstStr(merged.ledger_entry_id, merged.ledgerEntryId, pricingSummary?.ledger_entry_id, pricingSummary?.ledgerEntryId),
    reservationId: firstStr(merged.reservation_id, merged.reservationId, pricingSummary?.reservation_id, pricingSummary?.reservationId),
    quoteId: firstStr(merged.quote_id, merged.quoteId),
    previewFingerprint: firstStr(merged.preview_fingerprint, merged.previewFingerprint),
    billingAccountId: firstStr(merged.billing_account_id, merged.billingAccountId, pricingSummary?.billing_account_id, pricingSummary?.billingAccountId),
    tierCode: firstStr(merged.tier_code, merged.tierCode),
    entitlementSource: firstStr(merged.entitlement_source, merged.entitlementSource),
    entitlementReason: firstStr(merged.entitlement_reason, merged.entitlementReason),
    message: firstStr(merged.message, pricingSummary?.message, merged.display_note, merged.displayNote, pricingSummary?.display_note, pricingSummary?.displayNote),
    meta: merged.meta ?? pricing?.meta ?? null,
    raw: merged,
  };

  return snapshot;
}

export function normalizePricingSummary(pricing: any, pricingSummary?: any): PricingUiSummary | null {
  const merged = mergeRecords(pricing, pricingSummary) ?? {};
  const currency = firstStr(pricingSummary?.currency, merged.currency) || "USD";

  const estimateAmount = firstStr(
    pricingSummary?.estimateAmount,
    pricingSummary?.estimate_amount,
    pricingSummary?.estimatedAmount,
    pricingSummary?.estimated_amount,
    merged.estimatedAmount,
    merged.estimated_amount,
    merged.amount
  );
  const finalAmount = firstStr(
    pricingSummary?.finalAmount,
    pricingSummary?.final_amount,
    merged.finalAmount,
    merged.final_amount,
    merged.amount
  );

  const estimateLabel =
    normalizeMoneyLabel(
      firstStr(
        pricingSummary?.estimateLabel,
        pricingSummary?.estimate_label,
        pricingSummary?.displayEstimate,
        pricingSummary?.display_estimate,
        merged.displayEstimate,
        merged.display_estimate
      ),
      currency
    ) ?? moneyLabelFromAmount(estimateAmount, currency);

  const finalLabel =
    normalizeMoneyLabel(
      firstStr(
        pricingSummary?.finalLabel,
        pricingSummary?.final_label,
        pricingSummary?.displayFinal,
        pricingSummary?.display_final,
        merged.displayFinal,
        merged.display_final
      ),
      currency
    ) ?? moneyLabelFromAmount(finalAmount, currency);

  const deltaLabel = normalizeMoneyLabel(
    firstStr(pricingSummary?.deltaLabel, pricingSummary?.delta_label, pricingSummary?.displayDelta, pricingSummary?.display_delta, merged.displayDelta, merged.display_delta),
    currency
  );

  return derivePricingUiSummary(normalizePricing(pricing, pricingSummary), {
    estimateLabel,
    finalLabel,
    deltaLabel,
    estimateAmount: formatMoneyNumber(estimateAmount) ?? estimateAmount,
    finalAmount: formatMoneyNumber(finalAmount) ?? finalAmount,
    deltaAmount: formatMoneyNumber(firstStr(pricingSummary?.deltaAmount, pricingSummary?.delta_amount, merged.deltaAmount, merged.delta_amount)) ?? firstStr(pricingSummary?.deltaAmount, pricingSummary?.delta_amount, merged.deltaAmount, merged.delta_amount),
    currency,
    message: firstStr(pricingSummary?.message, pricingSummary?.displayNote, pricingSummary?.display_note, merged.message, merged.displayNote, merged.display_note),
    receiptLabel: firstStr(pricingSummary?.label, pricingSummary?.receiptLabel, pricingSummary?.receipt_label, merged.label, merged.receiptLabel, merged.receipt_label),
  });
}

export function pickPricingContainer(jobOrStatus: any) {
  if (!jobOrStatus) return { pricing: null, pricingSummary: null };

  const receipt = pickRunReceipt(jobOrStatus);

  const pricing =
    jobOrStatus?.pricing ??
    jobOrStatus?.payload_json?.pricing ??
    jobOrStatus?.meta_json?.pricing ??
    null;

  const pricingSummary =
    jobOrStatus?.pricing_summary ??
    jobOrStatus?.pricingSummary ??
    jobOrStatus?.payload_json?.pricing_summary ??
    jobOrStatus?.payload_json?.pricingSummary ??
    jobOrStatus?.meta_json?.pricing_summary ??
    jobOrStatus?.meta_json?.pricingSummary ??
    null;

  if (!receipt) {
    return { pricing, pricingSummary };
  }

  const mergedPricing = mergeRecords(pricing, pricingSummary, receipt);
  const mergedSummary = mergeRecords(pricingSummary, receipt);

  return {
    pricing: mergedPricing,
    pricingSummary: mergedSummary,
  };
}
