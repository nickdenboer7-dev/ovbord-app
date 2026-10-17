import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Appearance, ColorSchemeName } from "react-native";
import { AppTheme, ThemeMode, themes } from "../constants/colors";
import { RitData, StopSummary } from "../types/api";
import { isStoredJourney, isStoredStop, isStoredString, mergeLoadedList, parseStoredList } from "../lib/storedJson";
import { pruneRitReturnCache } from "../lib/ritReturnCache";
import { moveItem } from "../lib/listOrder";

export type RitCacheEntry = { data: RitData; fetchedAt: number };

/** boardLine/boardDirection: as the stop board showed them; trip feeds may name line or destination differently. */
export type SavedJourney = {key:string;line:string;direction:string;stop:StopSummary;carrier?:string;boardLine?:string;boardDirection?:string};
export function favoriteJourneyKey(line:string,direction:string,stopId:string):string {
  return [line,direction,stopId].map(s=>s.trim().toLocaleLowerCase("nl")).join("::");
}
type AppContextValue = {
  themeMode: ThemeMode;
  resolvedScheme: "light" | "dark";
  colors: AppTheme;
  setThemeMode: (mode: ThemeMode) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (value: boolean) => void;
  manualCity: string | null;
  setManualCity: (value: string | null) => void;
  favoriteStops: StopSummary[];
  toggleFavoriteStop: (stop: StopSummary) => void;
  isFavoriteStop: (id: string) => boolean;
  favoriteJourneys: SavedJourney[];
  toggleFavoriteJourney: (entry:SavedJourney)=>void;
  isFavoriteJourney: (key:string)=>boolean;
  /** Move a favourite one place up (-1) or down (1). */
  moveFavoriteStop: (id: string, delta: number) => void;
  moveFavoriteJourney: (key: string, delta: number) => void;
  favoriteLines: string[];
  toggleFavoriteLine: (line: string) => void;
  recentStops: StopSummary[];
  addRecentStop: (stop: StopSummary) => void;
  clearRecentStops: () => void;
  getCachedRit: (tripId: string) => RitCacheEntry | undefined;
  setCachedRit: (tripId: string, entry: RitCacheEntry) => void;
};

const STORAGE_THEME = "ovbord.theme";
const STORAGE_NOTIFICATIONS = "ovbord.notifications";
const STORAGE_MANUAL_CITY = "ovbord.manualCity";
const STORAGE_FAVORITE_STOPS = "ovbord.favoriteStops";
const STORAGE_FAVORITE_LINES = "ovbord.favoriteLines";
const STORAGE_FAVORITE_JOURNEYS = "ovbord.favoriteJourneys";
const STORAGE_RECENT_STOPS = "ovbord.recentStops";

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  // New installs follow the phone setting; a saved choice overrides this on load.
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [manualCity, setManualCityState] = useState<string | null>(null);
  const [favoriteStops, setFavoriteStops] = useState<StopSummary[]>([]);
  const [favoriteLines, setFavoriteLines] = useState<string[]>([]);
  const [favoriteJourneys,setFavoriteJourneys] = useState<SavedJourney[]>([]);
  const [recentStops, setRecentStops] = useState<StopSummary[]>([]);
  const ritCache = useRef<Map<string, RitCacheEntry>>(new Map());
  const [deviceScheme, setDeviceScheme] = useState<ColorSchemeName | null | undefined>(Appearance.getColorScheme());

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => setDeviceScheme(colorScheme));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Each key is read and parsed on its own: one unreadable or corrupt value
    // must not prevent the other settings, favorites and recents from loading.
    const read = (key: string) => AsyncStorage.getItem(key).catch(() => null);
    void (async () => {
      const [savedTheme, savedNotifications, savedFavoriteStops, savedFavoriteLines, savedRecentStops, savedFavoriteJourneys, savedManualCity] = await Promise.all([
        read(STORAGE_THEME),
        read(STORAGE_NOTIFICATIONS),
        read(STORAGE_FAVORITE_STOPS),
        read(STORAGE_FAVORITE_LINES),
        read(STORAGE_RECENT_STOPS),
        read(STORAGE_FAVORITE_JOURNEYS),
        read(STORAGE_MANUAL_CITY)
      ]);
      if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "system") setThemeModeState(savedTheme);
      if (savedNotifications !== null) setNotificationsEnabledState(savedNotifications === "true");
      if (savedManualCity !== null) setManualCityState(savedManualCity || null);
      // Merge instead of replace: anything saved while loading was still busy is kept,
      // and the merged list is written back so storage holds both.
      const hydrate = <T,>(key: string, stored: T[] | undefined, setList: React.Dispatch<React.SetStateAction<T[]>>,
        keyOf: (item: T) => string, limit?: number) => {
        if (!stored) return;
        setList((current) => {
          const next = mergeLoadedList(current, stored, keyOf, limit);
          if (current.length) void AsyncStorage.setItem(key, JSON.stringify(next));
          return next;
        });
      };
      hydrate(STORAGE_FAVORITE_STOPS, parseStoredList<StopSummary>(savedFavoriteStops, isStoredStop), setFavoriteStops, (stop) => stop.id);
      hydrate(STORAGE_FAVORITE_LINES, parseStoredList(savedFavoriteLines, isStoredString), setFavoriteLines, (line) => line);
      hydrate(STORAGE_RECENT_STOPS, parseStoredList<StopSummary>(savedRecentStops, isStoredStop), setRecentStops, (stop) => stop.id, 10);
      hydrate(STORAGE_FAVORITE_JOURNEYS, parseStoredList<SavedJourney>(savedFavoriteJourneys, isStoredJourney), setFavoriteJourneys, (item) => item.key);
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

  const setManualCity = (value: string | null) => {
    setManualCityState(value);
    void AsyncStorage.setItem(STORAGE_MANUAL_CITY, value || "");
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

  const toggleFavoriteJourney = (entry:SavedJourney) => {
    setFavoriteJourneys(previous=>{
      const next=previous.some(item=>item.key===entry.key)
        ?previous.filter(item=>item.key!==entry.key):[entry,...previous];
      void AsyncStorage.setItem(STORAGE_FAVORITE_JOURNEYS,JSON.stringify(next));
      return next;
    });
  };
  const isFavoriteJourney=(key:string)=>favoriteJourneys.some(item=>item.key===key);
  const moveFavoriteStop = (id: string, delta: number) => {
    setFavoriteStops((previous) => {
      const next = moveItem(previous, previous.findIndex((item) => item.id === id), delta);
      void AsyncStorage.setItem(STORAGE_FAVORITE_STOPS, JSON.stringify(next));
      return next;
    });
  };
  const moveFavoriteJourney = (key: string, delta: number) => {
    setFavoriteJourneys((previous) => {
      const next = moveItem(previous, previous.findIndex((item) => item.key === key), delta);
      void AsyncStorage.setItem(STORAGE_FAVORITE_JOURNEYS, JSON.stringify(next));
      return next;
    });
  };
  const toggleFavoriteLine = (line: string) => {
    setFavoriteLines((previous) => {
      const next = previous.includes(line) ? previous.filter((item) => item !== line) : [line, ...previous];
      void AsyncStorage.setItem(STORAGE_FAVORITE_LINES, JSON.stringify(next));
      return next;
    });
  };

  const getCachedRit = useCallback((tripId: string): RitCacheEntry | undefined => ritCache.current.get(tripId), []);
  const setCachedRit = useCallback((tripId: string, entry: RitCacheEntry): void => {
    // This is only a fast return-cache for already opened trips, never persistent storage.
    // Expired entries can never be reused, so drop them; then bound memory while preserving the newest entries.
    const cache = ritCache.current;
    cache.delete(tripId);
    cache.set(tripId, entry);
    pruneRitReturnCache(cache, Date.now());
  }, []);

  const addRecentStop = (stop: StopSummary) => {
    setRecentStops((previous) => {
      const next = [stop, ...previous.filter((item) => item.id !== stop.id)].slice(0, 10);
      void AsyncStorage.setItem(STORAGE_RECENT_STOPS, JSON.stringify(next));
      return next;
    });
  };

  const clearRecentStops = () => {
    setRecentStops([]);
    void AsyncStorage.setItem(STORAGE_RECENT_STOPS, JSON.stringify([]));
  };

  const value = useMemo<AppContextValue>(() => ({
    themeMode,
    resolvedScheme,
    colors,
    setThemeMode,
    notificationsEnabled,
    setNotificationsEnabled,
    manualCity,
    setManualCity,
    favoriteStops,
    toggleFavoriteStop,
    isFavoriteStop,
    favoriteJourneys,
    toggleFavoriteJourney,
    isFavoriteJourney,
    moveFavoriteStop,
    moveFavoriteJourney,
    favoriteLines,
    toggleFavoriteLine,
    recentStops,
    addRecentStop,
    clearRecentStops,
    getCachedRit,
    setCachedRit
  }), [themeMode, resolvedScheme, colors, notificationsEnabled, manualCity, favoriteStops, favoriteLines, favoriteJourneys, recentStops, getCachedRit, setCachedRit]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp moet binnen AppProvider worden gebruikt.");
  return value;
}
