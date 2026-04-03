import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { DF } from "../../core/theme/colors";

function TabIcon({
  focused,
  color,
  name,
}: {
  focused: boolean;
  color: string;
  name: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Ionicons
      name={name}
      size={focused ? 20 : 19}
      color={color}
      style={{ marginBottom: 2 }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: DF.cyan,
        tabBarInactiveTintColor: "rgba(255,255,255,0.62)",
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "800",
          letterSpacing: 0.1,
          marginTop: 2,
        },
        tabBarItemStyle: {
          minWidth: 74,
          maxWidth: 92,
          marginHorizontal: 6,
          paddingHorizontal: 4,
        },
        tabBarStyle: {
          backgroundColor: DF.night,
          borderTopColor: "rgba(255,255,255,0.10)",
          borderTopWidth: 1,
          height: 72,
          paddingTop: 8,
          paddingBottom: 10,
          paddingHorizontal: 16,
        },
        tabBarIconStyle: {
          marginTop: 1,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} name="home-outline" />
          ),
        }}
      />

      <Tabs.Screen
        name="face"
        options={{
          title: "Face",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} name="person-outline" />
          ),
        }}
      />

      <Tabs.Screen
        name="audio"
        options={{
          title: "Audio",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} name="mic-outline" />
          ),
        }}
      />

      <Tabs.Screen
        name="fusion"
        options={{
          title: "Fusion",
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} name="videocam-outline" />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="billing"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="media"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}