import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Slot, router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { DF } from "../theme/colors";
import { useAuth } from "../auth/AuthContext";

type NavItem = {
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const primaryNav: NavItem[] = [
  { label: "Dashboard", href: "/(tabs)/dashboard", icon: "grid-outline" },
  { label: "Face Studio", href: "/(tabs)/face", icon: "person-outline" },
  { label: "Audio Studio", href: "/(tabs)/audio", icon: "mic-outline" },
  { label: "Fusion Studio", href: "/(tabs)/fusion", icon: "videocam-outline" },
  { label: "Library", href: "/(tabs)/media", icon: "images-outline" },
];

const accountNav: NavItem[] = [
  { label: "Plan & Billing", href: "/pricing/plan-billing", icon: "card-outline" },
  { label: "Settings", href: "/(tabs)/settings", icon: "settings-outline" },
];

function NavButton({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      onPress={() => router.push(item.href as any)}
      style={({ hovered, pressed }) => ({
        minHeight: 46,
        borderRadius: 14,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        borderWidth: 1,
        borderColor: active ? "rgba(210,176,122,0.34)" : "transparent",
        backgroundColor: active
          ? "rgba(210,176,122,0.13)"
          : hovered || pressed
            ? "rgba(255,255,255,0.055)"
            : "transparent",
      })}
    >
      <Ionicons
        name={item.icon}
        size={19}
        color={active ? DF.brandStrong : DF.textMuted}
      />
      <Text
        style={{
          color: active ? DF.textStrong : DF.textSoft,
          fontSize: 14,
          fontWeight: active ? "800" : "650",
        }}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}

export default function StudioNavigation() {
  const pathname = usePathname();
  const auth = useAuth() as any;
  const displayName = auth?.displayName || auth?.fullName || auth?.email || "Creator";

  const isActive = (href: string) => {
    const route = href.replace("/(tabs)", "");
    return pathname === route || pathname.startsWith(`${route}/`);
  };

  return (
    <View style={{ flex: 1, minHeight: "100vh" as any, backgroundColor: DF.bg }}>
      <View
        style={{
          minHeight: 72,
          borderBottomWidth: 1,
          borderBottomColor: DF.border,
          paddingHorizontal: 28,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "rgba(0,0,0,0.94)",
        }}
      >
        <Pressable onPress={() => router.push("/(tabs)/dashboard" as any)}>
          <View style={{ flexDirection: "row", alignItems: "baseline" }}>
            <Text style={{ color: DF.brandWordmark, fontSize: 23, fontWeight: "900" }}>
              desifaces.
            </Text>
            <Text style={{ color: DF.aiWordmark, fontSize: 23, fontWeight: "900" }}>ai</Text>
          </View>
          <Text style={{ color: DF.textMuted, fontSize: 11, marginTop: 3 }}>
            Create faces. Give them a voice. Bring them to life.
          </Text>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: DF.border,
              backgroundColor: DF.surface,
            }}
          >
            <Text style={{ color: DF.textSoft, fontSize: 12, fontWeight: "700" }}>
              {displayName}
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: "row", minHeight: 0 }}>
        <View
          style={{
            width: 248,
            borderRightWidth: 1,
            borderRightColor: DF.border,
            backgroundColor: "rgba(255,255,255,0.018)",
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 18, gap: 5 }}>
            <Text
              style={{
                color: DF.textMuted,
                fontSize: 10,
                fontWeight: "900",
                letterSpacing: 1.2,
                marginHorizontal: 12,
                marginBottom: 6,
              }}
            >
              CREATE
            </Text>
            {primaryNav.map((item) => (
              <NavButton key={item.href} item={item} active={isActive(item.href)} />
            ))}

            <View style={{ height: 1, backgroundColor: DF.divider, marginVertical: 14 }} />
            <Text
              style={{
                color: DF.textMuted,
                fontSize: 10,
                fontWeight: "900",
                letterSpacing: 1.2,
                marginHorizontal: 12,
                marginBottom: 6,
              }}
            >
              ACCOUNT
            </Text>
            {accountNav.map((item) => (
              <NavButton key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </ScrollView>
        </View>

        <View style={{ flex: 1, minWidth: 0, backgroundColor: DF.bgCanvas }}>
          <Slot />
        </View>
      </View>
    </View>
  );
}
