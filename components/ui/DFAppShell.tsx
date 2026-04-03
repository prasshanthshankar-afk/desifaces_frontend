import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Colors, Gradients } from "../../constants/theme";

export function DFAppShell({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      {/* Premium glow background */}
      <LinearGradient
        colors={Gradients.heroGlow.colors}
        locations={Gradients.heroGlow.locations}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0.0 }}
        end={{ x: 0.5, y: 1.0 }}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
});