import React from "react";
import { Text, View } from "react-native";

import { DF } from "../../core/theme/colors";

type ProgressRecord = Record<string, any> | null | undefined;

function numberValue(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function elapsedLabel(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.floor(seconds))}s elapsed`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s elapsed`;
}

export default function GenerationProgressCard({
  progress,
  status,
  kind,
}: {
  progress: ProgressRecord;
  status?: string | null;
  kind: "video" | "face";
}) {
  if (!progress || typeof progress !== "object") return null;

  const percent = Math.max(0, Math.min(100, numberValue(progress.percent)));
  const stage = String(progress.stage || status || "processing").replace(/_/g, " ");
  const message = String(
    progress.message || (kind === "video" ? "Creating your video…" : "Creating your Face…")
  );
  const elapsed = numberValue(progress.elapsed_seconds);
  const delayed = Boolean(progress.is_delayed);
  const delayMessage = String(progress.delay_message || "");
  const total = numberValue(kind === "video" ? progress.segments_total : progress.variants_requested);
  const complete = numberValue(kind === "video" ? progress.segments_completed : progress.variants_completed);
  const running = numberValue(kind === "video" ? progress.segments_running : progress.variants_running);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`${kind === "video" ? "Video" : "Face"} generation progress`}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{
        borderWidth: 1,
        borderColor: DF.border,
        borderRadius: 16,
        padding: 14,
        marginTop: 12,
        backgroundColor: "rgba(255,255,255,0.04)",
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: DF.muted, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>
            {stage}
          </Text>
          <Text style={{ color: DF.text, fontSize: 14, fontWeight: "800", marginTop: 4 }}>
            {message}
          </Text>
        </View>
        <Text style={{ color: DF.text, fontSize: 15, fontWeight: "900" }}>{percent}%</Text>
      </View>

      <View
        style={{
          height: 9,
          borderRadius: 999,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.10)",
          marginTop: 12,
        }}
      >
        <View
          style={{
            width: `${percent}%`,
            height: "100%",
            borderRadius: 999,
            backgroundColor: "rgba(248,184,72,0.88)",
          }}
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 9 }}>
        {total > 0 ? (
          <Text style={{ color: DF.muted, fontSize: 11 }}>
            {complete}/{total} {kind === "video" ? "parts" : "variants"} complete
          </Text>
        ) : null}
        {running > 0 ? <Text style={{ color: DF.muted, fontSize: 11 }}>{running} running now</Text> : null}
        {elapsed > 0 ? <Text style={{ color: DF.muted, fontSize: 11 }}>{elapsedLabel(elapsed)}</Text> : null}
      </View>

      {delayed && delayMessage ? (
        <View
          style={{
            marginTop: 12,
            borderRadius: 12,
            padding: 10,
            backgroundColor: "rgba(248,184,72,0.10)",
          }}
        >
          <Text style={{ color: DF.text, fontSize: 12, lineHeight: 17 }}>{delayMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}
