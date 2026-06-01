import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../core/auth/AuthContext";
import { derivePricingUiSummary } from "../../../core/pricing/pricingSummary";
import { extractPricingConfirmation } from "../../../core/pricing/pricePreview";
import { normalizePricing, normalizePricingSummary } from "../../pricing/normalizers";
import { apiPreviewFacePricing } from "../api/creatorFace";

type Mode = "text-to-image" | "image-to-image";
type AspectRatio = "9:16" | "16:9" | "1:1";

export type EstimateResult = {
  preview: boolean;
  estimateLabel: string;
  primaryEstimateLabel: string;
  secondaryEstimateLabel: string;
  creditEstimateLabel: string;
  moneyEstimateLabel: string;
  detailLabel: string;
  settlementLabel: string;
  planLabel: string;
  availableLabel: string;
  holdLabel?: string;
  ctaLabel: string;
  insufficientBalance: boolean;
  topUpVisible: boolean;
  upgradeVisible: boolean;
  raw?: any;
  confirmation?: { quote_id: string; preview_fingerprint?: string | null } | null;
  pricing?: ReturnType<typeof normalizePricing>;
  pricingSummary?: ReturnType<typeof normalizePricingSummary>;
};

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function formatCredits(n: number) {
  return `${n} credit${n === 1 ? "" : "s"}`;
}

function normalizeAspectRatio(value: unknown): AspectRatio {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "16:9" || raw === "landscape") return "16:9";
  if (raw === "1:1" || raw === "square") return "1:1";
  return "9:16";
}

function formatMoney(amount: number, currency = "USD"): string {
  const safeCurrency = cleanString(currency).toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${safeCurrency} ${amount.toFixed(2)}`;
  }
}

function asNumber(value: any): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readMoneyEstimate(raw: any, pricing: any): { amount: number; currency: string } | null {
  const amount =
    asNumber(raw?.estimated_amount) ??
    asNumber(raw?.amount) ??
    asNumber(raw?.pricing?.estimated_amount) ??
    asNumber(raw?.pricing?.amount) ??
    asNumber(raw?.pricing_summary?.estimated_amount) ??
    asNumber(raw?.pricing_summary?.amount) ??
    asNumber(pricing?.amount);

  if (amount == null) return null;

  const currency =
    cleanString(raw?.currency) ||
    cleanString(raw?.pricing?.currency) ||
    cleanString(raw?.pricing_summary?.currency) ||
    cleanString(pricing?.currency) ||
    "USD";

  return { amount, currency };
}

function readCreditEstimate(raw: any): number | null {
  return (
    asNumber(raw?.estimated_credits) ??
    asNumber(raw?.credits_used) ??
    asNumber(raw?.estimated_units) ??
    asNumber(raw?.units) ??
    asNumber(raw?.pricing?.estimated_credits) ??
    asNumber(raw?.pricing?.credits_used) ??
    asNumber(raw?.pricing?.estimated_units) ??
    asNumber(raw?.pricing?.units) ??
    asNumber(raw?.pricing_summary?.estimated_credits) ??
    asNumber(raw?.pricing_summary?.credits_used) ??
    asNumber(raw?.pricing_summary?.estimated_units) ??
    asNumber(raw?.pricing_summary?.units)
  );
}

function buildFallbackCreditEstimate(args: {
  mode: Mode;
  numVariants: number;
  preservationStrength: number;
}): number {
  const { mode, numVariants, preservationStrength } = args;
  const base = mode === "image-to-image" ? 2 : 1;
  const variantCost = Math.max(0, Math.ceil((numVariants - 1) / 2));
  const strengthCost = mode === "image-to-image" && preservationStrength >= 0.65 ? 1 : 0;
  return base + variantCost + strengthCost;
}

function chooseSettlementLabel(pricing: any, insufficientBalance: boolean): string {
  const billingMode = cleanString(pricing?.billingMode).toLowerCase();
  const settlementMode = cleanString(pricing?.settlementMode).toLowerCase();

  if (insufficientBalance) return "Not enough available credits for this run.";
  if (settlementMode === "postpaid" || billingMode === "bill") {
    return "Billed after completion through enterprise invoicing.";
  }
  if (settlementMode === "included" || settlementMode === "credits" || !settlementMode) {
    return "Covered by your available credits.";
  }
  return pricing?.message || "Estimate shown before the run. Final pricing is confirmed after completion.";
}

function buildEstimateResult(args: {
  mode: Mode;
  numVariants: number;
  preservationStrength: number;
  sourceImageUrl?: string | null;
  sourceImageAssetId?: string | null;
  aspectRatio: AspectRatio;
  pricing?: any;
  pricingSummary?: any;
  raw?: any;
  confirmation?: { quote_id: string; preview_fingerprint?: string | null } | null;
  insufficientBalance: boolean;
}): EstimateResult {
  const {
    mode,
    numVariants,
    preservationStrength,
    sourceImageUrl,
    sourceImageAssetId,
    aspectRatio,
    pricing,
    pricingSummary,
    raw,
    confirmation,
    insufficientBalance,
  } = args;

  const creditUnits =
    readCreditEstimate(raw) ??
    buildFallbackCreditEstimate({ mode, numVariants, preservationStrength });
  const creditEstimateLabel = formatCredits(Math.max(0, Math.round(creditUnits)));

  const money = readMoneyEstimate(raw, pricing);
  const moneyEstimateLabel = money ? formatMoney(money.amount, money.currency) : formatMoney(0, "USD");

  const billingMode = cleanString(pricing?.billingMode).toLowerCase();
  const settlementMode = cleanString(pricing?.settlementMode).toLowerCase();
  const useMoneyPrimary = settlementMode === "postpaid" || billingMode === "bill";

  const primaryEstimateLabel = useMoneyPrimary ? moneyEstimateLabel : creditEstimateLabel;
  const secondaryEstimateLabel = useMoneyPrimary ? creditEstimateLabel : moneyEstimateLabel;

  return {
    preview: !confirmation?.quote_id,
    estimateLabel: primaryEstimateLabel,
    primaryEstimateLabel,
    secondaryEstimateLabel,
    creditEstimateLabel,
    moneyEstimateLabel,
    detailLabel: `Credits used: ${creditEstimateLabel} • Cash charged: ${moneyEstimateLabel}`,
    settlementLabel: chooseSettlementLabel(pricing, insufficientBalance),
    planLabel:
      pricing?.tierCode ||
      cleanString(raw?.tier_code) ||
      cleanString(raw?.plan_code) ||
      "Current plan",
    availableLabel:
      pricing?.billingMode === "bill"
        ? "Billed after completion"
        : pricing?.settlementMode === "included"
          ? "Covered by plan"
          : "Balance available",
    holdLabel:
      pricing?.stage === "reserved"
        ? pricingSummary?.message || "Amount reserved"
        : pricing?.settlementMode === "postpaid"
          ? "No credit hold"
          : undefined,
    ctaLabel: `Create Face — ${primaryEstimateLabel}`,
    insufficientBalance,
    topUpVisible: insufficientBalance && !(settlementMode === "postpaid" || billingMode === "bill"),
    upgradeVisible: insufficientBalance && !(settlementMode === "postpaid" || billingMode === "bill"),
    raw,
    confirmation,
    pricing,
    pricingSummary,
  };
}

export function useFacePricingEstimate({
  mode,
  prompt,
  numVariants,
  preservationStrength,
  sourceImageUrl,
  sourceImageAssetId,
  aspectRatio,
  gender,
  regionCode,
  contextCode,
  useCaseCode,
  shotTypeCode,
  enabled,
}: {
  mode: Mode;
  prompt: string;
  numVariants: number;
  preservationStrength: number;
  sourceImageUrl?: string | null;
  sourceImageAssetId?: string | null;
  aspectRatio: AspectRatio;
  gender?: string | null;
  regionCode?: string | null;
  contextCode?: string | null;
  useCaseCode?: string | null;
  shotTypeCode?: string | null;
  enabled: boolean;
}) {
  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
  const trimmedPrompt = prompt.trim();
  const auth = useAuth() as any;
  const authToken = String(
    auth?.token ??
      auth?.accessToken ??
      auth?.session?.accessToken ??
      ""
  ).trim();
  const authUserId = String(
    auth?.userId ?? auth?.user?.id ?? auth?.profile?.id ?? ""
  ).trim();
  const authUserScope = String(authUserId || auth?.email || "")
    .trim()
    .toLowerCase();
  const authReadyForPricing = Boolean(authToken && authUserId);

  return useQuery<EstimateResult>({
    queryKey: [
      "face-pricing-estimate",
      authUserScope,
      mode,
      trimmedPrompt,
      numVariants,
      preservationStrength,
      sourceImageUrl ?? "",
      sourceImageAssetId ?? "",
      normalizedAspectRatio,
      gender ?? "",
      regionCode ?? "",
      contextCode ?? "",
      useCaseCode ?? "",
      shotTypeCode ?? "",
    ],
    enabled: enabled && !!authUserScope && authReadyForPricing,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 0,
    queryFn: async () => {
      try {
        console.log("[useFacePricingEstimate]", {
          enabled,
          authReadyForPricing,
          authUserScope,
          mode,
          hasPrompt: trimmedPrompt.length > 0,
          hasSourceImageUrl: Boolean(sourceImageUrl),
          hasSourceImageAssetId: Boolean(sourceImageAssetId),
          normalizedAspectRatio,
          gender: cleanString(gender) || null,
          regionCode: cleanString(regionCode) || null,
        });

        const raw = await apiPreviewFacePricing({
          mode,
          num_variants: numVariants,
          user_prompt: trimmedPrompt,
          gender: cleanString(gender) || undefined,
          region_code: cleanString(regionCode) || undefined,
          context_code: cleanString(contextCode) || undefined,
          use_case: cleanString(useCaseCode) || undefined,
          shot_type_code: cleanString(shotTypeCode) || undefined,
          aspect_ratio: normalizedAspectRatio,
          source_image_url: mode === "image-to-image" ? sourceImageUrl || undefined : undefined,
          source_image_asset_id:
            mode === "image-to-image" ? sourceImageAssetId || undefined : undefined,
          preservation_strength: mode === "image-to-image" ? preservationStrength : undefined,
        });

        const pricing = normalizePricing(raw?.pricing, raw?.pricing_summary);
        const pricingSummary =
          normalizePricingSummary(raw?.pricing, raw?.pricing_summary) ||
          derivePricingUiSummary(pricing, {
            estimateLabel:
              raw?.estimate?.display ||
              raw?.estimate_label ||
              raw?.detail_label ||
              raw?.user_message ||
              null,
            message: raw?.user_message || raw?.detail_label || null,
          });

        const extractedConfirmation = extractPricingConfirmation(raw);
        const confirmation =
          extractedConfirmation?.quote_id
            ? extractedConfirmation
            : raw?.pricing_confirmation?.quote_id || raw?.confirmation?.quote_id || raw?.quote_id
              ? {
                  quote_id:
                    raw?.pricing_confirmation?.quote_id ||
                    raw?.confirmation?.quote_id ||
                    raw?.quote_id,
                  preview_fingerprint:
                    raw?.pricing_confirmation?.preview_fingerprint ||
                    raw?.confirmation?.preview_fingerprint ||
                    raw?.preview_fingerprint ||
                    null,
                }
              : null;

        const messageText = String(raw?.detail ?? raw?.message ?? pricing?.message ?? "").toUpperCase();
        const insufficientBalance =
          Boolean(raw?.insufficient_balance) ||
          Boolean(raw?.pricing?.insufficient_balance) ||
          messageText.includes("PRICING_INSUFFICIENT_CREDITS");

        return buildEstimateResult({
          mode,
          numVariants,
          preservationStrength,
          sourceImageUrl,
          sourceImageAssetId,
          aspectRatio: normalizedAspectRatio,
          pricing,
          pricingSummary,
          raw,
          confirmation,
          insufficientBalance,
        });
      } catch (error) {
        console.error("[useFacePricingEstimate][error]", {
          enabled,
          authReadyForPricing,
          authUserScope,
          mode,
          hasPrompt: trimmedPrompt.length > 0,
          hasSourceImageUrl: Boolean(sourceImageUrl),
          hasSourceImageAssetId: Boolean(sourceImageAssetId),
          normalizedAspectRatio,
          gender: cleanString(gender) || null,
          regionCode: cleanString(regionCode) || null,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : String(error),
        });
        throw error;
      }
    },
  });
}
