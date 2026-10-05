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
          <View style={[styles.logo, { backgroundColor: colors.accent }]}><Ionicons name="train" size={20} color="#fff" /></View>
          <View style={styles.brandCopy}><Text style={[styles.title, { color: colors.text }]}>OVbord</Text><Text style={[styles.subtitle, { color: colors.textSoft }]}>Live OV in één oogopslag</Text></View>
          <SettingsButton />
        </View>
        <Pressable onPress={() => inputRef.current?.focus()} style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textSoft} />
          <TextInput ref={inputRef} value={query} onChangeText={setQuery} placeholder="Zoek halte of station..." placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.text }]} returnKeyType="search" />
          {query ? <Pressable onPress={() => setQuery("")}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></Pressable> : null}
        </Pressable>
        <View style={[styles.topTabs, { backgroundColor: colors.surfaceAlt }]}> 
          {([{ key: "nabij", label: "Nabij" }, { key: "recent", label: "Recent" }, { key: "favoriet", label: "Favoriet" }] as const).map((tab) => {
            const active = selectedTab === tab.key;
            return <Pressable key={tab.key} onPress={() => { setSelectedTab(tab.key); setQuery(""); }} style={[styles.topTab, { backgroundColor: active ? colors.accentSoft : "transparent" }]}><Text style={[styles.topTabText, { color: active ? colors.accent : colors.textSoft }]}>{tab.label}</Text></Pressable>;
          })}
        </View>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator color={colors.accent} /></View> : (
        <FlatList
          data={dataset}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable onPress={() => openStop(item)} style={[styles.stopCard, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.cardShadow }]}>
              <View style={styles.stopRow}>
                <View style={[styles.modeIcon, { backgroundColor: modaliteitColors[item.mode] }]}><Ionicons name={item.mode === "train" ? "train" : item.mode === "ferry" ? "boat" : "bus"} size={17} color="#fff" /></View>
                <View style={styles.stopMain}>
                  <Text style={[styles.stopName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.stopCity, { color: colors.textSoft }]}>{item.city}</Text>
                  <View style={styles.badgeRow}>{item.lines.slice(0, 5).map((line, index) => <LijnBadge key={`${line.line}-${index}`} line={line.line} carrier={line.carrier} compact />)}</View>
                </View>
                <Text style={[styles.walkText, { color: colors.textSoft }]}>{item.walkMinutes ? `${item.walkMinutes} min\nlopen` : "Nabij"}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="location-outline" size={32} color={colors.textMuted} /><Text style={{ color: colors.textSoft }}>{query.trim() ? "Geen resultaten gevonden." : "Nog geen haltes beschikbaar."}</Text></View>}
        />
      )}
      <Pressable onPress={() => inputRef.current?.focus()} style={[styles.fab, { backgroundColor: colors.accent, shadowColor: colors.cardShadow }]}><Ionicons name="search" size={24} color={colors.fabText} /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingTop: 58, paddingHorizontal: 16, gap: 14 }, brandRow: { flexDirection: "row", alignItems: "center", gap: 12 }, brandCopy: { flex: 1 },
  logo: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" }, title: { fontSize: 27, fontWeight: "800", letterSpacing: -0.7 }, subtitle: { fontSize: 13, marginTop: 1 },
  searchBox: { height: 54, borderRadius: 17, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }, searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  topTabs: { borderRadius: 16, padding: 4, flexDirection: "row" }, topTab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" }, topTabText: { fontWeight: "700", fontSize: 13 },
  listContent: { padding: 16, gap: 12, paddingBottom: 110 }, stopCard: { borderWidth: 1, borderRadius: 20, padding: 14, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  stopRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 }, modeIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" }, stopMain: { flex: 1, gap: 3 }, stopName: { fontSize: 16, fontWeight: "800" }, stopCity: { fontSize: 13 }, badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 7 }, walkText: { fontSize: 12, fontWeight: "700", width: 58, textAlign: "right", lineHeight: 17 },
  fab: { position: "absolute", right: 20, bottom: 84, width: 60, height: 60, borderRadius: 20, alignItems: "center", justifyContent: "center", shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, empty: { paddingTop: 70, alignItems: "center", gap: 10 }
});
