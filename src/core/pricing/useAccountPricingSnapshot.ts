import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchDashboardHome } from "../api/dashboard";
import { useAuth } from "../auth/AuthContext";
import * as PaymentsApi from "../payments/apiPayments";

export type RealtimeGauge = {
  label: string;
  valueNorm: number | null;
  rawValue: number | null;
  status?: string | null;
  helper?: string | null;
};

export type AccountPricingSnapshot = {
  planName: string | null;
  availableCredits: number | null;
  reservedCredits: number | null;
  usedCredits: number | null;
  creditCap: number | null;
  usagePercent: number | null;
  availableLabel: string | null;
  reservedLabel: string | null;
  usedLabel: string | null;
  creditCapLabel: string | null;
  usedOfCapLabel: string | null;
  remainingOfCapLabel: string | null;
  headerLine1: string | null;
  headerLine2: string | null;
  throughput: RealtimeGauge | null;
  queuePressure: RealtimeGauge | null;
  successRate: RealtimeGauge | null;
  isLoading: boolean;
};

type AuthIdentity = {
  userId: string | null;
  email: string | null;
  displayName: string | null;
  countryCode: string | null;
};

function numberOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function cleanText(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim();
  return s ? s : null;
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);

  if (typeof atob === "function") {
    return atob(padded);
  }

  return (globalThis as any).Buffer
    ? (globalThis as any).Buffer.from(padded, "base64").toString("utf8")
    : "";
}

function decodeJwtPayload(token?: string | null): Record<string, any> | null {
  const raw = cleanText(token);
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length < 2) return null;

  try {
    const json = base64UrlDecode(parts[1]);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function titleCaseFromEmail(email?: string | null): string | null {
  const raw = cleanText(email);
  if (!raw || !raw.includes("@")) return null;

  const local = raw.split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!local) return null;

  return local
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveAuthIdentity(auth: any): AuthIdentity {
  const claims = decodeJwtPayload(auth?.token);

  const email =
    cleanText(auth?.email) ||
    cleanText(auth?.user?.email) ||
    cleanText(auth?.profile?.email) ||
    cleanText(claims?.email) ||
    null;

  const displayName =
    cleanText(auth?.displayName) ||
    cleanText(auth?.fullName) ||
    cleanText(auth?.user?.fullName) ||
    cleanText(auth?.user?.full_name) ||
    cleanText(auth?.profile?.fullName) ||
    cleanText(auth?.profile?.full_name) ||
    titleCaseFromEmail(email) ||
    null;

  const userId =
    cleanText(auth?.userId) ||
    cleanText(auth?.user?.id) ||
    cleanText(auth?.profile?.id) ||
    cleanText(claims?.sub) ||
    null;

  const countryCode =
    cleanText(auth?.countryCode) ||
    cleanText(auth?.country_code) ||
    cleanText(auth?.user?.countryCode) ||
    cleanText(auth?.user?.country_code) ||
    cleanText(claims?.country_code) ||
    "US";

  return { userId, email, displayName, countryCode };
}

export function isMeaningfulPricingLabel(value?: string | null): boolean {
  const s = String(value ?? "").trim();
  if (!s) return false;
  const lowered = s.toLowerCase();
  return ![
    "online",
    "current plan",
    "creator pro",
    "estimate preview",
    "balance preview unavailable",
    "usage unavailable",
    "credit status unavailable",
    "plan details unavailable",
    "unavailable",
    "—",
    "loading",
  ].includes(lowered);
}

export function formatCredits(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(Number(value) * 100) / 100;
  return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(2);
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

function humanPlanNameFromCode(rawPlanCode: unknown): string {
  switch (normalizePlanCode(rawPlanCode)) {
    case "enterprise_monthly_v1":
      return "Enterprise";
    case "business_yearly_v1":
    case "business_monthly_v1":
      return "Business";
    case "pro_yearly_v1":
    case "pro_monthly_v1":
      return "Pro";
    default:
      return "Free";
  }
}

function derivePlanNameFromSubscription(subscription: any): string | null {
  const sub = subscription as any;
  const explicit =
    cleanText(sub?.plan_name) ||
    cleanText(sub?.planName) ||
    cleanText(sub?.current_plan_name) ||
    cleanText(sub?.currentPlanName);

  if (explicit) return explicit;

  const code =
    cleanText(sub?.plan_code) ||
    cleanText(sub?.planCode) ||
    cleanText(sub?.current_plan_code) ||
    cleanText(sub?.currentPlanCode);

  if (code) return humanPlanNameFromCode(code);

  if (sub == null) return "Free";
  return null;
}

function normalizeGauge(gauge: any, fallbackLabel: string, helper?: string | null): RealtimeGauge | null {
  if (!gauge || typeof gauge !== "object") return null;
  return {
    label: String(gauge.label || fallbackLabel),
    valueNorm: numberOrNull(gauge.value_norm),
    rawValue:
      numberOrNull(gauge.raw_value) ??
      numberOrNull(gauge.raw) ??
      numberOrNull(gauge.count) ??
      numberOrNull(gauge.success_rate_24h) ??
      numberOrNull(gauge.queue_depth) ??
      numberOrNull(gauge.completed_60m),
    status: typeof gauge.status === "string" ? gauge.status : null,
    helper: typeof gauge.helper === "string" ? gauge.helper : helper ?? null,
  };
}

function normalizeSnapshot(data: any, subscription: any): Omit<AccountPricingSnapshot, "isLoading"> {
  const usageSummary = data?.usage_summary ?? data?.usage ?? {};
  const fuel = data?.gauges?.fuel ?? {};
  const pricingSummary = data?.pricing_summary ?? {};
  const header = data?.header ?? {};

  const planName =
    derivePlanNameFromSubscription(subscription) ||
    cleanText(header?.plan_name) ||
    cleanText(header?.planName) ||
    "Free";

  const availableCredits =
    numberOrNull(pricingSummary?.available_credits) ??
    numberOrNull(fuel?.credits_remaining) ??
    numberOrNull(data?.available_credits) ??
    null;

  const reservedCredits =
    numberOrNull(pricingSummary?.reserved_credits) ??
    numberOrNull(fuel?.reserved_credits) ??
    numberOrNull(data?.reserved_credits) ??
    0;

  const rawUsedCredits =
    numberOrNull(usageSummary?.used_credits) ??
    numberOrNull(usageSummary?.consumed_credits) ??
    numberOrNull(usageSummary?.total_used_credits) ??
    numberOrNull(data?.used_credits) ??
    null;

  const rawCreditCap =
    numberOrNull(fuel?.cap) ??
    numberOrNull(usageSummary?.credit_cap) ??
    numberOrNull(usageSummary?.credits_cap) ??
    numberOrNull(pricingSummary?.credit_cap) ??
    null;

  const creditCap =
    rawCreditCap != null && rawCreditCap > 0
      ? rawCreditCap
      : normalizePlanCode(planName) === "free"
        ? 100
        : null;

  const derivedUsedFromBalance =
    creditCap != null && availableCredits != null
      ? clamp(
          creditCap - Math.max(availableCredits, 0) - Math.max(reservedCredits ?? 0, 0),
          0,
          creditCap,
        )
      : null;

  const hasInconsistentUsedBalance =
    creditCap != null &&
    availableCredits != null &&
    rawUsedCredits != null &&
    (rawUsedCredits < 0 ||
      rawUsedCredits > creditCap ||
      Math.abs(
        (Math.max(rawUsedCredits, 0) + Math.max(availableCredits, 0) + Math.max(reservedCredits ?? 0, 0)) -
          creditCap,
      ) > 0.01);

  const usedCredits =
    hasInconsistentUsedBalance
      ? derivedUsedFromBalance
      : rawUsedCredits != null
        ? rawUsedCredits
        : derivedUsedFromBalance;

  const usagePercent =
    creditCap != null && usedCredits != null && creditCap > 0
      ? clamp((usedCredits / Math.max(creditCap, 1)) * 100, 0, 100)
      : numberOrNull(usageSummary?.usage_percent) ??
        numberOrNull(usageSummary?.total_usage_percent) ??
        null;

  const availableLabel = formatCredits(availableCredits);
  const reservedLabel = formatCredits(reservedCredits);
  const usedLabel = formatCredits(usedCredits);
  const creditCapLabel = formatCredits(creditCap);

  const usedOfCapLabel =
    usedLabel != null && creditCapLabel != null ? `${usedLabel} / ${creditCapLabel}` : null;

  const remainingOfCapLabel =
    availableLabel != null && creditCapLabel != null ? `${availableLabel} left of ${creditCapLabel}` : null;

  const usageHeadline =
    availableLabel != null && reservedLabel != null && usedLabel != null
      ? `${availableLabel} available • ${reservedLabel} reserved • ${usedLabel} used`
      : availableLabel != null && usedLabel != null
        ? `${availableLabel} available • ${usedLabel} used`
        : availableLabel != null
          ? `${availableLabel} available`
          : (typeof header?.usage_label === "string" && header.usage_label.trim()) || null;

  return {
    planName,
    availableCredits,
    reservedCredits,
    usedCredits,
    creditCap,
    usagePercent,
    availableLabel,
    reservedLabel,
    usedLabel,
    creditCapLabel,
    usedOfCapLabel,
    remainingOfCapLabel,
    headerLine1: planName,
    headerLine2: usageHeadline,
    throughput: normalizeGauge(
      data?.gauges?.throughput,
      "Throughput",
      "Completed jobs in the last 60 minutes.",
    ),
    queuePressure: normalizeGauge(
      data?.gauges?.queue_pressure,
      "Queue pressure",
      "Current queued and in-flight workload.",
    ),
    successRate: normalizeGauge(
      data?.gauges?.success_rate,
      "Success rate",
      "Successful completions over the last 24 hours.",
    ),
  };
}

export function useAccountPricingSnapshot(): AccountPricingSnapshot {
  const auth = useAuth() as any;
  const enabled = !!auth?.isReady && !!auth?.isAuthed && !!auth?.token;
  const identity = useMemo(
    () => resolveAuthIdentity(auth),
    [
      auth?.token,
      auth?.email,
      auth?.fullName,
      auth?.displayName,
      auth?.countryCode,
      auth?.country_code,
      auth?.user?.id,
      auth?.user?.email,
      auth?.user?.fullName,
      auth?.user?.full_name,
      auth?.user?.countryCode,
      auth?.user?.country_code,
      auth?.profile?.id,
      auth?.profile?.email,
      auth?.profile?.fullName,
      auth?.profile?.full_name,
    ],
  );

  const dashboardQ = useQuery({
    queryKey: ["account-pricing-snapshot-dashboard", enabled ? identity.userId || identity.email || "authed" : "guest"],
    queryFn: async () => {
      try {
        return await fetchDashboardHome(false);
      } catch {
        return null;
      }
    },
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: 0,
  });

  const subscriptionQ = useQuery({
    queryKey: ["account-pricing-snapshot-subscription", enabled ? identity.userId || identity.email || "authed" : "guest", identity.countryCode || "US"],
    queryFn: async () => {
      try {
        return await PaymentsApi.apiGetCurrentSubscription(identity.countryCode || "US");
      } catch {
        return null;
      }
    },
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    retry: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    console.log("DF_AUTH_SESSION", {
      user_id: identity.userId,
      email: identity.email,
      display_name: identity.displayName,
      country_code: identity.countryCode,
      token_present: !!auth?.token,
    });
  }, [enabled, identity.userId, identity.email, identity.displayName, identity.countryCode, auth?.token]);

  useEffect(() => {
    if (!enabled) return;
    const snapshot = normalizeSnapshot(dashboardQ.data, subscriptionQ.data);
    console.log("DF_PRICING_SNAPSHOT", {
      user_id: identity.userId,
      email: identity.email,
      plan_name: snapshot.planName,
      available_credits: snapshot.availableCredits,
      reserved_credits: snapshot.reservedCredits,
      used_credits: snapshot.usedCredits,
      credit_cap: snapshot.creditCap,
      usage_percent: snapshot.usagePercent,
      header_line_2: snapshot.headerLine2,
    });
  }, [enabled, dashboardQ.data, subscriptionQ.data, identity.userId, identity.email]);

  return useMemo(() => {
    const base = normalizeSnapshot(dashboardQ.data, subscriptionQ.data);
    return {
      ...base,
      isLoading: Boolean((dashboardQ.isFetching || subscriptionQ.isFetching) && !dashboardQ.data && !subscriptionQ.data),
    };
  }, [dashboardQ.data, dashboardQ.isFetching, subscriptionQ.data, subscriptionQ.isFetching]);
}
