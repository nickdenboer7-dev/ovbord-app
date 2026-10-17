import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { AppProvider, useApp } from "../context/AppProvider";
import { FavoritesLiveProvider } from "../context/FavoritesLive";
import { FlowNavigationProvider } from "../context/FlowNavigation";

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
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <FlowNavigationProvider><FavoritesLiveProvider><RootNavigation /></FavoritesLiveProvider></FlowNavigationProvider>
    </AppProvider>
  );
}
