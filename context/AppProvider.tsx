import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import { AppTheme, ThemeMode, themes } from "../constants/colors";
import { StopSummary } from "../types/api";

type AppContextValue = {
  themeMode: ThemeMode;
  resolvedScheme: "light" | "dark";
  colors: AppTheme;
  setThemeMode: (mode: ThemeMode) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (value: boolean) => void;
  favoriteStops: StopSummary[];
  toggleFavoriteStop: (stop: StopSummary) => void;
  isFavoriteStop: (id: string) => boolean;
  favoriteLines: string[];
  toggleFavoriteLine: (line: string) => void;
  recentStops: StopSummary[];
  addRecentStop: (stop: StopSummary) => void;
};

const STORAGE_THEME = "ovbord.theme";
const STORAGE_NOTIFICATIONS = "ovbord.notifications";
const STORAGE_FAVORITE_STOPS = "ovbord.favoriteStops";
const STORAGE_FAVORITE_LINES = "ovbord.favoriteLines";
const STORAGE_RECENT_STOPS = "ovbord.recentStops";

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("light");
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [favoriteStops, setFavoriteStops] = useState<StopSummary[]>([]);
  const [favoriteLines, setFavoriteLines] = useState<string[]>([]);
  const [recentStops, setRecentStops] = useState<StopSummary[]>([]);
  const [deviceScheme, setDeviceScheme] = useState<ColorSchemeName | null | undefined>(Appearance.getColorScheme());

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => setDeviceScheme(colorScheme));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void (async () => {
      const [savedTheme, savedNotifications, savedFavoriteStops, savedFavoriteLines, savedRecentStops] = await Promise.all([
        AsyncStorage.getItem(STORAGE_THEME),
        AsyncStorage.getItem(STORAGE_NOTIFICATIONS),
        AsyncStorage.getItem(STORAGE_FAVORITE_STOPS),
        AsyncStorage.getItem(STORAGE_FAVORITE_LINES),
        AsyncStorage.getItem(STORAGE_RECENT_STOPS)
      ]);
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") setThemeModeState(savedTheme);
      if (savedNotifications !== null) setNotificationsEnabledState(savedNotifications === "true");
      if (savedFavoriteStops) setFavoriteStops(JSON.parse(savedFavoriteStops));
      if (savedFavoriteLines) setFavoriteLines(JSON.parse(savedFavoriteLines));
      if (savedRecentStops) setRecentStops(JSON.parse(savedRecentStops));
    })();
  }, []);

  const resolvedScheme = themeMode === "system" ? (deviceScheme === "dark" ? "dark" : "light") : themeMode;
  const colors = themes[resolvedScheme];

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    void AsyncStorage.setItem(STORAGE_THEME, mode);
  };

  const setNotificationsEnabled = (value: boolean) => {
    setNotificationsEnabledState(value);
    void AsyncStorage.setItem(STORAGE_NOTIFICATIONS, String(value));
  };

  const toggleFavoriteStop = (stop: StopSummary) => {
    setFavoriteStops((previous) => {
      const next = previous.some((item) => item.id === stop.id)
        ? previous.filter((item) => item.id !== stop.id)
        : [stop, ...previous];
      void AsyncStorage.setItem(STORAGE_FAVORITE_STOPS, JSON.stringify(next));
      return next;
    });
  };

  const isFavoriteStop = (id: string) => favoriteStops.some((item) => item.id === id);

  const toggleFavoriteLine = (line: string) => {
    setFavoriteLines((previous) => {
      const next = previous.includes(line) ? previous.filter((item) => item !== line) : [line, ...previous];
      void AsyncStorage.setItem(STORAGE_FAVORITE_LINES, JSON.stringify(next));
      return next;
    });
  };

  const addRecentStop = (stop: StopSummary) => {
    setRecentStops((previous) => {
      const next = [stop, ...previous.filter((item) => item.id !== stop.id)].slice(0, 10);
      void AsyncStorage.setItem(STORAGE_RECENT_STOPS, JSON.stringify(next));
      return next;
    });
  };

  const value = useMemo<AppContextValue>(() => ({
    themeMode,
    resolvedScheme,
    colors,
    setThemeMode,
    notificationsEnabled,
    setNotificationsEnabled,
    favoriteStops,
    toggleFavoriteStop,
    isFavoriteStop,
    favoriteLines,
    toggleFavoriteLine,
    recentStops,
    addRecentStop
  }), [themeMode, resolvedScheme, colors, notificationsEnabled, favoriteStops, favoriteLines, recentStops]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp moet binnen AppProvider worden gebruikt.");
  return value;
}
