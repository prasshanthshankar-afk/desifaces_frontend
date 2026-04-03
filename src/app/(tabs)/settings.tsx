import React, { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";

import DFHeader from "../../core/ui/DFHeader";
import { DF } from "../../core/theme/colors";
import { useAuth } from "../../core/auth/AuthContext";
import { useAccountPricingSnapshot } from "../../core/pricing/useAccountPricingSnapshot";

function GlassCard({
  children,
  accent = "rgba(255,255,255,0.10)",
}: {
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: "rgba(255,255,255,0.05)",
        padding: 14,
      }}
    >
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        padding: 12,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "800" }}>{label}</Text>
      <Text style={{ color: DF.text, fontSize: 16, fontWeight: "900", marginTop: 6 }}>{value}</Text>
      {!!helper && (
        <Text style={{ color: DF.muted, fontSize: 12, fontWeight: "700", lineHeight: 18, marginTop: 6 }}>
          {helper}
        </Text>
      )}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  tone = "neutral",
}: {
  label: string;
  onPress: () => void;
  tone?: "neutral" | "primary";
}) {
  const isPrimary = tone === "primary";
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 16,
        paddingVertical: 13,
        paddingHorizontal: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: isPrimary ? "rgba(248,184,72,0.38)" : "rgba(255,255,255,0.10)",
        backgroundColor: isPrimary ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
      }}
    >
      <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const auth = useAuth() as any;
  const snapshot = useAccountPricingSnapshot();

  const signedInLabel = auth?.isAuthed ? "Signed in" : "Not signed in";
  const planLabel = snapshot.planName || "Plan loading";
  const creditsSummary = useMemo(() => {
    const available = snapshot.availableLabel ? `${snapshot.availableLabel} available` : "Credits loading";
    const used = snapshot.usedLabel ? `${snapshot.usedLabel} used` : "Usage loading";
    const reserved = snapshot.reservedLabel ? `${snapshot.reservedLabel} reserved` : "0 reserved";
    return `${available} • ${used} • ${reserved}`;
  }, [snapshot.availableLabel, snapshot.usedLabel, snapshot.reservedLabel]);

  const fusionAccess = [
    snapshot.hasTalkingVideo ? "Talking Video" : null,
    snapshot.hasCinematicVideoDirection ? "Cinematic Video Direction" : null,
  ].filter(Boolean).join(" • ") || "Fusion access depends on your current plan";

  return (
    <View style={{ flex: 1, backgroundColor: DF.bg || DF.night }}>
      <DFHeader subtitle="Settings" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 14, paddingBottom: 36, gap: 12 }}
      >
        <GlassCard accent="rgba(248,184,72,0.28)">
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>App settings</Text>
          <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, lineHeight: 18, marginTop: 8 }}>
            This is now a useful control hub instead of a placeholder screen. Use it to review account status, plan access, app environment, and quick actions.
          </Text>
        </GlassCard>

        <GlassCard>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>Account</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Row
              label="Sign-in status"
              value={signedInLabel}
              helper="Authentication state from the shared app session."
            />
            <Row
              label="Current plan"
              value={planLabel}
              helper="Sourced from the shared account pricing snapshot."
            />
            <Row
              label="Credits"
              value={creditsSummary}
              helper="Available, used, and reserved values stay aligned with Dashboard, Face, Audio, Fusion, and Billing."
            />
          </View>
        </GlassCard>

        <GlassCard>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>Fusion access</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Row
              label="Enabled video features"
              value={fusionAccess}
              helper="Feature access comes from your entitlements and plan posture."
            />
            <Row
              label="Entitlement source"
              value={snapshot.entitlementSource || "Plan fallback"}
              helper="Useful when validating Talking Video and Cinematic Video Direction visibility."
            />
          </View>
        </GlassCard>

        <GlassCard>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>App environment</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Row
              label="Environment"
              value="Production"
              helper="Use this to quickly confirm which environment the mobile app is pointed at."
            />
            <Row
              label="About"
              value="desifaces.ai Mobile"
              helper="Premium creator workflows for Face, Audio, Fusion, Retail, Music, and Billing."
            />
          </View>
        </GlassCard>

        <GlassCard>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>Quick actions</Text>
          <View style={{ gap: 10, marginTop: 12 }}>
            <ActionButton label="Open Billing" tone="primary" onPress={() => router.push("/(tabs)/billing" as any)} />
            <ActionButton label="Open Dashboard" onPress={() => router.push("/(tabs)/dashboard" as any)} />
            <ActionButton label="Go to Face Studio" onPress={() => router.push("/(tabs)/face" as any)} />
            <ActionButton label="Go to Audio Studio" onPress={() => router.push("/(tabs)/audio" as any)} />
            <ActionButton label="Go to Fusion Studio" onPress={() => router.push("/(tabs)/fusion" as any)} />
          </View>
        </GlassCard>
      </ScrollView>
    </View>
  );
}
