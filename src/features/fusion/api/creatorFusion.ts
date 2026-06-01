import { api } from "../../../core/api/client";
import { endpoints } from "../../../core/api/endpoints";
import * as env from "../../../core/config/env";
import type {
  StudioPricingConfirmation,
  StudioPricingPreviewResponse,
} from "../../../core/pricing/pricePreview";
import { normalizePricingErrorForUser } from "../../../core/pricing/studioAffordability";

export type AspectRatio = "16:9" | "9:16" | "1:1";
export type Dimension = { width: number; height: number };

export type FusionVideoMode = "TALKING_VIDEO" | "CINEMATIC_VIDEO_DIRECTION";
export type FusionProfile = "talking_video" | "cinematic_video_direction";

export type CameraAngle = "eye_level" | "low_angle" | "high_angle";
export type CameraFraming = "medium_close_up" | "medium_shot" | "wide_shot";
export type CameraMotionStyle = "steady" | "slow_push_in" | "gentle_parallax";

export type TalkingBackgroundMode = "fixed" | "movement_based";
export type CinematicOutputProfile = "talking_video" | "economy" | "fast" | "premium";
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
  consent?: { external_provider_ok?: boolean };

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
    requested_duration_sec?: number | null;
    pricing_duration_sec?: number | null;
    video_duration_sec?: number | null;
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
  output_profile?: CinematicOutputProfile | string;
  intent?: string | { goal?: string; duration_sec?: number | null };
  goal?: string;
  title?: string;
  requested_duration_sec?: number | null;
  pricing_duration_sec?: number | null;
  video_duration_sec?: number | null;
  minutes?: number | null;
  requested_units?: number | null;
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
  provider?: string;
  provider_hint?: string;
  quality_tier?: "economy" | "premium" | "fast" | string;
  scenario_name?: string;

  pricing_confirmation?: StudioPricingConfirmation;
};

export type LongformCreatePayload = {
  face_artifact_id: string;
  script_text?: string;
  voice?: VoiceConfig;
  voice_audio?: VoiceAudio;
  audio_artifact_id?: string;
  audio_url?: string;
  aspect_ratio: AspectRatio;
  mode: "legacy" | "directed";
  longform_profile: FusionProfile;
  output_profile?: CinematicOutputProfile | string;
  quality_tier?: "economy" | "premium" | "fast" | string;
  provider_hint?: string;
  scenario_name?: string;
  title?: string;
  duration_sec?: number;
  requested_duration_sec?: number;
  pricing_duration_sec?: number;
  video_duration_sec?: number;
  minutes?: number;
  requested_units?: number;
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
  consent?: { external_provider_ok: true };
  require_subtitles?: boolean;
  max_repair_rounds?: number;
  tags?: Record<string, any>;
  video?: {
    aspect_ratio?: AspectRatio;
    duration_sec?: number;
    requested_duration_sec?: number;
    pricing_duration_sec?: number;
    video_duration_sec?: number;
    camera_angle?: string;
    camera_framing?: string;
    camera_motion_style?: string;
    profile?: FusionProfile | string;
    video_mode?: FusionVideoMode | string;
  };
  intent?: { goal?: string; duration_sec?: number };
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

export type DirectFusionCreatePayload = {
  face_image_url?: string;
  face_artifact_id?: string;
  voice_mode: "audio" | "tts";
  voice_audio?: VoiceAudio;
  voice_tts?: VoiceTTS;
  video?: {
    aspect_ratio?: AspectRatio;
    dimension?: Dimension | null;
    duration_sec?: number | null;
    requested_duration_sec?: number | null;
    pricing_duration_sec?: number | null;
    video_duration_sec?: number | null;
    duration_ms?: number | null;
    emotion?: string | null;
    motion_style?: string | null;
    profile?: FusionProfile | string | null;
    video_mode?: FusionVideoMode | string | null;
    camera_angle?: CameraAngle | string | null;
    camera_framing?: CameraFraming | string | null;
    camera_motion_style?: CameraMotionStyle | string | null;
  };
  consent: { external_provider_ok: true };
  output_profile?: CinematicOutputProfile | string;
  provider?: string;
  tags?: Record<string, any>;
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
  run_receipt?: Record<string, any> | null;
  runReceipt?: Record<string, any> | null;
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

const TALKING_VIDEO_BETA_RELEASE = true;
const CINEMATIC_VIDEO_COMING_SOON = true;

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

function firstClean(...values: any[]): string {
  for (const value of values) {
    const next = clean(value);
    if (next) return next;
  }
  return "";
}

function resolveFaceArtifactId(req: FusionCreateRequest): string {
  const tags: Record<string, any> = (req.tags || {}) as any;
  const assets: Record<string, any> = ((req as any)?.assets || {}) as any;

  return firstClean(
    req.face_artifact_id,
    (req as any)?.faceArtifactId,
    tags.face_artifact_id,
    tags.faceArtifactId,
    tags.selected_face_artifact_id,
    tags.selectedFaceArtifactId,
    tags.fusion_face_artifact_id,
    tags.fusionFaceArtifactId,
    assets.face_artifact_id,
    assets.faceArtifactId
  );
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
  const normalized = normalizePricingErrorForUser(error, "Video");
  if (normalized.toLowerCase().includes("not enough credits")) {
    throw new Error(normalized);
  }
  throw new Error(`${prefix}: ${pickErrorMessage(error)}`);
}

/**
 * Longform routes live on svc-fusion-extension.
 * The production/public gateway now exposes /fusion-extension/*,
 * so prefer the explicit extension base from env aliases.
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
    "Fusion extension base URL is not configured. Longform requests must target svc-fusion-extension."
  );
}

function resolveFusionBase(): string {
  const candidates = [
    (env as any).FUSION_BASE,
    (env as any).SVC_FUSION_BASE,
    (env as any).EXPO_PUBLIC_FUSION_BASE,
    (env as any).VIDEO_BASE,
    (env as any).EXPO_PUBLIC_VIDEO_BASE,
  ]
    .map(clean)
    .filter(Boolean);

  const explicit = candidates.find((value) => value && !/fusion-extension/i.test(value));
  if (explicit) return explicit;

  throw new Error(
    "Fusion base URL is not configured. Direct Fusion requests must target svc-fusion."
  );
}

function getLongformPreviewCandidates(): string[] {
  return [
    // Validated active route
    (endpoints as any)?.fusionExtension?.longform?.pricingPreview,
    (endpoints as any)?.longform?.pricingPreview,
    "/api/longform/pricing/preview",

    // Keep legacy guess last as a fallback only
    (endpoints as any)?.fusionExtension?.longform?.jobs?.pricingPreview,
    (endpoints as any)?.longform?.jobs?.pricingPreview,
    "/api/longform/jobs/pricing/preview",
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

function withCacheBust(path: string): string {
  const value = clean(path);
  if (!value) return "";
  const sep = value.includes("?") ? "&" : "?";
  return `${value}${sep}_ts=${Date.now()}`;
}

function getLongformStatusCandidates(jobId: string): string[] {
  const encoded = encodeURIComponent(jobId);
  const fnA =
    (endpoints as any)?.fusionExtension?.longform?.byId ||
    (endpoints as any)?.fusionExtension?.longform?.jobs?.status;
  const fnB =
    (endpoints as any)?.longform?.byId ||
    (endpoints as any)?.longform?.jobs?.status;

  return [
    typeof fnA === "function" ? fnA(jobId) : "",
    typeof fnB === "function" ? fnB(jobId) : "",
    `/api/longform/jobs/${encoded}`,
  ]
    .map(clean)
    .filter(Boolean)
    .map(withCacheBust);
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

function getFusionPreviewCandidates(): string[] {
  return [
    (endpoints as any)?.fusion?.jobs?.pricingPreview,
    (endpoints as any)?.fusion?.pricingPreview,
    (endpoints as any)?.video?.jobs?.pricingPreview,
    (endpoints as any)?.video?.pricingPreview,
    "/jobs/pricing/preview",
    "/api/fusion/jobs/pricing/preview",
    "/api/fusion/pricing/preview",
  ]
    .map(clean)
    .filter(Boolean);
}

function getFusionCreateCandidates(): string[] {
  return [
    (endpoints as any)?.fusion?.jobs?.create,
    (endpoints as any)?.fusion?.create,
    (endpoints as any)?.video?.jobs?.create,
    (endpoints as any)?.video?.create,
    "/jobs",
    "/api/fusion/jobs",
  ]
    .map(clean)
    .filter(Boolean);
}

function getFusionStatusCandidates(jobId: string): string[] {
  const encoded = encodeURIComponent(jobId);
  const fnA =
    (endpoints as any)?.fusion?.jobs?.status ||
    (endpoints as any)?.fusion?.byId;
  const fnB =
    (endpoints as any)?.video?.jobs?.status ||
    (endpoints as any)?.video?.byId;

  return [
    typeof fnA === "function" ? fnA(jobId) : "",
    typeof fnB === "function" ? fnB(jobId) : "",
    `/jobs/${encoded}`,
    `/api/fusion/jobs/${encoded}`,
  ]
    .map(clean)
    .filter(Boolean);
}

function talkingProviderForRequest(req: FusionCreateRequest): string {
  const backgroundMode = clean(req.background_mode || (req.tags || {}).background_mode).toLowerCase();
  const outputProfile = clean(req.output_profile || (req.tags || {}).output_profile).toLowerCase();
  const qualityTier = clean(req.quality_tier || (req.tags || {}).quality_tier).toLowerCase();
  if (
    backgroundMode === "movement_based" ||
    outputProfile === "premium" ||
    qualityTier === "premium" ||
    clean(req.scenario_name || (req.tags || {}).scenario_name).toLowerCase() === "talking_video_premium"
  ) {
    return "kling";
  }
  return "veed_fabric";
}

function assertSupportedFusionMode(req: FusionCreateRequest): void {
  if (CINEMATIC_VIDEO_COMING_SOON && normalizeVideoMode(req) === "CINEMATIC_VIDEO_DIRECTION") {
    throw new Error("Cinematic Video Direction is coming soon. Fusion Studio currently ships with Talking Video Economy in-product and Talking Video Premium as Beta Release.");
  }
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

function normalizeOutputProfile(
  req: FusionCreateRequest,
  videoMode: FusionVideoMode
): CinematicOutputProfile {
  const raw = clean(req.output_profile).toLowerCase();
  if (videoMode !== "CINEMATIC_VIDEO_DIRECTION") {
    if (raw === "economy") return "economy";
    if (raw === "premium") return "premium";
    return "talking_video";
  }
  if (raw === "fast") return "fast";
  if (raw === "premium") return "premium";
  return "premium";
}

function estimatedMinutesFromRequest(req: FusionCreateRequest): number {
  const durationSec = Number(req.video?.duration_sec ?? 0);
  const durationMs = Number(req.video?.duration_ms ?? 0);
  const seconds = Number.isFinite(durationSec) && durationSec > 0
    ? durationSec
    : Number.isFinite(durationMs) && durationMs > 0
      ? durationMs / 1000
      : 60;
  return Math.max(1, Math.ceil(seconds / 60));
}

function buildLongformTitle(
  videoMode: FusionVideoMode,
  outputProfile: CinematicOutputProfile
): string {
  if (videoMode === "CINEMATIC_VIDEO_DIRECTION") {
    return outputProfile === "fast" ? "Fusion Studio • Cinematic Fast" : "Fusion Studio • Cinematic Premium";
  }
  return "Fusion Studio • Talking Video";
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

function normalizeIntentGoal(value: any): string {
  if (typeof value === "string") return clean(value);
  if (value && typeof value === "object") {
    return clean(value.goal || value.intent || value.prompt || "");
  }
  return "";
}

function normalizeDirectionPrompt(req: FusionCreateRequest): string | undefined {
  return (
    clean(req.video_prompt) ||
    clean(req.performance_prompt) ||
    clean(req.motion_prompt) ||
    clean(req.movement_prompt) ||
    clean(req.gesture_prompt) ||
    clean(req.body_motion_prompt) ||
    clean(req.emotion_prompt) ||
    clean(req.expression_prompt) ||
    clean(req.creative_direction) ||
    clean(req.user_prompt) ||
    clean(req.prompt) ||
    undefined
  );
}

function normalizeGoal(req: FusionCreateRequest): string | undefined {
  return clean(req.goal) || normalizeIntentGoal(req.intent) || normalizeDirectionPrompt(req) || undefined;
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

function normalizeRequestedDurationSec(req: FusionCreateRequest): number | undefined {
  const topLevelCandidates = [
    Number(req.requested_duration_sec ?? 0),
    Number(req.pricing_duration_sec ?? 0),
    Number(req.video_duration_sec ?? 0),
    Number((req.tags || {}).requested_duration_sec ?? 0),
    Number((req.tags || {}).pricing_duration_sec ?? 0),
    Number((req.tags || {}).video_duration_sec ?? 0),
    Number((req.tags || {}).duration_sec ?? 0),
  ];

  for (const value of topLevelCandidates) {
    if (Number.isFinite(value) && value > 0) return Math.ceil(value);
  }

  const nestedDurationSec = Number(req.video?.duration_sec ?? 0);
  if (Number.isFinite(nestedDurationSec) && nestedDurationSec > 0) return Math.ceil(nestedDurationSec);

  const nestedRequestedDurationSec = Number((req.video as any)?.requested_duration_sec ?? 0);
  if (Number.isFinite(nestedRequestedDurationSec) && nestedRequestedDurationSec > 0) return Math.ceil(nestedRequestedDurationSec);

  const nestedPricingDurationSec = Number((req.video as any)?.pricing_duration_sec ?? 0);
  if (Number.isFinite(nestedPricingDurationSec) && nestedPricingDurationSec > 0) return Math.ceil(nestedPricingDurationSec);

  const nestedVideoDurationSec = Number((req.video as any)?.video_duration_sec ?? 0);
  if (Number.isFinite(nestedVideoDurationSec) && nestedVideoDurationSec > 0) return Math.ceil(nestedVideoDurationSec);

  const durationMs = Number(req.video?.duration_ms ?? 0);
  if (Number.isFinite(durationMs) && durationMs > 0) return Math.ceil(durationMs / 1000);

  return undefined;
}

function normalizeDirectCreate(req: FusionCreateRequest): DirectFusionCreatePayload {
  const face_image_url = clean(req.face_image_url || req.image_url) || undefined;
  const face_artifact_id = resolveFaceArtifactId(req) || undefined;
  const audio_artifact_id = clean(req.audio_artifact_id || req.voice_audio?.audio_artifact_id) || undefined;
  const audio_url = clean(req.audio_url || req.voice_audio?.audio_url) || undefined;
  const videoMode = normalizeVideoMode(req);
  const provider = clean(req.provider) || (videoMode === "TALKING_VIDEO" ? talkingProviderForRequest(req) : undefined);
  const outputProfile = normalizeOutputProfile(req, videoMode);
  const qualityTier = firstClean(
    req.quality_tier,
    (req.tags || {}).quality_tier,
    videoMode === "CINEMATIC_VIDEO_DIRECTION"
      ? (outputProfile === "fast" ? "fast" : "premium")
      : (outputProfile === "economy" ? "economy" : "premium")
  );
  const providerHint = firstClean(
    req.provider_hint,
    (req.tags || {}).provider_hint,
    videoMode === "CINEMATIC_VIDEO_DIRECTION" ? "" : talkingProviderForRequest(req)
  );
  const scenarioName = firstClean(
    req.scenario_name,
    (req.tags || {}).scenario_name,
    videoMode === "CINEMATIC_VIDEO_DIRECTION"
      ? (outputProfile === "fast" ? "cinematic_fast" : "cinematic_premium")
      : (outputProfile === "economy" ? "talking_video_economy" : "talking_video_premium")
  );

  if (!face_image_url && !face_artifact_id) {
    throw new Error("Talking Video requires face_image_url or face_artifact_id.");
  }

  if (!audio_artifact_id && !audio_url) {
    throw new Error("Talking Video requires voice audio from Audio Studio.");
  }

  return {
    ...(face_image_url ? { face_image_url } : {}),
    ...(!face_image_url && face_artifact_id ? { face_artifact_id } : face_artifact_id ? { face_artifact_id } : {}),
    voice_mode: req.voice_mode === "tts" ? "tts" : "audio",
    ...(req.voice_mode === "tts" && req.voice_tts
      ? { voice_tts: req.voice_tts }
      : {
          voice_audio: {
            type: "audio",
            ...(audio_artifact_id ? { audio_artifact_id } : {}),
            ...(!audio_artifact_id && audio_url ? { audio_url } : {}),
          },
        }),
    video: req.video,
    output_profile: outputProfile,
    ...(qualityTier ? { quality_tier: qualityTier } : {}),
    ...(providerHint ? { provider_hint: providerHint } : {}),
    ...(scenarioName ? { scenario_name: scenarioName } : {}),
    ...(videoMode === "TALKING_VIDEO"
      ? {
          release_channel: TALKING_VIDEO_BETA_RELEASE ? "beta" : "general",
          beta_release: TALKING_VIDEO_BETA_RELEASE,
          execution_provider_family: providerHint === "kling" ? "kling_avatar" : "veed_fabric",
        }
      : {}),
    consent: { external_provider_ok: true },
    ...(provider ? { provider } : {}),
    ...(req.tags ? { tags: req.tags } : {}),
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

function normalizeCreate(req: FusionCreateRequest): LongformCreatePayload {
  const face_artifact_id = resolveFaceArtifactId(req);

  if (!face_artifact_id) {
    throw new Error(
      "Longform create: face_artifact_id is required. svc-fusion-extension requires a saved Face Studio result."
    );
  }

  const videoMode = normalizeVideoMode(req);
  const longformProfile = normalizeProfile(req, videoMode);
  const outputProfile = normalizeOutputProfile(req, videoMode);
  const qualityTier = firstClean(
    req.quality_tier,
    (req.tags || {}).quality_tier,
    videoMode === "CINEMATIC_VIDEO_DIRECTION"
      ? (outputProfile === "fast" ? "fast" : "premium")
      : (outputProfile === "economy" ? "economy" : "premium")
  );
  const providerHint = firstClean(
    req.provider_hint,
    (req.tags || {}).provider_hint,
    videoMode === "CINEMATIC_VIDEO_DIRECTION" ? "" : talkingProviderForRequest(req)
  );
  const scenarioName = firstClean(
    req.scenario_name,
    (req.tags || {}).scenario_name,
    videoMode === "CINEMATIC_VIDEO_DIRECTION"
      ? (outputProfile === "fast" ? "cinematic_fast" : "cinematic_premium")
      : (outputProfile === "economy" ? "talking_video_economy" : "talking_video_premium")
  );

  const camera_angle = clean(req.camera_angle || req.video?.camera_angle) || undefined;
  const camera_framing = clean(req.camera_framing || req.video?.camera_framing) || undefined;
  const camera_motion_style =
    clean(req.camera_motion_style || req.video?.camera_motion_style) || undefined;

  const goal = normalizeGoal(req);
  const directionPrompt = normalizeDirectionPrompt(req);
  const title = clean(req.title) || buildLongformTitle(videoMode, outputProfile);
  const requestedScriptText = normalizeScriptText(req);
  const fallbackNarrationText = requestedScriptText || goal || directionPrompt || undefined;

  if (videoMode === "CINEMATIC_VIDEO_DIRECTION" && !goal && !fallbackNarrationText) {
    throw new Error(
      "Longform create: Cinematic Video Direction requires a meaningful prompt or script."
    );
  }

  const audioArtifactId =
    clean(req.audio_artifact_id || req.voice_audio?.audio_artifact_id) || undefined;
  const audioUrl =
    clean(req.audio_url || req.voice_audio?.audio_url) || undefined;
  const hasProvidedAudio = Boolean(audioArtifactId || audioUrl);
  const requestedDurationSec = normalizeRequestedDurationSec(req);
  const durationSec = requestedDurationSec;
  const durationMs =
    req.video?.duration_ms != null ? Number(req.video.duration_ms) : undefined;

  const estimatedMinutes = requestedDurationSec
    ? Math.max(1, Math.ceil(requestedDurationSec / 60))
    : estimatedMinutesFromRequest(req);

  const tags: Record<string, any> = {
    ...(req.tags || {}),
    source: clean((req.tags || {}).source) || "fusion_studio",
    client_surface: clean((req.tags || {}).client_surface) || "fusion_studio",
    api_mode: videoMode === "CINEMATIC_VIDEO_DIRECTION" ? "directed" : "legacy",
    video_mode: videoMode,
    product_code: videoMode,
    longform_profile: longformProfile,
    requested_longform_profile: longformProfile,
    output_profile: outputProfile,
    ...(qualityTier ? { quality_tier: qualityTier } : {}),
    ...(providerHint ? { provider_hint: providerHint } : {}),
    ...(scenarioName ? { scenario_name: scenarioName } : {}),
    ...(face_artifact_id ? { face_artifact_id, selected_face_artifact_id: face_artifact_id, fusion_face_artifact_id: face_artifact_id } : {}),
    ...(req.background_mode ? { background_mode: req.background_mode } : {}),
    ...(camera_angle ? { camera_angle } : {}),
    ...(camera_framing ? { camera_framing } : {}),
    ...(camera_motion_style ? { camera_motion_style } : {}),
    ...(audioUrl ? { voice_audio_url: audioUrl, audio_url: audioUrl } : {}),
    ...(audioArtifactId ? { voice_audio_artifact_id: audioArtifactId, audio_artifact_id: audioArtifactId } : {}),
    ...(typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0
      ? {
          voice_audio_duration_sec: durationSec,
          audio_duration_sec: durationSec,
          duration_sec: durationSec,
          requested_duration_sec: durationSec,
          pricing_duration_sec: durationSec,
          video_duration_sec: durationSec,
          minutes: estimatedMinutes,
          requested_units: estimatedMinutes,
        }
      : {}),
    ...(typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
      ? { voice_audio_duration_ms: durationMs, audio_duration_ms: durationMs, duration_ms: durationMs }
      : {}),
    ...(!hasProvidedAudio && clean(req.audio_locale) ? { audio_locale: clean(req.audio_locale) } : {}),
    ...(!hasProvidedAudio && clean(req.audio_voice) ? { audio_voice: clean(req.audio_voice) } : {}),
    ...(goal ? { goal } : {}),
    ...(directionPrompt ? { direction_prompt: directionPrompt } : {}),
    ...(!hasProvidedAudio && fallbackNarrationText ? { script_text: fallbackNarrationText } : {}),
    ...(directionPrompt ? { prompt_preview: directionPrompt.slice(0, 160) } : {}),
  };

  return {
    face_artifact_id,
    title,
    aspect_ratio: (req.video?.aspect_ratio || "9:16") as AspectRatio,
    duration_sec: durationSec,
    requested_duration_sec: durationSec,
    pricing_duration_sec: durationSec,
    video_duration_sec: durationSec,
    minutes: estimatedMinutes,
    requested_units: estimatedMinutes,
    mode: videoMode === "CINEMATIC_VIDEO_DIRECTION" ? "directed" : "legacy",
    longform_profile: longformProfile,
    output_profile: outputProfile,
    ...(qualityTier ? { quality_tier: qualityTier } : {}),
    ...(providerHint ? { provider_hint: providerHint } : {}),
    ...(scenarioName ? { scenario_name: scenarioName } : {}),
    ...(!hasProvidedAudio ? { voice: normalizeVoiceConfig(req) } : {}),
    ...(hasProvidedAudio
      ? {
          voice_audio: {
            type: "audio",
            ...(audioArtifactId ? { audio_artifact_id: audioArtifactId } : {}),
            ...(audioUrl ? { audio_url: audioUrl } : {}),
          },
        }
      : {}),
    ...((requestedScriptText || (!hasProvidedAudio && fallbackNarrationText))
      ? { script_text: requestedScriptText || fallbackNarrationText }
      : {}),
    ...(camera_angle ? { camera_angle } : {}),
    ...(camera_framing ? { camera_framing } : {}),
    ...(camera_motion_style ? { camera_motion_style } : {}),
    ...(goal ? { goal } : {}),
    scenario_type: mapVideoTypeToScenarioType(clean(req.video_type) || undefined, videoMode),
    external_provider_ok: true,
    consent: { external_provider_ok: true },
    ...(clean(req.provider) ? { provider: clean(req.provider) } : {}),
    require_subtitles: true,
    max_repair_rounds: 1,
    tags,
    video: {
      aspect_ratio: (req.video?.aspect_ratio || "9:16") as AspectRatio,
      duration_sec: durationSec,
      requested_duration_sec: durationSec,
      pricing_duration_sec: durationSec,
      video_duration_sec: durationSec,
      ...(camera_angle ? { camera_angle } : {}),
      ...(camera_framing ? { camera_framing } : {}),
      ...(camera_motion_style ? { camera_motion_style } : {}),
      profile: longformProfile,
      video_mode: videoMode,
    },
    intent: {
      ...(goal ? { goal } : {}),
      ...(directionPrompt ? { prompt: directionPrompt } : {}),
      ...(typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0 ? { duration_sec: durationSec } : {}),
    },
    ...(audioArtifactId ? { audio_artifact_id: audioArtifactId } : {}),
    ...(audioUrl ? { audio_url: audioUrl } : {}),
    assets: {
      face_artifact_id,
      ...(audioArtifactId
        ? {
            voice_audio_artifact_id: audioArtifactId,
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


function isInternalSuppressedPricing(pricing: any): boolean {
  const state = String(pricing?.state ?? "").toLowerCase();
  const billingMode = String(pricing?.billing_mode ?? pricing?.billingMode ?? "").toLowerCase();
  const settlementMode = String(pricing?.settlement_mode ?? pricing?.settlementMode ?? "").toLowerCase();
  return (
    state === "suppressed" ||
    billingMode === "internal" ||
    settlementMode === "internal" ||
    pricing?.suppressed === true ||
    pricing?.pricing_suppressed === true ||
    pricing?.suppress_pricing === true
  );
}

function artifactUrl(raw: any, kinds: string[]): string | null {
  const artifacts = Array.isArray(raw?.artifacts) ? raw.artifacts : [];
  const wanted = kinds.map((k) => clean(k).toLowerCase()).filter(Boolean);
  for (const artifact of artifacts) {
    const kind = clean(artifact?.kind).toLowerCase();
    const url = clean(artifact?.url);
    if (!url) continue;
    if (wanted.includes(kind) || wanted.some((k) => kind.includes(k))) return url;
  }
  return null;
}

function normalizeJobView(raw: any): FusionJobView {
  const artifactVideoUrl = artifactUrl(raw, ["video", "final_video", "resolved_video_sas_url", "resolved_video_url"]);
  const finalVideoUrl =
    clean(raw?.final_video_url) ||
    clean(raw?.output_video_url) ||
    clean(raw?.share_url) ||
    clean(raw?.video_url) ||
    clean(raw?.result?.video_url) ||
    artifactVideoUrl ||
    null;

  const rawPricing = raw?.pricing ?? null;
  const hidePricing = isInternalSuppressedPricing(rawPricing);

  return {
    ...raw,
    job_id: String(raw?.job_id || raw?.id || ""),
    final_video_url: finalVideoUrl,
    output_video_url: clean(raw?.output_video_url) || finalVideoUrl,
    share_url: clean(raw?.share_url) || finalVideoUrl,
    pricing: hidePricing ? null : rawPricing,
    pricing_summary: hidePricing ? null : raw?.pricing_summary ?? raw?.pricingSummary ?? null,
    run_receipt: hidePricing ? null : raw?.run_receipt ?? raw?.runReceipt ?? null,
    runReceipt: hidePricing ? null : raw?.runReceipt ?? raw?.run_receipt ?? null,
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

function isCinematicVideoMode(req: FusionCreateRequest): boolean {
  return normalizeVideoMode(req) === "CINEMATIC_VIDEO_DIRECTION";
}

export async function previewFusionPricing(
  req: FusionCreateRequest
): Promise<StudioPricingPreviewResponse> {
  try {
    assertSupportedFusionMode(req);
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
    assertSupportedFusionMode(req);
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

export async function apiGetFusionJob(jobId: string, _videoMode: FusionVideoMode | string = "CINEMATIC_VIDEO_DIRECTION"): Promise<FusionJobView> {
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
