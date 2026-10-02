import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import DFHeader from "../../../core/ui/DFHeader";
import FaceCreationModeSwitch from "../../../features/face/FaceCreationModeSwitch";
import FacePipelineStepper from "../../../features/face/FacePipelineStepper";
import MultiPersonFaceDirectorScreen, {
  type MultiPersonExperience,
} from "../../../features/face/MultiPersonFaceDirectorScreen";
import { STUDIO } from "../../../core/studio/DenseStudioUI";
import RecentStoriesMobilePanel from "../../../features/story/RecentStoriesMobilePanel";

export default function MultiPersonFaceRoute() {
  const [experience, setExperience] = useState<MultiPersonExperience>("separate_faces");
  const openHamburgerMenu = useCallback(() => {
    router.push({
      pathname: "/(tabs)/dashboard" as any,
      params: {
        openMenu: "1",
        menu_nonce: `${Date.now()}`,
        menu_source: "face",
      },
    } as any);
  }, []);

  const openPlanScreen = useCallback(() => {
    router.push({
      pathname: "/(tabs)/billing" as any,
      params: {
        intent: "manage",
        source: "face",
      },
    } as any);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#080A0F" }}>
      <DFHeader
        subtitle="Face Studio"
        onMenuPress={openHamburgerMenu}
        onPressMeta={openPlanScreen}
      />
      <FaceCreationModeSwitch active="multi-person" />
      <FacePipelineStepper step={1} />
      <View style={styles.experienceWrap}>
        <Text style={styles.experienceEyebrow}>HOW DO YOU WANT TO START?</Text>
        <View style={styles.experienceRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: experience === "shared_scene" }}
            onPress={() => setExperience("shared_scene")}
            style={({ pressed }) => [
              styles.experienceCard,
              experience === "shared_scene" && styles.experienceCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.experienceTitle}>Create one group photo</Text>
            <Text style={styles.experienceText}>
              Keep everyone together in one photo, identify each speaker once, then create the conversation. Group photos support 2+ people; video conversation currently supports 2.
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: experience === "separate_faces" }}
            onPress={() => setExperience("separate_faces")}
            style={({ pressed }) => [
              styles.experienceCard,
              experience === "separate_faces" && styles.experienceCardActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.experienceTitle}>Add people one by one</Text>
            <Text style={styles.experienceText}>
              Create or reuse each person’s Face separately, approve the cast, then create Audio and Video.
            </Text>
          </Pressable>
        </View>
      </View>
      <RecentStoriesMobilePanel />
      <View style={{ flex: 1 }}>
        <MultiPersonFaceDirectorScreen key={experience} experience={experience} />
      </View>
    </View>
  );
}


const styles = StyleSheet.create({
  experienceWrap: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: STUDIO.bg,
  },
  experienceEyebrow: {
    color: STUDIO.accentText,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.05,
    marginBottom: 7,
  },
  experienceRow: {
    flexDirection: "row",
    gap: 8,
  },
  experienceCard: {
    flex: 1,
    minHeight: 92,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surface,
    padding: 10,
  },
  experienceCardActive: {
    borderColor: STUDIO.accentBorder,
    backgroundColor: STUDIO.accentFill,
  },
  experienceTitle: {
    color: STUDIO.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  experienceText: {
    color: STUDIO.muted,
    fontSize: 9.5,
    lineHeight: 14,
    fontWeight: "600",
    marginTop: 5,
  },
  pressed: { opacity: 0.76 },
});
