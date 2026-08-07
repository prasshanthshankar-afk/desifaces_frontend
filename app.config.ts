import type { ExpoConfig } from "expo/config";

const SPLASH_BG = "#020000";
const BRAND_LOGO = "./assets/brand/desifaces-logo-softblend.png";
const SPLASH_IMAGE = "./assets/brand/desifaces-logo-softblend.png";

const coreBase = process.env.EXPO_PUBLIC_CORE_BASE_URL ?? process.env.EXPO_PUBLIC_CORE_URL;
const faceBase = process.env.EXPO_PUBLIC_FACE_BASE_URL ?? process.env.EXPO_PUBLIC_FACE_URL;
const audioBase = process.env.EXPO_PUBLIC_AUDIO_BASE_URL ?? process.env.EXPO_PUBLIC_AUDIO_URL;
const videoBase = process.env.EXPO_PUBLIC_VIDEO_BASE_URL ?? process.env.EXPO_PUBLIC_VIDEO_URL;
const dashboardBase = process.env.EXPO_PUBLIC_DASHBOARD_BASE_URL ?? process.env.EXPO_PUBLIC_DASH_URL;
const pricingBase = process.env.EXPO_PUBLIC_PRICING_BASE_URL ?? process.env.EXPO_PUBLIC_PRICING_URL;
const fusionBase = process.env.EXPO_PUBLIC_FUSION_BASE_URL ?? process.env.EXPO_PUBLIC_FUSION_URL;
const fusionExtensionBase =
  process.env.EXPO_PUBLIC_FUSION_EXTENSION_BASE_URL ??
  process.env.EXPO_PUBLIC_FUSION_EXTENSION_BASE;

const config: ExpoConfig = {
  name: "DesiFaces",
  slug: "desifaces-mobile",
  scheme: "desifaces",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: BRAND_LOGO,
  experiments: {
    typedRoutes: true,
  },

  plugins: [
    [
      "expo-dev-client",
      {
        launchMode: "launcher",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: SPLASH_BG,
        image: SPLASH_IMAGE,
        imageWidth: 180,
        resizeMode: "contain",
        dark: {
          backgroundColor: SPLASH_BG,
          image: SPLASH_IMAGE,
        },
        android: {
          backgroundColor: SPLASH_BG,
          image: SPLASH_IMAGE,
          imageWidth: 180,
          resizeMode: "contain",
        },
        ios: {
          backgroundColor: SPLASH_BG,
          image: SPLASH_IMAGE,
          imageWidth: 180,
          resizeMode: "contain",
        },
      },
    ],
    "expo-audio",
    "expo-sharing",
  ],

  ios: {
    bundleIdentifier: "ai.desifaces.app",
    supportsTablet: true,
    icon: BRAND_LOGO,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIDesignRequiresCompatibility: true,
    },
  },

  android: {
    package: "ai.desifaces.app",
    versionCode: 12,
    adaptiveIcon: {
      foregroundImage: BRAND_LOGO,
      backgroundColor: SPLASH_BG,
    },
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    ],
  },

  web: {
    bundler: "metro",
    output: "static",
    favicon: BRAND_LOGO,
  },

  extra: {
    CORE: coreBase,
    FACE: faceBase,
    AUDIO: audioBase,
    VIDEO: videoBase,
    DASH: dashboardBase,
    PRICING: pricingBase,
    FUSION: fusionBase,
    FUSION_EXTENSION: fusionExtensionBase,

    // Web has explicit keys so src/core/config/env.ts never falls through to
    // an Android-specific override when Platform.OS === "web".
    CORE_WEB: process.env.EXPO_PUBLIC_CORE_WEB_BASE_URL ?? coreBase,
    FACE_WEB: process.env.EXPO_PUBLIC_FACE_WEB_BASE_URL ?? faceBase,
    AUDIO_WEB: process.env.EXPO_PUBLIC_AUDIO_WEB_BASE_URL ?? audioBase,
    VIDEO_WEB: process.env.EXPO_PUBLIC_VIDEO_WEB_BASE_URL ?? videoBase,
    DASH_WEB: process.env.EXPO_PUBLIC_DASHBOARD_WEB_BASE_URL ?? dashboardBase,
    PRICING_WEB: process.env.EXPO_PUBLIC_PRICING_WEB_BASE_URL ?? pricingBase,
    FUSION_EXTENSION_WEB:
      process.env.EXPO_PUBLIC_FUSION_EXTENSION_WEB_BASE_URL ?? fusionExtensionBase,

    pricingBaseUrl: process.env.EXPO_PUBLIC_PRICING_BASE_URL,
    billingReturnUrlBase: process.env.EXPO_PUBLIC_BILLING_RETURN_URL_BASE,

    eas: {
      projectId: "7528bed0-9b75-42e4-a25a-bd088b6325af",
    },
  },
};

export default config;
