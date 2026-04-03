import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "DesiFaces",
  slug: "desifaces-mobile",
  scheme: "desifaces",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  experiments: {
    typedRoutes: true,
  },
  ios: {
    bundleIdentifier: "ai.desifaces.app",
    supportsTablet: true,
  },
  android: {
    package: "ai.desifaces.app",
  },
  web: {
    bundler: "metro",
    output: "static",
  },
  extra: {
    pricingBaseUrl: process.env.EXPO_PUBLIC_PRICING_BASE_URL,
    billingReturnUrlBase: process.env.EXPO_PUBLIC_BILLING_RETURN_URL_BASE,
  },
};

export default config;