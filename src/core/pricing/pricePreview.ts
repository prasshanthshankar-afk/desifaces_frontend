import type { PricingSnapshot, PricingUiSummary, StudioKind } from "../../features/pricing/types";

export type StudioPricingConfirmation = {
  quote_id: string;
  preview_fingerprint?: string | null;
};

export type StudioPricingPreviewRequest<TPayload = Record<string, any>> = {
  studio: StudioKind;
  payload: TPayload;
};

export type StudioPricingPreviewResponse = {
  ok?: boolean;
  quote_id?: string | null;
  preview_fingerprint?: string | null;
  pricing?: Record<string, any> | null;
  pricing_summary?: Record<string, any> | null;
  estimate?: { display?: string | null } | null;
  estimate_label?: string | null;
  detail_label?: string | null;
  user_message?: string | null;
  [key: string]: any;
};

export type StudioPricingPreviewState = {
  ready: boolean;
  confirmation: StudioPricingConfirmation | null;
  pricing: PricingSnapshot | null;
  pricingSummary: PricingUiSummary | null;
};

export function extractPricingConfirmation(
  preview: StudioPricingPreviewResponse | null | undefined
): StudioPricingConfirmation | null {
  const quoteId = String(preview?.quote_id || "").trim();
  if (!quoteId) return null;
  const previewFingerprint = String(preview?.preview_fingerprint || "").trim() || null;
  return {
    quote_id: quoteId,
    preview_fingerprint: previewFingerprint,
  };
}

export function hasPricingConfirmation(
  confirmation: StudioPricingConfirmation | null | undefined
): confirmation is StudioPricingConfirmation {
  return !!confirmation?.quote_id;
}

export function attachPricingConfirmation<T extends Record<string, any>>(
  payload: T,
  confirmation: StudioPricingConfirmation | null | undefined
): T & { pricing_confirmation?: StudioPricingConfirmation } {
  if (!hasPricingConfirmation(confirmation)) return { ...payload };
  return {
    ...payload,
    pricing_confirmation: {
      quote_id: confirmation.quote_id,
      preview_fingerprint: confirmation.preview_fingerprint ?? undefined,
    },
  };
}
