import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { VertrekRegel } from "../../components/VertrekRegel";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { getHalte } from "../../lib/api";
import { DepartureItem, HalteBoardData } from "../../types/api";

type BoardTab = "departures" | "arrivals" | "disruptions";

export default function HalteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, toggleFavoriteStop, isFavoriteStop, addRecentStop } = useApp();
  const [data, setData] = useState<HalteBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BoardTab>("departures");
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try {
        setLoading(true);
        const result = await getHalte(id);
        setData(result);
        addRecentStop(result.stop);
      } catch (error) {
        console.error("Halte laden mislukt", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const activeItems = useMemo(() => {
    if (!data) return [];
    if (tab === "arrivals") return data.arrivals;
    if (tab === "disruptions") {
      return data.disruptions.map((disruption, index): DepartureItem => ({
        id: `alert-${index}`,
        line: "!",
        destination: disruption,
        plannedTime: "--:--",
        relativeText: "Actieve storing",
        reliability: "low",
        trend: "flat",
        carrier: "Default",
        alert: disruption
      }));
    }
    return data.departures;
  }, [data, tab]);

  if (loading || !data) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  const favorite = isFavoriteStop(data.stop.id);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
          <View style={{ flex: 1 }}><View style={styles.stopTitleRow}><View style={[styles.modeDot, { backgroundColor: modaliteitColors[data.stop.mode] }]} /><Text style={[styles.title, data.stop.name.length > 28 ? styles.titleLong : null, { color: colors.text }]} numberOfLines={2}>{data.stop.name}</Text></View><Text style={[styles.subtitle, { color: colors.textSoft }]}>{data.stop.city || "Halte"}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Favoriete halte" onPress={() => toggleFavoriteStop(data.stop)} style={styles.favoriteButton}><Ionicons name="star-outline" size={26} color={favorite ? colors.accent : colors.textSoft} /></Pressable>
        </View>
        <View style={[styles.tabWrap, { backgroundColor: colors.surfaceAlt }]}>
          {([{ key: "departures", label: "Vertrekken" }, { key: "arrivals", label: "Aankomsten" }, { key: "disruptions", label: "Storingen" }] as const).map((item) => { const active = tab === item.key; return <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tabButton, { backgroundColor: active ? colors.successSoft : "transparent" }]}><Text style={[styles.tabButtonText, { color: active ? colors.accent : colors.textSoft }]}>{item.label}</Text></Pressable>; })}
        </View>
      </View>
      <FlatList
        data={activeItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <VertrekRegel item={item} onPress={() => { if (item.ritId) router.push({ pathname: "/rit/[id]", params: { id: item.ritId } }); }} />}
        ListEmptyComponent={<View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={{ color: colors.textSoft }}>Geen gegevens beschikbaar.</Text></View>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingTop: 54, paddingHorizontal: 16, gap: 14 }, headerRow: { flexDirection: "row", alignItems: "center", gap: 12 }, iconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" }, favoriteButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, stopTitleRow: { flexDirection: "row", alignItems: "center", gap: 9 }, modeDot: { width: 16, height: 16, borderRadius: 999 }, title: { fontSize: 21, fontWeight: "800", flex: 1, lineHeight: 23 }, titleLong: { fontSize: 18, lineHeight: 20 }, subtitle: { marginTop: 4, fontSize: 13 }, tabWrap: { borderRadius: 16, padding: 4, flexDirection: "row" }, tabButton: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12 }, tabButtonText: { fontWeight: "800", fontSize: 13 }, listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32 }, emptyBox: { borderWidth: 1, borderRadius: 20, padding: 16 }, center: { flex: 1, alignItems: "center", justifyContent: "center" }
});
