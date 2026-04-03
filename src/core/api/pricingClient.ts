// src/core/api/pricingClient.ts
import { PRICING_BASE } from "../config/env";

export type PricingChannel = "web" | "mobile" | "api";

export type PricingQuoteLine = {
  sku_code: string;
  name: string;
  category: string;
  provider_hint?: string | null;
  unit: string;
  qty: string;
  unit_credits: number;
  line_credits: number;
  unit_money?: string | null;
  line_money: string;
};

export type PricingQuoteResponse = {
  allowed: boolean;
  billing_mode: string;
  reason: string;

  variant_code: string;
  module_code: string;
  currency: string;
  pricebook_id: string;
  pricebook_name: string;

  total_credits: number;
  total_money: string;

  shadow_total_credits?: number | null;
  shadow_total_money?: string | null;

  economics: Record<string, unknown>;

  alt_currency?: string | null;
  alt_total_money?: string | null;

  lines: PricingQuoteLine[];
};

export type CreditsBalanceResponse = {
  balance_credits: number;
  reserved_credits: number;
  available_credits: number;
};

export type PricingQuoteRequest = {
  variant_code: string;
  params?: Record<string, unknown>;
  channel?: PricingChannel;
  currency?: string;
  country_code?: string;
};

export class PricingApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "PricingApiError";
    this.status = status;
    this.payload = payload;
  }
}

function normalizeCountryCode(countryCode?: string | null): string | undefined {
  const value = (countryCode || "").trim().toUpperCase();
  return value || undefined;
}

function buildPricingHeaders(
  token: string,
  userId: string,
  countryCode?: string | null
): Record<string, string> {
  const cc = normalizeCountryCode(countryCode);

  return {
    Authorization: `Bearer ${token}`,
    "X-User-Id": userId,
    ...(cc ? { "X-Country-Code": cc } : {}),
  };
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload) return fallback;

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const detail = obj.detail;

    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    if (detail && typeof detail === "object") {
      const detailObj = detail as Record<string, unknown>;
      if (typeof detailObj.message === "string" && detailObj.message.trim()) {
        return detailObj.message;
      }
      if (typeof detailObj.error === "string" && detailObj.error.trim()) {
        return detailObj.error;
      }
    }

    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message;
    }
  }

  return fallback;
}

async function pricingRequest<T>(
  path: string,
  {
    token,
    userId,
    countryCode,
    method = "GET",
    body,
  }: {
    token: string;
    userId: string;
    countryCode?: string | null;
    method?: "GET" | "POST";
    body?: Record<string, unknown>;
  }
): Promise<T> {
  const response = await fetch(`${PRICING_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...buildPricingHeaders(token, userId, countryCode),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    throw new PricingApiError(
      extractErrorMessage(payload, `Pricing request failed with status ${response.status}`),
      response.status,
      payload
    );
  }

  return payload as T;
}

export async function getCreditsBalance(params: {
  token: string;
  userId: string;
  countryCode?: string | null;
}): Promise<CreditsBalanceResponse> {
  return pricingRequest<CreditsBalanceResponse>("/api/credits/balance", {
    token: params.token,
    userId: params.userId,
    countryCode: params.countryCode,
    method: "GET",
  });
}

export async function getPricingQuote(params: {
  token: string;
  userId: string;
  countryCode?: string | null;
  body: PricingQuoteRequest;
}): Promise<PricingQuoteResponse> {
  return pricingRequest<PricingQuoteResponse>("/api/pricing/quote", {
    token: params.token,
    userId: params.userId,
    countryCode: params.countryCode,
    method: "POST",
    body: {
      variant_code: params.body.variant_code,
      params: params.body.params ?? {},
      channel: params.body.channel ?? "mobile",
      currency: params.body.currency,
      country_code:
        normalizeCountryCode(params.body.country_code) ??
        normalizeCountryCode(params.countryCode),
    },
  });
}

/**
 * Convenience helper for Face Studio quote preview.
 * Keeps the Face Studio screen code simple and consistent.
 */
export async function quoteFaceStudioGenerate(params: {
  token: string;
  userId: string;
  countryCode?: string | null;
  mode: "text-to-image" | "image-to-image";
  numVariants: number;
  currency?: string;
}): Promise<{
  balance: CreditsBalanceResponse;
  quote: PricingQuoteResponse;
}> {
  const variantCode =
    params.mode === "image-to-image"
      ? "face.creator.generate.i2i"
      : "face.creator.generate.t2i";

  const [balance, quote] = await Promise.all([
    getCreditsBalance({
      token: params.token,
      userId: params.userId,
      countryCode: params.countryCode,
    }),
    getPricingQuote({
      token: params.token,
      userId: params.userId,
      countryCode: params.countryCode,
      body: {
        variant_code: variantCode,
        channel: "mobile",
        currency: params.currency,
        params: {
          variant_count: params.numVariants,
          requested_units: params.numVariants,
        },
      },
    }),
  ]);

  return { balance, quote };
}