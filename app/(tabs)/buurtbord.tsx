import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { largeText } from "../../lib/textScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LeafletMap } from "../../components/LeafletMap";
import { DepartureLine } from "../../components/DepartureLine";
import { SettingsButton } from "../../components/SettingsButton";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { useFlowNavigation } from "../../context/FlowNavigation";
import { getHalte, getNearby } from "../../lib/api";
import { bestNearbyStopId, buurtbordPreviewRows, reachableOnFoot } from "../../lib/buurtbord";
import { boardRefreshNotice, failureKind } from "../../lib/offline";
import type { FailureKind } from "../../lib/offline";
import { useSmartRefresh } from "../../lib/useSmartRefresh";
import { MANUAL_CITIES, VOORBEELD_LOCATIE_UTRECHT, type LocatieResultaat } from "../../lib/location";
import { useLiveLocation } from "../../lib/useLiveLocation";
import { describeLocationAge, isLocationStale, shouldApplyResponse } from "../../lib/liveLocation";
import { DepartureItem, StopSummary } from "../../types/api";

/** stale: the last refresh for this stop failed; departures are the last known ones. */
type PreviewState = { loading: boolean; departures: DepartureItem[]; stale?: boolean };

export default function BuurtbordScreen() {
  const { colors, addRecentStop, manualCity, setManualCity, toggleFavoriteStop, isFavoriteStop } = useApp();
  const insets = useSafeAreaInsets();
  // Large system font: a smaller map and two-line names leave room for the departures.
  const large = largeText(useWindowDimensions().fontScale);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loadError, setLoadError] = useState(false);
  /** A refresh failed while stops are on screen: their times are no longer being checked. */
  const [refreshFailure, setRefreshFailure] = useState<FailureKind | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<StopSummary[]>([]);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [loading, setLoading] = useState(true);
  const [locatieBron, setLocatieBron] = useState<LocatieResultaat["bron"] | null>(null);
  const [locatieFixAt, setLocatieFixAt] = useState<number | null>(null);
  const [locatieRetry, setLocatieRetry] = useState(0);
  const [showCities, setShowCities] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const previousLocationKey = useRef<string | null>(null);
  /** V5.8.1: only the newest request may write stops and previews (a slow Amsterdam reply never overwrites Zaandam). */
  const nearbyRequest = useRef(0);
  // V5.8.1: live GPS while Buurtbord is visible; disabled while a city is chosen by hand.
  const live = useLiveLocation(!manualCity);
  // V5.9: "laatst bekend" follows the newest GPS fix, not the moment stops were last loaded.
  const liveBron = live.bron ?? locatieBron;
  const liveFixAt = live.fixAt ?? locatieFixAt;
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  useSmartRefresh(async () => { setRefreshTick((value) => value + 1); }, 90000, (manualCity || "gps") + ":" + locatieRetry);
  const router = useRouter();
  const { showStop: showFlowStop } = useFlowNavigation();

  // Manual city resolves instantly; a GPS failure falls back to the Utrecht example, same as before.
  const manualLocation = useMemo<LocatieResultaat | null>(() => {
    if (!manualCity) return null;
    const manual = MANUAL_CITIES.find((city) => city.key === manualCity);
    return manual ? { coords: { latitude: manual.latitude, longitude: manual.longitude }, bron: "handmatig", cityName: manual.name, fixAt: Date.now() } : null;
  }, [manualCity]);

  useEffect(() => {
    let stopped = false;
    const token = ++nearbyRequest.current;
    // "cancelled" stays true for every older request once a newer one has started.
    const isCancelled = () => stopped || !shouldApplyResponse(token, nearbyRequest.current);
    const locationKey = (manualCity || "gps") + ":" + locatieRetry;
    const locationChanged = previousLocationKey.current !== locationKey;
    previousLocationKey.current = locationKey;
    if (locationChanged) {
      setLoading(true);
      setItems([]);
      setPreviews({});
      setLocatieBron(null);
      setRefreshFailure(null);
    }
    if (!manualLocation && !live.coords && !live.errorCode) return; // live fix still loading; wait for it
    const locatie: LocatieResultaat = manualLocation
      || (live.coords && live.bron ? { coords: live.coords, bron: live.bron, fixAt: live.fixAt ?? Date.now() }
        // GPS failed (permission denied, no fix, outside NL): fall back to the Utrecht example, as before.
        : { coords: VOORBEELD_LOCATIE_UTRECHT, bron: "voorbeeld", fixAt: Date.now() });
    void (async () => {
      try {
        setLoadError(false);
        setLocatieBron(locatie.bron);
        setLocatieFixAt(locatie.fixAt);
        const nearby = (await getNearby(locatie.coords.latitude, locatie.coords.longitude)).slice(0, 5);
        if (isCancelled()) return;
        setItems(nearby);
        setPreviews((current) => Object.fromEntries(nearby.map((stop) => [
          stop.id, current[stop.id] || { loading: true, departures: [] }
        ])));
        setLoading(false);

        let stopFailure: FailureKind | null = null;
        await Promise.all(nearby.map(async (stop) => {
          try {
            const board = await getHalte(stop.id);
            if (isCancelled()) return;
            setPreviews((current) => ({
              ...current,
              // Keep more than three rows: past, departed and cancelled rows are filtered at render time.
              [stop.id]: { loading: false, departures: board.departures.slice(0, 12), stale: false }
            }));
          } catch (error) {
            if (__DEV__) console.warn(`Vertrekken laden mislukt voor ${stop.id}`, error);
            stopFailure = stopFailure || failureKind(error);
            // Keep the last known departures instead of emptying the card (e.g. offline).
            if (!isCancelled()) setPreviews((current) => {
              const before = current[stop.id]?.departures || [];
              return { ...current, [stop.id]: { loading: false, departures: before, stale: before.length > 0 } };
            });
          }
        }));
        if (!isCancelled()) {
          setRefreshFailure(stopFailure);
          if (!stopFailure) setUpdatedAt(Date.now());
        }
      } catch (error) {
        if (__DEV__) console.warn("Buurtbord laden mislukt", error);
        if (!isCancelled()) {
          setLoadError(true);
          // Stops already on screen stay, marked as last known.
          setRefreshFailure(failureKind(error));
          setPreviews((current) => Object.fromEntries(Object.entries(current).map(([id, preview]) =>
            [id, { ...preview, loading: false, stale: preview.departures.length > 0 }])));
        }
      } finally {
        if (!isCancelled()) { setLoading(false); setRefreshing(false); }
      }
    })();
    return () => { stopped = true; };
  }, [locatieRetry, manualCity, manualLocation, live.refreshToken, live.errorCode, refreshTick]);

  // Effective (delayed) time; never recommend a cancelled or departed trip.
  const bestStopId = useMemo(() => bestNearbyStopId(items,
    Object.fromEntries(Object.entries(previews).map(([id, preview]) => [id, preview.departures])), nowMs),
  [items, previews, nowMs]);

  // No made-up centre while stops are loading: the map keeps its overview until real stops arrive.
  const center = useMemo(() => {
    const first = items.find((item) => item.lat !== undefined && item.lon !== undefined);
    return first ? { lat: first.lat!, lon: first.lon! } : undefined;
  }, [items]);

  const mapMarkers = useMemo(() => items
    .filter((item) => item.lat !== undefined && item.lon !== undefined)
    .map((item) => ({ id: item.id, lat: item.lat!, lon: item.lon!, title: item.name, color: modaliteitColors[item.mode] })), [items]);

  const openStop = (stop: StopSummary) => {
    addRecentStop(stop);
    showFlowStop(stop); router.navigate("/");
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 24) + 24 }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Buurtbord</Text>
          {large ? null : <Text style={[styles.subtitle, { color: colors.textSoft }]}>Haltes en snelste vertrekopties in de buurt</Text>}
        </View>
        <SettingsButton />
      </View>

      <View style={{ paddingHorizontal: 14, paddingBottom: 9, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Kies een stad voor het Buurtbord"
          onPress={() => setShowCities((value) => !value)}
          style={{ borderColor: colors.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 }}>
          <Text style={{ color: colors.accentText, fontWeight: "800", fontSize: 12 }}>{manualCity
            ? "Stad: " + (MANUAL_CITIES.find((city) => city.key === manualCity)?.name || "Onbekend")
            : "Kies stad"}</Text>
        </Pressable>
        {manualCity ? <Pressable accessibilityRole="button" accessibilityLabel="Gebruik GPS in Buurtbord"
          onPress={() => { setManualCity(null); setLocatieRetry((n) => n + 1); live.requestFresh(); }}
          style={{ borderColor: colors.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 }}>
          <Text style={{ color: colors.accentText, fontWeight: "800", fontSize: 12 }}>Gebruik GPS</Text>
        </Pressable> : null}
        {showCities ? MANUAL_CITIES.map((city) => (
          <Pressable key={city.key} accessibilityRole="button" accessibilityLabel={"Kies stad " + city.name}
            onPress={() => { setManualCity(city.key); setShowCities(false); }}
            style={{ borderColor: colors.border, backgroundColor: manualCity === city.key ? colors.accentSoft : colors.surface,
              borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 8 }}>
            <Text style={{ color: colors.text, fontSize: 12 }}>{city.name}</Text>
          </Pressable>
        )) : null}
      </View>
      {locatieBron === "handmatig" ? (
        <Text style={{ color: colors.textSoft, marginHorizontal: 14, marginBottom: 7, fontSize: 12 }}>
          Handmatig gekozen plaats · geen GPS-positie
        </Text>
      ) : locatieBron === "voorbeeld" ? (
        <View style={{ marginHorizontal: 12, marginBottom: 10, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
          <Text style={{ color: colors.text }}>Je locatie is niet beschikbaar, we tonen Utrecht als voorbeeld.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Locatie opnieuw proberen" onPress={() => { setLocatieRetry((n) => n + 1); live.requestFresh(); }} style={{ paddingVertical: 10, alignSelf: "flex-start" }}>
            <Text style={{ color: colors.accentText, fontWeight: "700" }}>Opnieuw proberen</Text>
          </Pressable>
        </View>
      ) : locatieBron && isLocationStale(liveBron, liveFixAt, nowMs) ? (
        // V5.8.1: an old or missing GPS fix is never shown as if it were current.
        <View style={{ marginHorizontal: 13, marginBottom: 4, padding: 10, borderRadius: 10, backgroundColor: colors.warningSoft, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="time-outline" size={16} color={colors.text} />
          <Text style={{ color: colors.text, flex: 1, fontSize: 12 }}>
            Laatst bekende locatie · {describeLocationAge(liveFixAt ?? nowMs, nowMs)}
          </Text>
        </View>
      ) : null}

      {refreshFailure && items.length ? (
        <View style={{ marginHorizontal: 13, marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: colors.warningSoft, flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.text} />
          <Text style={{ color: colors.text, flex: 1, fontSize: 12 }}>{boardRefreshNotice(refreshFailure, updatedAt)}</Text>
        </View>
      ) : null}
      <View style={[styles.mapWrap, large && styles.mapWrapLarge, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <LeafletMap markers={mapMarkers} center={center} />
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={colors.accentText} /></View> : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); setRefreshTick((value) => value + 1); if (!manualCity) live.requestFresh(); }}
            colors={[colors.accentText]} tintColor={colors.accentText} progressBackgroundColor={colors.surface} />}
          renderItem={({ item }) => {
            const preview = previews[item.id] || { loading: true, departures: [] };
            const rows = buurtbordPreviewRows(preview.departures, nowMs);
            return (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.topRow}>
                  <Pressable onPress={() => openStop(item)} accessibilityRole="button"
                    accessibilityLabel={"Open halte " + item.name + (item.id === bestStopId ? ", beste halte" : "")}
                    style={styles.nameArea}>
                    <View style={[styles.modeDot, { backgroundColor: modaliteitColors[item.mode] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={large ? 2 : 1}>{item.name}</Text>
                      <Text style={[styles.meta, { color: colors.textSoft }]}>{item.walkMinutes ? `${item.walkMinutes} min lopen` : "Nabij"}</Text>
                      {/* With a large font the label goes under the name, so the name keeps the full width. */}
                      {large && item.id === bestStopId ? <View style={[styles.bestBadge, styles.bestBadgeBelow, { backgroundColor: colors.successSoft }]}><Text style={[styles.bestBadgeText, { color: colors.accentText }]}>Beste halte</Text></View> : null}
                    </View>
                  </Pressable>
                  {!large && item.id === bestStopId ? <View style={[styles.bestBadge, { backgroundColor: colors.successSoft }]}><Text style={[styles.bestBadgeText, { color: colors.accentText }]}>Beste halte</Text></View> : null}
                  <Pressable onPress={() => toggleFavoriteStop(item)} hitSlop={6} accessibilityRole="button"
                    accessibilityLabel={(isFavoriteStop(item.id) ? "Verwijder favoriete halte " : "Bewaar als favoriete halte ") + item.name}
                    accessibilityState={{ selected: isFavoriteStop(item.id) }} style={styles.star}>
                    <Ionicons name={isFavoriteStop(item.id) ? "star" : "star-outline"} size={21}
                      color={isFavoriteStop(item.id) ? colors.warning : colors.textSoft} />
                  </Pressable>
                </View>
                {/* The departures belong to the stop: tapping them opens its board too. */}
                <Pressable onPress={() => openStop(item)} accessible={false}>

                {preview.loading ? (
                  <View style={styles.previewLoading}><ActivityIndicator size="small" color={colors.accentText} /><Text style={[styles.previewText, { color: colors.textSoft }]}>Vertrekken laden…</Text></View>
                ) : rows.length ? (
                  <View style={[styles.departureList, { borderTopColor: colors.border }]}>
                    {rows.map((departure, index) => {
                      const nearbyCarrier = item.lines.find((line) => line.line === departure.line)?.carrier;
                      // Departures leaving before you can walk there are dimmed, not hidden.
                      const tooTight = departure.cancelled !== true && reachableOnFoot(departure, item.walkMinutes, nowMs) === false;
                      // Last known times (preview.stale): the countdown is an estimate.
                      return <DepartureLine key={departure.id + "-" + index} item={departure} nowMs={nowMs} stale={preview.stale}
                        tooTight={tooTight} carrier={nearbyCarrier} size="list" last={index === rows.length - 1} />;
                    })}
                  </View>
                ) : (
                  <Text style={[styles.previewText, { color: colors.textSoft }]}>Geen actuele vertrekken.</Text>
                )}
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={loadError ? (
            <View style={{ alignItems: "center" }}>
              <Text style={[styles.empty, { color: colors.textSoft }]}>Haltes in de buurt konden niet worden geladen. Controleer je verbinding.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Buurtbord opnieuw laden"
                onPress={() => { setLocatieRetry((n) => n + 1); live.requestFresh(); }}
                style={{ borderColor: colors.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ color: colors.accentText, fontWeight: "800" }}>Opnieuw proberen</Text>
              </Pressable>
            </View>
          ) : <Text style={[styles.empty, { color: colors.textSoft }]}>Geen haltes in de buurt gevonden.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: { paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 21, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 12, marginTop: 3 },
  mapWrap: { margin: 13, height: 170, borderRadius: 14, overflow: "hidden", borderWidth: 1 },
  mapWrapLarge: { height: 110, marginVertical: 8 },
  listContent: { paddingHorizontal: 13, paddingBottom: 30, gap: 7 },
  card: { borderRadius: 12, borderWidth: 1, padding: 11, gap: 7 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  nameArea: { flexDirection: "row", gap: 9, alignItems: "center", flex: 1 },
  modeDot: { width: 14, height: 14, borderRadius: 999 },
  name: { fontSize: 15, fontWeight: "800" },
  meta: { marginTop: 3, fontSize: 12 },
  bestBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  bestBadgeText: { fontSize: 11, fontWeight: "900" },
  bestBadgeBelow: { alignSelf: "flex-start", marginTop: 5 },
  star: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  previewLoading: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 8 },
  previewText: { fontSize: 12, fontWeight: "600" },
  departureList: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  departureRow: { minHeight: 28, flexDirection: "row", alignItems: "center", gap: 7 },
  destination: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: "700" },
  departureTime: { minWidth: 72, alignItems: "flex-end" },
  clock: { fontSize: 12, fontWeight: "900", fontVariant: ["tabular-nums"] },
  countdown: { marginTop: 1, fontSize: 9.5, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { padding: 20, textAlign: "center" }
});
