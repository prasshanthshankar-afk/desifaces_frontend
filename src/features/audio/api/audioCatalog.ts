import { AUDIO_BASE } from "../../../core/config/env";

export type VoiceCatalogItem = {
  voice_name: string;
  locale: string;
  gender?: string;
  voice_type?: string;
  is_default?: boolean;
  supports_styles?: boolean;
  meta_json?: string;
};

export type VoicesResponse = { items: VoiceCatalogItem[] };

export type LocaleItem =
  | string
  | { locale?: string; code?: string; label?: string; name?: string };

export type LocalesResponse =
  | { items: LocaleItem[] }
  | LocaleItem[]
  | Record<string, any>;

export type UiLocale = { code: string; label: string };
export type UiVoice = {
  key: string;     // voice_name
  label: string;   // display label
  locale: string;
  supportsStyles?: boolean;
  raw: VoiceCatalogItem;
};

function base() {
  return (AUDIO_BASE || "").replace(/\/$/, "");
}

async function getJson<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `GET failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchAudioLocales(token?: string) {
  return getJson<LocalesResponse>(`${base()}/api/audio/catalog/locales`, token);
}

export async function fetchAudioVoices(token: string | undefined, locale: string) {
  // REQUIRED param: locale
  return getJson<VoicesResponse>(
    `${base()}/api/audio/catalog/voices?locale=${encodeURIComponent(locale)}`,
    token
  );
}

function safeParse(meta_json?: string): any | null {
  if (!meta_json) return null;
  try { return JSON.parse(meta_json); } catch { return null; }
}

export function normalizeLocales(payload: LocalesResponse): UiLocale[] {
  const items: any[] =
    Array.isArray(payload) ? payload :
    (payload as any)?.items ? (payload as any).items :
    [];

  if (items.length) {
    return items.map((x) => {
      if (typeof x === "string") return { code: x, label: x };
      const code = x.locale || x.code || x.id || "";
      const label = x.label || x.name || x.display_name || code || "Unknown";
      return { code: String(code), label: String(label) };
    }).filter((x) => x.code);
  }

  if (payload && typeof payload === "object") {
    const maybe = (payload as any).locales || (payload as any).data || null;
    if (maybe && typeof maybe === "object") {
      return Object.entries(maybe).map(([code, label]) => ({
        code,
        label: String(label),
      }));
    }
  }
  return [];
}

export function normalizeVoices(resp: VoicesResponse): UiVoice[] {
  const items = resp?.items ?? [];
  return items.map((v) => {
    const meta = safeParse(v.meta_json);
    const display =
      meta?.DisplayName ||
      meta?.LocalName ||
      meta?.ShortName ||
      v.voice_name;

    const label = [
      display,
      v.gender ? `(${v.gender})` : null,
      v.voice_type ? `• ${v.voice_type}` : null,
      v.is_default ? "• default" : null,
    ].filter(Boolean).join(" ");

    return {
      key: v.voice_name,
      label,
      locale: v.locale,
      supportsStyles: !!v.supports_styles,
      raw: v,
    };
  });
}