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
    speakers: {
      participant_id: string;
      display_name: string;
      voice_profile_ref?: string | null;
      voice_locale?: string | null;
      ready: boolean;
      user_message: string;
    }[];
    states: Record<string, number>;
  };
  fusion: {
    approved: number;
    total: number;
    ready: boolean;
    items: {
      stage_run_id: string;
      scene_id: string;
      state: string;
      ready_for_pricing: boolean;
    }[];
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
  style?: string | null;
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
    fusion_external_provider_consent_required: "Confirm secure video processing before creating the scene.",
    fusion_child_job_failed: "One scene segment could not be created. Only that segment will be retried.",
    PRICING_INSUFFICIENT_CREDITS: "You do not have enough available credits for this generation. Add credits or choose a smaller generation, then check the price again.",
    PRICING_CLIENT_DISABLED: "Pricing is temporarily unavailable. Nothing has been generated or charged. Please try again shortly.",
    PRICING_UNKNOWN_OR_INACTIVE_VARIANT: "This generation option is not currently available for pricing. Nothing has been generated or charged.",
    PRICING_VARIANT_ZERO_QTY_LINES: "The requested generation could not be priced correctly. Nothing has been generated or charged.",
    PRICING_VARIANT_HAS_NO_LINES: "The requested generation could not be priced correctly. Nothing has been generated or charged.",
    PRICING_RESERVATION_FAILED: "The price was shown, but credits could not be reserved. Nothing has been generated or charged. Please check the price again.",
    pricing_confirmation_required: "Review and confirm the latest price before creating this media.",
    quote_expired: "That price quote has expired. Check the price again before creating the media.",
    preview_fingerprint: "The generation details changed after pricing. Check the price again before creating the media.",
  };
  for (const [needle, message] of Object.entries(known)) {
    if (code.includes(needle)) return message;
  }
  return code ? code.replace(/_/g, " ") : "Something went wrong. Please try again.";
}
