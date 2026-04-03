// src/core/api/faceClient.ts
import { FACE_BASE } from "../config/env";

export type FaceGenerationMode = "text-to-image" | "image-to-image";
export type FaceJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type FaceGender = "male" | "female";
export type FaceAspectRatio = "9:16" | "16:9" | "1:1";

export type SubjectSpec = {
  gender?: FaceGender;
  relationship_role?: string;
};

export type CreatorPlatformRequest = {
  mode?: FaceGenerationMode;
  language?: string;

  age_range_code?: string | null;
  skin_tone_code?: string | null;
  region_code?: string | null;

  subject_composition_code?: "single_person" | "two_people";
  gender?: FaceGender | null;
  subjects?: SubjectSpec[] | null;

  image_format_code?: string | null;
  use_case_code?: string | null;
  use_case?: string | null;
  style_code?: string | null;
  context_code?: string | null;
  shot_type_code?: string | null;
  aspect_ratio?: FaceAspectRatio | null;
  clothing_style_code?: string | null;
  platform_code?: string | null;

  num_variants?: number;
  user_prompt?: string | null;

  seed_mode?: "auto" | "random" | "deterministic";
  seed?: number | null;
  request_nonce?: string | null;

  source_image_url?: string | null;
  source_image_asset_id?: string | null;
  preservation_strength?: number;

  facial_features?: Record<string, string>;
  preferred_variations?: string[];
};

export type JobCreatedResponse = {
  job_id: string;
  status: string;
  message: string;
  estimated_completion_time: string;
  config: Record<string, unknown>;
};

export type GeneratedVariant = {
  variant_number: number;
  face_profile_id: string;
  media_asset_id: string;
  image_url: string;
  prompt_used: string;
  technical_specs: Record<string, unknown>;
  creative_variations: Record<string, unknown>;
};

export type JobStatusResponse = {
  job_id: string;
  status: FaceJobStatus;
  message: string;
  progress?: Record<string, unknown> | null;
  variants?: GeneratedVariant[] | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

export type UploadImageResponse = {
  asset_id: string;
  image_url: string;
  content_type: string;
  size_bytes: number;
  storage_path: string;
  width?: number | null;
  height?: number | null;
  content_safety?: {
    passed?: boolean;
    blocked?: boolean;
    reason?: string | null;
    score?: number | null;
    threshold?: number | null;
  } | null;
};

export type FaceProfileView = {
  face_profile_id: string;
  image_url: string;
  thumbnail_url?: string | null;
  variant: number;
  generation_params: Record<string, unknown>;
};

export type RegionConfigView = {
  code: string;
  display_name: string;
  sub_region?: string | null;
  is_active: boolean;
};

export type ContextConfigView = {
  code: string;
  display_name: string;
  economic_class?: string | null;
  glamour_level?: number | null;
  is_active: boolean;
};

export class FaceApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "FaceApiError";
    this.status = status;
    this.payload = payload;
  }
}

function buildFaceHeaders(token?: string | null): Record<string, string> {
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload) return fallback;

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const detail = obj.detail;

    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }

    if (detail && typeof detail === "object") {
      const detailObj = detail as Record<string, unknown>;

      if (typeof detailObj.message === "string" && detailObj.message.trim()) {
        return detailObj.message;
      }

      if (typeof detailObj.error === "string" && detailObj.error.trim()) {
        return detailObj.error;
      }
    }

    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message;
    }
  }

  return fallback;
}

async function faceRequest<T>(
  path: string,
  {
    token,
    method = "GET",
    body,
    isFormData = false,
  }: {
    token?: string | null;
    method?: "GET" | "POST";
    body?: Record<string, unknown> | FormData;
    isFormData?: boolean;
  }
): Promise<T> {
  const headers: Record<string, string> = {
    ...buildFaceHeaders(token),
  };

  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${FACE_BASE}${path}`, {
    method,
    headers,
    ...(body
      ? {
          body: isFormData ? (body as FormData) : JSON.stringify(body),
        }
      : {}),
  });

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    throw new FaceApiError(
      extractErrorMessage(payload, `Face request failed with status ${response.status}`),
      response.status,
      payload
    );
  }

  return payload as T;
}

export async function uploadFaceSourceImage(params: {
  token: string;
  file: {
    uri: string;
    name?: string;
    type?: string;
  };
}): Promise<UploadImageResponse> {
  const form = new FormData();

  form.append("file", {
    uri: params.file.uri,
    name: params.file.name || "source.jpg",
    type: params.file.type || "image/jpeg",
  } as never);

  return faceRequest<UploadImageResponse>("/api/face/assets/upload", {
    token: params.token,
    method: "POST",
    body: form,
    isFormData: true,
  });
}

export async function createFaceCreatorJob(params: {
  token: string;
  body: CreatorPlatformRequest;
}): Promise<JobCreatedResponse> {
  return faceRequest<JobCreatedResponse>("/api/face/creator/generate", {
    token: params.token,
    method: "POST",
    body: {
      mode: params.body.mode ?? "text-to-image",
      language: params.body.language ?? "en",

      age_range_code: params.body.age_range_code ?? null,
      skin_tone_code: params.body.skin_tone_code ?? null,
      region_code: params.body.region_code ?? null,

      subject_composition_code: params.body.subject_composition_code ?? "single_person",
      gender: params.body.gender ?? null,
      subjects: params.body.subjects ?? null,

      image_format_code: params.body.image_format_code ?? null,
      use_case_code: params.body.use_case_code ?? params.body.use_case ?? null,
      style_code: params.body.style_code ?? null,
      context_code: params.body.context_code ?? null,
      shot_type_code: params.body.shot_type_code ?? null,
      aspect_ratio: params.body.aspect_ratio ?? null,
      clothing_style_code: params.body.clothing_style_code ?? null,
      platform_code: params.body.platform_code ?? null,

      num_variants: params.body.num_variants ?? 4,
      user_prompt: params.body.user_prompt ?? null,

      seed_mode: params.body.seed_mode ?? "auto",
      seed: params.body.seed ?? null,
      request_nonce: params.body.request_nonce ?? null,

      source_image_url: params.body.source_image_url ?? null,
      source_image_asset_id: params.body.source_image_asset_id ?? null,
      preservation_strength: params.body.preservation_strength ?? 0.75,

      facial_features: params.body.facial_features ?? {},
      preferred_variations: params.body.preferred_variations ?? [],
    },
  });
}

export async function getFaceCreatorJobStatus(params: {
  token: string;
  jobId: string;
}): Promise<JobStatusResponse> {
  return faceRequest<JobStatusResponse>(`/api/face/creator/jobs/${params.jobId}/status`, {
    token: params.token,
    method: "GET",
  });
}

export async function listFaceCreatorJobs(params: {
  token: string;
  limit?: number;
}): Promise<JobStatusResponse[]> {
  const limit = params.limit ?? 20;

  return faceRequest<JobStatusResponse[]>(`/api/face/creator/jobs?limit=${limit}`, {
    token: params.token,
    method: "GET",
  });
}

export async function listFaceProfiles(params: {
  token: string;
  limit?: number;
}): Promise<FaceProfileView[]> {
  const limit = params.limit ?? 50;

  return faceRequest<FaceProfileView[]>(`/api/face/profiles?limit=${limit}`, {
    token: params.token,
    method: "GET",
  });
}

export async function listFaceRegions(params?: {
  token?: string | null;
  language?: string;
}): Promise<RegionConfigView[]> {
  const language = params?.language ?? "en";

  return faceRequest<RegionConfigView[]>(
    `/api/face/config/regions?language=${encodeURIComponent(language)}`,
    {
      token: params?.token,
      method: "GET",
    }
  );
}

export async function listFaceContexts(params?: {
  token?: string | null;
}): Promise<ContextConfigView[]> {
  return faceRequest<ContextConfigView[]>("/api/face/config/contexts", {
    token: params?.token,
    method: "GET",
  });
}

/**
 * Upload source image if needed, then create a creator job.
 * Useful for I2I flows from the screen layer.
 */
export async function createFaceCreatorJobWithOptionalUpload(params: {
  token: string;
  body: CreatorPlatformRequest;
  sourceImageFile?: {
    uri: string;
    name?: string;
    type?: string;
  };
}): Promise<JobCreatedResponse> {
  let requestBody: CreatorPlatformRequest = { ...params.body };

  if (
    requestBody.mode === "image-to-image" &&
    !requestBody.source_image_asset_id &&
    params.sourceImageFile
  ) {
    const upload = await uploadFaceSourceImage({
      token: params.token,
      file: params.sourceImageFile,
    });

    requestBody = {
      ...requestBody,
      source_image_asset_id: upload.asset_id,
    };
  }

  return createFaceCreatorJob({
    token: params.token,
    body: requestBody,
  });
}