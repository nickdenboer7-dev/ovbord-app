import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";
import { LijnBadge } from "../../components/LijnBadge";
import { useApp } from "../../context/AppProvider";
import { getRit } from "../../lib/api";
import { RitData } from "../../types/api";

export default function RitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, toggleFavoriteLine, favoriteLines } = useApp();
  const [data, setData] = useState<RitData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    void (async () => {
      try { setData(await getRit(id)); }
      catch (error) { console.error("Rit laden mislukt", error); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const region = useMemo(() => {
    const first = data?.vehicle ? { latitude: data.vehicle.lat, longitude: data.vehicle.lon } : data?.polyline[0];
    return { latitude: first?.latitude ?? 52.0907, longitude: first?.longitude ?? 5.1214, latitudeDelta: 0.09, longitudeDelta: 0.09 };
  }, [data]);

  if (loading || !data) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  const isFavoriteLine = favoriteLines.includes(data.line);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.header}><View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name="chevron-back" size={22} color={colors.text} /></Pressable>
        <View style={{ flex: 1 }}><LijnBadge line={data.line} carrier={data.carrier} /><Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>→ {data.destination}</Text><Text style={[styles.subtitle, { color: colors.textSoft }]}>{data.delayLabel || data.liveLabel}</Text></View>
        <Pressable onPress={() => toggleFavoriteLine(data.line)} style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Ionicons name={isFavoriteLine ? "heart" : "heart-outline"} size={21} color={isFavoriteLine ? "#d92b2b" : colors.text} /></Pressable>
      </View></View>
      <View style={[styles.mapWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <MapView style={styles.map} region={region} provider={undefined} mapType={Platform.OS === "android" ? "none" : "standard"}>
          <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} />
          {data.polyline.length > 1 ? <Polyline coordinates={data.polyline} strokeWidth={5} strokeColor={colors.mapRoute} /> : null}
          {data.vehicle ? <Marker coordinate={{ latitude: data.vehicle.lat, longitude: data.vehicle.lon }} title={`${data.line} → ${data.destination}`} pinColor={colors.accent} /> : null}
          {data.stops.filter((stop) => stop.lat !== undefined && stop.lon !== undefined).map((stop) => <Marker key={stop.id} coordinate={{ latitude: stop.lat!, longitude: stop.lon! }} title={stop.name} pinColor={stop.state === "current" ? colors.accent : "#8EA197"} />)}
        </MapView>
        <Text style={[styles.attribution, { backgroundColor: colors.surface, color: colors.textSoft }]}>© OpenStreetMap contributors</Text>
      </View>
      <FlatList
        data={data.stops}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.timeline}
        renderItem={({ item, index }) => (
          <View style={styles.timelineRow}>
            <View style={styles.timelineRail}><View style={[styles.timelineDot, { backgroundColor: item.state === "current" ? colors.accent : item.state === "passed" ? colors.surfaceAlt : item.state === "end" ? colors.accentSoft : colors.surface, borderColor: item.state === "current" ? colors.accent : colors.border }]} />{index < data.stops.length - 1 ? <View style={[styles.timelineLine, { backgroundColor: item.state === "passed" ? colors.accent : colors.border }]} /> : null}</View>
            <View style={[styles.timelineCard, { backgroundColor: item.state === "current" ? colors.accentSoft : colors.surface, borderColor: colors.border, opacity: item.state === "passed" ? 0.68 : 1 }]}>
              <View style={styles.timelineHead}><View style={{ flex: 1 }}><Text style={[styles.stopName, { color: colors.text }]}>{item.name}</Text><Text style={[styles.stopMeta, { color: colors.textSoft }]}>{item.actualTime || item.plannedTime}{item.state === "current" ? " · Nu hier" : item.state === "end" ? " · Eindhalte" : ""}</Text></View><View style={{ alignItems: "flex-end" }}>{item.platform ? <Text style={[styles.platform, { color: colors.textSoft }]}>{item.platform}</Text> : null}{item.delayMinutes ? <Text style={[styles.delay, { color: colors.danger }]}>+{item.delayMinutes} min</Text> : <Text style={[styles.delay, { color: colors.textSoft }]}>Op tijd</Text>}</View></View>
              {item.platformChanged ? <View style={[styles.changeBadge, { backgroundColor: colors.dangerSoft }]}><Ionicons name="swap-horizontal" size={14} color={colors.danger} /><Text style={[styles.changeText, { color: colors.danger }]}>Spoorwijziging</Text></View> : null}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSoft }]}>Geen ritverloop beschikbaar.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingTop: 54, paddingHorizontal: 16 }, headerRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, iconButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" }, title: { fontSize: 21, fontWeight: "800", marginTop: 8 }, subtitle: { marginTop: 4, fontSize: 13 }, mapWrap: { margin: 16, height: 230, borderRadius: 24, borderWidth: 1, overflow: "hidden", position: "relative" }, map: { flex: 1 }, attribution: { position: "absolute", right: 6, bottom: 5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, fontSize: 9, overflow: "hidden" }, timeline: { paddingHorizontal: 16, paddingBottom: 28, gap: 10 }, timelineRow: { flexDirection: "row", gap: 12 }, timelineRail: { width: 24, alignItems: "center" }, timelineDot: { width: 17, height: 17, borderRadius: 999, borderWidth: 2 }, timelineLine: { width: 3, flex: 1, marginTop: 3, minHeight: 50, borderRadius: 999 }, timelineCard: { flex: 1, borderWidth: 1, borderRadius: 18, padding: 14, gap: 8 }, timelineHead: { flexDirection: "row", gap: 12 }, stopName: { fontSize: 15, fontWeight: "800" }, stopMeta: { marginTop: 4, fontSize: 13 }, platform: { fontSize: 12, fontWeight: "700" }, delay: { marginTop: 4, fontSize: 12, fontWeight: "800" }, changeBadge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 }, changeText: { fontSize: 12, fontWeight: "700" }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, empty: { padding: 20, textAlign: "center" }
});
