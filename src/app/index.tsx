import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { Redirect } from "expo-router";

import { useAuth } from "../core/auth/AuthContext";
import {
  CORE_BASE,
  FACE_BASE,
  AUDIO_BASE,
  DASH_BASE,
  VIDEO_BASE,
} from "../core/config/env";

const APP_BOOT_BG = "#010001";

async function safe<T>(p: Promise<T>) {
  try {
    return await p;
  } catch {
    return null;
  }
}

export default function Index() {
  const { isReady, isAuthed } = useAuth();
  const didSmokeRef = useRef(false);

  // Keep this true until custom fonts are actually added.
  const fontsLoaded = true;
  const ready = fontsLoaded && isReady;

  useEffect(() => {
    if (!__DEV__) return;
    if (!ready) return;
    if (didSmokeRef.current) return;
    didSmokeRef.current = true;

    (async () => {
      console.log("DF_API_BASES", {
        CORE_BASE,
        FACE_BASE,
        AUDIO_BASE,
        VIDEO_BASE,
        DASH_BASE,
      });

      const checks = await Promise.all([
        safe(
          fetch(`${CORE_BASE}/api/health`).then((r) =>
            r.ok ? r.json() : r.text()
          )
        ),
        safe(
          fetch(`${FACE_BASE}/api/health`).then((r) =>
            r.ok ? r.json() : r.text()
          )
        ),
        safe(
          fetch(`${AUDIO_BASE}/api/health`).then((r) =>
            r.ok ? r.json() : r.text()
          )
        ),
        safe(
          fetch(`${VIDEO_BASE}/api/health`).then((r) =>
            r.ok ? r.json() : r.text()
          )
        ),
        safe(
          fetch(`${DASH_BASE}/api/health`).then((r) =>
            r.ok ? r.json() : r.text()
          )
        ),
      ]);

      console.log("DF_HEALTH_CHECKS", {
        core: checks[0],
        face: checks[1],
        audio: checks[2],
        video: checks[3],
        dash: checks[4],
      });
    })();
  }, [ready]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: APP_BOOT_BG }} />;
  }

  return <Redirect href={isAuthed ? "/(tabs)/dashboard" : "/(auth)/login"} />;
}