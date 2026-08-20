import { api } from "../../../core/api/client";
import { DIRECTOR_BASE } from "../../../core/config/env";
import type {
  ReviewDecision,
  StudioStageState,
  StudioWorkflowView,
} from "../../../core/studio/multiPersonWorkflow";

export * from "../../../core/studio/multiPersonWorkflow";

export type AudioPricingPreview = {
  workflow_id: string;
  stage_run_id: string;
  dialogue_turn_id: string;
  participant_id: string;
  display_name: string;
  stage_state: StudioStageState;
  studio_input: Record<string, any>;
  pricing: Record<string, any>;
};

export type AudioDispatchResult = {
  workflow_id: string;
  stage_run_id: string;
  dialogue_turn_id: string;
  participant_id: string;
  display_name: string;
  audio_job_id: string;
  stage_state: StudioStageState;
  attempt_id: string;
  attempt_count: number;
  attempt_kind: "initial" | "retry" | "regenerate";
};

export type AudioSyncResult = {
  workflow_id: string;
  stage_run_id: string;
  dialogue_turn_id: string;
  participant_id: string;
  display_name: string;
  provider_state?: string | null;
  stage_state: StudioStageState;
  audio_job_id?: string | null;
  media_asset_id?: string | null;
  audio_url?: string | null;
  review_item_id?: string | null;
  review_decision?: ReviewDecision | null;
  error_code?: string | null;
  error_message?: string | null;
  workflow: StudioWorkflowView;
};

export type ParticipantVoiceProfileResult = {
  workflow_id: string;
  participant_id: string;
  display_name: string;
  voice_id: string;
  voice_locale: string;
  voice_gender: string;
  voice_display_name: string;
  applies_to: "all_dialogue_turns_for_participant" | string;
};

/**
 * Audio stages are canonically dialogue-turn scoped, so participant_id is
 * intentionally null on the wire. The Director persists the speaker relation
 * as stage.metadata.speaker_participant_id when it creates the workflow.
 *
 * The mobile Audio workspace needs that relation for participant-level voice
 * controls. Enrich a presentation copy only; do not change the canonical
 * workflow contract or scope semantics.
 */
export function audioStages(workflow: StudioWorkflowView | null | undefined) {
  return (workflow?.stages ?? [])
    .filter(
      (stage) => stage.stage_type === "audio" && stage.scope_type === "dialogue_turn"
    )
    .map((stage) => ({
      ...stage,
      participant_id:
        (stage as any).participant_id ??
        (stage.metadata?.speaker_participant_id
          ? String(stage.metadata.speaker_participant_id)
          : null),
    }));
}

export function configureParticipantVoice(
  workflowId: string,
  participantId: string,
  params: { voice_id: string; voice_locale: string }
) {
  return api.put<ParticipantVoiceProfileResult>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/participants/${encodeURIComponent(participantId)}/voice-profile`,
    params
  );
}

export function previewDialogueAudio(workflowId: string, stageRunId: string) {
  return api.post<AudioPricingPreview>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/audio-stages/${encodeURIComponent(stageRunId)}/pricing-preview`,
    {}
  );
}

export function dispatchDialogueAudio(
  workflowId: string,
  stageRunId: string,
  params: { quote_id: string; preview_fingerprint?: string | null }
) {
  return api.post<AudioDispatchResult>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/audio-stages/${encodeURIComponent(stageRunId)}/dispatch`,
    {
      quote_id: params.quote_id,
      preview_fingerprint: params.preview_fingerprint ?? null,
      user_confirmed: true,
    }
  );
}

/**
 * Sync is a state-refresh operation. Director marks a terminal provider failure
 * in the workflow before returning the error response. Recover that authoritative
 * workflow so the UI cannot remain visually stuck on "Generating" forever.
 */
export async function syncDialogueAudio(workflowId: string, stageRunId: string) {
  try {
    return await api.post<AudioSyncResult>(
      DIRECTOR_BASE,
      `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/audio-stages/${encodeURIComponent(stageRunId)}/sync`,
      {}
    );
  } catch (error) {
    const workflow = await api.get<StudioWorkflowView>(
      DIRECTOR_BASE,
      `/api/director/studio-workflows/${encodeURIComponent(workflowId)}`
    );
    const stage = audioStages(workflow).find(
      (item) => item.stage_run_id === stageRunId
    );

    if (
      stage &&
      ["failed", "rejected", "awaiting_review", "approved"].includes(String(stage.state))
    ) {
      return {
        workflow_id: workflowId,
        stage_run_id: stageRunId,
        dialogue_turn_id: String(stage.dialogue_turn_id || ""),
        participant_id: String((stage as any).participant_id || ""),
        display_name: "",
        provider_state: stage.state === "failed" ? "failed" : null,
        stage_state: stage.state,
        audio_job_id: String(stage.generation_job_id || "") || null,
        media_asset_id: null,
        audio_url: null,
        review_item_id: null,
        review_decision: null,
        error_code: stage.state === "failed" ? "audio_generation_failed" : null,
        error_message:
          stage.state === "failed"
            ? String(stage.metadata?.error || stage.metadata?.error_message || "Audio generation failed")
            : null,
        workflow,
      } satisfies AudioSyncResult;
    }

    throw error;
  }
}

export function audioPricingQuote(preview: AudioPricingPreview) {
  const envelope = preview.pricing ?? {};
  const quoteId = String(envelope?.quote_id || envelope?.pricing?.quote_id || "").trim();
  const fingerprint = String(
    envelope?.preview_fingerprint || envelope?.pricing?.preview_fingerprint || ""
  ).trim();
  if (!quoteId) throw new Error("Audio pricing preview did not return a quote_id");
  return { quote_id: quoteId, preview_fingerprint: fingerprint || null };
}
