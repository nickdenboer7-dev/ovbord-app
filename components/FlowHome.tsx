import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Linking, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { largeText } from "../lib/textScale";
import { useApp } from "../context/AppProvider";
import { useFlowNavigation } from "../context/FlowNavigation";
import { getHalte, getNearby, searchCatalog, type SearchJourney } from "../lib/api";
import { uniqueRecentStops } from "../lib/flowRitQuality";
import { areaLineSources, groupNearbyStops, nearbyGroupRows, type NearbyModeRow, type NearbyStopGroup } from "../lib/nearbyGroups";
import { createAreaLinesLoader } from "../lib/stopLines";
import { sortLines } from "../lib/lineSet";
import { MANUAL_CITIES, VOORBEELD_LOCATIE_UTRECHT, type LocatieResultaat } from "../lib/location";
import { useLiveLocation } from "../lib/useLiveLocation";
import { useLocationStartup } from "../lib/useLocationStartup";
import { rememberNearby, nearbyScope } from "../lib/nearbyCache";
import { NearbySkeleton } from "./NearbySkeleton";
import { describeLocationAge, isLocationStale, shouldApplyResponse } from "../lib/liveLocation";
import { mergeStopResults, rankSearchStops, resolveSearchTerm, searchSavedStops } from "../lib/flowSearch";
import { failureKind, listRefreshNotice, nearbyUnavailableMessage } from "../lib/offline";
import type { FailureKind } from "../lib/offline";
import { LijnBadge } from "./LijnBadge";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { vehicleIcon } from "../lib/ritVehicle";
import { FlowWorkspace } from "./FlowWorkspace";
import { useFavoritesLive } from "../context/FavoritesLive";
import { ritParamsForDeparture } from "../lib/ritRoute";
import { useSmartRefresh } from "../lib/useSmartRefresh";
import { favoriteLineKey } from "../lib/favoriteLines";
import { DepartureLine } from "./DepartureLine";
import { nearbyCountText, nearbyDistance } from "../lib/nearbyPresentation";
import { activeTripValid } from "../lib/activeTrip";
import { alightRemainingStops, alightTimeLabel } from "../lib/alightCard";
import { dailyTravelLabel, availableDailyJourney, EMPTY_DAILY_TRAVEL, type DailySlot } from "../lib/dailyTravel";
import { favoriteJourneyDepartures } from "../lib/favoritesLive";
import { effectiveDepartureClock } from "../lib/format";
import type { NativeAlightReminderStatus } from "../lib/journeyReminders";
import type { ActiveTrip } from "../lib/activeTrip";
import { clearActiveTrip, loadActiveTrip, loadTripSnapshot } from "../lib/activeTripStore";
import { rememberAlighting } from "../lib/alighting";
import { walkingDepartureAdvice } from "../lib/leaveTime";
import { forYouDepartures, type ForYouBoard } from "../lib/forYou";
import { cachedBoard, cachedStops, hydrateBoardCache } from "../lib/boardCache";
import { loadLineOrigins } from "../lib/lineOrigins";
import { useWalkingPosition } from "../lib/useWalkingPosition";
import { boardRefreshNotice } from "../lib/offline";
import { distanceMeters } from "../lib/boardingMatch";
import { runLimited } from "../lib/concurrency";
import type { DepartureItem, JourneyStop, LineInfo, StopSummary } from "../types/api";

type ListTab = "nabij" | "recent" | "favoriet";
type SearchFilter = "alles" | "haltes" | "ritten";
type SearchRow = { kind: "halte"; stop: StopSummary } | { kind: "rit"; journey: SearchJourney } | { kind: "groep"; group: NearbyStopGroup; rows: NearbyModeRow[] };
type SearchSection = { title: string; data: SearchRow[] };
type NearbyState = "loading" | "ready" | "permission-denied" | "outside-nl" | "no-gps" | "empty" | "offline" | "error";

/**
 * V5.9.1: lines of the stop areas around you that /api/nearby leaves out (it keeps only the nearest
 * platform per stop name). Shared by every Start render; bounded and cached (lib/stopLines.ts).
 */
const areaLinesLoader = createAreaLinesLoader({ fetchBoard: getHalte });

/** "Amsterdam, Rembrandtplein" → "Rembrandtplein" for short lines. */
function shortStopName(name: string): string {
  const words = String(name || "").split(", ");
  return words.length === 2 && words[0].length <= 30 ? words[1] : name;
}

/** One persistent screen for search, stop boards, inline journeys and intermediate stops. */
export function FlowHome() {
  const { colors, resolvedScheme, recentStops, favoriteStops, favoriteJourneys, favoriteLines, dailyTravel = EMPTY_DAILY_TRAVEL, setDailyTravel, addRecentStop, toggleFavoriteStop, isFavoriteStop, manualCity, setManualCity } = useApp();
  const { screens, showStop, searchRequest, homeRequest } = useFlowNavigation();
  const { boards: favoriteBoards, refreshFailure: favoritesFailure, refreshing: favoritesUpdating, refresh: refreshFavorites, stopsKey: favoritesKey } = useFavoritesLive();
  const [nowMs, setNowMs] = useState(() => Date.now());
  /** The trip last opened on the trip page, offered on Start until shortly after arrival. */
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [tripStops, setTripStops] = useState<JourneyStop[] | null>(null);
  const [alightReminder, setAlightReminder] = useState<NativeAlightReminderStatus | null>(null);
  const [dailyTripChoosing, setDailyTripChoosing] = useState<DailySlot | null>(null);
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
  const walkingPosition=useWalkingPosition(!manualCity&&!useUtrechtExample);
  const locationWaitExpired = useLocationStartup(nearbyRetry, !manualCity && !useUtrechtExample && !live.coords);
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
        setNearbyState(locationWaitExpired
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
        const items = await getNearby(location.coords.latitude, location.coords.longitude);
        if (!current()) return;
        if (location.bron !== "voorbeeld") rememberNearby({ scope: nearbyScope(manualCity), location, items, previews: {}, updatedAt: Date.now() });
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
  }, [nearbyRetry, manualLocation, live.refreshToken, live.errorCode, live.loading, nearbyRefreshTick, locationWaitExpired]);

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
    }, 150);
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
  // V5.9.1: complete the line sets from each stop area's own board (bounded, cached). Only the
  // answer for the list on screen is applied: a slower answer for an earlier list is dropped.
  const [areaLines, setAreaLines] = useState<Record<string, LineInfo[]>>({});
  useEffect(() => {
    let active = true;
    const sources = areaLineSources(nearbyGroups);
    setAreaLines(areaLinesLoader.peek(sources));
    if (sources.length) void areaLinesLoader.load(sources).then((lines) => { if (active) setAreaLines(lines); });
    return () => { active = false; };
  }, [nearbyGroups]);
  const nearbyCards = useMemo(() => nearbyGroups.map((group) => ({ group, rows: nearbyGroupRows(group, areaLines) })), [nearbyGroups, areaLines]);
  const [lineOrigins,setLineOrigins]=useState<Record<string,StopSummary>>({});
  useEffect(()=>{let active=true;void Promise.all([loadLineOrigins(),hydrateBoardCache()]).then(([value])=>{if(active)setLineOrigins(value);});return()=>{active=false;};},[favoriteLines]);
  const savedLineSources = useMemo(() => favoriteLines.map((key) => {
    const candidates = [...favoriteStops,...recentStops,...cachedStops(), ...nearbyCards.flatMap(({ rows }) => rows.map((row) => ({ ...row.openStop, lines: row.lines })))];
    return { key, stop: lineOrigins[key] || candidates.find((candidate) => candidate.lines.some((line) => favoriteLineKey(line.line, line.carrier) === key)) };
  }), [favoriteLines, favoriteStops, recentStops,nearbyCards,lineOrigins]);
  const [savedLineBoards, setSavedLineBoards] = useState<Record<string, ForYouBoard & {failure?:FailureKind}>>({});
  const [savedLinesUpdating, setSavedLinesUpdating] = useState(false);
  const savedLineIds = [...new Set(savedLineSources.flatMap(({ stop }) => stop ? [stop.id] : []))].sort().join("|");
  const savedLinesRequest = useRef(0);
  const refreshSavedLines = useCallback(async () => {
    if (!savedLineIds) return;
    const request = ++savedLinesRequest.current;
    setSavedLinesUpdating(true);
    const loaded:[string,ForYouBoard & {failure?:FailureKind}][]=[];
    await runLimited(savedLineIds.split("|"),3,async (id) => {
      const cached=await cachedBoard(id);
      if(request===savedLinesRequest.current&&cached)setSavedLineBoards(previous=>previous[id]?.board?previous:{...previous,[id]:{...cached,stale:true}});
      try { loaded.push([id,{board:await getHalte(id),fetchedAt:Date.now(),stale:false}]); }
      catch(error) { loaded.push([id,{board:cached?.board,fetchedAt:cached?.fetchedAt,stale:true,failure:failureKind(error)}]); }
    });
    if (request === savedLinesRequest.current) {
      // Do not show old cached departures as Live after a failed refresh.
      setSavedLineBoards(Object.fromEntries(loaded));
      setSavedLinesUpdating(false);
    }
  }, [savedLineIds]);
  useEffect(() => { void refreshSavedLines(); return () => { savedLinesRequest.current += 1; }; }, [refreshSavedLines]);
  useSmartRefresh(refreshSavedLines, 60000, "saved-lines:" + savedLineIds, screens.length === 0);
  const sections = useMemo<SearchSection[]>(() => {
    const haltes: SearchRow[] = data.map((stop) => ({ kind: "halte", stop }));
    if (!finding && tab === "nabij") {
      const groups: SearchRow[] = nearbyCards.map(({ group, rows }) => ({ kind: "groep", group, rows }));
      return groups.length ? [{ title: "", data: groups }] : [];
    }
    // No section at all when empty: an empty section still counts as content, which
    // kept the explanation and the GPS/retry buttons in ListEmptyComponent from showing.
    if (!finding) return haltes.length ? [{ title: "", data: haltes }] : [];
    return [
      { title: "Haltes", data: searchFilter === "ritten" ? [] : haltes },
      { title: "Ritten", data: searchFilter === "haltes" ? [] : journeys.map((journey): SearchRow => ({ kind: "rit", journey })) }
    ].filter((section) => section.data.length > 0);
  }, [data, finding, journeys, searchFilter, tab, nearbyCards]);
  const resultCount = finding
    ? (searchFilter === "ritten" ? journeys.length : searchFilter === "haltes" ? data.length : data.length + journeys.length)
    : data.length;
  const showingBoard = screens.length > 0 && screens[0]?.returnTo !== "/buurtbord" && !finding;
  // "Mijn ritten": saved trips with their next departures, at the top of the nearby list.
  const showMine = !finding && tab === "nabij" && (favoriteJourneys.length+favoriteStops.length+favoriteLines.length)>0;
  const personalBoards:Record<string,ForYouBoard>={...savedLineBoards};
  for(const [id,entry] of Object.entries(favoriteBoards))if(entry.board&&(!personalBoards[id]?.board||(entry.fetchedAt||0)>=(personalBoards[id]?.fetchedAt||0)))personalBoards[id]=entry;
  const personalRows=forYouDepartures(personalBoards,favoriteStops,favoriteLines,favoriteJourneys,nowMs);
  const offline=favoritesFailure==="offline"||Object.values(savedLineBoards).some(e=>e.failure==="offline")||nearbyState==="offline"||nearbyRefreshFailure==="offline";
  const personalUpdatedAt=Math.max(0,...Object.values(personalBoards).map(e=>e.fetchedAt||0))||null;
  const homeSavedStops=uniqueRecentStops([...favoriteStops,...(offline?recentStops:[])]);
  // V5.8: the stop board has a white header too (like Start), so the status bar simply follows
  // the theme everywhere. Rendered only while focused, so Favorieten and Meer follow the theme.
  const [focused, setFocused] = useState(true);
  const statusBarStyle = resolvedScheme === "dark" ? "light" : "dark";
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useFocusEffect(useCallback(() => {
    if (favoriteJourneys.length||favoriteStops.length) void refreshFavorites();
    let active = true;
    void loadActiveTrip(Date.now()).then((trip) => { if (active) setActiveTrip(trip); });
    return () => { active = false; };
  }, [favoriteJourneys.length, favoriteStops.length, refreshFavorites]));
  const showTrip = !finding && tab === "nabij" && activeTripValid(activeTrip, nowMs);
  useEffect(() => {
    let alive = true;
    setTripStops(null);
    setAlightReminder(null);
    if (focused && activeTrip?.alighting) {
      void loadTripSnapshot().then(snapshot => {
        if (alive && snapshot?.tripId === activeTrip.tripId) setTripStops(snapshot.data.stops);
      });
      // Load Expo notifications only for an actual followed trip; Start must stay lightweight.
      void import("../lib/journeyReminders").then(module => module.nativeAlightReminderStatus()).then(status => {
        if (alive) setAlightReminder(status);
      }).catch(() => { if (alive) setAlightReminder({ state: "error" }); });
    }
    return () => { alive = false; };
  }, [focused, activeTrip?.tripId, activeTrip?.alighting?.id, activeTrip?.alightClock]);
  const openActiveTrip = (trip: ActiveTrip) => {
    // The alighting stop comes back too, also after the app was closed.
    rememberAlighting(trip.tripId, trip.alighting);
    router.push({ pathname: "/rit/[id]", params: { ...trip.params, id: trip.tripId } });
  };
  const dismissActiveTrip = () => { void clearActiveTrip(); setActiveTrip(null); };
  useSmartRefresh(() => refreshFavorites(), favoritesFailure ? 20000 : 60000, "start:" + favoritesKey, showMine && !showingBoard);
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
          <Text style={[styles.brand, { color: colors.heading }]} accessibilityRole="header" maxFontSizeMultiplier={1.2}>OVbord</Text>
          <Pressable onPress={openSearch} accessibilityRole="button" accessibilityLabel="Zoeken" hitSlop={10} style={{ marginLeft: "auto", padding: 5 }}><Ionicons name="search" size={25} color={colors.heading} /></Pressable>
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
              style={[styles.searchFilter, { borderBottomColor: searchFilter === choice ? colors.accent : "transparent" }]}>
              <Text style={{ color: searchFilter === choice ? colors.accentText : colors.textSoft, fontSize: 12, fontWeight: "800" }}>
                {choice === "alles" ? "Alles" : choice === "haltes" ? "Haltes" : "Ritten"}
              </Text>
            </Pressable>
          ))}
        </View> : null}
      </View> : null}

      <View style={[styles.listLayer, showingBoard ? styles.hidden : null]} pointerEvents={showingBoard ? "none" : "auto"}>
        {finding && loadingSearch && !resultCount ? (
          <View style={styles.center}><ActivityIndicator color={colors.accentText} /></View>
        ) : (
          <SectionList<SearchRow>
            sections={sections}
            stickySectionHeadersEnabled={false}
            keyExtractor={(item) => item.kind === "groep" ? "groep:" + item.group.key : item.kind === "halte" ? "halte:" + item.stop.id : "rit:" + item.journey.journeyId}
            renderSectionHeader={({ section }) => finding ? (
              <View style={[styles.headingRow, { backgroundColor: colors.surfaceSoft, borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
                <Text style={[styles.listTitle, { color: colors.heading }]}>{section.title}</Text>
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
                {!finding && tab === "nabij" ? <View>
                  {offline ? <View style={[styles.searchWarning,{backgroundColor:colors.warningSoft}]}>
                    <Ionicons name="cloud-offline-outline" size={18} color={colors.text}/>
                    <Text style={{color:colors.text,flex:1,fontSize:12}}>{boardRefreshNotice("offline",personalUpdatedAt)}</Text>
                  </View> : null}
                  {showTrip && activeTrip ? (() => {
                    const count = tripStops ? alightRemainingStops(tripStops, activeTrip) : null;
                    const scheduled = alightReminder?.state === "scheduled" && alightReminder.stopName === activeTrip.alightName && alightReminder.at > nowMs;
                    const reminderLabel = scheduled && alightReminder?.state === "scheduled"
                      ? "Melding ingesteld voor " + new Date(alightReminder.at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
                      : alightReminder?.state === "blocked" ? "Meldingen geblokkeerd · kijk bij Meer"
                      : alightReminder?.state === "disabled" ? "Uitstapmelding staat uit · kijk bij Meer"
                      : alightReminder?.state === "ready" ? "Nog geen Android-melding gepland"
                      : "Meldingstatus controleren bij Meer";
                    return <View style={[styles.smartAlightCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.smartAlightHeading}>
                        <Ionicons name="navigate-circle" color="#185C98" size={22}/>
                        <Text maxFontSizeMultiplier={1.3} style={{ fontWeight: "900", fontSize: 15, color: colors.heading, flex: 1 }}>{activeTrip.alighting ? "Je uitstapkaart" : "Laatst bekeken rit"}</Text>
                        <Pressable onPress={dismissActiveTrip} accessibilityRole="button" accessibilityLabel="Rit van Start verwijderen" hitSlop={9}>
                          <Ionicons name="close" size={20} color={colors.textSoft}/>
                        </Pressable>
                      </View>
                      <Pressable accessibilityRole="button" onPress={() => openActiveTrip(activeTrip)}
                        accessibilityLabel={"Open ritverloop lijn " + activeTrip.line + " naar " + activeTrip.destination}
                        style={styles.smartAlightBody}>
                        <LijnBadge line={activeTrip.line} carrier={activeTrip.carrier} compact/>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: colors.heading, fontWeight: "800", fontSize: 15 }}>
                            naar {activeTrip.destination || "bestemming"}
                          </Text>
                          <Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={{ color: colors.textSoft, fontSize: 12 }}>
                            {activeTrip.alighting ? "Uitstappen: " + activeTrip.alightName : "Laatst bekeken rit"}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text maxFontSizeMultiplier={1.3} style={{ fontWeight: "900", fontSize: 15, color: colors.heading, fontVariant: ["tabular-nums"] }}>
                            {activeTrip.alighting ? alightTimeLabel(activeTrip, nowMs) : activeTrip.endClock}
                          </Text>
                          {count !== null ? <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSoft, fontSize: 10 }}>{count === 0 ? "bij je halte" : "± " + count + (count === 1 ? " halte" : " haltes")}</Text> : null}
                        </View>
                        <Ionicons name="chevron-forward" size={17} color={colors.accentText}/>
                      </Pressable>
                      {activeTrip.alighting ? <View style={[styles.smartAlightStatus, { borderTopColor: colors.border }]}>
                        <Ionicons name={scheduled ? "notifications" : "notifications-outline"} size={14} color={scheduled ? "#16894B" : colors.textSoft}/>
                        <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSoft, fontSize: 11, flex: 1 }}>{reminderLabel} · tijden volgens ritinformatie</Text>
                      </View> : null}
                    </View>;
                  })() : null}
                  {favoriteJourneys.length || dailyTravel.morning || dailyTravel.evening ? <View>
                    <View style={styles.headingRow}>
                      <Text maxFontSizeMultiplier={1.3} style={[styles.listTitle, { color: colors.heading }]}>Mijn dagelijkse reis</Text>
                    </View>
                    <View style={[styles.dailyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      {(["morning", "evening"] as const).map((slot, index) => {
                        const saved = availableDailyJourney(favoriteJourneys, dailyTravel[slot]);
                        const entry = saved ? favoriteBoards[saved.stop.id] : undefined;
                        const next = saved && entry?.board
                          ? favoriteJourneyDepartures(entry.board.departures, saved, nowMs, 6).find(dep => !dep.cancelled && !dep.departed)
                          : undefined;
                        const walking = saved && next && !entry?.stale && !offline ? walkingDepartureAdvice(next, walkingPosition, saved.stop, nowMs) : null;
                        return <View key={slot} style={[styles.dailyItem, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                          <View style={styles.dailyTitleRow}>
                            <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSoft, fontSize: 11, fontWeight: "800", flex: 1 }}>{dailyTravelLabel(slot)}</Text>
                            <Pressable accessibilityRole="button" accessibilityLabel={"Kies " + dailyTravelLabel(slot)}
                              onPress={() => setDailyTripChoosing(current => current === slot ? null : slot)} hitSlop={8}>
                              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.accentText, fontSize: 11, fontWeight: "800" }}>{saved ? "Wijzig" : "Kies rit"}</Text>
                            </Pressable>
                          </View>
                          {saved ? <Pressable onPress={() => next ? openMyDeparture(saved.stop, next) : openStop(saved.stop)}
                            accessibilityRole="button" accessibilityLabel={"Open dagelijkse rit " + saved.line + " naar " + saved.direction} style={styles.dailyTripRow}>
                            <LijnBadge line={saved.line} carrier={saved.carrier} compact/>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ color: colors.text, fontSize: 13, fontWeight: "800" }}>{saved.direction}</Text>
                              <Text maxFontSizeMultiplier={1.3} numberOfLines={2} style={{ color: colors.textSoft, fontSize: 11 }}>{saved.stop.name}{walking ? " · " + walking : ""}</Text>
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 17, fontWeight: "900", fontVariant: ["tabular-nums"], color: colors.heading }}>{next ? effectiveDepartureClock(next) : "—"}</Text>
                              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSoft, fontSize: 10 }}>{entry?.stale ? "laatst bekend" : next ? "volgend vertrek" : "geen vertrek"}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.accentText}/>
                          </Pressable> : <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSoft, fontSize: 12, paddingTop: 5 }}>Kies een opgeslagen favoriete rit als snelkoppeling.</Text>}
                          {dailyTripChoosing === slot ? <View style={[styles.dailyPicker, { borderTopColor: colors.border }]}>
                            {favoriteJourneys.map(journey => <Pressable key={journey.key} accessibilityRole="button"
                              onPress={() => { setDailyTravel(slot, journey.key); setDailyTripChoosing(null); }}
                              style={{ paddingVertical: 9, minHeight: 41, flexDirection: "row", alignItems: "center", gap: 8 }}>
                              <LijnBadge line={journey.line} carrier={journey.carrier} compact/>
                              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.text, fontSize: 12, flex: 1 }} numberOfLines={2}>{journey.direction} · {journey.stop.name}</Text>
                              {dailyTravel[slot] === journey.key ? <Ionicons name="checkmark-circle" size={19} color="#16894B"/> : null}
                            </Pressable>)}
                            {saved ? <Pressable accessibilityRole="button" onPress={() => { setDailyTravel(slot, null); setDailyTripChoosing(null); }} style={{ paddingVertical: 10 }}>
                              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.delayWarning, fontSize: 12, fontWeight: "800" }}>Snelkoppeling verwijderen</Text>
                            </Pressable> : null}
                            {!favoriteJourneys.length ? <Text style={{ color: colors.textSoft, fontSize: 11 }}>Bewaar eerst een rit via het haltebord als favoriet.</Text> : null}
                          </View> : null}
                        </View>;
                      })}
                    </View>
                  </View> : null}
                  {showMine ? <>
                  <View style={styles.headingRow}>
                    <Text style={[styles.listTitle,{color:colors.heading}]} accessibilityRole="header">Voor jou</Text>
                    {favoritesUpdating||savedLinesUpdating?<Text style={{color:colors.textMuted,fontSize:11}}>Bijwerken…</Text>:null}
                  </View>
                  <View style={styles.card}>
                    {personalRows.map(({stop:sourceStop,item,stale},index)=>{
                      const advice=!stale&&!offline?walkingDepartureAdvice(item,walkingPosition,sourceStop,nowMs):null;
                      return <DepartureLine key={sourceStop.id+":"+item.id+":"+index} item={item} nowMs={nowMs} stale={stale||offline}
                        last={index===personalRows.length-1} note={shortStopName(sourceStop.name)}
                        detail={advice||undefined} onPress={()=>openMyDeparture(sourceStop,item)}/>;
                    })}
                    {!personalRows.length?<Text style={{color:colors.textSoft,fontSize:13,padding:16,lineHeight:19}}>
                      Nog geen komende vertrekken geladen. Open een van jouw haltes.
                    </Text>:null}
                  </View>
                  </> : <Text style={{color:colors.textSoft,fontSize:13,padding:16,lineHeight:19}}>Tik op de ster bij een halte of lijn, dan staat die hier</Text>}
                  {homeSavedStops.length ? <>
                  <View style={styles.headingRow}>
                    <Text style={[styles.listTitle,{color:colors.heading}]} accessibilityRole="header">Jouw haltes</Text>
                    <Pressable onPress={()=>router.navigate("/favorieten")} accessibilityRole="button" accessibilityLabel="Alle favorieten openen">
                      <Text style={[styles.headingLink,{color:colors.accentText}]}>Alle favorieten</Text>
                    </Pressable>
                  </View>
                  {homeSavedStops.map(saved=>{
                    const distance=walkingPosition?distanceMeters(walkingPosition,saved):Infinity;
                    const count=saved.lines.length;
                    return <Pressable key={saved.id} onPress={()=>openStop(saved)} accessibilityRole="button" style={[styles.nearRow,{borderBottomColor:colors.border}]}>
                      <View style={styles.stopContent}><Text style={[styles.nearName,{color:colors.text}]}>{saved.name}</Text>
                        <Text style={[styles.stopSubtitle,{color:colors.textSoft}]}>{Number.isFinite(distance)?Math.round(distance)+" m · ":""}{count} {count===1?"lijn":"lijnen"}{!favoriteStops.some(s=>s.id===saved.id)?" · recent geopend":""}</Text>
                      </View><Ionicons name="chevron-forward" size={18} color={colors.textMuted}/>
                    </Pressable>;
                  })}
                  </> : null}
                </View> : null}

                <View style={styles.headingRow}>
                  <Text style={[styles.listTitle, { color: colors.heading }]} accessibilityRole="header">{finding ? "Zoekresultaten" : tab === "nabij" ? "Haltes in de buurt" : tab === "recent" ? "Onlangs bekeken" : "Favoriete haltes"}</Text>
                  {!finding && tab === "nabij" ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={manualCity ? "Stad wijzigen" : "Handmatig stad kiezen"} hitSlop={8}
                      onPress={() => setShowCities((open) => !open)}>
                      <Text style={[styles.headingLink, { color: colors.accentText }]}>{manualCity
                        ? (MANUAL_CITIES.find((city) => city.key === manualCity)?.name || "Stad")
                        : "Kies stad"}</Text>
                    </Pressable>
                  ) : <Text style={[styles.count, { color: colors.textMuted }]}>{resultCount}</Text>}
                </View>
                {!finding && tab === "nabij" && nearbyState === "ready" ? <Text style={{ color: colors.textSoft, fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 }}>{nearbyCountText(nearbyCards.reduce((total, card) => total + card.rows.length, 0))}</Text> : null}
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
                    <Pressable accessibilityRole="button" accessibilityLabel="GPS-locatie opnieuw ophalen"
                      onPress={live.requestFresh}
                      style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.surface }}>
                      <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "800" }}>Ververs GPS</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={!finding && tab === "nabij" && nearbyState === "loading" ? (
              <NearbySkeleton label={!manualLocation && !live.coords ? "Locatie bepalen…" : "Haltes laden…"} />
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
                return <View>
                  {item.rows.map((row) => {
                    const distance = row.openStop.distanceMeters;
                    const distanceText = nearbyDistance(distance, row.walkMinutes);
                    const name = item.rows.length > 1 ? shortStopName(row.openStop.name) : group.name;
                    return <Pressable key={row.key} onPress={() => openStop({...row.openStop,variants:row.stops})} accessibilityRole="button"
                      accessibilityLabel={name + ", " + row.label + ", " + distanceText + ", " + row.lines.length + " lijnen"}
                      style={({ pressed }) => [styles.nearRow, { backgroundColor: pressed ? colors.surfaceSoft : colors.surface, borderBottomColor: colors.border }]}>
                      <View style={styles.stopContent}>
                        <Text style={[styles.nearName, { color: colors.text }]} numberOfLines={large ? 2 : 1}>{name}</Text>
                        <Text style={[styles.stopSubtitle, { color: colors.textSoft }]}>{distanceText} · {row.lines.length} {row.lines.length === 1 ? "lijn" : "lijnen"}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </Pressable>;
                  })}
                </View>;
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
                      {/* V5.9.1: every line, wrapping onto more lines; no hidden lines. */}
                      {stop.lines.length ? (
                        <View style={styles.lines}>{sortLines(stop.lines).map((line, i) =>
                          <LijnBadge key={`${line.line}-${i}`} line={line.line} carrier={line.carrier} compact tone="mode" mode={line.mode ?? stop.mode} />
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
        {screens[0]?.returnTo !== "/buurtbord" ? <FlowWorkspace /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingBottom: 12 },
  brandLine: { flexDirection: "row", alignItems: "center", gap: 9, paddingBottom: 12 },
  brandMark: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  brand: { fontSize: 34, fontWeight: "900", letterSpacing: -0.6 },
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
  searchFilter: { flex: 1, minHeight: 32, borderBottomWidth: 2, alignItems: "center", justifyContent: "center" },
  switchButton: { flex: 1, alignItems: "center", paddingVertical: 11, borderBottomWidth: 2 },
  switchText: { fontSize: 12.5, fontWeight: "800" },
  listLayer: { flex: 1 }, boardLayer: { flex: 1 }, hidden: { display: "none" },
  listContent: { paddingBottom: 40 },
  headingRow: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  headingLink: { fontSize: 12.5, fontWeight: "800" },
  // One card for "Haltes in de buurt": the rows share the side borders, the first and last are rounded.
  card: { marginHorizontal: 12, borderWidth: 0, borderRadius: 0, overflow: "hidden" },
  nearRow: { marginHorizontal: 12, minHeight: 54, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth },
  cardFirst: { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  cardLast: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  nearIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  nearName: { fontSize: 15, fontWeight: "700", lineHeight: 19 },
  // V5.9: a stop area with separate, independently tappable bus/metro/train entries.
  nearGroupCard: { marginHorizontal: 12, marginBottom: 0, borderRadius: 0, borderBottomWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  nearGroupHead: { minHeight: 39, paddingHorizontal: 13, paddingTop: 11, paddingBottom: 6,
    flexDirection: "row", alignItems: "center", gap: 8 },
  nearGroupStop: { minHeight: 48, paddingHorizontal: 13, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 9 },
  // V5.9.1: label above, then every line badge; they wrap instead of being cut off or counted as "+N".
  nearGroupBody: { flex: 1, minWidth: 0, gap: 5 },
  nearType: { fontSize: 12, fontWeight: "700" },
  nearGroupLines: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
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
  lines: { flexDirection: "row", gap: 4, marginTop: 6, flexWrap: "wrap" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: { paddingTop: 24, textAlign: "center", fontSize: 13, lineHeight: 20 },
  emptyWrap: { paddingHorizontal: 30, alignItems: "center" },
  emptyActions: { marginTop: 20, gap: 10, alignItems: "center" },
  emptyAction: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: 10 },
  exampleBanner: { marginHorizontal: 15, marginBottom: 8, padding: 12, borderRadius: 8 },
  mineMain: { minHeight: 60, paddingHorizontal: 15, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 11 },
  mineDirection: { fontSize: 15, fontWeight: "700" },
  smartAlightCard: { marginHorizontal: 12, marginTop: 12, borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  smartAlightHeading: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingTop: 10 },
  smartAlightBody: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, paddingVertical: 11, minHeight: 57 },
  smartAlightStatus: { flexDirection: "row", gap: 7, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 9 },
  dailyCard: { marginHorizontal: 12, borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  dailyItem: { paddingHorizontal: 12, paddingVertical: 10 },
  dailyTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dailyTripRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 7 },
  dailyPicker: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 5 }
});
