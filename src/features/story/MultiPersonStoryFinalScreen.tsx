import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  CompactButton,
  Divider,
  ProgressLine,
  StatusPill,
  STUDIO,
  StudioHero,
  Surface,
  useStudioViewport,
} from "../../core/studio/DenseStudioUI";
import {
  advanceStudioWorkflow,
  ensureStoryStudioWorkflow,
  getStoryFinalMediaReadUrl,
  getStoryWorkspace,
  getStudioWorkflow,
  latestPendingReview,
  reviewStudioOutput,
  stitchStoryFinal,
  storyFinalStage,
  type StoryWorkspaceView,
  type StudioWorkflowView,
} from "../../core/studio/multiPersonWorkflow";
import { userFacingStudioError } from "../../core/studio/productionExperience";
import DFHeader from "../../core/ui/DFHeader";

type Props = {
  storyId: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function FinalStoryPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.video}
      nativeControls
      contentFit="contain"
    />
  );
}

function finalMediaId(
  workflow: StudioWorkflowView | null | undefined
) {
  const canonical = clean(workflow?.final_media_id);
  if (canonical) return canonical;

  const stage = storyFinalStage(workflow);
  const outputs = [...(stage?.outputs ?? [])].reverse();

  const active =
    outputs.find(
      (output) =>
        output.is_active !== false &&
        output.role === "approved_story_video"
    ) ??
    outputs.find((output) => output.is_active !== false) ??
    outputs[0];

  return clean(active?.media_id);
}

function stageLabel(value: unknown) {
  const state = clean(value).toLowerCase();

  if (state === "awaiting_review") return "READY TO REVIEW";
  if (state === "generating") return "ASSEMBLING";
  if (state === "approved") return "APPROVED";
  if (state === "failed") return "NEEDS RETRY";
  if (state === "rejected") return "NEEDS ATTENTION";
  if (state === "ready" || state === "pending") return "READY";

  return state
    ? state.replace(/_/g, " ").toUpperCase()
    : "WAITING";
}

export default function MultiPersonStoryFinalScreen({
  storyId,
}: Props) {
  const viewport = useStudioViewport();
  const mounted = useRef(true);

  const [workspace, setWorkspace] =
    useState<StoryWorkspaceView | null>(null);
  const [workflow, setWorkflow] =
    useState<StudioWorkflowView | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  const loadVideo = useCallback(
    async (
      nextWorkflow: StudioWorkflowView,
      preferredUrl?: string | null
    ) => {
      const returnedUrl = clean(preferredUrl);

      if (returnedUrl) {
        if (mounted.current) setVideoUrl(returnedUrl);
        return;
      }

      const mediaId = finalMediaId(nextWorkflow);

      if (!mediaId) {
        if (mounted.current) setVideoUrl("");
        return;
      }

      const media = await getStoryFinalMediaReadUrl(mediaId);

      if (mounted.current) {
        setVideoUrl(clean(media?.read_url));
      }
    },
    []
  );

  const load = useCallback(
    async (quiet = false) => {
      if (!storyId) return;

      if (!quiet) setLoading(true);
      setMessage("");

      try {
        const [nextWorkspace, nextWorkflow] =
          await Promise.all([
            getStoryWorkspace(storyId),
            ensureStoryStudioWorkflow(storyId),
          ]);

        if (!mounted.current) return;

        setWorkspace(nextWorkspace);
        setWorkflow(nextWorkflow);

        await loadVideo(nextWorkflow).catch(() => {
          if (
            mounted.current &&
            finalMediaId(nextWorkflow)
          ) {
            setMessage(
              "The final Story video exists, but its playback link could not be refreshed yet."
            );
          }
        });
      } catch (error) {
        if (mounted.current) {
          setMessage(userFacingStudioError(error));
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [loadVideo, storyId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const finalStage = useMemo(
    () => storyFinalStage(workflow),
    [workflow]
  );

  const fusionStages = useMemo(
    () =>
      (workflow?.stages ?? []).filter(
        (stage) =>
          stage.stage_type === "fusion" &&
          stage.scope_type === "scene"
      ),
    [workflow]
  );

  const approvedScenes = fusionStages.filter(
    (stage) => stage.state === "approved"
  ).length;

  const sceneTotal = fusionStages.length;

  const complete =
    clean(workflow?.state).toLowerCase() === "completed";

  const stageState = clean(finalStage?.state).toLowerCase();

  const allScenesApproved =
    sceneTotal > 1 && approvedScenes === sceneTotal;

  const canAssemble =
    Boolean(finalStage) &&
    ["pending", "ready", "failed", "rejected"].includes(
      stageState
    );

  const canReview =
    finalStage?.state === "awaiting_review" &&
    Boolean(latestPendingReview(finalStage));

  useEffect(() => {
    if (!workflow || stageState !== "generating") return;

    const timer = setInterval(() => {
      void load(true);
    }, 4000);

    return () => clearInterval(timer);
  }, [load, stageState, workflow]);

  const assemble = useCallback(async () => {
    if (!workflow || !finalStage) return;

    setBusy(true);
    setMessage("");

    try {
      const result = await stitchStoryFinal(
        workflow.workflow_id,
        finalStage.stage_run_id
      );

      if (!mounted.current) return;

      setWorkflow(result.workflow);
      await loadVideo(
        result.workflow,
        result.video_url
      );

      setMessage(
        result.reused
          ? "The approved scenes were already assembled. Review the final Story."
          : "Final Story assembled. Review the complete video before approval."
      );
    } catch (error) {
      if (mounted.current) {
        setMessage(userFacingStudioError(error));

        const authoritative = await getStudioWorkflow(
          workflow.workflow_id
        ).catch(() => null);

        if (authoritative && mounted.current) {
          setWorkflow(authoritative);
          await loadVideo(authoritative).catch(() => {});
        }
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [finalStage, loadVideo, workflow]);

  const approveFinal = useCallback(async () => {
    if (!workflow) return;

    setBusy(true);
    setMessage("");

    try {
      const authoritative = await getStudioWorkflow(
        workflow.workflow_id
      );

      const currentFinal =
        storyFinalStage(authoritative);

      if (!currentFinal) {
        throw new Error(
          "Story Final stage is not available."
        );
      }

      let latest = authoritative;
      const pending =
        latestPendingReview(currentFinal);

      if (pending) {
        latest = await reviewStudioOutput(
          pending.review_item_id,
          "approved"
        );
      } else if (currentFinal.state !== "approved") {
        throw new Error(
          "The latest final Story review state has been refreshed."
        );
      }

      latest = await advanceStudioWorkflow(
        latest.workflow_id
      ).catch(() => latest);

      if (!mounted.current) return;

      setWorkflow(latest);
      await loadVideo(latest);

      setMessage(
        clean(latest.state).toLowerCase() === "completed"
          ? "Story complete. Your final video is locked and ready."
          : "Final Story approved."
      );
    } catch (error) {
      if (mounted.current) {
        setMessage(userFacingStudioError(error));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [loadVideo, workflow]);

  const completeApprovedFinal =
    useCallback(async () => {
      if (!workflow) return;

      setBusy(true);
      setMessage("");

      try {
        const latest =
          await advanceStudioWorkflow(
            workflow.workflow_id
          );

        if (!mounted.current) return;

        setWorkflow(latest);
        await loadVideo(latest);

        setMessage(
          clean(latest.state).toLowerCase() ===
            "completed"
            ? "Story complete. Your final video is locked and ready."
            : "Story state refreshed."
        );
      } catch (error) {
        if (mounted.current) {
          setMessage(
            userFacingStudioError(error)
          );
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    }, [loadVideo, workflow]);

  const openMenu = useCallback(() => {
    router.push({
      pathname: "/(tabs)/dashboard" as any,
      params: {
        openMenu: "1",
        menu_nonce: `${Date.now()}`,
        menu_source: "story_final",
      },
    } as any);
  }, []);

  const openPlan = useCallback(() => {
    router.push({
      pathname: "/(tabs)/billing" as any,
      params: {
        intent: "manage",
        source: "story_final",
      },
    } as any);
  }, []);

  if (loading && !workflow) {
    return (
      <View style={styles.safe}>
        <DFHeader
          subtitle="Story Final"
          onMenuPress={openMenu}
          onPressMeta={openPlan}
        />
        <View style={styles.center}>
          <ActivityIndicator
            size="large"
            color={STUDIO.accent}
          />
          <Text style={styles.helper}>
            Preparing Story Final…
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <DFHeader
        subtitle="Story Final"
        onMenuPress={openMenu}
        onPressMeta={openPlan}
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            maxWidth: viewport.contentMaxWidth,
            paddingHorizontal:
              viewport.horizontalPadding,
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={STUDIO.accent}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
          />
        }
      >
        <StudioHero
          eyebrow="STORY FINAL"
          title={
            workspace?.title ||
            "Your final Story"
          }
          subtitle="Join the approved scenes in Story order into one final video. Face, Audio and approved scene renders stay locked and are reused."
          right={
            <ProgressLine
              current={approvedScenes}
              total={sceneTotal}
              label="Scenes"
            />
          }
        />

        {message ? (
          <Surface
            style={styles.messageBox}
            accent
          >
            <Text style={styles.messageText}>
              {message}
            </Text>
          </Surface>
        ) : null}

        <Surface
          style={styles.summaryCard}
          accent={complete || canReview}
        >
          <View style={styles.summaryHeader}>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>
                {complete
                  ? "Story production complete"
                  : canReview
                    ? "Final Story ready to review"
                    : stageState === "generating"
                      ? "Assembling final Story"
                      : "Final Story assembly"}
              </Text>

              <Text style={styles.summaryMeta}>
                {complete
                  ? "Your approved final video is the canonical Story output."
                  : "Final assembly does not regenerate Face, Audio, or approved scene videos."}
              </Text>
            </View>

            <StatusPill
              value={
                complete
                  ? "COMPLETE"
                  : stageLabel(
                      finalStage?.state
                    )
              }
              tone={
                complete
                  ? "success"
                  : canReview
                    ? "accent"
                    : stageState === "failed"
                      ? "danger"
                      : "neutral"
              }
            />
          </View>

          <View style={styles.sceneSummary}>
            <Text style={styles.sceneSummaryValue}>
              {approvedScenes}/{sceneTotal}
            </Text>
            <Text style={styles.sceneSummaryLabel}>
              approved scenes
            </Text>
          </View>

          {!allScenesApproved && !complete ? (
            <Text style={styles.warning}>
              Story Final remains blocked until every scene has an approved Fusion output.
            </Text>
          ) : null}
        </Surface>

        {videoUrl ? (
          <Surface
            style={styles.videoCard}
            accent={canReview || complete}
          >
            <Text style={styles.videoTitle}>
              {complete
                ? "Final Story"
                : "Final Story candidate"}
            </Text>

            <FinalStoryPlayer uri={videoUrl} />

            <Text style={styles.videoMeta}>
              {complete
                ? "This is the completed Story output."
                : "Review the complete assembled Story before final approval."}
            </Text>
          </Surface>
        ) : null}

        <Surface style={styles.actionCard}>
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator
                size="small"
                color={STUDIO.accent}
              />
              <Text style={styles.helper}>
                Updating Story Final…
              </Text>
            </View>
          ) : null}

          {canAssemble ? (
            <CompactButton
              label={
                stageState === "failed"
                  ? "Retry final assembly"
                  : "Assemble final Story"
              }
              onPress={() => void assemble()}
              disabled={
                busy || !allScenesApproved
              }
              tone="primary"
              fill
            />
          ) : null}

          {stageState === "generating" ? (
            <CompactButton
              label="Refresh assembly status"
              onPress={() => void load(true)}
              disabled={busy}
              fill
            />
          ) : null}

          {canReview ? (
            <CompactButton
              label="Approve final Story"
              onPress={() =>
                void approveFinal()
              }
              disabled={busy || !videoUrl}
              tone="primary"
              fill
            />
          ) : null}

          {finalStage?.state === "approved" &&
          !complete ? (
            <CompactButton
              label="Complete Story"
              onPress={() =>
                void completeApprovedFinal()
              }
              disabled={busy}
              tone="primary"
              fill
            />
          ) : null}

          <CompactButton
            label="Refresh"
            onPress={() => void load(true)}
            disabled={busy}
            fill
          />

          <Text style={styles.auditNote}>
            Final assembly joins only the approved scene videos already attached to this Story. It creates no new Face, Audio, or Fusion generation request.
          </Text>
        </Surface>

        <Divider />

        <View style={styles.footerRow}>
          <Text style={styles.footerTitle}>
            {complete
              ? "Final Story locked"
              : "Human approval required"}
          </Text>
          <Text style={styles.footerMeta}>
            {clean(workflow?.final_media_id)
              ? "Final media recorded"
              : "Awaiting final media"}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: STUDIO.bg,
  },
  content: {
    width: "100%",
    alignSelf: "center",
    paddingTop: 10,
    paddingBottom: 120,
    gap: 10,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  helper: {
    color: STUDIO.muted,
    fontSize: 10,
    fontWeight: "700",
  },
  messageBox: {
    padding: 10,
  },
  messageText: {
    color: STUDIO.text,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: "700",
  },
  summaryCard: {
    padding: 12,
    gap: 12,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    color: STUDIO.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
  },
  summaryMeta: {
    color: STUDIO.muted,
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "600",
    marginTop: 3,
  },
  sceneSummary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: STUDIO.border,
    backgroundColor: STUDIO.surfaceSoft,
    padding: 11,
  },
  sceneSummaryValue: {
    color: STUDIO.accentText,
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
  },
  sceneSummaryLabel: {
    color: STUDIO.muted,
    fontSize: 8,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  warning: {
    color: "#FFB4BD",
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "700",
  },
  videoCard: {
    padding: 12,
    gap: 8,
  },
  videoTitle: {
    color: STUDIO.text,
    fontSize: 13,
    fontWeight: "900",
  },
  video: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 12,
    backgroundColor: "#000",
  },
  videoMeta: {
    color: STUDIO.muted,
    fontSize: 9,
    lineHeight: 14,
    fontWeight: "600",
  },
  actionCard: {
    padding: 12,
    gap: 9,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  auditNote: {
    color: STUDIO.faint,
    fontSize: 8,
    lineHeight: 13,
    fontWeight: "600",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  },
  footerTitle: {
    color: STUDIO.text,
    fontSize: 11,
    fontWeight: "900",
  },
  footerMeta: {
    color: STUDIO.muted,
    fontSize: 9,
    fontWeight: "800",
  },
});
