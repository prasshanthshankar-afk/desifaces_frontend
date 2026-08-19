import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { DF } from "../../core/theme/colors";

function StepItem({
  n,
  label,
  step,
}: {
  n: 1 | 2 | 3;
  label: string;
  step: 1 | 2 | 3;
}) {
  const active = step === n;
  const done = step > n;

  return (
    <View style={styles.item}>
      <View
        style={[
          styles.circle,
          done && styles.circleDone,
          active && styles.circleActive,
        ]}
      >
        <Text style={styles.number}>{n}</Text>
      </View>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </View>
  );
}

export default function FacePipelineStepper({
  step = 1,
}: {
  step?: 1 | 2 | 3;
}) {
  return (
    <View style={styles.row}>
      <StepItem n={1} label="Face" step={step} />
      <View style={styles.line} />
      <StepItem n={2} label="Audio" step={step} />
      <View style={styles.line} />
      <StepItem n={3} label="Fusion" step={step} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 2,
    backgroundColor: "#080A0F",
  },
  item: {
    flex: 1,
    alignItems: "center",
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: DF.border,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  circleDone: {
    borderColor: "rgba(248,184,72,0.55)",
  },
  circleActive: {
    backgroundColor: "rgba(232,152,56,0.22)",
  },
  number: {
    color: DF.text,
    fontWeight: "900",
    fontSize: 12,
  },
  label: {
    color: DF.muted,
    marginTop: 6,
    fontWeight: "800",
    fontSize: 11,
  },
  labelActive: {
    color: DF.text,
  },
  line: {
    width: 22,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
});
