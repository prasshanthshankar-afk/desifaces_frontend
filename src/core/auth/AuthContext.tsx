
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as Device from "expo-device";
import { router, type Href } from "expo-router";

import { api, apiSetAuthReady, setOnAuthFailed } from "../api/client";
import { endpoints } from "../api/endpoints";
import { CORE_BASE } from "../config/env";
import { tokenStore } from "./tokenStore";
import { buildAgreementAcceptance, DESIFACES_AGREEMENT_VERSION } from "./agreement";
import type { PendingMfaChallenge } from "./mfa";
import { extractMfaChallenge, isMfaRequiredResponse } from "./mfa";
import {
  clearActiveAuthEmail,
  initializeFreePlanForEmail,
  setActiveAuthEmail,
  setPlanFlash,
} from "../pricing/localPlanState";
import { clearCreateFlowContext, clearCreateFlowContextForOwnerMismatch } from "../media/createFlow";
import { resetCreatorFlow, setCreatorFlowOwner } from "../flow/creatorFlowStore";


type FetchResponseShape = {
  status: number;
  ok: boolean;
  json: () => Promise<any>;
  text: () => Promise<string>;
};

declare const fetch: (input: string, init?: Record<string, any>) => Promise<FetchResponseShape>;
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number): unknown;

type AnyObj = Record<string, any>;

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
};

type AuthResponse = TokenResponse & AnyObj;

type PasswordChangeStartResponse = {
  status?: string;
  challenge_id?: string;
  masked_destination?: string | null;
  expires_in?: number | null;
} & AnyObj;

type PasswordChangeConfirmRequest = {
  challengeId: string;
  code: string;
  newPassword: string;
};

type PasswordChangeChallenge = {
  challengeId: string;
  maskedDestination?: string | null;
  expiresIn?: number | null;
};

type AuthIdentity = {
  email: string | null;
  userId: string | null;
  fullName: string | null;
  displayName: string | null;
  user: AnyObj | null;
  profile: AnyObj | null;
};

type AuthCtx = {
  token: string | null;
  isReady: boolean;
  isAuthed: boolean;
  email: string | null;
  userId: string | null;
  fullName: string | null;
  displayName: string | null;
  user: AnyObj | null;
  profile: AnyObj | null;

  mfaChallenge: PendingMfaChallenge | null;

  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName?: string,
    agreementAccepted?: boolean
  ) => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  resendMfaChallenge: () => Promise<void>;
  clearMfaChallenge: () => void;

  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  startPasswordChange: (currentPassword: string) => Promise<PasswordChangeChallenge>;
  confirmPasswordChange: (params: PasswordChangeConfirmRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
};

const Ctx = createContext<AuthCtx | null>(null);

const AUTH_LOGIN_ROUTE = "/(auth)/login" as Href;
const AUTH_MFA_ROUTE = "/(auth)/mfa" as Href;
const DASHBOARD_ROUTE = "/(tabs)/dashboard" as Href;

const EMPTY_IDENTITY: AuthIdentity = {
  email: null,
  userId: null,
  fullName: null,
  displayName: null,
  user: null,
  profile: null,
};

function joinUrl(base: string, path: string) {
  const b = (base || "").replace(/\/+$/, "");
  const p = (path || "").startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^function\b/i.test(text)) return null;
  return text;
}

function isRecord(value: unknown): value is AnyObj {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
}

function titleCaseFromEmail(email?: string | null) {
  const raw = cleanText(email);
  if (!raw || !raw.includes("@")) return null;

  const local = raw.split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!local) return null;

  return local
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractProfileObject(source: unknown): AnyObj | null {
  if (!isRecord(source)) return null;

  const directCandidates = [
    source.user,
    source.profile,
    source.me,
    source.account,
    source.member,
  ];
  for (const candidate of directCandidates) {
    if (isRecord(candidate)) return candidate;
  }

  if (isRecord(source.data)) {
    const nestedCandidates = [
      source.data.user,
      source.data.profile,
      source.data.me,
      source.data.account,
      source.data.member,
    ];
    for (const candidate of nestedCandidates) {
      if (isRecord(candidate)) return candidate;
    }
  }

  return source;
}

function resolveUserId(source: unknown): string | null {
  const root = isRecord(source) ? source : null;
  const profile = extractProfileObject(source);
  return firstNonEmpty(
    profile?.id,
    profile?.user_id,
    profile?.userId,
    root?.id,
    root?.user_id,
    root?.userId,
    root?.sub
  );
}

function resolveIdentity(source: unknown, fallbackEmail?: string | null): AuthIdentity {
  const root = isRecord(source) ? source : null;
  const profile = extractProfileObject(source);

  const firstName = firstNonEmpty(
    profile?.first_name,
    profile?.firstName,
    root?.first_name,
    root?.firstName
  );
  const lastName = firstNonEmpty(
    profile?.last_name,
    profile?.lastName,
    root?.last_name,
    root?.lastName
  );
  const stitchedFullName = [firstName, lastName].filter(Boolean).join(" ").trim() || null;

  const fullName = firstNonEmpty(
    profile?.full_name,
    profile?.fullName,
    root?.full_name,
    root?.fullName,
    profile?.name,
    root?.name,
    profile?.display_name,
    profile?.displayName,
    root?.display_name,
    root?.displayName,
    stitchedFullName
  );

  const email = firstNonEmpty(
    profile?.email,
    root?.email,
    profile?.user_email,
    root?.user_email,
    fallbackEmail
  );

  const displayName = firstNonEmpty(
    fullName,
    profile?.username,
    root?.username,
    profile?.handle,
    root?.handle,
    titleCaseFromEmail(email)
  );

  return {
    email,
    userId: resolveUserId(profile || root),
    fullName,
    displayName,
    user: profile,
    profile,
  };
}

class AuthHttpError extends Error {
  status: number;
  payload: AnyObj | null;

  constructor(status: number, message: string, payload?: AnyObj | null) {
    super(message);
    this.status = status;
    this.payload = payload ?? null;
  }
}

function getProfileFetchPaths(): string[] {
  const e = endpoints as any;
  const paths = [
    e?.core?.auth?.me,
    "/api/auth/me",
  ];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of paths) {
    const path = cleanText(value);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}

function getRefreshFetchPaths(): string[] {
  const e = endpoints as any;
  const paths = [
    e?.core?.auth?.refresh,
    "/api/auth/refresh",
  ];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of paths) {
    const path = cleanText(value);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}

function getVerifyMfaPath() {
  return (
    cleanText((endpoints as any)?.core?.auth?.verifyMfa) ||
    cleanText((endpoints as any)?.core?.auth?.mfaVerify) ||
    "/api/auth/mfa/verify"
  );
}

function getVerifyRegisterEmailPath() {
  return (
    cleanText((endpoints as any)?.core?.auth?.verifyRegisterEmail) ||
    cleanText((endpoints as any)?.core?.auth?.registerVerifyEmail) ||
    cleanText((endpoints as any)?.core?.auth?.verifyEmail) ||
    "/api/auth/register/verify-email"
  );
}

function getResendRegisterEmailCodePath() {
  return (
    cleanText((endpoints as any)?.core?.auth?.resendRegisterEmailCode) ||
    cleanText((endpoints as any)?.core?.auth?.registerResendEmailCode) ||
    cleanText((endpoints as any)?.core?.auth?.resendEmailCode) ||
    "/api/auth/register/resend-email-code"
  );
}

function getPasswordChangeStartPath() {
  return (
    cleanText((endpoints as any)?.core?.auth?.changePasswordStart) ||
    cleanText((endpoints as any)?.core?.auth?.passwordChangeStart) ||
    "/api/auth/password/change/start"
  );
}

function getPasswordChangeConfirmPath() {
  return (
    cleanText((endpoints as any)?.core?.auth?.changePasswordConfirm) ||
    cleanText((endpoints as any)?.core?.auth?.passwordChangeConfirm) ||
    "/api/auth/password/change/confirm"
  );
}

function getPayloadDetail(payload: AnyObj | null | undefined): string | null {
  if (!payload) return null;
  return (
    cleanText(payload.detail?.message) ||
    cleanText(payload.detail?.error) ||
    cleanText(payload.detail?.code) ||
    cleanText(payload.detail) ||
    cleanText(payload.error_code) ||
    cleanText(payload.code) ||
    cleanText(payload.message) ||
    cleanText(payload.error) ||
    null
  );
}

function getUserFacingAuthMessage(payload: AnyObj | null | undefined, fallback = "Something went wrong. Please try again."): string {
  const detail = getPayloadDetail(payload)?.toLowerCase();

  switch (detail) {
    case "email_already_registered":
      return "An account already exists for this email.";
    case "email_verification_required":
      return "Please verify your email to continue.";
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "invalid_or_used_token":
      return "This reset token is invalid or already used.";
    case "token_expired":
    case "challenge_expired":
      return "This code or token has expired. Request a new one.";
    case "invalid_code":
      return "The verification code is incorrect.";
    case "current_password_incorrect":
      return "Your current password is incorrect.";
    case "account_inactive":
      return "This account is inactive. Contact support if you need help.";
    default:
      return cleanText(payload?.message) || fallback;
  }
}

function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof AuthHttpError) {
    return error.status === 401 || error.status === 403;
  }

  const message = cleanText((error as any)?.message)?.toLowerCase() ?? "";
  return (
    message.includes("unauthorized") ||
    message.includes("invalid_token") ||
    message.includes("signature has expired") ||
    message.includes("expired")
  );
}

async function fetchProfileForToken(accessToken: string): Promise<AnyObj | null> {
  for (const path of getProfileFetchPaths()) {
    try {
      const response = await fetch(joinUrl(CORE_BASE, path), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.status === 404 || response.status === 405) {
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        const payload = await response.json().catch(() => null);
        const detail = getPayloadDetail(payload) || "UNAUTHORIZED";
        throw new AuthHttpError(response.status, detail, payload);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const lowered = String(text || "").toLowerCase();
        if (
          response.status >= 500 &&
          (
            lowered.includes("invalid_token") ||
            lowered.includes("signature has expired") ||
            lowered.includes("expired")
          )
        ) {
          throw new AuthHttpError(401, "invalid_token");
        }
        continue;
      }

      const json = await response.json().catch(() => null);
      const profile = extractProfileObject(json);
      if (profile) return profile;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw error;
      }
    }
  }

  return null;
}

async function requestRefreshSession(refreshToken: string): Promise<AuthResponse | null> {
  const normalizedRefreshToken = cleanText(refreshToken);
  if (!normalizedRefreshToken) return null;

  for (const path of getRefreshFetchPaths()) {
    try {
      const response = await fetch(joinUrl(CORE_BASE, path), {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: normalizedRefreshToken }),
      });

      if (response.status === 404 || response.status === 405) {
        continue;
      }

      const payload = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        const detail = getPayloadDetail(payload) || "UNAUTHORIZED";
        throw new AuthHttpError(response.status, detail, payload);
      }

      if (!response.ok) {
        continue;
      }

      return (payload ?? null) as AuthResponse | null;
    } catch (error) {
      if (isUnauthorizedError(error)) {
        throw error;
      }
    }
  }

  return null;
}

async function postCoreJson<T = AnyObj>(
  path: string,
  body: AnyObj,
  options?: { accessToken?: string | null }
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const accessToken = cleanText(options?.accessToken);
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(joinUrl(CORE_BASE, path), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => null)) as AnyObj | null;

  if (!response.ok) {
    throw new AuthHttpError(
      response.status,
      getPayloadDetail(payload) || `HTTP_${response.status}`,
      payload
    );
  }

  return (payload ?? {}) as T;
}

async function clearUserScopedClientState(
  activeOwnerKey?: string | null,
  mode: "soft" | "hard" = "hard"
) {
  const normalizedOwnerKey = cleanText(activeOwnerKey)?.toLowerCase() ?? null;

  if (mode === "soft" && normalizedOwnerKey) {
    setCreatorFlowOwner(normalizedOwnerKey);
    await clearCreateFlowContextForOwnerMismatch(normalizedOwnerKey).catch(() => undefined);
    return;
  }

  resetCreatorFlow(normalizedOwnerKey ?? undefined);
  if (normalizedOwnerKey) {
    setCreatorFlowOwner(normalizedOwnerKey);
    await clearCreateFlowContextForOwnerMismatch(normalizedOwnerKey).catch(() => undefined);
    return;
  }
  await clearCreateFlowContext().catch(() => undefined);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<PendingMfaChallenge | null>(null);
  const [identity, setIdentity] = useState<AuthIdentity>(EMPTY_IDENTITY);
  const lastOwnerKeyRef = useRef<string | null>(null);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const logoutInFlightRef = useRef(false);
  const authFailureHandlerInFlightRef = useRef(false);
  const refreshSessionRef = useRef<() => Promise<boolean>>(async () => false);

  const applyAuthenticatedState = async (accessToken: string, fallbackEmail?: string | null) => {
    const profile = await fetchProfileForToken(accessToken);
    const resolvedIdentity = resolveIdentity(profile, fallbackEmail ?? null);
    const ownerKey = cleanText(resolvedIdentity.email)?.toLowerCase() ?? null;
    if (ownerKey) {
      await setActiveAuthEmail(ownerKey).catch(() => undefined);
      await clearUserScopedClientState(ownerKey, "soft");
    } else {
      await clearUserScopedClientState(undefined, "hard");
    }
    setIdentity(resolvedIdentity);
    setToken(accessToken);
    return resolvedIdentity;
  };

  const clearAuthStateAndRouteToLogin = async () => {
    if (logoutInFlightRef.current) return;
    logoutInFlightRef.current = true;
    try {
      await tokenStore.clearAll().catch(() => undefined);
      await clearActiveAuthEmail().catch(() => undefined);
      await clearUserScopedClientState(undefined, "hard");
      setToken(null);
      setIdentity(EMPTY_IDENTITY);
      setMfaChallenge(null);
      router.replace(AUTH_LOGIN_ROUTE);
    } finally {
      logoutInFlightRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const accessToken = await tokenStore.getAccess();
        const refreshToken = await tokenStore.getRefresh();
        if (!mounted) return;

        if (!accessToken) {
          await clearUserScopedClientState(undefined, "hard");
          if (!mounted) return;
          setToken(null);
          setIdentity(EMPTY_IDENTITY);
          return;
        }

        try {
          await applyAuthenticatedState(accessToken);
        } catch (error) {
          if (!mounted) return;
          if (!isUnauthorizedError(error) || !refreshToken) {
            await clearAuthStateAndRouteToLogin();
            return;
          }

          try {
            const refreshed = await requestRefreshSession(refreshToken);
            if (!refreshed?.access_token) {
              await clearAuthStateAndRouteToLogin();
              return;
            }
            await tokenStore.setTokens({
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token || refreshToken,
            });
            if (!mounted) return;
            await applyAuthenticatedState(refreshed.access_token);
          } catch {
            if (!mounted) return;
            await clearAuthStateAndRouteToLogin();
          }
        }
      } finally {
        if (!mounted) return;
        setIsReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    apiSetAuthReady(isReady);
  }, [isReady]);

  useEffect(() => {
    setOnAuthFailed(async () => {
      if (authFailureHandlerInFlightRef.current) return;
      authFailureHandlerInFlightRef.current = true;

      try {
        const refreshed = await refreshSessionRef.current();
        if (refreshed) return;
      } catch {
        // Fall through to logout.
      } finally {
        authFailureHandlerInFlightRef.current = false;
      }

      await clearAuthStateAndRouteToLogin();
    });

    return () => setOnAuthFailed(null);
  }, []);

  useEffect(() => {
    const ownerKey = cleanText(identity.email)?.toLowerCase() ?? null;
    const previousOwnerKey = lastOwnerKeyRef.current;

    if (!ownerKey) {
      lastOwnerKeyRef.current = null;
      resetCreatorFlow();
      return;
    }

    let cancelled = false;
    (async () => {
      await setActiveAuthEmail(ownerKey).catch(() => undefined);
      if (previousOwnerKey && previousOwnerKey !== ownerKey) {
        await clearCreateFlowContext().catch(() => undefined);
        if (cancelled) return;
        resetCreatorFlow(ownerKey);
      } else {
        setCreatorFlowOwner(ownerKey);
        await clearCreateFlowContextForOwnerMismatch(ownerKey).catch(() => undefined);
      }
      if (!cancelled) {
        lastOwnerKeyRef.current = ownerKey;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identity.email]);

  const value = useMemo<AuthCtx>(() => {
    const isAuthed = !!token;

    const finalizeAuth = async (resp: AuthResponse, normalizedEmail?: string) => {
      if (!resp?.access_token) {
        throw new Error("Authentication succeeded but access_token is missing.");
      }
      if (!resp?.refresh_token) {
        throw new Error("Authentication succeeded but refresh_token is missing.");
      }

      await tokenStore.setTokens({
        accessToken: resp.access_token,
        refreshToken: resp.refresh_token,
      });

      const identityFromResponse = resolveIdentity(resp, normalizedEmail);
      const finalIdentity = await applyAuthenticatedState(
        resp.access_token,
        identityFromResponse.email || normalizedEmail || null
      );
      const finalOwnerKey = cleanText(finalIdentity.email || normalizedEmail)?.toLowerCase() ?? null;
      if (finalOwnerKey) {
        await setActiveAuthEmail(finalOwnerKey).catch(() => undefined);
        setCreatorFlowOwner(finalOwnerKey);
      }

      setMfaChallenge(null);
      router.replace(DASHBOARD_ROUTE);
    };

    const finalizeNewRegistration = async (resp: AuthResponse, normalizedEmail?: string | null) => {
      const normalized = cleanText(normalizedEmail)?.toLowerCase() ?? null;
      await finalizeAuth(resp, normalized || undefined);

      if (normalized) {
        await setActiveAuthEmail(normalized).catch(() => undefined);
        await initializeFreePlanForEmail(normalized).catch(() => undefined);
        await setPlanFlash(
          {
            kind: "registered_free",
            title: "Welcome to DesiFaces Free",
            message:
              "Your account is verified and ready on the Free plan. You can start exploring Face and Audio now, and upgrade later when you need more capacity or premium Fusion features.",
            planCode: "free",
            entitlements: [],
          },
          normalized
        ).catch(() => undefined);
      }
    };

    const setVerificationChallengeAndRoute = (
      resp: AnyObj,
      fallback: { purpose: "login" | "register"; email?: string }
    ) => {
      setMfaChallenge(extractMfaChallenge(resp, fallback));
      router.replace(AUTH_MFA_ROUTE);
    };

    const refreshSession = async (): Promise<boolean> => {
      if (refreshInFlightRef.current) {
        return refreshInFlightRef.current;
      }

      const run = (async () => {
        const access = await tokenStore.getAccess();
        const refresh = await tokenStore.getRefresh();

        if (access) {
          try {
            await applyAuthenticatedState(access);
            return true;
          } catch (error) {
            if (!isUnauthorizedError(error)) {
              return false;
            }
          }
        }

        if (!refresh) return false;

        try {
          const refreshed = await requestRefreshSession(refresh);
          if (!refreshed?.access_token) return false;

          await tokenStore.setTokens({
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || refresh,
          });
          await applyAuthenticatedState(refreshed.access_token, cleanText(identity.email));
          return true;
        } catch {
          return false;
        }
      })();

      refreshInFlightRef.current = run;
      try {
        return await run;
      } finally {
        refreshInFlightRef.current = null;
      }
    };

    refreshSessionRef.current = refreshSession;

    return {
      token,
      isReady,
      isAuthed,
      email: identity.email,
      userId: identity.userId,
      fullName: identity.fullName,
      displayName: identity.displayName,
      user: identity.user,
      profile: identity.profile,
      mfaChallenge,

      clearMfaChallenge: () => setMfaChallenge(null),

      resendMfaChallenge: async () => {
        const current = mfaChallenge;
        if (!current?.challengeId) {
          throw new Error("No active verification challenge is available to resend.");
        }

        const resp = await postCoreJson<AuthResponse>(getResendRegisterEmailCodePath(), {
          challenge_id: current.challengeId,
          email: current.email,
        });

        setMfaChallenge(
          extractMfaChallenge(resp, {
            purpose: current.purpose === "change_password" ? "login" : current.purpose,
            email: current.email,
          })
        );
      },

      login: async (email: string, password: string): Promise<void> => {
        const normalizedEmail = email.trim().toLowerCase();
        const device_id = (Device as any).modelId ?? Device.modelName ?? undefined;
        const client_type = Device.osName?.toLowerCase() === "android" ? "android" : "ios";
        const path = endpoints.core.auth.login;

        try {
          const resp = await postCoreJson<AuthResponse>(path, {
            email: normalizedEmail,
            password,
            device_id,
            client_type,
          });

          if (isMfaRequiredResponse(resp)) {
            setVerificationChallengeAndRoute(resp, {
              purpose: "login",
              email: normalizedEmail,
            });
            return;
          }

          await finalizeAuth(resp, normalizedEmail);
        } catch (error) {
          if (error instanceof AuthHttpError) {
            const payload = error.payload;
            const detail = getPayloadDetail(payload)?.toLowerCase();

            if (
              isMfaRequiredResponse(payload) ||
              detail === "email_verification_required"
            ) {
              setVerificationChallengeAndRoute(payload || {}, {
                purpose: "login",
                email: normalizedEmail,
              });
              return;
            }

            throw new Error(getUserFacingAuthMessage(payload, error.message || "Sign in failed."));
          }

          throw error;
        }
      },

      register: async (
        email: string,
        password: string,
        fullName: string = "",
        agreementAccepted: boolean = false
      ): Promise<void> => {
        const normalizedEmail = email.trim().toLowerCase();

        if (!agreementAccepted) {
          throw new Error("Please accept the DesiFaces Terms and Privacy Policy.");
        }

        try {
          const resp = await postCoreJson<AuthResponse>(endpoints.core.auth.register, {
            email: normalizedEmail,
            password,
            full_name: fullName.trim(),
            agreement_version: DESIFACES_AGREEMENT_VERSION,
            agreement: buildAgreementAcceptance(true),
            terms_accepted: true,
          });

          if (isMfaRequiredResponse(resp)) {
            setVerificationChallengeAndRoute(resp, {
              purpose: "register",
              email: normalizedEmail,
            });
            return;
          }

          if (resp?.access_token && resp?.refresh_token) {
            await finalizeNewRegistration(resp, normalizedEmail);
            return;
          }

          router.replace(AUTH_LOGIN_ROUTE);
        } catch (error) {
          if (error instanceof AuthHttpError) {
            const payload = error.payload;
            if (isMfaRequiredResponse(payload)) {
              setVerificationChallengeAndRoute(payload || {}, {
                purpose: "register",
                email: normalizedEmail,
              });
              return;
            }
            throw new Error(getUserFacingAuthMessage(payload, error.message || "Registration failed."));
          }

          throw error;
        }
      },

      verifyMfa: async (code: string) => {
        const current = mfaChallenge;
        if (!current) {
          throw new Error("No verification challenge is active.");
        }

        const normalizedCode = code.trim();
        if (!normalizedCode) {
          throw new Error("Enter the verification code.");
        }

        let resp: AuthResponse;
        try {
          if (current.challengeId) {
            resp = await postCoreJson<AuthResponse>(getVerifyRegisterEmailPath(), {
              challenge_id: current.challengeId,
              code: normalizedCode,
              email: current.email,
            });
          } else if (current.challengeToken) {
            resp = await postCoreJson<AuthResponse>(getVerifyMfaPath(), {
              challenge_token: current.challengeToken,
              code: normalizedCode,
              method: current.method,
              purpose: current.purpose,
              email: current.email,
            });
          } else {
            throw new Error("Verification challenge is missing its token or id.");
          }
        } catch (error) {
          if (error instanceof AuthHttpError) {
            throw new Error(getUserFacingAuthMessage(error.payload, error.message || "Verification failed."));
          }
          throw error;
        }

        if (resp?.access_token && resp?.refresh_token) {
          if (current.purpose === "register") {
            await finalizeNewRegistration(resp, current.email ?? null);
            return;
          }
          await finalizeAuth(resp, current.email);
          return;
        }

        setMfaChallenge(null);

        if (current.purpose === "register") {
          router.replace(AUTH_LOGIN_ROUTE);
          return;
        }

        throw new Error("Verification succeeded but no session was returned.");
      },

      forgotPassword: async (email: string): Promise<void> => {
        await api.post(CORE_BASE, endpoints.core.auth.forgotPassword, {
          email: email.trim().toLowerCase(),
        });
      },

      resetPassword: async (tokenStr: string, newPassword: string): Promise<void> => {
        await api.post(CORE_BASE, endpoints.core.auth.resetPassword, {
          token: tokenStr.trim(),
          new_password: newPassword,
        });

        router.replace(AUTH_LOGIN_ROUTE);
      },

      startPasswordChange: async (currentPassword: string): Promise<PasswordChangeChallenge> => {
        const accessToken = token || (await tokenStore.getAccess());
        if (!accessToken) {
          throw new Error("Your session has expired. Please sign in again.");
        }

        try {
          const resp = await postCoreJson<PasswordChangeStartResponse>(
            getPasswordChangeStartPath(),
            {
              current_password: currentPassword,
            },
            { accessToken }
          );

          const challengeId = cleanText(resp.challenge_id);
          if (!challengeId) {
            throw new Error("Password change verification did not return a challenge id.");
          }

          return {
            challengeId,
            maskedDestination: cleanText(resp.masked_destination) || null,
            expiresIn: typeof resp.expires_in === "number" ? resp.expires_in : null,
          };
        } catch (error) {
          if (error instanceof AuthHttpError) {
            throw new Error(
              getUserFacingAuthMessage(error.payload, error.message || "Could not start password change.")
            );
          }
          throw error;
        }
      },

      confirmPasswordChange: async ({ challengeId, code, newPassword }: PasswordChangeConfirmRequest): Promise<void> => {
        const accessToken = token || (await tokenStore.getAccess());
        if (!accessToken) {
          throw new Error("Your session has expired. Please sign in again.");
        }

        try {
          await postCoreJson<AuthResponse>(
            getPasswordChangeConfirmPath(),
            {
              challenge_id: challengeId,
              code: code.trim(),
              new_password: newPassword,
            },
            { accessToken }
          );
        } catch (error) {
          if (error instanceof AuthHttpError) {
            throw new Error(
              getUserFacingAuthMessage(error.payload, error.message || "Could not change password.")
            );
          }
          throw error;
        }
      },

      logout: async () => {
        const refresh = await tokenStore.getRefresh();

        try {
          if (refresh) {
            await api.post(CORE_BASE, endpoints.core.auth.logout, {
              refresh_token: refresh,
            });
          }
        } catch (e: any) {
          console.log("DF_AUTH_LOGOUT_API_ERR", e?.message || String(e));
        }

        await clearAuthStateAndRouteToLogin();
      },

      refreshSession,
    };
  }, [token, isReady, mfaChallenge, identity]);

  console.log(
    "DF_TOKEN_PRESENT",
    !!token,
    "DF_AUTH_READY",
    isReady,
    "DF_AUTH_NAME_PRESENT",
    !!identity.fullName,
    "DF_AUTH_EMAIL",
    identity.email
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
