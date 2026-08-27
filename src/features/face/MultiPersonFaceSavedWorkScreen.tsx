import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "../../core/auth/AuthContext";
import { DASH_BASE } from "../../core/config/env";
import {
  CompactButton,
  STUDIO,
  StatusPill,
  Surface,
  useStudioViewport,
} from "../../core/studio/DenseStudioUI";
import { userFacingStudioError } from "../../core/studio/productionExperience";
import MultiPersonFaceCohortDenseScreen from "./MultiPersonFaceCohortDenseScreen";
import {
  ensureStoryStudioWorkflow,
  faceStages,
  getStoryWorkspace,
  reuseSavedFace,
  type StoryWorkspaceView,
  type StudioWorkflowView,
} from "./api/multiPersonFace";

type Props = { storyId: string };

type SavedFaceItem = {
  library_id?: string;
  title?: string;
  studio?: string;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  download_url?: string | null;
  media_asset_id?: string | null;
  reuse_payload?: Record<string, any> | null;
  metadata_json?: Record<string, any> | null;
  [key: string]: any;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function mediaId(item: SavedFaceItem) {
  return clean(
    item?.reuse_payload?.face_media_asset_id ||
      item?.reuse_payload?.media_asset_id ||
      item?.media_asset_id ||
      item?.metadata_json?.face_media_asset_id ||
      item?.metadata_json?.media_asset_id ||
      item?.metadata_json?.artifact_meta?.face_media_asset_id ||
      item?.metadata_json?.artifact_meta?.media_asset_id ||
      item?.metadata_json?.reuse_payload?.face_media_asset_id ||
      item?.metadata_json?.reuse_payload?.media_asset_id ||
      item?.meta?.face_media_asset_id ||
      item?.meta?.media_asset_id ||
      item?.face_media_asset_id ||
      item?.variants?.[0]?.face_media_asset_id ||
      item?.variants?.[0]?.media_asset_id ||
      item?.variants?.[0]?.metadata_json?.face_media_asset_id ||
      item?.variants?.[0]?.metadata_json?.media_asset_id ||
      item?.variants?.[0]?.meta?.face_media_asset_id ||
      item?.variants?.[0]?.meta?.media_asset_id
  );
}

function imageUrl(item: SavedFaceItem) {
  return clean(
    item?.thumbnail_url ||
      item?.poster_url ||
      item?.preview_image_url ||
      item?.image_url ||
      item?.preview_url ||
      item?.download_url ||
      item?.reuse_payload?.thumbnail_url ||
      item?.reuse_payload?.poster_url ||
      item?.reuse_payload?.preview_image_url ||
      item?.reuse_payload?.image_url ||
      item?.metadata_json?.thumbnail_url ||
      item?.metadata_json?.poster_url ||
      item?.metadata_json?.preview_image_url ||
      item?.metadata_json?.image_url ||
      item?.metadata_json?.artifact_meta?.thumbnail_url ||
      item?.metadata_json?.artifact_meta?.poster_url ||
      item?.metadata_json?.artifact_meta?.image_url ||
      item?.meta?.thumbnail_url ||
      item?.meta?.poster_url ||
      item?.meta?.image_url ||
      item?.variants?.[0]?.thumbnail_url ||
      item?.variants?.[0]?.preview_url ||
      item?.variants?.[0]?.image_url
  );
}

export default function MultiPersonFaceSavedWorkScreen({ storyId }: Props) {
  const viewport = useStudioViewport();
  const { token } = useAuth();
  const [workspace, setWorkspace] = useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [pickerParticipantId, setPickerParticipantId] = useState<string | null>(null);
  const [savedFaces, setSavedFaces] = useState<SavedFaceItem[]>([]);
  const [reusedFaceUrls, setReusedFaceUrls] = useState<Record<string, string>>({});
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [reuseBusy, setReuseBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [childKey, setChildKey] = useState(0);

  const loadContext = useCallback(async () => {
    try {
      const [nextWorkspace, nextWorkflow] = await Promise.all([
        getStoryWorkspace(storyId),
        ensureStoryStudioWorkflow(storyId),
      ]);
      setWorkspace(nextWorkspace);
      setWorkflow(nextWorkflow);
    } catch (reason) {
      setMessage(userFacingStudioError(reason));
    }
  }, [storyId]);

  useEffect(() => { void loadContext(); }, [loadContext]);

  const stageByParticipant = useMemo(
    () => new Map(faceStages(workflow).map((stage) => [clean(stage.participant_id), stage])),
    [workflow]
  );

  const loadSavedFaces = useCallback(async () => {
    if (!token || libraryLoading) return;
    setLibraryLoading(true);
    setMessage("");
    try {
      const base = DASH_BASE.replace(/\/+$/, "");
      const response = await fetch(`${base}/api/dashboard/library?type=face&limit=60&offset=0`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await response.text();
      let payload: any = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
      if (!response.ok) throw new Error(payload?.detail || payload?.message || `Saved Work failed (${response.status})`);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setSavedFaces(
        items.filter((item: SavedFaceItem) => clean(item?.studio).toLowerCase() === "face" && mediaId(item))
      );
    } catch (reason) {
      setMessage(userFacingStudioError(reason));
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryLoading, token]);

  const openSavedFaces = useCallback((participantId: string) => {
    setPickerParticipantId(participantId);
    void loadSavedFaces();
  }, [loadSavedFaces]);

  const applySavedFace = useCallback(async (item: SavedFaceItem) => {
    if (!workflow || !pickerParticipantId) return;
    const participantId = pickerParticipantId;
    const selectedMediaId = mediaId(item);
    const selectedImageUrl = imageUrl(item);
    if (!selectedMediaId) return;
    setReuseBusy(true);
    setMessage("");
    try {
      const result = await reuseSavedFace(workflow.workflow_id, participantId, selectedMediaId);
      setWorkflow(result.workflow);
      setWorkspace(await getStoryWorkspace(storyId));
      if (selectedImageUrl) {
        setReusedFaceUrls((current) => ({ ...current, [participantId]: selectedImageUrl }));
      }
      setPickerParticipantId(null);
      setChildKey((value) => value + 1);
    } catch (reason) {
      setMessage(userFacingStudioError(reason));
    } finally {
      setReuseBusy(false);
    }
  }, [pickerParticipantId, storyId, workflow]);

  const pickerParticipant = (workspace?.participants ?? []).find(
    (participant) => participant.participant_id === pickerParticipantId
  );

  return (
    <View style={styles.safe}>
      {workflow?.current_stage === "face" && (workspace?.participants?.length ?? 0) > 0 ? (
        <View style={[styles.reuseWrap, { maxWidth: viewport.contentMaxWidth, paddingHorizontal: viewport.horizontalPadding }]}>
          <Surface style={styles.reuseBar} accent>
            <View style={styles.reuseIntro}>
              <Text style={styles.reuseTitle}>Saved Work</Text>
              <Text style={styles.reuseMeta}>
                Reuse a Face you already own. It is immediate, keeps identity continuity and adds no new Face-generation charge.
              </Text>
            </View>
            <View style={styles.participantActions}>
              {(workspace?.participants ?? []).map((participant) => {
                const stage = stageByParticipant.get(participant.participant_id);
                const locked = stage?.state === "approved";
                const generating = stage?.state === "generating";
                return (
                  <View key={participant.participant_id} style={styles.participantAction}>
                    <Text style={styles.participantName} numberOfLines={2}>
                      {participant.display_name || "Character"}
                    </Text>
                    {locked ? (
                      <StatusPill value="Locked" tone="success" />
                    ) : generating ? (
                      <StatusPill value="Creating" tone="accent" />
                    ) : (
                      <CompactButton label="Use saved Face" onPress={() => openSavedFaces(participant.participant_id)} />
                    )}
                  </View>
                );
              })}
            </View>
          </Surface>
          {message ? <Text style={styles.messageText}>{message}</Text> : null}
        </View>
      ) : null}

      <View style={styles.studioBody}>
        <MultiPersonFaceCohortDenseScreen
          key={childKey}
          storyId={storyId}
          onUseSavedFace={openSavedFaces}
          reusedFaceUrls={reusedFaceUrls}
        />
      </View>

      <Modal visible={Boolean(pickerParticipantId)} transparent animationType="fade" onRequestClose={() => setPickerParticipantId(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.modalTitle}>
                  Saved Faces{pickerParticipant?.display_name ? ` • ${pickerParticipant.display_name}` : ""}
                </Text>
                <Text style={styles.modalMeta}>Choose an identity to lock into this character. No new Face generation or charge.</Text>
              </View>
              <Pressable onPress={() => setPickerParticipantId(null)} hitSlop={8}>
                <Text style={styles.modalClose}>×</Text>
              </Pressable>
            </View>

            {libraryLoading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={STUDIO.accent} />
                <Text style={styles.loadingText}>Loading Saved Work…</Text>
              </View>
            ) : (
              <FlatList
                data={savedFaces}
                numColumns={2}
                keyExtractor={(item, index) => mediaId(item) || clean(item.library_id) || String(index)}
                columnWrapperStyle={styles.faceRow}
                contentContainerStyle={styles.faceList}
                ListEmptyComponent={
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>No reusable Faces yet</Text>
                    <Text style={styles.emptyMeta}>You can create a new Face from the character card. It will be added to your Saved Work after approval.</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const uri = imageUrl(item);
                  return (
                    <Pressable
                      disabled={reuseBusy}
                      onPress={() => void applySavedFace(item)}
                      style={({ pressed }) => [styles.faceCard, pressed && !reuseBusy && styles.pressed, reuseBusy && styles.disabled]}
                    >
                      <View style={styles.faceImageWrap}>
                        {uri ? <Image source={{ uri }} style={styles.faceImage} resizeMode="cover" /> : <View style={styles.facePlaceholder}><Text style={styles.facePlaceholderText}>Face</Text></View>}
                      </View>
                      <Text style={styles.faceTitle} numberOfLines={2}>{clean(item.title) || "Saved Face"}</Text>
                      <Text style={styles.faceAction}>Use this Face • no new generation</Text>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0, backgroundColor: STUDIO.bg },
  reuseWrap: { width: "100%", alignSelf: "center", paddingTop: 8 },
  reuseBar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, padding: 10 },
  reuseIntro: { flex: 1, minWidth: 170 },
  reuseTitle: { color: STUDIO.text, fontSize: 13, lineHeight: 18, fontWeight: "900" },
  reuseMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 2 },
  participantActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  participantAction: { minWidth: 118, gap: 5, alignItems: "stretch" },
  participantName: { maxWidth: 180, color: STUDIO.accentText, fontSize: 12, lineHeight: 16, fontWeight: "900" },
  messageText: { color: "#FFC0C6", fontSize: 11, lineHeight: 16, fontWeight: "700", paddingHorizontal: 4, paddingTop: 4 },
  studioBody: { flex: 1, minHeight: 0 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.76)", justifyContent: "center", padding: 16 },
  modalCard: { width: "100%", maxWidth: 620, maxHeight: "84%", alignSelf: "center", borderRadius: 18, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.raised, padding: 12 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  modalTitle: { color: STUDIO.text, fontSize: 15, fontWeight: "900" },
  modalMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, fontWeight: "700", marginTop: 3 },
  modalClose: { color: STUDIO.muted, fontSize: 24, lineHeight: 28 },
  loadingBox: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 8 },
  loadingText: { color: STUDIO.muted, fontSize: 12, lineHeight: 16, fontWeight: "700" },
  faceList: { paddingBottom: 8 },
  faceRow: { gap: 9 },
  faceCard: { flex: 1, minWidth: 0, marginBottom: 9, borderRadius: 13, borderWidth: 1, borderColor: STUDIO.border, backgroundColor: STUDIO.surface, padding: 8 },
  faceImageWrap: { width: "100%", aspectRatio: 1, borderRadius: 10, overflow: "hidden", backgroundColor: STUDIO.surfaceSoft },
  faceImage: { width: "100%", height: "100%" },
  facePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  facePlaceholderText: { color: STUDIO.faint, fontSize: 12, fontWeight: "900" },
  faceTitle: { color: STUDIO.text, fontSize: 12, lineHeight: 16, fontWeight: "900", marginTop: 7 },
  faceAction: { color: STUDIO.accentText, fontSize: 10, lineHeight: 14, fontWeight: "700", marginTop: 2 },
  emptyBox: { padding: 28, alignItems: "center", gap: 5 },
  emptyTitle: { color: STUDIO.text, fontSize: 12, fontWeight: "900" },
  emptyMeta: { color: STUDIO.muted, fontSize: 11, lineHeight: 16, textAlign: "center" },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.45 },
});