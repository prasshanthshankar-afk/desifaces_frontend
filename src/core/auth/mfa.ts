
export type MfaMethod = "email_otp" | "totp" | "sms_otp";
export type MfaPurpose = "login" | "register" | "change_password";

export type PendingMfaChallenge = {
  purpose: MfaPurpose;
  email?: string;
  challengeId?: string;
  challengeToken?: string;
  method: MfaMethod;
  maskedDestination?: string;
  expiresIn?: number | null;
};

type AnyObj = Record<string, any>;

export function maskEmail(email?: string) {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

function normalizeMethod(value: any): MfaMethod {
  if (value === "totp") return "totp";
  if (value === "sms_otp") return "sms_otp";
  return "email_otp";
}

export function isMfaRequiredResponse(resp: any): boolean {
  const r = (resp ?? {}) as AnyObj;
  const detail = String(
    r.detail?.code ||
    r.detail?.error ||
    r.detail ||
    r.error_code ||
    r.code ||
    ""
  ).toLowerCase();

  return !!(
    r.mfa_required ||
    r.status === "mfa_required" ||
    r.status === "pending_email_verification" ||
    r.challenge_id ||
    r.verification_challenge_id ||
    r.challenge?.id ||
    r.challenge_token ||
    r.mfa_token ||
    r.challenge?.token ||
    detail === "email_verification_required"
  );
}

export function extractMfaChallenge(
  resp: any,
  fallback: { purpose: MfaPurpose; email?: string }
): PendingMfaChallenge {
  const r = (resp ?? {}) as AnyObj;

  const challengeId =
    r.challenge_id ||
    r.verification_challenge_id ||
    r.challenge?.id ||
    "";

  const challengeToken =
    r.challenge_token ||
    r.mfa_token ||
    r.challenge?.token ||
    r.token ||
    "";

  if (!challengeId && !challengeToken) {
    throw new Error("Verification was required but the challenge identifier was missing.");
  }

  const rawPurpose =
    r.purpose ||
    r.challenge?.purpose ||
    r.verification_purpose ||
    fallback.purpose;

  const purpose: MfaPurpose =
    rawPurpose === "change_password"
      ? "change_password"
      : rawPurpose === "register"
      ? "register"
      : "login";

  const expiresInValue =
    typeof r.expires_in === "number"
      ? r.expires_in
      : typeof r.challenge?.expires_in === "number"
      ? r.challenge.expires_in
      : null;

  return {
    purpose,
    email: r.email || fallback.email,
    challengeId: challengeId || undefined,
    challengeToken: challengeToken || undefined,
    method: normalizeMethod(r.method || r.mfa_method || r.challenge?.method),
    maskedDestination:
      r.masked_destination ||
      r.destination ||
      r.masked_email ||
      r.challenge?.masked_destination ||
      maskEmail(r.email || fallback.email),
    expiresIn: expiresInValue,
  };
}
