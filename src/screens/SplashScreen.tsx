import React, { useCallback, useRef } from "react";
import { Image, StyleSheet, View } from "react-native";

const SPLASH_BG = "#010001";

type Props = {
  onReady?: () => void;
};

export function SplashScreen({ onReady }: Props) {
  const notifiedRef = useRef(false);

  const notifyReady = useCallback(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    onReady?.();
  }, [onReady]);

  return (
    <View style={styles.container} onLayout={notifyReady}>
      <Image
        source={require("../../assets/brand/desifaces-splash-fullscreen.png")}
        resizeMode="contain"
        style={styles.logo}
        fadeDuration={0}
        onLoadEnd={notifyReady}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_BG,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logo: {
    width: "82%",
    maxWidth: 380,
    height: "38%",
    maxHeight: 320,
  },
});