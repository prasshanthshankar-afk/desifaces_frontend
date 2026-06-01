export type StudioPricingPreviewShape = Record<string, any> & {
  estimated_amount?: string | number | null;
  amount?: string | number | null;
  currency?: string | null;
  before_credits?: string | number | null;
  after_estimated_credits?: string | number | null;
  estimated_credits?: string | number | null;
  credits_used?: string | number | null;
  estimated_units?: string | number | null;
  units?: string | number | null;
  quote_breakdown?: Record<string, any> | null;
  summary?: Record<string, any> | null;
  pricing?: Record<string, any> | null;
  entitlement?: Record<string, any> | null;
  billing_mode?: string | null;
  settlement_mode?: string | null;
  tier_code?: string | null;
  message?: string | null;
};

export type AffordabilityDecision = {
  insufficientBalance: boolean;
  beforeCredits: number | null;
  afterEstimatedCredits: number | null;
  requiredCredits: number | null;
  primaryMessage: string;
  secondaryMessage: string | null;
  ctaLabel: string;
  ctaIntent: "generate" | "topup" | "upgrade" | "contact";
  generateDisabled: boolean;
};

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function nestedNumber(obj: Record<string, any> | null | undefined, path: string[]): number | null {
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[key];
  }
  return toInt(cur);
}

function nestedString(obj: Record<string, any> | null | undefined, path: string[]): string {
  let cur: any = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return "";
    cur = cur[key];
  }
  return clean(cur);
}

function pickBeforeCredits(preview?: StudioPricingPreviewShape | null): number | null {
  return (
    toInt(preview?.before_credits) ??
    nestedNumber(preview, ["pricing", "before_credits"]) ??
    nestedNumber(preview, ["pricing", "available_credits"]) ??
    nestedNumber(preview, ["summary", "before_credits"]) ??
    null
  );
}

function pickAfterEstimatedCredits(preview?: StudioPricingPreviewShape | null): number | null {
  return (
    toInt(preview?.after_estimated_credits) ??
    nestedNumber(preview, ["pricing", "after_estimated_credits"]) ??
    nestedNumber(preview, ["summary", "after_estimated_credits"]) ??
    null
  );
}

function pickRequiredCredits(preview?: StudioPricingPreviewShape | null): number | null {
  const breakdown = preview?.quote_breakdown ?? {};
  const totalCredits =
    toInt(breakdown?.total_credits) ??
    toInt(breakdown?.quoted_credits) ??
    nestedNumber(preview, ["pricing", "estimated_credits"]) ??
    nestedNumber(preview, ["pricing", "credits_used"]) ??
    toInt(preview?.estimated_credits) ??
    toInt(preview?.credits_used) ??
    toInt(preview?.estimated_units) ??
    toInt(preview?.units);

  if (totalCredits !== null) return totalCredits;

  const before = pickBeforeCredits(preview);
  const after = pickAfterEstimatedCredits(preview);
  if (before !== null && after !== null) {
    return Math.max(0, before - after);
  }
  return null;
}

function pickSettlementMode(preview?: StudioPricingPreviewShape | null): string {
  return (
    clean(preview?.settlement_mode) ||
    nestedString(preview, ["pricing", "settlement_mode"]) ||
    nestedString(preview, ["entitlement", "settlement_mode"])
  ).toLowerCase();
}

function pickBillingMode(preview?: StudioPricingPreviewShape | null): string {
  return (
    clean(preview?.billing_mode) ||
    nestedString(preview, ["pricing", "billing_mode"]) ||
    nestedString(preview, ["entitlement", "billing_mode"])
  ).toLowerCase();
}

export function computeAffordabilityDecision(args: {
  preview?: StudioPricingPreviewShape | null;
  hasRequiredInputs: boolean;
  studioTitle: string;
  canTopUp?: boolean;
  canUpgrade?: boolean;
  isEnterprise?: boolean;
}): AffordabilityDecision {
  const beforeCredits = pickBeforeCredits(args.preview);
  const afterEstimatedCredits = pickAfterEstimatedCredits(args.preview);
  const requiredCredits = pickRequiredCredits(args.preview);
  const settlementMode = pickSettlementMode(args.preview);
  const billingMode = pickBillingMode(args.preview);

  const notEnoughCredits =
    args.hasRequiredInputs &&
    settlementMode !== "postpaid" &&
    billingMode !== "postpaid" &&
    beforeCredits !== null &&
    requiredCredits !== null &&
    beforeCredits < requiredCredits;

  if (!args.hasRequiredInputs) {
    return {
      insufficientBalance: false,
      beforeCredits,
      afterEstimatedCredits,
      requiredCredits,
      primaryMessage: `Complete the required ${args.studioTitle} inputs to see an accurate estimate.`,
      secondaryMessage: null,
      ctaLabel: "Complete setup",
      ctaIntent: "generate",
      generateDisabled: true,
    };
  }

  if (notEnoughCredits) {
    const shortfall = requiredCredits! - beforeCredits!;
    if (args.isEnterprise) {
      return {
        insufficientBalance: true,
        beforeCredits,
        afterEstimatedCredits,
        requiredCredits,
        primaryMessage: "This run needs more capacity than the account currently exposes.",
        secondaryMessage: "Contact support or sales to adjust your enterprise allowance.",
        ctaLabel: "Contact us",
        ctaIntent: "contact",
        generateDisabled: true,
      };
    }

    if (args.canTopUp) {
      return {
        insufficientBalance: true,
        beforeCredits,
        afterEstimatedCredits,
        requiredCredits,
        primaryMessage: `You need ${requiredCredits} credits for this run, but only ${beforeCredits} are available.`,
        secondaryMessage: shortfall > 0 ? `Top up ${shortfall} or more credits to continue.` : "Top up credits to continue.",
        ctaLabel: "Top up credits",
        ctaIntent: "topup",
        generateDisabled: true,
      };
    }

    if (args.canUpgrade) {
      return {
        insufficientBalance: true,
        beforeCredits,
        afterEstimatedCredits,
        requiredCredits,
        primaryMessage: `You need ${requiredCredits} credits for this run, but only ${beforeCredits} are available.`,
        secondaryMessage: "Upgrade your plan to continue with a larger included balance.",
        ctaLabel: "Upgrade plan",
        ctaIntent: "upgrade",
        generateDisabled: true,
      };
    }

    return {
      insufficientBalance: true,
      beforeCredits,
      afterEstimatedCredits,
      requiredCredits,
      primaryMessage: `You need ${requiredCredits} credits for this run, but only ${beforeCredits} are available.`,
      secondaryMessage: "This run cannot start until more credits are available.",
      ctaLabel: "Not enough credits",
      ctaIntent: "generate",
      generateDisabled: true,
    };
  }

  const displayTotal =
    clean(args.preview?.summary?.display_total) ||
    clean(args.preview?.pricing?.display_total) ||
    clean(args.preview?.estimated_amount);

  const displayUnitRate =
    clean(args.preview?.summary?.display_unit_rate) ||
    clean(args.preview?.pricing?.display_unit_rate);

  return {
    insufficientBalance: false,
    beforeCredits,
    afterEstimatedCredits,
    requiredCredits,
    primaryMessage: displayTotal ? `Estimated total: ${displayTotal}` : "Estimate ready",
    secondaryMessage: displayUnitRate || null,
    ctaLabel: `Create ${args.studioTitle}`,
    ctaIntent: "generate",
    generateDisabled: false,
  };
}

export function isPricingInsufficientCreditsError(error: any): boolean {
  const text = [
    typeof error?.message === "string" ? error.message : "",
    typeof error?.body?.detail === "string" ? error.body.detail : "",
    typeof error?.body?.message === "string" ? error.body.message : "",
    typeof error?.body?.error === "string" ? error.body.error : "",
    typeof error?.body?.reason === "string" ? error.body.reason : "",
    typeof error?.response?.data?.detail === "string" ? error.response.data.detail : "",
  ]
    .join(" | ")
    .toLowerCase();

  return (
    text.includes("pricing_insufficient_credits") ||
    text.includes("insufficient credits") ||
    text.includes("not enough credits") ||
    text.includes("pricing_reservation_failed")
  );
}

export function normalizePricingErrorForUser(error: any, studioTitle: string): string {
  const text = [
    typeof error?.message === "string" ? error.message : "",
    typeof error?.body?.detail === "string" ? error.body.detail : "",
    typeof error?.body?.message === "string" ? error.body.message : "",
    typeof error?.body?.error === "string" ? error.body.error : "",
    typeof error?.body?.reason === "string" ? error.body.reason : "",
    typeof error?.response?.data?.detail === "string" ? error.response.data.detail : "",
  ]
    .join(" | ")
    .toLowerCase();

  if (text.includes("entitlement_blocked_feature_flag")) {
    return `Upgrade your plan to use this ${studioTitle.toLowerCase()}.`;
  }

  if (isPricingInsufficientCreditsError(error)) {
    return `Not enough credits to create this ${studioTitle.toLowerCase()}. Top up or upgrade to continue.`;
  }

  const detail =
    (typeof error?.body?.detail === "string" && error.body.detail) ||
    (typeof error?.body?.message === "string" && error.body.message) ||
    (typeof error?.message === "string" && error.message) ||
    "";

  return detail.trim() || `Unable to create this ${studioTitle.toLowerCase()} right now.`;
}
