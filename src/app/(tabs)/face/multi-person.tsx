import { router } from "expo-router";
import React, { useCallback } from "react";
import { View } from "react-native";

import DFHeader from "../../../core/ui/DFHeader";
import FaceCreationModeSwitch from "../../../features/face/FaceCreationModeSwitch";
import FacePipelineStepper from "../../../features/face/FacePipelineStepper";
import MultiPersonFaceDirectorScreen from "../../../features/face/MultiPersonFaceDirectorScreen";

export default function MultiPersonFaceRoute() {
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
      <View style={{ flex: 1 }}>
        <MultiPersonFaceDirectorScreen />
      </View>
    </View>
  );
}
