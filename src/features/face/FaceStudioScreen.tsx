import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  FlatList,
  Dimensions,
  ScrollView,
  Platform,
  Share as RNShare,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Slider from "@react-native-community/slider";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { DF } from "../../core/theme/colors";
import DFHeader from "../../core/ui/DFHeader";
import { useAuth } from "../../core/auth/AuthContext";
import { shareUrl } from "../../core/share/share";
import { useCreatorFlow } from "../../core/flow/creatorFlowStore";
import DFBlockingOverlay from "../../core/ui/DFBlockingOverlay";
import { saveCreateFlowContext } from "../../core/media/createFlow";

import {
  apiCheckFaceSourceImageSafety,
  apiCreateFaceJob,
  apiGetFaceJobStatus,
  apiUploadSourceImage,
} from "./api/creatorFace";
import { fetchFaceMasterdata } from "./api/masterdataFace";

import GlobalJobsTray, {
  type StudioJobItem,
} from "../jobs/components/GlobalJobsTray";

type StudioJobStage = StudioJobItem["stage"];

import { RunReceiptCard } from "../../components/pricing/RunReceiptCard";
import { JobPricingTimeline } from "../../components/pricing/JobPricingTimeline";
import { PricingTopBar } from "../../components/pricing/PricingTopBar";
import { useFacePricingEstimate } from "./hooks/useFacePricingEstimate";

type Mode = "text-to-image" | "image-to-image";
type Opt = { code: string; label: string };

type FaceVariant = {
  image_url: string;
  face_profile_id?: string;
  media_asset_id?: string;
  artifact_id?: string;
  [k: string]: any;
};

type ImageSafetyState = "idle" | "checking" | "passed" | "blocked" | "error";

const COUNTRY_LABEL = "India";

const SHOT_TYPE_OPTIONS: Opt[] = [
  { code: "full_body", label: "Full-Length / Full-Body Shot" },
  { code: "portrait_headshot", label: "Portrait / Headshot" },
  { code: "medium_shot", label: "Medium Shot" },
  { code: "close_up_macro", label: "Close-Up / Macro" },
  { code: "wide_landscape", label: "Wide Shot / Landscape" },
  { code: "low_angle", label: "Low Angle" },
  { code: "high_angle", label: "High Angle" },
  { code: "eye_level", label: "Eye-Level" },
  { code: "three_quarter", label: "Three-Quarter Shot" },
  { code: "over_the_shoulder", label: "Over-the-Shoulder" },
];

function cleanParam(v: any): string {
  if (Array.isArray(v)) v = v[0];
  return String(v ?? "").trim().replace(/^"+|"+$/g, "");
}

function findPreferredOption(options: Opt[], preferredCodes: string[]) {
  const wanted = preferredCodes.map((x) => x.toLowerCase());
  return options.find((opt) => wanted.includes(String(opt.code).toLowerCase())) ?? null;
}

function normalizeAspectRatio(v: any): "9:16" | "16:9" | "1:1" {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "16:9" || s === "landscape") return "16:9";
  if (s === "1:1" || s === "square") return "1:1";
  return "9:16";
}

function stageFromStatus(status: string): StudioJobStage {
  const s = String(status || "").toLowerCase();
  if (s === "queued") return "queued";
  if (s === "preparing") return "preparing";
  if (s === "processing" || s === "running") return "running";
  if (s === "finalizing") return "finalizing";
  if (s === "succeeded") return "succeeded";
  if (s === "failed") return "failed";
  return "running";
}

function nextProgress(prev: number, stage: StudioJobStage): number {
  const floor =
    stage === "queued"
      ? 0.12
      : stage === "preparing"
        ? 0.24
        : stage === "running"
          ? Math.min(0.82, prev + 0.05)
          : stage === "finalizing"
            ? 0.92
            : stage === "succeeded"
              ? 1
              : prev;

  return Math.max(prev, floor);
}

function pickPricingLabel(resp: any): string | undefined {
  const summary = resp?.pricing_summary ?? null;
  if (summary?.finalLabel) return String(summary.finalLabel);
  if (summary?.final_label) return String(summary.final_label);
  if (summary?.receiptLabel) return String(summary.receiptLabel);
  if (summary?.receipt_label) return String(summary.receipt_label);
  if (summary?.estimateLabel) return String(summary.estimateLabel);
  if (summary?.estimate_label) return String(summary.estimate_label);

  const pricing = resp?.pricing ?? null;
  if (pricing?.amount != null && pricing?.currency) {
    return `${pricing.currency} ${pricing.amount}`;
  }
  return undefined;
}

function pickFinalPricingMessage(resp: any): string | null {
  const summary = resp?.pricing_summary ?? null;
  if (typeof summary?.message === "string" && summary.message.trim()) return summary.message;
  if (typeof summary?.detail === "string" && summary.detail.trim()) return summary.detail;

  const pricing = resp?.pricing ?? null;
  if (pricing?.state === "released") return "Reservation released. No final charge was applied.";
  if (pricing?.state === "committed") return "Final pricing snapshot captured from the completed run.";

  return null;
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const Item = ({ n, label }: { n: 1 | 2 | 3; label: string }) => {
    const active = step === n;
    const done = step > n;
    return (
      <View style={{ flex: 1, alignItems: "center" }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: done ? "rgba(248,184,72,0.55)" : DF.border,
            backgroundColor: active ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.04)",
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>{n}</Text>
        </View>
        <Text style={{ color: active ? DF.text : DF.muted, marginTop: 6, fontWeight: "800", fontSize: 11 }}>
          {label}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 14, paddingTop: 8 }}>
      <Item n={1} label="Face" />
      <View style={{ width: 22, height: 1, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.10)" }} />
      <Item n={2} label="Audio" />
      <View style={{ width: 22, height: 1, alignSelf: "center", backgroundColor: "rgba(255,255,255,0.10)" }} />
      <Item n={3} label="Fusion" />
    </View>
  );
}

function GlassCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return (
    <View
      style={[
        {
          borderRadius: 20,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.055)",
          padding: 14,
          shadowColor: "#000",
          shadowOpacity: Platform.OS === "ios" ? 0.18 : 0,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 2,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>{title}</Text>
        {!!subtitle && (
          <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 12 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
}

function SelectorChip({
  label,
  value,
  onPress,
  disabled,
  width = "48.5%",
}: {
  label: string;
  value: string;
  onPress?: () => void;
  disabled?: boolean;
  width?: any;
}) {
  const clickable = !!onPress && !disabled;

  return (
    <Pressable
      disabled={!clickable}
      onPress={onPress}
      style={{
        width,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
        paddingVertical: 10,
        paddingHorizontal: 12,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "800", fontSize: 10 }}>
        {label}
      </Text>

      <View
        style={{
          marginTop: 6,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: DF.text,
            fontWeight: "900",
            fontSize: 12,
            flex: 1,
          }}
        >
          {value}
        </Text>

        {!!onPress && (
          <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900", fontSize: 14 }}>
            ›
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function Segmented({
  value,
  onChange,
  disabled,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
  disabled?: boolean;
}) {
  const Option = ({
    active,
    label,
    subtitle,
    onPress,
  }: {
    active: boolean;
    label: string;
    subtitle: string;
    onPress: () => void;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: active ? "rgba(248,184,72,0.42)" : "rgba(255,255,255,0.10)",
        backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <Text
        style={{
          color: active ? "rgba(248,232,136,1)" : DF.text,
          fontWeight: "900",
          fontSize: 14,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 11 }}>
        {subtitle}
      </Text>
    </Pressable>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        padding: 4,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(248,184,72,0.18)",
        backgroundColor: "rgba(8,8,8,0.55)",
      }}
    >
      <Option
        active={value === "text-to-image"}
        label="Create Face"
        subtitle="Generate from prompt"
        onPress={() => onChange("text-to-image")}
      />
      <Option
        active={value === "image-to-image"}
        label="Edit Face"
        subtitle="Use a source photo"
        onPress={() => onChange("image-to-image")}
      />
    </View>
  );
}

function VariantsControl({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const clamp = (n: number) => Math.max(1, Math.min(8, n));
  const set = (n: number) => onChange(clamp(n));
  const presets = [2, 4, 6, 8];

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.10)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: 12,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Variants</Text>
        <View
          style={{
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "rgba(248,184,72,0.30)",
            backgroundColor: "rgba(232,152,56,0.12)",
          }}
        >
          <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900", fontSize: 12 }}>{value}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" }}>
        <Pressable
          onPress={() => set(value - 1)}
          disabled={disabled || value <= 1}
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(0,0,0,0.22)",
            opacity: disabled || value <= 1 ? 0.45 : 1,
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>–</Text>
        </Pressable>

        <Pressable
          onPress={() => set(value + 1)}
          disabled={disabled || value >= 8}
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(0,0,0,0.22)",
            opacity: disabled || value >= 8 ? 0.45 : 1,
          }}
        >
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>+</Text>
        </Pressable>

        <View style={{ flex: 1, flexDirection: "row", gap: 8 }}>
          {presets.map((n) => {
            const active = value === n;
            return (
              <Pressable
                key={n}
                onPress={() => set(n)}
                disabled={disabled}
                style={{
                  flex: 1,
                  height: 42,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: active ? "rgba(248,184,72,0.40)" : "rgba(255,255,255,0.10)",
                  backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
                }}
              >
                <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900" }}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function SelectModal({
  open,
  title,
  items,
  selectedCode,
  onClose,
  onSelect,
}: {
  open: boolean;
  title: string;
  items: Opt[];
  selectedCode?: string | null;
  onClose: () => void;
  onSelect: (x: Opt) => void;
}) {
  const BG = (DF as any)?.night ?? "#0E0F14";

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} onPress={onClose} />
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: BG,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          maxHeight: "70%",
        }}
      >
        <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.08)" }}>
          <Text style={{ color: DF.text, fontWeight: "900", fontSize: 14 }}>{title}</Text>
          <Text style={{ color: DF.muted, marginTop: 4, fontWeight: "700", fontSize: 12 }}>
            Tap to select.
          </Text>
        </View>

        <FlatList
          data={items}
          keyExtractor={(x) => x.code}
          contentContainerStyle={{ padding: 10, paddingBottom: 18 }}
          renderItem={({ item }) => {
            const active = item.code === selectedCode;
            return (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: active ? "rgba(232,152,56,0.42)" : "rgba(255,255,255,0.10)",
                  backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>{item.label}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function ImageViewerModal({
  open,
  uri,
  title,
  canSelect,
  onBackToVariants,
  onSelectThis,
}: {
  open: boolean;
  uri: string | null;
  title?: string;
  canSelect: boolean;
  onBackToVariants: () => void;
  onSelectThis: () => void;
}) {
  const { width, height } = Dimensions.get("window");
  const cleanUri = useMemo(() => cleanParam(uri), [uri]);

  const onShare = useCallback(async () => {
    if (!cleanUri) return;

    try {
      await shareUrl(cleanUri, { title: "DesiFaces • Face", message: "Generated face" });
      return;
    } catch {}

    try {
      if (Platform.OS === "ios") {
        await RNShare.share({ url: cleanUri, message: cleanUri });
      } else {
        await RNShare.share({ message: cleanUri });
      }
    } catch {}
  }, [cleanUri]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onBackToVariants}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.92)" }} />

      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          paddingTop: 52,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          onPress={onBackToVariants}
          style={{
            borderRadius: 999,
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            backgroundColor: "rgba(255,255,255,0.06)",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.92)", fontWeight: "900" }}>← Variants</Text>
        </Pressable>

        <Text style={{ color: "rgba(255,255,255,0.86)", fontWeight: "900", fontSize: 14 }}>
          {title ?? "Preview"}
        </Text>

        <View style={{ width: 92 }} />
      </View>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
        }}
        pointerEvents="box-none"
      >
        {!!cleanUri ? (
          <ScrollView
            style={{ width, height }}
            contentContainerStyle={{
              width,
              height,
              alignItems: "center",
              justifyContent: "center",
              paddingTop: Platform.OS === "ios" ? 12 : 0,
            }}
            maximumZoomScale={3}
            minimumZoomScale={1}
            bouncesZoom
            pinchGestureEnabled={Platform.OS === "ios"}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              key={cleanUri}
              source={{ uri: cleanUri }}
              style={{ width, height }}
              contentFit="contain"
              transition={180}
            />
          </ScrollView>
        ) : null}
      </View>

      <View
        style={{
          position: "absolute",
          left: 16,
          right: 16,
          bottom: 22,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(10,10,12,0.72)",
          padding: 10,
        }}
      >
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={onShare}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.28)",
              backgroundColor: "rgba(232,152,56,0.12)",
            }}
          >
            <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900" }}>Share</Text>
          </Pressable>

          <Pressable
            onPress={onSelectThis}
            disabled={!canSelect}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.40)",
              backgroundColor: canSelect ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.06)",
              opacity: canSelect ? 1 : 0.6,
            }}
          >
            <Text style={{ color: DF.text, fontWeight: "900" }}>Continue</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={onBackToVariants}
          style={{
            marginTop: 10,
            height: 44,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(255,255,255,0.05)",
          }}
        >
          <Text style={{ color: "rgba(255,255,255,0.88)", fontWeight: "900" }}>Back to Variants</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export default function FaceStudioScreen() {
  const { isReady, isAuthed } = useAuth();

  const flow = useCreatorFlow() as any;
  const { setFaceSelection, resetCreatorFlow } = flow;
  const setFusionSettings = flow?.setFusionSettings as undefined | ((x: any) => void);

  const BG = (DF as any)?.night ?? "#0E0F14";
  const BG2 = (DF as any)?.night2 ?? "#141824";
  const screenWidth = Dimensions.get("window").width;
  const variantCardWidth = Math.min(Math.max(screenWidth * 0.72, 236), screenWidth - 76);

  const [mode, setMode] = useState<Mode>("text-to-image");
  const [prompt, setPrompt] = useState("");
  const [numVariants, setNumVariants] = useState(4);

  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [sourceImageAssetId, setSourceImageAssetId] = useState<string | null>(null);
  const [preservationStrength, setPreservationStrength] = useState(0.25);

  const [imageSafetyState, setImageSafetyState] = useState<ImageSafetyState>("idle");
  const [imageSafetyReason, setImageSafetyReason] = useState<string | null>(null);

  const [gender, setGender] = useState<"male" | "female">("female");
  const [zoneCode, setZoneCode] = useState<string | null>(null);
  const [regionCode, setRegionCode] = useState<string | null>(null);
  const [contextCode, setContextCode] = useState<string | null>(null);
  const [useCaseCode, setUseCaseCode] = useState<string | null>(null);
  const [shotTypeCode, setShotTypeCode] = useState<string | null>("portrait_headshot");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">(normalizeAspectRatio(flow?.fusionAspectRatio || "9:16"));

  const [openZone, setOpenZone] = useState(false);
  const [openRegion, setOpenRegion] = useState(false);
  const [openContext, setOpenContext] = useState(false);
  const [openUseCase, setOpenUseCase] = useState(false);
  const [openShotType, setOpenShotType] = useState(false);

  const [uploadingSource, setUploadingSource] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [uiLocked, setUiLocked] = useState(false);

  const [inlineStatus, setInlineStatus] = useState<string | null>(null);

  const [variants, setVariants] = useState<FaceVariant[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [resultsJobId, setResultsJobId] = useState<string | null>(null);

  const [jobs, setJobs] = useState<StudioJobItem[]>([]);
  const [backgroundNotice, setBackgroundNotice] = useState<string | null>(null);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerTitle, setViewerTitle] = useState<string>("Preview");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const [finalPricingLabel, setFinalPricingLabel] = useState<string | null>(null);
  const [finalPricingState, setFinalPricingState] = useState<"estimated" | "committed" | "released">("estimated");
  const [finalPricingMessage, setFinalPricingMessage] = useState<string | null>(null);
  const [workflowSummaryOpen, setWorkflowSummaryOpen] = useState(false);

  const pollingCancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      pollingCancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!backgroundNotice) return;
    const t = setTimeout(() => setBackgroundNotice(null), 5000);
    return () => clearTimeout(t);
  }, [backgroundNotice]);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthed) router.replace("/(auth)/login");
  }, [isReady, isAuthed]);

  const mdQ = useQuery({
    queryKey: ["masterdata-face", "en"],
    queryFn: () => fetchFaceMasterdata("en"),
    enabled: isReady && isAuthed,
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const md = mdQ.data as any;
  const mdLoading = mdQ.isFetching || mdQ.isLoading;
  const mdErr = (mdQ.error as any)?.message ? String((mdQ.error as any).message) : null;

  const zoneOptions: Opt[] = useMemo(() => {
    if (!md?.regions?.length) return [];

    const active = md.regions.filter((r: any) => r.is_active);
    const unique: string[] = Array.from(
      new Set(
        active
          .map((r: any) => r.sub_region)
          .filter((z: any): z is string => typeof z === "string" && z.trim().length > 0)
      )
    );

    unique.sort((a, b) => a.localeCompare(b));
    return unique.map((z) => ({ code: z, label: z }));
  }, [md]);

  const regionOptions: Opt[] = useMemo(() => {
    if (!md?.regions?.length) return [];
    const active = md.regions.filter((r: any) => r.is_active);
    const filtered = zoneCode ? active.filter((r: any) => r.sub_region === zoneCode) : active;
    filtered.sort(
      (a: any, b: any) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label))
    );
    return filtered.map((r: any) => ({ code: r.code, label: r.label }));
  }, [md, zoneCode]);

  const contextOptions: Opt[] = useMemo(() => {
    if (!md?.contexts?.length) return [];
    const active = md.contexts.filter((c: any) => c.is_active);
    active.sort(
      (a: any, b: any) =>
        (b.glamour_level ?? 0) - (a.glamour_level ?? 0) || String(a.label).localeCompare(String(b.label))
    );
    return active.map((c: any) => ({ code: c.code, label: c.label }));
  }, [md]);

  const useCaseOptions: Opt[] = useMemo(() => {
    if (!md?.use_cases?.length) return [];
    const active = md.use_cases.filter((u: any) => u.is_active);
    active.sort(
      (a: any, b: any) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.label).localeCompare(String(b.label))
    );
    return active.map((u: any) => ({ code: u.code, label: u.label }));
  }, [md]);

  useEffect(() => {
    if (!md) return;

    if (!zoneCode) {
      const north = zoneOptions.find((x) => x.code.toLowerCase() === "north");
      setZoneCode(north?.code ?? zoneOptions[0]?.code ?? null);
    }

    if (!regionCode) {
      const delhi = md.regions?.find((r: any) => r.is_active && r.code === "delhi_ncr");
      setRegionCode(delhi?.code ?? regionOptions[0]?.code ?? null);
    }

    if (!contextCode) {
      const genericContext = findPreferredOption(contextOptions, [
        "generic",
        "general",
        "neutral",
        "lifestyle",
        "casual",
        "everyday",
        "standard",
      ]);
      setContextCode(genericContext?.code ?? null);
    }

    if (!useCaseCode) {
      const genericUseCase = findPreferredOption(useCaseOptions, [
        "generic",
        "general",
        "profile_photo",
        "profile",
        "personal",
        "social_profile",
        "everyday",
      ]);
      setUseCaseCode(genericUseCase?.code ?? null);
    }
  }, [md, zoneCode, zoneOptions, regionCode, regionOptions, contextCode, contextOptions, useCaseCode, useCaseOptions]);

  useEffect(() => {
    if (!zoneCode || !regionCode) return;
    const ok = regionOptions.some((r) => r.code === regionCode);
    if (!ok) setRegionCode(regionOptions[0]?.code ?? null);
  }, [zoneCode, regionOptions, regionCode]);

  const resetI2ISourceState = useCallback((clearPickedUri: boolean = true) => {
    if (clearPickedUri) setPickedUri(null);
    setSourceImageUrl(null);
    setSourceImageAssetId(null);
    setImageSafetyState("idle");
    setImageSafetyReason(null);
  }, []);

  useEffect(() => {
    if (mode === "text-to-image") {
      resetI2ISourceState(true);
    }
  }, [mode, resetI2ISourceState]);

  const regionLabel = zoneOptions.find((x) => x.code === zoneCode)?.label ?? "Select";
  const stateLabel = regionOptions.find((x) => x.code === regionCode)?.label ?? "Select";
  const contextLabel = contextOptions.find((x) => x.code === contextCode)?.label ?? "Optional";
  const useCaseLabel = useCaseOptions.find((x) => x.code === useCaseCode)?.label ?? "Optional";
  const shotTypeLabel = SHOT_TYPE_OPTIONS.find((x) => x.code === shotTypeCode)?.label ?? "Select";

  const hasValidI2ISource =
    mode !== "image-to-image" ||
    ((!!sourceImageUrl || !!sourceImageAssetId) && imageSafetyState === "passed");

  const canGenerate = useMemo(() => {
    const hasPrompt = prompt.trim().length > 0;
    if (!hasPrompt) return false;
    if (!gender || !zoneCode || !regionCode) return false;
    if (mode === "image-to-image") return hasValidI2ISource;
    return true;
  }, [prompt, gender, zoneCode, regionCode, mode, hasValidI2ISource]);

  const pricingPreviewEnabled =
    isReady &&
    isAuthed &&
    prompt.trim().length > 0 &&
    !mdLoading &&
    !mdErr &&
    hasValidI2ISource;

  const pricingQ = useFacePricingEstimate({
    mode,
    prompt,
    numVariants,
    preservationStrength,
    sourceImageUrl,
    sourceImageAssetId,
    aspectRatio,
    enabled: pricingPreviewEnabled,
  });

  const rawPricing = pricingQ.data;
  const pricing =
    mode === "image-to-image" && !hasValidI2ISource
      ? null
      : rawPricing;

  const pricingConfirmation = pricing?.confirmation ?? null;
  const pricingReady = Boolean(pricingConfirmation?.quote_id);

  const openViewer = useCallback((uri: string, title?: string, index?: number) => {
    const u = cleanParam(uri);
    setViewerUri(u || null);
    setViewerTitle(title ?? "Preview");
    setViewerIndex(typeof index === "number" ? index : null);
    setViewerOpen(true);
  }, []);

  const closeViewer = useCallback(() => setViewerOpen(false), []);

  const updateJob = useCallback(
    (
      jobId: string,
      patch: Partial<StudioJobItem> | ((prev: StudioJobItem) => StudioJobItem)
    ) => {
      setJobs((prev) =>
        prev.map((job) => {
          if (job.id !== jobId) return job;
          return typeof patch === "function" ? patch(job) : { ...job, ...patch };
        })
      );
    },
    []
  );

  const dismissJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  function normalizeVariants(resp: any): FaceVariant[] {
    const v =
      (Array.isArray(resp?.variants) && resp.variants) ||
      (Array.isArray(resp?.result?.variants) && resp.result.variants) ||
      [];
    return v.filter((x: any) => !!cleanParam(x?.image_url));
  }

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setInlineStatus("Please allow Photos access to use Edit Face.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (result.canceled) return;

    const asset = result.assets?.[0] as any;
    const uri = cleanParam(asset?.uri);
    if (!uri) return;

    const mimeType = cleanParam(asset?.mimeType) || "image/jpeg";
    const fileName = cleanParam(asset?.fileName) || `source-${Date.now()}.jpg`;

    setPickedUri(uri);
    setSourceImageUrl(null);
    setSourceImageAssetId(null);
    setImageSafetyState("checking");
    setImageSafetyReason(null);
    setInlineStatus("Checking image safety…");
    setUploadingSource(true);

    try {
      const safety = await apiCheckFaceSourceImageSafety({
        localUri: uri,
        mimeType,
        fileName,
      });

      const allow = safety?.allow === true;

      if (!allow) {
        const reason =
          cleanParam(safety?.reason) ||
          "This image did not pass desifaces.ai content safety checks. Please choose another photo.";

        setImageSafetyState("blocked");
        setImageSafetyReason(reason);
        setPickedUri(null);
        setSourceImageUrl(null);
        setSourceImageAssetId(null);
        setInlineStatus(reason);
        return;
      }

      setImageSafetyState("passed");
      setImageSafetyReason(null);
      setInlineStatus("Image passed content safety. Uploading source image…");

      const up = await apiUploadSourceImage(uri, { mimeType, fileName });
      const nextUrl = cleanParam(up?.image_url);
      const nextAssetId = cleanParam(up?.asset_id);

      if (!nextUrl) {
        setImageSafetyState("error");
        setImageSafetyReason("Upload completed but source image URL was missing.");
        setSourceImageUrl(null);
        setSourceImageAssetId(null);
        setInlineStatus("Upload completed but source image URL was missing.");
        return;
      }

      setSourceImageUrl(nextUrl);
      setSourceImageAssetId(nextAssetId || null);
      setInlineStatus("Source image ready. Refreshing estimate…");
    } catch (e: any) {
      const message =
        cleanParam(e?.message) ||
        "Image safety validation failed. Please try again with another photo.";

      setImageSafetyState("error");
      setImageSafetyReason(message);
      setPickedUri(null);
      setSourceImageUrl(null);
      setSourceImageAssetId(null);
      setInlineStatus(message);
    } finally {
      setUploadingSource(false);
    }
  };

  const selectVariantIndex = useCallback(
    (index: number) => {
      if (uiLocked) return;
      const v = variants[index];
      const url = cleanParam(v?.image_url);
      if (!url) return;

      if (selectedIdx != null && selectedIdx !== index) {
        resetCreatorFlow();
      }

      setSelectedIdx(index);
      setFaceSelection({
        sasUrl: url,
        artifactId: v.artifact_id ?? undefined,
        mediaAssetId: v.media_asset_id ?? undefined,
        variantIndex: index,
        gender,
      } as any);
    },
    [uiLocked, variants, selectedIdx, resetCreatorFlow, setFaceSelection, gender]
  );

  const launchPolling = useCallback(
    async (jobId: string, cycle: number = 0) => {
      let longRunningTimer: ReturnType<typeof setTimeout> | null = null;

      try {
        longRunningTimer = setTimeout(() => {
          updateJob(jobId, (prev) => {
            if (prev.stage === "succeeded" || prev.stage === "failed") return prev;
            return {
              ...prev,
              backgrounded: true,
              message: "Still generating in the background.",
            };
          });
          setBackgroundNotice(
            "Still generating in the background. Image, audio, and video jobs can take a little longer."
          );
        }, 15_000);

        for (let i = 0; i < 120; i++) {
          if (pollingCancelledRef.current) return;

          const last = await apiGetFaceJobStatus(jobId);
          const stage = stageFromStatus(last?.status);
          const nextVars = stage === "succeeded" ? normalizeVariants(last) : [];
          const pricingLabel = pickPricingLabel(last);

          updateJob(jobId, (prev) => ({
            ...prev,
            stage,
            progress: nextProgress(prev.progress, stage),
            resultReady: stage === "succeeded",
            resultCount: nextVars.length || prev.resultCount,
            pricingLabel: pricingLabel ?? prev.pricingLabel,
            message:
              stage === "queued"
                ? "Queued…"
                : stage === "running"
                  ? prev.backgrounded
                    ? "Generating in background…"
                    : "Generating…"
                  : stage === "finalizing"
                    ? "Finalizing…"
                    : stage === "succeeded"
                      ? "Ready"
                      : stage === "failed"
                        ? String(last?.error ?? "Job failed.")
                        : prev.message,
          }));

          if (stage === "succeeded") {
            const finalVars = normalizeVariants(last);
            if (!finalVars.length) {
              updateJob(jobId, { stage: "failed", message: "Succeeded but missing variants." });
              return;
            }

            setVariants(finalVars);
            setSelectedIdx(0);
            setResultsJobId(jobId);
            setFinalPricingLabel(pricingLabel ?? null);
            setFinalPricingState(
              (
                String(last?.pricing?.state ?? "").toLowerCase() === "released"
                  ? "released"
                  : String(last?.pricing?.state ?? "").toLowerCase() === "committed"
                    ? "committed"
                    : "estimated"
              ) as any
            );
            setFinalPricingMessage(pickFinalPricingMessage(last));
            setInlineStatus("Done. Open the result or choose a variant below.");
            setFaceSelection({
              sasUrl: cleanParam(finalVars[0]?.image_url),
              artifactId: finalVars[0]?.artifact_id ?? undefined,
              mediaAssetId: finalVars[0]?.media_asset_id ?? undefined,
              variantIndex: 0,
              gender,
            } as any);
            return;
          }

          if (stage === "failed") {
            setFinalPricingMessage(pickFinalPricingMessage(last));
            setInlineStatus(String(last?.error ?? "Generate failed."));
            return;
          }

          await new Promise((r) => setTimeout(r, 1200));
        }

        if (cycle < 4) {
          updateJob(jobId, {
            stage: "running",
            backgrounded: true,
            message: "Still rendering. We’ll keep checking in the background.",
          });
          setInlineStatus("Your face is still rendering. You can keep using the app while we continue checking.");
          await new Promise((r) => setTimeout(r, 4000));
          return launchPolling(jobId, cycle + 1);
        }

        updateJob(jobId, {
          stage: "failed",
          message: "This run took longer than expected. Please reopen it from Jobs in a moment.",
        });
        setInlineStatus("This face is taking longer than usual. Please reopen it from Jobs in a moment.");
      } catch (e: any) {
        updateJob(jobId, {
          stage: "failed",
          message: e?.message ?? "Polling failed.",
        });
        setInlineStatus(e?.message ?? "Generate failed.");
      } finally {
        if (longRunningTimer) clearTimeout(longRunningTimer);
      }
    },
    [updateJob, setFaceSelection, gender]
  );

  const generate = async () => {
    if (!canGenerate || creatingJob) return;

    if (mode === "image-to-image" && imageSafetyState === "checking") {
      setInlineStatus("Image safety check is still running. Please wait a moment.");
      return;
    }

    if (mode === "image-to-image" && imageSafetyState !== "passed") {
      setInlineStatus(
        imageSafetyReason || "Please choose a source image that passes content safety."
      );
      return;
    }

    if (!pricingConfirmation?.quote_id) {
      setInlineStatus("Pricing preview is not ready yet. Please wait a moment and try again.");
      return;
    }

    resetCreatorFlow();
    closeViewer();
    setFinalPricingLabel(null);
    setFinalPricingState("estimated");
    setFinalPricingMessage(null);
    setInlineStatus("Creating job…");
    setCreatingJob(true);

    try {
      const req: any = {
        mode,
        num_variants: numVariants,
        user_prompt: prompt.trim(),
        gender,
        region_code: regionCode,
        context_code: contextCode ?? undefined,
        use_case: useCaseCode ?? undefined,
        shot_type_code: shotTypeCode ?? undefined,
        aspect_ratio: aspectRatio,
        source_image_url: mode === "image-to-image" ? sourceImageUrl : null,
        source_image_asset_id: mode === "image-to-image" ? sourceImageAssetId : null,
        preservation_strength: mode === "image-to-image" ? preservationStrength : undefined,
      };

      const created = await apiCreateFaceJob(req, pricingConfirmation);
      const id = created?.job_id;
      if (!id) throw new Error("No job_id returned.");

      const newJob: StudioJobItem = {
        id,
        kind: "face",
        title: mode === "image-to-image" ? "Edit Face" : "Create Face",
        stage: "queued",
        progress: 0.12,
        message: "Queued…",
        startedAt: Date.now(),
        backgrounded: false,
        resultReady: false,
        pricingLabel: pricing?.estimateLabel,
      };

      setJobs((prev) => [newJob, ...prev]);
      setInlineStatus("Job started. You can keep creating while it runs.");
      launchPolling(id);
    } catch (e: any) {
      setInlineStatus(e?.message ?? "Generate failed.");
    } finally {
      setCreatingJob(false);
    }
  };

  const selectedVariant = selectedIdx != null ? variants[selectedIdx] : null;

  const proceedToAudio = useCallback(
    async (vOverride?: FaceVariant, idxOverride?: number) => {
      if (uiLocked) return;

      const v = vOverride ?? selectedVariant;
      const idx = typeof idxOverride === "number" ? idxOverride : selectedIdx;
      const imageUrl = cleanParam(v?.image_url);
      const faceArtifactId = cleanParam(v?.artifact_id);
      if (!imageUrl) return;
      if (!faceArtifactId) {
        setInlineStatus("This face is not ready to continue yet. Please choose another saved face.");
        return;
      }

      try {
        setUiLocked(true);

        if (selectedIdx != null && idx != null && idx !== selectedIdx) {
          resetCreatorFlow();
        }

        setSelectedIdx(idx ?? 0);

        setFaceSelection({
          sasUrl: imageUrl,
          artifactId: v?.artifact_id ?? undefined,
          mediaAssetId: v?.media_asset_id ?? undefined,
          variantIndex: idx ?? undefined,
          gender,
        } as any);

        setFusionSettings?.({
          fusionAspectRatio: aspectRatio,
        } as any);

        await saveCreateFlowContext({
          image_url: imageUrl,
          face_artifact_id: faceArtifactId || undefined,
          face_profile_id: v?.face_profile_id ?? undefined,
          media_asset_id: v?.media_asset_id ?? undefined,
          gender,
          aspect_ratio: aspectRatio,
        } as any);

        router.push({
          pathname: "/(tabs)/audio",
          params: {
            face_image_url: imageUrl,
            face_sas_url: imageUrl,
            image_url: imageUrl,
            face_artifact_id: faceArtifactId ?? "",
            face_media_asset_id: v?.media_asset_id ?? "",
            face_profile_id: v?.face_profile_id ?? "",
            gender,
            aspect_ratio: aspectRatio,
            stage: "face_done",
          },
        } as any);
      } finally {
        setUiLocked(false);
      }
    },
    [uiLocked, selectedVariant, selectedIdx, resetCreatorFlow, setFaceSelection, setFusionSettings, gender, aspectRatio]
  );

  const openReadyJob = useCallback((job: StudioJobItem) => {
    if (job.kind !== "face" || !job.resultReady) return;

    if (job.id === resultsJobId && variants.length > 0) {
      const idx = selectedIdx ?? 0;
      const v = variants[idx] ?? variants[0];
      const uri = cleanParam(v?.image_url);
      if (uri) {
        openViewer(uri, `Variant ${(idx ?? 0) + 1}`, idx ?? 0);
        return;
      }
    }

    setInlineStatus("Result is ready below. Pick a face and continue to Audio Studio.");
  }, [resultsJobId, variants, selectedIdx, openViewer]);

  const openPlanScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "manage",
          source: "face",
          plan: pricing?.planLabel ?? "",
          availability: pricing?.availableLabel ?? "",
          settlement: pricing?.settlementLabel ?? "",
        },
      } as any);
    } catch {
      router.push("/(tabs)/dashboard" as any);
    }
  }, [pricing?.availableLabel, pricing?.planLabel, pricing?.settlementLabel]);

  const openUpgradeScreen = useCallback(() => {
    try {
      router.push({
        pathname: "/(tabs)/billing" as any,
        params: {
          intent: "upgrade",
          source: "face",
          plan: pricing?.planLabel ?? "",
          availability: pricing?.availableLabel ?? "",
          settlement: pricing?.settlementLabel ?? "",
        },
      } as any);
    } catch {
      openPlanScreen();
    }
  }, [openPlanScreen, pricing?.availableLabel, pricing?.planLabel, pricing?.settlementLabel]);

  const waitingForEstimate =
    canGenerate &&
    !pricingReady &&
    hasValidI2ISource;

  const generateDisabled =
    !canGenerate ||
    waitingForEstimate ||
    creatingJob ||
    uploadingSource ||
    mdLoading ||
    !!mdErr ||
    !!pricing?.insufficientBalance ||
    (mode === "image-to-image" && imageSafetyState === "checking") ||
    (mode === "image-to-image" && imageSafetyState !== "passed");

  const previewPendingMessage =
    mode === "image-to-image" && imageSafetyState === "checking"
      ? "Checking your source photo for content safety…"
      : mode === "image-to-image" && imageSafetyState === "blocked"
        ? imageSafetyReason || "This source photo did not pass content safety."
        : mode === "image-to-image" && imageSafetyState === "error"
          ? imageSafetyReason || "Image safety validation failed. Please choose another photo."
          : mode === "image-to-image" && !sourceImageUrl && !sourceImageAssetId
            ? "Upload a source photo that passes content safety to unlock the estimate and enable Generate."
            : canGenerate &&
              !pricingReady &&
              pricingQ.isFetching
                ? "Refreshing estimate for your current setup…"
                : canGenerate &&
                  !pricingReady &&
                  !creatingJob &&
                  !mdLoading &&
                  !mdErr
                    ? "We’re still preparing the estimate for this edit. Please wait a moment."
                    : null;

  const imageSafetyBanner =
    mode !== "image-to-image"
      ? null
      : imageSafetyState === "checking"
        ? {
            tone: "info" as const,
            title: "Checking image safety",
            message: "We’re validating your source photo before upload.",
          }
        : imageSafetyState === "passed"
          ? {
              tone: "success" as const,
              title: "Passed content safety",
              message: "This source photo is approved for Edit Face.",
            }
          : imageSafetyState === "blocked"
            ? {
                tone: "error" as const,
                title: "Blocked by content safety",
                message:
                  imageSafetyReason ||
                  "This source photo did not pass DesiFaces content safety checks.",
              }
            : imageSafetyState === "error"
              ? {
                  tone: "error" as const,
                  title: "Safety validation failed",
                  message:
                    imageSafetyReason ||
                    "We couldn’t validate this image. Please try another photo.",
                }
              : {
                  tone: "neutral" as const,
                  title: "Source photo required",
                  message: "Only photos that pass content safety can be used for Edit Face.",
                };

  const selectedVariantUri = cleanParam(selectedVariant?.image_url);

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <DFHeader
        subtitle="Face Studio"
        onMenuPress={() => router.push("/(tabs)/dashboard" as any)}
        onPressMeta={openPlanScreen}
      />
      <Stepper step={1} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 180 }}
      >
        <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 10 }}>
          <PricingTopBar
            studioName="Face Studio"
            estimate={finalPricingLabel ?? pricing?.estimateLabel ?? (pricingQ.isFetching ? "Refreshing estimate…" : "Enter prompt to see estimate")}
            walletAfterRun={pricing?.availableLabel ?? undefined}
            planName={pricing?.planLabel ?? undefined}
            includedUsageLeft={pricing?.availableLabel ?? undefined}
            availabilityLabel={pricing?.availableLabel ?? undefined}
            settlementLabel={pricing?.settlementLabel ?? "Estimate shown before the run. Final pricing is confirmed after completion."}
            entitlementLabel={pricing?.detailLabel ?? `${numVariants} variants${shotTypeCode ? ` • ${shotTypeLabel}` : ""}`}
            onPressBreakdown={undefined}
            onPressManagePlan={openPlanScreen}
          />

          <GlassCard>
            <SectionTitle
              title="Create your next face"
              subtitle="Premium creator-quality faces designed for Audio and Fusion."
            />

            <View style={{ marginTop: 12 }}>
              <Segmented
                value={mode}
                disabled={uiLocked}
                onChange={(m) => {
                  setMode(m);
                  setInlineStatus(null);
                }}
              />
            </View>
          </GlassCard>

          <GlassCard>
            <SectionTitle
              title="Creative setup"
              subtitle="Use compact controls to shape location, framing, and intent."
            />

            <View
              style={{
                marginTop: 12,
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <SelectorChip label="Country" value={COUNTRY_LABEL} disabled />
              <SelectorChip
                label="Region"
                value={mdLoading ? "Loading…" : regionLabel}
                onPress={() => setOpenZone(true)}
                disabled={uiLocked || mdLoading || zoneOptions.length === 0}
              />
              <SelectorChip
                label="State"
                value={mdLoading ? "Loading…" : stateLabel}
                onPress={() => setOpenRegion(true)}
                disabled={uiLocked || mdLoading || regionOptions.length === 0}
              />
              <SelectorChip
                label="Image Type"
                value={shotTypeLabel}
                onPress={() => setOpenShotType(true)}
                disabled={uiLocked}
              />
              <SelectorChip
                label="Use Case"
                value={mdLoading ? "Loading…" : useCaseLabel}
                onPress={() => setOpenUseCase(true)}
                disabled={uiLocked || mdLoading || useCaseOptions.length === 0}
              />
              <SelectorChip
                label="Context"
                value={mdLoading ? "Loading…" : contextLabel}
                onPress={() => setOpenContext(true)}
                disabled={uiLocked || mdLoading || contextOptions.length === 0}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Aspect Ratio</Text>
              <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 4, fontSize: 12 }}>
                Pick the frame you want to carry forward into Audio and Fusion.
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                {(["9:16", "1:1", "16:9"] as const).map((ratio) => {
                  const active = aspectRatio === ratio;
                  return (
                    <Pressable
                      key={ratio}
                      onPress={() => setAspectRatio(ratio)}
                      disabled={uiLocked}
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        paddingVertical: 12,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: active ? "rgba(248,184,72,0.40)" : "rgba(255,255,255,0.10)",
                        backgroundColor: active ? "rgba(232,152,56,0.18)" : "rgba(255,255,255,0.05)",
                        opacity: uiLocked ? 0.75 : 1,
                      }}
                    >
                      <Text style={{ color: active ? "rgba(248,232,136,1)" : DF.text, fontWeight: "900" }}>{ratio}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {!!mdErr && (
              <View
                style={{
                  marginTop: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(255,120,120,0.22)",
                  backgroundColor: "rgba(255,120,120,0.08)",
                  padding: 12,
                }}
              >
                <Text style={{ color: "rgba(255,220,220,0.96)", fontWeight: "900", fontSize: 12 }}>
                  Masterdata failed
                </Text>
                <Text style={{ color: "rgba(255,200,200,0.86)", fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                  {mdErr}
                </Text>

                <Pressable
                  onPress={() => mdQ.refetch()}
                  disabled={uiLocked}
                  style={{
                    marginTop: 10,
                    height: 40,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>Retry</Text>
                </Pressable>
              </View>
            )}
          </GlassCard>

          <GlassCard>
            <SectionTitle
              title={mode === "text-to-image" ? "Creative brief" : "Edit brief"}
              subtitle={
                mode === "text-to-image"
                  ? "Describe the look, vibe, styling, lighting, and scene."
                  : "Keep the same person, then describe what should change."
              }
            />

            <View
              style={{
                marginTop: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: DF.border,
                backgroundColor: "rgba(0,0,0,0.24)",
                padding: 12,
              }}
            >
              <TextInput
                value={prompt}
                onChangeText={setPrompt}
                placeholder={
                  mode === "text-to-image"
                    ? "Luxury editorial portrait, elegant Indian outfit, soft golden-hour light, clean premium background…"
                    : "Same person, premium editorial styling, refined outfit, cinematic lighting, upscale background…"
                }
                placeholderTextColor="rgba(248,216,104,0.35)"
                multiline
                editable={!uiLocked && !creatingJob}
                style={{
                  color: DF.text,
                  fontWeight: "700",
                  minHeight: 104,
                  textAlignVertical: "top",
                }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <Pressable
                onPress={() => setGender("female")}
                disabled={uiLocked}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: gender === "female" ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.04)",
                  opacity: uiLocked ? 0.75 : 1,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>Female</Text>
              </Pressable>

              <Pressable
                onPress={() => setGender("male")}
                disabled={uiLocked}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  paddingVertical: 12,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  backgroundColor: gender === "male" ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.04)",
                  opacity: uiLocked ? 0.75 : 1,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>Male</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 12 }}>
              <VariantsControl value={numVariants} onChange={setNumVariants} disabled={uiLocked} />
            </View>
          </GlassCard>

          {mode === "image-to-image" && (
            <GlassCard>
              <SectionTitle
                title="Identity lock"
                subtitle="Upload a source photo and tune how closely the result follows it."
              />

              <Pressable
                onPress={pickImage}
                disabled={uiLocked || creatingJob || imageSafetyState === "checking"}
                style={{
                  marginTop: 12,
                  height: 46,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(248,184,72,0.35)",
                  backgroundColor: "rgba(232,152,56,0.18)",
                  opacity: uiLocked || imageSafetyState === "checking" ? 0.75 : 1,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>
                  {uploadingSource
                    ? imageSafetyState === "checking"
                      ? "Checking Safety…"
                      : "Uploading…"
                    : pickedUri || sourceImageUrl
                      ? "Change Source Photo"
                      : "Upload Source Photo"}
                </Text>
              </Pressable>

              <View
                style={{
                  marginTop: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor:
                    imageSafetyBanner?.tone === "success"
                      ? "rgba(120,255,180,0.20)"
                      : imageSafetyBanner?.tone === "error"
                        ? "rgba(255,120,120,0.24)"
                        : imageSafetyBanner?.tone === "info"
                          ? "rgba(120,180,255,0.20)"
                          : "rgba(255,255,255,0.10)",
                  backgroundColor:
                    imageSafetyBanner?.tone === "success"
                      ? "rgba(120,255,180,0.08)"
                      : imageSafetyBanner?.tone === "error"
                        ? "rgba(255,120,120,0.08)"
                        : imageSafetyBanner?.tone === "info"
                          ? "rgba(120,180,255,0.08)"
                          : "rgba(255,255,255,0.04)",
                  padding: 12,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>
                  {imageSafetyBanner?.title}
                </Text>
                <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                  {imageSafetyBanner?.message}
                </Text>
              </View>

              {!!(pickedUri || sourceImageUrl) && (
                <View
                  style={{
                    marginTop: 12,
                    borderRadius: 14,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: DF.border,
                    backgroundColor: BG2,
                    height: 240,
                  }}
                >
                  <Image
                    source={{ uri: pickedUri ?? sourceImageUrl ?? "" }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="contain"
                    contentPosition="center"
                  />
                </View>
              )}

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Identity strength</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 4, fontSize: 12 }}>
                  Lower = more creative change. Higher = closer to the source photo.
                </Text>

                <View style={{ marginTop: 8 }}>
                  <Slider
                    minimumValue={0}
                    maximumValue={1}
                    value={preservationStrength}
                    onValueChange={setPreservationStrength}
                    disabled={uiLocked || imageSafetyState === "checking"}
                  />
                  <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                    preservation_strength: {preservationStrength.toFixed(2)} (recommended 0.15–0.35)
                  </Text>
                </View>
              </View>
            </GlassCard>
          )}

          {!!previewPendingMessage && (
            <GlassCard style={{ padding: 12 }}>
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>
                {previewPendingMessage}
              </Text>
            </GlassCard>
          )}

          {!!pricing?.insufficientBalance && (
            <GlassCard
              style={{
                padding: 12,
                borderColor: "rgba(255,180,90,0.30)",
                backgroundColor: "rgba(255,180,90,0.10)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>Not enough credits</Text>
              <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                This face run needs more available usage than your current included balance or wallet supports.
              </Text>
              <Pressable
                onPress={openUpgradeScreen}
                style={{
                  marginTop: 10,
                  borderRadius: 14,
                  paddingVertical: 10,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.12)",
                  backgroundColor: "rgba(255,255,255,0.06)",
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900" }}>Upgrade or Top Up</Text>
              </Pressable>
            </GlassCard>
          )}

          <Pressable
            onPress={generate}
            disabled={generateDisabled}
            style={{
              borderRadius: 18,
              paddingVertical: 15,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(248,184,72,0.35)",
              backgroundColor: !generateDisabled ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.06)",
              shadowColor: "#000",
              shadowOpacity: Platform.OS === "ios" ? 0.18 : 0,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 8 },
              elevation: 2,
            }}
          >
            {creatingJob ? (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <ActivityIndicator />
                <Text style={{ color: DF.text, fontWeight: "900" }}>Starting job…</Text>
              </View>
            ) : (
              <Text style={{ color: DF.text, fontWeight: "900", fontSize: 15 }}>
                {pricing?.estimateLabel ? `Create Face — ${pricing.estimateLabel}` : "Create Face"}
              </Text>
            )}
          </Pressable>

          {!!inlineStatus && (
            <GlassCard style={{ padding: 12 }}>
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>{inlineStatus}</Text>
            </GlassCard>
          )}

          {!!backgroundNotice && (
            <GlassCard
              style={{
                padding: 12,
                borderColor: "rgba(248,184,72,0.22)",
                backgroundColor: "rgba(232,152,56,0.10)",
              }}
            >
              <Text style={{ color: DF.text, fontWeight: "800", fontSize: 12 }}>{backgroundNotice}</Text>
            </GlassCard>
          )}

          {variants.length > 0 && (
            <GlassCard style={{ padding: 0, overflow: "hidden" }}>
              <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
                <SectionTitle
                  title="Results"
                  subtitle="Swipe through premium variants, open them full-screen, then continue to Audio Studio."
                  right={
                    <Pressable
                      onPress={() => {
                        const idx = selectedIdx ?? 0;
                        const v = variants[idx] ?? variants[0];
                        const uri = cleanParam(v?.image_url);
                        if (uri) openViewer(uri, `Variant ${idx + 1}`, idx);
                      }}
                      disabled={uiLocked || variants.length === 0}
                      style={{
                        height: 36,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: "rgba(248,184,72,0.28)",
                        backgroundColor: "rgba(232,152,56,0.12)",
                      }}
                    >
                      <Text style={{ color: "rgba(248,232,136,0.95)", fontWeight: "900", fontSize: 12 }}>
                        Open Result
                      </Text>
                    </Pressable>
                  }
                />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 }}
              >
                {variants.map((item, index) => {
                  const active = selectedIdx === index;
                  const uri = cleanParam(item?.image_url);

                  return (
                    <Pressable
                      key={item?.media_asset_id?.toString?.() || item?.face_profile_id?.toString?.() || item?.image_url || String(index)}
                      onPress={() => selectVariantIndex(index)}
                      disabled={uiLocked}
                      style={{
                        width: variantCardWidth,
                        marginRight: 12,
                        borderRadius: 20,
                        overflow: "hidden",
                        borderWidth: 2,
                        borderColor: active ? "rgba(248,184,72,0.55)" : "rgba(255,255,255,0.10)",
                        backgroundColor: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <View style={{ height: Math.round(variantCardWidth * 1.16), backgroundColor: BG2 }}>
                        {!!uri ? (
                          <>
                            <Image
                              source={{ uri }}
                              style={{ width: "100%", height: "100%" }}
                              contentFit="contain"
                              contentPosition="center"
                              transition={180}
                            />

                            <Pressable
                              onPress={() => openViewer(uri, `Variant ${index + 1}`, index)}
                              disabled={uiLocked}
                              hitSlop={10}
                              style={{
                                position: "absolute",
                                top: 12,
                                right: 12,
                                width: 36,
                                height: 36,
                                borderRadius: 12,
                                alignItems: "center",
                                justifyContent: "center",
                                borderWidth: 1,
                                borderColor: "rgba(255,255,255,0.18)",
                                backgroundColor: "rgba(0,0,0,0.35)",
                              }}
                            >
                              <Text style={{ color: "rgba(255,255,255,0.92)", fontWeight: "900", fontSize: 14 }}>⤢</Text>
                            </Pressable>
                          </>
                        ) : (
                          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ color: DF.muted, fontWeight: "800" }}>No image</Text>
                          </View>
                        )}
                      </View>

                      <View
                        style={{
                          padding: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>
                          Variant {index + 1}
                        </Text>

                        {active && (
                          <View
                            style={{
                              paddingVertical: 4,
                              paddingHorizontal: 10,
                              borderRadius: 999,
                              borderWidth: 1,
                              borderColor: "rgba(248,184,72,0.55)",
                              backgroundColor: "rgba(232,152,56,0.18)",
                            }}
                          >
                            <Text style={{ color: "rgba(248,232,136,1)", fontWeight: "900", fontSize: 12 }}>
                              Selected
                            </Text>
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={{ padding: 14, paddingTop: 10 }}>
                {selectedIdx != null && !cleanParam(selectedVariant?.artifact_id) && (
                  <View
                    style={{
                      marginBottom: 10,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: "rgba(255,180,90,0.30)",
                      backgroundColor: "rgba(255,180,90,0.10)",
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: DF.text, fontWeight: "900", fontSize: 12 }}>Face artifact required</Text>
                    <Text style={{ color: DF.muted, fontWeight: "800", marginTop: 6, fontSize: 12 }}>
                      This face is ready to preview, but it is not ready to continue yet. Please choose another saved face.
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={() => proceedToAudio()}
                  disabled={selectedIdx == null || uiLocked || !cleanParam(selectedVariant?.artifact_id)}
                  style={{
                    height: 52,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(248,184,72,0.35)",
                    backgroundColor: selectedIdx != null ? "rgba(232,152,56,0.22)" : "rgba(255,255,255,0.06)",
                    opacity: uiLocked || !cleanParam(selectedVariant?.artifact_id) ? 0.85 : 1,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>
                    Continue to Audio
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setWorkflowSummaryOpen(true)}
                  disabled={selectedIdx == null || uiLocked || !cleanParam(selectedVariant?.artifact_id)}
                  style={{
                    marginTop: 10,
                    height: 48,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                    opacity: uiLocked ? 0.85 : 1,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Finish with Face</Text>
                </Pressable>
              </View>
            </GlassCard>
          )}
        </View>
      </ScrollView>

      <SelectModal
        open={openZone}
        title="Select Region"
        items={zoneOptions}
        selectedCode={zoneCode}
        onClose={() => setOpenZone(false)}
        onSelect={(x) => setZoneCode(x.code)}
      />
      <SelectModal
        open={openRegion}
        title="Select State"
        items={regionOptions}
        selectedCode={regionCode}
        onClose={() => setOpenRegion(false)}
        onSelect={(x) => setRegionCode(x.code)}
      />
      <SelectModal
        open={openUseCase}
        title="Select Use Case"
        items={useCaseOptions}
        selectedCode={useCaseCode}
        onClose={() => setOpenUseCase(false)}
        onSelect={(x) => setUseCaseCode(x.code)}
      />
      <SelectModal
        open={openContext}
        title="Select Context"
        items={contextOptions}
        selectedCode={contextCode}
        onClose={() => setOpenContext(false)}
        onSelect={(x) => setContextCode(x.code)}
      />
      <SelectModal
        open={openShotType}
        title="Select Image Type"
        items={SHOT_TYPE_OPTIONS}
        selectedCode={shotTypeCode}
        onClose={() => setOpenShotType(false)}
        onSelect={(x) => setShotTypeCode(x.code)}
      />

      <ImageViewerModal
        open={viewerOpen}
        uri={viewerUri}
        title={viewerTitle}
        canSelect={viewerIndex != null}
        onBackToVariants={closeViewer}
        onSelectThis={() => {
          if (viewerIndex == null) return;
          const v = variants[viewerIndex];
          closeViewer();
          proceedToAudio(v, viewerIndex);
        }}
      />

      <Modal
        visible={workflowSummaryOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setWorkflowSummaryOpen(false)}
      >
        <Pressable
          onPress={() => setWorkflowSummaryOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.78)",
          }}
        />
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            padding: 18,
          }}
        >
          <ScrollView
            style={{ maxHeight: "84%" }}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={{
                borderRadius: 24,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                backgroundColor: BG2,
                padding: 16,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 18 }}>Face session summary</Text>
                <Pressable
                  onPress={() => setWorkflowSummaryOpen(false)}
                  hitSlop={10}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 12,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900", fontSize: 16 }}>×</Text>
                </Pressable>
              </View>
              <Text style={{ color: DF.muted, fontWeight: "700", marginTop: 6, fontSize: 12 }}>
                Your face is ready. You can stop here for now or continue into Audio Studio later.
              </Text>

              {!!selectedVariantUri && (
                <View
                  style={{
                    marginTop: 14,
                    borderRadius: 18,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                    backgroundColor: "rgba(0,0,0,0.22)",
                  }}
                >
                  <Image
                    source={{ uri: selectedVariantUri }}
                    style={{ width: "100%", height: 320 }}
                    contentFit="contain"
                  />
                </View>
              )}

              <View
                style={{
                  marginTop: 14,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "rgba(248,184,72,0.18)",
                  backgroundColor: "rgba(248,184,72,0.08)",
                  padding: 12,
                  gap: 8,
                }}
              >
                <Text style={{ color: DF.text, fontWeight: "900", fontSize: 13 }}>What’s ready</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Selected face image saved for this workflow</Text>
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>• Plan: {pricing?.planLabel ?? "Creator / Pro"}</Text>
                {!!(finalPricingLabel ?? pricing?.estimateLabel) && (
                  <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                    • Pricing: {finalPricingLabel ?? pricing?.estimateLabel}
                  </Text>
                )}
                <Text style={{ color: DF.muted, fontWeight: "700", fontSize: 12 }}>
                  • Next step available: Audio Studio voice creation
                </Text>
              </View>

              <View style={{ marginTop: 16 }}>
                <RunReceiptCard
                  pricing={{ ...(pricing as any), stage: finalPricingState as any, reservationId: pricingConfirmation?.quote_id } as any}
                  pricingSummary={{
                    estimateLabel: pricing?.estimateLabel,
                    finalLabel: finalPricingLabel ?? pricing?.estimateLabel,
                    message:
                      finalPricingMessage ??
                      (pricing?.preview
                        ? "Preview estimate shown until the service returns the final pricing snapshot."
                        : "Final pricing details appear after generation completes."),
                  } as any}
                />
                <View style={{ marginTop: 10 }}>
                  <JobPricingTimeline stage={finalPricingState as any} />
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Pressable
                  onPress={() => setWorkflowSummaryOpen(false)}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(255,255,255,0.05)",
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Done for now</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setWorkflowSummaryOpen(false);
                    proceedToAudio();
                  }}
                  disabled={selectedIdx == null || uiLocked}
                  style={{
                    flex: 1,
                    height: 48,
                    borderRadius: 14,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: "rgba(248,184,72,0.35)",
                    backgroundColor: "rgba(232,152,56,0.22)",
                    opacity: uiLocked ? 0.85 : 1,
                  }}
                >
                  <Text style={{ color: DF.text, fontWeight: "900" }}>Go to Audio</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <GlobalJobsTray
        jobs={jobs}
        onDismissJob={dismissJob}
        onOpenJob={openReadyJob}
      />

      <DFBlockingOverlay
        visible={uiLocked}
        title="Opening Audio Studio…"
        message="Locking your selected face and moving to the next step."
      />
    </View>
  );
}