import React from "react";
import { View, Text, StyleSheet } from "react-native";

const DF = {
  bg: "#080808",
  surface: "#180808",
  text: "#F8E888",
  text2: "#F8D868",
  border: "rgba(248,184,72,0.16)",
};

export default function Odometer({ value, label }: { value: number; label: string }) {
  const str = String(Math.max(0, value)).padStart(6, "0");

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readout}>
        <Text style={styles.value}>{str}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  label: {
    color: "rgba(248,216,104,0.55)",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.6,
    marginBottom: 6,
    textAlign: "center",
  },
  readout: {
    backgroundColor: "rgba(40,24,8,0.50)",
    borderColor: DF.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    color: DF.text,
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 2.2,
    fontVariant: ["tabular-nums"],
  },
});