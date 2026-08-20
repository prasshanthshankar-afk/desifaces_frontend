import { api } from "../api/client";
import { DIRECTOR_BASE } from "../config/env";

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
  voice_profile_ref?: string | null;
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

function clean(value: unknown) {
  return String(value ?? "").trim();
}

/**
 * Older story Audio stages were dialogue-turn scoped and stored the canonical
 * speaker id only in metadata.speaker_participant_id. Newer writers also fill
 * participant_id directly. Normalize both shapes at the shared client boundary
 * so all Studio screens see the same participant identity without mutating the
 * durable workflow or guessing from display names.
 */
export function normalizeStudioWorkflow(view: StudioWorkflowView): StudioWorkflowView {
  return {
    ...view,
    stages: (view?.stages ?? []).map((stage) => {
      if (stage.participant_id) return stage;
      if (stage.stage_type !== "audio" || stage.scope_type !== "dialogue_turn") return stage;
      const speakerId = clean(stage.metadata?.speaker_participant_id);
      return speakerId ? { ...stage, participant_id: speakerId } : stage;
    }),
  };
}

export function getStoryWorkspace(storyId: string) {
  return api.get<StoryWorkspaceView>(
    DIRECTOR_BASE,
    `/api/director/stories/${encodeURIComponent(storyId)}/workspace`
  );
}

export async function ensureStoryStudioWorkflow(storyId: string) {
  const view = await api.post<StudioWorkflowView>(
    DIRECTOR_BASE,
    `/api/director/stories/${encodeURIComponent(storyId)}/studio-workflows`,
    {}
  );
  return normalizeStudioWorkflow(view);
}

export async function getStudioWorkflow(workflowId: string) {
  const view = await api.get<StudioWorkflowView>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}`
  );
  return normalizeStudioWorkflow(view);
}

export async function reviewStudioOutput(
  reviewItemId: string,
  decision: Exclude<ReviewDecision, "pending">,
  feedback?: string | null
) {
  const view = await api.post<StudioWorkflowView>(
    DIRECTOR_BASE,
    `/api/director/studio-reviews/${encodeURIComponent(reviewItemId)}`,
    { decision, feedback: feedback ?? null }
  );
  return normalizeStudioWorkflow(view);
}

export function latestPendingReview(stage: StudioStageView | null | undefined) {
  const reviews = [...(stage?.reviews ?? [])].reverse();
  return reviews.find((item) => item.decision === "pending") ?? null;
}

export async function advanceStudioWorkflow(workflowId: string) {
  const view = await api.post<StudioWorkflowView>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/advance`,
    {}
  );
  return normalizeStudioWorkflow(view);
}
