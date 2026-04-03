import "react-native-gesture-handler";
import React, { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { TamaguiProvider } from "tamagui";

import tamaguiConfig from "../../tamagui.config";
import { AuthProvider, useAuth } from "../core/auth/AuthContext";
import { configureAppAudio } from "../core/media/audio";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function RootLayout() {
  useEffect(() => {
    configureAppAudio();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SplashController />
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      </TamaguiProvider>
    </GestureHandlerRootView>
  );
}

function SplashController() {
  const { isReady } = useAuth();
  const hiddenRef = useRef(false);

  useEffect(() => {
    if (!isReady || hiddenRef.current) return;

    hiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, [isReady]);

  return null;
}

function RootNavigator() {
  return (
    <Stack
      initialRouteName="index"
      screenOptions={{ headerShown: false, animation: "fade" }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="(tabs)/media/viewer"
        options={{ headerShown: false, presentation: "modal" }}
      />
    </Stack>
  );
}