import React from "react";
import { useLocalSearchParams } from "expo-router";

import MultiPersonFaceCohortScreen from "../../../../features/face/MultiPersonFaceCohortScreen";

export default function StoryFaceRoute() {
  const params = useLocalSearchParams<{ storyId?: string | string[] }>();
  const raw = params.storyId;
  const storyId = Array.isArray(raw) ? raw[0] : raw;

  return <MultiPersonFaceCohortScreen storyId={String(storyId || "")} />;
}
