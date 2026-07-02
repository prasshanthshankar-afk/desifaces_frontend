import { api, ApiError } from "../../../core/api/client";
import { endpoints } from "../../../core/api/endpoints";
import { FACE_BASE } from "../../../core/config/env";
import type {
  StudioPricingConfirmation,
  StudioPricingPreviewResponse,
} from "../../../core/pricing/pricePreview";
import { normalizePricingErrorForUser } from "../../../core/pricing/studioAffordability";

type AnyRecord = Record<string, any>;

const FACE_PREVIEW_TIMEOUT_MS = 30000;
const FACE_CREATE_TIMEOUT_MS = 45000;
const FACE_IMAGE_SAFETY_TIMEOUT_MS = 60000;
const FACE_IMAGE_UPLOAD_TIMEOUT_MS = 90000;

export type FaceImageSafetyResponse = {
  allow: boolean;
  status?: string;
  reason?: string | null;
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function isAuthRequiredError(error: any) {
  if (String(error?.message) === "AUTH_REQUIRED") return true;

  const haystack = [
    typeof error?.message === "string" ? error.message : "",
    typeof error?.body?.detail === "string" ? error.body.detail : "",
    typeof error?.body?.message === "string" ? error.body.message : "",
    typeof error?.body?.error === "string" ? error.body.error : "",
    typeof error?.body?.reason === "string" ? error.body.reason : "",
  ]
    .join(" | ")
    .toLowerCase();

  return (
    haystack.includes("auth_required") ||
    haystack.includes("missing_token") ||
    haystack.includes("invalid_token") ||
    haystack.includes("signature has expired") ||
    haystack.includes("session expired") ||
    haystack.includes("unauthorized")
  );
}

function pickErrorMessage(error: any) {
  const detail = error?.body?.detail;

  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof detail?.message === "string" && detail.message.trim()) return detail.message;
  if (typeof detail?.reason === "string" && detail.reason.trim()) return detail.reason;
  if (typeof error?.body?.message === "string" && error.body.message.trim()) return error.body.message;
  if (typeof error?.message === "string" && error.message.trim()) return error.message;

  return "Unknown error";
}

function getFacePreviewPath(): string {
  return (
    (endpoints as any)?.face?.creator?.pricingPreview ||
    (endpoints as any)?.face?.creator?.pricingPreviewCandidates?.[0] ||
    "/api/face/creator/pricing/preview"
  );
}

function getFaceGeneratePath(): string {
  return (
    (endpoints as any)?.face?.creator?.generate ||
    "/api/face/creator/generate"
  );
}

function getFaceStatusPath(jobId: string): string {
  const statusFn = (endpoints as any)?.face?.creator?.jobs?.status;
  return typeof statusFn === "function"
    ? statusFn(jobId)
    : `/api/face/creator/jobs/${encodeURIComponent(jobId)}/status`;
}

function getFaceUploadPath(): string {
  return (
    (endpoints as any)?.face?.assets?.upload ||
    "/api/face/assets/upload"
  );
}

function getFaceI2ISafetyCheckPath(): string {
  return (
    (endpoints as any)?.face?.creator?.i2i?.contentSafetyCheck ||
    (endpoints as any)?.face?.creator?.i2i?.safetyCheck ||
    "/api/face/creator/i2i/content-safety/check"
  );
}


const FACE_PRICING_PREVIEW_ALLOWED_STUDIO_KEYS = new Set([
  "mode",
  "prompt",
  "user_prompt",
  "num_variants",
  "variations",
  "variant_count",
  "aspect_ratio",
  "quality",
  "gender",
  "region_code",
  "context_code",
  "use_case",
  "shot_type_code",
  "source_image_url",
  "source_image_asset_id",
  "source_asset_id",
  "glasses",
  "facial_hair",
  "beard",
  "mustache",
  "moustache",
  "preservation_strength",
  "identity_lock",
  "identity_lock_level",
  "preserve_source_identity",
  "preserve_source_gender",
  "gender_lock_mode",
  "locked_identity_features",
  "request_only_editable_attributes",
  "allowed_i2i_changes",
  "forbidden_i2i_changes",
]);

function sanitizeFacePricingStudioInput(studioInput: AnyRecord = {}): AnyRecord {
  const input = studioInput && typeof studioInput === "object" ? studioInput : {};
  const output: AnyRecord = {};

  for (const [key, value] of Object.entries(input)) {
    if (FACE_PRICING_PREVIEW_ALLOWED_STUDIO_KEYS.has(key) && value !== undefined && value !== null) {
      output[key] = value;
    }
  }

  const mode = clean(output.mode || input.mode);
  if (mode) output.mode = mode;

  const prompt = clean(output.user_prompt || output.prompt || input.user_prompt || input.prompt);
  output.user_prompt = prompt;
  output.prompt = prompt;

  if (mode === "image-to-image") {
    const rawStrength = Number(output.preservation_strength ?? 1);
    output.preservation_strength = Math.max(
      0.995,
      Math.min(1, Number.isFinite(rawStrength) ? rawStrength : 1)
    );
    output.identity_lock = true;
    output.preserve_source_identity = true;
    output.preserve_source_gender = true;
    delete output.gender;
    delete output.region_code;
    delete output.context_code;
    delete output.use_case;
    delete output.shot_type_code;
  }

  return output;
}

function buildPreviewRequest(studioInput: AnyRecord): AnyRecord {
  return {
    studio: "face",
    action: "generate",
    studio_input: sanitizeFacePricingStudioInput(studioInput),
    client_context: {},
  };
}

function buildGenerateRequest(
  studioInput: AnyRecord,
  pricingConfirmation: StudioPricingConfirmation
): AnyRecord {
  return {
    studio_input: studioInput ?? {},
    pricing_confirmation: {
      quote_id: pricingConfirmation.quote_id,
      ...(pricingConfirmation.preview_fingerprint
        ? { preview_fingerprint: pricingConfirmation.preview_fingerprint }
        : {}),
    },
  };
}

function buildImageFormData(params: {
  localUri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): FormData {
  const form = new FormData();

  form.append("file", {
    uri: params.localUri,
    name: clean(params.fileName) || "source.jpg",
    type: clean(params.mimeType) || "image/jpeg",
  } as any);

  return form;
}

function unwrapPayload(response: AnyRecord): AnyRecord {
  if (!response || typeof response !== "object") return {};
  const nested =
    (response.result && typeof response.result === "object" ? response.result : null) ||
    (response.data && typeof response.data === "object" ? response.data : null) ||
    (response.detail && typeof response.detail === "object" ? response.detail : null);
  return nested ? { ...nested, ...response } : response;
}

function normalizeSafetyResponse(response: AnyRecord): FaceImageSafetyResponse {
  const payload = unwrapPayload(response);

  const allow =
    payload?.allow === true ||
    payload?.passed === true ||
    payload?.approved === true ||
    payload?.safe === true;

  const status =
    clean(payload?.status) ||
    clean(payload?.verdict) ||
    (allow ? "passed" : "");

  const reason =
    clean(payload?.reason) ||
    clean(payload?.message) ||
    clean(payload?.detail) ||
    null;

  return {
    allow: Boolean(allow),
    status: status || undefined,
    reason,
  };
}

function rethrowFriendly(prefix: string, error: any): never {
  if (isAuthRequiredError(error)) {
    throw new Error("AUTH_REQUIRED");
  }

  const normalized = normalizePricingErrorForUser(error, "Face");
  if (normalized.toLowerCase().includes("not enough credits")) {
    throw new Error(normalized);
  }

  const msg = pickErrorMessage(error);

  if (error instanceof ApiError) {
    throw new Error(`${prefix}: ${msg}`);
  }

  throw new Error(`${prefix}: ${msg}`);
}

export async function apiPreviewFacePricing(
  studioInput: AnyRecord = {}
): Promise<StudioPricingPreviewResponse> {
  try {
    console.log("[apiPreviewFacePricing]", {
      base: FACE_BASE,
      path: getFacePreviewPath(),
      timeoutMs: FACE_PREVIEW_TIMEOUT_MS,
    });

    return await api.post<StudioPricingPreviewResponse>(
      FACE_BASE,
      getFacePreviewPath(),
      buildPreviewRequest(studioInput),
      { timeoutMs: FACE_PREVIEW_TIMEOUT_MS }
    );
  } catch (error: any) {
    rethrowFriendly("Face preview failed", error);
  }
}

export async function apiCreateFaceJob(
  studioInput: AnyRecord = {},
  pricingConfirmation?: StudioPricingConfirmation | null
): Promise<AnyRecord> {
  if (!pricingConfirmation?.quote_id) {
    throw new Error("Missing pricing confirmation. Preview pricing before generating.");
  }

  try {
    return await api.post<AnyRecord>(
      FACE_BASE,
      getFaceGeneratePath(),
      buildGenerateRequest(studioInput, pricingConfirmation),
      { timeoutMs: FACE_CREATE_TIMEOUT_MS }
    );
  } catch (error: any) {
    rethrowFriendly("Create face job failed", error);
  }
}

export async function apiGetFaceJobStatus(jobId: string): Promise<AnyRecord> {
  if (!jobId) throw new Error("Missing jobId");

  try {
    return await api.get<AnyRecord>(FACE_BASE, getFaceStatusPath(jobId));
  } catch (error: any) {
    rethrowFriendly("Face status failed", error);
  }
}

export async function apiListFaceJobs(limit = 20): Promise<AnyRecord> {
  const listFn = (endpoints as any)?.face?.creator?.jobs?.list;
  const path =
    typeof listFn === "function"
      ? listFn(limit)
      : `/api/face/creator/jobs?limit=${encodeURIComponent(String(limit))}`;

  try {
    return await api.get<AnyRecord>(FACE_BASE, path);
  } catch (error: any) {
    rethrowFriendly("List face jobs failed", error);
  }
}

export async function apiCheckFaceSourceImageSafety(params: {
  localUri: string;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<FaceImageSafetyResponse> {
  if (!clean(params.localUri)) throw new Error("Missing localUri");

  const form = buildImageFormData({
    localUri: params.localUri,
    fileName: params.fileName,
    mimeType: params.mimeType,
  });

  try {
    const response = await api.post<AnyRecord>(
      FACE_BASE,
      getFaceI2ISafetyCheckPath(),
      form,
      { timeoutMs: FACE_IMAGE_SAFETY_TIMEOUT_MS }
    );

    return normalizeSafetyResponse(response);
  } catch (error: any) {
    rethrowFriendly("Face image safety check failed", error);
  }
}

export async function apiUploadSourceImage(
  localUri: string,
  options?: {
    fileName?: string | null;
    mimeType?: string | null;
  }
): Promise<AnyRecord> {
  if (!clean(localUri)) throw new Error("Missing localUri");

  const form = buildImageFormData({
    localUri,
    fileName: options?.fileName,
    mimeType: options?.mimeType,
  });

  try {
    return await api.post<AnyRecord>(
      FACE_BASE,
      getFaceUploadPath(),
      form,
      { timeoutMs: FACE_IMAGE_UPLOAD_TIMEOUT_MS }
    );
  } catch (error: any) {
    rethrowFriendly("Face asset upload failed", error);
  }
}
