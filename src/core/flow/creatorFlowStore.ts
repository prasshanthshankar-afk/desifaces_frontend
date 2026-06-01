import { useMemo, useSyncExternalStore } from "react";

export type FaceSelection = {
  artifactId?: string;
  mediaAssetId?: string;
  faceProfileId?: string;
  sasUrl?: string;
  imageUrl?: string;
  gender?: string;
  variantIndex?: number;
  createdAtMs: number;
};

export type AudioSelection = {
  artifactId?: string;
  mediaAssetId?: string;
  sasUrl?: string;
  audioUrl?: string;

  locale?: string;
  voice?: string;
  scriptText?: string;

  durationSec?: number;
  durationMs?: number;

  variantIndex?: number;
  createdAtMs: number;
};

export type VideoSelection = {
  artifactId?: string;
  mediaAssetId?: string;
  sasUrl?: string;

  provider?: string;
  createdAtMs: number;
};

export type CreatorFlowState = {
  ownerKey?: string;
  face?: FaceSelection;
  audio?: AudioSelection;
  video?: VideoSelection;

  faceGender?: string;
  fusionPrompt?: string;
  fusionVideoPrompt?: string;
  videoPrompt?: string;
  fusionProvider?: string;
  fusionAspectRatio?: "9:16" | "16:9" | "1:1";
  fusionMode?: "talking_video" | "cinematic_video_direction";
  fusionVideoMode?: "TALKING_VIDEO" | "CINEMATIC_VIDEO_DIRECTION";
  fusionCameraAngle?: string;
  fusionCameraFraming?: string;
  fusionCameraMotionStyle?: string;
  fusionBackgroundMode?: string;
  fusionIntent?: string;
  fusionVideoType?: string;
  fusionProfile?: string;
  fusionFaceArtifactId?: string;
  hedraModelName?: string;
};

type Listener = () => void;

let state: CreatorFlowState = {};
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function setState(next: CreatorFlowState) {
  state = next;
  emit();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

function asOptionalPositiveNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function cleanText(value: unknown): string | undefined {
  const s = String(value ?? "").trim();
  return s || undefined;
}

function normalizeOwnerKey(value: unknown): string | undefined {
  const s = String(value ?? "").trim().toLowerCase();
  return s || undefined;
}

// ---- Actions ----
function setFaceSelection(face: Omit<FaceSelection, "createdAtMs"> & Partial<Pick<FaceSelection, "createdAtMs">>) {
  const createdAtMs = face.createdAtMs ?? Date.now();
  const normalized: FaceSelection = {
    ...face,
    sasUrl: cleanText(face.sasUrl ?? face.imageUrl),
    imageUrl: cleanText(face.imageUrl ?? face.sasUrl),
    artifactId: cleanText(face.artifactId),
    mediaAssetId: cleanText(face.mediaAssetId),
    faceProfileId: cleanText(face.faceProfileId),
    gender: cleanText(face.gender),
    variantIndex: typeof face.variantIndex === "number" ? face.variantIndex : undefined,
    createdAtMs,
  };
  setState({
    ...state,
    ownerKey: state.ownerKey,
    face: normalized,
    faceGender: normalized.gender ?? state.faceGender,
    audio: undefined,
    video: undefined,
  });
}

function setAudioSelection(audio: Omit<AudioSelection, "createdAtMs"> & Partial<Pick<AudioSelection, "createdAtMs">>) {
  const createdAtMs = audio.createdAtMs ?? Date.now();
  setState({
    ...state,
    ownerKey: state.ownerKey,
    audio: {
      ...audio,
      sasUrl: cleanText(audio.sasUrl ?? audio.audioUrl),
      audioUrl: cleanText(audio.audioUrl ?? audio.sasUrl),
      artifactId: cleanText(audio.artifactId),
      mediaAssetId: cleanText(audio.mediaAssetId),
      locale: cleanText(audio.locale),
      voice: cleanText(audio.voice),
      scriptText: cleanText(audio.scriptText),
      durationSec: asOptionalPositiveNumber(audio.durationSec),
      durationMs: asOptionalPositiveNumber(audio.durationMs),
      variantIndex: typeof audio.variantIndex === "number" ? audio.variantIndex : undefined,
      createdAtMs,
    },
    video: undefined,
  });
}

function setVideoSelection(video: Omit<VideoSelection, "createdAtMs"> & Partial<Pick<VideoSelection, "createdAtMs">>) {
  const createdAtMs = video.createdAtMs ?? Date.now();
  setState({
    ...state,
    ownerKey: state.ownerKey,
    video: {
      ...video,
      artifactId: cleanText(video.artifactId),
      mediaAssetId: cleanText(video.mediaAssetId),
      sasUrl: cleanText(video.sasUrl),
      provider: cleanText(video.provider),
      createdAtMs,
    },
  });
}

function setFusionPrompt(prompt: string) {
  const next = String(prompt ?? "").trim();
  setState({
    ...state,
    ownerKey: state.ownerKey,
    fusionPrompt: next,
    fusionVideoPrompt: next,
    videoPrompt: next,
  });
}

function setFusionVideoPrompt(prompt: string) {
  setFusionPrompt(prompt);
}

function setVideoPrompt(prompt: string) {
  setFusionPrompt(prompt);
}

function setFusionSettings(settings: Partial<CreatorFlowState>) {
  setState({
    ...state,
    ownerKey: state.ownerKey,
    ...settings,
  });
}

export function resetCreatorFlow(nextOwnerKey?: string) {
  const ownerKey = normalizeOwnerKey(nextOwnerKey);
  setState(ownerKey ? { ownerKey } : {});
}

export function setCreatorFlowOwner(ownerKey?: string) {
  const normalizedOwnerKey = normalizeOwnerKey(ownerKey);
  if (!normalizedOwnerKey) {
    resetCreatorFlow();
    return;
  }

  const currentOwnerKey = normalizeOwnerKey(state.ownerKey);
  if (currentOwnerKey && currentOwnerKey !== normalizedOwnerKey) {
    resetCreatorFlow(normalizedOwnerKey);
    return;
  }

  if (currentOwnerKey === normalizedOwnerKey) return;
  setState({
    ...state,
    ownerKey: normalizedOwnerKey,
  });
}

// ---- Helpers for screens to accept legacy route params (optional) ----
export function hydrateFaceFromParams(params: Record<string, unknown>) {
  const sasUrl =
    (params["face_sas_url"] as string) ||
    (params["FACE_SAS_URL"] as string) ||
    (params["image_url"] as string) ||
    (params["face_url"] as string) ||
    (params["url"] as string) ||
    (params["sasUrl"] as string) ||
    (params["sas_url"] as string) ||
    (params["preview_url"] as string) ||
    undefined;

  const artifactId =
    (params["face_artifact_id"] as string) ||
    (params["image_artifact_id"] as string) ||
    (params["artifact_id"] as string) ||
    (params["artifactId"] as string) ||
    undefined;

  const mediaAssetId =
    (params["face_media_asset_id"] as string) ||
    (params["image_media_asset_id"] as string) ||
    (params["media_asset_id"] as string) ||
    (params["mediaAssetId"] as string) ||
    undefined;

  const faceProfileId =
    (params["face_profile_id"] as string) ||
    (params["image_face_profile_id"] as string) ||
    (params["faceProfileId"] as string) ||
    undefined;

  const gender =
    (params["gender"] as string) ||
    (params["face_gender"] as string) ||
    undefined;

  if (sasUrl || artifactId || mediaAssetId || faceProfileId) {
    setFaceSelection({ sasUrl, imageUrl: sasUrl, artifactId, mediaAssetId, faceProfileId, gender });
  }

  const aspectRatio =
    (params["aspect_ratio"] as string) ||
    (params["resolution"] as string) ||
    undefined;

  if (aspectRatio) {
    setFusionSettings({ fusionAspectRatio: aspectRatio as "9:16" | "16:9" | "1:1" });
  }
}

export function hydrateAudioFromParams(params: Record<string, unknown>) {
  const sasUrl =
    (params["audio_sas_url"] as string) ||
    (params["AUDIO_SAS_URL"] as string) ||
    (params["audio_url"] as string) ||
    undefined;

  const artifactId = (params["audio_artifact_id"] as string) || undefined;
  const mediaAssetId = (params["audio_media_asset_id"] as string) || undefined;
  const locale =
    (params["audio_locale"] as string) ||
    (params["locale"] as string) ||
    undefined;
  const voice =
    (params["audio_voice"] as string) ||
    (params["voice"] as string) ||
    undefined;
  const scriptText =
    (params["script_text"] as string) ||
    (params["audio_script_text"] as string) ||
    undefined;

  const durationMs =
    asOptionalPositiveNumber(params["audio_duration_ms"]) ||
    asOptionalPositiveNumber(params["duration_ms"]) ||
    undefined;

  const durationSec =
    asOptionalPositiveNumber(params["audio_duration_sec"]) ||
    asOptionalPositiveNumber(params["duration_sec"]) ||
    (durationMs ? durationMs / 1000 : undefined);

  if (sasUrl || artifactId || mediaAssetId) {
    setAudioSelection({ sasUrl, audioUrl: sasUrl, artifactId, mediaAssetId, locale, voice, scriptText, durationSec, durationMs });
  }
}

// ---- Public hook ----
export function useCreatorFlow() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const actions = useMemo(
    () => ({
      setFaceSelection,
      setAudioSelection,
      setVideoSelection,
      setFusionPrompt,
      setFusionVideoPrompt,
      setVideoPrompt,
      setFusionSettings,
      resetCreatorFlow,
      setCreatorFlowOwner,
      hydrateFaceFromParams,
      hydrateAudioFromParams,
    }),
    []
  );

  return {
    ...snapshot,
    faceSelection: snapshot.face,
    audioSelection: snapshot.audio,
    videoSelection: snapshot.video,
    ...actions,
  };
}
