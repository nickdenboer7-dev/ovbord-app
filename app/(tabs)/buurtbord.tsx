import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { largeText } from "../../lib/textScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NearbySkeleton } from "../../components/NearbySkeleton";
import { hydrateNearbyCache, nearbyScope, peekNearby, peekLastLocation, rememberNearby, sameNearbyLocation } from "../../lib/nearbyCache";
import type { NearbyPreview } from "../../lib/nearbyCache";
import { LeafletMap } from "../../components/LeafletMap";
import { DepartureLine } from "../../components/DepartureLine";
import { LijnBadge } from "../../components/LijnBadge";
import { SettingsButton } from "../../components/SettingsButton";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { useFlowNavigation } from "../../context/FlowNavigation";
import { getHalte, getNearby } from "../../lib/api";
import { bestNearbyStopId, buurtbordPreviewRows, compareNearbyDepartures, nearbyLeaveAdvice, reachableOnFoot } from "../../lib/buurtbord";
import { effectiveDepartureClock } from "../../lib/format";
import { boardRefreshNotice, failureKind } from "../../lib/offline";
import type { FailureKind } from "../../lib/offline";
import { useSmartRefresh } from "../../lib/useSmartRefresh";
import { MANUAL_CITIES, type LocatieResultaat } from "../../lib/location";
import { useLiveLocation } from "../../lib/useLiveLocation";
import { describeLocationAge, isLocationStale, shouldApplyResponse } from "../../lib/liveLocation";
import { DepartureItem, StopSummary } from "../../types/api";

/** stale: the last refresh for this stop failed; departures are the last known ones. */
type PreviewState = NearbyPreview;

export default function BuurtbordScreen() {
  const { colors, addRecentStop, manualCity, setManualCity, toggleFavoriteStop, isFavoriteStop } = useApp();
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
  // Large system font: a smaller map and two-line names leave room for the departures.
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
  const [compareOpen, setCompareOpen] = useState(false);
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
    new Set(Object.entries(previews).filter(([, preview]) => preview.stale || preview.loading).map(([id]) => id))),
    [visibleItems, previews, nowMs]);
  const previewsAreFresh = !updating && !refreshFailure && updatedAt !== null && nowMs - updatedAt <= 120_000;
  const bestOption = hasCurrentGps && previewsAreFresh ? options[0] : undefined;
  const advice = bestOption ? nearbyLeaveAdvice(bestOption, nowMs) : null;

  // Effective (delayed) time; never recommend a cancelled or departed trip.
  const bestStopId = useMemo(() => bestNearbyStopId(visibleItems,
    Object.fromEntries(Object.entries(previews).map(([id, preview]) => [id, preview.departures])), nowMs),
  [visibleItems, previews, nowMs]);
  const highlightedStopId = bestOption?.stop.id || (previewsAreFresh ? bestStopId : "");

  // Start on this location before map tiles load; a cached city must never flash on screen.
  const center = activeLocation ? { lat: activeLocation.coords.latitude, lon: activeLocation.coords.longitude } : undefined;
  const mapMarkers = useMemo(() => visibleItems
    .filter(item => item.lat !== undefined && item.lon !== undefined)
    .map(item => ({ id: item.id, lat: item.lat!, lon: item.lon!, title: item.name, color: modaliteitColors[item.mode] })), [visibleItems]);

  const openStop = (stop: StopSummary) => {
    addRecentStop(stop);
    showFlowStop(stop); router.navigate("/");
  };

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 40 }}
      refreshControl={<RefreshControl refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); setRefreshTick((value) => value + 1); if (!manualCity) live.requestFresh(); }}
        colors={[colors.accentText]} tintColor={colors.accentText} progressBackgroundColor={colors.surface} />}>
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 24) + 24 }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Buurtbord</Text>
          {large ? null : <Text style={[styles.subtitle, { color: colors.textSoft }]}>Haltes en snelste vertrekopties in de buurt</Text>}
        </View>
        <SettingsButton />
      </View>

      {(updating || !cacheReady) ? <Text style={{ color: colors.textMuted, fontSize: 11, paddingHorizontal: 14, paddingVertical: 4 }}>Bijwerken…</Text> : null}
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
      {manualCity ? (
        <Text style={{ color: colors.textSoft, marginHorizontal: 14, marginBottom: 7, fontSize: 12 }}>
          Handmatig gekozen plaats · geen GPS-positie
        </Text>
      ) : liveBron && liveBron !== "handmatig" && isLocationStale(liveBron, liveFixAt, nowMs) ? (
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
      {bestOption ? (
        <View style={[styles.adviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.adviceTop}>
            <View style={{ flex: 1 }}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.adviceTitle, { color: colors.heading }]}>{advice?.later ? "Geen haalbare rit binnen 60 min" : "Beste vertrek vanaf hier"}</Text>
              <Text maxFontSizeMultiplier={1.3} style={[styles.adviceHint, { color: colors.textSoft }]}>{advice?.later ? "Eerstvolgende bereikbare vertrek · GPS en looptijd" : "Indicatie op basis van je GPS en looptijd"}</Text>
            </View>
            <View style={[styles.advicePill, { backgroundColor: bestOption.tight ? colors.warningSoft : advice?.later ? colors.accentSoft : colors.successSoft }]}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.advicePillText, { color: bestOption.tight ? colors.delayWarning : colors.accentText }]}>
                {bestOption.tight ? "Krap" : advice?.later ? "Later" : "Haalbaar"}
              </Text>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={"Open halte " + bestOption.stop.name + " voor lijn " + bestOption.departure.line}
            onPress={() => openStop(bestOption.stop)} style={styles.adviceTrip}>
            <LijnBadge line={bestOption.departure.line} carrier={bestOption.departure.carrier} compact tone="flow" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.adviceDestination, { color: colors.text }]} numberOfLines={1}>{bestOption.departure.destination}</Text>
              <Text maxFontSizeMultiplier={1.3} style={[styles.adviceHint, { color: colors.textSoft }]} numberOfLines={2}>
                {bestOption.stop.name} · {bestOption.walkMinutes} min lopen
              </Text>
            </View>
            <Text maxFontSizeMultiplier={1.3} style={[styles.adviceMinutes, { color: colors.heading }]}>{advice?.later ? effectiveDepartureClock(bestOption.departure) : bestOption.departureInMinutes + " min"}</Text>
          </Pressable>
          <View style={[styles.adviceFoot, { backgroundColor: bestOption.tight ? colors.warningSoft : advice?.later ? colors.accentSoft : colors.successSoft }]}>
            <Ionicons name={bestOption.tight || advice?.later ? "time-outline" : "checkmark-circle-outline"} size={17}
              color={bestOption.tight ? colors.delayWarning : colors.accentText} />
            <Text maxFontSizeMultiplier={1.3} style={{ color: colors.text, flex: 1, fontSize: 12, fontWeight: "700" }}>
              {advice?.leaveText} · {advice?.marginText}
            </Text>
          </View>
          {options.length > 1 ? (
            <Pressable onPress={() => setCompareOpen((value) => !value)} accessibilityRole="button"
              accessibilityState={{ expanded: compareOpen }} style={styles.compareToggle}>
              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.accentText, fontSize: 12, fontWeight: "800" }}>
                {compareOpen ? "Vergelijking sluiten" : "Vergelijk " + options.length + " haltes"}
              </Text>
              <Ionicons name={compareOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.accentText} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {bestOption && compareOpen && options.length > 1 ? (
        <View style={[styles.compareCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.compareTitle, { color: colors.heading }]}>Haalbare vertrekken vergelijken</Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.adviceHint, { color: colors.textSoft }]}>Bestemmingen kunnen verschillen. Kies de rit die je nodig hebt.</Text>
          {options.slice(0, 5).map((option, index) => (
            <Pressable key={option.stop.id} onPress={() => openStop(option.stop)} accessibilityRole="button"
              accessibilityLabel={"Halte " + option.stop.name + ", lijn " + option.departure.line + ", " + option.departureInMinutes + " minuten tot vertrek, " + option.walkMinutes + " minuten lopen"}
              style={[styles.compareRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <Ionicons name="location-outline" size={17} color={index === 0 ? colors.accentText : colors.textSoft} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.compareStop, { color: colors.text }]}>{option.stop.name}</Text>
                <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.adviceHint, { color: colors.textSoft }]}>
                  Lijn {option.departure.line} → {option.departure.destination} · {option.walkMinutes} min lopen
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.compareTime, { color: colors.heading }]}>{option.withinHour ? option.departureInMinutes + " min" : effectiveDepartureClock(option.departure)}</Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.adviceHint, { color: option.tight ? colors.delayWarning : colors.accentText }]}>
                  {option.withinHour ? option.spareMinutes + " min speling" : nearbyLeaveAdvice(option, nowMs).leaveText}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
      {loading && !visibleItems.length ? <NearbySkeleton label={center ? "Haltes laden…" : "Locatie bepalen…"} /> : (
        <View style={styles.listContent}>
          {visibleItems.map((item) => {
            const preview = previews[item.id] || { loading: true, departures: [] };
            const rows = buurtbordPreviewRows(preview.departures, nowMs);
            return (
              <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.topRow}>
                  <Pressable onPress={() => openStop(item)} accessibilityRole="button"
                    accessibilityLabel={"Open halte " + item.name + (item.id === highlightedStopId ? ", beste halte" : "")}
                    style={styles.nameArea}>
                    <View style={[styles.modeDot, { backgroundColor: modaliteitColors[item.mode] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={large ? 2 : 1}>{item.name}</Text>
                      <Text style={[styles.meta, { color: colors.textSoft }]}>{item.walkMinutes ? `${item.walkMinutes} min lopen` : "Nabij"}</Text>
                      {/* With a large font the label goes under the name, so the name keeps the full width. */}
                      {large && item.id === highlightedStopId ? <View style={[styles.bestBadge, styles.bestBadgeBelow, { backgroundColor: colors.successSoft }]}><Text style={[styles.bestBadgeText, { color: colors.accentText }]}>Beste halte</Text></View> : null}
                    </View>
                  </Pressable>
                  {!large && item.id === highlightedStopId ? <View style={[styles.bestBadge, { backgroundColor: colors.successSoft }]}><Text style={[styles.bestBadgeText, { color: colors.accentText }]}>Beste halte</Text></View> : null}
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
                  <View style={styles.previewLoading}>{[0, 1, 2].map(i => <View key={i} style={{ height: 9, marginVertical: 5, width: i === 1 ? "60%" : "85%", borderRadius: 4, backgroundColor: colors.border }} />)}</View>
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
          })}
          {!visibleItems.length ? (loadError ? (
            <View style={{ alignItems: "center" }}>
              <Text style={[styles.empty, { color: colors.textSoft }]}>Haltes in de buurt konden niet worden geladen. Controleer je verbinding.</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Buurtbord opnieuw laden"
                onPress={() => { setLocatieRetry((n) => n + 1); live.requestFresh(); }}
                style={{ borderColor: colors.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Text style={{ color: colors.accentText, fontWeight: "800" }}>Opnieuw proberen</Text>
              </Pressable>
            </View>
          ) : <Text style={[styles.empty, { color: colors.textSoft }]}>{!center ? "Geen GPS-positie beschikbaar. Kies een stad of probeer GPS opnieuw." : "Geen haltes in de buurt gevonden."}</Text>) : null}
        </View>
      )}
      <Text maxFontSizeMultiplier={1.3} style={[styles.mapHeading, { color: colors.textSoft }]}>Haltes op de kaart</Text>
      <View style={[styles.mapWrap, large && styles.mapWrapLarge, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {center ? <LeafletMap markers={mapMarkers} center={center} /> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textMuted }}>Locatie bepalen…</Text></View>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  headerRow: { paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 21, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 12, marginTop: 3 },
  mapHeading: { marginHorizontal: 14, marginTop: 16, fontSize: 12, fontWeight: "700" },
  mapWrap: { marginHorizontal: 13, marginTop: 8, height: 170, borderRadius: 14, overflow: "hidden", borderWidth: 1 },
  mapWrapLarge: { height: 110, marginVertical: 8 },
  adviceCard: { marginHorizontal: 13, marginTop: 8, padding: 12, borderRadius: 12, borderWidth: 1, gap: 10 },
  adviceTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  adviceTitle: { fontSize: 16, fontWeight: "900" },
  adviceHint: { fontSize: 11, lineHeight: 16 },
  advicePill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 15 },
  advicePillText: { fontSize: 11, fontWeight: "900" },
  adviceTrip: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10 },
  adviceDestination: { fontSize: 14, fontWeight: "800" },
  adviceMinutes: { fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  adviceFoot: { minHeight: 36, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 8 },
  compareToggle: { minHeight: 44, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  compareCard: { marginHorizontal: 13, marginTop: 8, padding: 12, borderWidth: 1, borderRadius: 12, gap: 5 },
  compareTitle: { fontSize: 14, fontWeight: "900" },
  compareRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  compareStop: { fontSize: 13, fontWeight: "800" },
  compareTime: { fontSize: 14, fontWeight: "900", fontVariant: ["tabular-nums"] },
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
  previewLoading: { minHeight: 54, gap: 4 },
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
