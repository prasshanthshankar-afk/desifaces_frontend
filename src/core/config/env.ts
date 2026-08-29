// src/core/config/env.ts
import Constants from "expo-constants";
import { Platform } from "react-native";

type Extra = {
  CORE_IOS?: string;
  CORE_ANDROID?: string;
  CORE?: string;

  FACE_IOS?: string;
  FACE_ANDROID?: string;
  FACE?: string;

  AUDIO_IOS?: string;
  AUDIO_ANDROID?: string;
  AUDIO?: string;

  VIDEO_IOS?: string;
  VIDEO_ANDROID?: string;
  VIDEO?: string;

  DASH_IOS?: string;
  DASH_ANDROID?: string;
  DASH?: string;

  PRICING_IOS?: string;
  PRICING_ANDROID?: string;
  PRICING?: string;

  DIRECTOR_IOS?: string;
  DIRECTOR_ANDROID?: string;
  DIRECTOR?: string;

  ASSISTANT_IOS?: string;
  ASSISTANT_ANDROID?: string;
  ASSISTANT?: string;

  FUSION_EXTENSION_IOS?: string;
  FUSION_EXTENSION_ANDROID?: string;
  FUSION_EXTENSION?: string;

  LONGFORM_IOS?: string;
  LONGFORM_ANDROID?: string;
  LONGFORM?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const PRODUCTION_DEFAULTS = {
  CORE: "https://api.desifaces.ai/core",
  FACE: "https://api.desifaces.ai/face",
  AUDIO: "https://api.desifaces.ai/audio",
  VIDEO: "https://api.desifaces.ai/video",
  DASH: "https://api.desifaces.ai/dashboard",
  PRICING: "https://api.desifaces.ai/pricing",
  DIRECTOR: "https://api.desifaces.ai/director",
  ASSISTANT: "https://api.desifaces.ai/assistant",
  FUSION_EXTENSION: "https://api.desifaces.ai/fusion-extension",
} as const;

const DEV_APP =
  Boolean(__DEV__) ||
  String(Constants.expoConfig?.name || "")
    .trim()
    .toLowerCase()
    .endsWith(" dev");

function normalizeBase(value: string) {
  return value.replace(/\/+$/, "");
}

function pick(
  label: string,
  ios?: string,
  android?: string,
  fallback?: string,
  productionDefault?: string
) {
  const configured =
    (Platform.OS === "ios" ? ios : android) ||
    fallback;

  if (configured) return normalizeBase(configured);

  if (DEV_APP) {
    throw new Error(
      `[desifaces] Missing ${label} development API base. ` +
        "The dev client will not fall back to api.desifaces.ai. " +
        "Configure the EXPO_PUBLIC_* development endpoints before starting Metro."
    );
  }

  return normalizeBase(productionDefault || PRODUCTION_DEFAULTS.CORE);
}

function pickOptional(
  ios?: string,
  android?: string,
  fallback?: string,
  productionDefault?: string
) {
  const configured = (Platform.OS === "ios" ? ios : android) || fallback;
  if (configured) return normalizeBase(configured);
  return DEV_APP ? "" : normalizeBase(productionDefault || "");
}

export const CORE_BASE = pick(
  "CORE",
  extra.CORE_IOS,
  extra.CORE_ANDROID,
  extra.CORE,
  PRODUCTION_DEFAULTS.CORE
);

export const FACE_BASE = pick(
  "FACE",
  extra.FACE_IOS,
  extra.FACE_ANDROID,
  extra.FACE,
  PRODUCTION_DEFAULTS.FACE
);

export const AUDIO_BASE = pick(
  "AUDIO",
  extra.AUDIO_IOS,
  extra.AUDIO_ANDROID,
  extra.AUDIO,
  PRODUCTION_DEFAULTS.AUDIO
);

export const VIDEO_BASE = pick(
  "VIDEO/FUSION",
  extra.VIDEO_IOS,
  extra.VIDEO_ANDROID,
  extra.VIDEO,
  PRODUCTION_DEFAULTS.VIDEO
);

export const DASH_BASE = pick(
  "DASHBOARD",
  extra.DASH_IOS,
  extra.DASH_ANDROID,
  extra.DASH,
  PRODUCTION_DEFAULTS.DASH
);

export const PRICING_BASE = pick(
  "PRICING",
  extra.PRICING_IOS,
  extra.PRICING_ANDROID,
  extra.PRICING,
  PRODUCTION_DEFAULTS.PRICING
);

export const DIRECTOR_BASE = pick(
  "DIRECTOR",
  extra.DIRECTOR_IOS,
  extra.DIRECTOR_ANDROID,
  extra.DIRECTOR,
  PRODUCTION_DEFAULTS.DIRECTOR
);

export const ASSISTANT_BASE = pickOptional(
  extra.ASSISTANT_IOS,
  extra.ASSISTANT_ANDROID,
  extra.ASSISTANT,
  PRODUCTION_DEFAULTS.ASSISTANT
);

export const FUSION_EXTENSION_BASE = pick(
  "FUSION_EXTENSION",
  extra.FUSION_EXTENSION_IOS || extra.LONGFORM_IOS,
  extra.FUSION_EXTENSION_ANDROID || extra.LONGFORM_ANDROID,
  extra.FUSION_EXTENSION || extra.LONGFORM,
  PRODUCTION_DEFAULTS.FUSION_EXTENSION
);

export const FUSION_EXT_BASE = FUSION_EXTENSION_BASE;
export const LONGFORM_BASE = FUSION_EXTENSION_BASE;
export const FUSION_LONGFORM_BASE = FUSION_EXTENSION_BASE;
export const SVC_FUSION_EXTENSION_BASE = FUSION_EXTENSION_BASE;
export const DASHBOARD_BASE = DASH_BASE;
export const FUSION_BASE = VIDEO_BASE;

console.log("DF BASES", {
  CORE_BASE,
  FACE_BASE,
  AUDIO_BASE,
  VIDEO_BASE,
  FUSION_BASE,
  FUSION_EXTENSION_BASE,
  DASH_BASE,
  PRICING_BASE,
  DIRECTOR_BASE,
  ASSISTANT_BASE,
});
