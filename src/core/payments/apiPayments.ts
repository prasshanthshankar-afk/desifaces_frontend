import { api } from "../api/client";

const PRICING_BASE =
  (globalThis as any)?.process?.env?.EXPO_PUBLIC_PRICING_BASE_URL ||
  (globalThis as any)?.process?.env?.EXPO_PUBLIC_API_PRICING_BASE ||
  "";

function requirePricingBase() {
  if (!PRICING_BASE) {
    throw new Error(
      "Missing EXPO_PUBLIC_PRICING_BASE_URL. Set it to your pricing service base URL."
    );
  }
  return PRICING_BASE as string;
}

export type PaymentSubscriptionCurrent = {
  user_id: string;
  plan_code?: string | null;
  subscription_state?: string | null;
  entitlement_state?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
};

export type SubscriptionCheckoutCreateOut = {
  ok: boolean;
  provider: string;
  checkout_session_id: string;
  checkout_url: string;
  payment_state: string;
  purpose: string;
  plan_code: string;
  current_plan_code?: string | null;
};

export type BillingPortalOut = {
  ok: boolean;
  portal_url: string;
};

export function buildBillingReturnUrl(result: "success" | "cancel") {
  const base = String(
    (globalThis as any)?.process?.env?.EXPO_PUBLIC_BILLING_RETURN_URL_BASE || ""
  ).trim();

  if (!base) {
    throw new Error(
      "Missing EXPO_PUBLIC_BILLING_RETURN_URL_BASE. It must be an absolute HTTPS URL that Stripe can redirect to."
    );
  }

  const glue = base.includes("?") ? "&" : "?";
  return `${base}${glue}billing_result=${result}`;
}

export async function apiGetCurrentSubscription(countryCode?: string) {
  return api.get<PaymentSubscriptionCurrent>(
    requirePricingBase(),
    "/api/payments/subscriptions/current",
    {
      headers: countryCode ? { "X-Country-Code": countryCode } : undefined,
    }
  );
}

export async function apiCreateSubscriptionCheckoutSession(args: {
  planCode: string;
  idempotencyKey: string;
  successUrl?: string;
  cancelUrl?: string;
  countryCode?: string;
}) {
  return api.post<SubscriptionCheckoutCreateOut>(
    requirePricingBase(),
    "/api/payments/subscriptions/create-checkout-session",
    {
      plan_code: args.planCode,
      success_url: args.successUrl || buildBillingReturnUrl("success"),
      cancel_url: args.cancelUrl || buildBillingReturnUrl("cancel"),
      idempotency_key: args.idempotencyKey,
    },
    {
      headers: args.countryCode ? { "X-Country-Code": args.countryCode } : undefined,
    }
  );
}

export async function apiCreateCustomerPortalSession(args: {
  returnUrl?: string;
  countryCode?: string;
}) {
  return api.post<BillingPortalOut>(
    requirePricingBase(),
    "/api/payments/customer-portal/create-session",
    {
      return_url: args.returnUrl || buildBillingReturnUrl("success"),
    },
    {
      headers: args.countryCode ? { "X-Country-Code": args.countryCode } : undefined,
    }
  );
}