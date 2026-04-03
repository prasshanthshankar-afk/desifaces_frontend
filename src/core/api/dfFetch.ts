import { tokenStore } from "../auth/tokenStore";

type DFRequestInit = RequestInit & { retry?: boolean };
type DFError = Error & { status?: number; code?: string; payload?: any };

let refreshInFlight: Promise<string | null> | null = null;

function stripSlash(s: string) {
  return String(s || "").replace(/\/+$/, "");
}

function isAbsoluteUrl(u: string) {
  return /^https?:\/\//i.test(String(u || ""));
}

/**
 * Base for relative API paths (optional).
 * You can still use dfFetch with absolute URLs and skip this entirely.
 */
const API_BASE = stripSlash(
  process.env.EXPO_PUBLIC_API_BASE_URL ??
    process.env.EXPO_PUBLIC_API_URL ??
    process.env.EXPO_PUBLIC_CORE_API_BASE_URL ??
    ""
);

/**
 * ✅ REQUIRED for refresh to be reliable in prod/nonprod.
 * Must be origin only, e.g. "https://api-nonprod.desifaces.ai"
 * (NO "/face")
 */
const AUTH_BASE = stripSlash(
  process.env.EXPO_PUBLIC_AUTH_BASE_URL ?? process.env.EXPO_PUBLIC_CORE_API_BASE_URL ?? ""
);

function toUrl(pathOrUrl: string) {
  if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl;

  if (!API_BASE) {
    // No guessing with localhost. Force caller to pass absolute URL or set API_BASE.
    throw new Error("DF_API_BASE_NOT_SET");
  }

  const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${API_BASE}${p}`;
}

async function readBodySafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isAuthInvalid(status: number, body: any) {
  const code = body?.code || body?.detail || body?.error;
  if (status === 401) return true;
  if (status === 403 && (code === "AUTH_INVALID_TOKEN" || code === "AUTH_EXPIRED" || code === "invalid_token"))
    return true;
  return false;
}

/**
 * ✅ Refresh ALWAYS uses AUTH_BASE (no accidental localhost).
 * If AUTH_BASE is missing, we cannot refresh safely.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      if (!AUTH_BASE) {
        // Fail fast: you must set EXPO_PUBLIC_AUTH_BASE_URL (recommended)
        // or EXPO_PUBLIC_CORE_API_BASE_URL
        throw new Error("DF_AUTH_BASE_NOT_SET");
      }

      const refreshToken = await tokenStore.getRefresh();
      if (!refreshToken) return null;

      const refreshUrl = `${AUTH_BASE}/api/auth/refresh`;

      const res = await fetch(refreshUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const body: any = await readBodySafe(res);

      if (!res.ok) {
        // On truly invalid refresh, clear
        if (res.status === 401 || res.status === 403 || res.status === 422) {
          await tokenStore.clearAll();
        }
        return null;
      }

      const access = body?.access_token;
      const nextRefresh = body?.refresh_token;

      if (!access || !nextRefresh) return null;

      await tokenStore.setAccess(String(access));
      await tokenStore.setRefresh(String(nextRefresh));
      return String(access);
    } catch (e) {
      // If DF_AUTH_BASE_NOT_SET happens, we still just return null and the caller becomes AUTH_REQUIRED
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function dfFetch(pathOrUrl: string, init: DFRequestInit = {}) {
  const { retry = true, headers, ...rest } = init;

  const url = toUrl(pathOrUrl);
  const access = await tokenStore.getAccess();

  const res1 = await fetch(url, {
    ...rest,
    headers: {
      ...(headers ?? {}),
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
  });

  if (res1.ok) return res1;

  const body1 = await readBodySafe(res1);

  if (retry && isAuthInvalid(res1.status, body1)) {
    const newAccess = await refreshAccessToken();

    if (!newAccess) {
      const err: DFError = new Error("AUTH_REQUIRED");
      err.status = res1.status;
      err.code = "AUTH_REQUIRED";
      err.payload = body1;
      throw err;
    }

    const res2 = await fetch(url, {
      ...rest,
      headers: {
        ...(headers ?? {}),
        Authorization: `Bearer ${newAccess}`,
      },
    });

    if (res2.ok) return res2;

    const body2 = await readBodySafe(res2);
    const err: DFError = new Error(body2?.code || body2?.detail || `HTTP_${res2.status}`);
    err.status = res2.status;
    err.code = body2?.code || body2?.detail;
    err.payload = body2;
    throw err;
  }

  const err: DFError = new Error(body1?.code || body1?.detail || `HTTP_${res1.status}`);
  err.status = res1.status;
  err.code = body1?.code || body1?.detail;
  err.payload = body1;
  throw err;
}

export async function dfFetchJson(pathOrUrl: string, init: DFRequestInit = {}) {
  const res = await dfFetch(pathOrUrl, init);
  return await readBodySafe(res);
}