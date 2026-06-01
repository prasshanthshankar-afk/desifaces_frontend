import { Platform } from "react-native";
import {
  apiConfirmGoogleCreditsPurchase,
  apiConfirmGoogleSubscriptionPurchase,
  GooglePurchaseConfirmResponse,
} from "./paymentRailApi";

export type GoogleSubscriptionProductId =
  | "ai.desifaces.pro.monthly"
  | "ai.desifaces.pro.yearly"
  | "ai.desifaces.business.monthly"
  | "ai.desifaces.business.yearly";

export type GoogleCreditsProductId =
  | "ai.desifaces.credits.1000"
  | "ai.desifaces.credits.5000"
  | "ai.desifaces.credits.15000";

export const GOOGLE_SUBSCRIPTION_PRODUCTS: Record<string, GoogleSubscriptionProductId> = {
  pro_monthly_v1: "ai.desifaces.pro.monthly",
  pro_yearly_v1: "ai.desifaces.pro.yearly",
  business_monthly_v1: "ai.desifaces.business.monthly",
  business_yearly_v1: "ai.desifaces.business.yearly",
};

export const GOOGLE_SUBSCRIPTION_BASE_PLANS: Record<string, string> = {
  pro_monthly_v1: "monthly",
  pro_yearly_v1: "yearly",
  business_monthly_v1: "monthly",
  business_yearly_v1: "yearly",
};

export const GOOGLE_TOPUP_PRODUCTS: Record<string, GoogleCreditsProductId> = {
  PACK_USD_1000: "ai.desifaces.credits.1000",
  PACK_INR_1000: "ai.desifaces.credits.1000",
  credits_1000: "ai.desifaces.credits.1000",
  PACK_USD_5000: "ai.desifaces.credits.5000",
  PACK_INR_5000: "ai.desifaces.credits.5000",
  credits_5000: "ai.desifaces.credits.5000",
  PACK_USD_15000: "ai.desifaces.credits.15000",
  PACK_INR_15000: "ai.desifaces.credits.15000",
  credits_15000: "ai.desifaces.credits.15000",
};

type GooglePurchaseType = "in-app" | "subs";
type ExpoIapProductType = "inapp" | "in-app" | "subs";

type RuntimeDiagnostic = {
  platform: string;
  moduleLoaded: boolean;
  moduleKeys: string[];
  hasUseIAP: boolean;
  hasInitConnection: boolean;
  hasInitConnectionAsync: boolean;
  hasConnectAsync: boolean;
  hasFetchProducts: boolean;
  hasRequestProducts: boolean;
  hasGetProducts: boolean;
  hasGetSubscriptions: boolean;
  hasRequestPurchase: boolean;
  hasGetAvailablePurchases: boolean;
  hasFinishTransaction: boolean;
};

type NormalizedPurchase = {
  raw: any;
  productId: string;
  purchaseToken: string;
  orderId: string | null;
};

let connectionPromise: Promise<boolean> | null = null;

export function isGooglePlayBillingPlatform() {
  return Platform.OS === "android";
}

export function googleSubscriptionProductIdForPlan(planCode?: string | null) {
  return (GOOGLE_SUBSCRIPTION_PRODUCTS[String(planCode || "").trim()] || null) as GoogleSubscriptionProductId | null;
}

export function googleSubscriptionBasePlanIdForPlan(planCode?: string | null) {
  return GOOGLE_SUBSCRIPTION_BASE_PLANS[String(planCode || "").trim()] || null;
}

export function googleCreditsProductIdForPack(packCode?: string | null) {
  return (GOOGLE_TOPUP_PRODUCTS[String(packCode || "").trim()] || null) as GoogleCreditsProductId | null;
}

function expoProductType(type: GooglePurchaseType): ExpoIapProductType {
  // expo-iap 2.9 examples use "inapp"; newer docs may say "in-app".
  // Use "inapp" for the primary path and retry alternate shapes below when needed.
  return type === "subs" ? "subs" : "inapp";
}

function requireGooglePlayIapRuntime(): any {
  let mod: any = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require("expo-iap");
  } catch {
    mod = null;
  }
  if (!mod) {
    throw new Error(
      "Google Play Billing runtime is unavailable. Build Android with expo-iap installed; Expo Go cannot run Google Play Billing."
    );
  }
  return mod;
}

function optionalGooglePlayIapRuntime(): any | null {
  try {
    return requireGooglePlayIapRuntime();
  } catch {
    return null;
  }
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.products)) return value.products;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.subscriptions)) return value.subscriptions;
  if (Array.isArray(value?.response)) return value.response;
  if (Array.isArray(value?.result)) return value.result;
  return value ? [value] : [];
}

function safeJson(value: any) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function messageOf(error: any) {
  return String(error?.message || error?.debugMessage || error?.localizedMessage || error || "Unknown error");
}

function codeOf(error: any) {
  return String(error?.code || error?.responseCode || error?.errorCode || error?.name || "").trim() || null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested = firstNonEmptyString(...value);
      if (nested) return nested;
      continue;
    }
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

function normalizeGooglePurchase(raw: any): NormalizedPurchase {
  const purchase = Array.isArray(raw) ? raw[0] : raw?.purchase || raw?.response || raw?.result || raw;
  const purchaseToken = firstNonEmptyString(
    purchase?.purchaseToken,
    purchase?.purchase_token,
    purchase?.purchaseTokenAndroid,
    purchase?.purchase_token_android,
    purchase?.transactionReceiptAndroid,
    purchase?.receiptAndroid,
    purchase?.token,
    purchase?.verificationData?.serverVerificationData,
    purchase?.transactionReceipt
  );
  const productId = firstNonEmptyString(
    purchase?.productId,
    purchase?.product_id,
    purchase?.sku,
    purchase?.id,
    purchase?.products,
    purchase?.productIds,
    purchase?.skus
  );
  const orderId = firstNonEmptyString(
    purchase?.orderId,
    purchase?.order_id,
    purchase?.transactionId,
    purchase?.transaction_id,
    purchase?.id
  );

  return {
    raw: purchase || raw || {},
    productId: productId || "",
    purchaseToken: purchaseToken || "",
    orderId: orderId || null,
  };
}

export function getGooglePlayIapRuntimeDiagnostic(): RuntimeDiagnostic {
  const iap = optionalGooglePlayIapRuntime();
  const keys = Object.keys(iap || {}).sort();
  return {
    platform: Platform.OS,
    moduleLoaded: Boolean(iap),
    moduleKeys: keys,
    hasUseIAP: typeof iap?.useIAP === "function",
    hasInitConnection: typeof iap?.initConnection === "function",
    hasInitConnectionAsync: typeof iap?.initConnectionAsync === "function",
    hasConnectAsync: typeof iap?.connectAsync === "function",
    hasFetchProducts: typeof iap?.fetchProducts === "function",
    hasRequestProducts: typeof iap?.requestProducts === "function",
    hasGetProducts: typeof iap?.getProducts === "function",
    hasGetSubscriptions: typeof iap?.getSubscriptions === "function",
    hasRequestPurchase: typeof iap?.requestPurchase === "function",
    hasGetAvailablePurchases: typeof iap?.getAvailablePurchases === "function",
    hasFinishTransaction: typeof iap?.finishTransaction === "function",
  };
}

export function resetGooglePlayBillingConnectionForRetry() {
  connectionPromise = null;
}

export async function ensureGooglePlayBillingReady() {
  if (!isGooglePlayBillingPlatform()) {
    throw new Error("Google Play Billing is only available on Android.");
  }

  const iap = requireGooglePlayIapRuntime();
  const diagnostic = getGooglePlayIapRuntimeDiagnostic();
  console.log("GOOGLE_IAP_RUNTIME_DIAGNOSTIC", {
    ...diagnostic,
    moduleKeys: diagnostic.moduleKeys.slice(0, 120),
  });

  if (!connectionPromise) {
    connectionPromise = (async () => {
      try {
        if (typeof iap.initConnection === "function") {
          const result = await iap.initConnection();
          console.log("GOOGLE_IAP_CONNECTION_READY", { api: "initConnection", result });
          return result !== false;
        }
        if (typeof iap.initConnectionAsync === "function") {
          const result = await iap.initConnectionAsync();
          console.log("GOOGLE_IAP_CONNECTION_READY", { api: "initConnectionAsync", result });
          return result !== false;
        }
        if (typeof iap.connectAsync === "function") {
          const result = await iap.connectAsync();
          console.log("GOOGLE_IAP_CONNECTION_READY", { api: "connectAsync", result });
          return result !== false;
        }

        // expo-iap 2.9 and 3.x primarily document useIAP(). Some builds expose
        // direct top-level functions, while others expose only hook methods. If
        // direct product + purchase APIs exist, continue and let the product query
        // prove readiness. If only useIAP exists, the screen must use the hook.
        const hasDirectApis =
          (typeof iap.fetchProducts === "function" ||
            typeof iap.requestProducts === "function" ||
            typeof iap.getProducts === "function" ||
            typeof iap.getSubscriptions === "function") &&
          typeof iap.requestPurchase === "function";

        if (hasDirectApis) {
          console.log("GOOGLE_IAP_CONNECTION_READY", { api: "implicit-direct-apis" });
          return true;
        }

        if (typeof iap.useIAP === "function") {
          throw new Error(
            "This expo-iap build exposes the useIAP() hook, but not direct connection/purchase functions. Wire TopUpScreen through useIAP() and pass connected/requestProducts/requestPurchase/currentPurchase to the purchase flow."
          );
        }

        throw new Error(
          `Unsupported expo-iap runtime shape. Exported keys: ${diagnostic.moduleKeys.slice(0, 40).join(", ") || "none"}`
        );
      } catch (error: any) {
        connectionPromise = null;
        const message = messageOf(error);
        console.log("GOOGLE_IAP_CONNECTION_ERROR", {
          message,
          code: codeOf(error),
          raw: safeJson(error),
        });
        throw new Error(`Google Play Billing connection failed: ${message}`);
      }
    })();
  }

  const ready = await connectionPromise;
  if (!ready) {
    connectionPromise = null;
    throw new Error(
      "Google Play Billing connection failed. Use a Play-enabled Android device/emulator and a Play testing install."
    );
  }
}

async function fetchProducts(productIds: string[], type: GooglePurchaseType) {
  await ensureGooglePlayBillingReady();
  const iap = requireGooglePlayIapRuntime();
  const mappedType = expoProductType(type);

  const attempts: Array<{ name: string; run: () => Promise<any> }> = [];

  if (typeof iap.fetchProducts === "function") {
    attempts.push({ name: "fetchProducts", run: () => iap.fetchProducts({ skus: productIds, type: mappedType }) });
    if (mappedType === "inapp") {
      attempts.push({ name: "fetchProducts/in-app", run: () => iap.fetchProducts({ skus: productIds, type: "in-app" }) });
    }
  }
  if (typeof iap.requestProducts === "function") {
    attempts.push({ name: "requestProducts", run: () => iap.requestProducts({ skus: productIds, type: mappedType }) });
    if (mappedType === "inapp") {
      attempts.push({ name: "requestProducts/in-app", run: () => iap.requestProducts({ skus: productIds, type: "in-app" }) });
    }
  }
  if (mappedType === "subs" && typeof iap.getSubscriptions === "function") {
    attempts.push({ name: "getSubscriptions", run: () => iap.getSubscriptions(productIds) });
  }
  if (mappedType !== "subs" && typeof iap.getProducts === "function") {
    attempts.push({ name: "getProducts", run: () => iap.getProducts(productIds) });
  }

  let lastError: any = null;
  for (const attempt of attempts) {
    try {
      const result = asArray(await attempt.run());
      console.log("GOOGLE_IAP_PRODUCTS_DEBUG", {
        api: attempt.name,
        requested: productIds,
        type: mappedType,
        count: result.length,
        returnedIds: result.map((p: any) => p?.id || p?.productId || p?.sku || p?.title).slice(0, 10),
      });
      if (result.length > 0) return result;
    } catch (error: any) {
      lastError = error;
      console.log("GOOGLE_IAP_PRODUCTS_ERROR", {
        api: attempt.name,
        requested: productIds,
        type: mappedType,
        message: messageOf(error),
        code: codeOf(error),
        raw: safeJson(error),
      });
    }
  }

  if (lastError) {
    throw new Error(`Unable to load Google Play product details: ${messageOf(lastError)}`);
  }

  throw new Error(
    `Google Play did not return product details for ${productIds.join(", ")}. Confirm product IDs are active in Play Console and this app is installed through a Play testing track/license tester setup.`
  );
}

function productIdOf(product: any) {
  return String(product?.productId ?? product?.id ?? product?.sku ?? "").trim();
}

function chooseFirstOfferToken(product: any, basePlanId?: string | null): string | null {
  const offers = asArray(
    product?.subscriptionOfferDetails ||
      product?.subscriptionOfferDetailsAndroid ||
      product?.subscription_offers ||
      product?.offers
  );
  const match =
    offers.find((offer) => {
      const offerBasePlan = String(offer?.basePlanId ?? offer?.base_plan_id ?? "").trim();
      return basePlanId && offerBasePlan === basePlanId;
    }) || offers[0];

  return firstNonEmptyString(match?.offerToken, match?.offer_token) || null;
}

async function pollAvailablePurchasesForToken(productId: string, type: GooglePurchaseType) {
  const iap = requireGooglePlayIapRuntime();
  if (typeof iap.getAvailablePurchases !== "function") return null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const purchases = asArray(await iap.getAvailablePurchases());
      const match = purchases.find((purchase: any) => {
        const normalized = normalizeGooglePurchase(purchase);
        return (normalized.productId || productId) === productId && Boolean(normalized.purchaseToken);
      });
      if (match) {
        console.log("GOOGLE_IAP_PURCHASE_POLLED", { productId, type, attempt });
        return match;
      }
    } catch (error: any) {
      console.log("GOOGLE_IAP_PURCHASE_POLL_ERROR", {
        productId,
        type,
        attempt,
        message: messageOf(error),
        code: codeOf(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return null;
}

function buildPurchaseAttemptPayloads(params: {
  productId: string;
  type: GooglePurchaseType;
  userId: string;
  offerToken?: string | null;
}) {
  const mappedType = expoProductType(params.type);
  const androidBase: Record<string, any> = {
    skus: [params.productId],
    obfuscatedAccountIdAndroid: params.userId,
  };
  if (params.type === "subs" && params.offerToken) {
    androidBase.subscriptionOffers = [{ sku: params.productId, offerToken: params.offerToken }];
  }

  const googleBase: Record<string, any> = {
    skus: [params.productId],
    obfuscatedAccountIdAndroid: params.userId,
  };
  if (params.type === "subs" && params.offerToken) {
    googleBase.subscriptionOffers = [{ sku: params.productId, offerToken: params.offerToken }];
  }

  const attempts: Array<{ name: string; payload: any }> = [
    // Current docs use google; 2.9 docs use android. Keep both so builds do not
    // fail merely because the installed expo-iap bridge differs.
    { name: "request.google", payload: { request: { google: googleBase }, type: mappedType } },
    { name: "request.android", payload: { request: { android: androidBase }, type: mappedType } },
    { name: "request.legacy", payload: { request: androidBase, type: mappedType } },
  ];

  if (mappedType === "inapp") {
    attempts.push({ name: "request.google.in-app", payload: { request: { google: googleBase }, type: "in-app" } });
    attempts.push({ name: "request.android.in-app", payload: { request: { android: androidBase }, type: "in-app" } });
  }

  return attempts;
}

async function requestGooglePurchase(params: {
  productId: string;
  userId: string;
  type: GooglePurchaseType;
  basePlanId?: string | null;
}) {
  await ensureGooglePlayBillingReady();

  const iap = requireGooglePlayIapRuntime();
  const products = await fetchProducts([params.productId], params.type);
  const product = products.find((p: any) => productIdOf(p) === params.productId) || products[0];

  if (!product) {
    throw new Error(
      `Google Play did not return product details for ${params.productId}. Confirm the product is active in Play Console and the tester is opted into the Play track.`
    );
  }

  const offerToken = params.type === "subs" ? chooseFirstOfferToken(product, params.basePlanId) : null;

  if (params.type === "subs" && !offerToken) {
    console.log("GOOGLE_IAP_SUBSCRIPTION_OFFER_MISSING", {
      productId: params.productId,
      basePlanId: params.basePlanId || null,
      productKeys: Object.keys(product || {}).sort(),
    });
    throw new Error(
      `Google Play returned ${params.productId}, but no subscription offer token was available for base plan ${params.basePlanId || "default"}. Confirm the base plan is active and the tester is opted into the Play track.`
    );
  }

  if (typeof iap.requestPurchase !== "function") {
    throw new Error(
      "Installed expo-iap runtime does not expose requestPurchase(). The TopUpScreen must use the useIAP() hook purchase API for this expo-iap version."
    );
  }

  console.log("GOOGLE_IAP_REQUEST_START", {
    productId: params.productId,
    type: expoProductType(params.type),
    basePlanId: params.basePlanId || null,
    hasOfferToken: Boolean(offerToken),
  });

  const attempts = buildPurchaseAttemptPayloads({
    productId: params.productId,
    type: params.type,
    userId: params.userId,
    offerToken,
  });

  let lastError: any = null;
  for (const attempt of attempts) {
    try {
      console.log("GOOGLE_IAP_REQUEST_ATTEMPT", { api: attempt.name, productId: params.productId });
      const requestResult = await iap.requestPurchase(attempt.payload);
      const immediate = normalizeGooglePurchase(requestResult);
      if (immediate.purchaseToken) {
        console.log("GOOGLE_IAP_REQUEST_RETURNED_PURCHASE", {
          api: attempt.name,
          productId: immediate.productId || params.productId,
          tokenLen: immediate.purchaseToken.length,
        });
        return requestResult;
      }

      const polled = await pollAvailablePurchasesForToken(params.productId, params.type);
      if (polled) return polled;

      // Purchase sheet may have opened and completion may be listener-based.
      // Continue to explicit error so the screen does not appear dead.
      throw new Error(
        "Google Play purchase flow started but did not return a purchase token to this service wrapper. Wire useIAP().currentPurchase handling in TopUpScreen to complete backend confirmation."
      );
    } catch (error: any) {
      lastError = error;
      const message = messageOf(error);
      console.log("GOOGLE_IAP_REQUEST_ERROR", {
        api: attempt.name,
        productId: params.productId,
        message,
        code: codeOf(error),
        raw: safeJson(error),
      });

      // Only retry alternate shapes for argument/signature errors. For user
      // cancellation or store/runtime failures, fail fast with the real message.
      if (/cancel|user.*cancel|user.*canceled|cancelled/i.test(message)) {
        throw new Error("Google Play purchase was canceled.");
      }
      if (!/request|android|google|sku|skus|shape|argument|parameter|type|offer/i.test(message)) {
        throw new Error(`Google Play purchase could not start: ${message}`);
      }
    }
  }

  throw new Error(`Google Play purchase could not start: ${messageOf(lastError)}`);
}

export async function purchaseGoogleCreditsPackAndConfirm(params: {
  productId: GoogleCreditsProductId;
  userId: string;
  countryCode?: string;
  currency?: string;
}): Promise<GooglePurchaseConfirmResponse> {
  console.log("GOOGLE_IAP_CREDITS_START", {
    productId: params.productId,
    userId: params.userId,
    countryCode: params.countryCode || null,
    currency: params.currency || null,
  });

  const rawPurchase = await requestGooglePurchase({
    productId: params.productId,
    userId: params.userId,
    type: "in-app",
  });
  const normalized = normalizeGooglePurchase(rawPurchase);

  console.log("GOOGLE_IAP_CREDITS_PURCHASE_RECEIVED", {
    productId: normalized.productId || params.productId,
    purchaseTokenLen: normalized.purchaseToken.length,
    purchaseTokenPrefix: normalized.purchaseToken.slice(0, 10),
    orderId: normalized.orderId,
  });

  if (!normalized.purchaseToken) {
    throw new Error("Google Play purchase completed, but no purchaseToken was returned.");
  }

  console.log("GOOGLE_IAP_CREDITS_CONFIRM_BACKEND_START", {
    googleProductId: normalized.productId || params.productId,
    packageName: "ai.desifaces.app",
  });

  return apiConfirmGoogleCreditsPurchase({
    googleProductId: normalized.productId || params.productId,
    purchaseToken: normalized.purchaseToken,
    packageName: "ai.desifaces.app",
    orderId: normalized.orderId,
    countryCode: params.countryCode,
    currency: params.currency,
    rawPurchaseJson: normalized.raw,
  });
}

export async function purchaseGoogleSubscriptionAndConfirm(params: {
  productId: GoogleSubscriptionProductId;
  basePlanId?: string | null;
  userId: string;
  countryCode?: string;
  currency?: string;
}): Promise<GooglePurchaseConfirmResponse> {
  console.log("GOOGLE_IAP_SUBSCRIPTION_START", {
    productId: params.productId,
    basePlanId: params.basePlanId || null,
    userId: params.userId,
    countryCode: params.countryCode || null,
    currency: params.currency || null,
  });

  const rawPurchase = await requestGooglePurchase({
    productId: params.productId,
    userId: params.userId,
    type: "subs",
    basePlanId: params.basePlanId,
  });
  const normalized = normalizeGooglePurchase(rawPurchase);

  console.log("GOOGLE_IAP_SUBSCRIPTION_PURCHASE_RECEIVED", {
    productId: normalized.productId || params.productId,
    basePlanId: params.basePlanId || null,
    purchaseTokenLen: normalized.purchaseToken.length,
    purchaseTokenPrefix: normalized.purchaseToken.slice(0, 10),
    orderId: normalized.orderId,
  });

  if (!normalized.purchaseToken) {
    throw new Error("Google Play subscription completed, but no purchaseToken was returned.");
  }

  console.log("GOOGLE_IAP_SUBSCRIPTION_CONFIRM_BACKEND_START", {
    googleProductId: normalized.productId || params.productId,
    basePlanId: params.basePlanId || null,
    packageName: "ai.desifaces.app",
  });

  return apiConfirmGoogleSubscriptionPurchase({
    googleProductId: normalized.productId || params.productId,
    basePlanId: params.basePlanId || undefined,
    purchaseToken: normalized.purchaseToken,
    packageName: "ai.desifaces.app",
    orderId: normalized.orderId,
    countryCode: params.countryCode,
    currency: params.currency,
    rawPurchaseJson: normalized.raw,
  });
}
