import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { largeText } from "../../lib/textScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NearbySkeleton } from "../../components/NearbySkeleton";
import { hydrateNearbyCache, nearbyScope, peekNearby, peekLastLocation, rememberNearby, sameNearbyLocation } from "../../lib/nearbyCache";
import type { NearbyPreview } from "../../lib/nearbyCache";
import { LijnBadge } from "../../components/LijnBadge";
import { SettingsButton } from "../../components/SettingsButton";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { DEFAULT_USER_SETTINGS } from "../../lib/userSettings";
import { STOP_BOARD_BLUE } from "../../lib/stopBoardDesign";
import { useFlowNavigation } from "../../context/FlowNavigation";
import { getHalte, getNearby } from "../../lib/api";
import { compactNearbyStopName, firstNearbyDeparture, compareNearbyDepartures } from "../../lib/buurtbord";
import { departureTimeRemainingMs } from "../../lib/boardSmartness";
import { showsLive } from "../../lib/departureLine";
import { departureCountdown, effectiveDepartureClock } from "../../lib/format";
import { boardRefreshNotice, failureKind } from "../../lib/offline";
import type { FailureKind } from "../../lib/offline";
import { useSmartRefresh } from "../../lib/useSmartRefresh";
import { MANUAL_CITIES, type LocatieResultaat } from "../../lib/location";
import { useLiveLocation } from "../../lib/useLiveLocation";
import { describeLocationAge, isLocationStale, shouldApplyResponse } from "../../lib/liveLocation";
import { StopSummary } from "../../types/api";

/** stale: the last refresh for this stop failed; departures are the last known ones. */
type PreviewState = NearbyPreview;

export default function BuurtbordScreen() {
  const { colors, addRecentStop, manualCity, setManualCity, toggleFavoriteStop, isFavoriteStop, settings = DEFAULT_USER_SETTINGS } = useApp();
  const insets = useSafeAreaInsets();
  const scope = nearbyScope(manualCity);
  const [initialCache] = useState(() => peekNearby(scope));
  const [cacheReady, setCacheReady] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [itemsScope, setItemsScope] = useState(scope);
  const [viewLocation, setViewLocation] = useState<LocatieResultaat | null>(() => initialCache?.location || peekLastLocation());
  useEffect(() => {
    let active = true;
    void hydrateNearbyCache().then(() => { if (active) setCacheReady(true); });
    return () => { active = false; };
  }, []);
  // Allow longer stop names at larger system font settings without unlimited growth.
  const large = largeText(useWindowDimensions().fontScale);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loadError, setLoadError] = useState(false);
  /** A refresh failed while stops are on screen: their times are no longer being checked. */
  const [refreshFailure, setRefreshFailure] = useState<FailureKind | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(initialCache?.updatedAt || null);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<StopSummary[]>(initialCache?.items || []);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>(initialCache?.previews || {});
  const [loading, setLoading] = useState(!initialCache);
  const [locatieBron, setLocatieBron] = useState<LocatieResultaat["bron"] | null>(initialCache ? manualCity ? "handmatig" : "laatst-bekend" : null);
  const [locatieFixAt, setLocatieFixAt] = useState<number | null>(initialCache?.location.fixAt || null);
  const [locatieRetry, setLocatieRetry] = useState(0);
  const [showCities, setShowCities] = useState(false);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  const [refreshTick, setRefreshTick] = useState(0);
  const previousLocationKey = useRef<string | null>(initialCache ? scope : null);
  const itemsRef = useRef(items); itemsRef.current = items;
  const previewsRef = useRef(previews); previewsRef.current = previews;
  const viewLocationRef = useRef(viewLocation); viewLocationRef.current = viewLocation;
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

  // A chosen city or last known GPS fix supplies the first view; never choose a fallback city.
  const manualLocation = useMemo<LocatieResultaat | null>(() => {
    if (!manualCity) return null;
    const manual = MANUAL_CITIES.find((city) => city.key === manualCity);
    return manual ? { coords: { latitude: manual.latitude, longitude: manual.longitude }, bron: "handmatig", cityName: manual.name, fixAt: Date.now() } : null;
  }, [manualCity]);

  useEffect(() => {
    let stopped = false;
    const token = ++nearbyRequest.current;
    const isCancelled = () => stopped || !shouldApplyResponse(token, nearbyRequest.current);
    const locatie: LocatieResultaat | null = manualLocation
      || (live.coords && live.bron ? { coords: live.coords, bron: live.bron, fixAt: live.fixAt ?? Date.now() }
        : cacheReady ? peekLastLocation() : null);
    if (!locatie) {
      if (cacheReady && live.errorCode) setLoading(false);
      return;
    }
    const cached = peekNearby(scope, locatie);
    const locationChanged = previousLocationKey.current !== scope || Boolean(viewLocationRef.current && !sameNearbyLocation(viewLocationRef.current, locatie));
    previousLocationKey.current = scope;
    const previousPreviews = locationChanged ? cached?.previews || {} : previewsRef.current;
    if (locationChanged || !itemsRef.current.length && cached) {
      setItems(cached?.items || []);
      setPreviews(cached?.previews || {});
      setLoading(!cached);
      setUpdatedAt(cached?.updatedAt || null);
      setRefreshFailure(null);
    }
    setItemsScope(scope);
    setViewLocation(locatie);
    setLocatieBron(locatie.bron);
    setLocatieFixAt(locatie.fixAt);
    setUpdating(true);
    void (async () => {
      try {
        setLoadError(false);
        const nearby = (await getNearby(locatie.coords.latitude, locatie.coords.longitude)).slice(0, 5);
        if (isCancelled()) return;
        const collected: Record<string, PreviewState> = Object.fromEntries(nearby.map(stop => [
          stop.id, previousPreviews[stop.id] || { loading: true, departures: [] }
        ]));
        setItems(nearby);
        setPreviews(collected);
        setLoading(false);
        let stopFailure: FailureKind | null = null;
        await Promise.all(nearby.map(async (stop) => {
          try {
            const board = await getHalte(stop.id);
            if (isCancelled()) return;
            collected[stop.id] = { loading: false, departures: board.departures.slice(0, 12), stale: false };
          } catch (error) {
            if (isCancelled()) return;
            stopFailure = stopFailure || failureKind(error);
            const before = collected[stop.id]?.departures || [];
            collected[stop.id] = { loading: false, departures: before, stale: before.length > 0 };
          }
          if (!isCancelled()) setPreviews({ ...collected });
        }));
        if (!isCancelled()) {
          setRefreshFailure(stopFailure);
          const updated = stopFailure ? cached?.updatedAt || Date.now() : Date.now();
          setUpdatedAt(updated);
          rememberNearby({ scope, location: locatie, items: nearby, previews: collected, updatedAt: updated });
        }
      } catch (error) {
        if (isCancelled()) return;
        if (locationChanged ? !cached?.items.length : !itemsRef.current.length) setLoadError(true);
        else {
          setRefreshFailure(failureKind(error));
          setPreviews(current => Object.fromEntries(Object.entries(current).map(([id, preview]) =>
            [id, { ...preview, loading: false, stale: preview.departures.length > 0 }])));
        }
      } finally {
        if (!isCancelled()) { setLoading(false); setRefreshing(false); setUpdating(false); }
      }
    })();
    return () => { stopped = true; };
  }, [locatieRetry, manualCity, manualLocation, live.refreshToken, live.errorCode, refreshTick, cacheReady]);

  const activeLocation = manualLocation || (live.coords && live.bron ? { coords: live.coords, bron: live.bron, fixAt: live.fixAt || 0 }
    : scope === "gps" ? peekLastLocation() : null) || (itemsScope === scope ? viewLocation : null);
  const visibleItems = itemsScope === scope && (!activeLocation || !viewLocation || sameNearbyLocation(activeLocation, viewLocation)) ? items : [];

  // Estimates are meaningful only for a recent GPS fix, not a manually chosen city or old cache.
  const hasCurrentGps = !manualCity && liveBron === "gps" && liveFixAt !== null
    && !isLocationStale(liveBron, liveFixAt, nowMs);
  const options = useMemo(() => compareNearbyDepartures(visibleItems,
    Object.fromEntries(Object.entries(previews).map(([id, preview]) => [id, preview.departures])), nowMs,
    new Set(Object.entries(previews).filter(([, preview]) => preview.stale || preview.loading).map(([id]) => id)),
    { maxWalkMinutes: settings.maxWalkMinutes, smartStopChoice: settings.smartStopChoice }),
    [visibleItems, previews, nowMs, settings.maxWalkMinutes, settings.smartStopChoice]);
  const previewsAreFresh = !updating && !refreshFailure && updatedAt !== null && nowMs - updatedAt <= 120_000;
  const bestOption = hasCurrentGps && previewsAreFresh ? options[0] : undefined;
  // Only recommend a best stop when GPS and departures are sufficiently fresh.
  const highlightedStopId = bestOption?.stop.id || "";
  const cityName = manualLocation?.cityName || visibleItems[0]?.city || "Jouw omgeving";
  const refreshedAt = updatedAt !== null && nowMs - updatedAt <= 120_000 && !refreshFailure;

  const openStop = (stop: StopSummary) => {
    addRecentStop(stop);
    showFlowStop(stop); router.navigate("/");
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {focused ? <ExpoStatusBar style="light" /> : null}
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 24) + 10 }]}>
        <View style={styles.headerCopy}>
          <Text maxFontSizeMultiplier={1.3} style={styles.title}>Buurtbord</Text>
          {!large ? <Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>Jouw haltes in één oogopslag</Text> : null}
        </View>
        <SettingsButton inverted />
      </View>
      <ScrollView style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 14, paddingBottom: Math.max(insets.bottom, 16) + 78 }}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); setRefreshTick((value) => value + 1); if (!manualCity) live.requestFresh(); }}
          colors={[colors.accentText]} tintColor={colors.accentText} progressBackgroundColor={colors.surface} />}>
        <View style={styles.locationLine}>
          <View style={[styles.locationDot, { backgroundColor: hasCurrentGps ? "#27A96B" : "#A3AFBF" }]} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.locationText, { color: colors.textSoft }]}
            numberOfLines={2}>{cityName} · {visibleItems.length} haltes dichtbij
            {manualCity ? " · handmatig" : !hasCurrentGps ? " · laatst bekend" : ""}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Kies een andere stad"
            onPress={() => setShowCities((value) => !value)} style={styles.cityButton}>
            <Ionicons name="location-outline" size={18} color={STOP_BOARD_BLUE} />
          </Pressable>
        </View>

        {showCities ? <View style={styles.cities}>
          {manualCity ? <Pressable accessibilityRole="button" onPress={() => {
            setManualCity(null); setShowCities(false); setLocatieRetry((n) => n + 1); live.requestFresh();
          }} style={[styles.cityChoice, { borderColor: colors.border }]}>
            <Text maxFontSizeMultiplier={1.3} style={{ color: colors.accentText }}>Gebruik GPS</Text>
          </Pressable> : null}
          {MANUAL_CITIES.map((city) => (
            <Pressable key={city.key} accessibilityRole="button" accessibilityLabel={"Kies stad " + city.name}
              onPress={() => { setManualCity(city.key); setShowCities(false); }}
              style={[styles.cityChoice, { borderColor: colors.border,
                backgroundColor: manualCity === city.key ? colors.accentSoft : colors.surface }]}>
              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.text }}>{city.name}</Text>
            </Pressable>
          ))}
        </View> : null}

        {!manualCity && liveBron && liveBron !== "handmatig" && isLocationStale(liveBron, liveFixAt, nowMs) ? (
          <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="time-outline" size={16} color={colors.text} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.noticeText, { color: colors.text }]}>
              Laatst bekende locatie · {describeLocationAge(liveFixAt ?? nowMs, nowMs)}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="GPS-locatie opnieuw ophalen"
              onPress={live.requestFresh} style={[styles.noticeAction, { backgroundColor: colors.surface }]}>
              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.accentText, fontSize: 12, fontWeight: "800" }}>Ververs GPS</Text>
            </Pressable>
          </View>
        ) : null}
        {refreshFailure && visibleItems.length ? (
          <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.text} />
            <Text maxFontSizeMultiplier={1.3} style={[styles.noticeText, { color: colors.text }]}>
              {boardRefreshNotice(refreshFailure, updatedAt)}
            </Text>
          </View>
        ) : null}

        <View style={styles.sectionHeading}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.sectionTitle, { color: colors.heading }]}>DICHTBIJ JOU</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Buurtbord verversen"
            onPress={() => { setRefreshing(true); setRefreshTick((value) => value + 1); if (!manualCity) live.requestFresh(); }}
            style={styles.refreshButton}>
            <Ionicons name="refresh-outline" size={15} color={STOP_BOARD_BLUE} />
            <Text maxFontSizeMultiplier={1.3} style={styles.refreshLabel}>Ververs</Text>
          </Pressable>
        </View>
        {(updating || !cacheReady) && visibleItems.length ? <Text maxFontSizeMultiplier={1.3}
          style={[styles.updateText, { color: colors.textMuted }]}>Bijwerken…</Text> : null}

        {loading && !visibleItems.length ? <NearbySkeleton label="Haltes laden…" /> : (
          <View style={[styles.listContent, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {visibleItems.map((item, index) => {
              const preview = previews[item.id] || { loading: true, departures: [] };
              const first = firstNearbyDeparture(preview.departures, nowMs);
              const stale = preview.stale === true || !refreshedAt;
              const liveDeparture = first ? showsLive(first, stale) && first.reliabilityDetail?.estimatedPosition !== true : false;
              const estimated = first?.reliabilityDetail?.estimatedPosition === true ||
                (first?.isLive === undefined && Boolean(first?.expectedTime && first.expectedTime !== first.plannedTime));
              const remaining = first ? departureTimeRemainingMs(first, nowMs) : null;
              const when = first ? (liveDeparture && remaining !== null && remaining <= 60 * 60 * 1000
                ? departureCountdown(first, nowMs) : effectiveDepartureClock(first)) : "--:--";
              const status = stale ? "Laatst bekend" : first?.liveDataStale ? "Live-info oud"
                : estimated ? "Geschat" : liveDeparture ? "Live" : "Gepland";
              const isBest = item.id === highlightedStopId;
              const lineOptions = first ? [{ line: first.line, carrier: first.carrier }, ...item.lines] : item.lines;
              const lines = lineOptions.filter((line, lineIndex) =>
                lineOptions.findIndex((candidate) => candidate.line === line.line) === lineIndex).slice(0, 4);
              const stopIcon = item.mode === "train" ? "train-outline" : item.mode === "ferry" ? "boat-outline"
                : item.mode === "metro" ? "subway-outline" : "bus-outline";
              return (
                <View key={item.id} style={[styles.stopItem,
                  index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                  isBest && styles.bestStop,
                  isBest && { backgroundColor: colors.background === "#FFFFFF" ? "#F7FAFF" : colors.surfaceAlt }]}>
                  <Pressable onPress={() => openStop(item)} accessibilityRole="button"
                    accessibilityLabel={"Open halte " + item.name + (isBest ? ", beste halte" : "")}
                    style={styles.stopMain}>
                    <View style={styles.modeIcon}>
                      <Ionicons name={stopIcon} size={21} color={modaliteitColors[item.mode] || STOP_BOARD_BLUE} />
                    </View>
                    <View style={styles.stopCopy}>
                      <Text maxFontSizeMultiplier={1.3} numberOfLines={large ? 3 : 2}
                        style={[styles.stopName, { color: colors.text }]}>{compactNearbyStopName(item)}</Text>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.walkText, { color: colors.textSoft }]}>
                        {typeof item.walkMinutes === "number" ? item.walkMinutes + " min lopen" : "Vlakbij"}
                        {isBest ? <Text style={{ color: "#168755", fontWeight: "800" }}> · Beste halte</Text> : null}
                      </Text>
                      <View style={styles.lineBadges}>
                        {lines.map((line, lineIndex) => <LijnBadge key={line.line + "-" + lineIndex} line={line.line}
                            carrier={line.carrier} compact tone="carrier" />)}
                      </View>
                    </View>
                    <View style={styles.departureCopy}>
                      {preview.loading && !first ? (
                        <Text maxFontSizeMultiplier={1.3} style={[styles.departureHint, { color: colors.textSoft }]}>Laden…</Text>
                      ) : first ? <>
                        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                          style={[styles.departureTime, { color: colors.heading }]}>{when}</Text>
                        <View style={styles.departureStatus}>
                          {liveDeparture ? <View style={styles.liveDot} /> : null}
                          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                            style={[styles.departureHint, { color: liveDeparture ? "#168755" : colors.textSoft }]}>
                            {"Lijn " + first.line + " · " + status}
                          </Text>
                        </View>
                      </> : <Text maxFontSizeMultiplier={1.3} style={[styles.departureHint, { color: colors.textSoft }]}>
                        Geen vertrekken
                      </Text>}
                    </View>
                  </Pressable>
                  <Pressable onPress={() => toggleFavoriteStop(item)} accessibilityRole="button" hitSlop={8}
                    accessibilityLabel={(isFavoriteStop(item.id) ? "Verwijder favoriete halte " : "Bewaar als favoriete halte ") + item.name}
                    accessibilityState={{ selected: isFavoriteStop(item.id) }} style={styles.starButton}>
                    <Ionicons name={isFavoriteStop(item.id) ? "star" : "star-outline"} size={17}
                      color={isFavoriteStop(item.id) ? colors.warning : colors.textMuted} />
                  </Pressable>
                </View>
              );
            })}
            {!visibleItems.length ? (loadError ? (
              <View style={styles.emptyWrap}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.empty, { color: colors.textSoft }]}>
                  Haltes konden niet worden geladen. Controleer je verbinding.
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Buurtbord opnieuw laden"
                  onPress={() => { setLocatieRetry((n) => n + 1); live.requestFresh(); }}
                  style={[styles.retryButton, { borderColor: colors.border }]}>
                  <Text maxFontSizeMultiplier={1.3} style={{ color: colors.accentText, fontWeight: "800" }}>Opnieuw proberen</Text>
                </Pressable>
              </View>
            ) : <Text maxFontSizeMultiplier={1.3} style={[styles.empty, { color: colors.textSoft }]}>
              {!activeLocation ? "Geen GPS-positie beschikbaar. Kies een stad of probeer GPS opnieuw." : "Geen haltes in de buurt gevonden."}
            </Text>) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: { paddingHorizontal: 17, paddingBottom: 16, backgroundColor: STOP_BOARD_BLUE,
    flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1 },
  title: { color: "#FFFFFF", fontSize: 23, fontWeight: "900", letterSpacing: -0.6 },
  subtitle: { color: "#DCEAF7", fontSize: 12, marginTop: 3 },
  locationLine: { marginHorizontal: 16, flexDirection: "row", alignItems: "center",
    minHeight: 35, gap: 8, marginBottom: 10 },
  locationDot: { width: 8, height: 8, borderRadius: 4 },
  locationText: { fontSize: 12.5, flex: 1, minWidth: 0, fontWeight: "600" },
  cityButton: { padding: 8, minWidth: 35, minHeight: 35, alignItems: "center", justifyContent: "center" },
  cities: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 15, gap: 7, marginBottom: 10 },
  cityChoice: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 8 },
  notice: { marginHorizontal: 14, marginBottom: 8, borderRadius: 10,
    flexDirection: "row", alignItems: "center", gap: 7, padding: 10 },
  noticeText: { flex: 1, fontSize: 12 },
  noticeAction: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 8 },
  sectionHeading: { marginHorizontal: 17, marginTop: 4, marginBottom: 9,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  refreshButton: { flexDirection: "row", alignItems: "center", gap: 5, padding: 7, minHeight: 36 },
  refreshLabel: { color: STOP_BOARD_BLUE, fontSize: 12, fontWeight: "800" },
  updateText: { marginHorizontal: 16, fontSize: 11, marginBottom: 6 },
  listContent: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  stopItem: { flexDirection: "row", minHeight: 106, alignItems: "center", paddingLeft: 12, paddingRight: 6 },
  bestStop: { borderLeftWidth: 3, borderLeftColor: STOP_BOARD_BLUE, paddingLeft: 9,
     },
  stopMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 13 },
  modeIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#EEF4FF",
    alignItems: "center", justifyContent: "center", alignSelf: "flex-start", marginTop: 3 },
  stopCopy: { flex: 1, minWidth: 0, gap: 3 },
  stopName: { fontSize: 15.5, lineHeight: 19, fontWeight: "800" },
  walkText: { fontSize: 11.5, lineHeight: 16 },
  lineBadges: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 },
  departureCopy: { width: 91, flexShrink: 0, alignItems: "flex-end", justifyContent: "center", gap: 4 },
  departureTime: { fontSize: 18, lineHeight: 25, fontWeight: "900",
    fontVariant: ["tabular-nums"], textAlign: "right", width: "100%" },
  departureStatus: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3, width: "100%" },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#168755" },
  departureHint: { fontSize: 10.5, lineHeight: 15, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  starButton: { width: 28, minHeight: 40, alignItems: "center", justifyContent: "center" },
  emptyWrap: { alignItems: "center", paddingBottom: 18 },
  empty: { padding: 20, textAlign: "center", fontSize: 13 },
  retryButton: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10 }
});
