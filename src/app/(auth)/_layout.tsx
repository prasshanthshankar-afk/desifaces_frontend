import React from "react";
import { Stack } from "expo-router";
import { Platform } from "react-native";
import { DF } from "../../core/theme/colors";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: DF.night },

        // Premium transitions
        animation: Platform.OS === "ios" ? "fade_from_bottom" : "fade",
        gestureEnabled: true,
        gestureDirection: "horizontal",

        // Android feel a bit snappier
        animationDuration: Platform.OS === "android" ? 180 : 260,
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}