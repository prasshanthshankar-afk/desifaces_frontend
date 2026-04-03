import React, { useEffect, useRef, useState } from "react";
import { router } from "expo-router";

import AnimatedSplash from "../features/splash/AnimatedSplash";
import { useAuth } from "../core/auth/AuthContext";
import {
  CORE_BASE,
  FACE_BASE,
  AUDIO_BASE,
  DASH_BASE,
  VIDEO_BASE,
} from "../core/config/env";

async function safe<T>(p: Promise<T>) {
  try {
    return await p;
  } catch {
    return null;
  }
}

export default function Index() {
  const { isReady, isAuthed } = useAuth();

  // Keep this true until you actually add custom fonts.
  const fontsLoaded = true;

  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);

  const navigatedRef = useRef(false);
  const didSmokeRef = useRef(false);

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

  const onSplashReady = () => {
    // Native splash is controlled only from src/app/_layout.tsx
  };

  const onSplashDone = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    setShowAnimatedSplash(false);

    if (isAuthed) {
      router.replace("/(tabs)/dashboard");
    } else {
      router.replace("/(auth)/login");
    }
  };

  if (!ready) return null;

  if (showAnimatedSplash) {
    return <AnimatedSplash onReady={onSplashReady} onDone={onSplashDone} />;
  }

  return null;
}