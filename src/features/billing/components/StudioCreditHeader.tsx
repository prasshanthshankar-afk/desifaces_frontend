import React from "react";
import { View, Text, Pressable } from "react-native";
import { DF } from "../../../core/theme/colors";

export default function StudioCreditHeader({
  planLabel,
  availableLabel,
  holdLabel,
  settlementLabel,
  onPress,
}: {
  planLabel?: string;
  availableLabel?: string;
  holdLabel?: string;
  settlementLabel?: string;
  onPress?: () => void;
}) {
  const Body = (
    <View
      style={{
        marginHorizontal: 16,
        marginTop: 10,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.05)",
        padding: 12,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>
            {planLabel ?? "Plan"}
          </Text>
          <Text style={{ color: DF.muted, marginTop: 3, fontWeight: "700", fontSize: 11 }}>
            {settlementLabel ?? "Transparent pricing"}
          </Text>
        </View>

        <View
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(248,184,72,0.25)",
            backgroundColor: "rgba(232,152,56,0.10)",
          }}
        >
          <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900", fontSize: 11 }}>
            Live
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <View
          style={{
            flex: 1,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.04)",
            padding: 10,
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 10 }}>
            Available
          </Text>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12, marginTop: 6 }}>
            {availableLabel ?? "—"}
          </Text>
        </View>

        <View
          style={{
            flex: 1,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.04)",
            padding: 10,
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 10 }}>
            On hold / activity
          </Text>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12, marginTop: 6 }}>
            {holdLabel ?? "No active holds"}
          </Text>
        </View>
      </View>
    </View>
  );

  if (!onPress) return Body;

  return <Pressable onPress={onPress}>{Body}</Pressable>;
}