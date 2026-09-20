import { PRICING_BASE } from "../config/env";
import { endpoints } from "../api/endpoints";

export type SpendingPeriod = "month" | "quarter" | "year" | "yoy";

export type SpendingSummary = {
  period: string;
  credits: {
    consumed: number;
    refunded: number;
    purchased: number;
    available: number;
    reserved: number;
  };
  money: {
    paid: number;
    currency: string;
    credit_purchases: number;
    subscriptions: number;
    invoices: number;
    refunds: number;
    note?: string;
  };
  comparison: {
    credits_consumed_previous: number;
    credits_consumed_delta_percent: number | null;
    money_paid_previous: number;
    money_paid_delta_percent: number | null;
  };
  categories: Array<{
    category: string;
    credits: number;
    percent: number;
    transactions: number;
  }>;
  top_category?: {
    category: string;
    credits: number;
    percent: number;
    transactions: number;
  } | null;
  trend: Array<{
    bucket: string;
    credits_consumed: number;
    money_paid: number;
  }>;
};

export type SpendingTransaction = {
  id: string;
  occurred_at: string;
  type: string;
  category: string;
  label: string;
  credits: number | null;
  money: number | null;
  currency?: string | null;
  status: string;
  channel?: string | null;
  provider?: string | null;
};

function join(base: string, path: string): string {
  const cleanBase = String(base || "").replace(/\/+$/, "");
  const cleanPath = String(path || "").replace(/^\/+/,"");
  return `${cleanBase}/${cleanPath}`;
}

function normalizeBearer(token: string): string {
  const value = String(token || "").trim();
  if (!value) return "";
  return /^bearer\\s+/i.test(value) ? value : `Bearer ${value}`;
}

function jwtUserId(token: string): string {
  const raw = String(token || "")
    .trim()
    .replace(/^Bearer\\s+/i, "");
  const parts = raw.split(".");
  if (parts.length < 2) return "";

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    if (typeof atob !== "function") return "";
    const payload = JSON.parse(atob(padded)) as {
      sub?: string;
      user_id?: string;
      uid?: string;
    };
    return String(payload.sub ?? payload.user_id ?? payload.uid ?? "").trim();
  } catch {
    return "";
  }
}

async function read<T>(path: string, token: string): Promise<T> {
  const authorization = normalizeBearer(token);
  const userId = jwtUserId(token);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (authorization) headers.Authorization = authorization;
  if (userId) headers["X-User-Id"] = userId;

  const response = await fetch(join(PRICING_BASE, path), { headers });
  const text = await response.text();

  let payload: Record<string, unknown> = {};
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    payload = { detail: text };
  }

  if (!response.ok) {
    throw new Error(
      String(payload.detail ?? payload.message ?? `HTTP ${response.status}`)
    );
  }

  return payload as T;
}

export async function fetchSpendingSummary(
  token: string,
  period: SpendingPeriod = "month"
) {
  return read<SpendingSummary>(
    endpoints.pricing.spending.summary(period),
    token
  );
}

export async function fetchSpendingTransactions(
  token: string,
  period: SpendingPeriod = "year",
  kind = "all",
  limit = 50,
  offset = 0
) {
  return read<{
    items: SpendingTransaction[];
    total: number;
    limit: number;
    offset: number;
  }>(
    endpoints.pricing.spending.transactions(period, kind, limit, offset),
    token
  );
}
