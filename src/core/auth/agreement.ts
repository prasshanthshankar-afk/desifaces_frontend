export const DESIFACES_AGREEMENT_VERSION = "2026-03-17";
export const DESIFACES_TERMS_URL = "https://desifaces.ai/terms";
export const DESIFACES_PRIVACY_URL = "https://desifaces.ai/privacy";

export type AgreementAcceptance = {
  version: string;
  accepted_at: string;
  source: "mobile";
  terms_url: string;
  privacy_url: string;
};

export function buildAgreementAcceptance(
  accepted: boolean
): AgreementAcceptance | undefined {
  if (!accepted) return undefined;

  return {
    version: DESIFACES_AGREEMENT_VERSION,
    accepted_at: new Date().toISOString(),
    source: "mobile",
    terms_url: DESIFACES_TERMS_URL,
    privacy_url: DESIFACES_PRIVACY_URL,
  };
}