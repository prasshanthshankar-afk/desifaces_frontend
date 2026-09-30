export type SavedWorkCategory =
  | "all"
  | "face"
  | "audio"
  | "video"
  | "group-photos"
  | "group-audio"
  | "group-videos"
  | "multi-person-faces"
  | "multi-person-audio"
  | "multi-person-videos"
  | "group-photo-conversation"
  | "multi-person-conversation";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function reuse(item: any) {
  return item?.reuse_payload && typeof item.reuse_payload === "object"
    ? item.reuse_payload
    : {};
}

export function savedWorkCategory(item: any): SavedWorkCategory {
  const r = reuse(item);
  const assetClass = lower(item?.asset_class || r?.asset_class);
  const workflowKind = lower(
    item?.workflow_kind ||
      item?.conversation_kind ||
      r?.workflow_kind ||
      r?.conversation_kind
  );
  const studio = lower(item?.studio || item?.asset_type || item?.type || item?.kind);
  const assetRole = lower(item?.asset_role || r?.asset_role);

  if (assetClass === "group_photo") return "group-photos";
  if (assetClass === "group_audio") return "group-audio";
  if (assetClass === "group_video") return "group-videos";
  if (assetClass === "multi_person_face") return "multi-person-faces";
  if (assetClass === "multi_person_audio") return "multi-person-audio";
  if (assetClass === "multi_person_video") return "multi-person-videos";

  const workflowLevel =
    ["story", "workflow", "conversation"].includes(studio) ||
    ["story", "workflow", "conversation", "final_story"].includes(assetRole);

  if (workflowLevel && workflowKind === "group_photo_conversation") {
    return "group-photo-conversation";
  }
  if (workflowLevel && workflowKind === "multi_person_conversation") {
    return "multi-person-conversation";
  }

  if (studio.includes("audio") || studio.includes("voice")) return "audio";
  if (studio.includes("video") || studio.includes("fusion")) return "video";
  return "face";
}

export function baseLibraryType(category: SavedWorkCategory) {
  if (category === "face") return "face";
  if (category === "audio") return "audio";
  if (category === "video") return "video";
  return "all";
}

export function itemMatchesSavedWorkCategory(
  item: any,
  category: SavedWorkCategory
) {
  if (category === "all") return true;
  return savedWorkCategory(item) === category;
}

export function canReuseAsStandaloneFace(item: any) {
  return savedWorkCategory(item) === "face";
}

export const SAVED_WORK_FILTERS: Array<{
  key: SavedWorkCategory;
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "face", label: "Faces" },
  { key: "audio", label: "Audio" },
  { key: "video", label: "Videos" },
  { key: "group-photos", label: "Group Photos" },
  { key: "group-audio", label: "Group Audio" },
  { key: "group-videos", label: "Group Videos" },
  { key: "multi-person-faces", label: "Multi-Person Faces" },
  { key: "multi-person-audio", label: "Multi-Person Audio" },
  { key: "multi-person-videos", label: "Multi-Person Videos" },
  { key: "group-photo-conversation", label: "Group Photo Conversation" },
  { key: "multi-person-conversation", label: "Multi-Person Conversation" },
];
