import type { PricingSnapshot, PricingUiSummary } from "../../features/pricing/types";

function asNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(amount: string | number | null | undefined, currency = "USD") {
  const n = asNum(amount);
  if (n == null) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function buildUnitLabel(snapshot: PricingSnapshot | null | undefined) {
  if (!snapshot) return null;
  const actual = snapshot.actualUnits || snapshot.billedUnits || snapshot.estimatedUnits;
  if (!actual) return null;
  const unitsKind = snapshot.unitsKind || "units";
  return `${actual} ${unitsKind}`;
}

export function derivePricingUiSummary(
  snapshot: PricingSnapshot | null | undefined,
  summary?: Partial<PricingUiSummary> | Record<string, any> | null
): PricingUiSummary | null {
  if (!snapshot && !summary) return null;

  const currency = String(summary?.currency || snapshot?.currency || "USD");
  const estimateAmount = summary?.estimateAmount ?? snapshot?.amount ?? null;
  const finalAmount = summary?.finalAmount ?? snapshot?.amount ?? null;
  const deltaAmount = summary?.deltaAmount ?? null;

  const estimateLabel =
    String(summary?.estimateLabel || "").trim() ||
    formatMoney(estimateAmount as any, currency) ||
    null;

  const finalLabel =
    String(summary?.finalLabel || "").trim() ||
    (snapshot?.stage === "committed" || snapshot?.stage === "released"
      ? formatMoney(finalAmount as any, currency)
      : null);

  const deltaLabel =
    String(summary?.deltaLabel || "").trim() || formatMoney(deltaAmount as any, currency) || null;

  const message =
    String(summary?.message || "").trim() ||
    (snapshot?.stage === "released"
      ? "Reservation released."
      : snapshot?.stage === "committed"
      ? "Final charge posted."
      : snapshot?.stage === "reserved"
      ? "Estimated amount reserved."
      : snapshot?.stage === "pending_reservation"
      ? "Reserving credits or spend allowance…"
      : null);

  return {
    estimateLabel,
    finalLabel,
    deltaLabel,
    estimateAmount: estimateAmount == null ? null : String(estimateAmount),
    finalAmount: finalAmount == null ? null : String(finalAmount),
    deltaAmount: deltaAmount == null ? null : String(deltaAmount),
    currency,
    message,
    receiptLabel:
      finalLabel || estimateLabel || buildUnitLabel(snapshot) || String(summary?.label || "").trim() || null,
  };
}
