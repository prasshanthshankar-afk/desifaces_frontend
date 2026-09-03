import { api } from "../../../core/api/client";
import { DIRECTOR_BASE, FACE_BASE } from "../../../core/config/env";
import type {
  ReviewDecision,
  StudioStageState,
  StudioStageView,
  StudioWorkflowView,
} from "../../../core/studio/multiPersonWorkflow";

export * from "../../../core/studio/multiPersonWorkflow";

export type FacePricingPreview = {
  workflow_id: string;
  stage_run_id: string;
  participant_id: string;
  display_name: string;
  stage_state: StudioStageState;
  studio_input: Record<string, any>;
  pricing: Record<string, any>;
};

export type FaceDispatchResult = {
  workflow_id: string;
  stage_run_id: string;
  participant_id: string;
  display_name: string;
  face_job_id: string;
  stage_state: StudioStageState;
  attempt_id: string;
  attempt_count: number;
  attempt_kind: "initial" | "retry" | "regenerate";
};

export type FaceSyncResult = {
  provider_state?: string | null;
  stage_state: StudioStageState;
  face_job_id?: string | null;
  attempt_id?: string | null;
  attempt_no?: number;
  attempt_kind?: "initial" | "retry" | "regenerate" | null;
  media_asset_id?: string | null;
  review_item_id?: string | null;
  review_decision?: ReviewDecision | null;
  image_url?: string | null;
  face_profile_id?: string | null;
  prompt_used?: string | null;
  pricing?: Record<string, any> | null;
  error?: any;
  workflow: StudioWorkflowView;
};

export type FaceMediaReadUrl = {
  media_asset_id: string;
  kind: string;
  read_url: string;
};

export type SavedFaceReuseResult = {
  workflow: StudioWorkflowView;
  participant_id: string;
  display_name?: string;
  media_asset_id: string;
  reused: boolean;
  charged: boolean;
};

export function previewParticipantFace(workflowId: string, stageRunId: string) {
  return api.post<FacePricingPreview>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/face-stages/${encodeURIComponent(stageRunId)}/pricing-preview`,
    {}
  );
}

export function dispatchParticipantFace(
  workflowId: string,
  stageRunId: string,
  params: { quote_id: string; preview_fingerprint?: string | null }
) {
  return api.post<FaceDispatchResult>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/face-stages/${encodeURIComponent(stageRunId)}/dispatch`,
    {
      quote_id: params.quote_id,
      preview_fingerprint: params.preview_fingerprint ?? null,
      user_confirmed: true,
    }
  );
}

export function syncParticipantFace(workflowId: string, stageRunId: string) {
  return api.post<FaceSyncResult>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/face-stages/${encodeURIComponent(stageRunId)}/sync`,
    {}
  );
}

export function reuseSavedFace(
  workflowId: string,
  participantId: string,
  mediaAssetId: string
) {
  return api.put<SavedFaceReuseResult>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/participants/${encodeURIComponent(participantId)}/saved-face`,
    { media_asset_id: mediaAssetId }
  );
}

export function getFaceMediaReadUrl(mediaAssetId: string) {
  return api.get<FaceMediaReadUrl>(
    FACE_BASE,
    `/api/face/assets/${encodeURIComponent(mediaAssetId)}/read-url`
  );
}

export function faceCohort(workflow: StudioWorkflowView | null | undefined) {
  return workflow?.cohorts?.find((item) => item.cohort_key === "face_cast") ?? null;
}

export function faceStages(workflow: StudioWorkflowView | null | undefined) {
  return (workflow?.stages ?? []).filter(
    (stage) => stage.stage_type === "face" && stage.scope_type === "participant"
  );
}

export function latestFaceOutput(stage: StudioStageView | null | undefined) {
  const outputs = stage?.outputs ?? [];
  return outputs.length ? outputs[outputs.length - 1] : null;
}

export function displayPrice(preview: FacePricingPreview | null | undefined) {
  const envelope = preview?.pricing ?? {};
  return (
    envelope?.summary?.display_total ||
    envelope?.pricing?.summary?.display_total ||
    envelope?.pricing?.summary?.estimated_credits_label ||
    "Check price"
  );
}

export function pricingQuote(preview: FacePricingPreview) {
  const envelope = preview.pricing ?? {};
  const quoteId = String(envelope?.quote_id || envelope?.pricing?.quote_id || "").trim();
  const fingerprint = String(
    envelope?.preview_fingerprint || envelope?.pricing?.preview_fingerprint || ""
  ).trim();
  if (!quoteId) throw new Error("Face pricing preview did not return a quote_id");
  return { quote_id: quoteId, preview_fingerprint: fingerprint || null };
}
