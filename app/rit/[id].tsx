import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LeafletMap } from "../../components/LeafletMap";
import { LijnBadge } from "../../components/LijnBadge";
import { useApp } from "../../context/AppProvider";
import { getRit } from "../../lib/api";
import { JourneyStop, RitData } from "../../types/api";

function stopLabel(stop: JourneyStop) {
  if (stop.state === "current") return "Nu hier";
  if (stop.state === "end") return "Eindhalte";
  return "";
}

export default function RitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, toggleFavoriteLine, favoriteLines } = useApp();
  const [data, setData] = useState<RitData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    let active = true;

    const load = async (showLoader = false) => {
      try {
        if (showLoader) setLoading(true);
        const result = await getRit(id);
        if (active) setData(result);
      } catch (error) {
        console.error("Rit laden mislukt", error);
      } finally {
        if (active && showLoader) setLoading(false);
      }
    };

    void load(true);
    const timer = setInterval(() => void load(false), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);

  const center = useMemo(() => {
    if (data?.vehicle) return { lat: data.vehicle.lat, lon: data.vehicle.lon };
    const currentStop = data?.stops.find((stop) => stop.state === "current" && stop.lat !== undefined && stop.lon !== undefined);
    if (currentStop) return { lat: currentStop.lat!, lon: currentStop.lon! };
    const first = data?.polyline[0];
    return { lat: first?.latitude ?? 52.0907, lon: first?.longitude ?? 5.1214 };
  }, [data]);

  const mapMarkers = useMemo(() => (data?.stops || [])
    .filter((stop) => stop.lat !== undefined && stop.lon !== undefined)
    .map((stop) => ({
      id: stop.id,
      lat: stop.lat!,
      lon: stop.lon!,
      title: stop.name,
      color: stop.state === "current"
        ? colors.accent
        : stop.state === "passed"
          ? "#A6B2AB"
          : stop.state === "end"
            ? colors.accent
            : "#75847B"
    })), [data, colors.accent]);

  if (loading || !data) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  const isFavoriteLine = favoriteLines.includes(data.line);
  const isLive = data.live === true || Boolean(data.vehicle);
  const statusText = isLive ? "Live" : "Dienstregeling";
  const activeIndex = data.stops.findIndex((stop) => stop.state === "current");

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>

          <View style={styles.headerCopy}>
            <View style={styles.lineRow}>
              <LijnBadge line={data.line} carrier={data.carrier} />
              <View style={[styles.statusChip, { backgroundColor: isLive ? colors.successSoft : colors.surfaceAlt }]}> 
                {isLive ? <View style={[styles.liveDot, { backgroundColor: colors.success }]} /> : <Ionicons name="time-outline" size={12} color={colors.textSoft} />}
                <Text style={[styles.statusText, { color: isLive ? colors.success : colors.textSoft }]}>{statusText}</Text>
              </View>
            </View>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>→ {data.destination}</Text>
            <Text style={[styles.subtitle, { color: colors.textSoft }]} numberOfLines={1}>
              {[data.carrier, data.delayLabel || data.liveLabel].filter(Boolean).join(" · ")}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Favoriete lijn"
            android_ripple={{ color: "transparent", borderless: true }}
            onPress={() => toggleFavoriteLine(data.line)}
            style={({ pressed }) => [styles.favoriteButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name={isFavoriteLine ? "heart" : "heart-outline"} size={24} color={isFavoriteLine ? colors.danger : colors.textSoft} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.mapWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
        <LeafletMap polyline={data.polyline} markers={mapMarkers} vehicle={data.vehicle} center={center} />
        <View pointerEvents="none" style={[styles.mapLabel, { backgroundColor: colors.surface }]}> 
          <Ionicons name={isLive ? "navigate" : "map-outline"} size={13} color={isLive ? colors.accent : colors.textSoft} />
          <Text style={[styles.mapLabelText, { color: colors.text }]}>{isLive ? "Live positie op de route" : "Route volgens dienstregeling"}</Text>
        </View>
      </View>

      <View style={styles.timelineHeader}>
        <Text style={[styles.timelineTitle, { color: colors.text }]}>Ritverloop</Text>
        <Text style={[styles.timelineMeta, { color: colors.textSoft }]}> 
          {activeIndex >= 0 ? `${activeIndex + 1} van ${data.stops.length} haltes` : `${data.stops.length} haltes`}
        </Text>
      </View>

      <FlatList
        data={data.stops}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.timeline}
        renderItem={({ item, index }) => {
          const label = stopLabel(item);
          const showDelay = typeof item.delayMinutes === "number" && item.delayMinutes > 0;
          const primaryTime = item.actualTime || item.plannedTime;
          const passed = item.state === "passed";
          const current = item.state === "current";

          return (
            <View style={[styles.timelineRow, { opacity: passed ? 0.58 : 1 }]}> 
              <View style={styles.timeColumn}>
                <Text style={[styles.stopTime, { color: colors.text }]}>{primaryTime}</Text>
                {showDelay ? <Text style={[styles.stopDelay, { color: colors.danger }]}>+{item.delayMinutes} min</Text> : null}
              </View>

              <View style={styles.timelineRail}>
                <View style={[
                  styles.timelineDot,
                  {
                    backgroundColor: current || item.state === "end" ? colors.accent : passed ? colors.accentSoft : colors.surface,
                    borderColor: current || item.state === "end" ? colors.accent : passed ? colors.accent : colors.border
                  }
                ]} />
                {index < data.stops.length - 1 ? (
                  <View style={[styles.timelineLine, { backgroundColor: passed || current ? colors.accent : colors.border }]} />
                ) : null}
              </View>

              <View style={[
                styles.stopContent,
                current ? { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft } : { borderColor: "transparent" }
              ]}>
                <View style={styles.stopTopRow}>
                  <Text style={[styles.stopName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                  {item.platform ? (
                    <View style={[styles.platformBadge, { backgroundColor: colors.surfaceAlt }]}> 
                      <Text style={[styles.platformText, { color: colors.text }]}>{data.mode === "train" ? `Spoor ${item.platform}` : item.platform}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.stopBottomRow}>
                  {label ? (
                    <View style={[styles.currentBadge, { backgroundColor: current ? colors.accent : colors.surfaceAlt }]}> 
                      <Text style={[styles.currentBadgeText, { color: current ? "#FFFFFF" : colors.textSoft }]}>{label}</Text>
                    </View>
                  ) : null}
                  {item.actualTime && item.actualTime !== item.plannedTime ? (
                    <Text style={[styles.plannedTime, { color: colors.textSoft }]}>Gepland {item.plannedTime}</Text>
                  ) : !isLive && !label ? (
                    <Text style={[styles.plannedTime, { color: colors.textSoft }]}>Volgens dienstregeling</Text>
                  ) : null}
                </View>

                {item.platformChanged ? (
                  <View style={[styles.changeBadge, { backgroundColor: colors.dangerSoft }]}> 
                    <Ionicons name="swap-horizontal" size={13} color={colors.danger} />
                    <Text style={[styles.changeText, { color: colors.danger }]}>Spoor gewijzigd</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSoft }]}>Geen ritverloop beschikbaar.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 4 },
  headerRow: { flexDirection: "row", gap: 11, alignItems: "flex-start" },
  headerCopy: { flex: 1, minWidth: 0 },
  iconButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  favoriteButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "transparent", borderWidth: 0, elevation: 0 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusChip: { minHeight: 27, paddingHorizontal: 9, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 99 },
  statusText: { fontSize: 10.5, fontWeight: "900" },
  title: { fontSize: 20, lineHeight: 23, fontWeight: "900", marginTop: 8, letterSpacing: -0.3 },
  subtitle: { marginTop: 4, fontSize: 12.5, fontWeight: "600" },
  mapWrap: { marginHorizontal: 16, marginTop: 14, marginBottom: 12, height: 214, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  mapLabel: { position: "absolute", left: 10, bottom: 10, minHeight: 30, borderRadius: 10, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 6, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  mapLabelText: { fontSize: 10.5, fontWeight: "800" },
  timelineHeader: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timelineTitle: { fontSize: 15, fontWeight: "900" },
  timelineMeta: { fontSize: 11.5, fontWeight: "700" },
  timeline: { paddingHorizontal: 16, paddingBottom: 80 },
  timelineRow: { flexDirection: "row", alignItems: "stretch", minHeight: 72 },
  timeColumn: { width: 53, paddingTop: 6, alignItems: "flex-end", paddingRight: 7 },
  stopTime: { fontSize: 13.5, fontWeight: "900", fontVariant: ["tabular-nums"] },
  stopDelay: { marginTop: 3, fontSize: 9.5, fontWeight: "900" },
  timelineRail: { width: 25, alignItems: "center" },
  timelineDot: { marginTop: 8, width: 15, height: 15, borderRadius: 99, borderWidth: 2.5, zIndex: 2 },
  timelineLine: { width: 3, flex: 1, marginTop: 2, minHeight: 51, borderRadius: 99 },
  stopContent: { flex: 1, minWidth: 0, marginLeft: 8, marginBottom: 7, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
  stopTopRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stopName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 18, fontWeight: "800" },
  platformBadge: { borderRadius: 8, minHeight: 24, paddingHorizontal: 7, alignItems: "center", justifyContent: "center" },
  platformText: { fontSize: 9.5, fontWeight: "900" },
  stopBottomRow: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 21, marginTop: 4 },
  currentBadge: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  currentBadgeText: { fontSize: 9.5, fontWeight: "900" },
  plannedTime: { fontSize: 10, fontWeight: "600" },
  changeBadge: { marginTop: 5, alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 4 },
  changeText: { fontSize: 10, fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { padding: 20, textAlign: "center" }
});
