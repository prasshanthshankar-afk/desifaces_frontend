import React from "react";
import { View, Text } from "react-native";
import { DF } from "../../../core/theme/colors";

export type FinalChargeSummaryData = {
  state?: "estimated" | "reserved" | "committed" | "released" | "failed";
  estimateLabel?: string;
  actualLabel?: string;
  releasedLabel?: string;
  settlementLabel?: string;
  balanceBeforeLabel?: string;
  balanceAfterLabel?: string;
  includedBeforeLabel?: string;
  includedAfterLabel?: string;
  ledgerLabel?: string;
  message?: string;
};

function Row({
  label,
  value,
  emphasize,
}: {
  label: string;
  value?: string | null;
  emphasize?: boolean;
}) {
  if (!value) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        marginTop: 10,
      }}
    >
      <Text
        style={{
          color: "rgba(255,255,255,0.58)",
          fontWeight: "800",
          fontSize: 11,
          flex: 1,
        }}
      >
        {label}
      </Text>

      <Text
        style={{
          color: emphasize ? DF.text : DF.text,
          fontWeight: emphasize ? "900" : "800",
          fontSize: 12,
          textAlign: "right",
          flex: 1,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function stateLabel(state?: FinalChargeSummaryData["state"]) {
  switch (state) {
    case "estimated":
      return "Estimated";
    case "reserved":
      return "Reserved";
    case "committed":
      return "Finalized";
    case "released":
      return "Released";
    case "failed":
      return "Failed";
    default:
      return "Summary";
  }
}

function stateTone(state?: FinalChargeSummaryData["state"]) {
  if (state === "failed") {
    return {
      border: "rgba(255,120,120,0.28)",
      bg: "rgba(255,120,120,0.08)",
      pillBg: "rgba(255,120,120,0.14)",
      pillText: "rgba(255,210,210,0.98)",
    };
  }

  if (state === "released") {
    return {
      border: "rgba(248,184,72,0.25)",
      bg: "rgba(232,152,56,0.08)",
      pillBg: "rgba(232,152,56,0.14)",
      pillText: "rgba(248,232,136,0.98)",
    };
  }

  if (state === "committed") {
    return {
      border: "rgba(110,211,156,0.25)",
      bg: "rgba(110,211,156,0.08)",
      pillBg: "rgba(110,211,156,0.14)",
      pillText: "rgba(210,255,228,0.98)",
    };
  }

  return {
    border: "rgba(255,255,255,0.10)",
    bg: "rgba(255,255,255,0.05)",
    pillBg: "rgba(255,255,255,0.08)",
    pillText: DF.text,
  };
}

export default function FinalChargeSummaryCard({
  state,
  estimateLabel,
  actualLabel,
  releasedLabel,
  settlementLabel,
  balanceBeforeLabel,
  balanceAfterLabel,
  includedBeforeLabel,
  includedAfterLabel,
  ledgerLabel,
  message,
}: FinalChargeSummaryData) {
  const hasAnyValue =
    !!estimateLabel ||
    !!actualLabel ||
    !!releasedLabel ||
    !!settlementLabel ||
    !!balanceBeforeLabel ||
    !!balanceAfterLabel ||
    !!includedBeforeLabel ||
    !!includedAfterLabel ||
    !!ledgerLabel ||
    !!message;

  if (!hasAnyValue) return null;

  const tone = stateTone(state);

  return (
    <View
      style={{
        marginTop: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: tone.border,
        backgroundColor: tone.bg,
        padding: 14,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>
            Pricing summary
          </Text>
          <Text
            style={{
              color: DF.muted,
              fontWeight: "700",
              fontSize: 11,
              marginTop: 4,
            }}
          >
            Transparent estimate, final actual, and balance impact
          </Text>
        </View>

        <View
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: tone.border,
            backgroundColor: tone.pillBg,
          }}
        >
          <Text
            style={{
              color: tone.pillText,
              fontWeight: "900",
              fontSize: 11,
            }}
          >
            {stateLabel(state)}
          </Text>
        </View>
      </View>

      <Row label="Estimated" value={estimateLabel} />
      <Row label="Final actual" value={actualLabel} emphasize />
      <Row label="Released / adjusted" value={releasedLabel} />
      <Row label="Settlement" value={settlementLabel} />
      <Row label="Balance before" value={balanceBeforeLabel} />
      <Row label="Balance after" value={balanceAfterLabel} />
      <Row label="Included before" value={includedBeforeLabel} />
      <Row label="Included after" value={includedAfterLabel} />
      <Row label="Billing reference" value={ledgerLabel} />

      {!!message && (
        <View
          style={{
            marginTop: 12,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            backgroundColor: "rgba(255,255,255,0.04)",
            padding: 10,
          }}
        >
          <Text
            style={{
              color: DF.text,
              fontWeight: "700",
              fontSize: 12,
            }}
          >
            {message}
          </Text>
        </View>
      )}
    </View>
  );
}