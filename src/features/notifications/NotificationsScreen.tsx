
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DFHeader from "../../core/ui/DFHeader";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../../core/api/notifications";

type NotificationFilter =
  | "all"
  | "jobs"
  | "billing"
  | "account"
  | "support"
  | "announcements";

const FILTERS: NotificationFilter[] = [
  "all",
  "jobs",
  "billing",
  "account",
  "support",
  "announcements",
];

const DF = {
  bg: "#080808",
  panel: "#121212",
  panel2: "#151515",
  line: "rgba(255,255,255,0.08)",
  lineStrong: "rgba(232,152,56,0.25)",
  text: "#FFF7E8",
  textSoft: "rgba(255,247,232,0.74)",
  textMuted: "rgba(255,247,232,0.52)",
  gold: "#E89838",
  goldSoft: "rgba(232,152,56,0.14)",
};

function formatRelativeTime(iso: string) {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString();
}

function badgeStyle(category: string) {
  switch (category) {
    case "jobs":
      return { backgroundColor: "rgba(56,189,248,0.16)", borderColor: "rgba(56,189,248,0.28)" };
    case "billing":
      return { backgroundColor: "rgba(250,204,21,0.16)", borderColor: "rgba(250,204,21,0.28)" };
    case "support":
      return { backgroundColor: "rgba(16,185,129,0.16)", borderColor: "rgba(16,185,129,0.28)" };
    case "account":
      return { backgroundColor: "rgba(168,85,247,0.16)", borderColor: "rgba(168,85,247,0.28)" };
    default:
      return { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)" };
  }
}

function priorityColor(priority: string) {
  if (priority === "critical") return "#FF6B6B";
  if (priority === "important") return DF.gold;
  return "#9EB3D8";
}

function normalizeLabel(value: string) {
  if (value === "all") return "All";
  if (value === "announcements") return "Updates";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function FooterNav({ active }: { active: "dashboard" | "face" | "audio" | "fusion" | "notifications" }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const items: Array<{
    key: typeof active;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    route: Href;
  }> = [
    { key: "dashboard", label: "Home", icon: "home-outline", route: "/dashboard" as Href },
    { key: "face", label: "Face", icon: "person-outline", route: "/face" as Href },
    { key: "audio", label: "Audio", icon: "mic-outline", route: "/audio" as Href },
    { key: "fusion", label: "Fusion", icon: "videocam-outline", route: "/fusion" as Href },
    { key: "notifications", label: "Alerts", icon: "notifications-outline", route: "/notifications" as Href },
  ];

  return (
    <View style={[styles.footerShell, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.footerBar}>
        {items.map((item) => {
          const selected = item.key === active;
          return (
            <Pressable
              key={item.key}
              style={styles.footerItem}
              onPress={() => {
                if (!selected) router.push(item.route);
              }}
            >
              <View style={[styles.footerIconWrap, selected && styles.footerIconWrapActive]}>
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={selected ? DF.gold : DF.textMuted}
                />
              </View>
              <Text style={[styles.footerLabel, selected && styles.footerLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [filter, setFilter] = React.useState<NotificationFilter>("all");

  const notificationsQuery = useQuery({
    queryKey: ["notifications", "list", filter],
    queryFn: () =>
      listNotifications({
        category: filter === "all" ? undefined : filter,
        limit: 50,
        offset: 0,
      } as any),
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markOneMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const items = useMemo(
    () => notificationsQuery.data?.items ?? [],
    [notificationsQuery.data]
  );

  const unreadCount = notificationsQuery.data?.unread_count ?? 0;

  const onOpen = async (item: NotificationItem) => {
    if (!item.is_read) {
      try {
        await markOneMutation.mutateAsync(item.id);
      } catch {}
    }

    const route = item.action?.route;
    if (route?.startsWith("/")) {
      router.push(route as any);
      return;
    }

    if (item.category === "billing") {
      router.push("/pricing/plan-billing" as Href);
      return;
    }

    if (item.category === "support") {
      router.push("/help/contact" as Href);
      return;
    }

    router.push("/notifications" as Href);
  };

  return (
    <View style={styles.screen}>
      <DFHeader
        subtitle="Notifications"
        onMenuPress={() => router.push("/settings" as Href)}
        onPressMeta={() => router.push("/pricing/plan-billing" as Href)}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            tintColor={DF.gold}
            refreshing={notificationsQuery.isRefetching}
            onRefresh={() => notificationsQuery.refetch()}
          />
        }
        ListHeaderComponent={
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroLeft}>
                <Text style={styles.heroTitle}>Your updates, all in one place</Text>
                <Text style={styles.heroSubtitle}>
                  Face, Audio, Fusion, billing, support, and account activity now show up here.
                </Text>
              </View>

              <View style={styles.heroRight}>
                <Text style={styles.heroCount}>{unreadCount}</Text>
                <Text style={styles.heroCountLabel}>
                  {unreadCount === 1 ? "unread" : "unread"}
                </Text>
              </View>
            </View>

            <View style={styles.actionsRow}>
              <View style={styles.filters}>
                {FILTERS.map((value) => {
                  const active = value === filter;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setFilter(value)}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          active && styles.filterChipTextActive,
                        ]}
                      >
                        {normalizeLabel(value)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[
                  styles.markAllButton,
                  (markAllMutation.isPending || unreadCount <= 0) && styles.markAllButtonDisabled,
                ]}
                disabled={markAllMutation.isPending || unreadCount <= 0}
                onPress={() => markAllMutation.mutate()}
              >
                <Text style={styles.markAllText}>Mark all read</Text>
              </Pressable>
            </View>
          </>
        }
        ListEmptyComponent={
          notificationsQuery.isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={DF.gold} />
              <Text style={styles.loadingText}>Loading notifications…</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyBody}>
                When desifaces.ai has job, billing, or support updates for you, they will appear here.
              </Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.card, !item.is_read && styles.cardUnread]}
            onPress={() => onOpen(item)}
          >
            <View style={styles.cardTopRow}>
              <View style={[styles.badge, badgeStyle(item.category)]}>
                <Text style={styles.badgeText}>{normalizeLabel(item.category)}</Text>
              </View>

              <View style={styles.rightMetaRow}>
                {!item.is_read ? <View style={styles.unreadDot} /> : null}
                <Text style={styles.dateText}>{formatRelativeTime(item.created_at)}</Text>
              </View>
            </View>

            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>

            <View style={styles.cardBottomRow}>
              <View style={styles.metaPill}>
                <View
                  style={[
                    styles.priorityDot,
                    { backgroundColor: priorityColor(item.priority) },
                  ]}
                />
                <Text style={styles.cardMeta}>
                  {String(item.event_type || "").replace(/_/g, " ")}
                </Text>
              </View>

              {item.action?.label ? (
                <Text style={styles.linkText}>{item.action.label}</Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />

      <FooterNav active="notifications" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DF.bg },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 12,
    backgroundColor: DF.panel,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: DF.line,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroLeft: { flex: 1, minWidth: 0 },
  heroTitle: { color: DF.text, fontSize: 18, fontWeight: "800" },
  heroSubtitle: {
    color: DF.textSoft,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  heroRight: {
    minWidth: 70,
    alignItems: "flex-end",
  },
  heroCount: { color: DF.gold, fontSize: 24, fontWeight: "900" },
  heroCountLabel: { color: DF.textMuted, fontSize: 11, fontWeight: "700" },

  actionsRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#2A221A",
    backgroundColor: "#120F0C",
  },
  filterChipActive: {
    backgroundColor: DF.gold,
    borderColor: DF.gold,
  },
  filterChipText: {
    color: "#E9D3B3",
    fontWeight: "700",
    fontSize: 12,
  },
  filterChipTextActive: {
    color: DF.bg,
  },
  markAllButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(232,152,56,0.28)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: DF.goldSoft,
  },
  markAllButtonDisabled: {
    opacity: 0.45,
  },
  markAllText: {
    color: DF.gold,
    fontWeight: "800",
    fontSize: 12,
  },

  listContent: {
    paddingBottom: 112,
    flexGrow: 1,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  loadingText: {
    color: DF.textSoft,
    fontSize: 14,
  },
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: DF.panel,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: DF.line,
  },
  emptyTitle: { color: DF.text, fontSize: 18, fontWeight: "800" },
  emptyBody: { color: DF.textSoft, marginTop: 8, lineHeight: 20, fontSize: 14 },

  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: DF.line,
    backgroundColor: DF.panel,
    padding: 16,
  },
  cardUnread: {
    borderColor: DF.lineStrong,
    backgroundColor: DF.panel2,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    color: DF.text,
    fontSize: 11,
    fontWeight: "800",
  },
  rightMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: DF.gold,
  },
  dateText: {
    color: DF.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  cardTitle: {
    color: DF.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 12,
  },
  cardBody: {
    color: DF.textSoft,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  cardBottomRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: DF.line,
    flexShrink: 1,
  },
  priorityDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  cardMeta: {
    color: DF.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  linkText: {
    color: DF.gold,
    fontWeight: "800",
    fontSize: 12,
  },

  footerShell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 12,
  },
  footerBar: {
    backgroundColor: "rgba(9,11,16,0.96)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  footerItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    gap: 4,
  },
  footerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  footerIconWrapActive: {
    backgroundColor: "rgba(232,152,56,0.12)",
  },
  footerLabel: {
    color: DF.textMuted,
    fontSize: 10.5,
    fontWeight: "700",
  },
  footerLabelActive: {
    color: DF.gold,
  },
});
