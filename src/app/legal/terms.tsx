import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";

const TERMS_SECTIONS = [
  {
    title: "1. Acceptance of terms",
    body:
      "By accessing or using desifaces.ai, you agree to these Terms & Conditions and any policies incorporated by reference.",
  },
  {
    title: "2. Service scope",
    body:
      "desifaces.ai provides software tools and workflows for AI-assisted media creation, including face, audio, and video generation features, subject to feature availability, pricing, service limits, and policy controls.",
  },
  {
    title: "3. Eligibility and age",
    body:
      "The service is intended only for users 18 years of age or older. Accounts created or used by minors are prohibited.",
  },
  {
    title: "4. Fees, subscriptions, and billing",
    body:
      "Certain features may require credits, a paid plan, postpaid billing, or an active subscription. You agree to pay applicable fees, taxes, renewals, and charges presented at checkout or disclosed in the product at the time of purchase.",
  },
  {
    title: "5. Acceptable use",
    body:
      "You may not use desifaces.ai to violate law, mislead others, impersonate people without authorization, infringe rights, evade safety controls, reverse engineer the service except where legally permitted, or interfere with product security or uptime.",
  },
  {
    title: "6. Intellectual property",
    body:
      "desifaces.ai and its software, branding, interfaces, and service materials are protected by intellectual-property laws. Except for limited use needed to access the service, no rights are granted to you in desifaces.ai intellectual property.",
  },
  {
    title: "7. Third-party services",
    body:
      "desifaces.ai may rely on third-party infrastructure, payment processors, cloud providers, model providers, communications vendors, and other service partners. Availability or performance may depend in part on those services.",
  },
  {
    title: "8. Privacy and disclosures",
    body:
      "You acknowledge that desifaces.ai may process personal data and content in accordance with applicable law and the service disclosures then in effect, including product notices, support communications, and legal policies.",
  },
  {
    title: "9. No warranty",
    body:
      "The service is provided on an as-available and as-provided basis to the maximum extent permitted by law. desifaces.ai does not guarantee uninterrupted availability, error-free outputs, or fitness for every user purpose.",
  },
  {
    title: "10. Limitation of liability",
    body:
      "To the maximum extent permitted by law, desifaces.ai and its affiliates, officers, employees, contractors, and suppliers will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, data, goodwill, or business opportunity.",
  },
  {
    title: "11. Indemnity",
    body:
      "You agree to defend, indemnify, and hold harmless desifaces.ai from claims, damages, liabilities, costs, and expenses arising from your content, your misuse of the service, or your violation of law or these terms.",
  },
  {
    title: "12. Changes",
    body:
      "desifaces.ai may update these terms from time to time. Continued use after an updated effective date constitutes acceptance of the revised terms.",
  },
  {
    title: "13. Contact",
    body:
      "For billing, policy, or legal questions, contact support@desifaces.ai or use the in-app Contact Us experience.",
  },
];

export default function TermsScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.topTitle}>Terms & Conditions</Text>
        <View style={{ width: 52 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>desifaces.ai</Text>
        <Text style={styles.title}>Terms & Conditions</Text>
        <Text style={styles.subtitle}>Effective date: April 15, 2026</Text>

        {TERMS_SECTIONS.map((section) => (
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