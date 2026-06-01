import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import DFHeader from "../../core/ui/DFHeader";
import { DF } from "../../core/theme/colors";
import {
  createSupportContact,
  type SupportPriority,
  type SupportProductArea,
  type SupportTopic,
} from "../../core/api/support";

const TOPICS: SupportTopic[] = [
  "technical_issue",
  "billing_issue",
  "feature_request",
  "account_help",
  "general_question",
];

const PRODUCT_AREAS: SupportProductArea[] = [
  "face",
  "audio",
  "fusion",
  "billing",
  "account",
  "general",
];

const PRIORITY_OPTIONS: Array<{
  value: SupportPriority;
  label: string;
}> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Medium" },
  { value: "high", label: "High" },
];

function openGlobalMenu(router: ReturnType<typeof useRouter>) {
  const menuNonce = `${Date.now()}`;
  router.push({
    pathname: "/(tabs)/dashboard" as any,
    params: {
      openMenu: "1",
      menu_nonce: menuNonce,
      menu_source: "help",
    } as any,
  } as any);
}

function HelpFooterNav() {
  const router = useRouter();
  const items = [
    { key: "dashboard", label: "Home", icon: "home-outline", route: "/(tabs)/dashboard" },
    { key: "face", label: "Face", icon: "person-outline", route: "/(tabs)/face" },
    { key: "audio", label: "Audio", icon: "mic-outline", route: "/(tabs)/audio" },
    { key: "fusion", label: "Fusion", icon: "videocam-outline", route: "/(tabs)/fusion" },
  ] as const;

  return (
    <View style={styles.footerWrap}>
      <View style={styles.footerNav}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            style={styles.footerItem}
            onPress={() => router.replace(item.route as any)}
          >
            <Ionicons
              name={item.icon as any}
              size={19}
              color={"rgba(255,255,255,0.62)"}
              style={{ marginBottom: 2 }}
            />
            <Text style={styles.footerLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function ContactUsScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<SupportTopic>("technical_issue");
  const [productArea, setProductArea] = useState<SupportProductArea>("fusion");
  const [priority, setPriority] = useState<SupportPriority>("normal");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [ackSent, setAckSent] = useState<boolean | null>(null);

  const valid = useMemo(() => {
    return (
      name.trim().length >= 2 &&
      email.includes("@") &&
      subject.trim().length >= 4 &&
      message.trim().length >= 10
    );
  }, [name, email, subject, message]);

  const mutation = useMutation({
    mutationFn: createSupportContact,
    onSuccess: (data) => {
      setRequestId(data.request_id);
      setAckSent(data.ack_sent);
      Alert.alert(
        "Support request submitted",
        data.ack_sent
          ? "Your request was submitted and an acknowledgement email was sent."
          : "Your request was submitted. Email acknowledgement is not available right now, but the support ticket was created successfully."
      );
    },
    onError: (err: any) => {
      Alert.alert("Unable to submit request", err?.message || "Please try again.");
    },
  });

  const onSubmit = () => {
    mutation.mutate({
      name: name.trim(),
      email: email.trim(),
      topic,
      product_area: productArea,
      priority,
      subject: subject.trim(),
      message: message.trim(),
      attachment_urls: [],
      context: {
        source: "mobile_help_contact",
        screen: "contact_us",
      },
    });
  };

  return (
    <View style={styles.screen}>
      <DFHeader
        subtitle="contact support"
        onMenuPress={() => openGlobalMenu(router)}
        onPressMeta={() => router.push("/pricing/plan-billing")}
      />

      <KeyboardAvoidingView
        style={styles.bodyWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.kicker}>desifaces.ai</Text>
          <Text style={styles.title}>Contact Us</Text>
          <Text style={styles.subtitle}>
            Send a support request to desifaces.ai. This screen is wired to the authenticated backend support flow.
          </Text>

          <Field label="Your name" value={name} onChangeText={setName} />
          <Field
            label="Your email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <ChoiceRow
            label="Topic"
            value={topic}
            values={TOPICS}
            onChange={(v) => setTopic(v as SupportTopic)}
          />

          <ChoiceRow
            label="Product area"
            value={productArea}
            values={PRODUCT_AREAS}
            onChange={(v) => setProductArea(v as SupportProductArea)}
          />

          <ChoiceOptionRow
            label="Priority"
            value={priority}
            options={PRIORITY_OPTIONS}
            onChange={(v) => setPriority(v)}
          />

          <Field label="Subject" value={subject} onChangeText={setSubject} />
          <Field
            label="Message"
            value={message}
            onChangeText={setMessage}
            multiline
            minHeight={140}
          />

          <View style={styles.actions}>
            <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>

            <Pressable
              style={[styles.primaryButton, !valid && styles.primaryButtonDisabled]}
              disabled={!valid || mutation.isPending}
              onPress={onSubmit}
            >
              {mutation.isPending ? (
                <ActivityIndicator color="#080808" />
              ) : (
                <Text style={styles.primaryButtonText}>Submit</Text>
              )}
            </Pressable>
          </View>

          {requestId ? (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>Support request created</Text>
              <Text style={styles.successBody}>Request ID: {requestId}</Text>
              <Text style={styles.successBody}>
                Acknowledgement email: {ackSent ? "sent" : "not available"}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <HelpFooterNav />
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline,
  minHeight,
  ...rest
}: any) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          multiline && { minHeight: minHeight ?? 120, textAlignVertical: "top" },
        ]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor="rgba(255,255,255,0.45)"
        {...rest}
      />
    </View>
  );
}

function ChoiceRow({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceWrap}>
        {values.map((item) => {
          const active = value === item;
          return (
            <Pressable
              key={item}
              style={[styles.choiceChip, active && styles.choiceChipActive]}
              onPress={() => onChange(item)}
            >
              <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                {item.replace(/_/g, " ")}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ChoiceOptionRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: SupportPriority) => void;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.choiceWrap}>
        {options.map((item) => {
          const active = value === item.value;
          return (
            <Pressable
              key={item.value}
              style={[styles.choiceChip, active && styles.choiceChipActive]}
              onPress={() => onChange(item.value as SupportPriority)}
            >
              <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080808" },
  bodyWrap: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  kicker: { color: "#E89838", fontSize: 13, marginBottom: 8 },
  title: { color: "#FFF7E8", fontSize: 30, fontWeight: "800" },
  subtitle: {
    color: "rgba(255,247,232,0.72)",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  fieldWrap: { marginBottom: 16 },
  label: { color: "#FFF7E8", fontSize: 14, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: "#121212",
    borderRadius: 14,
    color: "#FFF7E8",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  choiceChipActive: {
    backgroundColor: "rgba(232,152,56,0.18)",
    borderColor: "#E89838",
  },
  choiceChipText: { color: "#FFF7E8", fontSize: 13, textTransform: "capitalize" },
  choiceChipTextActive: { color: "#E89838", fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  primaryButton: {
    flex: 1,
    backgroundColor: "#E89838",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#080808", fontWeight: "800" },
  secondaryButton: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryButtonText: { color: "#FFF7E8", fontWeight: "700" },
  successCard: {
    marginTop: 20,
    backgroundColor: "#121212",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.5)",
  },
  successTitle: { color: "#FFF7E8", fontSize: 16, fontWeight: "800" },
  successBody: { color: "rgba(255,247,232,0.76)", marginTop: 8 },

  footerWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 14,
    backgroundColor: "#080808",
  },
  footerNav: {
    minHeight: 64,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  footerItem: {
    minWidth: 64,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  footerLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: "700",
  },
});