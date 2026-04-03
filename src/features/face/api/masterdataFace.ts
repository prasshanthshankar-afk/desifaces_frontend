import AsyncStorage from "@react-native-async-storage/async-storage";
import { tokenStore } from "../../../core/auth/tokenStore";
import { CORE_BASE } from "../../../core/config/env";

type FaceMasterdata = {
  domain: "face";
  revision: number;
  lang: string;
  regions: Array<{ code: string; label: string; sub_region?: string; is_active: boolean; sort_order?: number }>;
  contexts: Array<{ code: string; label: string; glamour_level?: number; is_active: boolean }>;
  use_cases: Array<{ code: string; label: string; category?: string; is_active: boolean; sort_order?: number }>;
};

const CACHE_KEY = "df_master_face_v1"; // stores JSON
const ETAG_KEY = "df_master_face_etag_v1"; // stores ETag

function joinUrl(base: string, path: string) {
  const b = (base || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

async function getAccessTokenOrThrow() {
  const t = await tokenStore.getAccess();
  if (!t) throw new Error("AUTH_MISSING_TOKEN");
  return t;
}

/**
 * Fetch face masterdata with:
 * - ETag cache support (If-None-Match)
 * - Path auto-detection to avoid "404 not found" when CORE_BASE differs
 */
export async function fetchFaceMasterdata(lang: "en" | "hi" | "ta" | string = "en"): Promise<FaceMasterdata> {
  const token = await getAccessTokenOrThrow();
  const cachedRaw = await AsyncStorage.getItem(CACHE_KEY);
  const cachedEtag = await AsyncStorage.getItem(ETAG_KEY);

  // These cover BOTH deployment styles:
  // A) CORE_BASE = https://host  => /core/api/...
  // B) CORE_BASE = https://host/core => /api/...
  // C) local dev may also expose /api/... directly
  const candidates = [
    `core/api/masterdata/face?lang=${encodeURIComponent(lang)}`,
    `api/masterdata/face?lang=${encodeURIComponent(lang)}`,
    `masterdata/face?lang=${encodeURIComponent(lang)}`,
  ];

  let lastErr: any = null;

  for (const path of candidates) {
    const url = joinUrl(CORE_BASE, path);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(cachedEtag ? { "If-None-Match": cachedEtag } : {}),
          Accept: "application/json",
        },
      });

      // 304 => use cache
      if (res.status === 304 && cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        return parsed as FaceMasterdata;
      }

      const data = await safeJson(res);

      if (!res.ok) {
        // If this path is wrong, it will be 404. Try next candidate.
        lastErr = new Error(`HTTP ${res.status} at ${url} :: ${data?.detail || data?.message || data?._raw || "no_body"}`);
        continue;
      }

      // Save cache + etag
      const etag = res.headers.get("etag");
      if (etag) await AsyncStorage.setItem(ETAG_KEY, etag);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));

      return data as FaceMasterdata;
    } catch (e: any) {
      lastErr = e;
      continue;
    }
  }

  // fallback: if network fails but we have cache, use it
  if (cachedRaw) {
    try {
      return JSON.parse(cachedRaw) as FaceMasterdata;
    } catch {}
  }

  throw new Error(
    `MASTERDATA_FETCH_FAILED: ${lastErr?.message || String(lastErr)}`
  );
}