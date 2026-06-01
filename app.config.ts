import type { ExpoConfig } from "expo/config";

/**
 * DesiFaces app config
 *
 * Android EAS failed because the generated native project referenced
 * @drawable/splashscreen_logo but no splash image was configured/generated.
 * Keep these paths pointed at real PNG files committed under assets/brand.
 */
const SPLASH_BG = "#020000";
const BRAND_LOGO = "./assets/brand/desifaces-logo-softblend.png";
const SPLASH_IMAGE = "./assets/brand/desifaces-logo-softblend.png";

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
    // Must be greater than the last Google Play build.
    // Previous Play build observed in testing was versionCode=5.
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
    // Canonical API bases consumed by src/core/config/env.ts.
    CORE: process.env.EXPO_PUBLIC_CORE_BASE_URL ?? process.env.EXPO_PUBLIC_CORE_URL,
    FACE: process.env.EXPO_PUBLIC_FACE_BASE_URL ?? process.env.EXPO_PUBLIC_FACE_URL,
    AUDIO: process.env.EXPO_PUBLIC_AUDIO_BASE_URL ?? process.env.EXPO_PUBLIC_AUDIO_URL,
    VIDEO: process.env.EXPO_PUBLIC_VIDEO_BASE_URL ?? process.env.EXPO_PUBLIC_VIDEO_URL,
    DASH: process.env.EXPO_PUBLIC_DASHBOARD_BASE_URL ?? process.env.EXPO_PUBLIC_DASH_URL,
    PRICING: process.env.EXPO_PUBLIC_PRICING_BASE_URL ?? process.env.EXPO_PUBLIC_PRICING_URL,
    FUSION: process.env.EXPO_PUBLIC_FUSION_BASE_URL ?? process.env.EXPO_PUBLIC_FUSION_URL,
    FUSION_EXTENSION:
      process.env.EXPO_PUBLIC_FUSION_EXTENSION_BASE_URL ??
      process.env.EXPO_PUBLIC_FUSION_EXTENSION_BASE,

    // Backward-compatible names already used by parts of the app.
    pricingBaseUrl: process.env.EXPO_PUBLIC_PRICING_BASE_URL,
    billingReturnUrlBase: process.env.EXPO_PUBLIC_BILLING_RETURN_URL_BASE,

    eas: {
      projectId: "7528bed0-9b75-42e4-a25a-bd088b6325af",
    },
  },
};

export default config;
