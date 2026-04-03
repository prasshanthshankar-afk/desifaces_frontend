import React, { useMemo } from "react";
import { View, Text, Pressable, StyleProp, ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { DF } from "../../../core/theme/colors";
import { shareUrl } from "../../../core/share/share";

function pickFaceUrl(item: any): string | undefined {
  return (
    item?.image_url ||
    item?.url ||
    item?.asset_url ||
    item?.signed_url ||
    item?.meta?.image_url ||
    item?.meta?.url ||
    item?.meta?.signed_url ||
    item?.meta?.output_url ||
    item?.output_url ||
    item?.result_url ||
    item?.variants?.[0]?.image_url ||
    item?.variants?.[0]?.url
  );
}

type FaceCardMode = "full" | "deck";

export default function FaceCard({
  item,
  mode = "full",
  mediaHeight = 240,
  deckHeight = 230,
  containerStyle,
  disableActions = false,
  hosted = false,
  fillParent = false,
  disablePress = false,
  onPress,
}: {
  item: any;
  mode?: FaceCardMode;
  mediaHeight?: number;
  deckHeight?: number;
  containerStyle?: StyleProp<ViewStyle>;
  disableActions?: boolean;
  hosted?: boolean;
  fillParent?: boolean;
  disablePress?: boolean;
  onPress?: () => void;
}) {
  const img = useMemo(() => pickFaceUrl(item), [item]);
  const title = `Face • v${item?.meta?.variant_number ?? 1}`;
  const ts = item?.created_at ? new Date(item.created_at).toLocaleString() : "—";
  const storagePath = item?.meta?.storage_path ?? item?.storage_path ?? "";

  const openInApp = () => {
    if (!img) return;
    router.push({
      pathname: "/media/viewer",
      params: { type: "image", url: img, title, subtitle: ts, stage: "face_done" },
    });
  };

  const handlePress = () => {
    if (!img) return;
    if (onPress) return onPress();
    return openInApp();
  };

  const needsSignedUrl = !img;

  const DeckInner = (
    <View style={{ flex: 1, backgroundColor: DF.night2 }}>
      <LinearGradient
        colors={["rgba(248,184,72,0.12)", "rgba(232,152,56,0.06)", "rgba(0,0,0,0.00)"]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />

      <View style={{ flex: 1, padding: 10 }}>
        <View
          style={{
            flex: 1,
            borderRadius: 16,
            overflow: "hidden",
            backgroundColor: DF.night2,
          }}
        >
          {img ? (
            <Image
              source={{ uri: img }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              contentPosition="top"
              transition={180}
              cachePolicy="disk"
            />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 14 }}>
              <Text style={{ color: DF.textStrong ?? DF.text, fontWeight: "900", fontSize: 13 }}>
                Image URL not present
              </Text>
              <Text
                style={{
                  color: DF.muted,
                  marginTop: 6,
                  textAlign: "center",
                  fontWeight: "700",
                  fontSize: 11,
                }}
                numberOfLines={2}
              >
                Backend returned storage_path but not a signed image_url yet.
              </Text>
            </View>
          )}
        </View>
      </View>

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          top: 10,
          bottom: 10,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.07)",
        }}
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 64,
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
      />

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: 10,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900" }} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={{
            color: "rgba(255,255,255,0.75)",
            marginTop: 2,
            fontWeight: "700",
            fontSize: 11,
          }}
          numberOfLines={1}
        >
          {ts}
        </Text>
      </View>

      {needsSignedUrl ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: DF.border,
            backgroundColor: "rgba(255,180,90,0.10)",
          }}
        >
          <Text style={{ color: DF.textSoft ?? DF.muted, fontWeight: "900", fontSize: 11 }}>
            NEEDS SIGNED URL
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (mode === "deck") {
    const outer: ViewStyle = {
      width: "100%",
      borderRadius: 18,
      overflow: "hidden",
      backgroundColor: DF.card,
      ...(hosted ? { borderWidth: 0 } : { borderWidth: 1, borderColor: DF.border }),
      ...(fillParent ? { flex: 1 } : { height: deckHeight }),
    };

    return (
      <View style={[outer, containerStyle]}>
        {disablePress ? (
          <View style={{ flex: 1 }}>{DeckInner}</View>
        ) : (
          <Pressable
            onPress={handlePress}
            disabled={!img}
            unstable_pressDelay={60}
            style={{ flex: 1, opacity: img ? 1 : 0.95 }}
          >
            {DeckInner}
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: 18,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: DF.border,
          backgroundColor: DF.card,
        },
        containerStyle,
      ]}
    >
      {disablePress ? (
        <View style={{ height: mediaHeight, backgroundColor: DF.night2 }}>
          <LinearGradient
            colors={["rgba(248,184,72,0.10)", "rgba(232,152,56,0.06)", "rgba(0,0,0,0.00)"]}
            style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          />
          <View
            style={{
              flex: 1,
              borderRadius: 18,
              overflow: "hidden",
            }}
          >
            {img ? (
              <Image
                source={{ uri: img }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                contentPosition="top"
                transition={180}
                cachePolicy="disk"
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
                <Text style={{ color: DF.textStrong ?? DF.text, fontWeight: "900", fontSize: 14 }}>
                  Image URL not present
                </Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <Pressable onPress={handlePress} disabled={!img} style={{ opacity: img ? 1 : 0.95 }}>
          <View style={{ height: mediaHeight, backgroundColor: DF.night2 }}>
            <LinearGradient
              colors={["rgba(248,184,72,0.10)", "rgba(232,152,56,0.06)", "rgba(0,0,0,0.00)"]}
              style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
            />

            <View
              style={{
                flex: 1,
                borderRadius: 18,
                overflow: "hidden",
              }}
            >
              {img ? (
                <Image
                  source={{ uri: img }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  contentPosition="top"
                  transition={180}
                  cachePolicy="disk"
                />
              ) : (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 16 }}>
                  <Text style={{ color: DF.textStrong ?? DF.text, fontWeight: "900", fontSize: 14 }}>
                    Image URL not present
                  </Text>
                  <Text
                    style={{
                      color: DF.muted,
                      marginTop: 6,
                      textAlign: "center",
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                    numberOfLines={2}
                  >
                    Backend returned storage_path but not a signed image_url yet.
                  </Text>
                </View>
              )}
            </View>

            {img ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: 10,
                  right: 10,
                  top: 10,
                  bottom: 10,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.06)",
                }}
              />
            ) : null}
          </View>
        </Pressable>
      )}

      <View style={{ padding: 10 }}>
        <Text style={{ color: DF.text, fontWeight: "900" }} numberOfLines={1}>
          {title}
        </Text>

        <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700" }} numberOfLines={1}>
          {ts}
        </Text>

        {!!storagePath && (
          <Text style={{ color: DF.muted, marginTop: 6, fontSize: 11 }} numberOfLines={1}>
            {storagePath}
          </Text>
        )}

        {!disableActions && (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              onPress={handlePress}
              disabled={!img}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: 999,
                alignItems: "center",
                borderWidth: 1,
                borderColor: DF.border,
                backgroundColor: "rgba(255,255,255,0.04)",
                opacity: img ? 1 : 0.5,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>View</Text>
            </Pressable>

            <Pressable
              onPress={() => img && shareUrl(img)}
              disabled={!img}
              style={{
                flex: 1,
                paddingVertical: 9,
                borderRadius: 999,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "rgba(248,184,72,0.35)",
                backgroundColor: "rgba(232,152,56,0.18)",
                opacity: img ? 1 : 0.5,
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>Share</Text>
            </Pressable>
          </View>
        )}

        {!img && (
          <View
            style={{
              marginTop: 10,
              alignSelf: "flex-start",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: DF.border,
              backgroundColor: "rgba(255,180,90,0.07)",
            }}
          >
            <Text style={{ color: DF.textSoft ?? DF.muted, fontWeight: "900", fontSize: 11 }}>
              NEEDS SIGNED URL
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}