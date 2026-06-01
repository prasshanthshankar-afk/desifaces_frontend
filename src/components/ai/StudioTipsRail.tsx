import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";

import { DF } from "../../core/theme/colors";

export type StudioCoachTip = {
  id?: string;
  title: string;
  body: string;
  tone?: "neutral" | "success" | "warning" | "premium";
};

type Props = {
  title?: string;
  subtitle?: string;
  tips: StudioCoachTip[];
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  rotateEveryMs?: number;
};

function toneAccent(tone?: StudioCoachTip["tone"]) {
  switch (tone) {
    case "success":
      return {
        borderColor: "rgba(120,255,180,0.20)",
        backgroundColor: "rgba(120,255,180,0.08)",
        dotColor: "rgba(120,255,180,0.95)",
      };
    case "warning":
      return {
        borderColor: "rgba(255,180,90,0.24)",
        backgroundColor: "rgba(255,180,90,0.10)",
        dotColor: "rgba(255,180,90,0.95)",
      };
    case "premium":
      return {
        borderColor: "rgba(248,184,72,0.28)",
        backgroundColor: "rgba(232,152,56,0.12)",
        dotColor: "rgba(248,232,136,0.98)",
      };
    default:
      return {
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.05)",
        dotColor: "rgba(255,255,255,0.85)",
      };
  }
}

export default function StudioTipsRail({
  title = "Studio coach",
  subtitle,
  tips,
  loading = false,
  error,
  onRefresh,
  rotateEveryMs = 10_000,
}: Props) {
  const safeTips = useMemo(() => tips.filter((tip) => !!tip?.title && !!tip?.body), [tips]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!safeTips.length) {
      setActiveIndex(0);
      return;
    }
    setActiveIndex((prev) => Math.min(prev, safeTips.length - 1));
  }, [safeTips]);

  useEffect(() => {
    if (safeTips.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % safeTips.length);
    }, Math.max(4_000, rotateEveryMs));
    return () => clearInterval(timer);
  }, [safeTips.length, rotateEveryMs]);

  const activeTip = safeTips[activeIndex] ?? null;
  const tone = toneAccent(activeTip?.tone);

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: tone.borderColor,
        backgroundColor: tone.backgroundColor,
        paddingHorizontal: 12,
        paddingVertical: 10,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 5 },
        elevation: 2,
        minHeight: 88,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>
            {title}
            {safeTips.length > 1 ? ` • ${activeIndex + 1}/${safeTips.length}` : ""}
          </Text>
          {!!subtitle && !error && (
            <Text
              numberOfLines={1}
              style={{ color: DF.muted, marginTop: 2, fontWeight: "700", fontSize: 11 }}
            >
              {subtitle}
            </Text>
          )}
          {!!error && (
            <Text
              numberOfLines={1}
              style={{ color: "rgba(255,220,180,0.92)", marginTop: 2, fontWeight: "700", fontSize: 11 }}
            >
              {error}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {loading ? <ActivityIndicator size="small" /> : null}
          {!!onRefresh && (
            <Pressable
              onPress={() => {
                if (safeTips.length > 1) {
                  setActiveIndex((prev) => (prev + 1) % safeTips.length);
                }
                onRefresh();
              }}
              style={{
                height: 32,
                borderRadius: 10,
                paddingHorizontal: 10,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(255,255,255,0.05)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 11 }}>
                Refresh
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {activeTip ? (
        <View
          style={{
            marginTop: 8,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              marginTop: 5,
              backgroundColor: tone.dotColor,
            }}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: DF.text, fontWeight: "900", fontSize: 12.5 }}>
              {activeTip.title}
            </Text>
            <Text
              numberOfLines={2}
              style={{ color: DF.muted, marginTop: 2, fontWeight: "700", fontSize: 11.5, lineHeight: 17 }}
            >
              {activeTip.body}
            </Text>
          </View>

          {safeTips.length > 1 ? (
            <Pressable
              onPress={() => setActiveIndex((prev) => (prev + 1) % safeTips.length)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: "rgba(255,255,255,0.05)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>›</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            marginTop: 8,
            minHeight: 42,
            justifyContent: "center",
          }}
        >
          <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 11.5 }}>
            {loading ? "Loading studio guidance…" : "Studio guidance will appear here as you shape the prompt."}
          </Text>
        </View>
      )}

      {safeTips.length > 1 ? (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
          {safeTips.map((tip, index) => (
            <View
              key={tip.id ?? `${tip.title}-${index}`}
              style={{
                width: index === activeIndex ? 16 : 6,
                height: 6,
                borderRadius: 999,
                backgroundColor:
                  index === activeIndex ? tone.dotColor : "rgba(255,255,255,0.18)",
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
