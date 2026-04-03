import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
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

type AnyObj = Record<string, any>;

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
};

type AuthResponse = TokenResponse & AnyObj;

type AuthIdentity = {
  email: string | null;
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
  clearMfaChallenge: () => void;

  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
};

const Ctx = createContext<AuthCtx | null>(null);

const AUTH_LOGIN_ROUTE = "/(auth)/login" as Href;
const AUTH_MFA_ROUTE = "/(auth)/mfa" as Href;
const DASHBOARD_ROUTE = "/(tabs)/dashboard" as Href;

const EMPTY_IDENTITY: AuthIdentity = {
  email: null,
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

function getVerifyMfaPath() {
  return (endpoints as any)?.core?.auth?.verifyMfa || "/api/auth/mfa/verify";
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
    fullName,
    displayName,
    user: profile,
    profile,
  };
}

function mergeIdentity(primary: AuthIdentity, secondary: AuthIdentity): AuthIdentity {
  return {
    email: primary.email || secondary.email || null,
    fullName: primary.fullName || secondary.fullName || null,
    displayName: primary.displayName || secondary.displayName || null,
    user: primary.user || secondary.user || null,
    profile: primary.profile || secondary.profile || null,
  };
}

function getProfileFetchPaths(): string[] {
  const e = endpoints as any;
  const paths = [
    e?.core?.auth?.me,
    e?.core?.auth?.profile,
    e?.core?.users?.me,
    e?.core?.user?.me,
    "/api/auth/me",
    "/api/auth/profile",
    "/api/users/me",
    "/api/user/me",
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

      if (!response.ok) {
        continue;
      }

      const json = await response.json().catch(() => null);
      const profile = extractProfileObject(json);
      if (profile) return profile;
    } catch {
      // Try the next candidate path.
    }
  }

  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState<PendingMfaChallenge | null>(null);
  const [identity, setIdentity] = useState<AuthIdentity>(EMPTY_IDENTITY);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const t = await tokenStore.getAccess();
        if (!mounted) return;

        setToken(t ?? null);

        if (t) {
          const profile = await fetchProfileForToken(t);
          if (!mounted) return;
          setIdentity(resolveIdentity(profile));
        } else {
          setIdentity(EMPTY_IDENTITY);
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
    setOnAuthFailed(() => {
      setToken(null);
      setIdentity(EMPTY_IDENTITY);
      setMfaChallenge(null);
      router.replace(AUTH_LOGIN_ROUTE);
    });

    return () => setOnAuthFailed(null);
  }, []);

  const value = useMemo<AuthCtx>(() => {
    const isAuthed = !!token;

    const finalizeAuth = async (resp: AuthResponse, normalizedEmail?: string) => {
      if (!resp?.access_token) {
        throw new Error("Authentication succeeded but access_token is missing.");
      }
      if (!resp?.refresh_token) {
        throw new Error("Authentication succeeded but refresh_token is missing.");
      }

      await tokenStore.setAccess(resp.access_token);
      await tokenStore.setRefresh(resp.refresh_token);
      if (normalizedEmail) {
        await setActiveAuthEmail(normalizedEmail);
      }

      const identityFromResponse = resolveIdentity(resp, normalizedEmail);
      const fetchedProfile = await fetchProfileForToken(resp.access_token);
      const fetchedIdentity = resolveIdentity(
        fetchedProfile,
        identityFromResponse.email || normalizedEmail || null
      );
      const finalIdentity = mergeIdentity(fetchedIdentity, identityFromResponse);

      setIdentity(finalIdentity);
      setToken(resp.access_token);
      setMfaChallenge(null);
      router.replace(DASHBOARD_ROUTE);
    };

    const refreshSession = async (): Promise<boolean> => {
      const access = await tokenStore.getAccess();
      const refresh = await tokenStore.getRefresh();

      if (access) {
        setToken(access);
        const profile = await fetchProfileForToken(access);
        setIdentity(resolveIdentity(profile));
        return true;
      }

      if (!refresh) return false;

      // Refresh endpoint not wired yet
      return false;
    };

    return {
      token,
      isReady,
      isAuthed,
      email: identity.email,
      fullName: identity.fullName,
      displayName: identity.displayName,
      user: identity.user,
      profile: identity.profile,
      mfaChallenge,

      clearMfaChallenge: () => setMfaChallenge(null),

      login: async (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();
        const device_id = (Device as any).modelId ?? Device.modelName ?? undefined;
        const client_type = Device.osName?.toLowerCase() === "android" ? "android" : "ios";
        const path = endpoints.core.auth.login;

        console.log("DF_AUTH_LOGIN_BASE", CORE_BASE);
        console.log("DF_AUTH_LOGIN_PATH", path);
        console.log("DF_AUTH_LOGIN_URL", joinUrl(CORE_BASE, path));

        const resp = await api.post<AuthResponse>(CORE_BASE, path, {
          email: normalizedEmail,
          password,
          device_id,
          client_type,
        });

        if (isMfaRequiredResponse(resp)) {
          setMfaChallenge(
            extractMfaChallenge(resp, {
              purpose: "login",
              email: normalizedEmail,
            })
          );
          router.replace(AUTH_MFA_ROUTE);
          return;
        }

        await finalizeAuth(resp, normalizedEmail);
      },

      register: async (
        email,
        password,
        fullName = "",
        agreementAccepted = false
      ) => {
        const normalizedEmail = email.trim().toLowerCase();

        if (!agreementAccepted) {
          throw new Error("Please accept the DesiFaces Terms and Privacy Policy.");
        }

        const resp = await api.post<AuthResponse>(CORE_BASE, endpoints.core.auth.register, {
          email: normalizedEmail,
          password,
          full_name: fullName.trim(),
          agreement_version: DESIFACES_AGREEMENT_VERSION,
          agreement: buildAgreementAcceptance(true),
          terms_accepted: true,
        });

        await setActiveAuthEmail(normalizedEmail);
        await initializeFreePlanForEmail(normalizedEmail);
        await setPlanFlash(
          {
            kind: "registered_free",
            title: "Welcome to DesiFaces Free",
            message:
              "Your account is ready on the Free plan. You can start exploring Face and Audio now, and upgrade later when you need more capacity or premium Fusion features.",
            planCode: "free",
            entitlements: [],
          },
          normalizedEmail
        );

        if (isMfaRequiredResponse(resp)) {
          setMfaChallenge(
            extractMfaChallenge(resp, {
              purpose: "register",
              email: normalizedEmail,
            })
          );
          router.replace(AUTH_MFA_ROUTE);
          return;
        }

        if (resp?.access_token && resp?.refresh_token) {
          await finalizeAuth(resp, normalizedEmail);
          return;
        }

        router.replace(AUTH_LOGIN_ROUTE);
      },

      verifyMfa: async (code: string) => {
        const current = mfaChallenge;
        if (!current) {
          throw new Error("No MFA challenge is active.");
        }

        const path = getVerifyMfaPath();

        const resp = await api.post<AuthResponse>(CORE_BASE, path, {
          challenge_token: current.challengeToken,
          code: code.trim(),
          method: current.method,
          purpose: current.purpose,
          email: current.email,
        });

        if (resp?.access_token && resp?.refresh_token) {
          await finalizeAuth(resp, current.email);
          return;
        }

        setMfaChallenge(null);

        if (current.purpose === "register") {
          router.replace(AUTH_LOGIN_ROUTE);
          return;
        }

        throw new Error("MFA verification succeeded but no session was returned.");
      },

      forgotPassword: async (email) => {
        await api.post(CORE_BASE, endpoints.core.auth.forgotPassword, {
          email: email.trim().toLowerCase(),
        });
      },

      resetPassword: async (tokenStr, newPassword) => {
        await api.post(CORE_BASE, endpoints.core.auth.resetPassword, {
          token: tokenStr.trim(),
          new_password: newPassword,
        });

        router.replace(AUTH_LOGIN_ROUTE);
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

        await tokenStore.clearAll();
        await clearActiveAuthEmail();
        setToken(null);
        setIdentity(EMPTY_IDENTITY);
        setMfaChallenge(null);
        router.replace(AUTH_LOGIN_ROUTE);
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
