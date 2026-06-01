import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import DFHeader from "../../core/ui/DFHeader";
import { listFaqArticles } from "../../core/api/help";

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

export default function FaqScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const faqQuery = useQuery({
    queryKey: ["help", "faq"],
    queryFn: listFaqArticles,
  });

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = faqQuery.data ?? [];
    if (!q) return base;
    return base.filter((item) =>
      [
        item.title,
        item.summary ?? "",
        item.body_markdown,
        ...(item.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [faqQuery.data, query]);

  return (
    <View style={styles.screen}>
      <DFHeader
        subtitle="faq"
        onMenuPress={() => openGlobalMenu(router)}
        onPressMeta={() => router.push("/pricing/plan-billing")}
      />

      <View style={styles.bodyWrap}>
        <View style={styles.header}>
          <Text style={styles.kicker}>desifaces.ai</Text>
          <Text style={styles.title}>FAQ</Text>
          <Text style={styles.subtitle}>
            Fast answers for setup, pricing, Face, Audio, Fusion, billing, and account help.
          </Text>

          <View style={styles.row}>
            <TextInput
              style={styles.search}
              placeholder="Search FAQs"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={query}
              onChangeText={setQuery}
            />
            <Pressable
              style={styles.secondaryButton}
              onPress={() => router.push("/help/contact" as any)}
            >
              <Text style={styles.secondaryButtonText}>Contact</Text>
            </Pressable>
          </View>
        </View>

        {faqQuery.isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            {items.map((item) => {
              const open = openSlug === item.slug;
              return (
                <Pressable
                  key={item.slug}
                  style={styles.card}
                  onPress={() => setOpenSlug(open ? null : item.slug)}
                >
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  {item.summary ? (
                    <Text style={styles.cardSummary}>{item.summary}</Text>
                  ) : null}
                  {open ? <Text style={styles.cardBody}>{item.body_markdown}</Text> : null}
                </Pressable>
              );
            })}

            {items.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>No matches found</Text>
                <Text style={styles.cardBody}>
                  Try a different search or contact desifaces.ai support.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        )}
      </View>

      <HelpFooterNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080808" },
  bodyWrap: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  kicker: { color: "#E89838", fontSize: 13, marginBottom: 8 },
  title: { color: "#FFF7E8", fontSize: 30, fontWeight: "800" },
  subtitle: {
    color: "rgba(255,247,232,0.72)",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  row: { flexDirection: "row", gap: 10, marginTop: 16 },
  search: {
    flex: 1,
    backgroundColor: "#121212",
    borderRadius: 14,
    color: "#FFF7E8",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 12,
  },
  secondaryButtonText: { color: "#FFF7E8", fontWeight: "700" },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  card: {
    backgroundColor: "#121212",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  cardTitle: { color: "#FFF7E8", fontSize: 16, fontWeight: "700" },
  cardSummary: { color: "rgba(255,247,232,0.7)", marginTop: 8, lineHeight: 20 },
  cardBody: { color: "#FFF7E8", marginTop: 12, lineHeight: 22 },

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