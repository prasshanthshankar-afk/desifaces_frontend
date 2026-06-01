import React from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import DFHeader from "../../core/ui/DFHeader";
import { listHelpCategories, listFaqArticles } from "../../core/api/help";
import { listSupportRequests } from "../../core/api/support";

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

export default function HelpCenterScreen() {
  const router = useRouter();

  const categoriesQuery = useQuery({
    queryKey: ["help", "categories"],
    queryFn: listHelpCategories,
  });

  const faqQuery = useQuery({
    queryKey: ["help", "faq-preview"],
    queryFn: listFaqArticles,
  });

  const requestsQuery = useQuery({
    queryKey: ["support", "requests", "preview"],
    queryFn: () => listSupportRequests({ limit: 5, offset: 0 }),
  });

  const loading =
    categoriesQuery.isLoading || faqQuery.isLoading || requestsQuery.isLoading;

  return (
    <View style={styles.screen}>
      <DFHeader
        subtitle="help center"
        onMenuPress={() => openGlobalMenu(router)}
        onPressMeta={() => router.push("/pricing/plan-billing")}
      />

      <View style={styles.bodyWrap}>
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={
                categoriesQuery.isRefetching ||
                faqQuery.isRefetching ||
                requestsQuery.isRefetching
              }
              onRefresh={() => {
                categoriesQuery.refetch();
                faqQuery.refetch();
                requestsQuery.refetch();
              }}
            />
          }
          contentContainerStyle={styles.content}
        >
          <View style={styles.hero}>
            <Text style={styles.kicker}>desifaces.ai</Text>
            <Text style={styles.title}>Need Help</Text>
            <Text style={styles.subtitle}>
              Help center, FAQs, and direct support for Face, Audio, Fusion, billing, and account issues.
            </Text>

            <View style={styles.heroActions}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => router.push("/help/contact" as any)}
              >
                <Text style={styles.primaryButtonText}>Contact Us</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => router.push("/help/faq" as any)}
              >
                <Text style={styles.secondaryButtonText}>Browse FAQ</Text>
              </Pressable>
            </View>
          </View>

          {loading ? (
            <View style={styles.centerState}>
              <ActivityIndicator />
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Browse by topic</Text>
                <View style={styles.grid}>
                  {(categoriesQuery.data ?? []).map((cat) => (
                    <Pressable
                      key={cat.key}
                      style={styles.topicCard}
                      onPress={() => router.push("/help/faq" as any)}
                    >
                      <Text style={styles.topicTitle}>{cat.title}</Text>
                      <Text style={styles.topicBody}>
                        {cat.description || "Support articles and guidance"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.section}>
                <View style={styles.rowBetween}>
                  <Text style={styles.sectionTitle}>Popular FAQs</Text>
                  <Pressable onPress={() => router.push("/help/faq" as any)}>
                    <Text style={styles.linkText}>See all</Text>
                  </Pressable>
                </View>

                {(faqQuery.data ?? []).slice(0, 4).map((item) => (
                  <Pressable
                    key={item.slug}
                    style={styles.listCard}
                    onPress={() => router.push("/help/faq" as any)}
                  >
                    <Text style={styles.listTitle}>{item.title}</Text>
                    <Text style={styles.listBody}>
                      {item.summary || item.body_markdown.slice(0, 120)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent support requests</Text>
                {(requestsQuery.data ?? []).length === 0 ? (
                  <View style={styles.listCard}>
                    <Text style={styles.listTitle}>No support requests yet</Text>
                    <Text style={styles.listBody}>
                      When you contact desifaces.ai support, your recent requests will appear here.
                    </Text>
                  </View>
                ) : (
                  (requestsQuery.data ?? []).map((req) => (
                    <View key={req.id} style={styles.listCard}>
                      <Text style={styles.listTitle}>{req.subject}</Text>
                      <Text style={styles.listMeta}>
                        {req.product_area} • {req.priority} • {req.status}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>

      <HelpFooterNav />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#080808" },
  bodyWrap: { flex: 1 },
  content: { paddingBottom: 28 },
  hero: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  kicker: { color: "#E89838", fontSize: 13, marginBottom: 8 },
  title: { color: "#FFF7E8", fontSize: 30, fontWeight: "800" },
  subtitle: {
    color: "rgba(255,247,232,0.72)",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  heroActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  primaryButton: {
    backgroundColor: "#E89838",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: { color: "#080808", fontWeight: "700" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  secondaryButtonText: { color: "#FFF7E8", fontWeight: "700" },
  centerState: { paddingVertical: 40, alignItems: "center" },
  section: { paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { color: "#FFF7E8", fontSize: 20, fontWeight: "800", marginBottom: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  linkText: { color: "#E89838", fontWeight: "700" },
  grid: { gap: 12 },
  topicCard: {
    backgroundColor: "#121212",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  topicTitle: { color: "#FFF7E8", fontSize: 16, fontWeight: "700" },
  topicBody: { color: "rgba(255,247,232,0.7)", marginTop: 8, lineHeight: 20 },
  listCard: {
    backgroundColor: "#121212",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 12,
  },
  listTitle: { color: "#FFF7E8", fontSize: 16, fontWeight: "700" },
  listBody: { color: "rgba(255,247,232,0.7)", marginTop: 8, lineHeight: 20 },
  listMeta: { color: "rgba(255,247,232,0.56)", marginTop: 8 },

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