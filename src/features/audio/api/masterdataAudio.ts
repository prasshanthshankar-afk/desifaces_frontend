import { AUDIO_BASE } from "../../../core/config/env";

export type LocaleItem =
  | string
  | { locale?: string; code?: string; label?: string; name?: string };

export type LocalesResponse =
  | { items: LocaleItem[] }
  | LocaleItem[]
  | Record<string, any>;

export type CountryCatalogItem = {
  country_code: string;
  locale_count: number;
};

export type CountriesResponse = {
  items: CountryCatalogItem[];
};

export type TargetLanguageCatalogItem = {
  locale: string;
  language_code?: string | null;
  country_code: string;
  translator_lang?: string | null;
  display_name?: string | null;
  native_name?: string | null;
  tts_supported?: boolean;
  translate_supported?: boolean;
  is_user_selectable?: boolean;
};

export type TargetLanguagesResponse = {
  country_code: string;
  items: TargetLanguageCatalogItem[];
};

export type VoiceItem = {
  voice_name: string;
  display_name?: string | null;
  locale: string;
  gender?: string;
  voice_type?: string;
  is_default?: boolean;
  supports_styles?: boolean;
  meta_json?: string; // JSON string from Azure
};

export type VoicesResponse = { items: VoiceItem[] };

export type UiCountry = {
  code: string;
  label: string;
  localeCount: number;
  raw: CountryCatalogItem;
};

export type UiLocale = {
  code: string;
  label: string;
  countryCode?: string;
  languageCode?: string;
  nativeName?: string;
  raw?: TargetLanguageCatalogItem | Record<string, any>;
};

export type UiVoice = { key: string; label: string; locale: string; raw: VoiceItem };

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

/**
 * User-facing locale catalog. Only enabled end-to-end locales should be offered
 * in Studio pickers; availability remains owned by svc-audio/masterdata.
 */
export async function fetchAudioLocales(token?: string) {
  return getJson<LocalesResponse>(
    `${base()}/api/audio/catalog/locales?end_to_end_only=true&enabled_only=true`,
    token
  );
}

export async function fetchSelectableAudioLocales(token?: string) {
  return fetchAudioLocales(token);
}

export async function fetchAudioCountries(token?: string) {
  return getJson<CountriesResponse>(`${base()}/api/audio/catalog/countries`, token);
}

export async function fetchAudioTargetLanguages(
  token: string | undefined,
  countryCode: string
) {
  return getJson<TargetLanguagesResponse>(
    `${base()}/api/audio/catalog/target-languages?country_code=${encodeURIComponent(countryCode)}`,
    token
  );
}

export async function fetchAudioVoices(token: string | undefined, locale: string) {
  // REQUIRED query param: locale
  return getJson<VoicesResponse>(
    `${base()}/api/audio/catalog/voices?locale=${encodeURIComponent(locale)}`,
    token
  );
}

function safeParse(meta_json?: string): any | null {
  if (!meta_json) return null;
  try {
    return JSON.parse(meta_json);
  } catch {
    return null;
  }
}

function countryDisplayName(countryCode: string): string {
  const code = String(countryCode || "").trim().toUpperCase();
  if (!code) return "";

  try {
    const DisplayNames = (Intl as any)?.DisplayNames;
    if (typeof DisplayNames === "function") {
      return new DisplayNames(["en"], { type: "region" }).of(code) || code;
    }
  } catch {}

  return code;
}

export function normalizeCountries(resp: CountriesResponse): UiCountry[] {
  return (resp?.items ?? [])
    .map((item) => {
      const code = String(item?.country_code ?? "").trim().toUpperCase();
      return {
        code,
        label: countryDisplayName(code),
        localeCount: Number(item?.locale_count ?? 0),
        raw: item,
      };
    })
    .filter((item) => item.code);
}

export function normalizeTargetLanguages(
  resp: TargetLanguagesResponse
): UiLocale[] {
  return (resp?.items ?? [])
    .map((item) => {
      const code = String(item?.locale ?? "").trim();
      const label =
        String(item?.display_name ?? "").trim() ||
        String(item?.native_name ?? "").trim() ||
        code;

      return {
        code,
        label,
        countryCode: String(item?.country_code ?? "").trim().toUpperCase(),
        languageCode: String(item?.language_code ?? "").trim().toLowerCase(),
        nativeName: String(item?.native_name ?? "").trim() || undefined,
        raw: item,
      };
    })
    .filter((item) => item.code);
}

export function normalizeLocales(payload: LocalesResponse): UiLocale[] {
  const items: any[] =
    Array.isArray(payload) ? payload :
    (payload as any)?.items ? (payload as any).items :
    [];

  if (items.length) {
    return items
      .map((x) => {
        if (typeof x === "string") return { code: x, label: x };
        const code = x.locale || x.code || x.id || "";
        const label = x.label || x.name || x.display_name || code || "Unknown";
        return { code: String(code), label: String(label), raw: x };
      })
      .filter((x) => x.code);
  }

  // fallback: object map
  if (payload && typeof payload === "object") {
    const maybe = (payload as any).locales || (payload as any).data;
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
      String(v.display_name ?? "").trim() ||
      meta?.DisplayName ||
      meta?.LocalName ||
      meta?.ShortName ||
      v.voice_name;

    const label = [
      display,
      v.gender ? `(${v.gender})` : null,
      v.voice_type ? `• ${v.voice_type}` : null,
      v.is_default ? "• default" : null,
    ]
      .filter(Boolean)
      .join(" ");

    return { key: v.voice_name, label, locale: v.locale, raw: v };
  });
}
