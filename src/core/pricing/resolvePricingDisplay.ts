import React from "react";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../auth/AuthContext";
import * as PaymentsApi from "../payments/apiPayments";
import { useAccountPricingSnapshot } from "./useAccountPricingSnapshot";

export type PricingDisplayKind = "credits" | "postpaid";

export type ResolvedPricingDisplay = {
  source: "payments_overview" | "dashboard_home" | "snapshot_fallback" | "fallback_label_only";
  accountTruthSource: "snapshot" | "payments_overview" | "dashboard_home" | "fallback";
  planName: string;
  availableCredits: number | null;
  reservedCredits: number | null;
  usedCredits: number | null;
  usagePercent: number;
  totalCredits: number | null;
  compactUsageLabel: string | null;
  usageLabel: string | null;
  topLine: string | null;
  heroLines: string[];
  displayKind: PricingDisplayKind;
  billingValue: string | null;
  isEnterprisePlan: boolean;
  isPostpaidLike: boolean;
  settlementKind: "postpaid" | "credits" | "free" | null;
  tierCode: string | null;
  planCode: string | null;
  billingAccountId: string | null;
  readableAvailableLabel: string | null;
  availableOutOfTotalLabel: string | null;
  includedAvailableCredits: number | null;
  includedReservedCredits: number | null;
  includedUsedCredits: number | null;
  walletAvailableCredits: number | null;
  walletReservedCredits: number | null;
  promoAvailableCredits: number | null;
  promoReservedCredits: number | null;
  totalSpendableCredits: number | null;
  includedLabel: string | null;
  walletLabel: string | null;
  promoLabel: string | null;
  creditBreakdownLabel: string | null;
  creditDetailLabel: string | null;
};

type ResolveOptions = {
  dashboardData?: any;
  snapshot?: any;
  fallbackPlanName?: string | null;
};

type CreditSnapshot = {
  availableCredits: number | null;
  reservedCredits: number | null;
  usedCredits: number | null;
  totalCredits: number | null;
  walletCredits: number | null;
  usagePercent: number | null;
  includedAvailableCredits: number | null;
  includedReservedCredits: number | null;
  includedUsedCredits: number | null;
  walletAvailableCredits: number | null;
  walletReservedCredits: number | null;
  promoAvailableCredits: number | null;
  promoReservedCredits: number | null;
  totalSpendableCredits: number | null;
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function roundTo(value: number, digits = 4) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

export function parsePricingNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumericValue(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parsePricingNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function asRecord(value: any): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  return text ? text : null;
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function formatWhole(value: number | null | undefined, fallback = "0") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.max(0, Math.round(value))}`;
}

function positiveCredit(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(0, Math.round(value));
}

function creditPiece(label: string, value: number | null | undefined): string | null {
  const n = positiveCredit(value);
  return n == null ? null : `${label} ${formatWhole(n)}`;
}

function compactCreditPieces(...pieces: Array<string | null | undefined>): string | null {
  const clean = pieces.filter((x): x is string => !!x && String(x).trim().length > 0);
  return clean.length ? clean.join(" + ") : null;
}

function normalizePlanCode(rawPlanCode: unknown) {
  const normalized = String(rawPlanCode || "free").trim().toLowerCase();
  if (/(enterprise)/.test(normalized)) return "enterprise_monthly_v1";
  if (/business_yearly/.test(normalized)) return "business_yearly_v1";
  if (/(business)/.test(normalized)) return "business_monthly_v1";
  if (/pro_yearly/.test(normalized)) return "pro_yearly_v1";
  if (/(pro|creator pro)/.test(normalized)) return "pro_monthly_v1";
  return "free";
}

function normalizeBillingKind(raw: unknown): "postpaid" | "credits" | "free" | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("postpaid") || value.includes("invoice") || value.includes("money")) return "postpaid";
  if (value.includes("credit") || value.includes("prepaid") || value.includes("wallet")) return "credits";
  if (value.includes("free")) return "free";
  return null;
}

function normalizeUsageRatio(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw)) return null;
  const ratio = raw > 1 ? raw / 100 : raw;
  return roundTo(clamp(ratio, 0, 1), 4);
}

function buildCreditUsageLabel(
  availableCredits: number | null,
  reservedCredits: number | null,
  _usedCredits: number | null,
  _totalCredits: number | null
) {
  if (availableCredits == null && reservedCredits == null) return null;
  return `${formatWhole(availableCredits, "0")} available • ${formatWhole(reservedCredits, "0")} reserved`;
}

function buildPostpaidUsageLabel(reservedCredits: number | null, usedCredits: number | null) {
  return `${formatWhole(usedCredits, "0")} used • ${formatWhole(reservedCredits, "0")} reserved • billed after completion`;
}

function joinUrl(base: string, path: any) {
  const b = String(base ?? "").replace(/\/+$/, "");
  const raw =
    typeof path === "string"
      ? path
      : typeof path?.path === "string"
        ? path.path
        : typeof path?.url === "string"
          ? path.url
          : "";
  const p0 = String(raw ?? "");
  const p = p0.startsWith("/") ? p0 : `/${p0}`;
  return `${b}${p}`;
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

async function fetchPaymentsOverviewOrThrow({
  countryCode,
}: {
  countryCode?: string | null;
}) {
  const data = await PaymentsApi.apiGetPaymentsOverview(countryCode || "US");
  return { ...(data || {}), __pricing_overview_source: true };
}

function extractCanonicalHome(data: any) {
  const plan = data?.plan_summary ?? data?.planSummary ?? data?.current_plan ?? null;
  const pricing = data?.pricing_summary ?? data?.pricingSummary ?? data?.credits ?? data?.account ?? null;
  const usage = data?.usage_summary ?? data?.usageSummary ?? null;
  const runway = data?.runway_summary ?? data?.runwaySummary ?? null;
  const balance = data?.balance ?? data?.credit_balance ?? null;
  const header = data?.header ?? null;
  const currentSubscription = data?.current_subscription ?? data?.currentSubscription ?? null;
  const hasAny = !!plan || !!pricing || !!usage || !!runway || !!balance || !!header || !!currentSubscription;
  return hasAny ? { plan, pricing, usage, runway, balance, header, currentSubscription, raw: data } : null;
}

function extractCanonicalSnapshot(snapshot: any) {
  const plan = snapshot?.planSummary ?? snapshot?.plan_summary ?? snapshot?.current_plan ?? null;
  const pricing = snapshot?.pricingSummary ?? snapshot?.pricing_summary ?? snapshot?.credits ?? snapshot?.account ?? null;
  const usage = snapshot?.usageSummary ?? snapshot?.usage_summary ?? null;
  const runway = snapshot?.runwaySummary ?? snapshot?.runway_summary ?? null;
  const balance = snapshot?.balance ?? snapshot?.credit_balance ?? null;
  const header = snapshot?.header ?? null;
  const currentSubscription = snapshot?.currentSubscription ?? snapshot?.current_subscription ?? null;
  const hasAny =
    !!plan ||
    !!pricing ||
    !!usage ||
    !!runway ||
    !!balance ||
    !!header ||
    !!currentSubscription ||
    snapshot?.planName ||
    snapshot?.plan_name ||
    snapshot?.tierCode ||
    snapshot?.tier_code ||
    snapshot?.availableCredits ||
    snapshot?.available_credits ||
    snapshot?.usedCredits ||
    snapshot?.used_credits;
  return hasAny ? { plan, pricing, usage, runway, balance, header, currentSubscription, raw: snapshot } : null;
}

function resolveCreditSnapshot(raw: any, canonical: any): CreditSnapshot {
  const r = asRecord(raw);
  const plan = asRecord(canonical?.plan);
  const pricing = asRecord(canonical?.pricing);
  const usage = asRecord(canonical?.usage);
  const runway = asRecord(canonical?.runway);
  const balance = asRecord(canonical?.balance);
  const header = asRecord(canonical?.header);

  // Live spendable account truth first. Entitlement/cycle fields such as
  // included_credits_remaining are intentionally late fallbacks because they can
  // remain at the plan grant (for example 500) while the actual wallet/account
  // available balance has already moved (for example 97).
  const availableCredits = firstNumericValue(
    r.totalAvailable,
    r.total_available,
    r.totalSpendableCredits,
    r.total_spendable_credits,
    r.availableCredits,
    r.available_credits,
    r.creditAvailable,
    r.credit_available,
    pricing.total_available,
    pricing.totalAvailable,
    pricing.total_spendable,
    pricing.totalSpendable,
    pricing.available_credits,
    pricing.availableCredits,
    pricing.spendable_credits,
    pricing.spendableCredits,
    balance.total_available,
    balance.totalAvailable,
    balance.available_credits,
    balance.availableCredits,
    balance.spendable_credits,
    balance.spendableCredits,
    runway.total_available,
    runway.totalAvailable,
    runway.available_credits,
    runway.availableCredits,
    usage.total_available,
    usage.totalAvailable,
    usage.available_credits,
    usage.availableCredits,
    header.total_available,
    header.totalAvailable,
    header.available_credits,
    header.availableCredits,
    r.credits?.total_available,
    r.credits?.total_spendable,
    r.credits?.available_credits,
    r.account?.total_available,
    r.account?.available_credits,
    r.pricing_account?.available_credits,
    // last-resort entitlement/cycle fields only
    pricing.included_credits_remaining,
    pricing.includedCreditsRemaining,
    usage.included_credits_remaining,
    plan.included_credits_remaining,
    plan.includedCreditsRemaining,
    r.included_credits_remaining,
  );

  const reservedCredits = firstNumericValue(
    r.reservedCredits,
    r.reserved_credits,
    pricing.reserved_credits,
    pricing.reservedCredits,
    balance.reserved_credits,
    balance.reservedCredits,
    runway.reserved_credits,
    runway.reservedCredits,
    usage.reserved_credits,
    usage.reservedCredits,
    header.reserved_credits,
    header.reservedCredits,
    r.credits?.reserved_credits,
    r.account?.reserved_credits,
    r.pricing_account?.reserved_credits,
  );

  const usedCredits = firstNumericValue(
    r.includedUsedCredits,
    r.included_used_credits,
    r.included_used,
    r.credits?.included_used,
    r.credits?.included_credits_used,
    pricing.included_used,
    pricing.includedUsed,
    pricing.included_credits_used,
    usage.included_used,
    usage.included_credits_used,
    runway.included_used,
    header.included_used,
    r.usedCredits,
    r.used_credits,
    r.consumedCredits,
    r.consumed_credits,
    pricing.used_credits,
    pricing.usedCredits,
    pricing.consumed_credits,
    pricing.consumedCredits,
    usage.used_credits,
    usage.usedCredits,
    usage.consumed_credits,
    usage.consumedCredits,
    runway.used_credits,
    runway.usedCredits,
    header.used_credits,
    header.usedCredits,
    r.credits?.used_credits,
    r.account?.used_credits,
    r.pricing_account?.used_credits,
    // last-resort entitlement/cycle fields only
    usage.included_credits_used,
    pricing.included_credits_used,
    plan.included_credits_used,
  );

  const totalCredits = firstNumericValue(
    r.totalCredits,
    r.total_credits,
    r.creditCap,
    r.credit_cap,
    pricing.total_credits,
    pricing.totalCredits,
    pricing.credit_cap,
    pricing.creditCap,
    pricing.monthly_credit_cap,
    pricing.monthlyCreditCap,
    balance.total_credits,
    balance.totalCredits,
    usage.total_credits,
    usage.totalCredits,
    usage.credit_cap,
    runway.total_credits,
    runway.totalCredits,
    header.total_credits,
    header.totalCredits,
    plan.included_credits_total,
    plan.includedCreditsTotal,
    pricing.included_credits_total,
  );

  const includedAvailableCredits = firstNumericValue(
    r.includedAvailableCredits,
    r.included_available_credits,
    r.included_available,
    pricing.included_available,
    pricing.includedAvailable,
    pricing.included_credits_available,
    pricing.includedCreditsAvailable,
    balance.included_available,
    balance.included_credits_available,
    usage.included_available,
    usage.included_credits_available,
    runway.included_available,
    runway.included_credits_available,
    header.included_available,
    header.included_credits_available,
    r.credits?.included_available,
    r.credits?.included_credits_available,
    r.account?.included_available,
    r.pricing_account?.included_available,
  );

  const includedReservedCredits = firstNumericValue(
    r.includedReservedCredits,
    r.included_reserved_credits,
    r.included_reserved,
    pricing.included_reserved,
    pricing.includedReserved,
    pricing.included_credits_reserved,
    balance.included_reserved,
    usage.included_reserved,
    runway.included_reserved,
    header.included_reserved,
    r.credits?.included_reserved,
    r.credits?.included_credits_reserved,
  );

  const includedUsedCredits = firstNumericValue(
    r.includedUsedCredits,
    r.included_used_credits,
    r.included_used,
    pricing.included_used,
    pricing.includedUsed,
    pricing.included_credits_used,
    usage.included_used,
    usage.included_credits_used,
    runway.included_used,
    header.included_used,
    r.credits?.included_used,
    r.credits?.included_credits_used,
  );

  const walletAvailableCredits = firstNumericValue(
    r.walletAvailableCredits,
    r.wallet_available_credits,
    r.wallet_available,
    r.topup_available,
    r.top_up_available,
    r.purchased_available,
    r.purchased_credits_available,
    pricing.wallet_available,
    pricing.walletAvailable,
    pricing.topup_available,
    pricing.top_up_available,
    pricing.purchased_available,
    pricing.purchased_credits_available,
    pricing.purchased_credits_available,
    balance.wallet_available,
    balance.topup_available,
    balance.top_up_available,
    balance.purchased_available,
    balance.purchased_credits_available,
    usage.wallet_available,
    usage.topup_available,
    usage.top_up_available,
    usage.purchased_available,
    usage.purchased_credits_available,
    runway.wallet_available,
    runway.topup_available,
    runway.top_up_available,
    runway.purchased_available,
    runway.purchased_credits_available,
    header.wallet_available,
    header.topup_available,
    header.top_up_available,
    header.purchased_available,
    header.purchased_credits_available,
    r.credits?.wallet_available,
    r.credits?.topup_available,
    r.credits?.top_up_available,
    r.credits?.purchased_available,
    r.credits?.purchased_credits_available,
    r.account?.wallet_available,
    r.pricing_account?.wallet_available,
  );

  const walletReservedCredits = firstNumericValue(
    r.walletReservedCredits,
    r.wallet_reserved_credits,
    r.wallet_reserved,
    r.topup_reserved,
    r.purchased_reserved,
    pricing.wallet_reserved,
    pricing.walletReserved,
    pricing.topup_reserved,
    pricing.purchased_reserved,
    balance.wallet_reserved,
    balance.topup_reserved,
    balance.purchased_reserved,
    usage.wallet_reserved,
    usage.topup_reserved,
    usage.purchased_reserved,
    runway.wallet_reserved,
    runway.topup_reserved,
    runway.purchased_reserved,
    header.wallet_reserved,
    header.topup_reserved,
    header.purchased_reserved,
    r.credits?.wallet_reserved,
    r.credits?.topup_reserved,
    r.credits?.purchased_reserved,
  );

  const promoAvailableCredits = firstNumericValue(
    r.promoAvailableCredits,
    r.promo_available_credits,
    r.promo_available,
    pricing.promo_available,
    pricing.promoAvailable,
    balance.promo_available,
    usage.promo_available,
    runway.promo_available,
    header.promo_available,
    r.credits?.promo_available,
  );

  const promoReservedCredits = firstNumericValue(
    r.promoReservedCredits,
    r.promo_reserved_credits,
    r.promo_reserved,
    pricing.promo_reserved,
    pricing.promoReserved,
    balance.promo_reserved,
    usage.promo_reserved,
    runway.promo_reserved,
    header.promo_reserved,
    r.credits?.promo_reserved,
  );

  const totalSpendableCredits = firstNumericValue(
    r.totalSpendableCredits,
    r.total_spendable_credits,
    r.total_spendable,
    r.total_available,
    pricing.total_spendable,
    pricing.totalSpendable,
    pricing.total_available,
    pricing.totalAvailable,
    balance.total_spendable,
    balance.total_available,
    usage.total_spendable,
    usage.total_available,
    runway.total_spendable,
    runway.total_available,
    header.total_spendable,
    header.total_available,
    r.credits?.total_spendable,
    r.credits?.total_available,
  );

  const walletCredits = firstNumericValue(
    walletAvailableCredits,
    r.walletCredits,
    r.wallet_credits,
    r.walletBalanceCredits,
    r.wallet_balance_credits,
    r.topupCredits,
    r.topup_credits,
    r.purchasedCredits,
    r.purchased_credits,
    pricing.wallet_credits,
    pricing.walletCredits,
    pricing.wallet_balance_credits,
    pricing.walletBalanceCredits,
    pricing.topup_credits,
    pricing.purchased_credits,
    balance.wallet_credits,
    balance.wallet_balance_credits,
    balance.topup_credits,
    balance.purchased_credits,
    usage.wallet_credits,
    usage.wallet_balance_credits,
    usage.topup_credits,
    header.wallet_credits,
    header.wallet_balance_credits,
    r.credits?.wallet_credits,
    r.credits?.topup_credits,
    r.credits?.purchased_credits,
  );

  const usagePercent = firstNumericValue(
    r.usagePercent,
    r.usage_percent,
    usage.usage_percent,
    usage.usagePercent,
    pricing.usage_percent,
    runway.usage_percent,
    header.usage_percent,
  );

  return {
    availableCredits,
    reservedCredits,
    usedCredits,
    totalCredits,
    walletCredits,
    usagePercent,
    includedAvailableCredits,
    includedReservedCredits,
    includedUsedCredits,
    walletAvailableCredits,
    walletReservedCredits,
    promoAvailableCredits,
    promoReservedCredits,
    totalSpendableCredits,
  };
}

export function resolveAvailableCredits(input: { overview?: any; pricing?: any; pricingSummary?: any; balance?: any }): number | null {
  return firstNumericValue(
    input?.pricingSummary?.available_credits,
    input?.pricingSummary?.availableCredits,
    input?.pricing?.available_credits,
    input?.pricing?.availableCredits,
    input?.balance?.available_credits,
    input?.balance?.availableCredits,
    input?.overview?.pricing_summary?.available_credits,
    input?.overview?.usage_summary?.available_credits,
    input?.overview?.credits?.available_credits,
    input?.overview?.account?.available_credits,
    input?.overview?.balance?.available_credits,
  );
}

export function shouldHidePricingLine(pricing: any): boolean {
  const p = asRecord(pricing);
  const state = String(p.state ?? "").trim().toLowerCase();
  const billingMode = String(p.billing_mode ?? p.billingMode ?? "").trim().toLowerCase();
  const settlementMode = String(p.settlement_mode ?? p.settlementMode ?? "").trim().toLowerCase();
  return (
    state === "suppressed" ||
    billingMode === "internal" ||
    settlementMode === "internal" ||
    p.suppressed === true ||
    p.pricing_suppressed === true ||
    p.suppress_pricing === true ||
    p.enabled === false
  );
}

export function resolveJobChargeLabel(pricing: any, pricingSummary?: any): string | null {
  if (shouldHidePricingLine(pricing)) return null;
  const p = asRecord(pricing);
  const s = asRecord(pricingSummary ?? p.summary);
  const state = String(p.state ?? s.state ?? "").trim().toLowerCase();

  if (state === "released") {
    return (
      pickText(s.display_final, s.finalLabel, s.final_label, p.final_amount) ||
      (p.currency ? `${p.currency} 0.00` : "0.00")
    );
  }

  if (state === "committed") {
    return pickText(
      s.display_final,
      s.finalLabel,
      s.final_label,
      s.receiptLabel,
      s.receipt_label,
      p.final_amount != null && p.currency ? `${p.currency} ${p.final_amount}` : null,
      p.final_amount,
      p.amount != null && p.currency ? `${p.currency} ${p.amount}` : null,
    );
  }

  return pickText(
    s.display_estimate,
    s.estimateLabel,
    s.estimate_label,
    s.display_final,
    p.estimated_amount != null && p.currency ? `${p.currency} ${p.estimated_amount}` : null,
    p.amount != null && p.currency ? `${p.currency} ${p.amount}` : null,
    p.estimated_amount,
    p.amount,
  );
}

export function resolvePricingDisplay({
  dashboardData,
  snapshot,
  fallbackPlanName,
}: ResolveOptions): ResolvedPricingDisplay {
  const home = extractCanonicalHome(dashboardData ?? {});
  const snap = extractCanonicalSnapshot(snapshot ?? {});
  const isPaymentsOverview = Boolean((dashboardData as any)?.__pricing_overview_source);
  const source = isPaymentsOverview && home
    ? "payments_overview"
    : home && !snap
      ? "dashboard_home"
      : snap
        ? "snapshot_fallback"
        : "fallback_label_only";

  const snapCredits = resolveCreditSnapshot(snapshot ?? {}, snap);
  const homeCredits = resolveCreditSnapshot(dashboardData ?? {}, home);

  const snapPlanName = pickText(
    snapshot?.planName,
    snapshot?.plan_name,
    snap?.plan?.plan_name,
    snap?.plan?.planName,
    snap?.pricing?.plan_name,
    snap?.usage?.plan_name,
    snap?.currentSubscription?.plan_name,
  );

  const homePlanName = pickText(
    home?.runway?.plan_name,
    home?.header?.plan_label,
    home?.plan?.plan_name,
    home?.plan?.planName,
    home?.pricing?.plan_name,
    home?.usage?.plan_name,
    home?.currentSubscription?.plan_name,
    dashboardData?.current_plan?.plan_name,
  );

  const snapTierCode = pickText(
    snap?.plan?.tier_code,
    snap?.pricing?.tier_code,
    snap?.usage?.tier_code,
    snapshot?.tierCode,
    snapshot?.tier_code,
  );

  const homeTierCode = pickText(
    home?.plan?.tier_code,
    home?.pricing?.tier_code,
    home?.usage?.tier_code,
    dashboardData?.current_plan?.tier_code,
  );

  const snapPlanNorm = normalizePlanCode(snapPlanName || snapTierCode || "");
  const homePlanNorm = normalizePlanCode(homePlanName || homeTierCode || "");
  const hasSnapshotTruth =
    !!snapPlanName ||
    !!snapTierCode ||
    snapCredits.availableCredits != null ||
    snapCredits.reservedCredits != null ||
    snapCredits.usedCredits != null;

  const homeConflictsWithSnapshot =
    hasSnapshotTruth &&
    !!home &&
    (
      (snapPlanName && homePlanName && snapPlanNorm !== homePlanNorm) ||
      (snapTierCode && homeTierCode && String(snapTierCode).trim().toLowerCase() !== String(homeTierCode).trim().toLowerCase()) ||
      (snapPlanNorm !== "free" && homePlanNorm === "free")
    );

  const canonicalHomeWins = isPaymentsOverview && !!home;

  const accountTruthSource: "snapshot" | "payments_overview" | "dashboard_home" | "fallback" =
    canonicalHomeWins ? "payments_overview" : hasSnapshotTruth ? "snapshot" : home ? "dashboard_home" : "fallback";

  const effectiveCredits = canonicalHomeWins ? homeCredits : hasSnapshotTruth ? snapCredits : homeCredits;
  // Split fields are newest backend contract values. When /api/payments/overview
  // is present it is authoritative and must win over stale dashboard/snapshot data.
  const splitCredits = canonicalHomeWins
    ? {
        includedAvailableCredits: homeCredits.includedAvailableCredits ?? snapCredits.includedAvailableCredits,
        includedReservedCredits: homeCredits.includedReservedCredits ?? snapCredits.includedReservedCredits,
        includedUsedCredits: homeCredits.includedUsedCredits ?? snapCredits.includedUsedCredits,
        walletAvailableCredits: homeCredits.walletAvailableCredits ?? snapCredits.walletAvailableCredits,
        walletReservedCredits: homeCredits.walletReservedCredits ?? snapCredits.walletReservedCredits,
        promoAvailableCredits: homeCredits.promoAvailableCredits ?? snapCredits.promoAvailableCredits,
        promoReservedCredits: homeCredits.promoReservedCredits ?? snapCredits.promoReservedCredits,
        totalSpendableCredits: homeCredits.totalSpendableCredits ?? snapCredits.totalSpendableCredits,
      }
    : {
        includedAvailableCredits: snapCredits.includedAvailableCredits ?? homeCredits.includedAvailableCredits,
        includedReservedCredits: snapCredits.includedReservedCredits ?? homeCredits.includedReservedCredits,
        includedUsedCredits: snapCredits.includedUsedCredits ?? homeCredits.includedUsedCredits,
        walletAvailableCredits: snapCredits.walletAvailableCredits ?? homeCredits.walletAvailableCredits,
        walletReservedCredits: snapCredits.walletReservedCredits ?? homeCredits.walletReservedCredits,
        promoAvailableCredits: snapCredits.promoAvailableCredits ?? homeCredits.promoAvailableCredits,
        promoReservedCredits: snapCredits.promoReservedCredits ?? homeCredits.promoReservedCredits,
        totalSpendableCredits: snapCredits.totalSpendableCredits ?? homeCredits.totalSpendableCredits,
      };

  const planName =
    pickText(
      canonicalHomeWins ? homePlanName : snapPlanName,
      canonicalHomeWins ? snapPlanName : homeConflictsWithSnapshot ? null : homePlanName,
      fallbackPlanName,
    ) || "Free";

  const tierCode =
    pickText(
      canonicalHomeWins ? homeTierCode : snapTierCode,
      canonicalHomeWins ? snapTierCode : homeConflictsWithSnapshot ? null : homeTierCode,
    ) || null;

  const planCode = canonicalHomeWins
    ? pickText(
        home?.plan?.plan_code,
        home?.pricing?.plan_code,
        home?.usage?.plan_code,
        dashboardData?.current_plan?.plan_code,
        dashboardData?.current_subscription?.plan_code,
        snap?.plan?.plan_code,
        snap?.pricing?.plan_code,
        snap?.usage?.plan_code,
        snapshot?.planCode,
        snapshot?.plan_code,
      ) || null
    : pickText(
        snap?.plan?.plan_code,
        snap?.pricing?.plan_code,
        snap?.usage?.plan_code,
        snapshot?.planCode,
        snapshot?.plan_code,
        homeConflictsWithSnapshot ? null : home?.plan?.plan_code,
        homeConflictsWithSnapshot ? null : home?.pricing?.plan_code,
        homeConflictsWithSnapshot ? null : home?.usage?.plan_code,
        homeConflictsWithSnapshot ? null : dashboardData?.current_plan?.plan_code,
        homeConflictsWithSnapshot ? null : dashboardData?.current_subscription?.plan_code,
      ) || null;

  const billingAccountId =
    pickText(
      canonicalHomeWins ? home?.plan?.billing_account_id : null,
      canonicalHomeWins ? home?.pricing?.billing_account_id : null,
      canonicalHomeWins ? dashboardData?.billing_account_id : null,
      snapshot?.billingAccountId,
      snapshot?.billing_account_id,
      snapshot?.billingAccount?.id,
      snapshot?.billing_account?.id,
      snap?.pricing?.billing_account_id,
      canonicalHomeWins ? null : homeConflictsWithSnapshot ? null : home?.plan?.billing_account_id,
      canonicalHomeWins ? null : homeConflictsWithSnapshot ? null : home?.pricing?.billing_account_id,
      canonicalHomeWins ? null : homeConflictsWithSnapshot ? null : dashboardData?.billing_account_id,
    ) || null;

  const settlementKind = normalizeBillingKind(
    pickText(
      canonicalHomeWins ? home?.pricing?.settlement_mode : null,
      canonicalHomeWins ? home?.pricing?.billing_mode : null,
      canonicalHomeWins ? home?.usage?.settlement_mode : null,
      canonicalHomeWins ? home?.usage?.billing_mode : null,
      canonicalHomeWins ? dashboardData?.settlement_mode : null,
      canonicalHomeWins ? dashboardData?.billing_mode : null,
      snap?.pricing?.settlement_mode,
      snap?.pricing?.billing_mode,
      snap?.usage?.settlement_mode,
      snap?.usage?.billing_mode,
      snapshot?.settlementMode,
      snapshot?.settlement_mode,
      snapshot?.billingMode,
      snapshot?.billing_mode,
      homeConflictsWithSnapshot ? null : home?.pricing?.settlement_mode,
      homeConflictsWithSnapshot ? null : home?.pricing?.billing_mode,
      homeConflictsWithSnapshot ? null : home?.usage?.settlement_mode,
      homeConflictsWithSnapshot ? null : home?.usage?.billing_mode,
      homeConflictsWithSnapshot ? null : dashboardData?.settlement_mode,
      homeConflictsWithSnapshot ? null : dashboardData?.billing_mode,
    )
  );

  const availableCredits = effectiveCredits.availableCredits;
  const reservedCredits = effectiveCredits.reservedCredits;
  const usedCredits = effectiveCredits.usedCredits;
  const totalCredits =
    effectiveCredits.totalCredits ??
    (normalizePlanCode(planName) === "free" ? 100 : null);

  const usagePercent =
    normalizeUsageRatio(effectiveCredits.usagePercent) ??
    (totalCredits && totalCredits > 0
      ? roundTo(clamp(Math.max(0, usedCredits ?? 0) / totalCredits, 0, 1), 4)
      : 0);

  const isEnterprisePlan =
    normalizePlanCode(planName) === "enterprise_monthly_v1" ||
    String(tierCode || "").trim().toLowerCase().includes("enterprise");

  const isPostpaidLike =
    settlementKind === "postpaid" ||
    Boolean(billingAccountId && isEnterprisePlan) ||
    isEnterprisePlan;

  const availableOutOfTotalLabel =
    !isPostpaidLike &&
    availableCredits != null &&
    totalCredits != null &&
    totalCredits > 0 &&
    availableCredits <= totalCredits
      ? `${formatWhole(availableCredits)} / ${formatWhole(totalCredits)} credits available`
      : null;

  const usageLabel = isPostpaidLike
    ? buildPostpaidUsageLabel(reservedCredits, usedCredits)
    : buildCreditUsageLabel(availableCredits, reservedCredits, usedCredits, totalCredits);

  const readableAvailableLabel =
    availableOutOfTotalLabel ||
    (!isPostpaidLike && availableCredits != null
      ? `${formatWhole(availableCredits)} credits available`
      : null);

  const walletAvailableCredits = splitCredits.walletAvailableCredits ?? effectiveCredits.walletCredits;
  const includedAvailableCredits =
    splitCredits.includedAvailableCredits ??
    (totalCredits != null && walletAvailableCredits != null && availableCredits != null
      ? Math.max(0, Math.min(totalCredits, availableCredits - Math.max(0, walletAvailableCredits)))
      : null);
  const promoAvailableCredits = splitCredits.promoAvailableCredits;
  const totalSpendableCredits = splitCredits.totalSpendableCredits ?? availableCredits;

  const includedLabel = creditPiece("Plan", includedAvailableCredits);
  const walletLabel = creditPiece("Top-up", walletAvailableCredits);
  const promoLabel = creditPiece("Promo", promoAvailableCredits);
  const creditBreakdownLabel = compactCreditPieces(includedLabel, walletLabel, promoLabel);
  const creditDetailLabel =
    !isPostpaidLike && totalSpendableCredits != null && creditBreakdownLabel
      ? `${formatWhole(totalSpendableCredits)} available = ${creditBreakdownLabel}${reservedCredits != null ? ` • ${formatWhole(reservedCredits)} reserved` : ""}`
      : null;

  const topLine = isPostpaidLike
    ? `${planName} • billed after completion`
    : creditDetailLabel || `${planName} • ${usageLabel || "credits available"}`;

  return {
    source,
    accountTruthSource,
    planName,
    availableCredits,
    reservedCredits,
    usedCredits,
    usagePercent,
    totalCredits,
    compactUsageLabel: usageLabel,
    usageLabel,
    topLine,
    heroLines: [],
    displayKind: isPostpaidLike ? "postpaid" : "credits",
    billingValue: isEnterprisePlan ? "Enterprise" : isPostpaidLike ? "Postpaid" : null,
    isEnterprisePlan,
    isPostpaidLike,
    settlementKind,
    tierCode,
    planCode,
    billingAccountId,
    readableAvailableLabel,
    availableOutOfTotalLabel,
    includedAvailableCredits,
    includedReservedCredits: splitCredits.includedReservedCredits,
    includedUsedCredits: splitCredits.includedUsedCredits,
    walletAvailableCredits,
    walletReservedCredits: splitCredits.walletReservedCredits,
    promoAvailableCredits,
    promoReservedCredits: splitCredits.promoReservedCredits,
    totalSpendableCredits,
    includedLabel,
    walletLabel,
    promoLabel,
    creditBreakdownLabel,
    creditDetailLabel,
  };
}

export function useResolvedPricingDisplay(options?: {
  dashboardData?: any;
  fallbackPlanName?: string | null;
  enabled?: boolean;
}) {
  const auth = useAuth() as any;
  const snapshot = useAccountPricingSnapshot() as any;
  const { token, isReady, isAuthed, logout } = auth;

  const authUserScope = String(
    auth?.userId ?? auth?.user?.id ?? auth?.profile?.id ?? auth?.email ?? ""
  )
    .trim()
    .toLowerCase();

  const countryCode = String(
    auth?.countryCode ?? auth?.country_code ?? auth?.user?.countryCode ?? auth?.user?.country_code ?? "US"
  ).trim().toUpperCase() || "US";

  const query = useQuery({
    queryKey: ["resolved-pricing-payments-overview", authUserScope, countryCode],
    enabled:
      (options?.enabled ?? true) &&
      !options?.dashboardData &&
      !!authUserScope &&
      Boolean(isReady) &&
      Boolean(isAuthed) &&
      Boolean(token),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 0,
    queryFn: async () => fetchPaymentsOverviewOrThrow({ countryCode }),
  });

  const effectiveDashboardData = options?.dashboardData ?? query.data ?? null;

  const resolved = React.useMemo(
    () =>
      resolvePricingDisplay({
        dashboardData: effectiveDashboardData,
        snapshot,
        fallbackPlanName: options?.fallbackPlanName ?? null,
      }),
    [effectiveDashboardData, snapshot, options?.fallbackPlanName]
  );

  return {
    ...resolved,
    dashboardData: effectiveDashboardData,
    snapshot,
    authUserScope,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}
