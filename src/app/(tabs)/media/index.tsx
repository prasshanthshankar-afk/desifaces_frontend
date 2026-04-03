import React from "react";
import { View, Text } from "react-native";
import { DF } from "../../../core/theme/colors";
import DFHeader from "../../../core/ui/DFHeader";

export default function MediaHome() {
  return (
    <View style={{ flex: 1, backgroundColor: DF.night }}>
      <DFHeader subtitle="Media" />
      <View style={{ padding: 16 }}>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontWeight: "900" }}>
          Media
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.6)", marginTop: 8, fontWeight: "800" }}>
          This route exists so /(tabs)/media is well-formed. Viewer is opened from Dashboard/Face/Fusion.
        </Text>
      </View>
    </View>
  );
}