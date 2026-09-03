import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DF } from "../../core/theme/colors";

type RouteTarget =
  | "/(tabs)/face/multi-person"
  | "/media/library"
  | "/pricing/plan-billing"
  | "/pricing/spending-history"
  | "/notifications"
  | "/(tabs)/settings"
  | "/help";

type WorkspaceItem = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: RouteTarget;
  badge?: string;
};

const createItems: WorkspaceItem[] = [
  {
    title: "Multi-Person",
    subtitle: "Build premium stories with multiple people across Face, Voice and Video.",
    icon: "people-outline",
    route: "/(tabs)/face/multi-person",
    badge: "Premium",
  },
];

const manageItems: WorkspaceItem[] = [
  {
    title: "Saved Work",
    subtitle: "Open finished faces and final videos without exposing internal scene outputs.",
    icon: "albums-outline",
    route: "/media/library",
  },
  {
    title: "Plans & Usage",
    subtitle: "See your plan, available credits, reservations and top-up options.",
    icon: "card-outline",
    route: "/pricing/plan-billing",
  },
  {
    title: "Spending & Transactions",
    subtitle: "Review credits consumed and money actually paid as separate account facts.",
    icon: "receipt-outline",
    route: "/pricing/spending-history",
  },
  {
    title: "Notifications",
    subtitle: "See product and account updates in one place.",
    icon: "notifications-outline",
    route: "/notifications",
  },
  {
    title: "Account & Settings",
    subtitle: "Manage your account preferences and application settings.",
    icon: "settings-outline",
    route: "/(tabs)/settings",
  },
  {
    title: "Help & Support",
    subtitle: "Get help, browse FAQs and contact desifaces support.",
    icon: "help-circle-outline",
    route: "/help",
  },
];

function open(route: RouteTarget) {
  router.push(route as any);
}

function Item({ item }: { item: WorkspaceItem }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => open(item.route)}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={item.icon} size={19} color={DF.brandStrong} />
      </View>
      <View style={styles.itemCopy}>
        <View style={styles.itemTitleRow}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          {item.badge ? <Text style={styles.badge}>{item.badge}</Text> : null}
        </View>
        <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={DF.textMuted} />
    </Pressable>
  );
}

function Section({ title, items }: { title: string; items: WorkspaceItem[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>
        {items.map((item) => (
          <Item key={item.title} item={item} />
        ))}
      </View>
    </View>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 16) + 8, paddingBottom: Math.max(insets.bottom, 14) + 92 },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>YOUR WORKSPACE</Text>
          <Text style={styles.title}>More</Text>
          <Text style={styles.subtitle}>
            The same desifaces capabilities as web, organized for a smaller screen.
          </Text>
        </View>

        <Section title="Create" items={createItems} />
        <Section title="Manage" items={manageItems} />

        <View style={styles.assistantNote}>
          <Ionicons name="sparkles-outline" size={17} color={DF.cyan} />
          <Text style={styles.assistantText}>
            Piku remains available throughout the app for contextual guidance; it does not need another navigation item.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DF.bg },
  content: { paddingHorizontal: 16 },
  header: { marginBottom: 22 },
  kicker: { color: DF.brandStrong, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: DF.textStrong, fontSize: 28, fontWeight: "900", marginTop: 5 },
  subtitle: { color: DF.textSoft, fontSize: 12, lineHeight: 18, marginTop: 7, maxWidth: 380 },
  section: { marginTop: 8, marginBottom: 18 },
  sectionTitle: { color: DF.textMuted, fontSize: 10, fontWeight: "900", letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 9 },
  sectionBody: { gap: 8 },
  item: { minHeight: 72, borderWidth: 1, borderColor: DF.border, backgroundColor: DF.card, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 11 },
  itemPressed: { opacity: 0.72 },
  iconWrap: { width: 38, height: 38, borderRadius: 13, backgroundColor: DF.brandSoft, alignItems: "center", justifyContent: "center" },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  itemTitle: { color: DF.text, fontSize: 13, fontWeight: "900" },
  itemSubtitle: { color: DF.textMuted, fontSize: 10.5, lineHeight: 15, marginTop: 4 },
  badge: { color: DF.brandStrong, fontSize: 8.5, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5, backgroundColor: DF.brandSoft, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  assistantNote: { marginTop: 2, borderWidth: 1, borderColor: DF.hairline, backgroundColor: DF.surface, borderRadius: 16, padding: 13, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  assistantText: { flex: 1, color: DF.textMuted, fontSize: 10.5, lineHeight: 16 },
});
