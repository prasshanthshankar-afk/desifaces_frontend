import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PricingSnapshot, PricingUiSummary } from "../../pricing/types";

type StudioJobStage = "queued" | "preparing" | "running" | "finalizing" | "succeeded" | "failed";

export type StudioJobItem = {
  id: string;
  kind: "face" | "audio" | "fusion";
  title: string;
  stage: StudioJobStage;
  progress: number;
  message?: string;
  startedAt: number;
  backgrounded?: boolean;
  resultReady?: boolean;
  pricingLabel?: string;
  pricing?: PricingSnapshot | null;
  pricingSummary?: PricingUiSummary | null;
  resultCount?: number;
};

const palette = {
  bg: "rgba(10,10,12,0.94)",
  panel: "rgba(255,255,255,0.05)",
  panelBorder: "rgba(255,255,255,0.10)",
  border: "rgba(255,255,255,0.12)",
  text: "rgba(255,250,236,0.98)",
  muted: "rgba(255,250,236,0.62)",
  accent: "rgba(248,184,72,0.96)",
  success: "rgba(110,211,156,0.96)",
  error: "rgba(255,120,120,0.96)",
};

function stageLabel(stage: StudioJobStage) {
  switch (stage) {
    case "queued":
      return "Queued";
    case "preparing":
      return "Preparing";
    case "running":
      return "Running";
    case "finalizing":
      return "Finalizing";
    case "succeeded":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

function kindLabel(kind: StudioJobItem["kind"]) {
  return kind === "face" ? "Face" : kind === "audio" ? "Audio" : "Fusion";
}

function pricingLine(job: StudioJobItem) {
  return (
    job.pricingSummary?.finalLabel ||
    job.pricingSummary?.estimateLabel ||
    job.pricingSummary?.receiptLabel ||
    job.pricingLabel ||
    job.pricing?.message ||
    null
  );
}

function progressColor(stage: StudioJobStage) {
  if (stage === "succeeded") return palette.success;
  if (stage === "failed") return palette.error;
  return palette.accent;
}

export default function GlobalJobsTray({
  jobs,
  onOpenJob,
  onDismissJob,
}: {
  jobs: StudioJobItem[];
  onOpenJob?: (job: StudioJobItem) => void;
  onDismissJob?: (jobId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ordered = useMemo(() => [...jobs].sort((a, b) => b.startedAt - a.startedAt), [jobs]);
  if (!ordered.length) return null;

  const activeCount = ordered.filter((j) => j.stage !== "succeeded" && j.stage !== "failed").length;

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={{
          borderRadius: 24,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.bg,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: 0.22,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 4,
        }}
      >
        <View style={{ padding: 14 }}>
          <View style={{ width: 34, height: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", alignSelf: "center" }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: palette.text, fontWeight: "900", fontSize: 14 }}>Jobs</Text>
              <Text style={{ color: palette.muted, marginTop: 3, fontWeight: "700", fontSize: 11 }}>
                {activeCount > 0 ? `${activeCount} active job${activeCount === 1 ? "" : "s"}` : `${ordered.length} recent job${ordered.length === 1 ? "" : "s"}`}
              </Text>
            </View>
            <Text style={{ color: palette.accent, fontWeight: "900", fontSize: 12 }}>{expanded ? "Collapse" : "Expand"}</Text>
          </View>
        </View>

        {expanded ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            {ordered.map((job) => {
              const pricingText = pricingLine(job);
              return (
                <View
                  key={job.id}
                  style={{
                    marginTop: 10,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: palette.panelBorder,
                    backgroundColor: palette.panel,
                    padding: 12,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ color: palette.text, fontWeight: "900", fontSize: 13 }}>{job.title}</Text>
                      <Text style={{ color: palette.muted, marginTop: 4, fontSize: 11 }}>{kindLabel(job.kind)} • {stageLabel(job.stage)}</Text>
                    </View>
                    <Text style={{ color: progressColor(job.stage), fontWeight: "800", fontSize: 11 }}>{Math.round(job.progress * 100)}%</Text>
                  </View>

                  <View style={{ marginTop: 10, height: 8, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)" }}>
                    <View style={{ width: `${Math.max(0, Math.min(100, job.progress * 100))}%`, height: "100%", backgroundColor: progressColor(job.stage) }} />
                  </View>

                  {!!job.message && (
                    <Text style={{ color: palette.muted, marginTop: 8, fontSize: 11 }}>{job.message}</Text>
                  )}

                  {!!pricingText && (
                    <Text style={{ color: palette.accent, marginTop: 8, fontWeight: "800", fontSize: 11 }}>{pricingText}</Text>
                  )}

                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable
                      onPress={() => onOpenJob?.(job)}
                      style={{ flex: 1, minHeight: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(248,184,72,0.14)", borderWidth: 1, borderColor: "rgba(248,184,72,0.24)" }}
                    >
                      <Text style={{ color: palette.accent, fontWeight: "800", fontSize: 11 }}>
                        {job.resultReady ? "Open result" : "View status"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onDismissJob?.(job.id)}
                      style={{ minWidth: 84, minHeight: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: palette.panelBorder }}
                    >
                      <Text style={{ color: palette.muted, fontWeight: "800", fontSize: 11 }}>Dismiss</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : null}
      </Pressable>
    </View>
  );
}
