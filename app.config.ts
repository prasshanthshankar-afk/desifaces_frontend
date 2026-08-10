
import type { ExpoConfig } from "expo/config";

/**
 * desifaces.ai production Expo configuration
 *
 * Release principles:
 * - iPhone-only for v1.0 (`supportsTablet: false`)
 * - production API endpoints are supplied through EAS environment variables
 * - iOS/Android build numbers are managed by EAS remote versioning
 * - no QA-only country, currency, localhost, simulator, or staging overrides
 */
const SPLASH_BG = "#020000";
const BRAND_LOGO = "./assets/brand/desifaces-logo-softblend.png";
const SPLASH_IMAGE = "./assets/brand/desifaces-logo-softblend.png";

const config: ExpoConfig = {
  name: "desifaces.ai",
  slug: "desifaces-mobile",
  scheme: "desifaces",
  version: "2.1.0",
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
    "expo-localization",
    "expo-secure-store",
    "expo-video",
    "expo-web-browser",
  ],

  ios: {
    bundleIdentifier: "ai.desifaces.app",

    // desifaces.ai v1.0 is iPhone-only.
    // This prevents App Store Connect from requiring iPad screenshots.
    supportsTablet: false,

    icon: BRAND_LOGO,

    config: {
      // The app uses standard platform/network encryption only.
      // Expo writes ITSAppUsesNonExemptEncryption=false to Info.plist.
      usesNonExemptEncryption: false,
    },

    infoPlist: {
      // Preserve the current production UI behavior for this release.
      UIDesignRequiresCompatibility: true,
    },
  },

  android: {
    package: "ai.desifaces.app",

    // Android versionCode is intentionally omitted.
    // EAS remote versioning and auto-increment must remain the source of truth.

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
    // Canonical production API bases consumed by src/core/config/env.ts.
    CORE:
      process.env.EXPO_PUBLIC_CORE_BASE_URL ??
      process.env.EXPO_PUBLIC_CORE_URL,

    FACE:
      process.env.EXPO_PUBLIC_FACE_BASE_URL ??
      process.env.EXPO_PUBLIC_FACE_URL,

    AUDIO:
      process.env.EXPO_PUBLIC_AUDIO_BASE_URL ??
      process.env.EXPO_PUBLIC_AUDIO_URL,

    VIDEO:
      process.env.EXPO_PUBLIC_VIDEO_BASE_URL ??
      process.env.EXPO_PUBLIC_VIDEO_URL,

    DASH:
      process.env.EXPO_PUBLIC_DASHBOARD_BASE_URL ??
      process.env.EXPO_PUBLIC_DASH_URL,

    PRICING:
      process.env.EXPO_PUBLIC_PRICING_BASE_URL ??
      process.env.EXPO_PUBLIC_PRICING_URL,

    FUSION:
      process.env.EXPO_PUBLIC_FUSION_BASE_URL ??
      process.env.EXPO_PUBLIC_FUSION_URL,

    FUSION_EXTENSION:
      process.env.EXPO_PUBLIC_FUSION_EXTENSION_BASE_URL ??
      process.env.EXPO_PUBLIC_FUSION_EXTENSION_BASE,

    // Backward-compatible names already used by the application.
    pricingBaseUrl: process.env.EXPO_PUBLIC_PRICING_BASE_URL,
    billingReturnUrlBase:
      process.env.EXPO_PUBLIC_BILLING_RETURN_URL_BASE,

    eas: {
      projectId: "7528bed0-9b75-42e4-a25a-bd088b6325af",
    },
  },
};

export default config;