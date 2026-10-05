import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LeafletMap } from "../../components/LeafletMap";
import { LijnBadge } from "../../components/LijnBadge";
import { SettingsButton } from "../../components/SettingsButton";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { getHalte, getNearby } from "../../lib/api";
import { minutesUntil } from "../../lib/format";
import { DepartureItem, StopSummary } from "../../types/api";

type PreviewState = { loading: boolean; departures: DepartureItem[] };

export default function BuurtbordScreen() {
  const { colors, addRecentStop } = useApp();
  const [items, setItems] = useState<StopSummary[]>([]);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        let latitude = 52.1601;
        let longitude = 5.3848;
        if (permission.status === "granted") {
          const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = current.coords.latitude;
          longitude = current.coords.longitude;
        }
        const nearby = (await getNearby(latitude, longitude)).slice(0, 5);
        if (cancelled) return;
        setItems(nearby);
        setPreviews(Object.fromEntries(nearby.map((stop) => [stop.id, { loading: true, departures: [] }])));
        setLoading(false);

        await Promise.all(nearby.map(async (stop) => {
          try {
            const board = await getHalte(stop.id);
            if (cancelled) return;
            setPreviews((current) => ({
              ...current,
              [stop.id]: { loading: false, departures: board.departures.slice(0, 3) }
            }));
          } catch (error) {
            console.error(`Vertrekken laden mislukt voor ${stop.id}`, error);
            if (!cancelled) setPreviews((current) => ({ ...current, [stop.id]: { loading: false, departures: [] } }));
          }
        }));
      } catch (error) {
        console.error("Buurtbord laden mislukt", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const bestStopId = useMemo(() => {
    const candidates = items.map((stop) => {
      const departures = previews[stop.id]?.departures || [];
      const realMinutes = departures
        .map((departure) => minutesUntil(departure.plannedTime))
        .filter((minutes) => minutes >= (stop.walkMinutes ?? 1));
      if (!realMinutes.length) return null;
      const soonest = Math.min(...realMinutes);
      return { id: stop.id, score: soonest + (stop.walkMinutes ?? 1) };
    }).filter((value): value is { id: string; score: number } => Boolean(value));
    return candidates.sort((a, b) => a.score - b.score)[0]?.id || "";
  }, [items, previews]);

  const center = useMemo(() => {
    const first = items.find((item) => item.lat !== undefined && item.lon !== undefined);
    return { lat: first?.lat ?? 52.1601, lon: first?.lon ?? 5.3848 };
  }, [items]);

  const mapMarkers = useMemo(() => items
    .filter((item) => item.lat !== undefined && item.lon !== undefined)
    .map((item) => ({ id: item.id, lat: item.lat!, lon: item.lon!, title: item.name, color: modaliteitColors[item.mode] })), [items]);

  const openStop = (stop: StopSummary) => {
    addRecentStop(stop);
    router.push({ pathname: "/halte/[id]", params: { id: stop.id } });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Buurtbord</Text>
          <Text style={[styles.subtitle, { color: colors.textSoft }]}>Haltes en snelste vertrekopties in de buurt</Text>
        </View>
        <SettingsButton />
      </View>

      <View style={[styles.mapWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
        <LeafletMap markers={mapMarkers} center={center} />
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.accent} /></View> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const preview = previews[item.id] || { loading: true, departures: [] };
            return (
              <Pressable onPress={() => openStop(item)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                <View style={styles.topRow}>
                  <View style={styles.nameArea}>
                    <View style={[styles.modeDot, { backgroundColor: modaliteitColors[item.mode] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                      <Text style={[styles.meta, { color: colors.textSoft }]}>{item.walkMinutes ? `${item.walkMinutes} min lopen` : "Nabij"}</Text>
                    </View>
                  </View>
                  {item.id === bestStopId ? <View style={[styles.bestBadge, { backgroundColor: colors.successSoft }]}><Text style={[styles.bestBadgeText, { color: colors.accent }]}>Beste halte</Text></View> : null}
                </View>

                {preview.loading ? (
                  <View style={styles.previewLoading}><ActivityIndicator size="small" color={colors.accent} /><Text style={[styles.previewText, { color: colors.textSoft }]}>Vertrekken laden…</Text></View>
                ) : preview.departures.length ? (
                  <View style={styles.departureList}>
                    {preview.departures.map((departure) => {
                      const nearbyCarrier = item.lines.find((line) => line.line === departure.line)?.carrier;
                      return (
                      <View key={departure.id} style={styles.departureRow}>
                        <LijnBadge line={departure.line} carrier={departure.carrier || nearbyCarrier} compact />
                        <Text style={[styles.destination, { color: colors.text }]} numberOfLines={1}>{departure.destination}</Text>
                        <View style={styles.departureTime}>
                          <Text style={[styles.clock, { color: colors.text }]}>{departure.plannedTime}</Text>
                          {departure.relativeText ? <Text style={[styles.countdown, { color: colors.textSoft }]}>{departure.relativeText}</Text> : null}
                        </View>
                      </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={[styles.previewText, { color: colors.textSoft }]}>Geen actuele vertrekken.</Text>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSoft }]}>Geen haltes in de buurt gevonden.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: { paddingTop: 58, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 27, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 13, marginTop: 4 },
  mapWrap: { margin: 16, height: 220, borderRadius: 24, overflow: "hidden", borderWidth: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 30, gap: 10 },
  card: { borderRadius: 18, borderWidth: 1, padding: 13, gap: 10 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  nameArea: { flexDirection: "row", gap: 9, alignItems: "center", flex: 1 },
  modeDot: { width: 14, height: 14, borderRadius: 999 },
  name: { fontSize: 15, fontWeight: "800" },
  meta: { marginTop: 3, fontSize: 12 },
  bestBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  bestBadgeText: { fontSize: 11, fontWeight: "900" },
  previewLoading: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 },
  previewText: { fontSize: 12, fontWeight: "600" },
  departureList: { gap: 7 },
  departureRow: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 7 },
  destination: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: "700" },
  departureTime: { width: 72, alignItems: "flex-end" },
  clock: { fontSize: 12, fontWeight: "900", fontVariant: ["tabular-nums"] },
  countdown: { marginTop: 1, fontSize: 9.5, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { padding: 20, textAlign: "center" }
});
