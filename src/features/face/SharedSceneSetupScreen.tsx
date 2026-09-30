import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { extractPricingConfirmation } from "../../core/pricing/pricePreview";
import {
  STUDIO,
  useStudioViewport,
} from "../../core/studio/DenseStudioUI";
import {
  ensureStoryStudioWorkflow,
  getStoryWorkspace,
  getStudioWorkflow,
  type StudioWorkflowView,
} from "../../core/studio/multiPersonWorkflow";
import {
  approveSharedScene,
  approveSharedScenePeople,
  chooseSharedSceneSource,
  generateGroupPhoto,
  generatedGroupPhotoVariants,
  getSharedSceneState,
  persistSharedSceneDraft,
  pollGroupPhotoJob,
  previewGroupPhotoGeneration,
  saveGroupPhotoSpec,
  saveSharedSceneSpeakerProfile,
  uploadValidatedGroupPhoto,
  validateStoredGroupPhoto,
  type SharedSceneDimensions,
  type SharedScenePoint,
  type SharedSceneSpeakerProfile,
  type SharedSceneWorkflowState,
} from "./api/sharedScene";
import { getFaceMediaReadUrl } from "./api/multiPersonFace";

type Props = { storyId: string };
type SpeakerDraft = {
  gender: "" | "female" | "male";
  age: string;
  country: string;
  region: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function errorText(error: any) {
  const detail = error?.body?.detail;
  if (typeof detail === "string") return detail;
  if (typeof detail?.message === "string") return detail.message;
  return clean(error?.message) || "This action could not be completed.";
}

function priceLabel(preview: any) {
  const values = [
    preview?.pricing_summary?.display_total,
    preview?.pricing_summary?.estimated_credits_label,
    preview?.pricing?.summary?.display_total,
    preview?.pricing?.summary?.estimated_credits_label,
    preview?.estimate?.display,
    preview?.estimate_label,
  ];
  return values.map(clean).find(Boolean) || "Price checked";
}

function fusionStage(workflow: StudioWorkflowView | null) {
  return (workflow?.stages || []).find(
    (stage) => stage.stage_type === "fusion" && stage.scope_type === "scene"
  );
}

export default function SharedSceneSetupScreen({ storyId }: Props) {
  const viewport = useStudioViewport();
  const [workflow, setWorkflow] = useState<StudioWorkflowView | null>(null);
  const [state, setState] = useState<SharedSceneWorkflowState | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SpeakerDraft>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [photoUrl, setPhotoUrl] = useState("");
  const [photoMediaId, setPhotoMediaId] = useState("");
  const [dimensions, setDimensions] = useState<SharedSceneDimensions | null>(null);
  const [renderedSize, setRenderedSize] = useState<{ width: number; height: number } | null>(null);
  const [targets, setTargets] = useState<Record<string, SharedScenePoint>>({});
  const [activeSpeakerId, setActiveSpeakerId] = useState("");

  const [photoPrompt, setPhotoPrompt] = useState("");
  const [photoBackground, setPhotoBackground] = useState("");
  const [sceneCountry, setSceneCountry] = useState("");
  const [sceneRegion, setSceneRegion] = useState("");
  const [photoQuote, setPhotoQuote] = useState<any>(null);
  const [generated, setGenerated] = useState<any[]>([]);

  const speakers = state?.people?.speakers || [];
  const stage = fusionStage(workflow);

  const hydrateDrafts = useCallback((items: SharedSceneSpeakerProfile[]) => {
    setDrafts((current) => {
      const next = { ...current };
      for (const item of items) {
        const id = clean(item.participant_id);
        if (!id) continue;
        const prior = next[id] || { gender: "", age: "", country: "", region: "" };
        next[id] = {
          gender: (clean(item.gender_presentation) as "female" | "male" | "") || prior.gender,
          age: clean(item.age_presentation) || prior.age,
          country: clean(item.country_code) || prior.country,
          region: clean(item.region_code) || prior.region,
        };
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!storyId) return;
    setError("");
    try {
      await getStoryWorkspace(storyId);
      const wf = await ensureStoryStudioWorkflow(storyId, "shared_scene");
      const canonical = await getSharedSceneState(wf.workflow_id);
      setWorkflow(wf);
      setState(canonical);
      hydrateDrafts(canonical.people?.speakers || []);

      const mediaId = clean(
        canonical.group_photo?.approved_media_id ||
        canonical.group_photo?.draft_media_id
      );
      if (mediaId && mediaId !== photoMediaId) {
        try {
          const media = await getFaceMediaReadUrl(mediaId);
          const url = clean(media?.read_url);
          if (url) {
            setPhotoMediaId(mediaId);
            setPhotoUrl(url);
          }
        } catch {}
      }
    } catch (reason) {
      setError(errorText(reason));
    }
  }, [hydrateDrafts, photoMediaId, storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setSpeakerDraft = useCallback(
    (participantId: string, patch: Partial<SpeakerDraft>) => {
      setDrafts((current) => ({
        ...current,
        [participantId]: {
          ...(current[participantId] || {
            gender: "",
            age: "",
            country: "",
            region: "",
          }),
          ...patch,
        },
      }));
    },
    []
  );

  const saveSpeaker = useCallback(
    async (speaker: SharedSceneSpeakerProfile) => {
      if (!workflow) return;
      const participantId = clean(speaker.participant_id);
      const draft = drafts[participantId];
      if (!draft?.gender) {
        Alert.alert("Speaker setup", "Choose female or male presentation for voice compatibility.");
        return;
      }
      setBusy(`speaker-${participantId}`);
      setError("");
      try {
        await saveSharedSceneSpeakerProfile(workflow.workflow_id, participantId, {
          gender_presentation: draft.gender,
          age_presentation: clean(draft.age) || null,
          country_code: clean(draft.country).toUpperCase() || null,
          region_code: clean(draft.region) || null,
        });
        setMessage(`${speaker.display_name || "Speaker"} saved.`);
        await load();
      } catch (reason) {
        setError(errorText(reason));
      } finally {
        setBusy("");
      }
    },
    [drafts, load, workflow]
  );

  const approvePeople = useCallback(async () => {
    if (!workflow || !state?.people?.profiles_complete) return;
    setBusy("people");
    setError("");
    try {
      await approveSharedScenePeople(workflow.workflow_id);
      setMessage("People approved. Choose how to prepare the one group photo.");
      await load();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy("");
    }
  }, [load, state?.people?.profiles_complete, workflow]);

  const chooseSource = useCallback(
    async (mode: "generate" | "upload") => {
      if (!workflow) return;
      setBusy(`source-${mode}`);
      setError("");
      try {
        const next = await chooseSharedSceneSource(workflow.workflow_id, mode);
        setState(next);
        setPhotoQuote(null);
        setGenerated([]);
        setMessage(
          mode === "generate"
            ? "Generate path selected. Describe the group photo, then check the live price."
            : "Upload path selected. Choose a group photo containing every speaker."
        );
      } catch (reason) {
        setError(errorText(reason));
      } finally {
        setBusy("");
      }
    },
    [workflow]
  );

  const uploadPhoto = useCallback(async () => {
    if (!workflow || !stage || !state) return;
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access", "Allow photo access to choose the group photo.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    const asset = picked.assets[0];
    setBusy("upload");
    try {
      const result = await uploadValidatedGroupPhoto({
        localUri: asset.uri,
        fileName: asset.fileName || "group-photo.jpg",
        mimeType: asset.mimeType || "image/jpeg",
        expectedSpeakers: state.people.speaker_count,
      });
      setPhotoMediaId(result.media_asset_id);
      setPhotoUrl(result.image_url || asset.uri);
      const nextDimensions =
        Number(asset.width) > 0 && Number(asset.height) > 0
          ? { width: Number(asset.width), height: Number(asset.height) }
          : null;
      setDimensions(nextDimensions);
      setTargets({});
      await persistSharedSceneDraft(workflow.workflow_id, stage.stage_run_id, {
        shared_scene_media_id: result.media_asset_id,
        image_width: nextDimensions?.width || null,
        image_height: nextDimensions?.height || null,
        speaker_targets: [],
      });
      setMessage("Group photo passed safety checks. Select each speaker and tap that person's face.");
      await load();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy("");
    }
  }, [load, stage, state, workflow]);

  const saveSpecAndPrice = useCallback(async () => {
    if (!workflow || !state) return;
    if (!photoPrompt.trim()) {
      Alert.alert("Group photo", "Describe the group photo before checking price.");
      return;
    }
    setBusy("photo-price");
    setError("");
    try {
      const next = await saveGroupPhotoSpec(workflow.workflow_id, {
        scene_country_code: clean(sceneCountry).toUpperCase() || null,
        scene_region_code: clean(sceneRegion) || null,
        context_code: null,
        background: clean(photoBackground) || null,
        prompt: photoPrompt.trim(),
        variant_count: 2,
      });
      setState(next);
      const preview = await previewGroupPhotoGeneration(next);
      const confirmation = extractPricingConfirmation(preview);
      if (!confirmation) throw new Error("Group photo pricing did not return a confirmation.");
      setPhotoQuote({ preview, confirmation });
      setMessage(`Group photo price ready: ${priceLabel(preview)}`);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy("");
    }
  }, [photoBackground, photoPrompt, sceneCountry, sceneRegion, state, workflow]);

  const createPhoto = useCallback(async () => {
    if (!state || !photoQuote?.confirmation) return;
    setBusy("photo-generate");
    setError("");
    try {
      const created = await generateGroupPhoto(state, photoQuote.confirmation);
      const jobId = clean(created?.job_id || created?.id);
      if (!jobId) throw new Error("Group photo generation did not return a job id.");
      const result = await pollGroupPhotoJob(jobId);
      if (clean(result?.status).toLowerCase() !== "succeeded") {
        throw new Error(clean(result?.error_message) || "Group photo generation failed.");
      }
      const variants = generatedGroupPhotoVariants(result);
      if (!variants.length) throw new Error("Group photo generation returned no reusable images.");
      setGenerated(variants);
      setMessage("Choose the group photo you want to use.");
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy("");
    }
  }, [photoQuote?.confirmation, state]);

  const selectGenerated = useCallback(
    async (item: any) => {
      if (!workflow || !stage || !state) return;
      const mediaId = clean(item?.media_asset_id);
      const url = clean(item?.image_url);
      if (!mediaId || !url) return;
      setBusy(`select-${mediaId}`);
      setError("");
      try {
        const validation = await validateStoredGroupPhoto(mediaId, state.people.speaker_count);
        if (!validation?.allow) {
          throw new Error(validation?.summary || "This generated photo did not pass the required checks.");
        }
        setPhotoMediaId(mediaId);
        setPhotoUrl(url);
        setDimensions(null);
        setTargets({});
        await persistSharedSceneDraft(workflow.workflow_id, stage.stage_run_id, {
          shared_scene_media_id: mediaId,
          speaker_targets: [],
        });
        setMessage("Photo selected. Select each speaker and tap that person's face.");
        await load();
      } catch (reason) {
        setError(errorText(reason));
      } finally {
        setBusy("");
      }
    },
    [load, stage, state, workflow]
  );

  const mapSpeaker = useCallback(
    async (event: any) => {
      if (!workflow || !stage || !photoMediaId || !activeSpeakerId) {
        setError("Select a speaker first, then tap that person's face.");
        return;
      }
      const locationX = Number(event?.nativeEvent?.locationX || 0);
      const locationY = Number(event?.nativeEvent?.locationY || 0);
      const renderedWidth = Number(renderedSize?.width || 0);
      const renderedHeight = Number(renderedSize?.height || 0);
      if (!(renderedWidth > 0 && renderedHeight > 0)) {
        setError("The photo dimensions are not ready yet. Tap the photo again.");
        return;
      }

      const point = {
        x: Math.max(0, Math.min(1, locationX / renderedWidth)),
        y: Math.max(0, Math.min(1, locationY / renderedHeight)),
      };
      const next = { ...targets, [activeSpeakerId]: point };
      setTargets(next);
      setActiveSpeakerId("");
      setMessage("Speaker mapping saved locally. Map the remaining speakers.");
      try {
        await persistSharedSceneDraft(workflow.workflow_id, stage.stage_run_id, {
          shared_scene_media_id: photoMediaId,
          image_width: dimensions?.width || null,
          image_height: dimensions?.height || null,
          speaker_targets: Object.entries(next).map(([participant_id, value]) => ({
            participant_id,
            point: value,
          })),
        });
      } catch (reason) {
        setError(errorText(reason));
      }
    },
    [activeSpeakerId, dimensions, photoMediaId, renderedSize, stage, targets, workflow]
  );

  const allMapped = useMemo(
    () => speakers.length > 0 && speakers.every((speaker) => !!targets[clean(speaker.participant_id)]),
    [speakers, targets]
  );

  const approvePhoto = useCallback(async () => {
    if (!workflow || !stage || !state || !photoMediaId || !dimensions || !allMapped) return;
    setBusy("approve-photo");
    setError("");
    try {
      const validation = await validateStoredGroupPhoto(photoMediaId, state.people.speaker_count);
      if (!validation?.allow) throw new Error(validation?.summary || "Group photo validation failed.");

      await approveSharedScene(workflow.workflow_id, stage.stage_run_id, {
        shared_scene_media_id: photoMediaId,
        image_width: dimensions.width,
        image_height: dimensions.height,
        speaker_targets: speakers.map((speaker) => ({
          participant_id: clean(speaker.participant_id),
          point: targets[clean(speaker.participant_id)],
        })),
      });
      const latest = await getStudioWorkflow(workflow.workflow_id);
      setWorkflow(latest);
      setMessage("Group photo approved. Opening conversation voices.");
      router.replace({
        pathname: "/(tabs)/face/story/[storyId]",
        params: { storyId, stage: "audio", experience: "shared_scene" },
      } as any);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy("");
    }
  }, [allMapped, dimensions, photoMediaId, speakers, stage, state, storyId, targets, workflow]);

  if (!state || !workflow) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={STUDIO.accent} />
        <Text style={styles.muted}>Loading Group Photo Setup…</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        {
          maxWidth: viewport.contentMaxWidth,
          paddingHorizontal: viewport.horizontalPadding,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>GROUP PHOTO CONVERSATION</Text>
      <Text style={styles.title}>Prepare one shared photo</Text>
      <Text style={styles.muted}>
        Complete only the current phase. desifaces will not unlock Audio or Video until the people and group photo are explicitly approved.
      </Text>

      {message ? <View style={styles.notice}><Text style={styles.noticeText}>{message}</Text></View> : null}
      {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}

      {state.phase === "people" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Confirm the people</Text>
          {speakers.map((speaker) => {
            const id = clean(speaker.participant_id);
            const draft = drafts[id] || { gender: "", age: "", country: "", region: "" };
            return (
              <View key={id} style={styles.card}>
                <Text style={styles.cardTitle}>{speaker.display_name || "Speaker"}</Text>
                <Text style={styles.label}>Gender presentation</Text>
                <View style={styles.row}>
                  {(["female", "male"] as const).map((gender) => (
                    <Pressable
                      key={gender}
                      onPress={() => setSpeakerDraft(id, { gender })}
                      style={[styles.pill, draft.gender === gender && styles.pillActive]}
                    >
                      <Text style={styles.pillText}>{gender === "female" ? "Female" : "Male"}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={draft.age}
                  onChangeText={(value) => setSpeakerDraft(id, { age: value })}
                  placeholder="Age / age range (optional)"
                  placeholderTextColor={STUDIO.faint}
                  style={styles.input}
                />
                <View style={styles.row}>
                  <TextInput
                    value={draft.country}
                    onChangeText={(value) => setSpeakerDraft(id, { country: value.toUpperCase() })}
                    placeholder="Country code"
                    placeholderTextColor={STUDIO.faint}
                    style={[styles.input, styles.flex]}
                    autoCapitalize="characters"
                  />
                  <TextInput
                    value={draft.region}
                    onChangeText={(value) => setSpeakerDraft(id, { region: value })}
                    placeholder="Region / state"
                    placeholderTextColor={STUDIO.faint}
                    style={[styles.input, styles.flex]}
                  />
                </View>
                <Pressable
                  disabled={busy === `speaker-${id}`}
                  onPress={() => void saveSpeaker(speaker)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.buttonText}>Save person</Text>
                </Pressable>
              </View>
            );
          })}
          <Pressable
            disabled={!state.people.profiles_complete || !!busy}
            onPress={() => void approvePeople()}
            style={[styles.primaryButton, (!state.people.profiles_complete || !!busy) && styles.disabled]}
          >
            <Text style={styles.primaryText}>Approve people & continue</Text>
          </Pressable>
        </View>
      ) : null}

      {state.phase === "group_photo_source" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Prepare the conversation photo</Text>
          <Text style={styles.muted}>Choose one path. Everyone who will speak must appear in the same image.</Text>
          {state.group_photo.generate_supported ? (
            <Pressable onPress={() => void chooseSource("generate")} style={styles.primaryButton}>
              <Text style={styles.primaryText}>Generate a group photo</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => void chooseSource("upload")} style={styles.secondaryButton}>
            <Text style={styles.buttonText}>Upload a group photo</Text>
          </Pressable>
        </View>
      ) : null}

      {state.phase === "group_photo_prepare" && state.group_photo.source_mode === "upload" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload a group photo</Text>
          <Text style={styles.muted}>JPG / PNG · every speaker must be visible · safety and photo-quality checks run before the image can be used.</Text>
          <Pressable disabled={!!busy} onPress={() => void uploadPhoto()} style={styles.primaryButton}>
            <Text style={styles.primaryText}>{busy === "upload" ? "Checking & uploading…" : "Choose group photo"}</Text>
          </Pressable>
        </View>
      ) : null}

      {state.phase === "group_photo_prepare" && state.group_photo.source_mode === "generate" ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Generate a group photo</Text>
          <TextInput
            value={photoPrompt}
            onChangeText={(value) => { setPhotoPrompt(value); setPhotoQuote(null); }}
            multiline
            placeholder="Describe the scene and environment. Speaker identity constraints are added by the backend."
            placeholderTextColor={STUDIO.faint}
            style={[styles.input, styles.multiline]}
          />
          <TextInput
            value={photoBackground}
            onChangeText={(value) => { setPhotoBackground(value); setPhotoQuote(null); }}
            placeholder="Background / environment (optional)"
            placeholderTextColor={STUDIO.faint}
            style={styles.input}
          />
          <View style={styles.row}>
            <TextInput
              value={sceneCountry}
              onChangeText={(value) => { setSceneCountry(value.toUpperCase()); setPhotoQuote(null); }}
              placeholder="Country code"
              placeholderTextColor={STUDIO.faint}
              style={[styles.input, styles.flex]}
              autoCapitalize="characters"
            />
            <TextInput
              value={sceneRegion}
              onChangeText={(value) => { setSceneRegion(value); setPhotoQuote(null); }}
              placeholder="Region / state"
              placeholderTextColor={STUDIO.faint}
              style={[styles.input, styles.flex]}
            />
          </View>
          <Pressable disabled={!!busy} onPress={() => void saveSpecAndPrice()} style={styles.secondaryButton}>
            <Text style={styles.buttonText}>{busy === "photo-price" ? "Checking price…" : "Check live price"}</Text>
          </Pressable>
          {photoQuote ? (
            <View style={styles.priceBox}>
              <Text style={styles.priceText}>{priceLabel(photoQuote.preview)}</Text>
              <Pressable disabled={!!busy} onPress={() => void createPhoto()} style={styles.primaryButton}>
                <Text style={styles.primaryText}>{busy === "photo-generate" ? "Creating…" : "Confirm price & create"}</Text>
              </Pressable>
            </View>
          ) : null}
          {generated.length ? (
            <View style={styles.generatedGrid}>
              {generated.map((item) => (
                <Pressable key={item.media_asset_id} onPress={() => void selectGenerated(item)} style={styles.generatedCard}>
                  <ExpoImage source={{ uri: item.image_url }} style={styles.generatedImage} contentFit="cover" />
                  <Text style={styles.generatedLabel}>Use this group photo</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {["group_photo_map", "group_photo_approve"].includes(state.phase) || photoMediaId ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Identify each person</Text>
          <Text style={styles.muted}>Select a speaker name, then tap that person's face in the photo.</Text>
          <View style={styles.speakerPills}>
            {speakers.map((speaker) => {
              const id = clean(speaker.participant_id);
              const mapped = !!targets[id];
              return (
                <Pressable
                  key={id}
                  onPress={() => setActiveSpeakerId(id)}
                  style={[
                    styles.pill,
                    activeSpeakerId === id && styles.pillActive,
                    mapped && styles.pillMapped,
                  ]}
                >
                  <Text style={styles.pillText}>{mapped ? "✓ " : ""}{speaker.display_name || "Speaker"}</Text>
                </Pressable>
              );
            })}
          </View>
          {photoUrl ? (
            <View
              style={styles.mapFrame}
              onLayout={(event) => {
                const size = event.nativeEvent.layout;
                setRenderedSize({ width: size.width, height: size.height });
              }}
            >
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={(event) => void mapSpeaker(event)}
              >
                <ExpoImage
                  source={{ uri: photoUrl }}
                  style={StyleSheet.absoluteFill}
                  contentFit="contain"
                  onLoad={(event: any) => {
                    const source = event?.source || {};
                    if (Number(source.width) > 0 && Number(source.height) > 0) {
                      setDimensions({ width: Number(source.width), height: Number(source.height) });
                    }
                  }}
                />
              </Pressable>
            </View>
          ) : null}
          <Text style={styles.muted}>{Object.keys(targets).length} of {speakers.length} speakers mapped.</Text>
          <Pressable
            disabled={!allMapped || !dimensions || !!busy}
            onPress={() => void approvePhoto()}
            style={[styles.primaryButton, (!allMapped || !dimensions || !!busy) && styles.disabled]}
          >
            <Text style={styles.primaryText}>{busy === "approve-photo" ? "Approving…" : "Approve group photo & continue to voices"}</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: STUDIO.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 10,
  },
  content: {
    width: "100%",
    alignSelf: "center",
    paddingTop: 12,
    paddingBottom: 48,
  },
  eyebrow: {
    color: STUDIO.accentText,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: STUDIO.text,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
    marginTop: 4,
  },
  muted: {
    color: STUDIO.muted,
    fontSize: 10.5,
    lineHeight: 16,
    marginTop: 5,
  },
  section: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surface,
    padding: 12,
  },
  sectionTitle: {
    color: STUDIO.text,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 5,
  },
  card: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surfaceSoft,
    padding: 10,
    marginTop: 9,
  },
  cardTitle: {
    color: STUDIO.text,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
  },
  label: {
    color: STUDIO.muted,
    fontSize: 9,
    fontWeight: "800",
    marginBottom: 5,
  },
  input: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.bg,
    color: STUDIO.text,
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 7,
  },
  multiline: { minHeight: 104, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  flex: { flex: 1 },
  primaryButton: {
    minHeight: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: STUDIO.accentBorder,
    backgroundColor: STUDIO.accentFill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: 10,
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: 8,
  },
  primaryText: { color: STUDIO.accentText, fontSize: 11, fontWeight: "900" },
  buttonText: { color: STUDIO.text, fontSize: 11, fontWeight: "900" },
  disabled: { opacity: 0.38 },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surfaceSoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pillActive: {
    borderColor: STUDIO.accentBorder,
    backgroundColor: STUDIO.accentFill,
  },
  pillMapped: { borderColor: "rgba(67,209,123,0.35)" },
  pillText: { color: STUDIO.text, fontSize: 10, fontWeight: "800" },
  speakerPills: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 9 },
  notice: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(67,209,123,0.25)",
    backgroundColor: "rgba(67,209,123,0.07)",
    padding: 9,
    marginTop: 10,
  },
  noticeText: { color: "#A8F1C4", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  errorBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,123,134,0.28)",
    backgroundColor: "rgba(255,123,134,0.08)",
    padding: 9,
    marginTop: 10,
  },
  error: { color: "#FFC0C6", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  priceBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STUDIO.accentBorder,
    backgroundColor: STUDIO.accentFill,
    padding: 10,
    marginTop: 9,
  },
  priceText: { color: STUDIO.accentText, fontSize: 12, fontWeight: "900" },
  generatedGrid: { gap: 9, marginTop: 10 },
  generatedCard: {
    borderRadius: 13,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surfaceSoft,
  },
  generatedImage: { width: "100%", aspectRatio: 16 / 9 },
  generatedLabel: {
    color: STUDIO.accentText,
    fontSize: 10,
    fontWeight: "900",
    padding: 9,
  },
  mapFrame: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 13,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: STUDIO.border,
    marginTop: 10,
  },
});
