import { api } from "../../../core/api/client";
import { endpoints } from "../../../core/api/endpoints";
import { DIRECTOR_BASE, FACE_BASE } from "../../../core/config/env";
import {
  apiCreateFaceJob,
  apiGetFaceJobStatus,
  apiPreviewFacePricing,
  apiUploadSourceImage,
} from "./creatorFace";
import type { StudioPricingPreviewResponse } from "../../../core/pricing/pricePreview";

export type SharedSceneSpeakerProfile = {
  participant_id: string;
  display_name: string;
  gender_presentation?: "female" | "male" | null;
  age_presentation?: string | null;
  country_code?: string | null;
  region_code?: string | null;
};

export type SharedSceneWorkflowState = {
  contract_version: number;
  state_version: number;
  workflow_id: string;
  story_id?: string | null;
  workflow_state: string;
  current_stage?: string | null;
  phase:
    | "people"
    | "group_photo_source"
    | "group_photo_prepare"
    | "group_photo_map"
    | "group_photo_approve"
    | "audio"
    | "video"
    | "final"
    | string;
  next_action?: string | null;
  allowed_actions: string[];
  people: {
    approved: boolean;
    profiles_complete: boolean;
    speaker_count: number;
    speakers: SharedSceneSpeakerProfile[];
    approved_snapshot?: SharedSceneSpeakerProfile[] | null;
  };
  group_photo: {
    source_mode?: "generate" | "upload" | null;
    generate_supported: boolean;
    generation_spec?: Record<string, any> | null;
    generation_input?: Record<string, any> | null;
    draft_media_id?: string | null;
    approved_media_id?: string | null;
    mapped_count: number;
    required_mapped_count: number;
    approved: boolean;
  };
  audio: {
    approved: number;
    total: number;
    states?: Record<string, number>;
    complete: boolean;
  };
  video: {
    stage_run_id?: string | null;
    state?: string | null;
    settings_saved: boolean;
    supported?: boolean;
    max_people?: number;
    reason?: string | null;
  };
};

export type GroupPhotoValidation = {
  allow: boolean;
  status?: "PASS" | "WARN" | "FAIL" | string;
  summary?: string | null;
  checks?: any[];
};

export type SharedScenePoint = { x: number; y: number };
export type SharedSceneDimensions = { width: number; height: number };

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function mediaAssetId(value: any) {
  return clean(
    value?.media_asset_id ||
      value?.mediaAssetId ||
      value?.asset_id ||
      value?.id ||
      value?.data?.media_asset_id ||
      value?.result?.media_asset_id
  );
}

function imageUrl(value: any) {
  return clean(
    value?.image_url ||
      value?.preview_url ||
      value?.read_url ||
      value?.url ||
      value?.data?.image_url ||
      value?.result?.image_url
  );
}

export function getSharedSceneState(workflowId: string) {
  return api.get<SharedSceneWorkflowState>(
    DIRECTOR_BASE,
    endpoints.director.sharedSceneState(workflowId)
  );
}

export function saveSharedSceneSpeakerProfile(
  workflowId: string,
  participantId: string,
  profile: {
    gender_presentation: "female" | "male";
    age_presentation?: string | null;
    country_code?: string | null;
    region_code?: string | null;
  }
) {
  return api.put<any>(
    DIRECTOR_BASE,
    endpoints.director.sharedSceneProfile(workflowId, participantId),
    profile
  );
}

export function approveSharedScenePeople(workflowId: string) {
  return api.post<any>(
    DIRECTOR_BASE,
    endpoints.director.sharedScenePeopleApproval(workflowId),
    {}
  );
}

export function chooseSharedSceneSource(
  workflowId: string,
  mode: "generate" | "upload"
) {
  return api.put<SharedSceneWorkflowState>(
    DIRECTOR_BASE,
    endpoints.director.sharedSceneSource(workflowId),
    { mode }
  );
}

export function saveGroupPhotoSpec(
  workflowId: string,
  params: {
    scene_country_code?: string | null;
    scene_region_code?: string | null;
    context_code?: string | null;
    background?: string | null;
    prompt: string;
    variant_count: 1 | 2 | 4 | 6 | 8;
  }
) {
  return api.put<SharedSceneWorkflowState>(
    DIRECTOR_BASE,
    endpoints.director.sharedSceneGroupPhotoSpec(workflowId),
    { ...params, aspect_ratio: "16:9" }
  );
}

function imageForm(params: {
  localUri: string;
  fileName?: string | null;
  mimeType?: string | null;
  expectedSpeakers?: number;
}) {
  const form = new FormData();
  form.append("file", {
    uri: params.localUri,
    name: clean(params.fileName) || "group-photo.jpg",
    type: clean(params.mimeType) || "image/jpeg",
  } as any);
  if (params.expectedSpeakers != null) {
    form.append("expected_speakers", String(params.expectedSpeakers));
  }
  return form;
}

export function validateLocalGroupPhoto(params: {
  localUri: string;
  fileName?: string | null;
  mimeType?: string | null;
  expectedSpeakers: number;
}) {
  return api.post<GroupPhotoValidation>(
    FACE_BASE,
    endpoints.face.groupPhoto.validate,
    imageForm(params),
    { timeoutMs: 90000 }
  );
}

export async function uploadValidatedGroupPhoto(params: {
  localUri: string;
  fileName?: string | null;
  mimeType?: string | null;
  expectedSpeakers: number;
}) {
  const localValidation = await validateLocalGroupPhoto(params);
  if (!localValidation?.allow) {
    throw new Error(localValidation?.summary || "This group photo did not pass the required safety and quality checks.");
  }

  const uploaded = await apiUploadSourceImage(params.localUri, {
    fileName: params.fileName,
    mimeType: params.mimeType,
  });
  const id = mediaAssetId(uploaded);
  const url = imageUrl(uploaded);
  if (!id) throw new Error("Group photo upload did not return a reusable media asset.");

  const storedValidation = await api.post<GroupPhotoValidation>(
    FACE_BASE,
    endpoints.face.groupPhoto.validateAsset,
    {
      media_asset_id: id,
      expected_speakers: params.expectedSpeakers,
    },
    { timeoutMs: 90000 }
  );
  if (!storedValidation?.allow) {
    throw new Error(storedValidation?.summary || "The stored group photo did not pass validation.");
  }

  return { uploaded, media_asset_id: id, image_url: url, validation: storedValidation };
}

export function validateStoredGroupPhoto(
  mediaAssetIdValue: string,
  expectedSpeakers: number
) {
  return api.post<GroupPhotoValidation>(
    FACE_BASE,
    endpoints.face.groupPhoto.validateAsset,
    {
      media_asset_id: mediaAssetIdValue,
      expected_speakers: expectedSpeakers,
    },
    { timeoutMs: 90000 }
  );
}

export function persistSharedSceneDraft(
  workflowId: string,
  stageRunId: string,
  params: {
    shared_scene_media_id: string;
    image_width?: number | null;
    image_height?: number | null;
    speaker_targets: Array<{
      participant_id: string;
      point: SharedScenePoint;
    }>;
  }
) {
  return api.put<any>(
    DIRECTOR_BASE,
    endpoints.director.sharedSceneDraft(workflowId, stageRunId),
    params
  );
}

export function approveSharedScene(
  workflowId: string,
  stageRunId: string,
  params: {
    shared_scene_media_id: string;
    image_width: number;
    image_height: number;
    speaker_targets: Array<{
      participant_id: string;
      point: SharedScenePoint;
    }>;
  }
) {
  return api.put<any>(
    DIRECTOR_BASE,
    endpoints.director.sharedScene(workflowId, stageRunId),
    params
  );
}

export function saveSharedSceneVideoSettings(
  workflowId: string,
  stageRunId: string,
  params: {
    motion_mode: "precise_lipsync" | "natural_motion";
    video_prompt?: string | null;
  }
) {
  return api.put<any>(
    DIRECTOR_BASE,
    endpoints.director.sharedSceneVideoSettings(workflowId, stageRunId),
    params
  );
}

export async function previewGroupPhotoGeneration(
  state: SharedSceneWorkflowState
): Promise<StudioPricingPreviewResponse> {
  const input = state?.group_photo?.generation_input;
  if (!input || typeof input !== "object") {
    throw new Error("The saved group photo generation specification is missing.");
  }
  return apiPreviewFacePricing(input);
}

export async function generateGroupPhoto(
  state: SharedSceneWorkflowState,
  confirmation: { quote_id: string; preview_fingerprint?: string | null }
) {
  const input = state?.group_photo?.generation_input;
  if (!input || typeof input !== "object") {
    throw new Error("The saved group photo generation specification is missing.");
  }
  return apiCreateFaceJob(input, confirmation);
}

export async function pollGroupPhotoJob(
  jobId: string,
  options?: { timeoutMs?: number; intervalMs?: number }
) {
  const timeoutMs = options?.timeoutMs ?? 180000;
  const intervalMs = options?.intervalMs ?? 2500;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await apiGetFaceJobStatus(jobId);
    const state = clean(status?.status).toLowerCase();
    if (["succeeded", "failed", "cancelled"].includes(state)) return status;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Group photo generation timed out.");
}

export function generatedGroupPhotoVariants(status: any) {
  const variants = Array.isArray(status?.variants) ? status.variants : [];
  return variants
    .map((item: any) => ({
      ...item,
      media_asset_id: mediaAssetId(item),
      image_url: imageUrl(item),
    }))
    .filter((item: any) => item.media_asset_id && item.image_url);
}
