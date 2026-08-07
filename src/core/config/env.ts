// src/core/config/env.ts
import Constants from "expo-constants";
import { Platform } from "react-native";

type Extra = {
  CORE_IOS?: string;
  CORE_ANDROID?: string;
  CORE_WEB?: string;
  CORE?: string;

  FACE_IOS?: string;
  FACE_ANDROID?: string;
  FACE_WEB?: string;
  FACE?: string;

  AUDIO_IOS?: string;
  AUDIO_ANDROID?: string;
  AUDIO_WEB?: string;
  AUDIO?: string;

  VIDEO_IOS?: string;
  VIDEO_ANDROID?: string;
  VIDEO_WEB?: string;
  VIDEO?: string;

  DASH_IOS?: string;
  DASH_ANDROID?: string;
  DASH_WEB?: string;
  DASH?: string;

  PRICING_IOS?: string;
  PRICING_ANDROID?: string;
  PRICING_WEB?: string;
  PRICING?: string;

  FUSION_EXTENSION_IOS?: string;
  FUSION_EXTENSION_ANDROID?: string;
  FUSION_EXTENSION_WEB?: string;
  FUSION_EXTENSION?: string;

  LONGFORM_IOS?: string;
  LONGFORM_ANDROID?: string;
  LONGFORM_WEB?: string;
  LONGFORM?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * Production gateway defaults.
 * All frontend API traffic is aligned to https://api.desifaces.ai.
 * Platform-specific overrides are optional and must be intentional.
 */
const DEFAULTS = {
  CORE: "https://api.desifaces.ai/core",
  FACE: "https://api.desifaces.ai/face",
  AUDIO: "https://api.desifaces.ai/audio",
  VIDEO: "https://api.desifaces.ai/video",
  DASH: "https://api.desifaces.ai/dashboard",
  PRICING: "https://api.desifaces.ai/pricing",
  FUSION_EXTENSION: "https://api.desifaces.ai/fusion-extension",
} as const;

function normalizeBase(value: string) {
  return value.replace(/\/+$/, "");
}

function pick(
  ios?: string,
  android?: string,
  web?: string,
  fallback?: string,
  def?: string
) {
  let platformValue: string | undefined;
  if (Platform.OS === "ios") platformValue = ios;
  else if (Platform.OS === "android") platformValue = android;
  else if (Platform.OS === "web") platformValue = web;

  const raw = platformValue || fallback || def || DEFAULTS.CORE;
  return normalizeBase(raw);
}

export const CORE_BASE = pick(
  extra.CORE_IOS,
  extra.CORE_ANDROID,
  extra.CORE_WEB,
  extra.CORE,
  DEFAULTS.CORE
);

export const FACE_BASE = pick(
  extra.FACE_IOS,
  extra.FACE_ANDROID,
  extra.FACE_WEB,
  extra.FACE,
  DEFAULTS.FACE
);

export const AUDIO_BASE = pick(
  extra.AUDIO_IOS,
  extra.AUDIO_ANDROID,
  extra.AUDIO_WEB,
  extra.AUDIO,
  DEFAULTS.AUDIO
);

export const VIDEO_BASE = pick(
  extra.VIDEO_IOS,
  extra.VIDEO_ANDROID,
  extra.VIDEO_WEB,
  extra.VIDEO,
  DEFAULTS.VIDEO
);

export const DASH_BASE = pick(
  extra.DASH_IOS,
  extra.DASH_ANDROID,
  extra.DASH_WEB,
  extra.DASH,
  DEFAULTS.DASH
);

export const PRICING_BASE = pick(
  extra.PRICING_IOS,
  extra.PRICING_ANDROID,
  extra.PRICING_WEB,
  extra.PRICING,
  DEFAULTS.PRICING
);

export const FUSION_EXTENSION_BASE = pick(
  extra.FUSION_EXTENSION_IOS || extra.LONGFORM_IOS,
  extra.FUSION_EXTENSION_ANDROID || extra.LONGFORM_ANDROID,
  extra.FUSION_EXTENSION_WEB || extra.LONGFORM_WEB,
  extra.FUSION_EXTENSION || extra.LONGFORM,
  DEFAULTS.FUSION_EXTENSION
);

export const FUSION_EXT_BASE = FUSION_EXTENSION_BASE;
export const LONGFORM_BASE = FUSION_EXTENSION_BASE;
export const FUSION_LONGFORM_BASE = FUSION_EXTENSION_BASE;
export const SVC_FUSION_EXTENSION_BASE = FUSION_EXTENSION_BASE;
export const DASHBOARD_BASE = DASH_BASE;
export const FUSION_BASE = VIDEO_BASE;

if (__DEV__) {
  console.log("DF BASES", {
    platform: Platform.OS,
    CORE_BASE,
    FACE_BASE,
    AUDIO_BASE,
    VIDEO_BASE,
    FUSION_BASE,
    FUSION_EXTENSION_BASE,
    DASH_BASE,
    PRICING_BASE,
  });
}
