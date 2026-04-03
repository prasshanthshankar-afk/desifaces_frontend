import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { DF } from "../core/theme/colors";

export function SplashScreen() {
  const scale = useRef(new Animated.Value(0.94)).current;
  const glow = useRef(new Animated.Value(0.0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 1100, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 1100, useNativeDriver: true }),
        ])
      ),
    ]).start();
  }, [glow, scale]);

  return (
    <View style={{ flex: 1, backgroundColor: DF.bgBlack, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ transform: [{ scale }], opacity: 1 }}>
        <Animated.Image
          source={require("../../assets/brand/desifaces-logo.png")}
          style={{
            width: 220,
            height: 220,
            borderRadius: 40,
            shadowColor: DF.gold,
            shadowOpacity: 0.35,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
          }}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}