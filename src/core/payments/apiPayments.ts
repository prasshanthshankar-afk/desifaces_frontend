import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ExpoLinking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { PRICING_BASE } from "../config/env";
import { tokenStore } from "../auth/tokenStore";

export type PaymentCurrency = "USD" | "INR" | string;

export type PaymentMethodSummary = {
  payment_method_id: string;
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  funding_type?: string | null;
  is_default?: boolean;
};

export type PaymentPendingChange = {
  target_plan_code?: string | null;
  effective_at?: string | null;
  change_mode?: string | null;
  status?: string | null;
  target_total_credits?: number | null;
};

export type PaymentSubscriptionCurrent = {
  user_id?: string;
  plan_code?: string | null;
  subscription_state?: string | null;
  entitlement_state?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  pending_change?: PaymentPendingChange | null;
};

export type PaymentPlanCatalogItem = {
  plan_code: string;
  plan_name: string;
  price_label: string;
  summary?: string | null;
  feature_bullets?: string[];
  limits?: Record<string, unknown>;
  recommended?: boolean;
  contact_sales?: boolean;
  billing_family?: string | null;
  interval_code?: string | null;
  is_public?: boolean;
  is_active?: boolean;
  is_current?: boolean;
  action?: string;
  cta_label?: string;
  cta_enabled?: boolean;
  disabled_reason?: string | null;
  display_order?: number | null;
};

export type PaymentPlanCatalogResponse = {
  currency?: PaymentCurrency | null;
  current_plan_code?: string | null;
  current_subscription_state?: string | null;
  pending_change?: PaymentPendingChange | null;
  items: PaymentPlanCatalogItem[];
};

export type PaymentCreditsSummary = {
  available_credits?: number | null;
  reserved_credits?: number | null;
  used_credits?: number | null;
  total_credits?: number | null;
  credit_cap?: number | null;
  included_credits_total?: number | null;
  included_credits_remaining?: number | null;
  included_credits_used?: number | null;
  included_available?: number | null;
  included_reserved?: number | null;
  included_used?: number | null;
  wallet_available?: number | null;
  wallet_reserved?: number | null;
  promo_available?: number | null;
  promo_reserved?: number | null;
  total_available?: number | null;
  total_reserved?: number | null;
  total_spendable?: number | null;
};

export type PaymentOverviewHeader = {
  plan_label?: string | null;
  usage_label?: string | null;
  billing_value_label?: string | null;
  available_label?: string | null;
  total_credits?: number | null;
};

export type PaymentAllowedActions = {
  can_manage_billing?: boolean;
  can_cancel?: boolean;
  can_reactivate?: boolean;
  can_upgrade?: boolean;
  can_downgrade?: boolean;
  can_top_up?: boolean;
};

export type PaymentOverviewMessages = {
  status_title?: string | null;
  status_body?: string | null;
  downgrade_notice?: string | null;
};

export type PaymentPlanSummary = {
  plan_name?: string | null;
  plan_code?: string | null;
  tier_code?: string | null;
  billing_account_id?: string | null;
  included_credits_total?: number | null;
  included_credits_remaining?: number | null;
  included_credits_used?: number | null;
};

export type PaymentPricingSummary = PaymentCreditsSummary & {
  tier_code?: string | null;
  plan_code?: string | null;
  billing_account_id?: string | null;
  settlement_mode?: string | null;
  billing_mode?: string | null;
};

export type PaymentUsageSummary = {
  available_credits?: number | null;
  reserved_credits?: number | null;
  used_credits?: number | null;
  total_credits?: number | null;
  credit_cap?: number | null;
  usage_percent?: number | null;
  tier_code?: string | null;
  plan_code?: string | null;
  settlement_mode?: string | null;
  billing_mode?: string | null;
};

export type PaymentRunwayEstimate = {
  studio?: string;
  mode?: string;
  label?: string;
  unit?: string;
  remaining_units?: number | null;
};

export type PaymentRunwaySummary = {
  plan_name?: string | null;
  total_credits?: number | null;
  available_credits?: number | null;
  reserved_credits?: number | null;
  used_credits?: number | null;
  usage_percent?: number | null;
  top_line?: string | null;
  hero_lines?: string[] | null;
  estimates?: PaymentRunwayEstimate[] | null;
  cta?: {
    primary?: string | null;
    secondary?: string | null;
  } | null;
};

export type PaymentOverviewResponse = {
  user_id?: string | null;
  country_code?: string | null;
  currency?: PaymentCurrency | null;
  billing_mode?: string | null;
  settlement_mode?: string | null;
  current_subscription?: PaymentSubscriptionCurrent | null;
  current_plan?: PaymentPlanCatalogItem | null;
  pending_change?: PaymentPendingChange | null;
  credits?: PaymentCreditsSummary | null;
  header?: PaymentOverviewHeader | null;
  allowed_actions?: PaymentAllowedActions | null;
  messages?: PaymentOverviewMessages | null;
  plan_summary?: PaymentPlanSummary | null;
  pricing_summary?: PaymentPricingSummary | null;
  usage_summary?: PaymentUsageSummary | null;
  runway_summary?: PaymentRunwaySummary | null;
};

export type PaymentTopupCatalogItem = {
  pack_code: string;
  title: string;
  subtitle?: string | null;
  credits_to_grant: number;
  amount_minor: number;
  price_label: string;
  recommended?: boolean;
  cta_label?: string | null;
  display_order?: number | null;
  is_active?: boolean;
};

export type PaymentTopupCatalogResponse = {
  user_id?: string | null;
  country_code?: string | null;
  currency?: PaymentCurrency | null;
  current_plan_code?: string | null;
  items: PaymentTopupCatalogItem[];
};

export type PaymentSubscriptionActionResponse = {
  ok: boolean;
  status: string;
  current_plan_code?: string | null;
  target_plan_code?: string | null;
  change_mode?: string | null;
  effective_at?: string | null;
  subscription_state?: string | null;
  cancel_at_period_end?: boolean;
  pending_change?: PaymentPendingChange | null;
  checkout_url?: string | null;
  portal_url?: string | null;
  message?: string | null;
};

export type PaymentPortalSessionResponse = {
  ok: boolean;
  portal_url?: string;
};

export type PaymentSubscriptionCheckoutSessionResponse = {
  ok: boolean;
  checkout_session_id?: string;
  checkout_url?: string;
  payment_state?: string;
  purpose?: string;
  plan_code?: string;
  current_plan_code?: string | null;
};

export type WalletTopupCheckoutRequest = {
  amountMinor: number;
  creditsToGrant: number | string;
  idempotencyKey: string;
  successUrl?: string;
  cancelUrl?: string;
  countryCode?: string;
};

export type WalletTopupCheckoutResponse = {
  ok: boolean;
  provider: string;
  checkout_session_id: string;
  checkout_url: string;
  wallet_order_id: string;
  payment_state: string;
};


export type AppleSubscriptionConfirmRequest = {
  appleProductId: string;
  signedTransactionInfo: string;
  signedRenewalInfo?: string | null;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  environment?: string | null;
  appAccountToken?: string | null;
  currency?: string | null;
  countryCode?: string | null;
  storefront?: string | null;
};

export type AppleCreditsConfirmRequest = {
  appleProductId: string;
  signedTransactionInfo: string;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  environment?: string | null;
  appAccountToken?: string | null;
  currency?: string | null;
  countryCode?: string | null;
  storefront?: string | null;
};

export type AppleCreditsConfirmResponse = {
  ok: boolean;
  provider: "apple_iap" | string;
  apple_product_id: string;
  internal_pack_code: string;
  granted_credits: number;
  wallet_order_id?: string | null;
  verification_mode?: string | null;
};

export type AppleSubscriptionConfirmResponse = {
  ok: boolean;
  provider: "apple_iap" | string;
  apple_product_id: string;
  plan_code: string;
  tier_code: string;
  subscription_state: string;
  entitlement_state: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  verification_mode?: string | null;
};

export type WalletOrderResponse = {
  wallet_order_id: string;
  payment_state: string;
  fulfillment_state: string;
  credits_to_grant: string;
  ledger_entry_id?: string | null;
  gateway_checkout_session_id?: string | null;
};

type CheckoutSessionCreateRequest = {
  planCode: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
  countryCode?: string;
  creditResetAcknowledged?: boolean;
  creditResetAcknowledgedAt?: string;
  creditResetAcknowledgementText?: string;
};

type ChangeSubscriptionRequest = {
  targetPlanCode: string;
  changeMode?: "immediate" | "period_end";
  countryCode?: string;
  idempotencyKey?: string;
  successUrl?: string;
  cancelUrl?: string;
  returnUrl?: string;
  creditResetAcknowledged?: boolean;
  creditResetAcknowledgedAt?: string;
  creditResetAcknowledgementText?: string;
};

type CountryScopedRequest = {
  countryCode?: string;
  returnUrl?: string;
};

type PortalSessionRequest = {
  countryCode?: string;
  returnUrl?: string;
};

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {
  // no-op
}

function normalizeBaseUrl(raw: string): string {
  return String(raw || "").trim().replace(/\/+$/, "");
}

function getApiBase(): string {
  return normalizeBaseUrl(PRICING_BASE);
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
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
    const json = atob(padded);
    return JSON.parse(json);
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
      // ignore malformed blobs
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

  return {
    token: normalizeBearer(token),
    userId,
  };
}

async function getHeaders(countryCode?: string): Promise<Record<string, string>> {
  const { token, userId } = await getAuthState();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) headers.Authorization = token;
  if (userId) headers["X-User-Id"] = userId;

  const normalizedCountry = clean(countryCode).toUpperCase();
  if (normalizedCountry) {
    headers["X-Country-Code"] = normalizedCountry;
  }

  return headers;
}

function extractErrorDetail(data: unknown, fallback: string, status: number): string {
  const obj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;

  const detail =
    (obj?.detail as any) ??
    obj?.message ??
    obj?.error ??
    fallback ??
    `${status}`;

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

async function fetchJson<T>(
  path: string,
  init: RequestInit = {},
  countryCode?: string
): Promise<T> {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error(
      "Missing pricing API base URL. Configure PRICING in src/core/config/env.ts / Expo extra."
    );
  }

  const headers = await getHeaders(countryCode);
  const url = `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;

  const resp = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });

  const text = await resp.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!resp.ok) {
    const detail = extractErrorDetail(data, text, resp.status);

    if (resp.status === 401 || resp.status === 403) {
      console.log("DF_PAYMENTS_AUTH_FAIL", {
        url,
        status: resp.status,
        hasAuthorization: !!headers.Authorization,
        hasUserId: !!headers["X-User-Id"],
        userId: headers["X-User-Id"] || null,
        countryCode: headers["X-Country-Code"] || null,
        detail,
      });
    }

    throw new Error(detail);
  }

  return data as T;
}

export function buildBillingReturnUrl(result: "success" | "cancel") {
  return ExpoLinking.createURL("/pricing/plan-billing", {
    queryParams: {
      billing_result: result,
    },
  });
}

export function buildTopupReturnUrl(result: "success" | "cancel") {
  return ExpoLinking.createURL("/pricing/top-up", {
    queryParams: {
      billing_result: result,
    },
  });
}

export async function openHostedBillingUrl(
  url: string,
  returnUrl?: string
): Promise<void> {
  const target = clean(url);
  const redirect = clean(returnUrl);
  if (!target) {
    throw new Error("Hosted billing URL was not returned.");
  }

  if (redirect) {
    try {
      const result = await WebBrowser.openAuthSessionAsync(target, redirect);
      if (result.type === "success" || result.type === "cancel" || result.type === "dismiss") {
        return;
      }
    } catch {
      // fall through to in-app browser fallback
    }
  }

  try {
    await WebBrowser.openBrowserAsync(target, {
      showTitle: false,
      enableBarCollapsing: true,
    });
    return;
  } catch {
    // last-resort external fallback
  }

  await ExpoLinking.openURL(target);
}

export async function apiGetPaymentsOverview(
  countryCode?: string
): Promise<PaymentOverviewResponse> {
  return fetchJson<PaymentOverviewResponse>(
    "/api/payments/overview",
    { method: "GET" },
    countryCode
  );
}

export async function apiGetPlansCatalog(
  countryCode?: string
): Promise<PaymentPlanCatalogResponse> {
  return fetchJson<PaymentPlanCatalogResponse>(
    "/api/payments/plans/catalog",
    { method: "GET" },
    countryCode
  );
}

export async function apiGetTopupsCatalog(
  countryCode?: string
): Promise<PaymentTopupCatalogResponse> {
  return fetchJson<PaymentTopupCatalogResponse>(
    "/api/payments/topups/catalog",
    { method: "GET" },
    countryCode
  );
}

export async function apiGetCurrentSubscription(
  countryCode?: string
): Promise<PaymentSubscriptionCurrent> {
  return fetchJson<PaymentSubscriptionCurrent>(
    "/api/payments/subscriptions/current",
    { method: "GET" },
    countryCode
  );
}

export async function apiGetPaymentMethods(
  countryCode?: string
): Promise<{ items: PaymentMethodSummary[] }> {
  const data = await fetchJson<PaymentMethodSummary[] | { items: PaymentMethodSummary[] }>(
    "/api/payments/payment-methods",
    { method: "GET" },
    countryCode
  );

  if (Array.isArray(data)) {
    return { items: data };
  }

  return { items: Array.isArray(data?.items) ? data.items : [] };
}

export async function apiCreateSubscriptionCheckoutSession(
  payload: CheckoutSessionCreateRequest
): Promise<PaymentSubscriptionCheckoutSessionResponse> {
  return fetchJson<PaymentSubscriptionCheckoutSessionResponse>(
    "/api/payments/subscriptions/create-checkout-session",
    {
      method: "POST",
      body: JSON.stringify({
        plan_code: payload.planCode,
        idempotency_key: payload.idempotencyKey,
        success_url: payload.successUrl,
        cancel_url: payload.cancelUrl,
        credit_reset_acknowledged: Boolean(payload.creditResetAcknowledged),
        credit_reset_acknowledged_at: payload.creditResetAcknowledgedAt,
        credit_reset_acknowledgement_text: payload.creditResetAcknowledgementText,
      }),
    },
    payload.countryCode ?? undefined
  );
}

export async function apiCreateWalletTopupCheckoutSession(
  payload: WalletTopupCheckoutRequest
): Promise<WalletTopupCheckoutResponse> {
  return fetchJson<WalletTopupCheckoutResponse>(
    "/api/payments/wallet/topups/create-checkout-session",
    {
      method: "POST",
      body: JSON.stringify({
        amount_minor: payload.amountMinor,
        credits_to_grant: String(payload.creditsToGrant),
        idempotency_key: payload.idempotencyKey,
        success_url: payload.successUrl || buildTopupReturnUrl("success"),
        cancel_url: payload.cancelUrl || buildTopupReturnUrl("cancel"),
      }),
    },
    payload.countryCode ?? undefined
  );
}

export async function apiGetWalletOrder(
  walletOrderId: string,
  countryCode?: string
): Promise<WalletOrderResponse> {
  return fetchJson<WalletOrderResponse>(
    `/api/payments/wallet/orders/${encodeURIComponent(walletOrderId)}`,
    { method: "GET" },
    countryCode
  );
}

export async function apiCreateCustomerPortalSession(
  payload: PortalSessionRequest = {}
): Promise<PaymentPortalSessionResponse> {
  const returnUrl = payload.returnUrl || buildBillingReturnUrl("success");

  return fetchJson<PaymentPortalSessionResponse>(
    "/api/payments/customer-portal/create-session",
    {
      method: "POST",
      body: JSON.stringify({
        return_url: returnUrl,
      }),
    },
    payload.countryCode ?? undefined
  );
}

export async function apiChangeSubscription(
  payload: ChangeSubscriptionRequest
): Promise<PaymentSubscriptionActionResponse> {
  return fetchJson<PaymentSubscriptionActionResponse>(
    "/api/payments/subscriptions/change",
    {
      method: "POST",
      body: JSON.stringify({
        target_plan_code: payload.targetPlanCode,
        change_mode: payload.changeMode || "immediate",
        idempotency_key: payload.idempotencyKey,
        success_url: payload.successUrl,
        cancel_url: payload.cancelUrl,
        return_url: payload.returnUrl,
        credit_reset_acknowledged: Boolean(payload.creditResetAcknowledged),
        credit_reset_acknowledged_at: payload.creditResetAcknowledgedAt,
        credit_reset_acknowledgement_text: payload.creditResetAcknowledgementText,
      }),
    },
    payload.countryCode ?? undefined
  );
}

export async function apiUndoPendingChange(
  payload: CountryScopedRequest = {}
): Promise<PaymentSubscriptionActionResponse> {
  return fetchJson<PaymentSubscriptionActionResponse>(
    "/api/payments/subscriptions/undo-pending-change",
    {
      method: "POST",
      body: JSON.stringify({
        return_url: payload.returnUrl || buildBillingReturnUrl("success"),
      }),
    },
    payload.countryCode ?? undefined
  );
}

export async function apiCancelSubscription(
  payload: CountryScopedRequest = {}
): Promise<PaymentSubscriptionActionResponse> {
  return fetchJson<PaymentSubscriptionActionResponse>(
    "/api/payments/subscriptions/cancel",
    {
      method: "POST",
      body: JSON.stringify({
        return_url: payload.returnUrl || buildBillingReturnUrl("success"),
      }),
    },
    payload.countryCode ?? undefined
  );
}

export async function apiReactivateSubscription(
  payload: CountryScopedRequest = {}
): Promise<PaymentSubscriptionActionResponse> {
  return fetchJson<PaymentSubscriptionActionResponse>(
    "/api/payments/subscriptions/reactivate",
    {
      method: "POST",
      body: JSON.stringify({
        return_url: payload.returnUrl || buildBillingReturnUrl("success"),
      }),
    },
    payload.countryCode ?? undefined
  );
}

export async function apiConfirmAppleCreditsPurchase(
  payload: AppleCreditsConfirmRequest
): Promise<AppleCreditsConfirmResponse> {
  return fetchJson<AppleCreditsConfirmResponse>(
    "/api/payments/apple/credits/confirm",
    {
      method: "POST",
      body: JSON.stringify({
        apple_product_id: payload.appleProductId,
        signed_transaction_info: payload.signedTransactionInfo,
        transaction_id: payload.transactionId || undefined,
        original_transaction_id: payload.originalTransactionId || undefined,
        environment: payload.environment || undefined,
        app_account_token: payload.appAccountToken || undefined,
        currency: payload.currency || undefined,
        country_code: payload.countryCode || undefined,
        storefront: payload.storefront || undefined,
      }),
    },
    payload.countryCode ?? undefined
  );
}

export async function apiConfirmAppleSubscriptionPurchase(
  payload: AppleSubscriptionConfirmRequest
): Promise<AppleSubscriptionConfirmResponse> {
  return fetchJson<AppleSubscriptionConfirmResponse>(
    "/api/payments/apple/subscriptions/confirm",
    {
      method: "POST",
      body: JSON.stringify({
        apple_product_id: payload.appleProductId,
        signed_transaction_info: payload.signedTransactionInfo,
        signed_renewal_info: payload.signedRenewalInfo || undefined,
        transaction_id: payload.transactionId || undefined,
        original_transaction_id: payload.originalTransactionId || undefined,
        environment: payload.environment || undefined,
        app_account_token: payload.appAccountToken || undefined,
        currency: payload.currency || undefined,
        country_code: payload.countryCode || undefined,
        storefront: payload.storefront || undefined,
      }),
    },
    payload.countryCode ?? undefined
  );
}
