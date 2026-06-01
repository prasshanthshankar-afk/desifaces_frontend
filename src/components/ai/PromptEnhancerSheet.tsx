import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { DF } from "../../core/theme/colors";

export type PromptEnhancerAlternative = {
  label: string;
  text: string;
};

export type PromptEnhancerResult = {
  original_input: string;
  enhanced_input: string;
  alternatives?: PromptEnhancerAlternative[];
  tips?: string[];
  why_this_is_better?: string | null;
  source?: string;
  fallback_used?: boolean;
  structured?: Record<string, any>;
};

type Props = {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  result?: PromptEnhancerResult | null;
  onClose: () => void;
  onRefresh?: () => void;
  onApply: (text: string, label?: string) => void;
};

function ActionButton({
  label,
  onPress,
  variant = "secondary",
  disabled,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={{
        height: 46,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: primary ? "rgba(248,184,72,0.35)" : "rgba(255,255,255,0.12)",
        backgroundColor: primary ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.05)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function PromptEnhancerSheet({
  visible,
  loading = false,
  error,
  result,
  onClose,
  onRefresh,
  onApply,
}: Props) {
  const alternatives = result?.alternatives ?? [];
  const tips = result?.tips ?? [];
  const bg = (DF as any)?.night2 ?? "#141824";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)" }}
      />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "88%",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: bg,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: "rgba(255,255,255,0.08)",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 16 }}>
              Prompt enhancement
            </Text>
            <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 4, fontSize: 12 }}>
              Review the rewrite before you apply it.
            </Text>
          </View>

          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(255,255,255,0.05)",
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 16 }}>×</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 22, gap: 12 }}
        >
          {!!error && (
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: "rgba(255,180,90,0.28)",
                backgroundColor: "rgba(255,180,90,0.10)",
                padding: 12,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>
                {error}
              </Text>
            </View>
          )}

          {loading && (
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                padding: 18,
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <ActivityIndicator />
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>
                Building a stronger Face prompt…
              </Text>
            </View>
          )}

          {!!result?.original_input && (
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                padding: 12,
              }}
            >
              <Text style={{ color: "rgba(255,255,255,0.58)", fontWeight: "800", fontSize: 11 }}>
                ORIGINAL
              </Text>
              <Text style={{ color: DF.text, fontWeight: "700", marginTop: 8, fontSize: 13, lineHeight: 20 }}>
                {result.original_input}
              </Text>
            </View>
          )}

          {!!result?.enhanced_input && (
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(248,184,72,0.28)",
                backgroundColor: "rgba(232,152,56,0.10)",
                padding: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>
                  ENHANCED
                </Text>
                <Text style={{ color: "rgba(248,232,136,0.90)", fontWeight: "800", fontSize: 11 }}>
                  {(result.source ?? "fallback").toUpperCase()}
                </Text>
              </View>

              <Text style={{ color: DF.text, fontWeight: "700", marginTop: 8, fontSize: 13, lineHeight: 20 }}>
                {result.enhanced_input}
              </Text>

              {!!result.why_this_is_better && (
                <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 8, fontSize: 12, lineHeight: 18 }}>
                  {result.why_this_is_better}
                </Text>
              )}

              <View style={{ marginTop: 12 }}>
                <ActionButton
                  label="Use enhanced prompt"
                  variant="primary"
                  onPress={() => onApply(result.enhanced_input, "Enhanced")}
                />
              </View>
            </View>
          )}

          {alternatives.length > 0 && (
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                padding: 12,
                gap: 12,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>
                Alternate directions
              </Text>

              {alternatives.map((alt, index) => (
                <View
                  key={`${alt.label}-${index}`}
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(0,0,0,0.18)",
                    padding: 12,
                    gap: 10,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>
                    {alt.label}
                  </Text>
                  <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, lineHeight: 18 }}>
                    {alt.text}
                  </Text>
                  <ActionButton
                    label={`Use ${alt.label}`}
                    onPress={() => onApply(alt.text, alt.label)}
                  />
                </View>
              ))}
            </View>
          )}

          {tips.length > 0 && (
            <View
              style={{
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
                padding: 12,
                gap: 10,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>
                Why this should perform better
              </Text>
              {tips.map((tip, index) => (
                <Text
                  key={`${tip}-${index}`}
                  style={{ color: DF.muted, fontWeight: "700", fontSize: 12, lineHeight: 18 }}
                >
                  • {tip}
                </Text>
              ))}
            </View>
          )}

          <View style={{ gap: 10 }}>
            {!!onRefresh && (
              <ActionButton label="Refresh enhancement" onPress={onRefresh} disabled={loading} />
            )}
            <ActionButton label="Close" onPress={onClose} disabled={loading} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
