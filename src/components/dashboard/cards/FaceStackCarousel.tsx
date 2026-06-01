import React, { useMemo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { CardStackCarousel } from "../../../features/dashboard/carousels/CardStackCarousel";

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function resolveImageUrl(item: Record<string, any>): string | null {
  return firstString(
    item.image_url,
    item.imageUrl,
    item.thumbnail_url,
    item.thumbnailUrl,
    item.preview_url,
    item.previewUrl,
    item.signed_url,
    item.signedUrl,
    item.output_url,
    item.outputUrl,
    item.url,
    item.asset_url,
    item.assetUrl
  );
}

function FaceArtifactCard({ item }: { item: Record<string, any> }) {
  const imageUrl = resolveImageUrl(item);
  const title =
    firstString(item.title, item.name, item.display_name, item.profile_name, item.use_case, item.prompt) ||
    "Face artifact";
  const subtitle = firstString(item.subtitle, item.status, item.region, item.locale, item.created_at) || "DesiFaces";

  return (
    <View style={styles.card}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" /> : <View style={styles.emptyImage} />}
      <View pointerEvents="none" style={styles.scrim} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.subtitle}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

export default function FaceStackCarousel({
  items,
  height = 320,
}: {
  items: Array<Record<string, any>>;
  height?: number;
}) {
  const safeItems = useMemo(() => (Array.isArray(items) ? items.filter(Boolean) : []), [items]);

  return (
    <CardStackCarousel
      data={safeItems}
      height={height}
      renderCard={(item: Record<string, any>) => (
        <View style={styles.slot}>
          <FaceArtifactCard item={item} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
  },
  card: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#180808",
    borderWidth: 1,
    borderColor: "rgba(248,184,72,0.18)",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  emptyImage: {
    flex: 1,
    backgroundColor: "rgba(248,184,72,0.10)",
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 104,
    backgroundColor: "rgba(0,0,0,0.46)",
  },
  copy: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
  },
  title: {
    color: "#FFF7D6",
    fontSize: 15,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 4,
    color: "rgba(255,247,214,0.76)",
    fontSize: 12,
    fontWeight: "700",
  },
});
