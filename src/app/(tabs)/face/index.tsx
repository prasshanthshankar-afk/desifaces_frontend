import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import MultiPersonFaceDirectorScreen from "../../../features/face/MultiPersonFaceDirectorScreen";

function loadFaceStudioScreen() {
  try {
    const mod = require("../../../features/face/FaceStudioScreen");
    return mod?.default ?? mod;
  } catch (error) {
    console.warn("[FaceTab] FaceStudioScreen unavailable", error);
    return null;
  }
}

function FaceUnavailable() {
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
        Face Studio temporarily unavailable
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

function ModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 40,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? "#D2B07A" : "rgba(255,255,255,0.055)",
        borderWidth: 1,
        borderColor: active ? "#D2B07A" : "rgba(255,255,255,0.08)",
      }}
    >
      <Text
        style={{
          color: active ? "#1F1408" : "rgba(255,255,255,0.72)",
          fontSize: 13,
          fontWeight: "900",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function FaceTabRoute() {
  const [mode, setMode] = useState<"individual" | "multi-person">("individual");
  const Screen = loadFaceStudioScreen();

  return (
    <View style={{ flex: 1, backgroundColor: "#080A0F" }}>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          paddingHorizontal: 14,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: "#080A0F",
        }}
      >
        <ModeButton label="Individual" active={mode === "individual"} onPress={() => setMode("individual")} />
        <ModeButton label="Multi-Person" active={mode === "multi-person"} onPress={() => setMode("multi-person")} />
      </View>

      <View style={{ flex: 1 }}>
        {mode === "multi-person" ? (
          <MultiPersonFaceDirectorScreen />
        ) : Screen ? (
          <Screen />
        ) : (
          <FaceUnavailable />
        )}
      </View>
    </View>
  );
}
