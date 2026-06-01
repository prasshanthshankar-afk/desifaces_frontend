import { Platform } from "react-native";
import * as PaymentsApi from "./apiPayments";

export type AppleSubscriptionProductId =
  | "ai.desifaces.pro.monthly"
  | "ai.desifaces.pro.yearly"
  | "ai.desifaces.business.monthly"
  | "ai.desifaces.business.yearly";

export type AppleCreditsProductId =
  | "ai.desifaces.credits.1000"
  | "ai.desifaces.credits.5000"
  | "ai.desifaces.credits.15000";

export type AppleProductKind = "subs" | "inapp";
type ApplePurchaseKind = "subscription" | "credits";

type NativeSubscription = {
  remove?: () => void;
  unsubscribe?: () => void;
};

export type AppleIapBackendPayload = {
  signedTransactionInfo: string;
  signedRenewalInfo?: string | null;
  transactionId?: string | null;
  originalTransactionId?: string | null;
  environment?: string | null;
  appAccountToken?: string | null;
  currency?: string | null;
  countryCode?: string | null;
  storefront?: string | null;
};

export type AppleRestoreResult = {
  restoredCount: number;
  subscriptionResults: PaymentsApi.AppleSubscriptionConfirmResponse[];
};

export const APPLE_SUBSCRIPTION_PRODUCTS: Record<string, AppleSubscriptionProductId> = {
  pro_monthly_v1: "ai.desifaces.pro.monthly",
  pro_yearly_v1: "ai.desifaces.pro.yearly",
  business_monthly_v1: "ai.desifaces.business.monthly",
  business_yearly_v1: "ai.desifaces.business.yearly",
};

export const APPLE_TOPUP_PRODUCTS: Record<string, AppleCreditsProductId> = {
  PACK_USD_1000: "ai.desifaces.credits.1000",
  PACK_INR_1000: "ai.desifaces.credits.1000",
  PACK_USD_5000: "ai.desifaces.credits.5000",
  PACK_INR_5000: "ai.desifaces.credits.5000",
  PACK_USD_15000: "ai.desifaces.credits.15000",
  PACK_INR_15000: "ai.desifaces.credits.15000",
};

let iapConnectionPromise: Promise<void> | null = null;

export function isAppleBillingPlatform() {
  return Platform.OS === "ios";
}

function requireAppleIapRuntime(): any {
  let mod: any = null;
  try {
    // Keep this as a lazy require. Importing expo-iap at module load time can
    // crash Expo Go or web because the native module is not present there.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require("expo-iap");
  } catch {
    mod = null;
  }

  if (!mod) {
    throw new Error(
      "Apple IAP runtime is not available in this build. Use a custom Expo development build, TestFlight, or an App Store build with expo-iap installed and configured."
    );
  }

  // Different expo-iap builds expose core methods either as named exports,
  // default exports, or nested native-module exports. Merge them so runtime
  // detection does not falsely fail on a valid dev-client build.
  return {
    ...(mod?.default || {}),
    ...(mod?.ExpoIap || {}),
    ...(mod?.ExpoIAP || {}),
    ...(mod?.NativeExpoIap || {}),
    ...mod,
  };
}

function asString(value: any): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstNonEmptyString(...values: any[]): string {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return "";
}


function errorField(error: unknown, key: "code" | "name" | "message"): string {
  if (!error || typeof error !== "object") return "";
  const value = (error as Record<string, unknown>)[key];
  return asString(value);
}

function errorCodeText(error: unknown): string {
  return firstNonEmptyString(errorField(error, "code"), errorField(error, "name"));
}

function errorMessageText(error: unknown): string {
  return firstNonEmptyString(errorField(error, "message"), error);
}

function normalizedProductId(raw: any): string {
  return firstNonEmptyString(
    raw?.productId,
    raw?.product_id,
    raw?.productIdentifier,
    raw?.product_identifier,
    raw?.sku,
    raw?.id
  );
}

function normalizeProductArray(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.products)) return raw.products;
  if (Array.isArray(raw.subscriptions)) return raw.subscriptions;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(raw.data)) return raw.data;
  return [];
}

function normalizePurchaseArray(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.purchases)) return raw.purchases;
  if (Array.isArray(raw.results)) return raw.results;
  if (Array.isArray(raw.data)) return raw.data;
  return [raw];
}

function isLikelyPurchasePayload(raw: any): boolean {
  if (!raw) return false;
  if (Array.isArray(raw)) return raw.some(isLikelyPurchasePayload);
  return Boolean(
    firstNonEmptyString(
      raw?.signedTransactionInfo,
      raw?.signed_transaction_info,
      raw?.signedTransactionInfoIOS,
      raw?.signedTransactionInfoIos,
      raw?.transactionInfoIOS,
      raw?.transactionInfoIos,
      raw?.jwsRepresentation,
      raw?.transactionReceipt,
      raw?.transactionReceiptBase64,
      raw?.receipt,
      raw?.purchaseToken,
      raw?.purchaseTokenAndroid,
      raw?.transactionId,
      raw?.transaction_id
    )
  );
}

function pickMatchingPurchase(raw: any, productId: string): any | null {
  const purchases = normalizePurchaseArray(raw);
  if (!purchases.length) return null;

  const exact = purchases.find((purchase) => normalizedProductId(purchase) === productId);
  if (exact) return exact;

  const likely = purchases.find(isLikelyPurchasePayload);
  return likely || purchases[0] || null;
}

function removeNativeSubscription(subscription: NativeSubscription | null | undefined) {
  try {
    if (subscription?.remove) subscription.remove();
    else if (subscription?.unsubscribe) subscription.unsubscribe();
  } catch {
    // best effort cleanup only
  }
}

function userCancelledApplePurchase(error: unknown): boolean {
  const code = errorCodeText(error).toUpperCase();
  const message = errorMessageText(error).toLowerCase();
  return (
    code.includes("USER_CANCEL") ||
    code.includes("E_USER_CANCELLED") ||
    code.includes("E_USER_CANCELLED") ||
    message.includes("cancelled") ||
    message.includes("canceled") ||
    message.includes("user cancel")
  );
}

export function getReadableAppleIapError(error: unknown): string {
  if (userCancelledApplePurchase(error)) return "Purchase was cancelled.";

  const code = errorCodeText(error).toUpperCase();
  const message = errorMessageText(error);

  if (code.includes("ITEM_UNAVAILABLE") || code.includes("PRODUCT_NOT_AVAILABLE")) {
    return "This Apple subscription product is not available in the current build or App Store sandbox account.";
  }
  if (code.includes("NETWORK")) {
    return "Apple purchase failed because of a network issue. Please check your connection and retry.";
  }
  if (code.includes("ALREADY_OWNED")) {
    return "Apple says this product is already owned. Use Restore Purchases or manage the subscription from Apple settings.";
  }
  if (message) return message;
  return "Apple purchase failed. Please retry or contact support.";
}

async function ensureAppleIapConnection(iap: any): Promise<void> {
  if (iapConnectionPromise) return iapConnectionPromise;

  iapConnectionPromise = (async () => {
    if (typeof iap.initConnection === "function") {
      await iap.initConnection();
      return;
    }
    if (typeof iap.initConnectionAsync === "function") {
      await iap.initConnectionAsync();
      return;
    }
    if (typeof iap.connectAsync === "function") {
      await iap.connectAsync();
      return;
    }
  })().catch((error) => {
    iapConnectionPromise = null;
    throw error;
  });

  return iapConnectionPromise;
}

async function fetchProductsWithType(iap: any, productIds: string[], kind: AppleProductKind): Promise<any[]> {
  const skus = productIds.map((x) => asString(x)).filter(Boolean);
  if (!skus.length) return [];

  await ensureAppleIapConnection(iap);

  const attempts: Array<() => Promise<any>> = [];

  if (typeof iap.fetchProducts === "function") {
    attempts.push(() => iap.fetchProducts({ skus, type: kind }));
    // expo-iap 3.x docs/examples may use in-app while 2.9 uses inapp.
    if (kind === "inapp") {
      attempts.push(() => iap.fetchProducts({ skus, type: "in-app" }));
    }
  }

  // expo-iap 2.9 commonly exposes requestProducts; docs mark it as
  // deprecated in favor of fetchProducts, but many installed 2.9 builds still
  // only expose requestProducts. Keep this fallback to avoid a false
  // "unsupported product fetch API" failure.
  if (typeof iap.requestProducts === "function") {
    attempts.push(() => iap.requestProducts({ skus, type: kind }));
    if (kind === "inapp") {
      attempts.push(() => iap.requestProducts({ skus, type: "in-app" }));
    }
  }

  if (kind === "subs" && typeof iap.getSubscriptions === "function") {
    attempts.push(() => iap.getSubscriptions(skus));
    attempts.push(() => iap.getSubscriptions({ skus }));
  }

  if (kind === "inapp" && typeof iap.getProducts === "function") {
    attempts.push(() => iap.getProducts(skus));
    attempts.push(() => iap.getProducts({ skus }));
  }

  if (typeof iap.getProductsAsync === "function") {
    attempts.push(() => iap.getProductsAsync(skus));
  }

  let lastError: any = null;
  for (const attempt of attempts) {
    try {
      const products = normalizeProductArray(await attempt());
      if (products.length) return products;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("Installed Apple IAP runtime does not expose fetchProducts/requestProducts/getProducts/getSubscriptions. Rebuild the iOS dev client after installing expo-iap, and confirm the native module is included.");
}

async function fetchRequiredProduct(iap: any, productId: string, kind: AppleProductKind): Promise<any> {
  const products = await fetchProductsWithType(iap, [productId], kind);
  const match = products.find((product) => normalizedProductId(product) === productId) || products[0];
  if (!match) {
    throw new Error(
      `Apple product ${productId} is not available. Confirm the product exists in App Store Connect or the local StoreKit config, and that this build has IAP capability enabled.`
    );
  }
  return match;
}

function createPurchaseWaiter(iap: any, productId: string, timeoutMs = 120_000) {
  if (typeof iap.purchaseUpdatedListener !== "function" && typeof iap.purchaseErrorListener !== "function") {
    return null;
  }

  let updateSub: NativeSubscription | null = null;
  let errorSub: NativeSubscription | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    removeNativeSubscription(updateSub);
    removeNativeSubscription(errorSub);
    updateSub = null;
    errorSub = null;
  };

  const promise = new Promise<any>((resolve, reject) => {
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    if (typeof iap.purchaseUpdatedListener === "function") {
      updateSub = iap.purchaseUpdatedListener((purchase: any) => {
        const purchaseProductId = normalizedProductId(purchase);
        if (purchaseProductId && purchaseProductId !== productId) return;
        finish(() => resolve(purchase));
      });
    }

    if (typeof iap.purchaseErrorListener === "function") {
      errorSub = iap.purchaseErrorListener((error: any) => {
        finish(() => reject(error));
      });
    }

    timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            "Timed out waiting for Apple purchase confirmation from StoreKit. If the sheet is still open, finish or cancel it and retry."
          )
        )
      );
    }, timeoutMs);
  });

  return {
    promise,
    cancel: cleanup,
  };
}

async function requestApplePurchase(iap: any, params: {
  productId: string;
  appAccountToken: string;
  kind: AppleProductKind;
}) {
  const { productId, appAccountToken, kind } = params;

  if (typeof iap.requestPurchase === "function") {
    const attempts: Array<() => Promise<any>> = [
      () =>
        iap.requestPurchase({
          request: {
            ios: {
              sku: productId,
              appAccountToken,
            },
            android: {
              skus: [productId],
            },
          },
          type: kind,
        }),
      () =>
        iap.requestPurchase({
          request: {
            apple: {
              sku: productId,
              appAccountToken,
            },
            google: {
              skus: [productId],
            },
          },
          type: kind === "inapp" ? "in-app" : kind,
        }),
      () =>
        iap.requestPurchase({
          request: {
            sku: productId,
            appAccountToken,
          },
          type: kind,
        }),
    ];

    let lastError: any = null;
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (error) {
        lastError = error;
        const msg = errorMessageText(error).toLowerCase();
        const code = errorCodeText(error).toLowerCase();
        const maybeShapeError =
          msg.includes("invalid") ||
          msg.includes("argument") ||
          msg.includes("request") ||
          msg.includes("type") ||
          code.includes("invalid") ||
          code.includes("argument");
        if (!maybeShapeError || userCancelledApplePurchase(error)) {
          throw error;
        }
      }
    }
    throw lastError || new Error("Apple purchase request failed.");
  }

  if (typeof iap.purchaseProductAsync === "function") {
    return await iap.purchaseProductAsync(productId, { appAccountToken });
  }
  if (typeof iap.purchaseProduct === "function") {
    return await iap.purchaseProduct({ sku: productId, appAccountToken });
  }
  if (typeof iap.requestSubscription === "function" && kind === "subs") {
    return await iap.requestSubscription({
      request: {
        sku: productId,
        appAccountToken,
      },
    });
  }

  throw new Error("Installed Apple IAP runtime does not expose a supported purchase API.");
}

async function purchaseProduct(params: {
  productId: string;
  appAccountToken: string;
  kind: AppleProductKind;
  timeoutMs?: number;
}) {
  const iap = requireAppleIapRuntime();
  await ensureAppleIapConnection(iap);
  await fetchRequiredProduct(iap, params.productId, params.kind);

  const waiter = createPurchaseWaiter(iap, params.productId, params.timeoutMs);

  try {
    console.log("DF_APPLE_IAP_REQUEST_PURCHASE", {
      productId: params.productId,
      kind: params.kind,
      hasPurchaseUpdatedListener: typeof iap.purchaseUpdatedListener === "function",
      hasPurchaseErrorListener: typeof iap.purchaseErrorListener === "function",
    });

    const directResult = await requestApplePurchase(iap, params);
    const directPurchase = pickMatchingPurchase(directResult, params.productId);

    // Some runtimes return the purchase directly. expo-iap normally emits it
    // asynchronously through purchaseUpdatedListener, so only resolve directly
    // when the returned value actually contains purchase/receipt data.
    if (isLikelyPurchasePayload(directPurchase)) {
      return directPurchase;
    }

    if (waiter) {
      return await waiter.promise;
    }

    throw new Error(
      "Apple purchase request was started, but this IAP runtime did not return a purchase and does not expose purchase listeners."
    );
  } catch (error) {
    waiter?.cancel();
    throw error;
  }
}

function normalizePurchasedPayload(raw: any): AppleIapBackendPayload {
  const signedTransactionInfo = firstNonEmptyString(
    raw?.signedTransactionInfo,
    raw?.signed_transaction_info,
    raw?.signedTransactionInfoIOS,
    raw?.signedTransactionInfoIos,
    raw?.transactionInfoIOS,
    raw?.transactionInfoIos,
    raw?.jwsRepresentation,
    raw?.transactionReceipt,
    raw?.transactionReceiptBase64,
    raw?.receipt,
    raw?.purchaseToken,
    raw?.purchaseTokenAndroid
  );

  const signedRenewalInfo = firstNonEmptyString(
    raw?.signedRenewalInfo,
    raw?.signed_renewal_info,
    raw?.signedRenewalInfoIOS,
    raw?.signedRenewalInfoIos,
    raw?.renewalInfoIOS,
    raw?.renewalInfoIos
  );

  return {
    signedTransactionInfo,
    signedRenewalInfo: signedRenewalInfo || null,
    transactionId:
      firstNonEmptyString(raw?.transactionId, raw?.transaction_id, raw?.id) || null,
    originalTransactionId:
      firstNonEmptyString(
        raw?.originalTransactionId,
        raw?.original_transaction_id,
        raw?.originalTransactionIdentifierIOS,
        raw?.originalTransactionIdentifierIos,
        raw?.originalTransactionIdentifier
      ) || null,
    environment:
      firstNonEmptyString(raw?.environment, raw?.environmentIOS, raw?.environmentIos) ||
      "Sandbox",
    appAccountToken:
      firstNonEmptyString(raw?.appAccountToken, raw?.app_account_token) || null,
    currency: firstNonEmptyString(raw?.currency, raw?.currencyCode).toUpperCase() || null,
    countryCode:
      firstNonEmptyString(raw?.countryCode, raw?.country_code, raw?.country).toUpperCase() || null,
    storefront:
      firstNonEmptyString(raw?.storefront, raw?.storefrontCountryCode, raw?.storefront_country_code) ||
      null,
  };
}

async function finishAppleTransactionBestEffort(rawPurchase: any, options: { isConsumable: boolean }) {
  const iap = requireAppleIapRuntime();
  if (typeof iap.finishTransaction !== "function") return;

  try {
    await iap.finishTransaction({ purchase: rawPurchase, isConsumable: options.isConsumable });
  } catch (error) {
    console.warn("DF_APPLE_IAP_FINISH_TRANSACTION_FAILED", {
      productId: normalizedProductId(rawPurchase),
      message: errorMessageText(error),
      code: errorCodeText(error),
    });
  }
}

export async function loadAppleProducts(productIds: string[], kind: AppleProductKind = "inapp") {
  if (!isAppleBillingPlatform()) return [];
  const iap = requireAppleIapRuntime();
  return await fetchProductsWithType(iap, productIds, kind);
}

export async function loadAppleSubscriptionProducts(productIds: string[]) {
  return await loadAppleProducts(productIds, "subs");
}

export async function loadAppleCreditProducts(productIds: string[]) {
  return await loadAppleProducts(productIds, "inapp");
}

export function appleSubscriptionProductIdForPlan(
  planCode?: string | null,
  explicitProductId?: string | null
) {
  const explicit = asString(explicitProductId);
  if (explicit) return explicit as AppleSubscriptionProductId;
  const key = asString(planCode);
  return (APPLE_SUBSCRIPTION_PRODUCTS[key] || null) as AppleSubscriptionProductId | null;
}

export function appleCreditsProductIdForPack(
  packCode?: string | null,
  explicitProductId?: string | null
) {
  const explicit = asString(explicitProductId);
  if (explicit) return explicit as AppleCreditsProductId;
  const key = asString(packCode);
  return (APPLE_TOPUP_PRODUCTS[key] || null) as AppleCreditsProductId | null;
}

async function purchaseAndNormalize(params: {
  productId: string;
  userId: string;
  kind: AppleProductKind;
  purchaseKind: ApplePurchaseKind;
}) {
  if (!isAppleBillingPlatform()) {
    throw new Error(
      params.purchaseKind === "subscription"
        ? "Apple subscription purchase is only available on iPhone."
        : "Apple IAP credits purchase is only available on iPhone."
    );
  }

  const rawPurchase = await purchaseProduct({
    productId: params.productId,
    appAccountToken: params.userId,
    kind: params.kind,
  });
  const normalized = normalizePurchasedPayload(rawPurchase);

  console.log("DF_APPLE_IAP_PURCHASE_RECEIVED", {
    productId: params.productId,
    purchaseProductId: normalizedProductId(rawPurchase),
    purchaseKind: params.purchaseKind,
    hasSignedTransactionInfo: Boolean(normalized.signedTransactionInfo),
    hasSignedRenewalInfo: Boolean(normalized.signedRenewalInfo),
    transactionId: normalized.transactionId,
    originalTransactionId: normalized.originalTransactionId,
    environment: normalized.environment,
  });

  if (!normalized.signedTransactionInfo) {
    throw new Error(
      "Apple purchase completed but no signed transaction payload was returned. Confirm the expo-iap native adapter exposes StoreKit transaction/receipt data in this build."
    );
  }

  return { rawPurchase, normalized };
}

export async function purchaseAppleCreditsPackAndConfirm(params: {
  productId: AppleCreditsProductId | string;
  userId: string;
  countryCode?: string;
  currency?: string;
}) {
  const productId = asString(params.productId) as AppleCreditsProductId;
  if (!productId) throw new Error("Missing Apple credits product id.");

  const { rawPurchase, normalized } = await purchaseAndNormalize({
    productId,
    userId: params.userId,
    kind: "inapp",
    purchaseKind: "credits",
  });

  const confirmed = await PaymentsApi.apiConfirmAppleCreditsPurchase({
    appleProductId: productId,
    signedTransactionInfo: normalized.signedTransactionInfo,
    transactionId: normalized.transactionId,
    originalTransactionId: normalized.originalTransactionId,
    environment: normalized.environment,
    appAccountToken: params.userId,
    currency: normalized.currency || params.currency || undefined,
    countryCode: normalized.countryCode || params.countryCode || undefined,
    storefront: normalized.storefront || undefined,
  });

  await finishAppleTransactionBestEffort(rawPurchase, { isConsumable: true });
  return confirmed;
}

export async function purchaseAppleSubscriptionAndConfirm(params: {
  productId: AppleSubscriptionProductId | string;
  userId: string;
  countryCode?: string;
  currency?: string;
}) {
  const productId = asString(params.productId) as AppleSubscriptionProductId;
  if (!productId) throw new Error("Missing Apple subscription product id.");

  const { rawPurchase, normalized } = await purchaseAndNormalize({
    productId,
    userId: params.userId,
    kind: "subs",
    purchaseKind: "subscription",
  });

  const confirmed = await PaymentsApi.apiConfirmAppleSubscriptionPurchase({
    appleProductId: productId,
    signedTransactionInfo: normalized.signedTransactionInfo,
    signedRenewalInfo: normalized.signedRenewalInfo || undefined,
    transactionId: normalized.transactionId,
    originalTransactionId: normalized.originalTransactionId,
    environment: normalized.environment,
    appAccountToken: params.userId,
    currency: normalized.currency || params.currency || undefined,
    countryCode: normalized.countryCode || params.countryCode || undefined,
    storefront: normalized.storefront || undefined,
  });

  await finishAppleTransactionBestEffort(rawPurchase, { isConsumable: false });
  return confirmed;
}

async function getAvailableApplePurchases(iap: any): Promise<any[]> {
  await ensureAppleIapConnection(iap);

  if (typeof iap.syncPurchasesAsync === "function") {
    await iap.syncPurchasesAsync();
  } else if (typeof iap.restorePurchases === "function") {
    await iap.restorePurchases();
  } else if (typeof iap.sync === "function") {
    await iap.sync();
  }

  if (typeof iap.getAvailablePurchases === "function") {
    return normalizePurchaseArray(await iap.getAvailablePurchases());
  }
  if (typeof iap.getAvailablePurchasesAsync === "function") {
    return normalizePurchaseArray(await iap.getAvailablePurchasesAsync());
  }
  if (typeof iap.getPurchaseHistory === "function") {
    return normalizePurchaseArray(await iap.getPurchaseHistory());
  }
  return [];
}

export async function restoreAppleSubscriptionsAndConfirm(params: {
  userId: string;
  countryCode?: string;
  currency?: string;
}): Promise<AppleRestoreResult> {
  if (!isAppleBillingPlatform()) {
    return { restoredCount: 0, subscriptionResults: [] };
  }

  const iap = requireAppleIapRuntime();
  const purchases = await getAvailableApplePurchases(iap);
  const results: PaymentsApi.AppleSubscriptionConfirmResponse[] = [];
  const seenTransactionIds = new Set<string>();

  for (const purchase of purchases || []) {
    const productId = normalizedProductId(purchase);
    if (!productId) continue;
    if (!Object.values(APPLE_SUBSCRIPTION_PRODUCTS).includes(productId as AppleSubscriptionProductId)) {
      continue;
    }

    const normalized = normalizePurchasedPayload(purchase);
    if (!normalized.signedTransactionInfo) continue;

    const dedupeKey = normalized.transactionId || `${productId}:${normalized.originalTransactionId || ""}`;
    if (dedupeKey && seenTransactionIds.has(dedupeKey)) continue;
    if (dedupeKey) seenTransactionIds.add(dedupeKey);

    const confirmed = await PaymentsApi.apiConfirmAppleSubscriptionPurchase({
      appleProductId: productId,
      signedTransactionInfo: normalized.signedTransactionInfo,
      signedRenewalInfo: normalized.signedRenewalInfo || undefined,
      transactionId: normalized.transactionId,
      originalTransactionId: normalized.originalTransactionId,
      environment: normalized.environment,
      appAccountToken: params.userId,
      currency: normalized.currency || params.currency || undefined,
      countryCode: normalized.countryCode || params.countryCode || undefined,
      storefront: normalized.storefront || undefined,
    });

    await finishAppleTransactionBestEffort(purchase, { isConsumable: false });
    results.push(confirmed);
  }

  return {
    restoredCount: results.length,
    subscriptionResults: results,
  };
}
