import { api } from "../../../core/api/client";
import { DIRECTOR_BASE, FACE_BASE } from "../../../core/config/env";

export type StudioStageState =
  | "pending"
  | "ready"
  | "generating"
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "failed"
  | "skipped";

export type ReviewDecision = "pending" | "approved" | "rejected" | "revise";

export type StudioReviewItem = {
  review_item_id: string;
  stage_run_id: string;
  media_id: string;
  decision: ReviewDecision;
  feedback?: string | null;
  decided_at?: string | null;
};

export type StudioArtifactRef = {
  media_id: string;
  role: string;
  source_stage_run_id?: string | null;
  is_active?: boolean;
};

export type StudioStageView = {
  stage_run_id: string;
  workflow_id: string;
  stage_type: "face" | "audio" | "fusion" | "story_final";
  scope_type: "participant" | "dialogue_turn" | "scene" | "story";
  participant_id?: string | null;
  scene_id?: string | null;
  dialogue_turn_id?: string | null;
  state: StudioStageState;
  generation_request_id?: string | null;
  generation_job_id?: string | null;
  inputs: StudioArtifactRef[];
  outputs: StudioArtifactRef[];
  reviews: StudioReviewItem[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type StudioCohortView = {
  cohort_key: string;
  stage_type: "face" | "audio" | "fusion" | "story_final";
  downstream_stage_type?: "face" | "audio" | "fusion" | "story_final" | null;
  required_total: number;
  approved_total: number;
  awaiting_review_total: number;
  generating_total: number;
  failed_total: number;
  rejected_total: number;
  pending_total: number;
  satisfied: boolean;
  required_stage_run_ids: string[];
  approved_stage_run_ids: string[];
};

export type StudioWorkflowView = {
  workflow_id: string;
  account_id: string;
  owner_user_id: string;
  project_id: string;
  story_id?: string | null;
  state: string;
  current_stage?: "face" | "audio" | "fusion" | "story_final" | null;
  stages: StudioStageView[];
  cohorts: StudioCohortView[];
  metadata: Record<string, any>;
  final_media_id?: string | null;
  next_action?: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceParticipant = {
  participant_id: string;
  display_name?: string | null;
  kind: string;
  primary_face_media_id?: string | null;
  preferred_locale?: string | null;
  persona?: Record<string, any>;
  continuity?: Record<string, any>;
  generation_state?: string | null;
};

export type StoryWorkspaceView = {
  project_id: string;
  story_id: string;
  title: string;
  status: string;
  revision: number;
  participants: WorkspaceParticipant[];
  scenes: any[];
  warnings: string[];
  actions: string[];
  updated_at: string;
};

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

export function getStoryWorkspace(storyId: string) {
  return api.get<StoryWorkspaceView>(
    DIRECTOR_BASE,
    `/api/director/stories/${encodeURIComponent(storyId)}/workspace`
  );
}

export function ensureStoryStudioWorkflow(storyId: string) {
  return api.post<StudioWorkflowView>(
    DIRECTOR_BASE,
    `/api/director/stories/${encodeURIComponent(storyId)}/studio-workflows`,
    {}
  );
}

export function getStudioWorkflow(workflowId: string) {
  return api.get<StudioWorkflowView>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}`
  );
}

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

export function reviewStudioOutput(
  reviewItemId: string,
  decision: Exclude<ReviewDecision, "pending">,
  feedback?: string | null
) {
  return api.post<StudioWorkflowView>(
    DIRECTOR_BASE,
    `/api/director/studio-reviews/${encodeURIComponent(reviewItemId)}`,
    { decision, feedback: feedback ?? null }
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

export function latestPendingReview(stage: StudioStageView | null | undefined) {
  const reviews = [...(stage?.reviews ?? [])].reverse();
  return reviews.find((item) => item.decision === "pending") ?? null;
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
