// src/features/auth/authOtpClient.ts
declare const process: { env?: Record<string, string | undefined> };

// OTP-first auth helpers used by native/mobile auth screens.
// Customer-facing reset uses email OTP, not emailed reset links.

export type OtpStartResponse = {
  ok: boolean;
  status?: string;
  challenge_id?: string;
  challengeId?: string;
  expires_in?: number;
  expiresIn?: number;
  resend_after_seconds?: number;
  resendAfterSeconds?: number;
  dev_email_otp_code?: string | null;
};

export type PasswordResetConfirmResponse = {
  ok: boolean;
  status?: string;
  sessions_revoked?: boolean;
  reauth_required?: boolean;
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_CORE_BASE_URL = "https://api.desifaces.ai/core";

function envValue(name: string): string | undefined {
  try {
    return (process.env as Record<string, string | undefined> | undefined)?.[name];
  } catch {
    return undefined;
  }
}

function coreBaseUrl(): string {
  const raw =
    envValue("EXPO_PUBLIC_CORE_BASE_URL") ||
    envValue("EXPO_PUBLIC_AUTH_BASE_URL") ||
    envValue("EXPO_PUBLIC_API_CORE_URL") ||
    envValue("EXPO_PUBLIC_API_BASE_URL") ||
    DEFAULT_CORE_BASE_URL;

  return String(raw || DEFAULT_CORE_BASE_URL).replace(/\/+$/, "");
}

function authUrl(path: string): string {
  const base = coreBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readErrorMessage(status: number, payload: unknown, fallback: string): string {
  const record = asRecord(payload);
  const detail = record.detail;

  if (typeof detail === "string" && detail.trim()) {
    switch (detail) {
      case "invalid_email_otp":
        return "The code is incorrect. Please check the email and try again.";
      case "email_otp_expired":
        return "The code expired. Please request a new code.";
      case "invalid_or_used_email_otp":
      case "invalid_email_otp_challenge":
        return "This verification session is no longer valid. Please request a new code.";
      case "email_otp_max_attempts_exceeded":
        return "Too many attempts. Please request a new code.";
      case "invalid_current_password":
        return "The current password is incorrect.";
      default:
        return detail.replace(/_/g, " ");
    }
  }

  if (detail && typeof detail === "object") {
    const code = asRecord(detail).code;
    if (typeof code === "string" && code.trim()) {
      return code.replace(/_/g, " ");
    }
  }

  if (status === 429) {
    return "Please wait before requesting another code.";
  }

  return fallback;
}

async function postJson<T>(path: string, body: JsonRecord, fallback: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(authUrl(path), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Unable to reach DesiFaces. Check your connection and try again.");
  }

  const text = await response.text();
  let payload: unknown = null;

  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(readErrorMessage(response.status, payload, fallback));
  }

  return (payload ?? {}) as T;
}

export function normalizeChallengeId(result: OtpStartResponse): string | null {
  const value = result.challenge_id ?? result.challengeId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeExpiresIn(result: OtpStartResponse, fallback = 300): number {
  const value = result.expires_in ?? result.expiresIn;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

export function normalizeResendAfterSeconds(result: OtpStartResponse, fallback = 60): number {
  const value = result.resend_after_seconds ?? result.resendAfterSeconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

export async function startPasswordReset(email: string): Promise<OtpStartResponse> {
  return postJson<OtpStartResponse>(
    "/api/auth/password/reset/start",
    { email: email.trim() },
    "Unable to send verification code. Please try again."
  );
}

export async function confirmPasswordReset(input: {
  challengeId: string;
  code: string;
  newPassword: string;
}): Promise<PasswordResetConfirmResponse> {
  return postJson<PasswordResetConfirmResponse>(
    "/api/auth/password/reset/confirm",
    {
      challenge_id: input.challengeId.trim(),
      code: input.code.trim(),
      new_password: input.newPassword,
    },
    "Unable to reset password. Please check the code and try again."
  );
}
