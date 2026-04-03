import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchDashboardHome } from "../api/dashboard";
import { useAuth } from "../auth/AuthContext";

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

  return globalThis.Buffer ? globalThis.Buffer.from(padded, "base64").toString("utf8") : "";
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

  return { userId, email, displayName };
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

function derivePlanName(data: any): string | null {
  const planSummary = data?.plan_summary ?? data?.pricing_summary ?? {};
  const usageSummary = data?.usage_summary ?? data?.usage ?? {};
  const header = data?.header ?? {};
  const candidates = [
    planSummary?.planName,
    planSummary?.plan_name,
    planSummary?.name,
    planSummary?.tier_name,
    planSummary?.tier_code,
    usageSummary?.plan_name,
    usageSummary?.tier_name,
    header?.plan_name,
    header?.planName,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
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
    helper:
      typeof gauge.helper === "string"
        ? gauge.helper
        : helper ?? null,
  };
}

function normalizeSnapshot(data: any): Omit<AccountPricingSnapshot, "isLoading"> {
  const planSummary = data?.plan_summary ?? data?.pricing_summary ?? {};
  const usageSummary = data?.usage_summary ?? data?.usage ?? {};
  const fuel = data?.gauges?.fuel ?? {};
  const pricingSummary = data?.pricing_summary ?? {};
  const header = data?.header ?? {};

  const planName = derivePlanName(data);

  const rawAvailableCredits =
    numberOrNull(pricingSummary?.available_credits) ??
    numberOrNull(fuel?.credits_remaining) ??
    numberOrNull(data?.available_credits) ??
    null;

  const reservedCredits =
    numberOrNull(pricingSummary?.reserved_credits) ??
    numberOrNull(fuel?.reserved_credits) ??
    numberOrNull(data?.reserved_credits) ??
    null;

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
    numberOrNull(planSummary?.credit_cap) ??
    numberOrNull(planSummary?.credits_cap) ??
    numberOrNull(planSummary?.included_credits) ??
    numberOrNull(planSummary?.monthly_included_credits) ??
    numberOrNull(pricingSummary?.credit_cap) ??
    null;

  const creditCap = rawCreditCap != null && rawCreditCap > 0 ? rawCreditCap : null;

  const availableCredits = rawAvailableCredits;

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
      Math.abs((Math.max(rawUsedCredits, 0) + Math.max(availableCredits, 0) + Math.max(reservedCredits ?? 0, 0)) - creditCap) > 0.01);

  const usedCredits =
    hasInconsistentUsedBalance
      ? derivedUsedFromBalance
      : rawUsedCredits != null
        ? rawUsedCredits
        : derivedUsedFromBalance;

  const usagePercent =
    numberOrNull(usageSummary?.usage_percent) ??
    numberOrNull(usageSummary?.total_usage_percent) ??
    (creditCap != null && usedCredits != null && creditCap > 0
      ? clamp((usedCredits / Math.max(creditCap, 1)) * 100, 0, 100)
      : null);

  const availableLabel = formatCredits(availableCredits);
  const reservedLabel = formatCredits(reservedCredits);
  const usedLabel = formatCredits(usedCredits);
  const creditCapLabel = formatCredits(creditCap);

  const usedOfCapLabel =
    usedLabel != null && creditCapLabel != null ? `${usedLabel} / ${creditCapLabel}` : null;

  const remainingOfCapLabel =
    availableLabel != null && creditCapLabel != null ? `${availableLabel} left of ${creditCapLabel}` : null;

  const usageHeadline =
    availableLabel != null && usedLabel != null
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
      auth?.user?.id,
      auth?.user?.email,
      auth?.user?.fullName,
      auth?.user?.full_name,
      auth?.profile?.id,
      auth?.profile?.email,
      auth?.profile?.fullName,
      auth?.profile?.full_name,
    ],
  );

  const q = useQuery({
    queryKey: ["account-pricing-snapshot", enabled ? identity.userId || identity.email || "authed" : "guest"],
    queryFn: async () => {
      try {
        return await fetchDashboardHome(false);
      } catch {
        return null;
      }
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 0,
  });

  useEffect(() => {
    if (!enabled) return;
    console.log("DF_AUTH_SESSION", {
      user_id: identity.userId,
      email: identity.email,
      display_name: identity.displayName,
      token_present: !!auth?.token,
    });
  }, [enabled, identity.userId, identity.email, identity.displayName, auth?.token]);

  useEffect(() => {
    if (!enabled || !q.data) return;
    const snapshot = normalizeSnapshot(q.data);
    console.log("DF_PRICING_SNAPSHOT", {
      user_id: identity.userId,
      email: identity.email,
      plan_name: snapshot.planName,
      available_credits: snapshot.availableCredits,
      reserved_credits: snapshot.reservedCredits,
      used_credits: snapshot.usedCredits,
      credit_cap: snapshot.creditCap,
      header_line_2: snapshot.headerLine2,
    });
  }, [enabled, q.data, identity.userId, identity.email]);

  return useMemo(() => {
    const base = normalizeSnapshot(q.data);
    return {
      ...base,
      isLoading: Boolean(q.isFetching && !q.data),
    };
  }, [q.data, q.isFetching]);
}
