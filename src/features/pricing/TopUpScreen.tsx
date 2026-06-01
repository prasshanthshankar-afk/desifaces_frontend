import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import DFHeader from "../../core/ui/DFHeader";
import { DF } from "../../core/theme/colors";
import { useAuth } from "../../core/auth/AuthContext";
import * as PaymentsApi from "../../core/payments/apiPayments";
import { BILLING_QUERY_OPTIONS, refreshBillingQueries } from "../../core/payments/billingQueries";
import { useResolvedPricingDisplay } from "../../core/pricing/resolvePricingDisplay";
import { appleCreditsProductIdForPack, purchaseAppleCreditsPackAndConfirm } from "../../core/payments/appleIap";
import { googleCreditsProductIdForPack, purchaseGoogleCreditsPackAndConfirm } from "../../core/payments/googlePlayIap";
import { apiConfirmGoogleCreditsPurchase } from "../../core/payments/paymentRailApi";

const UI = {
  bg: "#090B10",
  surface: "rgba(255,255,255,0.05)",
  surface2: "rgba(255,255,255,0.07)",
  text: "rgba(255,255,255,0.94)",
  textStrong: "#FFFFFF",
  textSoft: "rgba(255,255,255,0.66)",
  line: "rgba(255,255,255,0.08)",
  border: "rgba(255,255,255,0.10)",
  gold: "#D2B07A",
  goldSoft: "rgba(210,176,122,0.14)",
};

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) return String(value[0] ?? fallback);
  return String(value ?? fallback);
}

function formatCredits(value?: number | null, fallback = "—") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.round(Math.max(0, value))}`;
}

function makeIdempotencyKey(packCode: string, prefix = "wallet-topup") {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${packCode}-${Date.now()}-${rand}`;
}


declare const require: any;

type PendingGoogleTopup = {
  packCode: string;
  productId: string;
  userId: string;
  countryCode: string;
  currency: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.products)) return value.products;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.subscriptions)) return value.subscriptions;
  return value ? [value] : [];
}

function safeJson(value: any) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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

function productIdOf(product: any) {
  return firstNonEmptyString(
    product?.id,
    product?.productId,
    product?.product_id,
    product?.sku,
    product?.name,
    product?.products,
    product?.productIds
  );
}

function normalizeGooglePurchase(raw: any) {
  const purchase = Array.isArray(raw) ? raw[0] : raw?.purchase || raw?.response || raw?.result || raw;

  const purchaseToken = firstNonEmptyString(
    purchase?.purchaseToken,
    purchase?.purchase_token,
    purchase?.purchaseTokenAndroid,
    purchase?.purchase_token_android,
    purchase?.transactionReceiptAndroid,
    purchase?.receiptAndroid,
    purchase?.token
  );

  const productId = firstNonEmptyString(
    purchase?.productId,
    purchase?.product_id,
    purchase?.sku,
    purchase?.id,
    purchase?.products,
    purchase?.productIds
  );

  const orderId = firstNonEmptyString(
    purchase?.orderId,
    purchase?.order_id,
    purchase?.transactionId,
    purchase?.transaction_id
  );

  return {
    raw: purchase || raw || {},
    productId: productId || "",
    purchaseToken: purchaseToken || "",
    orderId: orderId || null,
  };
}

function googleConnected(iap: any) {
  const value =
    iap?.connected ??
    iap?.isConnected ??
    iap?.ready ??
    iap?.isReady ??
    iap?.billingReady ??
    null;

  if (typeof value === "boolean") return value;

  // Some expo-iap builds do not expose a connected boolean but do expose
  // request/fetch functions once the hook runtime is mounted.
  return Boolean(iap && (typeof iap.requestPurchase === "function" || typeof iap.fetchProducts === "function"));
}

function useOptionalGoogleIap() {
  if (Platform.OS !== "android") return null;

  try {
    const iapModule = require("expo-iap");
    if (typeof iapModule?.useIAP === "function") {
      return iapModule.useIAP();
    }
  } catch (error) {
    console.log("GOOGLE_IAP_HOOK_LOAD_ERROR", String((error as any)?.message || error));
  }

  return null;
}

function humanizeTopupError(error: any) {
  const message = String(error?.message || error || "Unable to start top-up.");

  if (/cancel|canceled|cancelled/i.test(message)) {
    return "Google Play purchase was canceled.";
  }

  if (/billing client not ready|not ready|not connected|service disconnected|billing unavailable|billing.*unavailable/i.test(message)) {
    return "Google Play Billing is not connected for this install. Use a Google Play-enabled emulator or Play internal testing install, sign in with a license tester account, then try again.";
  }

  if (/product.*not.*found|did not return product|not available for purchase|item unavailable|sku/i.test(message)) {
    return "Google Play did not return this credit-pack product. Confirm the product id is active in Play Console and the tester account is opted into the app testing track.";
  }

  return message;
}


function BillingFooterNav() {
  const items = [
    { key: "dashboard", label: "Home", icon: "home-outline", route: "/(tabs)/dashboard" },
    { key: "face", label: "Face", icon: "person-outline", route: "/(tabs)/face" },
    { key: "audio", label: "Audio", icon: "mic-outline", route: "/(tabs)/audio" },
    { key: "fusion", label: "Fusion", icon: "videocam-outline", route: "/(tabs)/fusion" },
  ] as const;

  return (
    <View style={styles.footerWrap}>
      <View style={styles.footerNav}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            style={styles.footerItem}
            onPress={() => router.replace(item.route as any)}
          >
            <Ionicons
              name={item.icon as any}
              size={19}
              color={"rgba(255,255,255,0.62)"}
              style={{ marginBottom: 2 }}
            />
            <Text style={styles.footerLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function TopUpScreen() {
  const params = useLocalSearchParams<{ billing_result?: string }>();
  const billingResult = readString(params.billing_result);

  const queryClient = useQueryClient();
  const auth = useAuth() as any;

  const countryCode =
    auth?.countryCode ||
    auth?.country_code ||
    auth?.user?.countryCode ||
    auth?.user?.country_code ||
    "US";

  const currentUserId = String(
    auth?.userId || auth?.user_id || auth?.user?.id || auth?.user?.user_id || ""
  ).trim();

  const billingProviderLabel =
    Platform.OS === "ios"
      ? "Apple In-App Purchase"
      : Platform.OS === "android"
        ? "Google Play Billing"
        : "Stripe checkout";

  const {
    data: overview,
    isLoading: overviewLoading,
    isFetching: overviewFetching,
    refetch: refetchOverview,
  } = useQuery<PaymentsApi.PaymentOverviewResponse | null>({
    queryKey: ["payments-overview", countryCode],
    queryFn: async () => PaymentsApi.apiGetPaymentsOverview(countryCode),
    ...BILLING_QUERY_OPTIONS,
  });

  const {
    data: topups,
    isLoading: topupsLoading,
    isFetching: topupsFetching,
    error: topupsError,
    refetch: refetchTopups,
  } = useQuery<PaymentsApi.PaymentTopupCatalogResponse | null>({
    queryKey: ["payments-topups-catalog", countryCode],
    queryFn: async () => PaymentsApi.apiGetTopupsCatalog(countryCode),
    ...BILLING_QUERY_OPTIONS,
  });

  useFocusEffect(
    useCallback(() => {
      refreshBillingQueries(queryClient, countryCode);
      refetchOverview();
      refetchTopups();
    }, [queryClient, countryCode, refetchOverview, refetchTopups])
  );

  useEffect(() => {
    if (billingResult !== "success") return;
    refreshBillingQueries(queryClient, countryCode);
    refetchOverview();
    refetchTopups();
  }, [billingResult, queryClient, countryCode, refetchOverview, refetchTopups]);

  const googleIap = useOptionalGoogleIap();
  const googleIapRef = useRef<any>(googleIap);
  const googleProductsRef = useRef<any[]>([]);

  const [busyPackCode, setBusyPackCode] = useState<string | null>(null);
  const [errorText, setErrorText] = useState("");
  const [statusText, setStatusText] = useState("");
  const [pendingGoogleTopup, setPendingGoogleTopup] = useState<PendingGoogleTopup | null>(null);
  const [handledGooglePurchaseKey, setHandledGooglePurchaseKey] = useState("");

  const items = useMemo(() => {
    const arr = Array.isArray(topups?.items) ? [...topups.items] : [];
    arr.sort((a, b) => Number(a.display_order ?? 0) - Number(b.display_order ?? 0));
    return arr;
  }, [topups]);

  const credits = overview?.credits || null;
  const header = overview?.header || null;
  const messages = overview?.messages || null;
  const currentPlanName = overview?.current_plan?.plan_name || "Free";
  const pricingDisplay = useResolvedPricingDisplay({
    dashboardData: overview,
    fallbackPlanName: currentPlanName,
  });
  const displayAvailableCredits = pricingDisplay.availableCredits ?? credits?.available_credits ?? null;
  const displayReservedCredits = pricingDisplay.reservedCredits ?? credits?.reserved_credits ?? 0;
  const displayUsedCredits = pricingDisplay.usedCredits ?? credits?.used_credits ?? 0;
  const canTopUp = overview?.allowed_actions?.can_top_up !== false;
  const contactSalesPlan = Boolean(overview?.current_plan?.contact_sales);

  const usageLabel =
    pricingDisplay.usageLabel ||
    header?.usage_label ||
    `${formatCredits(displayAvailableCredits)} available • ${formatCredits(
      displayReservedCredits,
      "0"
    )} reserved • ${formatCredits(displayUsedCredits, "0")} used`;

  const goBilling = () => router.push({ pathname: "/pricing/plan-billing" });
  const goCompare = () => router.push({ pathname: "/pricing/compare" });
  const goBack = () => router.back();

  useEffect(() => {
    googleIapRef.current = googleIap;
    googleProductsRef.current = [
      ...asArray(googleIap?.products),
      ...asArray(googleIap?.subscriptions),
      ...asArray(googleIap?.availableProducts),
      ...asArray(googleIap?.availablePurchases),
    ];

    if (Platform.OS === "android") {
      console.log("GOOGLE_IAP_HOOK_STATUS", {
        hasHook: Boolean(googleIap),
        connected: googleIap?.connected ?? googleIap?.isConnected ?? googleIap?.ready ?? null,
        hasFetchProducts: typeof googleIap?.fetchProducts === "function",
        hasRequestPurchase: typeof googleIap?.requestPurchase === "function",
        productCount: googleProductsRef.current.length,
      });
    }
  }, [googleIap]);

  const refreshAfterTopup = useCallback(async () => {
    await refreshBillingQueries(queryClient, countryCode);
    await Promise.all([refetchOverview(), refetchTopups()]);
  }, [queryClient, countryCode, refetchOverview, refetchTopups]);

  const waitForGoogleBillingConnection = useCallback(async (timeoutMs = 8000) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const iap = googleIapRef.current;
      if (googleConnected(iap)) return true;
      await sleep(250);
    }

    return googleConnected(googleIapRef.current);
  }, []);

  const waitForGoogleProduct = useCallback(async (productId: string, timeoutMs = 2500) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const products = googleProductsRef.current;
      const product = products.find((entry) => productIdOf(entry) === productId);
      if (product) return product;
      await sleep(150);
    }

    return null;
  }, []);

  const fetchGoogleProductWithHook = useCallback(async (productId: string) => {
    const iap = googleIapRef.current;
    const fetchFn =
      iap?.fetchProducts ||
      iap?.requestProducts ||
      iap?.getProducts ||
      iap?.getItems;

    if (typeof fetchFn !== "function") {
      throw new Error("Installed Google Play Billing runtime does not expose a product fetch API.");
    }

    const attempts = [
      { skus: [productId], type: "inapp" },
      { skus: [productId], type: "in-app" },
      { productIds: [productId], type: "inapp" },
      { ids: [productId], type: "inapp" },
      [productId],
    ];

    let lastError: any = null;

    for (const attempt of attempts) {
      try {
        console.log("GOOGLE_IAP_FETCH_PRODUCTS_ATTEMPT", { productId, shape: safeJson(attempt) });
        const result = await fetchFn.call(iap, attempt);
        const products = [
          ...asArray(result),
          ...asArray((result as any)?.products),
          ...asArray(googleIapRef.current?.products),
        ];
        googleProductsRef.current = products;

        const product = products.find((entry) => productIdOf(entry) === productId) || (await waitForGoogleProduct(productId));
        if (product) {
          console.log("GOOGLE_IAP_PRODUCT_FOUND", { productId, productKeys: Object.keys(product || {}).sort() });
          return product;
        }
      } catch (error: any) {
        lastError = error;
        const message = String(error?.message || error);
        console.log("GOOGLE_IAP_FETCH_PRODUCTS_ERROR", {
          productId,
          message,
          raw: safeJson(error),
        });

        if (!/argument|parameter|shape|type|sku|product/i.test(message)) {
          throw error;
        }
      }
    }

    throw new Error(
      `Google Play did not return product details for ${productId}. Confirm it is active in Play Console and the signed-in tester has access. ${lastError ? String(lastError?.message || lastError) : ""}`.trim()
    );
  }, [waitForGoogleProduct]);

  const finishGoogleTransactionIfPossible = useCallback(async (rawPurchase: any) => {
    const iap = googleIapRef.current;
    const finishFn = iap?.finishTransaction || iap?.finishTransactionAsync;
    if (typeof finishFn !== "function") return;

    const attempts = [
      { purchase: rawPurchase, isConsumable: true },
      { purchase: rawPurchase, consumable: true },
      rawPurchase,
    ];

    for (const attempt of attempts) {
      try {
        await finishFn.call(iap, attempt);
        console.log("GOOGLE_IAP_FINISH_TRANSACTION_OK");
        return;
      } catch (error: any) {
        console.log("GOOGLE_IAP_FINISH_TRANSACTION_RETRY", String(error?.message || error));
      }
    }
  }, []);

  const confirmGooglePurchaseFromRaw = useCallback(
    async (rawPurchase: any, pending: PendingGoogleTopup) => {
      const normalized = normalizeGooglePurchase(rawPurchase);
      const purchaseToken = normalized.purchaseToken;
      const googleProductId = normalized.productId || pending.productId;

      if (!purchaseToken) {
        throw new Error("Google Play purchase completed but did not return a purchase token.");
      }

      const purchaseKey = `${googleProductId}:${purchaseToken.slice(0, 24)}`;
      if (purchaseKey === handledGooglePurchaseKey) return;

      setHandledGooglePurchaseKey(purchaseKey);
      setStatusText("Confirming purchase with desifaces.ai…");
      console.log("GOOGLE_IAP_CREDITS_CONFIRM_BACKEND_START", {
        googleProductId,
        packageName: "ai.desifaces.app",
        tokenLen: purchaseToken.length,
      });

      await apiConfirmGoogleCreditsPurchase({
        googleProductId,
        purchaseToken,
        packageName: "ai.desifaces.app",
        orderId: normalized.orderId,
        countryCode: pending.countryCode,
        currency: pending.currency,
        rawPurchaseJson: normalized.raw,
      });

      await finishGoogleTransactionIfPossible(normalized.raw);
      await refreshAfterTopup();
      setPendingGoogleTopup(null);
      setStatusText("Top-up complete. Your credits have been refreshed.");
      setBusyPackCode(null);
    },
    [finishGoogleTransactionIfPossible, handledGooglePurchaseKey, refreshAfterTopup]
  );

  useEffect(() => {
    if (Platform.OS !== "android" || !pendingGoogleTopup) return;

    const rawPurchase =
      googleIap?.currentPurchase ||
      googleIap?.latestPurchase ||
      googleIap?.purchase ||
      null;

    const normalized = normalizeGooglePurchase(rawPurchase);
    if (!normalized.purchaseToken) return;

    confirmGooglePurchaseFromRaw(rawPurchase, pendingGoogleTopup).catch((error) => {
      setErrorText(humanizeTopupError(error));
      setStatusText("");
      setBusyPackCode(null);
    });
  }, [
    googleIap?.currentPurchase,
    googleIap?.latestPurchase,
    googleIap?.purchase,
    pendingGoogleTopup,
    confirmGooglePurchaseFromRaw,
  ]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const purchaseError = googleIap?.currentPurchaseError || googleIap?.purchaseError || null;
    if (!purchaseError) return;

    console.log("GOOGLE_IAP_PURCHASE_ERROR", safeJson(purchaseError));
    setErrorText(humanizeTopupError(purchaseError));
    setStatusText("");
    setBusyPackCode(null);
    setPendingGoogleTopup(null);
  }, [googleIap?.currentPurchaseError, googleIap?.purchaseError]);

  const requestGooglePurchaseWithHook = useCallback(
    async (pending: PendingGoogleTopup) => {
      const iap = googleIapRef.current;
      const requestPurchase = iap?.requestPurchase;

      if (typeof requestPurchase !== "function") {
        throw new Error("Installed Google Play Billing runtime does not expose requestPurchase().");
      }

      const attempts = [
        {
          request: {
            android: {
              skus: [pending.productId],
              obfuscatedAccountIdAndroid: pending.userId,
            },
          },
          type: "inapp",
        },
        {
          request: {
            google: {
              skus: [pending.productId],
              obfuscatedAccountIdAndroid: pending.userId,
            },
          },
          type: "inapp",
        },
        {
          skus: [pending.productId],
          type: "inapp",
          obfuscatedAccountIdAndroid: pending.userId,
        },
        {
          sku: pending.productId,
          type: "inapp",
          obfuscatedAccountIdAndroid: pending.userId,
        },
        pending.productId,
      ];

      let lastError: any = null;

      for (const attempt of attempts) {
        try {
          console.log("GOOGLE_IAP_REQUEST_PURCHASE_ATTEMPT", {
            productId: pending.productId,
            shape: typeof attempt === "string" ? "string" : safeJson(attempt),
          });
          const result = await requestPurchase.call(iap, attempt as any);
          const normalized = normalizeGooglePurchase(result);
          if (normalized.purchaseToken) {
            return result;
          }

          setStatusText("Complete the purchase in Google Play…");
          return null;
        } catch (error: any) {
          lastError = error;
          const message = String(error?.message || error);
          console.log("GOOGLE_IAP_REQUEST_PURCHASE_ERROR", {
            productId: pending.productId,
            message,
            raw: safeJson(error),
          });

          if (/cancel|canceled|cancelled/i.test(message)) {
            throw new Error("Google Play purchase was canceled.");
          }

          if (!/argument|parameter|shape|request|android|google|sku|product|type/i.test(message)) {
            throw error;
          }
        }
      }

      throw new Error(`Google Play purchase could not start: ${String(lastError?.message || lastError || "unknown error")}`);
    },
    []
  );

  const startGoogleTopup = useCallback(
    async (item: PaymentsApi.PaymentTopupCatalogItem, productId: string, currency: string) => {
      const pending: PendingGoogleTopup = {
        packCode: item.pack_code,
        productId,
        userId: currentUserId,
        countryCode,
        currency,
      };

      const iap = googleIapRef.current;
      const hasHookRuntime = Boolean(iap && typeof iap.requestPurchase === "function");

      console.log("GOOGLE_IAP_TOPUP_PRESS", {
        packCode: item.pack_code,
        productId,
        hasHookRuntime,
        connected: iap?.connected ?? iap?.isConnected ?? iap?.ready ?? null,
      });

      if (!hasHookRuntime) {
        // Fallback for builds exposing the older direct API from the wrapper.
        setStatusText("Connecting to Google Play…");
        await purchaseGoogleCreditsPackAndConfirm({
          productId: productId as any,
          userId: currentUserId,
          countryCode,
          currency,
        });
        await refreshAfterTopup();
        setStatusText("Top-up complete. Your credits have been refreshed.");
        return;
      }

      setPendingGoogleTopup(pending);
      setStatusText("Connecting to Google Play…");

      const connected = await waitForGoogleBillingConnection();
      if (!connected) {
        throw new Error("Google Play Billing client is not ready.");
      }

      setStatusText("Loading credit pack from Google Play…");
      await fetchGoogleProductWithHook(productId);

      setStatusText("Opening Google Play…");
      const rawPurchase = await requestGooglePurchaseWithHook(pending);

      if (rawPurchase) {
        await confirmGooglePurchaseFromRaw(rawPurchase, pending);
      }
    },
    [
      confirmGooglePurchaseFromRaw,
      countryCode,
      currentUserId,
      fetchGoogleProductWithHook,
      refreshAfterTopup,
      requestGooglePurchaseWithHook,
      waitForGoogleBillingConnection,
    ]
  );

  const startTopup = async (item: PaymentsApi.PaymentTopupCatalogItem) => {
    try {
      setBusyPackCode(item.pack_code);
      setErrorText("");
      setStatusText("");

      const raw = item as Record<string, any>;
      const metadata = raw.metadata && typeof raw.metadata === "object" ? raw.metadata : {};
      const rawItem = item as any;
      const rawTopups = topups as any;
      const currency = String(rawItem?.currency || rawTopups?.currency || (countryCode === "IN" ? "INR" : "USD")).toUpperCase();

      if (Platform.OS === "ios") {
        if (!currentUserId) throw new Error("Apple top-up requires a signed-in user id.");
        const productId =
          String(raw.apple_product_id || raw.ios_product_id || metadata.apple_product_id || metadata.ios_product_id || "").trim() ||
          appleCreditsProductIdForPack(item.pack_code);
        if (!productId) throw new Error("Apple product mapping was not found for this credit pack.");
        setStatusText("Opening Apple purchase sheet…");
        await purchaseAppleCreditsPackAndConfirm({
          productId: productId as any,
          userId: currentUserId,
          countryCode,
          currency,
        });
        await refreshAfterTopup();
        setStatusText("Top-up complete. Your credits have been refreshed.");
        return;
      }

      if (Platform.OS === "android") {
        if (!currentUserId) throw new Error("Google Play top-up requires a signed-in user id.");
        const productId =
          String(raw.google_product_id || raw.android_product_id || metadata.google_product_id || metadata.android_product_id || "").trim() ||
          googleCreditsProductIdForPack(item.pack_code);
        if (!productId) throw new Error("Google Play product mapping was not found for this credit pack.");
        await startGoogleTopup(item, productId, currency);
        return;
      }

      setStatusText("Opening checkout…");
      const res = await PaymentsApi.apiCreateWalletTopupCheckoutSession({
        amountMinor: item.amount_minor,
        creditsToGrant: item.credits_to_grant,
        idempotencyKey: makeIdempotencyKey(item.pack_code),
        countryCode,
        successUrl: PaymentsApi.buildTopupReturnUrl("success"),
        cancelUrl: PaymentsApi.buildTopupReturnUrl("cancel"),
      });

      if (!res.checkout_url) {
        throw new Error("Top-up checkout URL was not returned.");
      }

      await Linking.openURL(res.checkout_url);
    } catch (e: any) {
      setErrorText(humanizeTopupError(e));
      setStatusText("");
      setPendingGoogleTopup(null);
    } finally {
      if (!pendingGoogleTopup) {
        setBusyPackCode(null);
      }
    }
  };

  const loading =
    overviewLoading || overviewFetching || topupsLoading || topupsFetching;

  return (
    <View style={styles.root}>
      <DFHeader
        subtitle="top up credits"
        planLabel={pricingDisplay.planName || header?.plan_label || currentPlanName}
        usageLabel={usageLabel}
        availableCredits={displayAvailableCredits}
        reservedCredits={displayReservedCredits}
        usedCredits={displayUsedCredits}
        totalCredits={pricingDisplay.totalCredits}
        displayKindOverride={pricingDisplay.displayKind}
        onMenuPress={goBack}
        onPressMeta={goBilling}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {billingResult ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>
              {billingResult === "success" ? "Refreshing your credits" : "Top-up canceled"}
            </Text>
            <Text style={styles.noteBody}>
              {billingResult === "success"
                ? "We are refreshing your latest credit balance now."
                : "No top-up was completed. You can try again when ready."}
            </Text>
          </View>
        ) : null}

        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroIcon}>
              <Ionicons name="flash-outline" size={18} color={UI.gold} />
            </View>
            <Text style={styles.heroTitle}>Top Up Credits</Text>
          </View>

          <Text style={styles.heroBody}>
            Add credits to keep creating without changing your current plan. Purchases on this device use {billingProviderLabel}.
          </Text>

          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Available</Text>
              <Text style={styles.balanceValue}>{formatCredits(displayAvailableCredits)}</Text>
            </View>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Reserved</Text>
              <Text style={styles.balanceValue}>{formatCredits(displayReservedCredits, "0")}</Text>
            </View>
            <View style={styles.balanceItem}>
              <Text style={styles.balanceLabel}>Used</Text>
              <Text style={styles.balanceValue}>{formatCredits(displayUsedCredits, "0")}</Text>
            </View>
          </View>
        </View>

        {!canTopUp ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Top up unavailable</Text>
            <Text style={styles.noteBody}>
              {messages?.status_body ||
                (contactSalesPlan
                  ? "This enterprise account is managed outside self-serve billing. Contact DesiFaces sales or support for billing adjustments."
                  : "Your current billing policy does not allow wallet top-ups for this account.")}
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Choose a credit pack</Text>

        {loading ? (
          <View style={styles.noteCard}>
            <ActivityIndicator color={UI.gold} />
            <Text style={styles.noteBody}>Loading live top-up packs…</Text>
          </View>
        ) : null}

        {!loading && topupsError ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Unable to load top-up packs</Text>
            <Text style={styles.noteBody}>
              {String((topupsError as any)?.message || "Please try again shortly.")}
            </Text>
          </View>
        ) : null}

        {!loading && !topupsError && items.length === 0 ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>No top-up packs available</Text>
            <Text style={styles.noteBody}>Top-up pack data is not available right now.</Text>
          </View>
        ) : null}

        {items.map((pack) => (
          <View
            key={pack.pack_code}
            style={[styles.packCard, pack.recommended ? styles.packCardRecommended : null]}
          >
            <View style={styles.packTopRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.packTitleRow}>
                  <Text style={styles.packTitle}>{pack.title}</Text>
                  {pack.recommended ? (
                    <View style={styles.recommendedBadge}>
                      <Text style={styles.recommendedBadgeText}>Recommended</Text>
                    </View>
                  ) : null}
                </View>
                {pack.subtitle ? <Text style={styles.packSubtitle}>{pack.subtitle}</Text> : null}
              </View>

              <View style={styles.packCreditsPill}>
                <Text style={styles.packCreditsValue}>{pack.credits_to_grant}</Text>
                <Text style={styles.packCreditsLabel}>credits</Text>
              </View>
            </View>

            <Text style={styles.packPrice}>{pack.price_label}</Text>

            <View style={styles.packActions}>
              <Pressable
                style={[
                  styles.primaryButton,
                  (busyPackCode === pack.pack_code || !canTopUp) && styles.disabled,
                ]}
                onPress={() => startTopup(pack)}
                disabled={busyPackCode === pack.pack_code || !canTopUp}
              >
                {busyPackCode === pack.pack_code ? (
                  <ActivityIndicator color="#1B1308" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {Platform.OS === "ios"
                      ? "Buy with Apple"
                      : Platform.OS === "android"
                        ? "Buy with Google Play"
                        : pack.cta_label || "Continue"}
                  </Text>
                )}
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={canTopUp ? goCompare : goBilling}
              >
                <Text style={styles.secondaryButtonText}>
                  {canTopUp ? "Upgrade instead" : "View billing"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}

        {statusText ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Top-up status</Text>
            <Text style={styles.noteBody}>{statusText}</Text>
          </View>
        ) : null}

        {errorText ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Unable to start top-up</Text>
            <Text style={styles.noteBody}>{errorText}</Text>
          </View>
        ) : null}
      </ScrollView>

      <BillingFooterNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: UI.bg },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 112, gap: 14 },
  heroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.line,
    backgroundColor: UI.surface,
    padding: 16,
    gap: 12,
  },
  heroHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: UI.textStrong, fontSize: 18, fontWeight: "900" },
  heroBody: { color: UI.textSoft, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  balanceRow: { flexDirection: "row", gap: 10 },
  balanceItem: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.surface2,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  balanceLabel: { color: UI.textSoft, fontSize: 11, fontWeight: "700" },
  balanceValue: { color: UI.textStrong, fontSize: 18, fontWeight: "900", marginTop: 4 },
  sectionTitle: {
    color: UI.textStrong,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
    marginTop: 2,
  },
  packCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UI.line,
    backgroundColor: UI.surface,
    padding: 16,
    gap: 14,
  },
  packCardRecommended: {
    borderColor: UI.gold,
    backgroundColor: "rgba(210,176,122,0.09)",
  },
  packTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  packTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  packTitle: { color: UI.textStrong, fontSize: 16, fontWeight: "900" },
  packSubtitle: {
    color: UI.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
    marginTop: 6,
  },
  recommendedBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.gold,
    backgroundColor: UI.goldSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recommendedBadgeText: { color: UI.textStrong, fontSize: 10, fontWeight: "900" },
  packCreditsPill: {
    minWidth: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.surface2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  packCreditsValue: { color: UI.textStrong, fontSize: 22, fontWeight: "900" },
  packCreditsLabel: { color: UI.textSoft, fontSize: 11, fontWeight: "700", marginTop: 2 },
  packPrice: { color: UI.gold, fontSize: 16, fontWeight: "900" },
  packActions: { flexDirection: "row", gap: 10 },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: UI.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  primaryButtonText: { color: "#1B1308", fontSize: 13, fontWeight: "900" },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.surface2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  secondaryButtonText: { color: UI.textStrong, fontSize: 13, fontWeight: "800" },
  noteCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: UI.line,
    backgroundColor: UI.surface,
    padding: 14,
    gap: 6,
  },
  noteTitle: { color: UI.textStrong, fontSize: 13, fontWeight: "900" },
  noteBody: { color: UI.textSoft, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  disabled: { opacity: 0.7 },
  footerWrap: {
    backgroundColor: DF.night,
    borderTopColor: "rgba(255,255,255,0.10)",
    borderTopWidth: 1,
    height: 72,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  footerNav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerItem: {
    minWidth: 74,
    maxWidth: 92,
    marginHorizontal: 6,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  footerLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.1,
    marginTop: 2,
    color: "rgba(255,255,255,0.62)",
  },
});
