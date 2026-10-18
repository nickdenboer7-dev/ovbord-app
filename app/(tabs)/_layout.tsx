import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Text, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../../context/AppProvider";
import { useFlowNavigation } from "../../context/FlowNavigation";

/** Tab labels grow with the system font only a little: four labels must fit next to each other. */
function tabLabel(title: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 11, fontWeight: "700" }} numberOfLines={1} maxFontSizeMultiplier={1.15}>{title}</Text>
  );
}

export default function TabsLayout() {
  const { colors } = useApp();
  const { goHome } = useFlowNavigation();
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
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" }
      }}
    >
      {/* V5.9: tapping Start while Start is already shown opens the Start list (boards and search
          close). Coming back to Start from another tab keeps an open board, and Android Back is
          untouched: it still steps back one board at a time (FlowWorkspace). */}
      <Tabs.Screen name="index" listeners={({ navigation }) => ({ tabPress: () => { if (navigation.isFocused()) goHome(); } })} options={{ title: "Start", tabBarLabel: tabLabel("Start"), tabBarIcon: ({ color }) => <Ionicons name="home" color={color} size={24} /> }} />
      <Tabs.Screen name="buurtbord" options={{ title: "Buurtbord", tabBarLabel: tabLabel("Buurtbord"), tabBarIcon: ({ color }) => <Ionicons name="map" color={color} size={24} /> }} />
      <Tabs.Screen name="favorieten" options={{ title: "Favorieten", tabBarLabel: tabLabel("Favorieten"), tabBarIcon: ({ color }) => <Ionicons name="star" color={color} size={24} /> }} />
      <Tabs.Screen name="meer" options={{ title: "Meer", tabBarLabel: tabLabel("Meer"), tabBarIcon: ({ color }) => <Ionicons name="settings" color={color} size={24} /> }} />
    </Tabs>
  );
}
