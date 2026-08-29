import React, { useMemo } from "react";
import { Slot } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "../core/auth/AuthContext";
import { AssistantContextProvider } from "../features/assistant/AssistantContext";
import AssistantOverlay from "../features/assistant/AssistantOverlay";

export default function RootLayout() {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AssistantContextProvider>
              <View style={{ flex: 1 }}>
                <Slot />
                <AssistantOverlay />
              </View>
            </AssistantContextProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
