import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { AppState, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import appConfig from "../app.json";
import { AppProvider, useApp } from "../context/AppProvider";
import { FavoritesLiveProvider } from "../context/FavoritesLive";
import { FeedbackPrompt } from "../components/FeedbackPrompt";
import { AppUpdateNotice } from "../components/AppUpdateNotice";
import { FlowNavigationProvider } from "../context/FlowNavigation";
import { createAnonymousSessionPing } from "../lib/anonymousStats";

const APP_VERSION = appConfig.expo.version;
const sendSessionPing = createAnonymousSessionPing(AsyncStorage, APP_VERSION, fetch);

function RootNavigation() {
  const { resolvedScheme, colors } = useApp();
  const base = resolvedScheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border
    }
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={resolvedScheme === "dark" ? "light" : "dark"} />
      <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="rit/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="feedback" options={{ animation: "slide_from_right" }} />
      </Stack>
      </View>
      <AppUpdateNotice />
      </View>
      <FeedbackPrompt />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    const ping = () => { void sendSessionPing().catch(() => {}); };
    ping();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") ping(); });
    return () => subscription.remove();
  }, []);
  return (
    <AppProvider>
      <FlowNavigationProvider><FavoritesLiveProvider><RootNavigation /></FavoritesLiveProvider></FlowNavigationProvider>
    </AppProvider>
  );
}
