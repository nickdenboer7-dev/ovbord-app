import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { VertrekRegel } from "../../components/VertrekRegel";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { getHalte } from "../../lib/api";
import { DepartureItem, HalteBoardData, Mode } from "../../types/api";

type BoardTab = "departures" | "arrivals" | "disruptions";

const modeLabel: Record<Mode, string> = {
  train: "Trein",
  metro: "Metro",
  tram: "Tram",
  bus: "Bus",
  ferry: "Veer"
};

export default function HalteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, toggleFavoriteStop, isFavoriteStop, addRecentStop } = useApp();
  const [data, setData] = useState<HalteBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BoardTab>("departures");
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    let active = true;

    const load = async (showLoader = false) => {
      try {
        if (showLoader) setLoading(true);
        const result = await getHalte(id);
        if (!active) return;
        setData(result);
        addRecentStop(result.stop);
      } catch (error) {
        console.error("Halte laden mislukt", error);
      } finally {
        if (active && showLoader) setLoading(false);
      }
    };

    void load(true);
    const timer = setInterval(() => void load(false), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
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

  const transportSummary = useMemo(() => {
    if (!data) return "";
    const modes = Array.from(new Set([...data.departures, ...data.arrivals].map((item) => item.mode).filter(Boolean))) as Mode[];
    return modes.length ? modes.map((mode) => modeLabel[mode]).join(" · ") : modeLabel[data.stop.mode];
  }, [data]);

  if (loading || !data) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  const favorite = isFavoriteStop(data.stop.id);
  const tabs: { key: BoardTab; label: string; icon: any }[] = [
    { key: "departures", label: "Vertrekken", icon: "arrow-up-circle-outline" },
    { key: "arrivals", label: "Aankomsten", icon: "arrow-down-circle-outline" },
    { key: "disruptions", label: "Storingen", icon: "warning-outline" }
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>

          <View style={styles.headerCopy}>
            <View style={styles.stopTitleRow}>
              <View style={[styles.modeDot, { backgroundColor: modaliteitColors[data.stop.mode] }]} />
              <Text style={[styles.title, data.stop.name.length > 28 ? styles.titleLong : null, { color: colors.text }]} numberOfLines={2}>
                {data.stop.name}
              </Text>
            </View>
            <Text style={[styles.subtitle, { color: colors.textSoft }]} numberOfLines={1}>
              {[data.stop.city, transportSummary].filter(Boolean).join(" · ")}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Favoriete halte"
            onPress={() => toggleFavoriteStop(data.stop)}
            style={({ pressed }) => [styles.favoriteButton, { opacity: pressed ? 0.55 : 1 }]}
          >
            <Ionicons name={favorite ? "star" : "star-outline"} size={25} color={favorite ? colors.warning : colors.textSoft} />
          </Pressable>
        </View>

        <View style={[styles.tabWrap, { backgroundColor: colors.surfaceAlt }]}> 
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[styles.tabButton, { backgroundColor: active ? colors.accent : "transparent" }]}
              >
                <Ionicons name={item.icon} size={14} color={active ? "#FFFFFF" : colors.textSoft} />
                <Text style={[styles.tabButtonText, { color: active ? "#FFFFFF" : colors.textSoft }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {tab === "departures" ? "Vertrekken" : tab === "arrivals" ? "Aankomsten" : "Storingen"}
        </Text>
        <Text style={[styles.sectionCount, { color: colors.textSoft }]}>{activeItems.length}</Text>
      </View>

      <FlatList
        data={activeItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <VertrekRegel
            item={item}
            onPress={item.ritId ? () => router.push({ pathname: "/rit/[id]", params: { id: item.ritId! } }) : undefined}
          />
        )}
        ListEmptyComponent={(
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
            <Ionicons name="checkmark-circle-outline" size={23} color={colors.textMuted} />
            <Text style={{ color: colors.textSoft }}>Geen gegevens beschikbaar.</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 48, paddingHorizontal: 14, paddingBottom: 7, gap: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  headerCopy: { flex: 1, minWidth: 0 },
  iconButton: { width: 39, height: 39, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  favoriteButton: { width: 39, height: 39, alignItems: "center", justifyContent: "center" },
  stopTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  modeDot: { width: 10, height: 10, borderRadius: 99 },
  title: { fontSize: 20, fontWeight: "900", flex: 1, lineHeight: 22, letterSpacing: -0.35 },
  titleLong: { fontSize: 18, lineHeight: 20 },
  subtitle: { marginTop: 2, fontSize: 11.5, lineHeight: 14, fontWeight: "700" },

  tabWrap: { borderRadius: 12, padding: 3, flexDirection: "row", gap: 2 },
  tabButton: { flex: 1, minHeight: 35, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, borderRadius: 9 },
  tabButtonText: { fontWeight: "900", fontSize: 11.5 },

  sectionHead: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 14, fontWeight: "900" },
  sectionCount: { fontSize: 11, fontWeight: "800" },
  listContent: { paddingHorizontal: 14, paddingBottom: 92 },

  emptyBox: { borderWidth: 1, borderRadius: 14, padding: 15, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" }
});
