import React, { useMemo } from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";

import { DF, Gradients } from "../theme/colors";
import {
  useAccountPricingSnapshot,
  isMeaningfulPricingLabel,
} from "../pricing/useAccountPricingSnapshot";
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

function looksLikeBareNumber(value: string | null | undefined) {
  if (!value) return false;
  const s = String(value).trim();
  return /^-?\d+(?:\.\d+)?$/.test(s.replace(/,/g, ""));
}


function cleanText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const text = String(value).trim();
  if (!text) return null;
  if (/^function\b/i.test(text)) return null;
  return text;
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return null;
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
}: {
  subtitle?: string;
  rightPill?: string;
  planLabel?: string;
  usageLabel?: string;
  statusTone?: StatusTone;
  onMenuPress?: () => void;
  onPressMeta?: () => void;
}) {
  const snapshot = useAccountPricingSnapshot() as any;
  const auth = useAuth() as any;

  const planName =
    cleanText(snapshot?.planName) ||
    (isMeaningfulPricingLabel(planLabel) ? String(planLabel).trim() : null);

  const displayName = resolveDisplayName(auth);

  const planAndUser = [planName, displayName].filter(Boolean).join(" • ") || null;

  const availableCredits = firstNumericValue(
    snapshot?.availableCredits,
    snapshot?.available_credits,
    snapshot?.pricingSummary?.available_credits,
    snapshot?.usageSummary?.available_credits,
    snapshot?.gauges?.fuel?.credits_remaining,
    snapshot?.availableLabel
  );

  const reservedCredits = firstNumericValue(
    snapshot?.reservedCredits,
    snapshot?.reserved_credits,
    snapshot?.pricingSummary?.reserved_credits,
    snapshot?.usageSummary?.reserved_credits
  );

  const usedCredits = firstNumericValue(
    snapshot?.usedCredits,
    snapshot?.used_credits,
    snapshot?.usageSummary?.used_credits,
    snapshot?.usedLabel
  );

  const totalCredits = firstNumericValue(
    snapshot?.totalCredits,
    snapshot?.total_credits,
    snapshot?.pricingSummary?.total_credits,
    snapshot?.usageSummary?.total_credits,
    snapshot?.includedCredits,
    snapshot?.included_credits,
    snapshot?.usageSummary?.included_credits,
    (availableCredits ?? 0) + (reservedCredits ?? 0) + (usedCredits ?? 0) > 0
      ? (availableCredits ?? 0) + (reservedCredits ?? 0) + (usedCredits ?? 0)
      : null
  );

  const cleanAvailableLabel = cleanText(snapshot?.availableLabel);
  const readableAvailableLabel =
    cleanAvailableLabel && !looksLikeBareNumber(cleanAvailableLabel)
      ? cleanAvailableLabel
      : null;
  const cleanUsageLabel = isMeaningfulPricingLabel(usageLabel)
    ? String(usageLabel).trim()
    : null;

  const batteryMetrics = useMemo(() => {
    if (totalCredits == null || totalCredits <= 0 || availableCredits == null) {
      return null;
    }

    const safeReserved = Math.max(0, reservedCredits ?? 0);
    const safeAvailable = Math.max(0, availableCredits);
    const availablePct = clamp01(safeAvailable / totalCredits);
    const reservedPct = clamp01(safeReserved / totalCredits);
    const pctLeft = Math.round(availablePct * 100);

    const chargeColor =
      pctLeft <= 10 ? "#FF453A" : pctLeft <= 25 ? "#FFD60A" : "#32D74B";

    const roundedAvailable = Math.round(safeAvailable);

    return {
      availablePct,
      reservedPct: Math.min(reservedPct, Math.max(0, 1 - availablePct)),
      reservedOffsetPct: availablePct,
      chargeColor,
      valueLabel: readableAvailableLabel || `${roundedAvailable} credits available`,
    };
  }, [totalCredits, availableCredits, reservedCredits, readableAvailableLabel]);

  const compactUsageText =
    readableAvailableLabel ||
    (availableCredits != null ? `${Math.round(Math.max(0, availableCredits))} credits available` : null) ||
    cleanUsageLabel;

  const fallbackStatusColor =
    statusTone === "red"
      ? "#FF3131"
      : statusTone === "amber"
        ? DF.gold ?? "#D2B07A"
        : "#39FF14";

  const showMetaBlock = Boolean(planAndUser || batteryMetrics || compactUsageText);

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
              <Text style={styles.wordmarkText} ellipsizeMode="clip">
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
          {showMetaBlock ? (
            <Pressable style={styles.rightTextBlock} onPress={onPressMeta}>
              {!!planAndUser && (
                <Text numberOfLines={1} style={styles.rightTop}>
                  {planAndUser}
                </Text>
              )}

              {batteryMetrics ? (
                <View style={styles.batteryBlock}>
                  <View style={styles.batteryRow}>
                    <View style={styles.batteryWrap}>
                      <View style={styles.batteryBody}>
                        <View
                          style={[
                            styles.batteryFill,
                            {
                              width: `${batteryMetrics.availablePct * 100}%`,
                              backgroundColor: batteryMetrics.chargeColor,
                            },
                          ]}
                        />

                        {batteryMetrics.reservedPct > 0 ? (
                          <View
                            style={[
                              styles.batteryReserved,
                              {
                                left: `${batteryMetrics.reservedOffsetPct * 100}%`,
                                width: `${batteryMetrics.reservedPct * 100}%`,
                              },
                            ]}
                          />
                        ) : null}
                      </View>

                      <View style={styles.batteryCap} />
                    </View>
                  </View>

                  <Text numberOfLines={1} style={styles.batteryValue}>
                    {batteryMetrics.valueLabel}
                  </Text>
                </View>
              ) : !!compactUsageText ? (
                <Text numberOfLines={1} style={styles.rightBottom}>
                  {compactUsageText}
                </Text>
              ) : null}
            </Pressable>
          ) : !!rightPill ? (
            <View style={styles.fallbackWrap}>
              <View style={[styles.fallbackDot, { backgroundColor: fallbackStatusColor }]} />
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
    paddingBottom: 8,
    minHeight: 62,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },

  left: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },

  rightWrap: {
    flexShrink: 1,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    width: 170,
    minWidth: 138,
    maxWidth: "46%",
    paddingTop: 1,
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
    paddingTop: 0,
  },

  wordmarkRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "nowrap",
    flexShrink: 0,
    alignSelf: "flex-start",
  },

  wordmarkText: {
    flexShrink: 0,
    includeFontPadding: false,
  },

  wordmarkMain: {
    color: DF.brandWordmark ?? "#D4A017",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
    textTransform: "lowercase",
  },

  wordmarkDot: {
    color: DF.aiWordmark ?? "#B22222",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
    textTransform: "lowercase",
  },

  wordmarkAi: {
    color: DF.aiWordmark ?? "#B22222",
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.2,
    textTransform: "lowercase",
  },

  subtitle: {
    marginTop: 2,
    color: DF.textSoft ?? DF.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.15,
    lineHeight: 14,
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
    fontSize: 10.5,
    fontWeight: "800",
    textAlign: "right",
    lineHeight: 13,
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

  batteryCap: {
    width: 3,
    height: 8,
    borderRadius: 1.5,
    marginLeft: 2,
    backgroundColor: DF.textSoft ?? "rgba(255,255,255,0.62)",
    opacity: 0.9,
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

  rightBottom: {
    marginTop: 4,
    color: DF.textSoft ?? DF.text,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "right",
    lineHeight: 13,
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
