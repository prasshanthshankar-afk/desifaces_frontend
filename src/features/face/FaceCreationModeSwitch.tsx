import { router } from "expo-router";
import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type FaceCreationMode = "individual" | "multi-person";

function ModeTab({
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
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} Face mode`}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tab,
        active && styles.tabActive,
        pressed && styles.tabPressed,
      ]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function FaceCreationModeSwitch({
  active,
}: {
  active: FaceCreationMode;
}) {
  const openIndividual = useCallback(() => {
    if (active === "individual") return;
    router.replace("/(tabs)/face" as any);
  }, [active]);

  const openMultiPerson = useCallback(() => {
    if (active === "multi-person") return;
    router.replace("/(tabs)/face/multi-person" as any);
  }, [active]);

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text style={styles.label}>FACE MODE</Text>
        <Text style={styles.helper}>Choose one person or build a cast</Text>
      </View>

      <View accessibilityRole="tablist" style={styles.segmented}>
        <ModeTab label="Individual" active={active === "individual"} onPress={openIndividual} />
        <ModeTab label="Multi-Person" active={active === "multi-person"} onPress={openMultiPerson} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: "#080A0F",
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 7,
  },
  label: {
    color: "#D2B07A",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  helper: {
    flexShrink: 1,
    color: "rgba(255,255,255,0.48)",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
  segmented: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "stretch",
    padding: 4,
    gap: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.045)",
  },
  tab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  tabActive: {
    borderColor: "rgba(210,176,122,0.72)",
    backgroundColor: "rgba(210,176,122,0.18)",
  },
  tabPressed: {
    opacity: 0.72,
  },
  tabText: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 14,
    fontWeight: "900",
  },
  tabTextActive: {
    color: "#F1D291",
  },
});
