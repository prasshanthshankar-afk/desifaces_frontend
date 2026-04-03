import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { DF } from "../../../core/theme/colors";

function VariantsControl({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const clamp = (n: number) => Math.max(1, Math.min(8, n));
  const set = (n: number) => onChange(clamp(n));
  const presets = [2, 4, 6, 8];

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.06)",
        padding: 12,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Variants</Text>
        <View
          style={{
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(248,184,72,0.30)",
            backgroundColor: "rgba(232,152,56,0.12)",
          }}
        >
          <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900", fontSize: 12 }}>
            {value}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" }}>
        <Pressable
          onPress={() => set(value - 1)}
          disabled={disabled || value <= 1}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(0,0,0,0.22)",
            opacity: disabled || value <= 1 ? 0.45 : 1,
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>–</Text>
        </Pressable>

        <Pressable
          onPress={() => set(value + 1)}
          disabled={disabled || value >= 8}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(0,0,0,0.22)",
            opacity: disabled || value >= 8 ? 0.45 : 1,
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>+</Text>
        </Pressable>

        <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
          {presets.map((n) => {
            const active = value === n;
            return (
              <Pressable
                key={n}
                onPress={() => set(n)}
                disabled={disabled}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: active ? "rgba(248,184,72,0.40)" : "rgba(255,255,255,0.10)",
                  backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
                }}
              >
                <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900" }}>
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 11, marginTop: 8 }}>
        Tip: 4 is best for quick picking. 8 for maximum diversity.
      </Text>
    </View>
  );
}

function PromptTip({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: 10,
      }}
    >
      <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>{title}</Text>
      <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 11, marginTop: 4 }}>
        {text}
      </Text>
    </View>
  );
}

export default function FaceModeCreateForm({
  prompt,
  onChangePrompt,
  gender,
  onChangeGender,
  numVariants,
  onChangeNumVariants,
  zoneLabel,
  regionLabel,
  contextLabel,
  useCaseLabel,
  mdLoading,
  mdErr,
  locked,
  zoneDisabled,
  regionDisabled,
  contextDisabled,
  useCaseDisabled,
  onOpenZone,
  onOpenRegion,
  onOpenContext,
  onOpenUseCase,
  onRetryMasterdata,
}: {
  prompt: string;
  onChangePrompt: (v: string) => void;
  gender: "male" | "female";
  onChangeGender: (v: "male" | "female") => void;
  numVariants: number;
  onChangeNumVariants: (v: number) => void;
  zoneLabel: string;
  regionLabel: string;
  contextLabel: string;
  useCaseLabel: string;
  mdLoading: boolean;
  mdErr?: string | null;
  locked?: boolean;
  zoneDisabled?: boolean;
  regionDisabled?: boolean;
  contextDisabled?: boolean;
  useCaseDisabled?: boolean;
  onOpenZone: () => void;
  onOpenRegion: () => void;
  onOpenContext: () => void;
  onOpenUseCase: () => void;
  onRetryMasterdata?: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <View style={{ paddingHorizontal: 16, marginTop: 14, gap: 12 }}>
      <View
        style={{
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.06)",
          padding: 14,
        }}
      >
        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>Describe your look</Text>
        <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 12 }}>
          Include outfit, vibe, lighting, lens, pose, and the background or scene you want.
        </Text>

        <View
          style={{
            marginTop: 10,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: DF.border,
            backgroundColor: "rgba(0,0,0,0.22)",
            padding: 12,
          }}
        >
          <TextInput
            value={prompt}
            onChangeText={onChangePrompt}
            placeholder="Ultra-realistic cinematic portrait, elegant Indian outfit, soft golden-hour lighting, clean luxury background…"
            placeholderTextColor="rgba(248,216,104,0.35)"
            multiline
            editable={!locked}
            style={{
              color: DF.text,
              fontWeight: "700",
              minHeight: 96,
              textAlignVertical: "top",
            }}
          />
        </View>
      </View>

      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.06)",
          padding: 12,
        }}
      >
        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Gender</Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Pressable
            onPress={() => onChangeGender("female")}
            disabled={locked}
            style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: gender === "female" ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.04)",
              opacity: locked ? 0.75 : 1,
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>Female</Text>
          </Pressable>

          <Pressable
            onPress={() => onChangeGender("male")}
            disabled={locked}
            style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: gender === "male" ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.04)",
              opacity: locked ? 0.75 : 1,
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>Male</Text>
          </Pressable>
        </View>
      </View>

      <VariantsControl value={numVariants} onChange={onChangeNumVariants} disabled={locked} />

      <Pressable
        onPress={() => setAdvancedOpen((v) => !v)}
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.06)",
          padding: 12,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>Prompt guidance</Text>
            <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 12 }}>
              Tips for higher-quality outputs
            </Text>
          </View>
          <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900", fontSize: 16 }}>
            {advancedOpen ? "–" : "+"}
          </Text>
        </View>
      </Pressable>

      {advancedOpen && (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.04)",
            padding: 12,
            gap: 10,
          }}
        >
          <PromptTip
            title="Be specific"
            text="Mention outfit, mood, lighting, lens style, background, and pose instead of using a very short prompt."
          />
          <PromptTip
            title="Add visual direction"
            text="Examples: studio lighting, cinematic bokeh, editorial fashion, festival look, soft daylight, premium catalog."
          />
          <PromptTip
            title="Use the main setup above"
            text="Country, region, state, image type, use case, and context are already configured in the main section and will shape the result."
          />

          {!!mdErr && (
            <View style={{ marginTop: 4 }}>
              <Text style={{ color: "rgba(255,120,120,0.95)", fontWeight: "900", fontSize: 12 }}>
                Masterdata failed
              </Text>
              <Text style={{ color: "rgba(255,180,180,0.85)", fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                {mdErr}
              </Text>

              {!!onRetryMasterdata && (
                <Pressable
                  onPress={onRetryMasterdata}
                  disabled={locked}
                  style={{
                    marginTop: 10,
                    borderRadius: 14,
                    paddingVertical: 10,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.04)",
                    opacity: locked ? 0.75 : 1,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Retry</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}