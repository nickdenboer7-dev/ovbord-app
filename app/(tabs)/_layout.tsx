import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../../context/AppProvider";

export default function TabsLayout() {
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 58 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" }
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Start", tabBarIcon: ({ color }) => <Ionicons name="home" color={color} size={24} /> }} />
      <Tabs.Screen name="buurtbord" options={{ title: "Buurtbord", tabBarIcon: ({ color }) => <Ionicons name="map" color={color} size={24} /> }} />
      <Tabs.Screen name="favorieten" options={{ title: "Favorieten", tabBarIcon: ({ color }) => <Ionicons name="star" color={color} size={24} /> }} />
      <Tabs.Screen name="meer" options={{ title: "Meer", tabBarIcon: ({ color }) => <Ionicons name="settings" color={color} size={24} /> }} />
    </Tabs>
  );
}
