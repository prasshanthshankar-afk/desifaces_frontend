import { router } from "expo-router";
import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { STUDIO } from "../../core/studio/DenseStudioUI";

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
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: STUDIO.bg,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  label: {
    color: STUDIO.accentText,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  helper: {
    flexShrink: 1,
    color: STUDIO.muted,
    fontSize: 9,
    fontWeight: "700",
    textAlign: "right",
  },
  segmented: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "stretch",
    padding: 3,
    gap: 3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surfaceSoft,
  },
  tab: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  tabActive: {
    borderColor: STUDIO.accentBorder,
    backgroundColor: STUDIO.accentFill,
  },
  tabPressed: {
    opacity: 0.72,
  },
  tabText: {
    color: STUDIO.muted,
    fontSize: 11,
    fontWeight: "900",
  },
  tabTextActive: {
    color: STUDIO.accentText,
  },
});