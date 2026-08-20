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
  quote_id: string;
  preview_fingerprint?: string | null;
  pricing?: Record<string, any>;
  pricing_summary?: Record<string, any>;
  message?: string | null;
};

export type FusionPricingPreview = {
  workflow_id: string;
  stage_run_id: string;
  scene_id: string;
  stage_state: StudioStageState;
  render_strategy: "dialogue_turn_segments_then_stitch" | string;
  turn_count: number;
  children: FusionPricingChild[];
};

export type FusionChildConfirmation = {
  dialogue_turn_id: string;
  request_nonce: string;
  quote_id: string;
  preview_fingerprint?: string | null;
};

export type FusionDispatchResult = {
  workflow_id: string;
  stage_run_id: string;
  scene_id: string;
  stage_state: StudioStageState;
  attempt_id: string;
  attempt_count: number;
  attempt_kind: "initial" | "retry" | "regenerate";
  children: Array<Record<string, any>>;
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
  children: Array<Record<string, any>>;
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
  confirmations: FusionChildConfirmation[],
  externalProviderOk: boolean
) {
  return api.post<FusionDispatchResult>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/fusion-stages/${encodeURIComponent(stageRunId)}/dispatch`,
    {
      confirmations,
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

export function fusionPricingConfirmations(preview: FusionPricingPreview): FusionChildConfirmation[] {
  const children = Array.isArray(preview?.children) ? preview.children : [];
  if (!children.length) throw new Error("Fusion pricing preview did not return dialogue segments");
  return children.map((child) => {
    const dialogueTurnId = String(child?.dialogue_turn_id || "").trim();
    const requestNonce = String(child?.request_nonce || "").trim();
    const quoteId = String(child?.quote_id || "").trim();
    if (!dialogueTurnId || !requestNonce || !quoteId) {
      throw new Error("Fusion pricing preview returned an incomplete confirmation bundle");
    }
    return {
      dialogue_turn_id: dialogueTurnId,
      request_nonce: requestNonce,
      quote_id: quoteId,
      preview_fingerprint: String(child?.preview_fingerprint || "").trim() || null,
    };
  });
}
