import React from "react";
import { View, Text, Pressable } from "react-native";
import { router } from "expo-router";

function loadDashboardScreen() {
  try {
    const mod = require("../../screens/DashboardScreen");
    return mod?.default ?? mod;
  } catch (error) {
    console.warn("[DashboardTab] DashboardScreen unavailable", error);
    return null;
  }
}

function DashboardUnavailable() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#090B10",
        paddingHorizontal: 24,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.95)", fontSize: 22, fontWeight: "900", textAlign: "center" }}>
        Dashboard temporarily unavailable
      </Text>

      <Text
        style={{
          color: "rgba(255,255,255,0.72)",
          fontSize: 14,
          lineHeight: 22,
          fontWeight: "700",
          textAlign: "center",
          marginTop: 12,
          maxWidth: 420,
        }}
      >
        A video-native dependency is unavailable in the current development build.
        Billing and Apple IAP can still be tested from Plan & Billing.
      </Text>

      <Pressable
        onPress={() => router.push("/pricing/plan-billing")}
        style={{
          marginTop: 20,
          minHeight: 46,
          minWidth: 220,
          borderRadius: 14,
          backgroundColor: "#D2B07A",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 18,
        }}
      >
        <Text style={{ color: "#1F1408", fontWeight: "900", fontSize: 14 }}>
          Open Billing
        </Text>
      </Pressable>
    </View>
  );
}

export default function DashboardRoute() {
  const Screen = loadDashboardScreen();
  return Screen ? <Screen /> : <DashboardUnavailable />;
}
