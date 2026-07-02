export type StudioPricingPreviewShape = Record<string, any> & {
  estimated_amount?: string | number | null;
  amount?: string | number | null;
  currency?: string | null;
  before_credits?: string | number | null;
  after_estimated_credits?: string | number | null;
  estimated_credits?: string | number | null;
  credits_used?: string | number | null;
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

  // Credits must come from credit-specific backend fields only.
  // Do not use estimated units / units here; in creator studios those values can
  // mean quantity, duration buckets, or variant count rather than billable credits.
  const totalCredits =
    toInt(breakdown?.total_credits) ??
    toInt(breakdown?.quoted_credits) ??
    nestedNumber(preview, ["pricing", "estimated_credits"]) ??
    nestedNumber(preview, ["pricing", "credits_used"]) ??
    nestedNumber(preview, ["pricing", "reserved_credits"]) ??
    nestedNumber(preview, ["pricing", "total_credits"]) ??
    nestedNumber(preview, ["summary", "estimated_credits"]) ??
    nestedNumber(preview, ["summary", "credits_used"]) ??
    nestedNumber(preview, ["summary", "reserved_credits"]) ??
    nestedNumber(preview, ["summary", "total_credits"]) ??
    toInt(preview?.estimated_credits) ??
    toInt(preview?.credits_used);

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


function stringFrom(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorObjectCandidates(error: any): any[] {
  const candidates = [
    error,
    error?.body,
    error?.payload,
    error?.response,
    error?.response?.data,
    error?.data,
    error?.detail,
    error?.body?.detail,
    error?.response?.data?.detail,
  ];

  return candidates.filter((candidate) => candidate && typeof candidate === "object");
}

function firstErrorString(error: any, keys: string[]): string {
  for (const candidate of errorObjectCandidates(error)) {
    for (const key of keys) {
      const value = candidate?.[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  for (const key of keys) {
    const value = error?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function firstErrorStringList(error: any, keys: string[]): string[] {
  for (const candidate of errorObjectCandidates(error)) {
    for (const key of keys) {
      const value = candidate?.[key];
      if (Array.isArray(value)) {
        return value.map((item) => clean(item)).filter(Boolean);
      }
      if (typeof value === "string" && value.trim()) {
        return value
          .split(/[;,]/g)
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }
  }
  return [];
}

function errorText(error: any): string {
  const direct = [
    stringFrom(error?.message),
    stringFrom(error?.code),
    stringFrom(error?.body?.detail),
    stringFrom(error?.body?.message),
    stringFrom(error?.body?.error),
    stringFrom(error?.body?.reason),
    stringFrom(error?.response?.data?.detail),
    stringFrom(error?.response?.data?.message),
    stringFrom(error?.response?.data?.error),
  ];

  const objectValues = errorObjectCandidates(error).flatMap((candidate) =>
    ["error_code", "code", "message", "detail", "error", "reason"].map((key) => stringFrom(candidate?.[key]))
  );

  return [...direct, ...objectValues].filter(Boolean).join(" | ");
}

export function normalizePromptPolicyErrorForUser(error: any, studioTitle: string = "Studio"): string | null {
  const code = firstErrorString(error, ["error_code", "errorCode", "code"]).toUpperCase();
  const message = firstErrorString(error, ["message", "detail", "error", "reason"]);
  const combined = `${code} | ${message} | ${errorText(error)}`.toLowerCase();

  const isPolicyBlock =
    code.includes("PROMPT_POLICY_BLOCKED") ||
    code.includes("CONTENT_POLICY") ||
    code.includes("SAFETY") ||
    code.includes("MODERATION") ||
    combined.includes("prompt_policy_blocked") ||
    combined.includes("content policy") ||
    combined.includes("inappropriate prompt") ||
    combined.includes("not permitted") ||
    combined.includes("moderation") ||
    combined.includes("safety check") ||
    combined.includes("safety policy");

  if (!isPolicyBlock) return null;

  const blockedCategories = firstErrorStringList(error, [
    "blocked_categories",
    "blockedCategories",
    "categories",
    "category",
  ]);
  const notPermitted = firstErrorStringList(error, [
    "not_permitted",
    "notPermitted",
    "disallowed",
    "not_allowed",
    "notAllowed",
  ]);
  const suggestedChanges = firstErrorStringList(error, [
    "suggested_changes",
    "suggestedChanges",
    "suggestions",
    "fixes",
    "actions",
  ]);

  const lines = [`${studioTitle} prompt needs changes.`];

  if (blockedCategories.length > 0) {
    lines.push(`Blocked category: ${blockedCategories.join(", ")}.`);
  }

  lines.push(
    `Not permitted: ${
      notPermitted.length > 0
        ? notPermitted.join("; ")
        : "explicit sexual content, nudity, sexualized minors, graphic violence, hate, self-harm, or illegal instructions"
    }.`
  );

  lines.push(
    `Please change: ${
      suggestedChanges.length > 0
        ? suggestedChanges.join("; ")
        : "rewrite the prompt in a family-friendly way and focus on clothing, setting, lighting, emotion, style, and the intended creative result"
    }.`
  );

  return lines.join("\n");
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
  const policyMessage = normalizePromptPolicyErrorForUser(error, studioTitle);
  if (policyMessage) return policyMessage;

  const text = errorText(error).toLowerCase();

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
