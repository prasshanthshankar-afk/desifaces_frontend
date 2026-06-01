import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

const AGREEMENT_SECTIONS = [
  {
    title: "1. Eligibility",
    body:
      "You must be 18 years of age or older to create an account or use desifaces.ai. By registering, you represent that you are at least 18 and legally able to enter into this agreement.",
  },
  {
    title: "2. Account responsibility",
    body:
      "You are responsible for the accuracy of your registration information, the confidentiality of your credentials, and all activity that occurs through your account.",
  },
  {
    title: "3. Your content and rights",
    body:
      "You must own or have the necessary rights, licenses, and permissions for any text, image, voice, audio, or other materials you upload, submit, reference, or direct desifaces.ai to process.",
  },
  {
    title: "4. Likeness, voice, and identity consent",
    body:
      "You may only upload or generate content using your own likeness or voice, or the likeness or voice of another person where you have their valid, informed, and legally sufficient permission. You must not impersonate, deepfake, mislead, harass, defraud, or violate publicity, privacy, or intellectual-property rights.",
  },
  {
    title: "5. Sensitive and prohibited content",
    body:
      "You may not use desifaces.ai for unlawful, exploitative, abusive, defamatory, fraudulent, sexually explicit, violent, hateful, discriminatory, or deceptive content, including identity fraud or harmful misinformation.",
  },
  {
    title: "6. Privacy and data handling",
    body:
      "desifaces.ai may process account data, uploaded content, prompts, technical logs, and generated outputs to operate, secure, support, improve, and administer the service, subject to applicable law and desifaces.ai legal disclosures then in effect.",
  },
  {
    title: "7. Face and biometric-related processing",
    body:
      "Where applicable law requires a specific notice or express consent for biometric identifiers or biometric information, including scans of face geometry, desifaces.ai will seek the required consent before collecting, using, or storing that information. If you submit content relating to another person, you are responsible for having the authority to do so.",
  },
  {
    title: "8. AI outputs",
    body:
      "AI-generated outputs may be imperfect, incomplete, or unsuitable for your intended use. You are responsible for review, validation, editing, and lawful downstream use of all outputs.",
  },
  {
    title: "9. Suspension and termination",
    body:
      "desifaces.ai may suspend, restrict, or terminate access where necessary to enforce policy, protect users, investigate misuse, comply with law, or maintain service integrity.",
  },
  {
    title: "10. Contact",
    body:
      "Questions about this agreement may be directed through the in-app Contact Us workflow or to support@desifaces.ai.",
  },
];

export default function AgreementScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Agreement</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>desifaces.ai</Text>
        <Text style={styles.title}>Agreement</Text>
        <Text style={styles.subtitle}>Effective date: April 15, 2026</Text>

        {AGREEMENT_SECTIONS.map((section) => (
          <View key={section.title} style={styles.card}>
            <Text style={styles.cardTitle}>{section.title}</Text>
            <Text style={styles.cardBody}>{section.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080808" },
  topBar: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    minWidth: 52,
    minHeight: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: "#FFF7E8", fontWeight: "700" },
  topTitle: { color: "#FFF7E8", fontSize: 16, fontWeight: "800" },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  kicker: { color: "#E89838", fontSize: 13, marginBottom: 8 },
  title: { color: "#FFF7E8", fontSize: 30, fontWeight: "800" },
  subtitle: { color: "rgba(255,247,232,0.72)", fontSize: 14, marginTop: 8, marginBottom: 18 },
  card: {
    backgroundColor: "#121212",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  cardTitle: { color: "#FFF7E8", fontSize: 16, fontWeight: "800" },
  cardBody: { color: "rgba(255,247,232,0.76)", marginTop: 10, lineHeight: 22 },
});