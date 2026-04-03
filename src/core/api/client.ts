import { tokenStore } from "../auth/tokenStore";
import { CORE_BASE } from "../config/env";
import { endpoints } from "./endpoints";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Join base + path safely, avoiding double slashes and missing slashes. */
function joinUrl(base: string, path: string) {
  const b = (base || "").replace(/\/+$/, "");
  const p = (path || "").startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { controller, cancel: () => clearTimeout(t) };
}

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== "undefined" && body instanceof FormData;
}

/** Try to extract a human readable error from FastAPI-ish responses. */
function extractErrorDetail(parsed: any, rawText: string) {
  const p = parsed ?? null;

  const detail =
    p?.message ||
    p?.error_message ||
    p?.error ||
    p?.detail ||
    p?.msg ||
    null;

  if (typeof detail === "string" && detail.trim()) return detail.trim();

  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    const msg = first?.msg || first?.message || JSON.stringify(first);
    return String(msg).slice(0, 500);
  }

  if (rawText && rawText.trim()) return rawText.trim().slice(0, 500);

  return "no_body";
}

function authFailureText(parsed: any, rawText: string) {
  const parts: string[] = [];

  const push = (value: unknown) => {
    if (typeof value === "string" && value.trim()) parts.push(value.trim());
  };

  push(parsed?.message);
  push(parsed?.error_message);
  push(parsed?.error);
  push(parsed?.detail);

  if (parsed?.detail && typeof parsed.detail === "object") {
    push(parsed.detail?.message);
    push(parsed.detail?.error);
    push(parsed.detail?.reason);
  }

  if (rawText && rawText.trim()) push(rawText.trim());

  return parts.join(" | ").toLowerCase();
}

function isAuthFailureResponse(status: number, parsed: any, rawText: string) {
  if (status === 401) return true;

  const text = authFailureText(parsed, rawText);
  if (!text) return false;

  return (
    /auth_required/.test(text) ||
    /invalid_token/.test(text) ||
    /signature has expired/.test(text) ||
    /session expired/.test(text) ||
    /expired signature/.test(text) ||
    /unauthorized/.test(text)
  );
}

// --------------------
// Auth lifecycle hooks
// --------------------

let refreshInFlight: Promise<boolean> | null = null;
let onAuthFailed: (() => void) | null = null;

export function setOnAuthFailed(cb: (() => void) | null) {
  onAuthFailed = cb;
}

let authReady = false;
export function apiSetAuthReady(ready: boolean) {
  authReady = ready;
}

async function waitForAuthReady(maxMs = 1200) {
  if (authReady) return;
  const started = Date.now();
  while (!authReady && Date.now() - started < maxMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = await tokenStore.getRefresh();
    if (!refresh) return false;

    const { controller, cancel } = withTimeout(12000);

    try {
      const url = joinUrl(CORE_BASE, endpoints.core.auth.refresh);

      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });

      const text = await res.text();
      const parsed = text ? safeJson(text) : null;

      if (!res.ok) return false;

      if (parsed?.access_token && parsed?.refresh_token) {
        await tokenStore.setAccess(parsed.access_token);
        await tokenStore.setRefresh(parsed.refresh_token);
        return true;
      }

      return false;
    } catch {
      return false;
    } finally {
      cancel();
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// --------------------
// Core request machinery
// --------------------

type RawResponse<T> = {
  ok: boolean;
  status: number;
  url: string;
  headers: Headers;
  text: string;
  parsed: any;
  data: T | null;
};

async function requestRaw<T>(
  baseUrl: string,
  method: HttpMethod,
  path: string,
  body?: unknown,
  options?: {
    retry401?: boolean;
    timeoutMs?: number;
    headers?: Record<string, string>;
  }
): Promise<RawResponse<T>> {
  const retry401 = options?.retry401 ?? true;
  const timeoutMs = options?.timeoutMs ?? 20000;

  await waitForAuthReady();

  const token = await tokenStore.getAccess();
  const { controller, cancel } = withTimeout(timeoutMs);
  const url = joinUrl(baseUrl, path);

  const bodyIsForm = isFormData(body);

  const headers: Record<string, string> = {
    ...(options?.headers ?? {}),
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !bodyIsForm) headers["Content-Type"] = "application/json";

  const fetchBody =
    body === undefined ? undefined : bodyIsForm ? (body as any) : JSON.stringify(body);

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers,
      body: fetchBody,
    });

    const text = await res.text();
    cancel();

    const parsed = text ? safeJson(text) : null;
    const authFailure = isAuthFailureResponse(res.status, parsed, text);

    if (authFailure && retry401) {
      const ok = await refreshAccessToken();
      if (ok) {
        return requestRaw<T>(baseUrl, method, path, body, {
          ...options,
          retry401: false,
        });
      }

      await tokenStore.clearAll();
      try {
        onAuthFailed?.();
      } catch {
        // ignore
      }
      throw new Error("AUTH_REQUIRED");
    }

    if (authFailure) {
      await tokenStore.clearAll();
      try {
        onAuthFailed?.();
      } catch {
        // ignore
      }
      throw new Error("AUTH_REQUIRED");
    }

    return {
      ok: res.ok,
      status: res.status,
      url,
      headers: res.headers,
      text,
      parsed,
      data: (parsed ?? null) as T | null,
    };
  } catch (e: any) {
    cancel();

    if (String(e?.message) === "AUTH_REQUIRED") {
      throw e;
    }

    const detail = e?.message || String(e);
    const isAbort =
      typeof detail === "string" &&
      (detail.toLowerCase().includes("aborted") || detail.toLowerCase().includes("aborterror"));

    throw new ApiError(
      isAbort
        ? `Request timed out calling ${method} ${url}`
        : `Network error calling ${method} ${url}`,
      0,
      detail
    );
  }
}

async function request<T>(
  baseUrl: string,
  method: HttpMethod,
  path: string,
  body?: unknown,
  options?: {
    timeoutMs?: number;
    headers?: Record<string, string>;
  }
): Promise<T> {
  const raw = await requestRaw<T>(baseUrl, method, path, body, {
    retry401: true,
    timeoutMs: options?.timeoutMs,
    headers: options?.headers,
  });

  if (!raw.ok) {
    const detail = extractErrorDetail(raw.parsed, raw.text);
    const msg = `HTTP ${raw.status} ${method} ${path} :: ${detail}`;

    console.log("DF_API_ERR", {
      url: raw.url,
      status: raw.status,
      detail,
    });

    throw new ApiError(msg, raw.status, raw.parsed ?? raw.text);
  }

  return (raw.data ?? (null as unknown)) as T;
}

// --------------------
// Public API surface
// --------------------

export const api = {
  get: <T>(baseUrl: string, path: string, opts?: { headers?: Record<string, string>; timeoutMs?: number }) =>
    request<T>(baseUrl, "GET", path, undefined, opts),

  post: <T>(baseUrl: string, path: string, body?: unknown, opts?: { headers?: Record<string, string>; timeoutMs?: number }) =>
    request<T>(baseUrl, "POST", path, body, opts),

  put: <T>(baseUrl: string, path: string, body?: unknown, opts?: { headers?: Record<string, string>; timeoutMs?: number }) =>
    request<T>(baseUrl, "PUT", path, body, opts),

  patch: <T>(baseUrl: string, path: string, body?: unknown, opts?: { headers?: Record<string, string>; timeoutMs?: number }) =>
    request<T>(baseUrl, "PATCH", path, body, opts),

  del: <T>(baseUrl: string, path: string, opts?: { headers?: Record<string, string>; timeoutMs?: number }) =>
    request<T>(baseUrl, "DELETE", path, undefined, opts),

  getRaw: <T>(baseUrl: string, path: string, opts?: { headers?: Record<string, string>; timeoutMs?: number }) =>
    requestRaw<T>(baseUrl, "GET", path, undefined, { headers: opts?.headers, timeoutMs: opts?.timeoutMs }),
};
