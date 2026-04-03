import React from "react";
import { View } from "react-native";
import { CardStackCarousel } from "../carousels/CardStackCarousel"; // <-- adjust path
import FaceCard from "./FaceCard";

export default function FaceStackCarousel({
  items,
  height = 320,
}: {
  items: any[];
  height?: number;
}) {
  return (
    <CardStackCarousel
      data={items}
      height={height}
      renderCard={(item) => (
        // keep card in the same slot; no extra margins needed
        <View style={{ flex: 1 }}>
          <FaceCard item={item} />
        </View>
      )}
    />
  );
}