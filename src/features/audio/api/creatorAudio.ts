import { api } from "../../../core/api/client";
import { endpoints } from "../../../core/api/endpoints";
import { AUDIO_BASE } from "../../../core/config/env";
import type {
  StudioPricingConfirmation,
  StudioPricingPreviewResponse,
} from "../../../core/pricing/pricePreview";
import { normalizePricingErrorForUser } from "../../../core/pricing/studioAffordability";

export type TTSCreateRequest = {
  text: string;
  target_locale: string;
  source_language?: string | null;
  translate?: boolean;
  voice?: string | null;
  style?: string | null;
  style_degree?: number | null;
  rate?: number | null;
  pitch?: number | null;
  volume?: number | null;
  context?: string | null;
  output_format?: string;
  pricing_confirmation?: StudioPricingConfirmation;
};

export type VariantAudio = {
  audio_url: string;
  artifact_id?: string | null;
  content_type?: string | null;
  bytes?: number | null;
};

export type JobCreatedResponse = {
  job_id: string;
  status?: string;
  message?: string | null;
  estimated_completion_time?: string | null;
  pricing?: Record<string, any> | null;
  pricing_summary?: Record<string, any> | null;
};

export type JobStatusResponse = {
  job_id: string;
  status: string;
  error_code?: string | null;
  error_message?: string | null;
  variants?: VariantAudio[];
  payload?: Record<string, any> | null;
  pricing?: Record<string, any> | null;
  pricing_summary?: Record<string, any> | null;
};

function pickErrorMessage(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (typeof error?.body?.message === "string" && error.body.message.trim()) {
    return error.body.message;
  }
  if (typeof error?.message === "string" && error.message.trim()) {
    return error.message;
  }
  return "Unknown error";
}

function rethrowFriendly(prefix: string, error: any): never {
  if (String(error?.message) === "AUTH_REQUIRED") throw error;

  const normalized = normalizePricingErrorForUser(error, "Audio");
  if (normalized.toLowerCase().includes("not enough credits")) {
    throw new Error(normalized);
  }

  throw new Error(`${prefix}: ${pickErrorMessage(error)}`);
}

function getAudioPreviewPath(): string {
  return (
    (endpoints as any)?.audio?.pricingPreview ||
    (endpoints as any)?.audio?.pricingPreviewCandidates?.[0] ||
    "/api/audio/tts/pricing/preview"
  );
}

function getAudioTtsCreatePath(): string {
  return (endpoints as any)?.audio?.tts || "/api/audio/tts";
}

function getAudioStatusPath(jobId: string): string {
  const statusFn = (endpoints as any)?.audio?.jobs?.status;
  return typeof statusFn === "function"
    ? statusFn(jobId)
    : `/api/audio/jobs/${encodeURIComponent(jobId)}/status`;
}

function buildPreviewRequest(
  payload: Omit<TTSCreateRequest, "pricing_confirmation">
): Omit<TTSCreateRequest, "pricing_confirmation"> {
  return {
    text: payload.text,
    target_locale: payload.target_locale,
    source_language: payload.source_language ?? undefined,
    translate: payload.translate ?? undefined,
    voice: payload.voice ?? undefined,
    style: payload.style ?? undefined,
    style_degree: payload.style_degree ?? undefined,
    rate: payload.rate ?? undefined,
    pitch: payload.pitch ?? undefined,
    volume: payload.volume ?? undefined,
    context: payload.context ?? undefined,
    output_format: payload.output_format ?? undefined,
  };
}

function buildCreateRequest(
  payload: TTSCreateRequest,
  pricingConfirmation?: StudioPricingConfirmation | null
): TTSCreateRequest {
  const body: TTSCreateRequest = {
    text: payload.text,
    target_locale: payload.target_locale,
    source_language: payload.source_language ?? undefined,
    translate: payload.translate ?? undefined,
    voice: payload.voice ?? undefined,
    style: payload.style ?? undefined,
    style_degree: payload.style_degree ?? undefined,
    rate: payload.rate ?? undefined,
    pitch: payload.pitch ?? undefined,
    volume: payload.volume ?? undefined,
    context: payload.context ?? undefined,
    output_format: payload.output_format ?? undefined,
  };

  if (pricingConfirmation?.quote_id) {
    body.pricing_confirmation = {
      quote_id: pricingConfirmation.quote_id,
      ...(pricingConfirmation.preview_fingerprint
        ? { preview_fingerprint: pricingConfirmation.preview_fingerprint }
        : {}),
    };
  }

  return body;
}

export async function previewAudioTtsPricing(
  payload: Omit<TTSCreateRequest, "pricing_confirmation">
): Promise<StudioPricingPreviewResponse> {
  try {
    return await api.post<StudioPricingPreviewResponse>(
      AUDIO_BASE,
      getAudioPreviewPath(),
      buildPreviewRequest(payload)
    );
  } catch (error: any) {
    rethrowFriendly("Audio pricing preview failed", error);
  }
}

export async function apiCreateTtsJob(
  payload: TTSCreateRequest,
  pricingConfirmation?: StudioPricingConfirmation | null
): Promise<JobCreatedResponse> {
  try {
    return await api.post<JobCreatedResponse>(
      AUDIO_BASE,
      getAudioTtsCreatePath(),
      buildCreateRequest(payload, pricingConfirmation ?? payload.pricing_confirmation ?? null)
    );
  } catch (error: any) {
    rethrowFriendly("Create TTS job failed", error);
  }
}

export async function apiGetTtsJobStatus(jobId: string): Promise<JobStatusResponse> {
  if (!jobId) throw new Error("Missing jobId");

  try {
    return await api.get<JobStatusResponse>(AUDIO_BASE, getAudioStatusPath(jobId));
  } catch (error: any) {
    rethrowFriendly("TTS status failed", error);
  }
}