import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import DFHeader from "../../core/ui/DFHeader";

function openGlobalMenu(router: ReturnType<typeof useRouter>) {
  const menuNonce = `${Date.now()}`;
  router.push({
    pathname: "/(tabs)/dashboard" as any,
    params: {
      openMenu: "1",
      menu_nonce: menuNonce,
      menu_source: "about",
    } as any,
  } as any);
}

function AppFooterNav() {
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

const VISION_LINES = [
  "Build desifaces.ai into a trusted identity-first creation platform for face, voice, and video storytelling.",
  "Help creators, founders, brands, and communities produce culturally grounded media with a fast, affordable, production-oriented workflow.",
  "Expand from single-run generation into reusable identity systems, multilingual storytelling, campaign tools, and safer consent-aware publishing.",
  "Raise output quality year over year while keeping trust, consent, transparency, and creator control at the center of the product.",
];

export default function AboutUsScreen() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <DFHeader
        subtitle="about us"
        onMenuPress={() => openGlobalMenu(router)}
        onPressMeta={() => router.push("/pricing/plan-billing")}
      />

      <View style={styles.bodyWrap}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.kicker}>desifaces.ai</Text>
          <Text style={styles.title}>About us</Text>
          <Text style={styles.subtitle}>
            desifaces.ai is an identity-first AI creation platform for face, audio, and video storytelling.
          </Text>

          <Section
            title="What desifaces.ai is building"
            body="desifaces.ai connects face generation, audio creation, and fusion video workflows into one product experience. The platform is designed to make AI media creation feel expressive, creator-led, and practical for real-world storytelling and content production."
          />

          <Section
            title="Founder"
            body="desifaces.ai was founded by Prashanth Shankar, a seasoned enterprise architect with 26+ years of experience building secure, scalable, and modern digital platforms for Fortune 500. Having led AI, cloud, integration, and modernization programs, he brings deep technology leadership and real-world execution experience to the desifaces.ai vision."
          />

          <Section
            title="Why we exist"
            body="Many AI tools are fragmented, generic, or difficult to operationalize across a real workflow. desifaces.ai exists to reduce that friction with a connected product for face, voice, and video generation, clear pricing, better handoff between steps, and a stronger user experience."
          />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Where we want to be in the next 5 years</Text>
            <View style={{ marginTop: 10, gap: 10 }}>
              {VISION_LINES.map((line, idx) => (
                <Text key={idx} style={styles.bullet}>
                  • {line}
                </Text>
              ))}
            </View>
          </View>

          <Section
            title="What matters to us"
            body="The long-term direction for desifaces.ai is shaped by product trust, consent, clear pricing, cultural accuracy, creator ownership, and production-quality workflows. We want desifaces.ai to become a platform people rely on when digital identity and storytelling quality both matter."
          />
        </ScrollView>
      </View>

      <AppFooterNav />
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{body}</Text>
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
    marginBottom: 18,
  },
  card: {
    backgroundColor: "#121212",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  cardTitle: { color: "#FFF7E8", fontSize: 16, fontWeight: "800" },
  cardBody: {
    color: "rgba(255,247,232,0.76)",
    marginTop: 10,
    lineHeight: 22,
  },
  bullet: {
    color: "rgba(255,247,232,0.76)",
    lineHeight: 22,
  },
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