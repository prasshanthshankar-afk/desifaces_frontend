// src/core/api/http.ts
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type HttpRequestBody = JsonObject | FormData | Blob | string | null;

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function hasContentType(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
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

    if (typeof obj.error === "string" && obj.error.trim()) {
      return obj.error;
    }
  }

  return fallback;
}

export async function apiRequest<T>({
  baseUrl,
  path,
  method = "GET",
  headers = {},
  body,
}: {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: HttpRequestBody;
}): Promise<T> {
  const isJsonBody =
    body != null &&
    !(body instanceof FormData) &&
    !(body instanceof Blob) &&
    typeof body !== "string";

  const response = await fetch(joinUrl(baseUrl, path), {
    method,
    headers: {
      ...(!hasContentType(headers) && isJsonBody ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body:
      body == null
        ? undefined
        : isJsonBody
        ? JSON.stringify(body)
        : body,
  });

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessage(payload, `Request failed with status ${response.status}`),
      response.status,
      payload
    );
  }

  return payload as T;
}

export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token.trim()}`,
  };
}

export function pricingHeaders(
  token: string,
  userId: string,
  countryCode?: string | null
): Record<string, string> {
  const cc = (countryCode || "").trim().toUpperCase();

  return {
    Authorization: `Bearer ${token.trim()}`,
    "X-User-Id": userId.trim(),
    ...(cc ? { "X-Country-Code": cc } : {}),
  };
}