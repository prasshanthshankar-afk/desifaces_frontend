import AsyncStorage from "@react-native-async-storage/async-storage";
import { tokenStore } from "../auth/tokenStore";
import { CORE_BASE } from "../config/env";

type RegionItem = {
  code: string;
  label: string;
  sub_region: string; // North/South/etc
  is_active: boolean;
  sort_order?: number;
};

type ContextItem = {
  code: string;
  label: string;
  glamour_level?: number;
  is_active: boolean;
};

type UseCaseItem = {
  code: string;
  label: string;
  category?: string;
  is_active: boolean;
  sort_order?: number;
};

export type FaceMasterdata = {
  domain: "face";
  revision: number;
  lang: string;
  regions: RegionItem[];
  contexts: ContextItem[];
  use_cases: UseCaseItem[];
};

const CACHE_DATA_KEY = (lang: string) => `DF_MD_FACE_DATA:${lang}`;
const CACHE_ETAG_KEY = (lang: string) => `DF_MD_FACE_ETAG:${lang}`;

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

export async function getFaceMasterdata(lang = "en", opts?: { force?: boolean }) {
  const token = await tokenStore.getAccess();
  if (!token) throw new Error("AUTH_MISSING_TOKEN");

  const url = joinUrl(CORE_BASE, `/api/masterdata/face?lang=${encodeURIComponent(lang)}`);

  const cachedEtag = await AsyncStorage.getItem(CACHE_ETAG_KEY(lang));
  const cachedRaw = await AsyncStorage.getItem(CACHE_DATA_KEY(lang));
  const cachedData: FaceMasterdata | null = cachedRaw ? JSON.parse(cachedRaw) : null;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  if (!opts?.force && cachedEtag) headers["If-None-Match"] = cachedEtag;

  const res = await fetch(url, { headers });

  if (res.status === 304 && cachedData) {
    return { data: cachedData as FaceMasterdata, fromCache: true };
  }

  const data = (await safeJson(res)) as FaceMasterdata;

  if (!res.ok) {
    const msg = (data as any)?.detail || (data as any)?.message || (data as any)?._raw || `HTTP ${res.status}`;
    if (cachedData) return { data: cachedData, fromCache: true };
    throw new Error(`Masterdata fetch failed: ${msg}`);
  }

  const etag = res.headers.get("etag");
  await AsyncStorage.setItem(CACHE_DATA_KEY(lang), JSON.stringify(data));
  if (etag) await AsyncStorage.setItem(CACHE_ETAG_KEY(lang), etag);

  return { data, fromCache: false };
}