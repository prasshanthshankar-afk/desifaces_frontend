import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";
import { Image } from "expo-image";

type AnimatedSplashProps = {
  onReady?: () => void | Promise<void>;
  onDone: () => void;
};

const LOGO = require("../../../assets/images/splash/desifaces_logo_splash.png");

export default function AnimatedSplash({
  onReady,
  onDone,
}: AnimatedSplashProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const mountedRef = useRef(true);
  const onDoneRef = useRef(onDone);
  const onReadyRef = useRef(onReady);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    mountedRef.current = true;
    onReadyRef.current?.();

    const intro = Animated.timing(opacity, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.02,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    intro.start();
    pulse.start();

    timeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      onDoneRef.current?.();
    }, 2200);

    return () => {
      mountedRef.current = false;
      pulse.stop();
      scale.stopAnimation();
      opacity.stopAnimation();

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [opacity, scale]);

  return (
    <View style={styles.root}>
      <Animated.View
        style={[
          styles.logoWrap,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        <Image
          source={LOGO}
          style={styles.logo}
          contentFit="contain"
          transition={100}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0E0F14",
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    width: 320,
    height: 320,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 300,
    height: 300,
  },
});