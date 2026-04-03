import React from "react";
import { View, Text, Image } from "react-native";
import { DF } from "../../core/theme/colors";

export function AuthBrandHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ alignItems: "center", marginBottom: 20 }}>
      <Image
        source={require("../../../assets/brand/desifaces-logo.png")}
        style={{
          width: 86,
          height: 86,
          marginBottom: 12,
          resizeMode: "contain",
        }}
      />

      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text
          style={{
            color: DF.brandWordmark ?? "#84EFA2",
            fontSize: 24,
            fontWeight: "900",
            letterSpacing: 0.2,
          }}
        >
          desifaces.
        </Text>
        <Text
          style={{
            color: DF.aiWordmark ?? DF.magenta ?? "#D86CFF",
            fontSize: 24,
            fontWeight: "900",
            letterSpacing: 0.2,
          }}
        >
          ai
        </Text>
      </View>

      <Text
        style={{
          color: DF.textStrong ?? DF.text,
          fontSize: 18,
          fontWeight: "800",
          letterSpacing: 0.15,
          textAlign: "center",
          marginTop: 10,
        }}
      >
        {title}
      </Text>

      {!!subtitle ? (
        <Text
          style={{
            color: DF.textSoft ?? DF.muted,
            marginTop: 6,
            fontSize: 12,
            textAlign: "center",
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}