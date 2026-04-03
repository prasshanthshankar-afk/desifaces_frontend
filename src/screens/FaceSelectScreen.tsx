import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";
import { DF } from "../core/theme/colors";
import DFHeader from "../core/ui/DFHeader";
import { shareUrl } from "../core/share/share";

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const Item = ({ n, label }: { n: 1 | 2 | 3; label: string }) => {
    const active = step === n;
    const done = step > n;
    return (
      <View style={{ flex: 1, alignItems: "center" }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: done ? "rgba(248,184,72,0.55)" : DF.border,
            backgroundColor: active ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>{n}</Text>
        </View>
        <Text style={{ color: active ? DF.text : DF.muted, marginTop: 6, fontWeight: "800", fontSize: 11 }}>
          {label}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10 }}>
      <Item n={1} label="Face" />
      <View style={{ width: 22, height: 1, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.10)" }} />
      <Item n={2} label="Audio" />
      <View style={{ width: 22, height: 1, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.10)" }} />
      <Item n={3} label="Fusion" />
    </View>
  );
}

export default function FaceSelectScreen() {
  const params = useLocalSearchParams<{
    image_url?: string;
    face_profile_id?: string;
    media_asset_id?: string;
  }>();

  const imageUrl = params.image_url;
  const faceProfileId = params.face_profile_id;
  const mediaAssetId = params.media_asset_id;

  return (
    <View style={{ flex: 1, backgroundColor: DF.night }}>
      <DFHeader subtitle="Face Studio • Select" />

      <Stepper step={1} />

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 16 }}>
            Choose this face?
          </Text>
          <Text style={{ color: DF.muted, marginTop: 6, fontWeight: "700" }}>
            Next you’ll generate voice (Audio Studio), then create the talking video (Fusion).
          </Text>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 14 }}>
          <View
            style={{
              borderRadius: 18,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: DF.border,
              backgroundColor: DF.card,
            }}
          >
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{ width: "100%", height: 360, backgroundColor: DF.night2 }}
                contentFit="cover"
                transition={180}
              />
            ) : (
              <View style={{ height: 260, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: DF.text, fontWeight: "900" }}>No image_url provided</Text>
              </View>
            )}

            <View style={{ padding: 12 }}>
              {!!faceProfileId && (
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                  Face Profile: {faceProfileId}
                </Text>
              )}
              {!!mediaAssetId && (
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12, marginTop: 6 }}>
                  Media Asset: {mediaAssetId}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 14, flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => imageUrl && shareUrl(imageUrl)}
            style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: DF.border,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>Share</Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/audio",
                params: {
                  image_url: imageUrl ?? "",
                  face_profile_id: faceProfileId ?? "",
                  media_asset_id: mediaAssetId ?? "",
                },
              })
            }
            style={{
              flex: 1.2,
              borderRadius: 14,
              paddingVertical: 12,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.35)",
              backgroundColor: "rgba(232,152,56,0.22)",
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>Continue to Audio</Text>
          </Pressable>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ paddingVertical: 10, alignItems: "center" }}
          >
            <Text style={{ color: DF.muted, fontWeight: "800" }}>Pick a different face</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}