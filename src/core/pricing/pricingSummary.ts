import type { PricingSnapshot, PricingUiSummary } from "../../features/pricing/types";

function asNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanString(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function snapshotStage(snapshot: PricingSnapshot | null | undefined): string {
  return cleanString((snapshot as any)?.stage);
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

  const summaryAny = (summary || {}) as Record<string, any>;
  const stage = snapshotStage(snapshot);

  const currency = cleanString(summaryAny.currency || snapshot?.currency || "USD") || "USD";
  const estimateAmount = summaryAny.estimateAmount ?? snapshot?.amount ?? null;
  const finalAmount = summaryAny.finalAmount ?? snapshot?.amount ?? null;
  const deltaAmount = summaryAny.deltaAmount ?? null;

  const estimateLabel =
    cleanString(summaryAny.estimateLabel) ||
    formatMoney(estimateAmount as any, currency) ||
    null;

  const finalLabel =
    cleanString(summaryAny.finalLabel) ||
    (stage === "committed" || stage === "released" ? formatMoney(finalAmount as any, currency) : null);

  const deltaLabel = cleanString(summaryAny.deltaLabel) || formatMoney(deltaAmount as any, currency) || null;

  const message =
    cleanString(summaryAny.message) ||
    (stage === "released"
      ? "Reservation released."
      : stage === "committed"
      ? "Final charge posted."
      : stage === "reserved"
      ? "Estimated amount reserved."
      : stage === "pending_reservation" || stage === "pending"
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
    receiptLabel: finalLabel || estimateLabel || buildUnitLabel(snapshot) || cleanString(summaryAny.label) || null,
  };
}
