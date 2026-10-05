import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, UrlTile } from "react-native-maps";
import { LijnBadge } from "../../components/LijnBadge";
import { SettingsButton } from "../../components/SettingsButton";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { getNearby } from "../../lib/api";
import { StopSummary } from "../../types/api";

const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function BuurtbordScreen() {
  const { colors, addRecentStop } = useApp();
  const [items, setItems] = useState<StopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
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
        setItems(await getNearby(latitude, longitude));
      } catch (error) {
        console.error("Buurtbord laden mislukt", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const bestStopId = useMemo(() => {
    const withDistance = items.filter((item) => item.walkMinutes !== undefined);
    return [...withDistance].sort((a, b) => (a.walkMinutes ?? 999) - (b.walkMinutes ?? 999))[0]?.id || "";
  }, [items]);

  const region = useMemo(() => {
    const first = items.find((item) => item.lat !== undefined && item.lon !== undefined);
    return { latitude: first?.lat ?? 52.1601, longitude: first?.lon ?? 5.3848, latitudeDelta: 0.035, longitudeDelta: 0.035 };
  }, [items]);

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
        <MapView
          style={styles.map}
          region={region}
          provider={undefined}
          mapType={Platform.OS === "android" ? "none" : "standard"}
        >
          <UrlTile urlTemplate={OSM_URL} maximumZ={19} />
          {items.filter((item) => item.lat !== undefined && item.lon !== undefined).map((item) => (
            <Marker
              key={item.id}
              coordinate={{ latitude: item.lat!, longitude: item.lon! }}
              title={item.name}
              description={item.city}
              pinColor={modaliteitColors[item.mode]}
            />
          ))}
        </MapView>
        <Text style={[styles.attribution, { backgroundColor: colors.surface, color: colors.textSoft }]}>© OpenStreetMap contributors</Text>
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.accent} /></View> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable onPress={() => openStop(item)} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
              <View style={styles.topRow}>
                <View style={styles.nameArea}>
                  <View style={[styles.modeDot, { backgroundColor: modaliteitColors[item.mode] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.meta, { color: colors.textSoft }]}>{item.walkMinutes ? `${item.walkMinutes} min lopen` : "Nabij"}</Text>
                  </View>
                </View>
                {item.id === bestStopId ? <View style={[styles.bestBadge, { backgroundColor: colors.successSoft }]}><Text style={[styles.bestBadgeText, { color: colors.success }]}>Beste halte</Text></View> : null}
              </View>
              <View style={styles.departureRow}>
                {item.lines.slice(0, 3).map((line, index) => (
                  <View key={`${line.line}-${index}`} style={styles.departureChip}>
                    <LijnBadge line={line.line} carrier={line.carrier} compact />
                    <Text style={[styles.departureMeta, { color: colors.textSoft }]}>{2 + index * 4} min</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          )}
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
  mapWrap: { margin: 16, height: 220, borderRadius: 24, overflow: "hidden", borderWidth: 1, position: "relative" },
  map: { flex: 1 },
  attribution: { position: "absolute", right: 6, bottom: 5, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4, fontSize: 9, overflow: "hidden" },
  listContent: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },
  card: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 12 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  nameArea: { flexDirection: "row", gap: 10, alignItems: "center", flex: 1 },
  modeDot: { width: 16, height: 16, borderRadius: 999 },
  name: { fontSize: 16, fontWeight: "800" },
  meta: { marginTop: 4, fontSize: 13 },
  bestBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  bestBadgeText: { fontSize: 12, fontWeight: "800" },
  departureRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  departureChip: { flexDirection: "row", alignItems: "center", gap: 5 },
  departureMeta: { fontSize: 12, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { padding: 20, textAlign: "center" }
});
