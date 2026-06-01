import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { getUnreadNotificationCount } from "../../core/api/notifications";

export function NotificationBell() {
  const router = useRouter();

  const unreadQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: getUnreadNotificationCount,
    refetchInterval: 30_000,
  });

  const unread = unreadQuery.data?.unread_count ?? 0;

  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push("/notifications" as any)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
    >
      <Ionicons name="notifications-outline" size={16} color="#F5E9D0" />
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 18,
    minHeight: 18,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 15,
    height: 15,
    borderRadius: 999,
    backgroundColor: "#E89838",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#080808",
    fontWeight: "800",
    fontSize: 8.5,
    lineHeight: 10,
  },
});
