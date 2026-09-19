import { Image } from "expo-image";
import React from "react";

const PIKU_AVATAR = require("../../../assets/piku-avatar.jpg");

export function PikuMark({ size = 52 }: { size?: number }) {
  return (
    <Image
      source={PIKU_AVATAR}
      accessibilityLabel="Piku"
      contentFit="cover"
      transition={0}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
      }}
    />
  );
}
