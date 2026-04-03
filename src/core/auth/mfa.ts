export type MfaMethod = "email_otp" | "totp" | "sms_otp";
export type MfaPurpose = "login" | "register" | "change_password";

export type PendingMfaChallenge = {
  purpose: MfaPurpose;
  email?: string;
  challengeToken: string;
  method: MfaMethod;
  maskedDestination?: string;
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
  return !!(
    r.mfa_required ||
    r.status === "mfa_required" ||
    r.challenge_token ||
    r.mfa_token ||
    r.challenge?.token
  );
}

export function extractMfaChallenge(
  resp: any,
  fallback: { purpose: MfaPurpose; email?: string }
): PendingMfaChallenge {
  const r = (resp ?? {}) as AnyObj;

  const challengeToken =
    r.challenge_token ||
    r.mfa_token ||
    r.challenge?.token ||
    r.token ||
    "";

  if (!challengeToken) {
    throw new Error("MFA was required but the challenge token was missing.");
  }

  return {
    purpose: fallback.purpose,
    email: r.email || fallback.email,
    challengeToken,
    method: normalizeMethod(r.method || r.mfa_method || r.challenge?.method),
    maskedDestination:
      r.masked_destination ||
      r.destination ||
      r.masked_email ||
      maskEmail(r.email || fallback.email),
  };
}