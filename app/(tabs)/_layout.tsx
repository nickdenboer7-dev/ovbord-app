import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useApp } from "../../context/AppProvider";

export default function TabsLayout() {
  const { colors } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 66, paddingBottom: 8, paddingTop: 6 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" }
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Start", tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }} />
      <Tabs.Screen name="buurtbord" options={{ title: "Buurtbord", tabBarIcon: ({ color, size }) => <Ionicons name="map" color={color} size={size} /> }} />
      <Tabs.Screen name="favorieten" options={{ title: "Favorieten", tabBarIcon: ({ color, size }) => <Ionicons name="star" color={color} size={size} /> }} />
      <Tabs.Screen name="meer" options={{ title: "Meer", tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} /> }} />
    </Tabs>
  );
}
