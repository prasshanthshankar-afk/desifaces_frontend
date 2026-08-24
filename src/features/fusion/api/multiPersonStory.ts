import { api } from "../../../core/api/client";
import { DIRECTOR_BASE } from "../../../core/config/env";
import type {
  ReviewDecision,
  StudioStageState,
  StudioWorkflowView,
} from "../../../core/studio/multiPersonWorkflow";

export * from "../../../core/studio/multiPersonWorkflow";

export type FusionPricingChild = {
  dialogue_turn_id: string;
  participant_id: string;
  display_name: string;
  sequence_no: number;
  request_nonce: string;
  pricing_suppressed?: boolean;
  pricing?: Record<string, any>;
  pricing_summary?: Record<string, any>;
  message?: string | null;
};

export type FusionParentQuote = {
  workflow_id?: string;
  stage_run_id?: string;
  scene_id?: string;
  turn_count?: number;
  duration_source?: string;
  total_audio_duration_sec?: number;
  billable_minutes?: number;
  provider?: string;
  pricing?: Record<string, any>;
  pricing_summary?: Record<string, any>;
};

export type FusionPricingPreview = {
  workflow_id: string;
  stage_run_id: string;
  scene_id: string;
  stage_state: StudioStageState;
  render_strategy: "dialogue_turn_segments_then_stitch" | string;
  turn_count: number;
  parent_quote: FusionParentQuote;
  children: FusionPricingChild[];
  preserved_child_count: number;
  required_child_count: number;
  billable_parent_quote_count: number;
  billable_child_quote_count: number;
  child_pricing_suppressed: number;
};

export type FusionChildConfirmation = {
  dialogue_turn_id: string;
  request_nonce: string;
};

export type FusionParentConfirmation = {
  quote_id: string;
  preview_fingerprint: string;
};

export type FusionConfirmationBundle = {
  parent_confirmation: FusionParentConfirmation;
  child_confirmations: FusionChildConfirmation[];
};

export type FusionDispatchResult = {
  workflow_id: string;
  stage_run_id: string;
  scene_id: string;
  stage_state: StudioStageState;
  attempt_id: string;
  attempt_count: number;
  attempt_kind: "initial" | "retry" | "regenerate";
  children: Record<string, any>[];
  parent_pricing?: Record<string, any>;
};

export type FusionProgress = {
  execution_mode: "parallel" | string;
  phase: "video_generation" | "scene_stitch" | "ready_for_review" | string;
  total_jobs: number;
  completed_jobs: number;
  processing_jobs: number;
  queued_jobs: number;
  failed_jobs: number;
  reused_jobs: number;
  progress_pct: number;
  elapsed_seconds?: number | null;
  estimated_remaining_seconds?: number | null;
  estimated_completion_confidence?: "unavailable" | "low" | "medium" | "high" | string;
  next_phase?: string | null;
  message?: string | null;
  dispatch_concurrency?: number | null;
  max_parallel_dispatch_observed?: number | null;
  first_child_submitted_at?: string | null;
  last_child_submitted_at?: string | null;
  dispatch_spread_ms?: number | null;
  dispatch_elapsed_ms?: number | null;
};

export type FusionSyncResult = {
  workflow_id: string;
  stage_run_id: string;
  scene_id: string;
  provider_state?: string | null;
  stage_state: StudioStageState;
  media_asset_id?: string | null;
  video_url?: string | null;
  review_item_id?: string | null;
  review_decision?: ReviewDecision | null;
  children: Record<string, any>[];
  progress?: FusionProgress | null;
  parent_pricing?: Record<string, any>;
  workflow: StudioWorkflowView;
};

export function fusionStages(workflow: StudioWorkflowView | null | undefined) {
  return (workflow?.stages ?? []).filter(
    (stage) => stage.stage_type === "fusion" && stage.scope_type === "scene"
  );
}

export function previewSceneFusion(
  workflowId: string,
  stageRunId: string,
  externalProviderOk: boolean
) {
  return api.post<FusionPricingPreview>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/fusion-stages/${encodeURIComponent(stageRunId)}/pricing-preview`,
    { external_provider_ok: externalProviderOk }
  );
}

export function dispatchSceneFusion(
  workflowId: string,
  stageRunId: string,
  confirmations: FusionConfirmationBundle,
  externalProviderOk: boolean
) {
  return api.post<FusionDispatchResult>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/fusion-stages/${encodeURIComponent(stageRunId)}/dispatch`,
    {
      parent_confirmation: confirmations.parent_confirmation,
      child_confirmations: confirmations.child_confirmations,
      external_provider_ok: externalProviderOk,
      user_confirmed: true,
    }
  );
}

export function syncSceneFusion(workflowId: string, stageRunId: string) {
  return api.post<FusionSyncResult>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/fusion-stages/${encodeURIComponent(stageRunId)}/sync`,
    {}
  );
}

function clean(value: any) {
  return String(value ?? "").trim();
}

export function fusionPricingConfirmations(preview: FusionPricingPreview): FusionConfirmationBundle {
  const parent: any = preview?.parent_quote ?? {};
  const pricing: any = parent?.pricing ?? {};
  const quoteId = clean(pricing?.quote_id ?? parent?.quote_id);
  const previewFingerprint = clean(
    pricing?.preview_fingerprint ?? parent?.preview_fingerprint
  );
  if (!quoteId || !previewFingerprint) {
    throw new Error("Fusion pricing preview did not return the parent confirmation contract");
  }

  const children = Array.isArray(preview?.children) ? preview.children : [];
  const childConfirmations = children.map((child) => {
    const dialogueTurnId = clean(child?.dialogue_turn_id);
    const requestNonce = clean(child?.request_nonce);
    if (!dialogueTurnId || !requestNonce) {
      throw new Error("Fusion pricing preview returned an incomplete internal-child confirmation");
    }
    return {
      dialogue_turn_id: dialogueTurnId,
      request_nonce: requestNonce,
    };
  });

  if (
    Number(preview?.required_child_count ?? childConfirmations.length) !==
    childConfirmations.length
  ) {
    throw new Error("Fusion pricing preview child count changed before confirmation");
  }

  return {
    parent_confirmation: {
      quote_id: quoteId,
      preview_fingerprint: previewFingerprint,
    },
    child_confirmations: childConfirmations,
  };
}
