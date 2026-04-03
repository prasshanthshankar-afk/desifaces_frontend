import React from "react";
import { View, Text } from "react-native";
import { DF } from "../../../core/theme/colors";

export default function PricingEstimateStrip({
  loading,
  estimateLabel,
  detailLabel,
  settlementLabel,
  insufficientBalance,
  preview,
}: {
  loading?: boolean;
  estimateLabel: string;
  detailLabel?: string;
  settlementLabel?: string;
  insufficientBalance?: boolean;
  preview?: boolean;
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: insufficientBalance
          ? "rgba(255,120,120,0.28)"
          : "rgba(255,255,255,0.10)",
        backgroundColor: insufficientBalance
          ? "rgba(255,120,120,0.08)"
          : "rgba(255,255,255,0.05)",
        padding: 12,
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
          <Text
            style={{
              color: "rgba(255,255,255,0.58)",
              fontWeight: "800",
              fontSize: 10,
            }}
          >
            {preview ? "ESTIMATE PREVIEW" : "ESTIMATED"}
          </Text>

          <Text
            numberOfLines={1}
            style={{
              color: DF.text,
              fontWeight: "900",
              fontSize: 14,
              marginTop: 6,
            }}
          >
            {loading ? "Calculating…" : estimateLabel}
          </Text>

          {!!detailLabel && (
            <Text
              style={{
                color: DF.muted,
                fontWeight: "700",
                fontSize: 11,
                marginTop: 6,
              }}
            >
              {detailLabel}
            </Text>
          )}
        </View>

        <View
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: preview
              ? "rgba(255,255,255,0.12)"
              : "rgba(248,184,72,0.28)",
            backgroundColor: preview
              ? "rgba(255,255,255,0.06)"
              : "rgba(232,152,56,0.12)",
          }}
        >
          <Text
            style={{
              color: preview ? DF.text : "rgba(248,232,136,0.95)",
              fontWeight: "900",
              fontSize: 11,
            }}
          >
            {preview ? "Preview" : "Live"}
          </Text>
        </View>
      </View>

      {!!settlementLabel && (
        <Text
          style={{
            color: insufficientBalance ? "rgba(255,180,180,0.95)" : DF.muted,
            fontWeight: "700",
            fontSize: 11,
            marginTop: 10,
          }}
        >
          {settlementLabel}
        </Text>
      )}
    </View>
  );
}