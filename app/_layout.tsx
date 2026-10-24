import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import appConfig from "../app.json";
import { AppProvider, useApp } from "../context/AppProvider";
import { FavoritesLiveProvider } from "../context/FavoritesLive";
import { FeedbackPrompt } from "../components/FeedbackPrompt";
import { FlowNavigationProvider } from "../context/FlowNavigation";

const APP_VERSION = appConfig.expo.version;
let sessionPingSent = false;

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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="rit/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="feedback" options={{ animation: "slide_from_right" }} />
      </Stack>
      <FeedbackPrompt />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (sessionPingSent) return;
    sessionPingSent = true;
    fetch("https://ovspot.nl/api/ovbord-ping?v=" + encodeURIComponent(APP_VERSION)).catch(() => {});
  }, []);
  return (
    <AppProvider>
      <FlowNavigationProvider><FavoritesLiveProvider><RootNavigation /></FavoritesLiveProvider></FlowNavigationProvider>
    </AppProvider>
  );
}
