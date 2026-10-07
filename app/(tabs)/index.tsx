import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LijnBadge } from "../../components/LijnBadge";
import { SettingsButton } from "../../components/SettingsButton";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { getNearby, searchStops } from "../../lib/api";
import { StopSummary } from "../../types/api";

type HomeTab = "nabij" | "recent" | "favoriet";

function secondaryStopLabel(stop: StopSummary) {
  const city = (stop.city || "").trim();
  if (!city) return "";
  if (stop.name.toLowerCase().includes(city.toLowerCase())) return "";
  return city;
}

function distanceText(stop: StopSummary) {
  const meters = stop.distanceMeters;
  const walk = stop.walkMinutes;
  if (typeof meters === "number" && walk) return `${Math.round(meters)} m · ${walk} min`;
  if (walk) return `${walk} min lopen`;
  if (typeof meters === "number") return `${Math.round(meters)} m`;
  return "Nabij";
}

export default function HomeScreen() {
  const { colors, recentStops, favoriteStops, addRecentStop } = useApp();
  const [selectedTab, setSelectedTab] = useState<HomeTab>("nabij");
  const [query, setQuery] = useState("");
  const [nearbyStops, setNearbyStops] = useState<StopSummary[]>([]);
  const [searchResults, setSearchResults] = useState<StopSummary[]>([]);
  const [loadingNearby, setLoadingNearby] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      try {
        setLoadingNearby(true);
        const permission = await Location.requestForegroundPermissionsAsync();
        let latitude = 52.1601;
        let longitude = 5.3848;
        if (permission.status === "granted") {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = current.coords.latitude;
          longitude = current.coords.longitude;
        }
        setNearbyStops(await getNearby(latitude, longitude));
      } catch (error) {
        console.error("Nearby laden mislukt", error);
      } finally {
        setLoadingNearby(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      setLoadingSearch(false);
      return;
    }
    timerRef.current = setTimeout(() => {
      void (async () => {
        try {
          setLoadingSearch(true);
          setSearchResults(await searchStops(query.trim()));
        } catch (error) {
          console.error("Zoeken mislukt", error);
        } finally {
          setLoadingSearch(false);
        }
      })();
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const dataset = useMemo(() => {
    if (query.trim()) return searchResults;
    if (selectedTab === "recent") return recentStops;
    if (selectedTab === "favoriet") return favoriteStops;
    return nearbyStops;
  }, [query, searchResults, selectedTab, recentStops, favoriteStops, nearbyStops]);

  const openStop = (stop: StopSummary) => {
    addRecentStop(stop);
    router.push({ pathname: "/halte/[id]", params: { id: stop.id } });
  };

  const loading = query.trim() ? loadingSearch : selectedTab === "nabij" && loadingNearby;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.logo, { backgroundColor: colors.accent }]}>
            <Ionicons name="train" size={18} color="#fff" />
          </View>
          <View style={styles.brandCopy}>
            <Text style={[styles.title, { color: colors.text }]}>OVbord</Text>
            <Text style={[styles.subtitle, { color: colors.textSoft }]}>Live OV in één oogopslag</Text>
          </View>
          <SettingsButton />
        </View>

        <Pressable
          onPress={() => inputRef.current?.focus()}
          style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}
        >
          <Ionicons name="search" size={18} color={colors.textSoft} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Zoek halte of station..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </Pressable>

        <View style={[styles.topTabs, { backgroundColor: colors.surfaceAlt }]}> 
          {([{ key: "nabij", label: "Nabij" }, { key: "recent", label: "Recent" }, { key: "favoriet", label: "Favoriet" }] as const).map((tab) => {
            const active = selectedTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => { setSelectedTab(tab.key); setQuery(""); }}
                style={[styles.topTab, { backgroundColor: active ? colors.accent : "transparent" }]}
              >
                <Text style={[styles.topTabText, { color: active ? "#FFFFFF" : colors.textSoft }]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={dataset}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const secondary = secondaryStopLabel(item);
            return (
              <Pressable
                onPress={() => openStop(item)}
                style={({ pressed }) => [
                  styles.stopRow,
                  {
                    borderBottomColor: colors.border,
                    backgroundColor: pressed ? colors.surfaceSoft : "transparent"
                  }
                ]}
              >
                <View style={[styles.modeIcon, { backgroundColor: modaliteitColors[item.mode] }]}>
                  <Ionicons
                    name={item.mode === "train" ? "train" : item.mode === "ferry" ? "boat" : item.mode === "metro" ? "subway" : "bus"}
                    size={16}
                    color="#fff"
                  />
                </View>

                <View style={styles.stopMain}>
                  <Text style={[styles.stopName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  {secondary ? <Text style={[styles.stopCity, { color: colors.textSoft }]} numberOfLines={1}>{secondary}</Text> : null}
                  <View style={styles.badgeRow}>
                    {item.lines.slice(0, 5).map((line, index) => (
                      <LijnBadge key={`${line.line}-${index}`} line={line.line} carrier={line.carrier} compact />
                    ))}
                  </View>
                </View>

                <View style={styles.rightMeta}>
                  <Text style={[styles.distance, { color: colors.textSoft }]}>{distanceText(item)}</Text>
                  <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                </View>
              </Pressable>
            );
          }}
          ListEmptyComponent={(
            <View style={styles.empty}>
              <Ionicons name="location-outline" size={28} color={colors.textMuted} />
              <Text style={{ color: colors.textSoft }}>
                {query.trim() ? "Geen resultaten gevonden." : "Nog geen haltes beschikbaar."}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 50, paddingHorizontal: 14, gap: 10 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandCopy: { flex: 1 },
  logo: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, lineHeight: 26, fontWeight: "900", letterSpacing: -0.6 },
  subtitle: { fontSize: 12.5, marginTop: 1, fontWeight: "600" },

  searchBox: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  searchInput: { flex: 1, fontSize: 14.5, paddingVertical: 0 },

  topTabs: { borderRadius: 13, padding: 3, flexDirection: "row" },
  topTab: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  topTabText: { fontWeight: "900", fontSize: 12.5 },

  listContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 92 },
  stopRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  modeIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginRight: 10 },
  stopMain: { flex: 1, minWidth: 0 },
  stopName: { fontSize: 15.5, lineHeight: 18, fontWeight: "900", letterSpacing: -0.2 },
  stopCity: { fontSize: 11.5, lineHeight: 14, marginTop: 1, fontWeight: "600" },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 5, overflow: "hidden" },
  rightMeta: { width: 88, marginLeft: 8, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3 },
  distance: { flex: 1, fontSize: 10.5, lineHeight: 13, fontWeight: "800", textAlign: "right" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { paddingTop: 54, alignItems: "center", gap: 8 }
});
