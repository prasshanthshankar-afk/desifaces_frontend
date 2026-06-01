import React from "react";
import { View, Text, StyleSheet } from "react-native";
import GaugeAnalog from "./GaugeAnalog";
import GaugeMini from "./GaugeMini";
import Odometer from "./Odometer";

const DF = {
  bg: "#080808",
  surface: "#180808",
  text: "#F8E888",
  text2: "#F8D868",
  gold: "#E89838",
  goldBright: "#F8B848",
  border: "rgba(248,184,72,0.16)",
};

export default function ClassicCluster(props: {
  speedValue: number; // 0-60
  rpmValue: number;   // 0-100
  fuelValue: number;  // 0-100
  tempValue: number;  // 0-100
  odometerValue: number;
  successRate: number; // 0-100
}) {
  const { speedValue, rpmValue, fuelValue, tempValue, odometerValue, successRate } = props;

  const throughput = Math.max(0, Math.min(60, Number(speedValue) || 0));
  const queuePressure = Math.max(0, Math.min(100, Number(rpmValue) || 0));

  return (
    <View style={styles.clusterWrap}>
      {/* Top info row (like Mustang’s small upper display) */}
      <View style={styles.topRow}>
        <Text style={styles.topLabel}>DRIVE MODE</Text>
        <Text style={styles.topValue}>SPORT</Text>

        <View style={{ flex: 1 }} />

        <Text style={styles.topLabel}>SUCCESS</Text>
        <Text style={styles.topValue}>{Math.round(successRate)}%</Text>
      </View>

      {/* Main dual gauges */}
      <View style={styles.gaugesRow}>
        <GaugeAnalog
          title="THROUGHPUT"
          value01={throughput / 60}
          valueLabel={`${Math.round(throughput)}`}
          minValueLabel="0"
          maxValueLabel="60"
          minMeaningLabel=""
          maxMeaningLabel="jobs/min"
          accent={DF.gold}
          size={168}
        />

        <GaugeAnalog
          title="QUEUE PRESSURE"
          value01={queuePressure / 100}
          valueLabel={`${Math.round(queuePressure)}%`}
          minValueLabel="0"
          maxValueLabel="100"
          minMeaningLabel=""
          maxMeaningLabel="pressure"
          accent={DF.goldBright}
          size={168}
        />
      </View>

      {/* Lower small gauges + odometer */}
      <View style={styles.lowerRow}>
        <GaugeMini title="CREDITS" left="E" right="F" value={fuelValue} />
        <Odometer value={odometerValue} label="ASSETS THIS WEEK" />
        <GaugeMini title="HEALTH" left="C" right="H" value={tempValue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clusterWrap: {
    backgroundColor: "rgba(24,8,8,0.92)",
    borderWidth: 1,
    borderColor: DF.border,
    borderRadius: 22,
    padding: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingHorizontal: 2,
    marginBottom: 10,
  },
  topLabel: {
    color: "rgba(248,216,104,0.55)",
    fontWeight: "900",
    fontSize: 10,
    letterSpacing: 0.6,
  },
  topValue: {
    color: DF.text,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 0.4,
  },
  gaugesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  lowerRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
