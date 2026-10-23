import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DepartureHeading, DepartureLine } from "./DepartureLine";
import { DepartureSkeleton } from "./DepartureSkeleton";
import { MenuButton, OverflowMenu } from "./OverflowMenu";
import type { MenuItem } from "./OverflowMenu";
import { FlowLineGroups } from "./FlowLineGroups";
import { useApp } from "../context/AppProvider";
import { useFlowNavigation } from "../context/FlowNavigation";
import { getHalte, getRit, getStopReliability, searchStops } from "../lib/api";
import { useSmartRefresh } from "../lib/useSmartRefresh";
import { departureKey } from "../lib/flowRitQuality";
import { hasAvailableArrivals } from "../lib/arrivalAvailability";
import { isNextServiceDay } from "../lib/format";
import { boardDepartureIdentity, departureTimeChangeLabel, keepBoardDeparture, refreshDepartureTimeChanges, sortBoardDepartures } from "../lib/boardSmartness";
import { departedNoticeVisible, shouldVerifyDeparture, journeyConfirmsDeparture, DEPARTURE_CHECK_COOLDOWN_MS, MAX_DEPARTURE_CHECKS } from "../lib/departedNotice";
import { feedFreshness, platformChangeFor, refreshPlatformChanges } from "../lib/haltebordV4";
import { boardLineFilterKey, matchesBoardLineFilter } from "../lib/boardLineFilters";
import { boardDirectionChoices, matchesBoardDirection } from "../lib/boardDirectionFilters";
import { favoriteLineKey, pinnedDepartures } from "../lib/favoriteLines";
import { withBoardFreshness } from "../lib/realtimeConsistency";
import { boardRefreshNotice, failureKind } from "../lib/offline";
import { ritParamsForDeparture } from "../lib/ritRoute";
import type { FailureKind } from "../lib/offline";
import type { PlatformChanges } from "../lib/haltebordV4";
import type { DepartureTimeChanges } from "../lib/boardSmartness";
import type { DepartureItem, HalteBoardData, ReliabilityInfo, StopSummary } from "../types/api";

type BoardTab = "departures" | "arrivals" | "lines" | "disruptions";
type Props = {
  stop: StopSummary;
  initialBoard?: HalteBoardData;
  /** Line filter key to preselect, e.g. when opened from a favourite trip. */
  initialLine?: string;
  visible?: boolean;
  onBack: () => void;
};

/** Rows under "Jouw lijnen" on a board. */
export const MAX_PINNED_ROWS = 3;

/** The board is rendered inside the Start tab: no Stack route, drawer, or bottom sheet. */
export function FlowBoard({ stop, initialBoard, initialLine, onBack, visible = true }: Props) {
  const { colors, resolvedScheme, addRecentStop, toggleFavoriteStop, isFavoriteStop, favoriteLines, toggleFavoriteLine } = useApp();
  const { requestSearch } = useFlowNavigation();
  const router = useRouter(); // OVBORD_FLOW4_DEDICATED_RIT
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [board, setBoard] = useState<HalteBoardData | null>(initialBoard || null);
  const [loading, setLoading] = useState(!initialBoard);
  const [fetchedAt, setFetchedAt] = useState<number | null>(initialBoard ? Date.now() : null);
  const [nowMs,setNowMs] = useState(Date.now());
  const previousBoard = useRef<HalteBoardData | null>(initialBoard || null);
  const [timeChanges, setTimeChanges] = useState<DepartureTimeChanges>({});
  const [platformChanges, setPlatformChanges] = useState<PlatformChanges>({});
  const [departedNoticeAt, setDepartedNoticeAt] = useState<Record<string, number>>({});
  const departedCheckedAt = useRef<Record<string, number>>({});
  const [gpsQuality, setGpsQuality] = useState<Record<string, ReliabilityInfo>>({});
  const gpsQualityCheckedAt = useRef(0);
  /** Initial load failed: nothing to show. */
  const [error, setError] = useState<string | null>(null);
  /** A refresh failed: the board shows earlier times that are no longer being checked. */
  const [refreshFailure, setRefreshFailure] = useState<FailureKind | null>(null);
  const [retryBoard, setRetryBoard] = useState(0);
  const [tab, setTab] = useState<BoardTab>("departures");
  const [selectedLine, setSelectedLine] = useState<string | null>(initialLine || null);
  /** Destination filter (departures only), combined with the line filter. */
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const boardRequest = useRef(0);
  const listRef = useRef<FlatList<DepartureItem>>(null);
  const reloadBoardRef = useRef<() => Promise<void>>(async () => {});
  const hasArrivals = hasAvailableArrivals(board);
  const freshness = feedFreshness(board || {}, fetchedAt, nowMs);
  // After a failed refresh nothing is confirmed any more: no "Live" labels, no departure checks.
  const dataCurrent = freshness.level === "fresh" && !refreshFailure;
  useEffect(() => {
    gpsQualityCheckedAt.current = 0;
    setGpsQuality({});
    previousBoard.current = initialBoard || null;
    setTimeChanges({});
    setPlatformChanges({});
    setDepartedNoticeAt({});
    departedCheckedAt.current = {};
  }, [stop.id]);
  useEffect(() => {
    if (!board || !visible) return;
    if (Date.now() - gpsQualityCheckedAt.current < 60000) return;
    const eligible = board.departures.filter((item) => item.isLive && item.ritId);
    if (!eligible.length) return;
    let active = true;
    gpsQualityCheckedAt.current = Date.now();
    void getStopReliability(board.stop.id || stop.id, eligible)
      .then((quality) => { if (active) setGpsQuality(quality); })
      .catch((error) => { if (__DEV__) console.warn("GPS-betrouwbaarheid tijdelijk niet beschikbaar", error); });
    return () => { active = false; };
  }, [board, stop.id, visible]);
  // Retry sooner after a failure so the board recovers quickly when the connection returns.
  useSmartRefresh(() => reloadBoardRef.current(), refreshFailure || error ? 10000 : 30000, stop.id + ":" + retryBoard, visible);

  useEffect(()=>{const t=setInterval(()=>setNowMs(Date.now()),15000);return()=>clearInterval(t);},[]);

  // The halt board has no departure-event field today. Verify only a few near-term
  // live journeys against recent GPS progress; never claim "Vertrokken" from time alone.
  useEffect(() => {
    if (!board || !visible || !dataCurrent) return;
    let active = true;
    const checkedNow = Date.now();
    const fromFeed = board.departures.filter(item =>
      item.departed === true && item.cancelled !== true &&
      departedNoticeAt[boardDepartureIdentity(item)] === undefined
    );
    if (fromFeed.length) {
      setDepartedNoticeAt(previous => {
        const next = { ...previous };
        for (const item of fromFeed) {
          const key = boardDepartureIdentity(item);
          if (next[key] === undefined) next[key] = checkedNow;
        }
        return next;
      });
    }
    const candidates = board.departures.filter(item => {
      const key = boardDepartureIdentity(item);
      return departedNoticeAt[key] === undefined && shouldVerifyDeparture(item, checkedNow) &&
        (!departedCheckedAt.current[key] ||
          checkedNow - departedCheckedAt.current[key] >= DEPARTURE_CHECK_COOLDOWN_MS);
    }).slice(0, MAX_DEPARTURE_CHECKS);
    for (const item of candidates) {
      const key = boardDepartureIdentity(item);
      departedCheckedAt.current[key] = checkedNow;
      void getRit(item.ritId!).then(rit => {
        if (!active || !journeyConfirmsDeparture(rit, board.stop)) return;
        setDepartedNoticeAt(previous =>
          previous[key] !== undefined ? previous : { ...previous, [key]: Date.now() }
        );
      }).catch(() => { /* Keep the ordinary departure display when confirmation is unavailable. */ });
    }
    return () => { active = false; };
  }, [board, visible, stop.id, nowMs, departedNoticeAt, dataCurrent]);

  const visibleDepartures = useMemo(() => (board?.departures || [])
    .filter(item => {
      const confirmedAt = departedNoticeAt[boardDepartureIdentity(item)];
      return confirmedAt === undefined ? keepBoardDeparture(item, nowMs)
        : departedNoticeVisible(confirmedAt, nowMs);
    })
    .map(item => {
      const confirmedAt = departedNoticeAt[boardDepartureIdentity(item)];
      return confirmedAt !== undefined && departedNoticeVisible(confirmedAt, nowMs)
        ? { ...item, departed: true } : item;
    }), [board, departedNoticeAt, nowMs]);

  // A refreshed board may lose arrival data while the arrivals tab is open.
  useEffect(() => {
    if (tab === "arrivals" && !hasArrivals) {
      setTab("departures");
      setSelectedLine(null);
    }
  }, [tab, hasArrivals]);

  useEffect(() => {
    let active = true;
    const seq = ++boardRequest.current;
    let pending = false;
    const load = async (initial: boolean) => {
      if (pending) return;
      pending = true;
      if (initial) { setLoading(true); setError(null); setRefreshFailure(null); }
      try {
        let result: HalteBoardData;
        try {
          result = await getHalte(stop.id);
        } catch (firstError) {
          // Offline, a name search cannot help either.
          if (failureKind(firstError) === "offline") throw firstError;
          // Trip feeds occasionally provide a journey-local stop ID instead of a public stop ID.
          // Fall back to the official stop search, and keep the UI in the same tab.
          const matches = await searchStops(stop.name);
          const normalize = (value: string) => value.toLocaleLowerCase("nl").trim();
          const found = matches.find((match) => normalize(match.name) === normalize(stop.name));
          if (!found) throw firstError;
          result = await getHalte(found.id);
        }
        if (!active || seq !== boardRequest.current) return;
        const receivedAt = Date.now();
        const before = previousBoard.current;
        const previousRows = before && before.stop.id === result.stop.id ? before.departures : null;
        setTimeChanges((existing) => refreshDepartureTimeChanges(previousRows, result.departures, existing, receivedAt));
        setPlatformChanges((existing) => refreshPlatformChanges(previousRows, result.departures, existing, receivedAt));
        previousBoard.current = result;
        setBoard(result);
        setFetchedAt(receivedAt);
        setError(null);
        setRefreshFailure(null);
        if (initial) addRecentStop(result.stop);
      } catch (caught) {
        if (!active) return;
        const kind = failureKind(caught);
        if (initial) setError(kind === "offline" ? "Je bent offline. Vertrektijden van deze halte zijn nog niet geladen." : "Vertrektijden niet beschikbaar.");
        else setRefreshFailure(kind);
      } finally {
        pending = false;
        if (active && initial) setLoading(false);
      }
    };
    reloadBoardRef.current = () => load(false);
    void load(!initialBoard);
    return () => { active = false; reloadBoardRef.current = async () => {}; };
  }, [stop.id, retryBoard]);


  const source = useMemo(() => {
    if (!board) return [];
    // V5.8: departures are shown in ascending order of their real expected departure time
    // (effectiveAt, otherwise the existing clock/delay estimate), never the raw feed order.
    const entries = tab === "arrivals" ? board.arrivals
      : tab === "departures" ? sortBoardDepartures(visibleDepartures, nowMs) : [];
    return entries.map((rawItem) => {
      const item = withBoardFreshness(rawItem, dataCurrent);
      const quality = dataCurrent ? gpsQuality[item.ritId || ""] : undefined;
      return quality ? { ...item, reliabilityDetail: quality,
        reliability: quality.level === "very" ? "high" as const :
          quality.level === "good" || quality.level === "reasonable" ? "medium" as const : "low" as const
      } : item;
    });
  }, [board, tab, gpsQuality, visibleDepartures, dataCurrent, nowMs]);

  /** Favourite lines (a star in the Lijnen tab) are shown in "Jouw lijnen". */
  const favoriteKeySet = useMemo(() => new Set(favoriteLines), [favoriteLines]);
  const lineEntries = useMemo(
    () => source.filter((item) => matchesBoardLineFilter(item, selectedLine)),
    [source, selectedLine]
  );
  const directions = useMemo(() => tab === "departures" ? boardDirectionChoices(lineEntries) : [], [tab, lineEntries]);
  const entries = useMemo(
    () => tab === "departures" ? lineEntries.filter((item) => matchesBoardDirection(item, selectedDirection)) : lineEntries,
    [tab, lineEntries, selectedDirection]
  );
  // "Jouw lijnen": up to three rows above "Alle vertrekken"; those rows are not repeated below.
  const pinned = useMemo(() => tab === "departures" && !selectedLine && selectedDirection === null
    ? pinnedDepartures(source, favoriteLines, nowMs, MAX_PINNED_ROWS) : [], [tab, selectedLine, selectedDirection, source, favoriteLines, nowMs]);
  const listRows = useMemo(() => {
    if (!pinned.length) return entries;
    const shown = new Set(pinned.map((item) => boardDepartureIdentity(item)));
    return entries.filter((item) => !shown.has(boardDepartureIdentity(item)));
  }, [entries, pinned]);
  const selectedDirectionLabel = selectedDirection === null ? ""
    : directions.find((choice) => choice.key === selectedDirection)?.label ||
      source.find((item) => matchesBoardDirection(item, selectedDirection))?.destination || "";

  const selectTab = (next: BoardTab) => { setTab(next); setSelectedLine(null); setSelectedDirection(null); setDirectionsOpen(false); };
  const selectDirection = (key: string | null) => {
    setSelectedDirection(key);
    setDirectionsOpen(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const clearFilters = () => { setSelectedLine(null); setSelectedDirection(null); listRef.current?.scrollToOffset({ offset: 0, animated: false }); };
  const selectLine = (line: string | null) => {
    const matchingRow = line === null ? undefined : source.find(row => row.line === line);
    setSelectedLine(line === null ? null : boardLineFilterKey(line, matchingRow?.carrier));
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const openTrip = (item: DepartureItem) => {
    // Cancelled trips can be opened: the trip page then shows "Rijdt niet" and the route.
    if (!item.ritId || item.departed === true) return;
    // A separate Expo Router page replaces the old inline expansion.
    // The existing FlowBoard is preserved on the navigation stack.
    router.push({ pathname: "/rit/[id]", params: ritParamsForDeparture(item, board?.stop || stop) });
  };
  const pullToRefresh = async () => {
    setRefreshing(true);
    try { await reloadBoardRef.current(); } finally { setRefreshing(false); }
  };

  const viewTitle = tab === "disruptions" ? "Storingen" : "";
  const selectedLineLabel = selectedLine ? source.find((row) => matchesBoardLineFilter(row, selectedLine))?.line || selectedLine : "";
  const disruptionCount = board?.disruptions.length || 0;
  // Options that do not need to be on screen all the time.
  const menuItems: MenuItem[] = [];
  if (tab === "departures" && selectedDirection === null && directions.length > 1) {
    menuItems.push({ key: "direction", label: "Filter op richting", icon: "navigate-outline", onPress: () => setDirectionsOpen(true) });
  }
  if (selectedDirection !== null) menuItems.push({ key: "direction-clear", label: "Richtingfilter wissen", icon: "close-circle-outline", onPress: () => selectDirection(null) });
  if (selectedLine) menuItems.push({ key: "line-clear", label: "Lijnfilter wissen", icon: "close-circle-outline", onPress: () => selectLine(null) });
  if (disruptionCount && tab !== "disruptions") menuItems.push({ key: "disruptions", label: "Storingen (" + disruptionCount + ")", icon: "warning-outline", onPress: () => selectTab("disruptions") });
  menuItems.push({ key: "refresh", label: "Vertrektijden verversen", icon: "refresh", group: 2, onPress: () => { void pullToRefresh(); } });
  const pinnedHeader = pinned.length ? (
    <View>
      <DepartureHeading title="Jouw lijnen" star />
      {pinned.map((item, index) => (
        <DepartureLine key={"pin:" + departureKey(item, index)} item={item} nowMs={nowMs} stale={Boolean(refreshFailure)}
          onPress={() => openTrip(item)} last={index === pinned.length - 1} />
      ))}
      <DepartureHeading title="Alle vertrekken" />
    </View>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.head, { paddingTop: Math.max(insets.top, 24) + 12, backgroundColor: colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
        <View style={styles.headRow}>
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Terug" style={styles.back}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text maxFontSizeMultiplier={1.2} style={[styles.title, { color: colors.heading }]} numberOfLines={3} accessibilityRole="header">{board?.stop.name || stop.name}</Text>
          <Pressable onPress={() => toggleFavoriteStop(board?.stop || stop)} accessibilityRole="button"
            accessibilityLabel={isFavoriteStop(board?.stop.id || stop.id) ? "Verwijder favoriete halte" : "Bewaar als favoriete halte"}
            accessibilityState={{ selected: isFavoriteStop(board?.stop.id || stop.id) }} style={styles.back}>
            <Ionicons name={isFavoriteStop(board?.stop.id || stop.id) ? "star" : "star-outline"} size={24}
              color={isFavoriteStop(board?.stop.id || stop.id) ? "#FFD86B" : colors.textSoft} />
          </Pressable>
          <MenuButton onPress={() => setMenuOpen(true)} color={colors.text} label="Meer opties voor deze halte" />
        </View>
        {/* Two tabs, as in OVinfo; arrivals only where the feed has them. Compact white-green header (V5.8). */}
        <View style={styles.segments} accessibilityRole="tablist">
          {([["departures", "Vertrekken"], ["lines", "Lijnen"], ...(hasArrivals ? [["arrivals", "Aankomsten"] as const] : [])] as const).map(([value, label]) => {
            const active = tab === value;
            return (
              <Pressable key={value} onPress={() => selectTab(value)} accessibilityRole="tab" accessibilityState={{ selected: active }}
                style={[styles.segment, { borderBottomColor: active ? colors.accent : "transparent" }]}>
                <Text style={[styles.segmentText, { color: active ? colors.heading : colors.textSoft }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {viewTitle ? (
        <View style={[styles.viewBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.viewTitle, { color: colors.text }]} accessibilityRole="header">{viewTitle}</Text>
          <Pressable onPress={() => selectTab("departures")} accessibilityRole="button" accessibilityLabel="Terug naar vertrekken" hitSlop={6} style={styles.viewBack}>
            <Text style={[styles.viewBackText, { color: colors.accentText }]}>Vertrekken</Text>
            <Ionicons name="close" size={17} color={colors.accentText} />
          </Pressable>
        </View>
      ) : null}
      {board && tab !== "disruptions" && disruptionCount > 0 ? (
        // One line; the details are under ⋮ > Storingen.
        <Pressable onPress={() => selectTab("disruptions")} accessibilityRole="button"
          accessibilityLabel={"Storing: " + board.disruptions[0].title + (disruptionCount > 1 ? ", en " + (disruptionCount - 1) + " meer" : "") + ". Meer informatie"}
          style={[styles.alertLine, { backgroundColor: board.disruptions.some((n) => n.severity === "warning") ? colors.warningSoft : colors.surfaceSoft }]}>
          <Ionicons name={board.disruptions.some((n) => n.severity === "warning") ? "warning-outline" : "information-circle-outline"}
            size={18} color={board.disruptions.some((n) => n.severity === "warning") ? colors.danger : colors.accentText} />
          <Text style={[styles.alertLineText, { color: colors.text }]} numberOfLines={1}>{board.disruptions[0].title}</Text>
          {disruptionCount > 1 ? <Text style={[styles.alertLineMore, { color: colors.textSoft }]}>+{disruptionCount - 1}</Text> : null}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
      {board && freshness.level !== "fresh" ? (
        <View style={[styles.dataFreshness, { borderBottomColor: colors.border,
          backgroundColor: freshness.level === "aging" ? colors.warningSoft :
            freshness.level === "stale" ? (resolvedScheme === "dark" ? colors.warningSoft : "#FFF0ED") : colors.surfaceAlt }]}>
          <Ionicons name={freshness.level === "aging" ? "alert-circle-outline" :
            freshness.level === "stale" ? "cloud-offline-outline" : "help-circle-outline"}
            size={16} color={freshness.level === "aging" ? (resolvedScheme === "dark" ? colors.warning : "#B76B00") :
              freshness.level === "stale" ? colors.danger : colors.textSoft} />
          <Text style={[styles.freshnessText, { color: colors.text }]}>{freshness.label}</Text>
          <Text style={{ fontSize: 10, color: colors.textSoft }}>
            {freshness.level === "stale" ? "Ververs om te controleren" : "Laatste bekende gegevens"}
          </Text>
        </View>
      ) : null}
      {board && refreshFailure ? <View style={[styles.refreshWarning, { backgroundColor: colors.warningSoft, borderBottomColor: colors.border }]}><Ionicons name="cloud-offline-outline" size={16} color={colors.text} /><Text style={{ color: colors.text, flex: 1, fontSize: 12 }}>{boardRefreshNotice(refreshFailure, fetchedAt)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Vertrektijden opnieuw laden" onPress={() => setRetryBoard((n) => n + 1)}><Ionicons name="refresh" size={19} color={colors.accentText} /></Pressable></View> : null}
      {loading && !board ? (
        <DepartureSkeleton />
      ) : error && !board ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSoft }}>{error}</Text>
          <Pressable onPress={() => setRetryBoard((value) => value + 1)} accessibilityRole="button" accessibilityLabel="Vertrektijden opnieuw laden" style={styles.retry}>
            <Ionicons name="refresh" size={17} color={colors.accentText} />
            <Text style={{ color: colors.accentText }}>Probeer opnieuw</Text>
          </Pressable>
          <Pressable onPress={onBack} accessibilityRole="button" style={styles.retry}><Text style={{ color: colors.textSoft }}>Terug naar vorige halte</Text></Pressable>
        </View>
      ) : tab === "disruptions" ? (
        <View style={styles.alerts}>
          {board?.disruptions.length ? board.disruptions.map((notice, index) => (
            <View key={index} style={[styles.disruptionItem, { borderBottomColor: colors.border }]}>
              <Ionicons name={notice.severity === "warning" ? "warning-outline" : "information-circle-outline"}
                color={notice.severity === "warning" ? colors.danger : colors.accentText} size={18} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.alertHeadline, { color: colors.text }]}>{notice.title}</Text>
                {notice.description ? <Text style={[styles.alertDescription, { color: colors.textSoft }]}>
                  {notice.description}</Text> : null}
              </View>
            </View>
          )) : <Text style={{ color: colors.textSoft }}>
            {board?.disruptionsAvailable ? "Geen storingen gemeld." :
              "Storingsinformatie wordt nog niet door deze halte-API geleverd."}
          </Text>}
        </View>
      ) : tab === "lines" ? (
        <FlowLineGroups
          departures={sortBoardDepartures(visibleDepartures, nowMs).map(row => withBoardFreshness(row, dataCurrent))}
          onSelectLine={(line) => { setTab("departures"); setSelectedDirection(null); selectLine(line); }}
          onOpenDeparture={openTrip}
          favoriteKeys={favoriteKeySet}
          onToggleFavorite={(line, carrier) => toggleFavoriteLine(favoriteLineKey(line, carrier))}
        />
      ) : (
        <>
          {selectedLine || selectedDirection !== null || directionsOpen ? (
            <View style={[styles.filterPanel, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
              {selectedLine ? (
                <View style={styles.directionActiveRow}>
                  <Pressable onPress={() => selectLine(null)} accessibilityRole="button"
                    accessibilityLabel={"Lijnfilter " + selectedLineLabel + " wissen"}
                    style={[styles.directionActive, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="funnel-outline" size={14} color={colors.accentText} />
                    <Text style={[styles.chipText, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>Lijn {selectedLineLabel}</Text>
                    <Ionicons name="close" size={15} color={colors.textSoft} />
                  </Pressable>
                </View>
              ) : null}
              {selectedDirection !== null ? (
                <View style={styles.directionActiveRow}>
                  <Pressable onPress={() => selectDirection(null)} accessibilityRole="button"
                    accessibilityLabel={"Richtingfilter " + selectedDirectionLabel + " wissen"}
                    style={[styles.directionActive, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="navigate-outline" size={14} color={colors.accentText} />
                    <Text style={[styles.chipText, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>Richting {selectedDirectionLabel}</Text>
                    <Ionicons name="close" size={15} color={colors.textSoft} />
                  </Pressable>
                </View>
              ) : null}
              {directionsOpen && tab === "departures" && selectedDirection === null ? (
                <View>
                  <View style={styles.directionHead}>
                    <Text style={[styles.directionHeadText, { color: colors.textSoft }]}>Kies een richting</Text>
                    <Pressable onPress={() => setDirectionsOpen(false)} accessibilityRole="button" accessibilityLabel="Richtingen verbergen" hitSlop={8}>
                      <Ionicons name="close" size={17} color={colors.textSoft} />
                    </Pressable>
                  </View>
                  <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={directions}
                    keyExtractor={(choice) => choice.key}
                    contentContainerStyle={[styles.filterInner, { paddingTop: 0 }]}
                    renderItem={({ item: choice }) => (
                      <Pressable onPress={() => selectDirection(choice.key)} accessibilityRole="button"
                        accessibilityLabel={"Alleen richting " + choice.label + ", " + choice.count + " vertrekken"}
                        style={[styles.chip, { backgroundColor: colors.surfaceSoft }]}>
                        <Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>{choice.label}</Text>
                      </Pressable>
                    )}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          <FlatList
            ref={listRef}
            data={listRows}
            extraData={{ nowMs, timeChanges, platformChanges, refreshFailure }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void pullToRefresh()}
              colors={[colors.accentText]} tintColor={colors.accentText} progressBackgroundColor={colors.surface} />}
            keyExtractor={(item, index) => departureKey(item, index)}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
            style={{ backgroundColor: colors.surface }}
            ListHeaderComponent={pinnedHeader}
            ListEmptyComponent={(selectedLine || selectedDirection !== null) && source.length ? (
              <View style={{ alignItems: "center", gap: 10 }}>
                <Text style={[styles.empty, { color: colors.textSoft }]}>Geen {tab === "arrivals" ? "aankomsten" : "vertrekken"}
                  {selectedLine ? " van lijn " + selectedLine : ""}{selectedDirection !== null ? " richting " + selectedDirectionLabel : ""}.</Text>
                <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.retry}>
                  <Text style={{ color: colors.accentText, fontWeight: "800" }}>{selectedDirection !== null ? "Toon alle vertrekken" : "Toon alle lijnen"}</Text>
                </Pressable>
              </View>
            ) : pinned.length ? null : <Text style={[styles.empty, { color: colors.textSoft }]}>{tab === "arrivals" ? "Geen aankomsten beschikbaar." : "Geen vertrektijden beschikbaar."}</Text>}
            renderItem={({ item, index }) => {
              const changedFrom = tab === "departures" && item.cancelled !== true && item.departed !== true ? departureTimeChangeLabel(item, timeChanges, nowMs) : "";
              const platformChange = platformChangeFor(item, platformChanges, nowMs);
              const platformName = item.mode === "train" ? "Spoor" : "Perron";
              const afterMidnight = tab==="departures" && index>0 && isNextServiceDay(listRows[index-1],item);
              return (
                <View>
                  {afterMidnight ? <View style={[styles.midnightRow,{borderBottomColor:colors.border,backgroundColor:colors.surfaceAlt}]}><Text style={[styles.midnightText,{color:colors.text}]}>Na middernacht</Text></View> : null}
                  {/* While refreshing fails the countdown is an estimate from the last known time. */}
                  <DepartureLine item={item} nowMs={nowMs} stale={Boolean(refreshFailure)} note={changedFrom}
                    onPress={item.ritId ? () => openTrip(item) : undefined} />
                  {platformChange ? (
                    <View style={[styles.platformNotice, {
                      backgroundColor: nowMs - platformChange.changedAt < 120000 ? colors.warningSoft : colors.surfaceAlt,
                      borderBottomColor: colors.border
                    }]}>
                      <Ionicons name="swap-horizontal-outline" size={15} color={colors.accentText} />
                      <Text style={[styles.platformNoticeText, { color: colors.text }]}
                        accessibilityLabel={platformName + " gewijzigd naar " + platformChange.current +
                          (platformChange.previous ? ", was " + platformChange.previous : "")}>
                        {platformName} gewijzigd: {platformChange.current}
                        {platformChange.previous ? " (was " + platformChange.previous + ")" : ""}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.textSoft }}>
                        {nowMs - platformChange.changedAt < 60000 ? "Zojuist" :
                          Math.floor((nowMs - platformChange.changedAt) / 60000) + " min geleden"}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            }}
          />
        </>
      )}
      {/* Search sits at the bottom, within reach; it opens the search on Start. */}
      <Pressable onPress={requestSearch} accessibilityRole="search" accessibilityLabel="Zoek halte, lijn of plaats"
        style={[styles.searchBar, { backgroundColor: colors.surfaceSoft, borderColor: colors.border }]}>
        <Ionicons name="search" size={19} color={colors.textSoft} />
        <Text maxFontSizeMultiplier={1.2} style={[styles.searchText, { color: colors.textSoft }]} numberOfLines={1}>Zoek halte, lijn of plaats</Text>
      </Pressable>
      {/* Last child: the menu lies above the list. */}
      <OverflowMenu open={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} title="Meer opties voor deze halte" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { paddingHorizontal: 6, paddingBottom: 13 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  back: { width: 40, height: 44, justifyContent: "center", alignItems: "center" },
  title: { flex: 1, minWidth: 0, fontSize: 21, lineHeight: 26, fontWeight: "800", letterSpacing: -0.3, marginLeft: 2 },
  segments: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#D5DDD7", marginTop: 13 },
  segment: { flex: 1, minHeight: 42, borderBottomWidth: 2, alignItems: "center", justifyContent: "center" },
  segmentText: { fontSize: 14, fontWeight: "700" },
  // In the flow under the list, not floating over it: it never covers a departure.
  searchBar: { marginHorizontal: 15, marginTop: 8, marginBottom: 10, minHeight: 46, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18 },
  searchText: { flex: 1, fontSize: 15 },
  viewBar: { minHeight: 46, paddingHorizontal: 15, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  viewTitle: { fontSize: 15, fontWeight: "900" },
  viewBack: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 },
  viewBackText: { fontSize: 13, fontWeight: "800" },
  alertLine: { minHeight: 44, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 9 },
  alertLineText: { flex: 1, fontSize: 13, fontWeight: "700" },
  alertLineMore: { fontSize: 12, fontWeight: "800" },
  filterPanel: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 4 },
  filterInner: { paddingHorizontal: 13, paddingVertical: 7, alignItems: "center", gap: 8 },
  chip: { minHeight: 36, minWidth: 48, justifyContent: "center", alignItems: "center", borderRadius: 18, paddingHorizontal: 15 },
  chipText: { fontSize: 13.5, fontWeight: "800" },
  directionActiveRow: { paddingHorizontal: 13, paddingBottom: 6, flexDirection: "row" },
  directionActive: { minHeight: 34, maxWidth: "100%", borderRadius: 17, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  directionHead: { paddingHorizontal: 15, paddingTop: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  directionHeadText: { fontSize: 12, fontWeight: "800" },
  list: { paddingBottom: 16, flexGrow: 1 },
  midnightRow:{paddingHorizontal:15,paddingVertical:8,borderBottomWidth:1},
  midnightText:{fontSize:12,fontWeight:"800"},
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 13 },
  retry: { flexDirection: "row", gap: 6, alignItems: "center", padding: 8 },
  refreshWarning: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 13, borderBottomWidth: 1 },
  alerts: { padding: 14 },
  alertHeadline: { fontSize: 12.5, fontWeight: "800" },
  alertDescription: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  disruptionItem: { flexDirection: "row", gap: 10, borderBottomWidth: 1, paddingVertical: 14, alignItems: "flex-start" },
  dataFreshness: { minHeight: 35, borderBottomWidth: 1, paddingHorizontal: 12,
    paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  freshnessText: { fontSize: 11.5, fontWeight: "700", flexShrink: 1 },
  platformNotice: { flexDirection: "row", gap: 7, paddingVertical: 8, paddingHorizontal: 15,
    borderBottomWidth: 1, alignItems: "center", flexWrap: "wrap" },
  platformNoticeText: { fontSize: 11, fontWeight: "800", flexShrink: 1 },
  empty: { marginTop: 28, textAlign: "center", fontSize: 13 }
});
