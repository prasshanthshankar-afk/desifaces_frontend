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

  // Longform / fusion-extension base.
  // This MUST point to svc-fusion-extension, not svc-fusion.
  FUSION_EXTENSION_IOS?: string;
  FUSION_EXTENSION_ANDROID?: string;
  FUSION_EXTENSION?: string;

  // Optional aliases to reduce config churn across environments.
  LONGFORM_IOS?: string;
  LONGFORM_ANDROID?: string;
  LONGFORM?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

// Nonprod gateway defaults.
// For local dev, set these via app.config.ts / app.json extra.
// Current backend ports you confirmed:
//   VIDEO_IOS / VIDEO_ANDROID:               http://localhost:8002   (svc-fusion)
//   FUSION_EXTENSION_IOS / _ANDROID:         http://localhost:8006   (svc-fusion-extension)
// Typical ports in your stack:
//   CORE_IOS / CORE_ANDROID:                 http://localhost:8001
//   FACE_IOS / FACE_ANDROID:                 http://localhost:8004
//   AUDIO_IOS / AUDIO_ANDROID:               http://localhost:8005
//   DASH_IOS / DASH_ANDROID:                 http://localhost:8007 or gateway
//   PRICING_IOS / PRICING_ANDROID:           http://localhost:8009
const DEFAULTS = {
  CORE: "https://api-nonprod.desifaces.ai/core",
  FACE: "https://api-nonprod.desifaces.ai/face",
  AUDIO: "https://api-nonprod.desifaces.ai/audio",
  VIDEO: "https://api-nonprod.desifaces.ai/video",
  DASH: "https://api-nonprod.desifaces.ai/dashboard",
  PRICING: "https://api-nonprod.desifaces.ai/pricing",

  // IMPORTANT:
  // Change this if your gateway mounts fusion-extension under a different prefix.
  // It must resolve to svc-fusion-extension for /api/longform/*.
  FUSION_EXTENSION: "https://api-nonprod.desifaces.ai/fusion-extension",
} as const;

function normalizeBase(value: string) {
  return value.replace(/\/+$/, "");
}

function pick(ios?: string, android?: string, fallback?: string, def?: string) {
  const raw =
    (Platform.OS === "ios" ? ios : android) ||
    fallback ||
    def ||
    DEFAULTS.CORE;
  return normalizeBase(raw);
}

export const CORE_BASE = pick(
  extra.CORE_IOS,
  extra.CORE_ANDROID,
  extra.CORE,
  DEFAULTS.CORE
);

export const FACE_BASE = pick(
  extra.FACE_IOS,
  extra.FACE_ANDROID,
  extra.FACE,
  DEFAULTS.FACE
);

export const AUDIO_BASE = pick(
  extra.AUDIO_IOS,
  extra.AUDIO_ANDROID,
  extra.AUDIO,
  DEFAULTS.AUDIO
);

export const VIDEO_BASE = pick(
  extra.VIDEO_IOS,
  extra.VIDEO_ANDROID,
  extra.VIDEO,
  DEFAULTS.VIDEO
);

export const DASH_BASE = pick(
  extra.DASH_IOS,
  extra.DASH_ANDROID,
  extra.DASH,
  DEFAULTS.DASH
);

export const PRICING_BASE = pick(
  extra.PRICING_IOS,
  extra.PRICING_ANDROID,
  extra.PRICING,
  DEFAULTS.PRICING
);

// Longform / fusion-extension base.
// This is intentionally separate from VIDEO_BASE because /api/longform/*
// must go to svc-fusion-extension, while /jobs typically goes to svc-fusion.
export const FUSION_EXTENSION_BASE = pick(
  extra.FUSION_EXTENSION_IOS || extra.LONGFORM_IOS,
  extra.FUSION_EXTENSION_ANDROID || extra.LONGFORM_ANDROID,
  extra.FUSION_EXTENSION || extra.LONGFORM,
  DEFAULTS.FUSION_EXTENSION
);

// Optional aliases used by some helpers.
export const FUSION_EXT_BASE = FUSION_EXTENSION_BASE;
export const LONGFORM_BASE = FUSION_EXTENSION_BASE;
export const FUSION_LONGFORM_BASE = FUSION_EXTENSION_BASE;
export const SVC_FUSION_EXTENSION_BASE = FUSION_EXTENSION_BASE;

// Optional alias to avoid refactor churn if some files already import DASHBOARD_BASE
export const DASHBOARD_BASE = DASH_BASE;

// Explicit svc-fusion base.
// NOTE: svc-fusion uses /jobs and is NOT the longform service.
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
});
