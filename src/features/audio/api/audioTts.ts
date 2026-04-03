import { AUDIO_BASE } from "../../../core/config/env";

export type TTSCreateRequest = {
  text: string;
  target_locale: string;

  source_language?: string | null;
  translate?: boolean; // default true

  voice?: string | null;
  style?: string | null;
  style_degree?: number | null;

  rate?: number | null;
  pitch?: number | null;
  volume?: number | null;

  context?: string | null;
  output_format?: string; // default "mp3"
};

export type JobCreatedResponse = { job_id: string; status?: string };

export type VariantAudio = {
  audio_url: string;
  artifact_id?: string | null;
  content_type?: string | null;
  bytes?: number | null;
};

export type JobStatusResponse = {
  job_id: string;
  status: string;
  error_code?: string | null;
  error_message?: string | null;
  variants?: VariantAudio[];
  payload?: Record<string, any>;
};

function base() {
  return (AUDIO_BASE || "").replace(/\/$/, "");
}

async function authJson<T>(url: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401) {
    const err = new Error("UNAUTHORIZED");
    (err as any).code = "UNAUTHORIZED";
    throw err;
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Request failed (${res.status})`);
  }

  return (await res.json()) as T;
}

export async function apiCreateTtsJob(token: string | undefined, req: TTSCreateRequest) {
  return authJson<JobCreatedResponse>(`${base()}/api/audio/tts`, token, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function apiGetTtsJobStatus(token: string | undefined, jobId: string) {
  return authJson<JobStatusResponse>(`${base()}/api/audio/jobs/${jobId}/status`, token);
}