import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Linking, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { largeText } from "../lib/textScale";
import { useApp } from "../context/AppProvider";
import { useFlowNavigation } from "../context/FlowNavigation";
import { getNearby, searchCatalog, type SearchJourney } from "../lib/api";
import { uniqueRecentStops } from "../lib/flowRitQuality";
import { groupNearbyStops, nearbyModeLabel, type NearbyStopGroup } from "../lib/nearbyGroups";
import { MANUAL_CITIES, VOORBEELD_LOCATIE_UTRECHT, type LocatieResultaat } from "../lib/location";
import { useLiveLocation } from "../lib/useLiveLocation";
import { describeLocationAge, isLocationStale, shouldApplyResponse } from "../lib/liveLocation";
import { mergeStopResults, rankSearchStops, resolveSearchTerm, searchSavedStops } from "../lib/flowSearch";
import { failureKind, listRefreshNotice, nearbyUnavailableMessage } from "../lib/offline";
import type { FailureKind } from "../lib/offline";
import { LijnBadge } from "./LijnBadge";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { vehicleIcon } from "../lib/ritVehicle";
import { FlowWorkspace } from "./FlowWorkspace";
import { useFavoritesLive } from "../context/FavoritesLive";
import type { SavedJourney } from "../context/AppProvider";
import { favoriteJourneyDepartures } from "../lib/favoritesLive";
import { ritParamsForDeparture } from "../lib/ritRoute";
import { useSmartRefresh } from "../lib/useSmartRefresh";
import { favoriteStatusText } from "./FavoriteDepartures";
import { DepartureLine } from "./DepartureLine";
import { activeTripLine, activeTripValid } from "../lib/activeTrip";
import type { ActiveTrip } from "../lib/activeTrip";
import { clearActiveTrip, loadActiveTrip } from "../lib/activeTripStore";
import { rememberAlighting } from "../lib/alighting";
import { leaveAdvice, walkMinutesTo } from "../lib/leaveTime";
import type { DepartureItem, StopSummary } from "../types/api";

type ListTab = "nabij" | "recent" | "favoriet";
type SearchFilter = "alles" | "haltes" | "ritten";
type SearchRow = { kind: "halte"; stop: StopSummary } | { kind: "rit"; journey: SearchJourney } | { kind: "groep"; group: NearbyStopGroup };
type SearchSection = { title: string; data: SearchRow[] };
type NearbyState = "loading" | "ready" | "permission-denied" | "outside-nl" | "no-gps" | "empty" | "offline" | "error";

/** "Amsterdam, Rembrandtplein" → "Rembrandtplein" for short lines. */
function shortStopName(name: string): string {
  const words = String(name || "").split(", ");
  return words.length === 2 && words[0].length <= 30 ? words[1] : name;
}

/** One persistent screen for search, stop boards, inline journeys and intermediate stops. */
export function FlowHome() {
  const { colors, resolvedScheme, recentStops, favoriteStops, favoriteJourneys, addRecentStop, toggleFavoriteStop, isFavoriteStop, manualCity, setManualCity } = useApp();
  const { screens, showStop, searchRequest, homeRequest } = useFlowNavigation();
  const { boards: favoriteBoards, refreshFailure: favoritesFailure, refresh: refreshFavorites, stopsKey: favoritesKey } = useFavoritesLive();
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** The trip last opened on the trip page, offered on Start until shortly after arrival. */
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  /** Own position (GPS only, not a chosen city) for walking advice. */
  const [userCoords, setUserCoords] = useState<{ lat: number; lon: number } | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // With a large system font, names and destinations get two lines instead of being cut off.
  const large = largeText(useWindowDimensions().fontScale);
  const [tab, setTab] = useState<ListTab>("nabij");
  const [query, setQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchFilter>("alles");
  const [results, setResults] = useState<StopSummary[]>([]);
  const [journeys, setJourneys] = useState<SearchJourney[]>([]);
  const [nearby, setNearby] = useState<StopSummary[]>([]);
  const [nearbyState, setNearbyState] = useState<NearbyState>("loading");
  const [nearbyRetry, setNearbyRetry] = useState(0);
  const [useUtrechtExample, setUseUtrechtExample] = useState(false);
  const [locationSource, setLocationSource] = useState<LocatieResultaat["bron"] | null>(null);
  const [locationFixAt, setLocationFixAt] = useState<number | null>(null);
  const [showCities, setShowCities] = useState(false);
  // V5.8.1: live GPS while Start is visible; disabled for a manually chosen city or the Utrecht example.
  const live = useLiveLocation(!manualCity && !useUtrechtExample);
  // V5.9: judge "laatst bekend" by the newest GPS fix, not by when stops were last loaded: a
  // stationary user keeps getting fresh fixes (no reload needed) and must not see an old-location note.
  const liveBron = live.bron ?? locationSource;
  const liveFixAt = live.fixAt ?? locationFixAt;
  /** The search field opens from the search icon (V5.4: a calm Start without a permanent field). */
  const [searchOpen, setSearchOpen] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<"network" | "server" | "timeout" | null>(null);
  const [searchRetry, setSearchRetry] = useState(0);
  const inputRef = useRef<TextInput>(null);
  // Pull-to-refresh keeps the current list visible while it reloads.
  const [nearbyRefreshTick, setNearbyRefreshTick] = useState(0);
  const [refreshingNearby, setRefreshingNearby] = useState(false);
  const softNearbyRefresh = useRef(false);
  /** Pull-to-refresh failed: the list on screen is the last loaded one. */
  const [nearbyRefreshFailure, setNearbyRefreshFailure] = useState<FailureKind | null>(null);
  const [nearbyUpdatedAt, setNearbyUpdatedAt] = useState<number | null>(null);
  const nearbyCount = useRef(0);
  nearbyCount.current = nearby.length;
  /** V5.8.1: only the newest nearby request may write the list (a slow Amsterdam reply never overwrites Zaandam). */
  const nearbyRequest = useRef(0);

  // V5.8.1: manual city and the Utrecht example resolve instantly; GPS comes from the shared live
  // hook above (which already handles permissions, last-known fallback and the fetch timeout), and
  // only re-runs this effect on a real location change (live.refreshToken), not on every GPS tick.
  const manualLocation = useMemo<LocatieResultaat | null>(() => {
    if (manualCity) {
      const manual = MANUAL_CITIES.find((city) => city.key === manualCity);
      return manual ? { coords: { latitude: manual.latitude, longitude: manual.longitude }, bron: "handmatig", cityName: manual.name, fixAt: Date.now() } : null;
    }
    if (useUtrechtExample) return { coords: VOORBEELD_LOCATIE_UTRECHT, bron: "voorbeeld", fixAt: Date.now() };
    return null;
  }, [manualCity, useUtrechtExample]);

  useEffect(() => {
    let active = true;
    const soft = softNearbyRefresh.current && nearbyCount.current > 0;
    softNearbyRefresh.current = false;

    const location = manualLocation || (live.coords && live.bron ? { coords: live.coords, bron: live.bron, fixAt: live.fixAt ?? Date.now() } : null);

    if (!location) {
      // No fix yet: still loading, or GPS failed. Never overwrite a list already on screen with a soft refresh.
      if (!soft) {
        setNearby([]);
        setLocationSource(null);
        setNearbyRefreshFailure(null);
        setNearbyState(live.errorCode
          ? live.errorCode === "permission-denied" ? "permission-denied" : live.errorCode === "outside-nl" ? "outside-nl" : "no-gps"
          : "loading");
      }
      return;
    }

    if (!soft) {
      setNearbyState("loading");
      setNearby([]);
      setLocationSource(null);
      setNearbyRefreshFailure(null);
    }
    const token = ++nearbyRequest.current;
    const current = () => active && shouldApplyResponse(token, nearbyRequest.current);
    void (async () => {
      try {
        setLocationSource(location.bron);
        setLocationFixAt(location.fixAt);
        setUserCoords(location.bron === "gps" || location.bron === "laatst-bekend"
          ? { lat: location.coords.latitude, lon: location.coords.longitude } : null);
        const items = await getNearby(location.coords.latitude, location.coords.longitude);
        if (!current()) return;
        setNearby(items);
        setNearbyState(items.length ? "ready" : "empty");
        setNearbyRefreshFailure(null);
        setNearbyUpdatedAt(Date.now());
      } catch (error) {
        if (!current()) return;
        // A failed background refresh keeps the last good list; a network failure says so.
        if (soft) {
          if (__DEV__) console.warn("Verversen haltes in de buurt mislukt", error);
          setNearbyRefreshFailure(failureKind(error));
          return;
        }
        setNearbyState(failureKind(error) === "offline" ? "offline" : "error");
        if (__DEV__) console.warn("Haltes in de buurt niet beschikbaar", error);
      } finally {
        if (active) setRefreshingNearby(false);
      }
    })();
    return () => { active = false; };
  }, [nearbyRetry, manualLocation, live.refreshToken, live.errorCode, live.loading, nearbyRefreshTick]);

  useEffect(() => {
    const term = resolveSearchTerm(query);
    if (!term) { setResults([]); setJourneys([]); setSearchError(null); setLoadingSearch(false); return; }
    let active = true;
    setResults([]);
    setJourneys([]);
    setSearchError(null);
    setLoadingSearch(true);
    const timer = setTimeout(() => {
      void searchCatalog(term)
        .then(({ stops, journeys: foundJourneys }) => {
          if (active) { setResults(stops); setJourneys(foundJourneys); setSearchError(null); }
        })
        .catch((error: unknown) => {
          if (!active) return;
          setResults([]);
          const message = error instanceof Error ? error.message : String(error);
          setSearchError(message.includes("OVbord timeout") ? "timeout" : /^OVbord API \d{3}/.test(message) ? "server" : "network");
        })
        .finally(() => { if (active) setLoadingSearch(false); });
    }, 280);
    return () => { active = false; clearTimeout(timer); };
  }, [query, searchRetry]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const finding = query.trim().length > 0;
  const uniqueRecents = useMemo(() => uniqueRecentStops(recentStops), [recentStops]);
  const localMatches = useMemo(() => searchSavedStops(favoriteStops, uniqueRecents, query), [favoriteStops, uniqueRecents, query]);
  const data = useMemo(() => {
    if (finding) return mergeStopResults(localMatches, rankSearchStops(results, resolveSearchTerm(query)));
    if (tab === "recent") return uniqueRecents;
    if (tab === "favoriet") return favoriteStops;
    return nearby;
  }, [finding, localMatches, results, tab, uniqueRecents, favoriteStops, nearby, query]);
  // Only the nearby list groups matching stop-area variants. Search, saved stops and actual
  // stop boards keep every original stop ID and are unaffected.
  const nearbyGroups = useMemo(() => groupNearbyStops(nearby), [nearby]);
  const sections = useMemo<SearchSection[]>(() => {
    const haltes: SearchRow[] = data.map((stop) => ({ kind: "halte", stop }));
    if (!finding && tab === "nabij") {
      const groups: SearchRow[] = nearbyGroups.map((group) => ({ kind: "groep", group }));
      return groups.length ? [{ title: "", data: groups }] : [];
    }
    // No section at all when empty: an empty section still counts as content, which
    // kept the explanation and the GPS/retry buttons in ListEmptyComponent from showing.
    if (!finding) return haltes.length ? [{ title: "", data: haltes }] : [];
    return [
      { title: "Haltes", data: searchFilter === "ritten" ? [] : haltes },
      { title: "Ritten", data: searchFilter === "haltes" ? [] : journeys.map((journey): SearchRow => ({ kind: "rit", journey })) }
    ].filter((section) => section.data.length > 0);
  }, [data, finding, journeys, searchFilter, tab, nearbyGroups]);
  const resultCount = finding
    ? (searchFilter === "ritten" ? journeys.length : searchFilter === "haltes" ? data.length : data.length + journeys.length)
    : data.length;
  const showingBoard = screens.length > 0 && !finding;
  // "Mijn ritten": saved trips with their next departures, at the top of the nearby list.
  const showMine = !finding && tab === "nabij" && favoriteJourneys.length > 0;
  // V5.8: the stop board has a white header too (like Start), so the status bar simply follows
  // the theme everywhere. Rendered only while focused, so Favorieten and Meer follow the theme.
  const [focused, setFocused] = useState(true);
  const statusBarStyle = resolvedScheme === "dark" ? "light" : "dark";
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useFocusEffect(useCallback(() => {
    if (favoriteJourneys.length) void refreshFavorites();
    let active = true;
    void loadActiveTrip(Date.now()).then((trip) => { if (active) setActiveTrip(trip); });
    return () => { active = false; };
  }, [favoriteJourneys.length, refreshFavorites]));
  const showTrip = !finding && tab === "nabij" && activeTripValid(activeTrip, nowMs);
  const openActiveTrip = (trip: ActiveTrip) => {
    // The alighting stop comes back too, also after the app was closed.
    rememberAlighting(trip.tripId, trip.alighting);
    router.push({ pathname: "/rit/[id]", params: { ...trip.params, id: trip.tripId } });
  };
  const dismissActiveTrip = () => { void clearActiveTrip(); setActiveTrip(null); };
  useSmartRefresh(() => refreshFavorites(), favoritesFailure ? 20000 : 60000, "start:" + favoritesKey, showMine && !showingBoard);
  const openMyJourney = (item: SavedJourney) => {
    addRecentStop(item.stop);
    showStop(item.stop, { line: item.boardLine || item.line, carrier: item.carrier });
  };
  /** The trip opens on top of that stop's board, so Back leads to the board. */
  const openMyDeparture = (stop: StopSummary, item: DepartureItem) => {
    addRecentStop(stop);
    showStop(stop, { line: item.line, carrier: item.carrier });
    if (item.ritId) router.push({ pathname: "/rit/[id]", params: ritParamsForDeparture(item, stop) });
  };
  /** The search icon opens the field with recently viewed stops below it. */
  const openSearch = () => { setSearchOpen(true); setTab("recent"); };
  // The search bar on a stop board closes the board and asks Start to open its search.
  useEffect(() => { if (searchRequest > 0) openSearch(); }, [searchRequest]);
  const closeSearch = () => {
    Keyboard.dismiss();
    setQuery("");
    setSearchFilter("alles");
    setSearchOpen(false);
    setTab("nabij");
  };
  // V5.9: re-tapping the Start tab (FlowNavigation.goHome) also leaves an open search.
  useEffect(() => { if (homeRequest > 0) { closeSearch(); setShowCities(false); } }, [homeRequest]);
  const openStop = (stop: StopSummary) => {
    Keyboard.dismiss();
    addRecentStop(stop);
    setQuery("");
    setSearchFilter("alles");
    setSearchOpen(false);
    setTab("nabij");
    showStop(stop);
  };
  const openJourney = (journey: SearchJourney) => {
    Keyboard.dismiss();
    setQuery("");
    setSearchFilter("alles");
    setSearchOpen(false);
    setTab("nabij");
    router.push({
      pathname: "/rit/[id]",
      params: { id: journey.journeyId, line: journey.line, destination: journey.destination, carrier: journey.carrier }
    });
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {focused ? <ExpoStatusBar style={statusBarStyle} /> : null}
      {!showingBoard ? <View style={[styles.top, { paddingTop: Math.max(insets.top, 24) + 10, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.brandLine}>
          {/* Small brand mark: the app icon idea in a few dp, no decorative surface. */}
          <View style={[styles.brandMark, { backgroundColor: colors.accent }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="bus" size={15} color="#FFFFFF" />
          </View>
          <Text style={[styles.brand, { color: colors.accentText }]} accessibilityRole="header" maxFontSizeMultiplier={1.2}>OVbord</Text>
        </View>
        {/* One calm search field, always in the same place: a tap opens the search with recent stops. */}
        <View style={styles.searchLine}>
          {!searchOpen ? (
            <Pressable onPress={openSearch} accessibilityRole="button" accessibilityLabel="Zoek een halte, station of rit"
              style={({ pressed }) => [styles.search, { backgroundColor: pressed ? colors.surfaceAlt : colors.inputBg }]}>
              <Ionicons name="search" size={18} color={colors.textSoft} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.searchPlaceholder, { color: colors.textMuted }]}>Zoek halte, station of rit</Text>
            </Pressable>
          ) : (
            <View style={[styles.search, { backgroundColor: colors.inputBg }]}>
              <Ionicons name="search" size={18} color={colors.textSoft} />
              <TextInput
                ref={inputRef}
                value={query}
                autoFocus
                onChangeText={(value) => { setQuery(value); if (!value.trim()) setSearchFilter("alles"); }}
                placeholder="Zoek halte, station of rit"
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
                // The field has a fixed height: grow with the system font, but not without limit.
                maxFontSizeMultiplier={1.3}
                style={[styles.searchInput, { color: colors.text }]}
              />
              {query ? (
                <Pressable accessibilityLabel="Zoekopdracht wissen" onPress={() => { setQuery(""); setSearchFilter("alles"); }} hitSlop={8}>
                  <Ionicons name="close-circle" size={19} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
          )}
          {searchOpen ? (
            <Pressable onPress={closeSearch} accessibilityRole="button" accessibilityLabel="Zoeken sluiten" hitSlop={6} style={styles.searchCancel}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.searchCancelText, { color: colors.accentText }]}>Sluiten</Text>
            </Pressable>
          ) : null}
        </View>
        {query.trim() ? <View style={[styles.searchFilters, { borderTopColor: colors.border }]}>
          {(["alles", "haltes", "ritten"] as const).map((choice) => (
            <Pressable key={choice} accessibilityRole="button" accessibilityState={{ selected: searchFilter === choice }}
              accessibilityLabel={"Zoekfilter " + choice} onPress={() => setSearchFilter(choice)}
              style={[styles.searchFilter, { backgroundColor: searchFilter === choice ? colors.accentSoft : colors.surface }]}>
              <Text style={{ color: searchFilter === choice ? colors.accentText : colors.textSoft, fontSize: 12, fontWeight: "800" }}>
                {choice === "alles" ? "Alles" : choice === "haltes" ? "Haltes" : "Ritten"}
              </Text>
            </Pressable>
          ))}
        </View> : null}
      </View> : null}

      <View style={[styles.listLayer, showingBoard ? styles.hidden : null]} pointerEvents={showingBoard ? "none" : "auto"}>
        {((finding && loadingSearch) || (!finding && tab === "nabij" && nearbyState === "loading" && !showMine)) && !resultCount ? (
          <View style={styles.center}><ActivityIndicator color={colors.accentText} /></View>
        ) : (
          <SectionList<SearchRow>
            sections={sections}
            stickySectionHeadersEnabled={false}
            keyExtractor={(item) => item.kind === "groep" ? "groep:" + item.group.key : item.kind === "halte" ? "halte:" + item.stop.id : "rit:" + item.journey.journeyId}
            renderSectionHeader={({ section }) => finding ? (
              <View style={[styles.headingRow, { backgroundColor: colors.surfaceSoft, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
                <Text style={[styles.listTitle, { color: colors.text }]}>{section.title}</Text>
                <Text style={[styles.count, { color: colors.textMuted }]}>{section.data.length}</Text>
              </View>
            ) : null}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            refreshControl={!finding && tab === "nabij" ? <RefreshControl refreshing={refreshingNearby}
              onRefresh={() => { softNearbyRefresh.current = true; setRefreshingNearby(true); setNearbyRefreshTick((n) => n + 1); if (!manualCity && !useUtrechtExample) live.requestFresh(); if (showMine) void refreshFavorites(true); }}
              colors={[colors.accentText]} tintColor={colors.accentText} progressBackgroundColor={colors.surface} /> : undefined}
            ListHeaderComponent={
              <View>
                {showTrip && activeTrip ? (() => {
                  const tripLine = activeTripLine(activeTrip);
                  return (
                    <View style={[styles.tripCard, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
                      <Pressable onPress={() => openActiveTrip(activeTrip)} accessibilityRole="button"
                        accessibilityLabel={tripLine.lead + "lijn " + tripLine.line + tripLine.text + ". Ritverloop openen"}
                        style={styles.tripMain}>
                        <Ionicons name="navigate-circle-outline" size={21} color={colors.accentText} />
                        <Text style={[styles.tripText, { color: colors.text }]} numberOfLines={large ? undefined : 2}>
                          {tripLine.lead}<Text style={styles.tripStrong}>{tripLine.line}</Text>{tripLine.text}
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.accentText} />
                      </Pressable>
                      <Pressable onPress={dismissActiveTrip} hitSlop={8} accessibilityRole="button" accessibilityLabel="Rit van Start verwijderen" style={styles.tripClose}>
                        <Ionicons name="close" size={16} color={colors.textSoft} />
                      </Pressable>
                    </View>
                  );
                })() : null}
                {showMine ? (
                  <View>
                    <View style={styles.headingRow}>
                      <Text style={[styles.listTitle, { color: colors.text }]} accessibilityRole="header">Mijn ritten</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel="Alle favorieten openen" hitSlop={8}
                        onPress={() => router.navigate("/favorieten")}>
                        <Text style={[styles.headingLink, { color: colors.accentText }]}>Alle favorieten</Text>
                      </Pressable>
                    </View>
                    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {favoriteJourneys.slice(0, 3).map((item, index, shown) => {
                      const entry = favoriteBoards[item.stop.id];
                      const rows = entry?.board ? favoriteJourneyDepartures(entry.board.departures, item, nowMs) : [];
                      const boardStop = entry?.board?.stop || item.stop;
                      // "When do I leave": walking time from the own GPS position; not on last-known times.
                      const advice = rows.length && !entry?.stale ? leaveAdvice(rows, walkMinutesTo(userCoords, boardStop), nowMs) : null;
                      const last = index === shown.length - 1;
                      // One calm row: the next departure; the walking advice replaces the status line.
                      if (rows.length) {
                        return <DepartureLine key={item.key} item={rows[0]} nowMs={nowMs} stale={Boolean(entry?.stale)} carrier={item.carrier}
                          last={last} onPress={() => openMyDeparture(boardStop, rows[0])}
                          detail={advice ? { text: advice.text, icon: "walk-outline", warn: advice.tight } : undefined}
                          note={advice ? undefined : shortStopName(boardStop.name)} />;
                      }
                      return (
                        <Pressable key={item.key} accessibilityRole="button"
                          accessibilityLabel={"Lijn " + item.line + " naar " + item.direction + " bij " + item.stop.name + ". Vertrekbord openen"}
                          onPress={() => openMyJourney(item)}
                          style={[styles.mineMain, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                          <LijnBadge line={item.line} carrier={item.carrier} compact tone="flow" />
                          <View style={styles.stopContent}>
                            <Text style={[styles.mineDirection, { color: colors.text }]} numberOfLines={large ? 2 : 1}>{item.direction}</Text>
                            <Text style={[styles.stopSubtitle, { color: colors.textSoft }]} numberOfLines={large ? 2 : 1}>{favoriteStatusText(entry, false)} · {shortStopName(item.stop.name)}</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                        </Pressable>
                      );
                    })}
                    </View>
                  </View>
                ) : null}
                <View style={styles.headingRow}>
                  <Text style={[styles.listTitle, { color: colors.text }]} accessibilityRole="header">{finding ? "Zoekresultaten" : tab === "nabij" ? "Haltes in de buurt" : tab === "recent" ? "Onlangs bekeken" : "Favoriete haltes"}</Text>
                  {!finding && tab === "nabij" ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={manualCity ? "Stad wijzigen" : "Handmatig stad kiezen"} hitSlop={8}
                      onPress={() => setShowCities((open) => !open)}>
                      <Text style={[styles.headingLink, { color: colors.accentText }]}>{manualCity
                        ? (MANUAL_CITIES.find((city) => city.key === manualCity)?.name || "Stad")
                        : "Kies stad"}</Text>
                    </Pressable>
                  ) : <Text style={[styles.count, { color: colors.textMuted }]}>{resultCount}</Text>}
                </View>
                {!finding && tab === "nabij" && (showCities || manualCity || useUtrechtExample) ? (
                  <View style={styles.cityOptions}>
                    {(manualCity || useUtrechtExample) ? <Pressable accessibilityRole="button" accessibilityLabel="Terug naar GPS"
                      onPress={() => { setManualCity(null); setUseUtrechtExample(false); setShowCities(false); setNearbyRetry((n) => n + 1); live.requestFresh(); }}
                      style={[styles.cityChoice, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                      <Ionicons name="navigate-outline" size={14} color={colors.accentText} />
                      <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "800" }}>Gebruik GPS</Text>
                    </Pressable> : null}
                    {showCities ? MANUAL_CITIES.map((city) => (
                      <Pressable key={city.key} accessibilityRole="button" accessibilityLabel={"Kies stad " + city.name}
                        onPress={() => { setManualCity(city.key); setUseUtrechtExample(false); setShowCities(false); }}
                        style={[styles.cityChoice, { borderColor: colors.border, backgroundColor: manualCity === city.key ? colors.accentSoft : colors.surface }]}>
                        <Text style={{ color: colors.text, fontSize: 12 }}>{city.name}</Text>
                      </Pressable>
                    )) : null}
                  </View>
                ) : null}
                {finding && resolveSearchTerm(query) !== query.trim() ? (
                  <Text style={[styles.localHint, { color: colors.accentText }]}>Zoeken op: {resolveSearchTerm(query)}</Text>
                ) : null}
                {finding && localMatches.length > 0 ? (
                  <Text style={[styles.localHint, { color: colors.textSoft }]}>Favorieten en recente haltes eerst</Text>
                ) : null}
                {finding && searchError && resultCount > 0 ? (
                  <View style={[styles.searchWarning, { backgroundColor: colors.warningSoft }]}>
                    <Text style={{ color: colors.text, flex: 1, fontSize: 12 }}>Online zoeken niet beschikbaar. Opgeslagen haltes blijven zichtbaar.</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Online zoeken opnieuw proberen" onPress={() => setSearchRetry((n) => n + 1)}>
                      <Ionicons name="refresh" size={21} color={colors.accentText} />
                    </Pressable>
                  </View>
                ) : null}
                {!finding && tab === "nabij" && nearbyRefreshFailure && nearby.length ? (
                  <View style={[styles.searchWarning, { backgroundColor: colors.warningSoft }]}>
                    <Ionicons name="cloud-offline-outline" size={16} color={colors.text} />
                    <Text style={{ color: colors.text, flex: 1, fontSize: 12 }}>{listRefreshNotice(nearbyRefreshFailure, nearbyUpdatedAt)}</Text>
                  </View>
                ) : null}
                {!finding && tab === "nabij" && useUtrechtExample ? (
                  <Pressable accessibilityRole="button" onPress={() => { setUseUtrechtExample(false); setNearbyRetry((n) => n + 1); }}
                    style={[styles.exampleBanner, { backgroundColor: colors.accentSoft }]}>
                    <Text style={{ color: colors.accentText, fontWeight: "800" }}>Voorbeeldlocatie Utrecht · Tik om terug te gaan naar GPS</Text>
                  </Pressable>
                ) : null}
                {/* V5.8.1: an old or missing GPS fix is never shown as if it were current. */}
                {!finding && tab === "nabij" && !manualCity && !useUtrechtExample && locationSource && isLocationStale(liveBron, liveFixAt, nowMs) ? (
                  <View style={[styles.searchWarning, { backgroundColor: colors.warningSoft }]}>
                    <Ionicons name="time-outline" size={16} color={colors.text} />
                    <Text style={{ color: colors.text, flex: 1, fontSize: 12 }}>
                      Laatst bekende locatie · {describeLocationAge(liveFixAt ?? nowMs, nowMs)}
                    </Text>
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={!finding && tab === "nabij" && nearbyState === "loading" ? (
              <View style={styles.emptyWrap}><ActivityIndicator color={colors.accentText} style={{ marginTop: 24 }} /></View>
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={[styles.empty, { color: colors.textSoft }]}>
                  {finding ? searchError === "network" ? "Geen verbinding met OVbord. Controleer je internetverbinding." : searchError === "server" ? "OVbord is tijdelijk niet bereikbaar. Probeer het opnieuw." : searchError === "timeout" ? "Zoeken duurt te lang. Probeer het opnieuw." : "Geen haltes of ritten gevonden" : tab === "recent" ? "Nog geen onlangs bekeken haltes" : tab === "favoriet" ? "Nog geen favoriete haltes" :
                    nearbyState === "permission-denied" ? "Locatietoegang staat uit. Geef toestemming om haltes in de buurt te zien." :
                    nearbyState === "outside-nl" ? "Je GPS-locatie ligt buiten Nederland. Zoek een halte of kies bewust een voorbeeldlocatie." :
                    nearbyState === "no-gps" ? "Geen GPS-positie beschikbaar. Controleer de locatie-instellingen en probeer opnieuw." :
                    nearbyState === "offline" ? nearbyUnavailableMessage("offline") :
                    nearbyState === "error" ? nearbyUnavailableMessage("server") :
                    nearbyState === "empty" ? "Geen haltes gevonden rond deze locatie. Zoek eventueel op plaatsnaam." :
                    "Nog geen haltes beschikbaar"}
                </Text>
                {finding && searchError ? (
                  <Pressable accessibilityRole="button" accessibilityLabel="Zoeken opnieuw proberen"
                    onPress={() => setSearchRetry((value) => value + 1)}
                    style={[styles.emptyAction, { borderColor: colors.border, marginTop: 16 }]}>
                    <Text style={{ color: colors.accentText, fontWeight: "800" }}>Opnieuw proberen</Text>
                  </Pressable>
                ) : null}
                {!finding && tab === "nabij" && nearbyState !== "ready" && nearbyState !== "loading" ? (
                  <View style={styles.emptyActions}>
                    {/* Without a connection the problem is not the GPS, and a sample city cannot load either. */}
                    <Pressable accessibilityRole="button" accessibilityLabel={nearbyState === "offline" || nearbyState === "error" ? "Opnieuw proberen" : "Locatie opnieuw proberen"}
                      onPress={() => { setUseUtrechtExample(false); setNearbyRetry((n) => n + 1); live.requestFresh(); }}
                      style={[styles.emptyAction, { borderColor: colors.border }]}>
                      <Text style={{ color: colors.accentText, fontWeight: "800" }}>{nearbyState === "offline" || nearbyState === "error" ? "Opnieuw proberen" : "GPS opnieuw proberen"}</Text>
                    </Pressable>
                    {nearbyState === "permission-denied" || nearbyState === "no-gps" ? (
                      <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()}
                        style={[styles.emptyAction, { borderColor: colors.border }]}>
                        <Text style={{ color: colors.accentText, fontWeight: "800" }}>Locatie-instellingen</Text>
                      </Pressable>
                    ) : null}
                    {nearbyState !== "offline" && nearbyState !== "error" ? <Pressable accessibilityRole="button" accessibilityLabel="Toon voorbeeld Utrecht"
                      onPress={() => setUseUtrechtExample(true)}
                      style={[styles.emptyAction, { borderColor: colors.border }]}>
                      <Text style={{ color: colors.accentText, fontWeight: "800" }}>Toon voorbeeld Utrecht</Text>
                    </Pressable> : null}
                  </View>
                ) : null}
              </View>
            )}
            renderItem={({ item, index }) => {
              if (item.kind === "groep") {
                const group = item.group;
                return (
                  <View style={[styles.nearGroupCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.nearGroupHead}>
                      <Text style={[styles.nearName, { color: colors.text, flex: 1 }]} numberOfLines={2}>{group.name}</Text>
                      {group.walkMinutes !== undefined ? <Text style={[styles.stopSubtitle, { color: colors.textSoft }]}>
                        {group.walkMinutes} min lopen
                      </Text> : null}
                    </View>
                    {group.stops.map((stop, stopIndex) => (
                      <Pressable key={stop.id} onPress={() => openStop(stop)} accessibilityRole="button"
                        accessibilityLabel={"Open " + nearbyModeLabel(stop) + " " + stop.name +
                          (stop.lines.length ? ", lijnen " + stop.lines.map((line) => line.line).join(", ") : "") +
                          (stop.walkMinutes ? ", " + stop.walkMinutes + " minuten lopen" : "") +
                          (isFavoriteStop(stop.id) ? ", favoriete halte" : "")}
                        style={({ pressed }) => [styles.nearGroupStop, stopIndex > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                          pressed && { backgroundColor: colors.surfaceSoft }]}>
                        <View style={[styles.nearIcon, { backgroundColor: colors.accentSoft }]}>
                          <Ionicons name={`${vehicleIcon(stop.mode)}-outline`} size={16} color={colors.accentText} />
                        </View>
                        <Text style={[styles.nearType, { color: colors.textSoft }]} numberOfLines={1}>{nearbyModeLabel(stop)}</Text>
                        <View style={styles.nearGroupLines}>
                          {stop.lines.slice(0, 4).map((line, lineIndex) => (
                            <LijnBadge key={`${line.line}-${lineIndex}`} line={line.line} carrier={line.carrier} compact />
                          ))}
                          {stop.lines.length > 4 ? <Text style={{ color: colors.textSoft, fontSize: 11 }}>+{stop.lines.length - 4}</Text> : null}
                        </View>
                        {/* V5.9: favourite stops keep their star, per original stop ID. */}
                        {isFavoriteStop(stop.id) ? <Ionicons name="star" size={14} color={colors.warning} /> : null}
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </Pressable>
                    ))}
                  </View>
                );
              }
              if (item.kind === "rit") {
                const journey = item.journey;
                return (
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={`Open rit lijn ${journey.line} naar ${journey.destination}`}
                    onPress={() => openJourney(journey)}
                    style={({ pressed }) => [styles.stopRow, {
                      backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
                      borderBottomColor: colors.border
                    }]}>
                    <View style={[styles.modePill, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name={`${vehicleIcon(journey.mode)}-outline`} size={18} color={colors.accentText} />
                    </View>
                    <View style={styles.stopContent}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <LijnBadge line={journey.line} carrier={journey.carrier} compact />
                        <Text style={[styles.stopTitle, { color: colors.text, flex: 1 }]} numberOfLines={large ? 2 : 1}>
                          {journey.destination}
                        </Text>
                      </View>
                      <Text style={[styles.stopSubtitle, { color: colors.textSoft }]} numberOfLines={2}>
                        {[journey.carrier, journey.live ? "Live rit" : "Rit", journey.position ? "Bij " + journey.position : ""].filter(Boolean).join(" · ")}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
                  </Pressable>
                );
              }
              const stop = item.stop;
              if (!finding && tab === "nabij") {
                // Nearby: one card of compact rows. The name without the city; walking time underneath.
                const first = index === 0;
                const last = index === data.length - 1;
                const city = stop.name.includes(", ") ? stop.name.split(", ")[0] : stop.city;
                return (
                  <Pressable accessibilityRole="button" accessibilityLabel={"Open halte " + stop.name + (stop.walkMinutes ? ", " + stop.walkMinutes + " minuten lopen" : "") + (isFavoriteStop(stop.id) ? ", favoriete halte" : "")}
                    onPress={() => openStop(stop)}
                    style={({ pressed }) => [styles.nearRow, { backgroundColor: pressed ? colors.surfaceSoft : colors.surface, borderColor: colors.border },
                      first && styles.cardFirst, last && styles.cardLast,
                      !last && { borderBottomWidth: StyleSheet.hairlineWidth }]}>
                    <View style={[styles.nearIcon, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name={`${vehicleIcon(stop.mode)}-outline`} size={16} color={colors.accentText} />
                    </View>
                    <View style={styles.stopContent}>
                      <Text style={[styles.nearName, { color: colors.text }]} numberOfLines={2}>{shortStopName(stop.name)}</Text>
                      <Text style={[styles.stopSubtitle, { color: colors.textSoft }]} numberOfLines={1}>
                        {[city, stop.walkMinutes ? `${stop.walkMinutes} min lopen` : ""].filter(Boolean).join(" · ") || "In de buurt"}
                      </Text>
                    </View>
                    {isFavoriteStop(stop.id) ? <Ionicons name="star" size={14} color={colors.warning} /> : null}
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </Pressable>
                );
              }
              return (
                <View style={[styles.stopRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                  <Pressable accessibilityRole="button" accessibilityLabel={"Open halte " + stop.name}
                    onPress={() => openStop(stop)}
                    style={({ pressed }) => [styles.stopMain, { backgroundColor: pressed ? colors.surfaceSoft : colors.surface }]}>
                    <View style={[styles.modePill, { backgroundColor: colors.accentSoft }]}>
                      <Ionicons name={`${vehicleIcon(stop.mode)}-outline`} size={18} color={colors.accentText} />
                    </View>
                    <View style={styles.stopContent}>
                      <Text style={[styles.stopTitle, { color: colors.text }]} numberOfLines={2}>{stop.name}</Text>
                      <Text style={[styles.stopSubtitle, { color: colors.textSoft }]} numberOfLines={1}>
                        {[stop.city, stop.walkMinutes ? `${stop.walkMinutes} min lopen` : ""].filter(Boolean).join(" · ")}
                      </Text>
                      {stop.lines.length ? (
                        <View style={styles.lines}>{stop.lines.slice(0, 5).map((line, i) =>
                          <LijnBadge key={`${line.line}-${i}`} line={line.line} carrier={line.carrier} compact />
                        )}</View>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
                  </Pressable>
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={(isFavoriteStop(stop.id) ? "Verwijder favoriete halte " : "Bewaar favoriete halte ") + stop.name}
                    onPress={() => toggleFavoriteStop(stop)} style={styles.favoriteAction}>
                    <Ionicons name={isFavoriteStop(stop.id) ? "star" : "star-outline"} size={23}
                      color={isFavoriteStop(stop.id) ? colors.warning : colors.textSoft} />
                  </Pressable>
                </View>
              );
            }}
          />
        )}
      </View>
      <View style={[styles.boardLayer, showingBoard ? null : styles.hidden]} pointerEvents={showingBoard ? "auto" : "none"}>
        <FlowWorkspace />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingBottom: 12 },
  brandLine: { flexDirection: "row", alignItems: "center", gap: 9, paddingBottom: 12 },
  brandMark: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 23, fontWeight: "900", letterSpacing: -0.6 },
  caption: { fontSize: 10.5, marginTop: 1 },
  beta: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6 },
  betaText: { fontSize: 8.5, fontWeight: "900" },
  searchLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  search: { flex: 1, minWidth: 0, borderRadius: 12, height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 },
  searchPlaceholder: { flex: 1, minWidth: 0, fontSize: 14 },
  searchCancel: { minHeight: 44, justifyContent: "center" },
  searchCancelText: { fontSize: 14, fontWeight: "800" },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 0 },
  switchRow: { flexDirection: "row" },
  cityBar: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7, paddingBottom: 7 },
  cityChoice: { borderWidth: 1, borderRadius: 8, minHeight: 32, paddingHorizontal: 9, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center" },
  cityOptions: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 12, paddingBottom: 10 },
  searchFilters: { flexDirection: "row", gap: 7, marginTop: 10 },
  searchFilter: { flex: 1, minHeight: 32, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  switchButton: { flex: 1, alignItems: "center", paddingVertical: 11, borderBottomWidth: 2 },
  switchText: { fontSize: 12.5, fontWeight: "800" },
  listLayer: { flex: 1 }, boardLayer: { flex: 1 }, hidden: { display: "none" },
  listContent: { paddingBottom: 40 },
  headingRow: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  headingLink: { fontSize: 12.5, fontWeight: "800" },
  // One card for "Haltes in de buurt": the rows share the side borders, the first and last are rounded.
  card: { marginHorizontal: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  nearRow: { marginHorizontal: 12, minHeight: 54, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 11,
    borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth },
  cardFirst: { borderTopWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  cardLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  nearIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  nearName: { fontSize: 15, fontWeight: "700", lineHeight: 19 },
  // V5.9: a stop area with separate, independently tappable bus/metro/train entries.
  nearGroupCard: { marginHorizontal: 12, marginBottom: 7, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  nearGroupHead: { minHeight: 39, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 6,
    flexDirection: "row", alignItems: "center", gap: 8 },
  nearGroupStop: { minHeight: 43, paddingHorizontal: 13, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 7 },
  nearType: { flex: 1, minWidth: 64, fontSize: 12, fontWeight: "600" },
  nearGroupLines: { flexShrink: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap", gap: 4 },
  quickArea: { paddingHorizontal: 15, paddingVertical: 10, borderBottomWidth: 1, gap: 7 },
  quickTitle: { fontSize: 11, fontWeight: "800" },
  quickLinks: { flexDirection: "row", gap: 8 },
  quickChip: { flex: 1, minWidth: 0, minHeight: 39, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, borderWidth: 1, borderRadius: 9 },
  quickChipText: { flex: 1, fontSize: 12, fontWeight: "700" },
  localHint: { fontSize: 11, paddingHorizontal: 15, marginBottom: 8 },
  searchWarning: { marginHorizontal: 15, marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 9 },
  listTitle: { fontSize: 15, fontWeight: "900" }, count: { fontSize: 12, fontWeight: "700" },
  stopRow: { minHeight: 74, paddingHorizontal: 15, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 4, borderBottomWidth: 1 },
  stopMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 11 },
  favoriteAction: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  modePill: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  stopContent: { flex: 1, minWidth: 0 },
  stopTitle: { fontSize: 15, fontWeight: "800", lineHeight: 19 },
  stopSubtitle: { fontSize: 11, marginTop: 3 },
  lines: { flexDirection: "row", gap: 5, marginTop: 6, flexWrap: "wrap" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { paddingTop: 24, textAlign: "center", fontSize: 13, lineHeight: 20 },
  emptyWrap: { paddingHorizontal: 30, alignItems: "center" },
  emptyActions: { marginTop: 20, gap: 10, alignItems: "center" },
  emptyAction: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: 10 },
  exampleBanner: { marginHorizontal: 15, marginBottom: 8, padding: 12, borderRadius: 8 },
  mineMain: { minHeight: 60, paddingHorizontal: 15, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 11 },
  mineDirection: { fontSize: 15, fontWeight: "700" },
  tripCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", paddingLeft: 12 },
  tripMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  tripText: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: "600" },
  tripStrong: { fontWeight: "900" },
  tripClose: { width: 38, height: 44, alignItems: "center", justifyContent: "center" }
});
