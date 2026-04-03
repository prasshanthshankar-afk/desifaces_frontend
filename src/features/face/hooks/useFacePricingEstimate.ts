import { useQuery } from "@tanstack/react-query";
import { derivePricingUiSummary } from "../../../core/pricing/pricingSummary";
import { extractPricingConfirmation } from "../../../core/pricing/pricePreview";
import { normalizePricing, normalizePricingSummary } from "../../pricing/normalizers";
import { apiPreviewFacePricing } from "../api/creatorFace";

type Mode = "text-to-image" | "image-to-image";
type AspectRatio = "9:16" | "16:9" | "1:1";

export type EstimateResult = {
  preview: boolean;
  estimateLabel: string;
  detailLabel: string;
  settlementLabel: string;
  planLabel: string;
  availableLabel: string;
  holdLabel?: string;
  ctaLabel: string;
  insufficientBalance: boolean;
  raw?: any;
  confirmation?: { quote_id: string; preview_fingerprint?: string | null } | null;
  pricing?: ReturnType<typeof normalizePricing>;
  pricingSummary?: ReturnType<typeof normalizePricingSummary>;
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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

function fallbackEstimate(args: {
  mode: Mode;
  numVariants: number;
  preservationStrength: number;
  sourceImageUrl?: string | null;
  sourceImageAssetId?: string | null;
  aspectRatio: AspectRatio;
}): EstimateResult {
  const { mode, numVariants, preservationStrength, sourceImageUrl, sourceImageAssetId, aspectRatio } = args;
  const base = mode === "image-to-image" ? 2 : 1;
  const variantCost = Math.max(0, Math.ceil((numVariants - 1) / 2));
  const strengthCost = mode === "image-to-image" && preservationStrength >= 0.65 ? 1 : 0;
  const credits = base + variantCost + strengthCost;
  const estimateLabel = `${formatCredits(credits)} preview`;

  return {
    preview: true,
    estimateLabel,
    detailLabel: `${plural(numVariants, "variant")} • ${
      mode === "image-to-image"
        ? sourceImageAssetId || sourceImageUrl
          ? "identity lock"
          : "upload source photo"
        : "create face"
    } • ${aspectRatio}`,
    settlementLabel:
      "Preview estimate only. Final actual should come from the committed pricing snapshot.",
    planLabel: "Estimate preview",
    availableLabel: "Live balance wiring next",
    ctaLabel: `Generate — ${formatCredits(credits)}`,
    insufficientBalance: false,
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
  enabled,
}: {
  mode: Mode;
  prompt: string;
  numVariants: number;
  preservationStrength: number;
  sourceImageUrl?: string | null;
  sourceImageAssetId?: string | null;
  aspectRatio: AspectRatio;
  enabled: boolean;
}) {
  const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);

  return useQuery<EstimateResult>({
    queryKey: [
      "face-pricing-estimate",
      mode,
      prompt.trim(),
      numVariants,
      preservationStrength,
      sourceImageUrl ?? "",
      sourceImageAssetId ?? "",
      normalizedAspectRatio,
    ],
    enabled,
    staleTime: 10_000,
    retry: 0,
    queryFn: async () => {
      try {
        const raw = await apiPreviewFacePricing({
          mode,
          num_variants: numVariants,
          user_prompt: prompt.trim(),
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

        const confirmation = extractPricingConfirmation(raw);
        const estimateLabel =
          pricingSummary?.estimateLabel || pricingSummary?.receiptLabel || "Estimate pending";

        const insufficientBalance =
          Boolean(raw?.insufficient_balance) ||
          Boolean(raw?.pricing?.insufficient_balance) ||
          String(raw?.detail ?? "").toUpperCase() === "PRICING_INSUFFICIENT_CREDITS";

        return {
          preview: false,
          estimateLabel,
          detailLabel:
            raw?.detail_label ||
            `${plural(numVariants, "variant")} • ${
              mode === "image-to-image"
                ? sourceImageAssetId || sourceImageUrl
                  ? "identity lock"
                  : "upload source photo"
                : "live estimate"
            } • ${normalizedAspectRatio}`,
          settlementLabel:
            pricing?.settlementMode === "postpaid"
              ? "Final billed amount is confirmed after completion."
              : pricing?.settlementMode === "included"
                ? "This run is covered by plan or included quota."
                : pricing?.message ||
                  pricingSummary?.message ||
                  "Reservation is finalized after completion.",
          planLabel: pricing?.tierCode || "Current plan",
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
          ctaLabel: `Generate — ${estimateLabel}`,
          insufficientBalance,
          raw,
          confirmation,
          pricing,
          pricingSummary,
        };
      } catch {
        return fallbackEstimate({
          mode,
          numVariants,
          preservationStrength,
          sourceImageUrl,
          sourceImageAssetId,
          aspectRatio: normalizedAspectRatio,
        });
      }
    },
  });
}
