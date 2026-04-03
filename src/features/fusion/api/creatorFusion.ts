import { api } from "../../../core/api/client";
import { endpoints } from "../../../core/api/endpoints";
import * as env from "../../../core/config/env";
import type {
  StudioPricingConfirmation,
  StudioPricingPreviewResponse,
} from "../../../core/pricing/pricePreview";

export type AspectRatio = "16:9" | "9:16" | "1:1";
export type Dimension = { width: number; height: number };

export type FusionVideoMode = "TALKING_VIDEO" | "CINEMATIC_VIDEO_DIRECTION";
export type FusionProfile = "talking_video" | "cinematic_video_direction";

export type CameraAngle = "eye_level" | "low_angle" | "high_angle";
export type CameraFraming = "medium_close_up" | "medium_shot" | "wide_shot";
export type CameraMotionStyle = "steady" | "slow_push_in" | "gentle_parallax";

export type TalkingBackgroundMode = "static" | "dynamic";
export type CinematicVideoType =
  | "brand_story"
  | "promo"
  | "festival_greeting"
  | "explainer";

export type VoiceAudio = {
  type?: "audio";
  audio_url?: string | null;
  audio_asset_id?: string | null;
  audio_artifact_id?: string | null;
};

export type VoiceTTS = {
  type?: "tts";
  voice_id: string;
  script: string;
};

export type VoiceConfig = {
  locale?: string;
  voice_id?: string | null;
  speaking_rate?: number | null;
  voice?: string | null;
  translate?: boolean;
  output_format?: "mp3" | "wav";
  gender?: "male" | "female" | null;
};

export type FusionCreateRequest = {
  face_image_url?: string;
  face_artifact_id?: string;

  voice_mode?: "audio" | "tts";
  voice_audio?: VoiceAudio;
  voice_tts?: VoiceTTS;

  image_url?: string;
  audio_url?: string;
  audio_artifact_id?: string;

  video?: {
    aspect_ratio?: AspectRatio;
    dimension?: Dimension | null;
    duration_sec?: number | null;
    duration_ms?: number | null;
    emotion?: string | null;
    motion_style?: string | null;
    profile?: FusionProfile | string | null;
    video_mode?: FusionVideoMode | string | null;
    camera_angle?: CameraAngle | string | null;
    camera_framing?: CameraFraming | string | null;
    camera_motion_style?: CameraMotionStyle | string | null;
  };

  tags?: Record<string, any>;

  video_mode?: FusionVideoMode | string;
  generation_mode?: FusionVideoMode | string;
  product_code?: FusionVideoMode | string;
  profile?: FusionProfile | string;
  profile_code?: FusionProfile | string;
  camera_angle?: CameraAngle | string;
  camera_framing?: CameraFraming | string;
  camera_motion_style?: CameraMotionStyle | string;

  background_mode?: TalkingBackgroundMode | string;
  intent?: string;
  video_type?: CinematicVideoType | string;

  prompt?: string;
  user_prompt?: string;
  video_prompt?: string;
  performance_prompt?: string;
  motion_prompt?: string;
  movement_prompt?: string;
  gesture_prompt?: string;
  body_motion_prompt?: string;
  emotion_prompt?: string;
  expression_prompt?: string;
  creative_direction?: string;

  script_text?: string;
  audio_locale?: string;
  audio_voice?: string;
  voice_gender?: "male" | "female";
  voice_gender_mode?: "auto" | "manual";

  pricing_confirmation?: StudioPricingConfirmation;
};

export type LongformCreatePayload = {
  face_artifact_id: string;
  script_text?: string;
  voice: VoiceConfig;
  aspect_ratio: AspectRatio;
  mode: "legacy" | "directed";
  longform_profile: FusionProfile;
  camera_angle?: string;
  camera_framing?: string;
  camera_motion_style?: string;
  goal?: string;
  audience?: string;
  tone?: string[];
  style?: string[];
  scenario_type?: string;
  cta?: string;
  image_urls?: string[];
  video_urls?: string[];
  screenshot_urls?: string[];
  logo_url?: string;
  external_provider_ok?: boolean;
  require_subtitles?: boolean;
  max_repair_rounds?: number;
  tags?: Record<string, any>;
  assets?: {
    face_artifact_id?: string;
    voice_audio_artifact_id?: string;
    logo_url?: string;
    image_urls?: string[];
    video_urls?: string[];
    screenshot_urls?: string[];
  };
  pricing_confirmation?: StudioPricingConfirmation;
};

export type FusionJobView = {
  id?: string;
  job_id: string;
  status: string;
  final_video_url?: string | null;
  output_video_url?: string | null;
  share_url?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  pricing?: Record<string, any> | null;
  pricing_summary?: Record<string, any> | null;
  mode?: string | null;
  stage?: string | null;
  scenario_type?: string | null;
  goal?: string | null;
  audience?: string | null;
  tone?: string[] | null;
  style?: string[] | null;
  story_beats?: Array<Record<string, any>>;
  timeline?: Record<string, any> | null;
  qc_score?: number | null;
  qc_decision?: string | null;
};

export type FusionSegmentView = {
  id: string;
  segment_index: number;
  status: string;
  duration_sec: number;
  audio_url?: string | null;
  fusion_job_id?: string | null;
  segment_video_url?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  beat_id?: string | null;
  shot_id?: string | null;
  shot_type?: string | null;
  render_route?: string | null;
  title?: string | null;
};

function clean(v: any): string {
  return String(v ?? "").trim();
}

function pickErrorMessage(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof detail?.message === "string" && detail.message.trim()) return detail.message;
  if (typeof detail?.reason === "string" && detail.reason.trim()) return detail.reason;
  if (typeof error?.body?.message === "string" && error.body.message.trim()) {
    return error.body.message;
  }
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "Unknown error";
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
    haystack.includes("invalid_token") ||
    haystack.includes("signature has expired") ||
    haystack.includes("session expired") ||
    haystack.includes("unauthorized")
  );
}

function throwFriendly(prefix: string, error: any): never {
  if (isAuthRequiredError(error)) {
    throw new Error("AUTH_REQUIRED");
  }
  throw new Error(`${prefix}: ${pickErrorMessage(error)}`);
}

/**
 * Longform routes live on svc-fusion-extension, not svc-fusion.
 * Resolve an extension-specific base first and only accept a fallback
 * if it already points at fusion-extension.
 */
function resolveFusionExtensionBase(): string {
  const candidates = [
    (env as any).FUSION_EXTENSION_BASE,
    (env as any).FUSION_EXT_BASE,
    (env as any).LONGFORM_BASE,
    (env as any).FUSION_LONGFORM_BASE,
    (env as any).SVC_FUSION_EXTENSION_BASE,
    (env as any).EXPO_PUBLIC_FUSION_EXTENSION_BASE,
  ]
    .map(clean)
    .filter(Boolean);

  const explicit = candidates.find(Boolean);
  if (explicit) return explicit;

  const fusionBase = clean((env as any).FUSION_BASE);
  if (fusionBase && /fusion-extension/i.test(fusionBase)) return fusionBase;

  throw new Error(
    "Fusion extension base URL is not configured. Longform requests must target svc-fusion-extension, not svc-fusion."
  );
}

function getLongformPreviewCandidates(): string[] {
  return [
    (endpoints as any)?.fusionExtension?.longform?.pricingPreview,
    (endpoints as any)?.fusionExtension?.longform?.jobs?.pricingPreview,
    (endpoints as any)?.longform?.pricingPreview,
    (endpoints as any)?.longform?.jobs?.pricingPreview,
    "/api/longform/jobs/pricing/preview",
    "/api/longform/pricing/preview",
  ]
    .map(clean)
    .filter(Boolean);
}

function getLongformCreateCandidates(): string[] {
  return [
    (endpoints as any)?.fusionExtension?.longform?.jobs?.create,
    (endpoints as any)?.fusionExtension?.longform?.create,
    (endpoints as any)?.longform?.jobs?.create,
    (endpoints as any)?.longform?.create,
    "/api/longform/jobs",
  ]
    .map(clean)
    .filter(Boolean);
}

function getLongformStatusCandidates(jobId: string): string[] {
  const encoded = encodeURIComponent(jobId);
  const fnA =
    (endpoints as any)?.fusionExtension?.longform?.jobs?.status ||
    (endpoints as any)?.fusionExtension?.longform?.byId;
  const fnB =
    (endpoints as any)?.longform?.jobs?.status ||
    (endpoints as any)?.longform?.byId;

  return [
    typeof fnA === "function" ? fnA(jobId) : "",
    typeof fnB === "function" ? fnB(jobId) : "",
    `/api/longform/jobs/${encoded}`,
    `/api/longform/jobs/${encoded}/status`,
  ]
    .map(clean)
    .filter(Boolean);
}

function getLongformSegmentsCandidates(jobId: string): string[] {
  const encoded = encodeURIComponent(jobId);
  const fnA =
    (endpoints as any)?.fusionExtension?.longform?.jobs?.segments ||
    (endpoints as any)?.fusionExtension?.longform?.segments;
  const fnB =
    (endpoints as any)?.longform?.jobs?.segments ||
    (endpoints as any)?.longform?.segments;

  return [
    typeof fnA === "function" ? fnA(jobId) : "",
    typeof fnB === "function" ? fnB(jobId) : "",
    `/api/longform/jobs/${encoded}/segments`,
  ]
    .map(clean)
    .filter(Boolean);
}

function normalizeVideoMode(req: FusionCreateRequest): FusionVideoMode {
  const raw =
    clean(req.video_mode) ||
    clean(req.generation_mode) ||
    clean(req.product_code) ||
    clean(req.video?.video_mode);

  return raw.toUpperCase() === "CINEMATIC_VIDEO_DIRECTION"
    ? "CINEMATIC_VIDEO_DIRECTION"
    : "TALKING_VIDEO";
}

function normalizeProfile(req: FusionCreateRequest, videoMode: FusionVideoMode): FusionProfile {
  const raw = clean(req.profile) || clean(req.profile_code) || clean(req.video?.profile);
  const s = raw.toLowerCase();

  if (s === "cinematic_video_direction" || videoMode === "CINEMATIC_VIDEO_DIRECTION") {
    return "cinematic_video_direction";
  }
  return "talking_video";
}

function mapVideoTypeToScenarioType(
  videoType: string | undefined,
  videoMode: FusionVideoMode
): string {
  if (videoMode !== "CINEMATIC_VIDEO_DIRECTION") return "auto";

  const s = clean(videoType).toLowerCase();
  if (s === "brand_story") return "brand_film";
  if (s === "promo") return "campaign_promo";
  if (s === "festival_greeting") return "festive_campaign";
  if (s === "explainer") return "product_explainer";
  return "auto";
}

function normalizeGoal(req: FusionCreateRequest): string | undefined {
  return (
    clean(req.intent) ||
    clean(req.user_prompt) ||
    clean(req.video_prompt) ||
    clean(req.performance_prompt) ||
    clean(req.creative_direction) ||
    clean(req.prompt) ||
    undefined
  );
}

function normalizeScriptText(req: FusionCreateRequest): string | undefined {
  return clean(req.script_text) || undefined;
}

function normalizeVoiceConfig(req: FusionCreateRequest): VoiceConfig {
  return {
    locale: clean(req.audio_locale) || "en-US",
    voice_id: clean(req.audio_voice) || null,
    voice: clean(req.audio_voice) || null,
    gender: req.voice_gender || null,
    output_format: "mp3",
  };
}

function normalizeCreate(req: FusionCreateRequest): LongformCreatePayload {
  const face_artifact_id = clean(req.face_artifact_id);

  if (!face_artifact_id) {
    throw new Error(
      "Longform create: face_artifact_id is required. svc-fusion-extension does not accept face_image_url as the primary create input."
    );
  }

  const videoMode = normalizeVideoMode(req);
  const longformProfile = normalizeProfile(req, videoMode);

  const camera_angle = clean(req.camera_angle || req.video?.camera_angle) || undefined;
  const camera_framing = clean(req.camera_framing || req.video?.camera_framing) || undefined;
  const camera_motion_style =
    clean(req.camera_motion_style || req.video?.camera_motion_style) || undefined;

  const goal = normalizeGoal(req);
  const script_text = normalizeScriptText(req);

  if (videoMode === "TALKING_VIDEO" && !script_text) {
    throw new Error(
      "Longform create: Talking Video requires script_text for svc-fusion-extension legacy mode."
    );
  }

  if (videoMode === "CINEMATIC_VIDEO_DIRECTION" && !goal && !script_text) {
    throw new Error(
      "Longform create: Cinematic Video Direction requires either intent/goal or script_text."
    );
  }

  const tags: Record<string, any> = {
    ...(req.tags || {}),
    video_mode: videoMode,
    product_code: videoMode,
    longform_profile: longformProfile,
    ...(req.background_mode ? { background_mode: req.background_mode } : {}),
    ...(camera_angle ? { camera_angle } : {}),
    ...(camera_framing ? { camera_framing } : {}),
    ...(camera_motion_style ? { camera_motion_style } : {}),
  };

  return {
    face_artifact_id,
    aspect_ratio: (req.video?.aspect_ratio || "9:16") as AspectRatio,
    mode: videoMode === "CINEMATIC_VIDEO_DIRECTION" ? "directed" : "legacy",
    longform_profile: longformProfile,
    voice: normalizeVoiceConfig(req),
    ...(script_text ? { script_text } : {}),
    ...(camera_angle ? { camera_angle } : {}),
    ...(camera_framing ? { camera_framing } : {}),
    ...(camera_motion_style ? { camera_motion_style } : {}),
    ...(goal ? { goal } : {}),
    scenario_type: mapVideoTypeToScenarioType(clean(req.video_type) || undefined, videoMode),
    external_provider_ok: true,
    require_subtitles: true,
    max_repair_rounds: 1,
    tags,
    assets: {
      face_artifact_id,
      ...(clean(req.audio_artifact_id || req.voice_audio?.audio_artifact_id)
        ? {
            voice_audio_artifact_id:
              clean(req.audio_artifact_id || req.voice_audio?.audio_artifact_id),
          }
        : {}),
    },
    ...(req.pricing_confirmation?.quote_id
      ? {
          pricing_confirmation: {
            quote_id: req.pricing_confirmation.quote_id,
            ...(req.pricing_confirmation.preview_fingerprint
              ? { preview_fingerprint: req.pricing_confirmation.preview_fingerprint }
              : {}),
          },
        }
      : {}),
  };
}

function normalizeJobView(raw: any): FusionJobView {
  return {
    ...raw,
    job_id: String(raw?.job_id || raw?.id || ""),
    output_video_url: raw?.output_video_url || raw?.final_video_url || null,
    share_url: raw?.share_url || raw?.final_video_url || null,
  };
}

async function firstSuccessfulPost<T>(base: string, paths: string[], payload: any): Promise<T> {
  let lastError: any = null;

  for (const path of paths) {
    try {
      return await api.post<T>(base, path, payload);
    } catch (error: any) {
      lastError = error;
      const status = Number(error?.status ?? error?.response?.status ?? NaN);

      if (isAuthRequiredError(error)) throw error;
      if (status === 404) continue;

      throw error;
    }
  }

  throw lastError ?? new Error("No valid POST route matched.");
}

async function firstSuccessfulGet<T>(base: string, paths: string[]): Promise<T> {
  let lastError: any = null;

  for (const path of paths) {
    try {
      return await api.get<T>(base, path);
    } catch (error: any) {
      lastError = error;
      const status = Number(error?.status ?? error?.response?.status ?? NaN);

      if (isAuthRequiredError(error)) throw error;
      if (status === 404) continue;

      throw error;
    }
  }

  throw lastError ?? new Error("No valid GET route matched.");
}

export async function previewFusionPricing(
  req: FusionCreateRequest
): Promise<StudioPricingPreviewResponse> {
  try {
    const payload = normalizeCreate(req);
    const base = resolveFusionExtensionBase();
    return await firstSuccessfulPost<StudioPricingPreviewResponse>(
      base,
      getLongformPreviewCandidates(),
      payload
    );
  } catch (error: any) {
    throwFriendly("Longform pricing preview failed", error);
  }
}

export async function apiCreateFusionJob(req: FusionCreateRequest): Promise<FusionJobView> {
  try {
    const payload = normalizeCreate(req);
    const base = resolveFusionExtensionBase();
    const raw = await firstSuccessfulPost<any>(
      base,
      getLongformCreateCandidates(),
      payload
    );
    return normalizeJobView(raw);
  } catch (error: any) {
    throwFriendly("Create longform job failed", error);
  }
}

export async function apiGetFusionJob(jobId: string): Promise<FusionJobView> {
  if (!jobId) throw new Error("Missing jobId");

  try {
    const base = resolveFusionExtensionBase();
    const raw = await firstSuccessfulGet<any>(
      base,
      getLongformStatusCandidates(jobId)
    );
    return normalizeJobView(raw);
  } catch (error: any) {
    throwFriendly("Longform status failed", error);
  }
}

export async function apiGetFusionJobSegments(jobId: string): Promise<FusionSegmentView[]> {
  if (!jobId) throw new Error("Missing jobId");

  try {
    const base = resolveFusionExtensionBase();
    return await firstSuccessfulGet<FusionSegmentView[]>(
      base,
      getLongformSegmentsCandidates(jobId)
    );
  } catch (error: any) {
    throwFriendly("Longform segments failed", error);
  }
}

export const apiGetFusionJobStatus = apiGetFusionJob;
