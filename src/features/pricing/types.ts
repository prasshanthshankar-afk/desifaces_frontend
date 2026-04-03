export type StudioKind = "face" | "audio" | "fusion" | "retail" | "music";

export type PricingLifecycleState =
  | "idle"
  | "quoted"
  | "pending_reservation"
  | "reserved"
  | "running"
  | "finalizing"
  | "committed"
  | "released"
  | "reservation_failed"
  | "commit_failed"
  | "release_failed"
  | "failed";

export type PricingUiStage =
  | "idle"
  | "estimated"
  | "reserved"
  | "running"
  | "finalizing"
  | "committed"
  | "released"
  | "failed";

export interface PricingSnapshot {
  enabled: boolean;
  state: PricingLifecycleState;
  stage: PricingUiStage;
  amount?: string | null;
  currency?: string | null;
  billedUnits?: string | null;
  actualUnits?: string | null;
  estimatedUnits?: string | null;
  unitsKind?: string | null;
  billingMode?: string | null;
  settlementMode?: string | null;
  skuCode?: string | null;
  variantCode?: string | null;
  ledgerEntryId?: string | null;
  reservationId?: string | null;
  quoteId?: string | null;
  previewFingerprint?: string | null;
  billingAccountId?: string | null;
  tierCode?: string | null;
  entitlementSource?: string | null;
  entitlementReason?: string | null;
  message?: string | null;
  meta?: Record<string, any> | null;
  raw?: any;
}

export interface PricingUiSummary {
  estimateLabel?: string | null;
  finalLabel?: string | null;
  deltaLabel?: string | null;
  receiptLabel?: string | null;
  estimateAmount?: string | null;
  finalAmount?: string | null;
  deltaAmount?: string | null;
  currency?: string | null;
  message?: string | null;
}

export interface PlanSummary {
  planCode: string;
  planName: string;
  billingCycle?: "monthly" | "annual";
  status?: string;
  renewalDate?: string;
  walletBalance?: string;
  currency?: string;
  includedUsageLeft?: string;
  monthlySpend?: string;
}

export interface UsageSnapshotStudio {
  studio: StudioKind;
  used?: string;
  included?: string;
  spend?: string;
  percent?: number;
}

export interface UsageSnapshot {
  monthLabel: string;
  totalUsagePercent?: number;
  totalSpend?: string;
  reservedAmount?: string;
  byStudio: UsageSnapshotStudio[];
}

export interface PlanOption {
  planCode: string;
  planName: string;
  priceLabel: string;
  recommended?: boolean;
  current?: boolean;
  features: string[];
  limits: {
    face?: string;
    audio?: string;
    fusion?: string;
    retail?: string;
    music?: string;
  };
}
