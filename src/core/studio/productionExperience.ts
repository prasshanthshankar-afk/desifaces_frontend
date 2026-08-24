import { api } from "../api/client";
import { DIRECTOR_BASE } from "../config/env";

export type FacePreflightItem = {
  stage_run_id: string;
  participant_id: string;
  display_name: string;
  state: string;
  locked: boolean;
  has_saved_or_primary_face: boolean;
  gender_presentation?: string | null;
  missing_fields: string[];
  ready_for_pricing: boolean;
  actions: string[];
  user_message: string;
};

export type StudioProductionPreflight = {
  workflow_id: string;
  story_id?: string | null;
  project_id: string;
  workflow_state: string;
  current_stage: string;
  face: {
    approved: number;
    total: number;
    ready: boolean;
    items: FacePreflightItem[];
  };
  audio: {
    approved: number;
    total: number;
    speakers_ready: boolean;
    speakers: Array<{
      participant_id: string;
      display_name: string;
      voice_profile_ref?: string | null;
      voice_locale?: string | null;
      ready: boolean;
      user_message: string;
    }>;
    states: Record<string, number>;
  };
  fusion: {
    approved: number;
    total: number;
    ready: boolean;
    items: Array<{
      stage_run_id: string;
      scene_id: string;
      state: string;
      ready_for_pricing: boolean;
    }>;
  };
};

export type AudioAutoCharacter = {
  participant_id: string;
  display_name: string;
  ready: boolean;
  status: "preserved" | "suggested" | "needs_user_choice" | string;
  locale?: string | null;
  language?: string | null;
  native_name?: string | null;
  voice_id?: string | null;
  voice_display_name?: string | null;
  voice_gender?: string | null;
  message: string;
};

export type AudioAutoConfigureResult = {
  workflow_id: string;
  ready: boolean;
  characters: AudioAutoCharacter[];
};

export function getStudioProductionPreflight(workflowId: string) {
  return api.get<StudioProductionPreflight>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/preflight`
  );
}

export function setParticipantFaceProfile(
  workflowId: string,
  participantId: string,
  genderPresentation: "female" | "male",
  agePresentation?: string | null
) {
  return api.put<StudioProductionPreflight>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/participants/${encodeURIComponent(participantId)}/face-profile`,
    {
      gender_presentation: genderPresentation,
      age_presentation: agePresentation || null,
    }
  );
}

export function autoConfigureStoryAudio(workflowId: string) {
  return api.post<AudioAutoConfigureResult>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/audio-autoconfigure`,
    {}
  );
}

export function retryFusionStitch(workflowId: string, stageRunId: string) {
  return api.post<Record<string, any>>(
    DIRECTOR_BASE,
    `/api/director/studio-workflows/${encodeURIComponent(workflowId)}/fusion-stages/${encodeURIComponent(stageRunId)}/retry-stitch`,
    {}
  );
}

export function userFacingStudioError(error: any): string {
  const detail = error?.body?.detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    return detail.message;
  }
  const raw = typeof detail === "string" ? detail : typeof error?.message === "string" ? error.message : "";
  const code = String(raw || "").trim();
  const known: Record<string, string> = {
    face_explicit_gender_required: "Choose how this character should be presented before creating a new Face.",
    audio_participant_voice_profile_required: "Choose a language and voice before creating Audio.",
    fusion_scene_requires_approved_dialogue_audio: "Approve all dialogue Audio before creating the scene.",
    fusion_external_provider_consent_required: "Confirm external processing before creating the scene.",
    fusion_child_job_failed: "One scene segment could not be created. Only that segment will be retried.",
  };
  for (const [needle, message] of Object.entries(known)) {
    if (code.includes(needle)) return message;
  }
  return code ? code.replace(/_/g, " ") : "Something went wrong. Please try again.";
}
