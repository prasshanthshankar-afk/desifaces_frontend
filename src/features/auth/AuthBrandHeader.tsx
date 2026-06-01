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
    <View style={{ alignItems: "center", marginBottom: 20, width: "100%" }}>
      <Image
        source={require("../../../assets/brand/desifaces-logo.png")}
        style={{
          width: 86,
          height: 86,
          marginBottom: 12,
          resizeMode: "contain",
        }}
      />

      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "center",
          flexWrap: "nowrap",
          maxWidth: "100%",
        }}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
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
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
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
          paddingHorizontal: 8,
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
            lineHeight: 17,
            textAlign: "center",
            paddingHorizontal: 12,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
