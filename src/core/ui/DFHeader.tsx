import React, { useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { NotificationBell } from "../../components/notifications/NotificationBell";
import { DF, Gradients } from "../theme/colors";
import { useResolvedPricingDisplay } from "../pricing/resolvePricingDisplay";
import { useAuth } from "../auth/AuthContext";

type StatusTone = "green" | "amber" | "red";

function titleCaseFromEmail(email?: string | null) {
  const raw = String(email ?? "").trim();
  if (!raw || !raw.includes("@")) return null;

  const local = raw.split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!local) return null;

  return local
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstNumericValue(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = parseNumericValue(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const text = String(value).trim();
  if (!text) return null;
  if (/^function\b/i.test(text)) return null;
  return text;
}

function getNested(obj: any, path: string): unknown {
  return path.split(".").reduce((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return acc[key];
  }, obj);
}

function pickFromPaths(obj: any, paths: string[]): string | null {
  for (const path of paths) {
    const text = cleanText(getNested(obj, path));
    if (text) return text;
  }
  return null;
}

function formatWhole(value: number | null | undefined, fallback = "0") {
  if (value == null || !Number.isFinite(value)) return fallback;
  return `${Math.max(0, Math.round(value))}`;
}

function resolveDisplayName(auth: any): string | null {
  if (!auth) return null;

  const directName = pickFromPaths(auth, [
    "fullName",
    "full_name",
    "displayName",
    "display_name",
    "name",
    "user.fullName",
    "user.full_name",
    "user.displayName",
    "user.display_name",
    "user.name",
    "profile.fullName",
    "profile.full_name",
    "profile.displayName",
    "profile.display_name",
    "profile.name",
    "session.user.fullName",
    "session.user.full_name",
    "session.user.displayName",
    "session.user.display_name",
    "session.user.name",
    "session.fullName",
    "session.name",
    "me.fullName",
    "me.full_name",
    "me.displayName",
    "me.display_name",
    "me.name",
    "account.fullName",
    "account.full_name",
    "account.displayName",
    "account.display_name",
    "account.name",
  ]);

  if (directName) return directName;

  const firstName = pickFromPaths(auth, [
    "firstName",
    "first_name",
    "given_name",
    "user.firstName",
    "user.first_name",
    "user.given_name",
    "profile.firstName",
    "profile.first_name",
    "profile.given_name",
    "session.user.firstName",
    "session.user.first_name",
    "session.user.given_name",
    "me.firstName",
    "me.first_name",
    "me.given_name",
    "account.firstName",
    "account.first_name",
    "account.given_name",
  ]);

  const lastName = pickFromPaths(auth, [
    "lastName",
    "last_name",
    "family_name",
    "user.lastName",
    "user.last_name",
    "user.family_name",
    "profile.lastName",
    "profile.last_name",
    "profile.family_name",
    "session.user.lastName",
    "session.user.last_name",
    "session.user.family_name",
    "me.lastName",
    "me.last_name",
    "me.family_name",
    "account.lastName",
    "account.last_name",
    "account.family_name",
  ]);

  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (combinedName) return combinedName;

  const username = pickFromPaths(auth, [
    "username",
    "preferred_username",
    "handle",
    "user.username",
    "user.preferred_username",
    "user.login",
    "user.handle",
    "profile.username",
    "profile.preferred_username",
    "profile.login",
    "profile.handle",
    "session.user.username",
    "session.user.preferred_username",
    "session.user.login",
    "me.username",
    "me.preferred_username",
    "account.username",
    "account.preferred_username",
  ]);

  if (username) return username;

  const email = pickFromPaths(auth, [
    "email",
    "user.email",
    "profile.email",
    "session.user.email",
    "session.email",
    "me.email",
    "account.email",
    "claims.email",
    "token.email",
    "tokenPayload.email",
  ]);

  return titleCaseFromEmail(email);
}

export default function DFHeader({
  subtitle,
  rightPill = "ONLINE",
  planLabel,
  usageLabel,
  statusTone = "green",
  onMenuPress,
  onPressMeta,
  availableCredits,
  reservedCredits,
  usedCredits,
  totalCredits,
  displayKindOverride,
  billingValueLabelOverride,
  scheduledChangeLabel,
  scheduledChangeCompactLabel,
}: {
  subtitle?: string;
  rightPill?: string;
  planLabel?: string;
  usageLabel?: string;
  statusTone?: StatusTone;
  onMenuPress?: () => void;
  onPressMeta?: () => void;
  availableCredits?: number | null;
  reservedCredits?: number | null;
  usedCredits?: number | null;
  totalCredits?: number | null;
  displayKindOverride?: "credits" | "postpaid";
  billingValueLabelOverride?: string | null;
  scheduledChangeLabel?: string | null;
  scheduledChangeCompactLabel?: string | null;
}) {
  const auth = useAuth() as any;
  const isAuthReady = Boolean(auth?.isReady);
  const isAuthed = Boolean(auth?.isAuthed && auth?.token);
  const shouldShowNotificationBell = isAuthReady && isAuthed;

  const resolved = useResolvedPricingDisplay({
    fallbackPlanName: cleanText(planLabel) ?? undefined,
  });

  const displayName = resolveDisplayName(auth);

  const effectivePlanName =
    resolved.planName || cleanText(planLabel) || "Loading";

  const effectiveDisplayKind = displayKindOverride || resolved.displayKind;

  const explicitAvailable = firstNumericValue(availableCredits);
  const explicitReserved = firstNumericValue(reservedCredits);
  const explicitUsed = firstNumericValue(usedCredits);
  const explicitTotal = firstNumericValue(totalCredits);

  const hasExplicitCredits =
    explicitAvailable != null ||
    explicitReserved != null ||
    explicitUsed != null ||
    explicitTotal != null;

  const hasResolvedCredits =
    resolved.availableCredits != null ||
    resolved.reservedCredits != null ||
    resolved.usedCredits != null ||
    resolved.totalCredits != null;

  const shouldUseExplicitCredits = hasExplicitCredits && !hasResolvedCredits;

  const effectiveAvailableCredits = shouldUseExplicitCredits
    ? Math.max(0, explicitAvailable ?? 0)
    : Math.max(0, resolved.availableCredits ?? explicitAvailable ?? 0);

  const effectiveReservedCredits = shouldUseExplicitCredits
    ? Math.max(0, explicitReserved ?? 0)
    : Math.max(0, resolved.reservedCredits ?? explicitReserved ?? 0);

  const effectiveUsedCredits = shouldUseExplicitCredits
    ? Math.max(0, explicitUsed ?? 0)
    : Math.max(0, resolved.usedCredits ?? explicitUsed ?? 0);

  const effectiveTotalCredits =
    resolved.totalCredits != null && resolved.totalCredits > 0
      ? resolved.totalCredits
      : shouldUseExplicitCredits && explicitTotal != null && explicitTotal > 0
        ? explicitTotal
        : null;

  const defaultPlanAndUser =
    [effectivePlanName, displayName].filter(Boolean).join(" • ") || null;

  const compactCreditHeaderLabel =
    effectiveDisplayKind === "credits" &&
    (effectiveAvailableCredits != null || effectiveReservedCredits != null)
      ? `${formatWhole(effectiveAvailableCredits, "0")} available • ${formatWhole(
          effectiveReservedCredits,
          "0"
        )} reserved`
      : null;

  const compactUsageText =
    effectiveDisplayKind === "postpaid"
      ? resolved.usageLabel ||
        resolved.compactUsageLabel ||
        cleanText(usageLabel) ||
        null
      : compactCreditHeaderLabel ||
        resolved.readableAvailableLabel ||
        resolved.compactUsageLabel ||
        cleanText(usageLabel) ||
        null;

  const batteryMetrics = useMemo(() => {
    if (effectiveDisplayKind !== "credits") return null;

    const safeAvailable = Math.max(0, effectiveAvailableCredits ?? 0);
    const total = effectiveTotalCredits;

    const availablePct =
      total && total > 0
        ? clamp01(safeAvailable / total)
        : clamp01(1 - (resolved.usagePercent ?? 0));

    const chargeColor =
      availablePct < 0.2
        ? "#FF453A"
        : availablePct < 0.5
          ? "#FFD60A"
          : "#32D74B";

    return {
      availablePct,
      chargeColor,
      valueLabel:
        compactUsageText ||
        (total && total > 0
          ? `${formatWhole(safeAvailable, "0")} / ${formatWhole(
              total,
              "0"
            )} credits available`
          : `${formatWhole(safeAvailable, "0")} credits available`),
    };
  }, [
    effectiveDisplayKind,
    effectiveAvailableCredits,
    effectiveTotalCredits,
    resolved.usagePercent,
    compactUsageText,
  ]);

  const postpaidMetrics = useMemo(() => {
    if (effectiveDisplayKind !== "postpaid") return null;

    const safeUsed = Math.max(0, effectiveUsedCredits ?? 0);
    const safeReserved = Math.max(0, effectiveReservedCredits ?? 0);
    const totalActivity = safeUsed + safeReserved;

    const usedPct = totalActivity > 0 ? clamp01(safeUsed / totalActivity) : 0.72;
    const reservedPct =
      totalActivity > 0 ? clamp01(safeReserved / totalActivity) : 0;

    return {
      usedPct,
      reservedPct,
      reservedOffsetPct: usedPct,
      valueLabel:
        cleanText(billingValueLabelOverride) ||
        (resolved.billingValue ? `${resolved.billingValue} billing` : "Postpaid billing"),
      caption:
        compactUsageText ||
        (totalActivity > 0
          ? `${formatWhole(safeUsed, "0")} used • ${formatWhole(
              safeReserved,
              "0"
            )} reserved`
          : "Usage billed after completion"),
    };
  }, [
    effectiveDisplayKind,
    effectiveUsedCredits,
    effectiveReservedCredits,
    resolved.billingValue,
    billingValueLabelOverride,
    compactUsageText,
  ]);

  const headerTopLabel =
    cleanText(scheduledChangeLabel) || defaultPlanAndUser;

  const headerBottomLabel =
    cleanText(scheduledChangeCompactLabel) ||
    compactUsageText ||
    batteryMetrics?.valueLabel ||
    postpaidMetrics?.valueLabel ||
    null;

  useEffect(() => {
    if (!__DEV__) return;
    const screenTag = cleanText(subtitle) || cleanText(rightPill) || "header";
    try {
      console.log(
        `[DF_PRICING][DFHeader:${screenTag}]`,
        JSON.stringify(
          {
            resolved: {
              source: resolved.source,
              accountTruthSource: (resolved as any).accountTruthSource ?? null,
              planName: resolved.planName,
              displayKind: resolved.displayKind,
              settlementKind: resolved.settlementKind,
              availableCredits: resolved.availableCredits,
              reservedCredits: resolved.reservedCredits,
              usedCredits: resolved.usedCredits,
              totalCredits: resolved.totalCredits,
              usageLabel: resolved.usageLabel,
            },
            rendered: {
              effectivePlanName,
              effectiveDisplayKind,
              effectiveAvailableCredits,
              effectiveReservedCredits,
              effectiveUsedCredits,
              effectiveTotalCredits,
              compactUsageText,
              shouldUseExplicitCredits,
            },
          },
          null,
          2
        )
      );
    } catch {}
  }, [
    subtitle,
    rightPill,
    resolved.source,
    (resolved as any).accountTruthSource,
    resolved.planName,
    resolved.displayKind,
    resolved.settlementKind,
    resolved.availableCredits,
    resolved.reservedCredits,
    resolved.usedCredits,
    resolved.totalCredits,
    resolved.usageLabel,
    effectivePlanName,
    effectiveDisplayKind,
    effectiveAvailableCredits,
    effectiveReservedCredits,
    effectiveUsedCredits,
    effectiveTotalCredits,
    compactUsageText,
    shouldUseExplicitCredits,
  ]);

  const fallbackStatusColor =
    statusTone === "red"
      ? "#FF3131"
      : statusTone === "amber"
        ? DF.gold ?? "#D2B07A"
        : "#39FF14";

  const showMetaBlock = Boolean(
    headerTopLabel || headerBottomLabel || batteryMetrics || postpaidMetrics
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <LinearGradient colors={Gradients.header} style={styles.glow} />

      <View style={styles.wrap}>
        <View style={styles.left}>
          {!!onMenuPress && (
            <Pressable style={styles.menuBtn} onPress={onMenuPress}>
              <View style={styles.menuBar} />
              <View style={styles.menuBar} />
              <View style={styles.menuBarShort} />
            </Pressable>
          )}

          <View style={styles.logoWrap}>
            <Image
              source={require("../../../assets/brand/desifaces-logo.png")}
              style={styles.logo}
              contentFit="contain"
            />
          </View>

          <View style={styles.textBlock}>
            <View style={styles.wordmarkRow}>
              <Text
                style={styles.wordmarkText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                ellipsizeMode="clip"
              >
                <Text style={styles.wordmarkMain}>desifaces</Text>
                <Text style={styles.wordmarkDot}>.</Text>
                <Text style={styles.wordmarkAi}>ai</Text>
              </Text>
            </View>

            {!!subtitle && (
              <Text numberOfLines={2} style={styles.subtitle}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.rightWrap}>
          <View style={styles.topRightRow}>
            {batteryMetrics ? (
              <Pressable
                style={styles.topIconAction}
                onPress={onPressMeta}
                disabled={!onPressMeta}
                hitSlop={8}
              >
                <View style={styles.batteryWrapCompact}>
                  <View style={styles.batteryBodyCompact}>
                    <View
                      style={[
                        styles.batteryFill,
                        {
                          width: `${batteryMetrics.availablePct * 100}%`,
                          backgroundColor: batteryMetrics.chargeColor,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.batteryCapCompact} />
                </View>
              </Pressable>
            ) : postpaidMetrics ? (
              <Pressable
                style={styles.topIconAction}
                onPress={onPressMeta}
                disabled={!onPressMeta}
                hitSlop={8}
              >
                <View style={styles.batteryWrapCompact}>
                  <View style={styles.batteryBodyCompact}>
                    <View
                      style={[
                        styles.postpaidUsedFill,
                        { width: `${postpaidMetrics.usedPct * 100}%` },
                      ]}
                    />
                    {postpaidMetrics.reservedPct > 0 ? (
                      <View
                        style={[
                          styles.postpaidReservedFill,
                          {
                            left: `${postpaidMetrics.reservedOffsetPct * 100}%`,
                            width: `${postpaidMetrics.reservedPct * 100}%`,
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                  <View style={[styles.batteryCapCompact, styles.postpaidCap]} />
                </View>
              </Pressable>
            ) : null}

            {shouldShowNotificationBell ? (
              <View style={styles.topIconAction}>
                <NotificationBell />
              </View>
            ) : null}
          </View>

          {showMetaBlock ? (
            <Pressable style={styles.rightTextBlock} onPress={onPressMeta} disabled={!onPressMeta}>
              {!!headerTopLabel && (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.76}
                  ellipsizeMode="clip"
                  style={styles.rightTop}
                >
                  {headerTopLabel}
                </Text>
              )}

              {!!headerBottomLabel ? (
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.74}
                  ellipsizeMode="clip"
                  style={styles.rightBottom}
                >
                  {headerBottomLabel}
                </Text>
              ) : null}
            </Pressable>
          ) : !!rightPill ? (
            <View style={styles.fallbackWrap}>
              <View
                style={[
                  styles.fallbackDot,
                  { backgroundColor: fallbackStatusColor },
                ]}
              />
              <Text numberOfLines={1} style={styles.fallbackText}>
                {rightPill}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.divider} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: DF.bg ?? DF.night,
  },

  glow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 84,
    opacity: 0.34,
  },

  wrap: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },

  left: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    minWidth: 0,
    paddingRight: 2,
  },

  rightWrap: {
    flexShrink: 1,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    minWidth: 108,
    maxWidth: "42%",
    paddingTop: 0,
    marginLeft: 4,
  },

  topRightRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    minHeight: 22,
    width: "100%",
    marginBottom: 2,
  },

  topIconAction: {
    minWidth: 18,
    minHeight: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: DF.border,
    backgroundColor: DF.surface2 ?? "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginTop: 1,
  },

  menuBar: {
    width: 14,
    height: 1.6,
    borderRadius: 99,
    backgroundColor: DF.textSoft ?? DF.text,
    marginVertical: 1.4,
  },

  menuBarShort: {
    width: 10,
    height: 1.6,
    borderRadius: 99,
    backgroundColor: DF.textSoft ?? DF.text,
    marginTop: 1.4,
    alignSelf: "center",
  },

  logoWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DF.border,
    backgroundColor: DF.surface2 ?? "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: DF.shadow,
    shadowOpacity: Platform.OS === "ios" ? 0.16 : 0,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    marginTop: 1,
  },

  logo: {
    width: 22,
    height: 22,
  },

  textBlock: {
    marginLeft: 8,
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    paddingTop: 0,
    paddingRight: 4,
  },

  wordmarkRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "nowrap",
    flexShrink: 0,
    alignSelf: "flex-start",
    minWidth: 0,
  },

  wordmarkText: {
    flexShrink: 1,
    flexGrow: 1,
    flexWrap: "nowrap",
    includeFontPadding: false,
  },

  wordmarkMain: {
    color: DF.brandWordmark ?? "#D4A017",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.1,
    textTransform: "lowercase",
  },

  wordmarkDot: {
    color: DF.aiWordmark ?? "#B22222",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.1,
    textTransform: "lowercase",
  },

  wordmarkAi: {
    color: DF.aiWordmark ?? "#B22222",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.1,
    textTransform: "lowercase",
  },

  subtitle: {
    marginTop: 2,
    color: DF.textSoft ?? DF.muted,
    fontSize: 10.5,
    fontWeight: "700",
    letterSpacing: 0.1,
    lineHeight: 13,
    paddingRight: 2,
  },

  rightTextBlock: {
    alignItems: "flex-end",
    justifyContent: "flex-start",
    width: "100%",
    minWidth: 0,
  },

  batteryBlock: {
    alignItems: "flex-end",
    width: "100%",
    marginTop: 3,
  },

  rightTop: {
    color: DF.text ?? "#FFFFFF",
    fontSize: 9.2,
    fontWeight: "800",
    textAlign: "right",
    lineHeight: 10.5,
    width: "100%",
  },

  batteryRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    width: "100%",
  },

  batteryWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginRight: 0,
  },

  batteryWrapCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  batteryBody: {
    width: 34,
    height: 16,
    borderRadius: 4.5,
    borderWidth: 1.4,
    borderColor: DF.textSoft ?? "rgba(255,255,255,0.62)",
    backgroundColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    position: "relative",
  },

  batteryBodyCompact: {
    width: 20,
    height: 9,
    borderRadius: 3,
    borderWidth: 1.1,
    borderColor: DF.textSoft ?? "rgba(255,255,255,0.62)",
    backgroundColor: "transparent",
    overflow: "hidden",
    position: "relative",
  },

  batteryFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2.5,
  },

  batteryReserved: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 214, 10, 0.72)",
  },

  postpaidUsedFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#64D2FF",
  },

  postpaidReservedFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255, 214, 10, 0.82)",
  },

  batteryCap: {
    width: 3,
    height: 8,
    borderRadius: 1.5,
    marginLeft: 2,
    backgroundColor: DF.textSoft ?? "rgba(255,255,255,0.62)",
    opacity: 0.9,
  },

  batteryCapCompact: {
    width: 2,
    height: 5,
    borderRadius: 1,
    marginLeft: 2,
    backgroundColor: DF.textSoft ?? "rgba(255,255,255,0.62)",
    opacity: 0.9,
  },

  postpaidCap: {
    backgroundColor: "#64D2FF",
  },

  batteryValue: {
    color: DF.text ?? "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "right",
    lineHeight: 13,
    marginTop: 4,
    width: "100%",
  },

  batteryCaption: {
    color: DF.textSoft ?? DF.text,
    fontSize: 9.5,
    fontWeight: "800",
    textAlign: "right",
    lineHeight: 12,
    marginTop: 2,
    width: "100%",
  },

  rightBottom: {
    marginTop: 1,
    color: DF.textSoft ?? DF.text,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "right",
    lineHeight: 11,
    width: "100%",
  },

  fallbackWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingTop: 4,
  },

  fallbackDot: {
    width: 6,
    height: 6,
    borderRadius: 99,
    marginRight: 7,
  },

  fallbackText: {
    color: DF.textSoft ?? DF.text,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.3,
    textAlign: "right",
  },

  divider: {
    height: 1,
    backgroundColor: DF.hairline ?? "rgba(255,255,255,0.08)",
  },
});
