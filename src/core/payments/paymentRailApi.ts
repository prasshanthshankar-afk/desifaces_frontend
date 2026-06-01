import AsyncStorage from "@react-native-async-storage/async-storage";
import { PRICING_BASE } from "../config/env";
import { tokenStore } from "../auth/tokenStore";

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeBaseUrl(raw: string): string {
  return clean(raw).replace(/\/+$/, "");
}

function normalizeBearer(token: string): string {
  const t = clean(token);
  if (!t) return "";
  return /^bearer\s+/i.test(t) ? t : `Bearer ${t}`;
}

function decodeJwtPayload(token: string): Record<string, any> | null {
  const raw = clean(token).replace(/^Bearer\s+/i, "");
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    if (typeof atob !== "function") return null;
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function getStoredUserId(): Promise<string> {
  const directKeys = ["auth.userId", "userId", "auth.user.id", "user.id"];
  for (const key of directKeys) {
    const value = await AsyncStorage.getItem(key);
    if (clean(value)) return clean(value);
  }

  const jsonKeys = ["auth.user", "user", "auth.session", "session", "auth"];
  for (const key of jsonKeys) {
    const raw = await AsyncStorage.getItem(key);
    if (!clean(raw)) continue;
    try {
      const parsed = JSON.parse(String(raw));
      const userId = clean(
        parsed?.id ??
          parsed?.user_id ??
          parsed?.userId ??
          parsed?.sub ??
          parsed?.user?.id ??
          parsed?.user?.user_id ??
          parsed?.data?.user?.id ??
          parsed?.session?.user?.id
      );
      if (userId) return userId;
    } catch {
      // Ignore malformed persisted blobs.
    }
  }
  return "";
}

async function getAuthState(): Promise<{ token: string; userId: string }> {
  let token = "";
  try {
    token = clean(await tokenStore.getAccess());
  } catch {
    token = "";
  }

  if (!token) {
    const tokenKeys = ["auth.accessToken", "accessToken", "token", "bearerToken"];
    for (const key of tokenKeys) {
      const value = await AsyncStorage.getItem(key);
      if (clean(value)) {
        token = clean(value);
        break;
      }
    }
  }

  let userId = await getStoredUserId();
  if (!userId && token) {
    const payload = decodeJwtPayload(token);
    userId = clean(payload?.sub ?? payload?.user_id ?? payload?.uid);
  }

  return { token: normalizeBearer(token), userId };
}

function extractErrorDetail(data: unknown, fallback: string, status: number): string {
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const detail = (obj?.detail as any) ?? obj?.message ?? obj?.error ?? fallback ?? `${status}`;

  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as any;
    return String(first?.msg ?? first?.message ?? JSON.stringify(first));
  }
  if (detail && typeof detail === "object") {
    return String((detail as any).message ?? (detail as any).error ?? JSON.stringify(detail));
  }
  return String(status);
}

async function getHeaders(countryCode?: string): Promise<Record<string, string>> {
  const { token, userId } = await getAuthState();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = token;
  if (userId) headers["X-User-Id"] = userId;
  if (countryCode) headers["X-Country-Code"] = clean(countryCode).toUpperCase();
  return headers;
}

export async function pricingFetchJson<T>(
  path: string,
  init: RequestInit = {},
  countryCode?: string
): Promise<T> {
  const apiBase = normalizeBaseUrl(PRICING_BASE);
  if (!apiBase) {
    throw new Error("Missing pricing API base URL. Configure PRICING in src/core/config/env.ts / Expo extra.");
  }

  const headers = await getHeaders(countryCode);
  const url = `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  const resp = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });

  const text = await resp.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!resp.ok) {
    throw new Error(extractErrorDetail(data, text, resp.status));
  }
  return data as T;
}

export type GoogleCreditsConfirmPayload = {
  googleProductId: string;
  purchaseToken: string;
  packageName?: string;
  orderId?: string | null;
  countryCode?: string;
  currency?: string | null;
  rawPurchaseJson?: Record<string, any> | null;
};

export type GoogleSubscriptionConfirmPayload = {
  googleProductId: string;
  basePlanId?: string | null;
  purchaseToken: string;
  packageName?: string;
  orderId?: string | null;
  countryCode?: string;
  currency?: string | null;
  rawPurchaseJson?: Record<string, any> | null;
};

export type GooglePurchaseConfirmResponse = {
  ok?: boolean;
  status?: string;
  plan_code?: string | null;
  pack_code?: string | null;
  credits_granted?: number | null;
  granted_credits?: number | null;
  current_period_end?: string | null;
  fulfillment_state?: string | null;
  wallet_order_id?: string | null;
  ledger_entry_id?: string | null;
  [key: string]: any;
};

export async function apiConfirmGoogleCreditsPurchase(
  payload: GoogleCreditsConfirmPayload
): Promise<GooglePurchaseConfirmResponse> {
  return pricingFetchJson<GooglePurchaseConfirmResponse>(
    "/api/payments/google/credits/confirm",
    {
      method: "POST",
      body: JSON.stringify({
        google_product_id: payload.googleProductId,
        product_id: payload.googleProductId,
        purchase_token: payload.purchaseToken,
        package_name: payload.packageName || "ai.desifaces.app",
        order_id: payload.orderId || undefined,
        country_code: payload.countryCode || undefined,
        currency: payload.currency || undefined,
        raw_purchase_json: payload.rawPurchaseJson || undefined,
      }),
    },
    payload.countryCode
  );
}

export async function apiConfirmGoogleSubscriptionPurchase(
  payload: GoogleSubscriptionConfirmPayload
): Promise<GooglePurchaseConfirmResponse> {
  return pricingFetchJson<GooglePurchaseConfirmResponse>(
    "/api/payments/google/subscriptions/confirm",
    {
      method: "POST",
      body: JSON.stringify({
        google_product_id: payload.googleProductId,
        product_id: payload.googleProductId,
        base_plan_id: payload.basePlanId || undefined,
        purchase_token: payload.purchaseToken,
        package_name: payload.packageName || "ai.desifaces.app",
        order_id: payload.orderId || undefined,
        country_code: payload.countryCode || undefined,
        currency: payload.currency || undefined,
        raw_purchase_json: payload.rawPurchaseJson || undefined,
      }),
    },
    payload.countryCode
  );
}
