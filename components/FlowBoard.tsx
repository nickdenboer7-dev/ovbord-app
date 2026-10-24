import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DepartureHeading } from "./DepartureLine";
import { StopBoardRow } from "./StopBoardRow";
import { BOARD_MODE_LABEL, STOP_BOARD_BLUE, stopBoardHeader, stopBoardModes } from "../lib/stopBoardDesign";
import { DepartureSkeleton } from "./DepartureSkeleton";
import { MenuButton, OverflowMenu } from "./OverflowMenu";
import type { MenuItem } from "./OverflowMenu";
import { FlowLineGroups } from "./FlowLineGroups";
import { useApp } from "../context/AppProvider";
import { useFlowNavigation } from "../context/FlowNavigation";
import { getHalte, getRit, getStopReliability, searchStops } from "../lib/api";
import { useSmartRefresh } from "../lib/useSmartRefresh";
import { useBoardFocusRefresh } from "../lib/useBoardFocusRefresh";
import { departureKey } from "../lib/flowRitQuality";
import { hasAvailableArrivals } from "../lib/arrivalAvailability";
import { isNextServiceDay } from "../lib/format";
import { boardDepartureIdentity, departureTimeChangeLabel, refreshDepartureTimeChanges, sortBoardDepartures } from "../lib/boardSmartness";
import { departureNoticeIdentity, confirmDepartedNotices, recentDepartureCandidates, visibleBoardDepartures, journeyConfirmsDeparture, DEPARTURE_CHECK_COOLDOWN_MS, MAX_DEPARTURE_CHECKS } from "../lib/departedNotice";
import type { DepartedNotices } from "../lib/departedNotice";
import { feedFreshness, platformChangeFor, refreshPlatformChanges, isActiveStopNotice, disruptionSummary } from "../lib/haltebordV4";
import { boardLineFilterKey, matchesBoardLineFilter } from "../lib/boardLineFilters";
import { boardDirectionChoices, matchesBoardDirection } from "../lib/boardDirectionFilters";
import { favoriteLineKey, pinnedDepartures } from "../lib/favoriteLines";
import { withBoardFreshness } from "../lib/realtimeConsistency";
import { boardRefreshNotice, failureKind } from "../lib/offline";
import { cachedBoard, rememberBoard } from "../lib/boardCache";
import { useWalkingPosition } from "../lib/useWalkingPosition";
import { walkingDepartureAdvice } from "../lib/leaveTime";
import { rememberLineOrigin } from "../lib/lineOrigins";
import { ritParamsForDeparture } from "../lib/ritRoute";
import type { FailureKind } from "../lib/offline";
import type { PlatformChanges } from "../lib/haltebordV4";
import type { DepartureTimeChanges } from "../lib/boardSmartness";
import type { DepartureItem, HalteBoardData, ReliabilityInfo, StopSummary, Mode } from "../types/api";

type BoardTab = "departures" | "arrivals" | "lines" | "disruptions";
type Props = {
  stop: StopSummary;
  initialBoard?: HalteBoardData;
  initialFetchedAt?: number;
  initialStale?: boolean;
  /** Line filter key to preselect, e.g. when opened from a favourite trip. */
  initialLine?: string;
  visible?: boolean;
  onBack: () => void;
};

/** Rows under "Jouw lijnen" on a board. */
export const MAX_PINNED_ROWS = 3;

/** The board is rendered inside the Start tab: no Stack route, drawer, or bottom sheet. */
export function FlowBoard({ stop, initialBoard, initialFetchedAt, initialStale=false, initialLine, onBack, visible = true }: Props) {
  const { colors, resolvedScheme, addRecentStop, toggleFavoriteStop, isFavoriteStop, favoriteLines, toggleFavoriteLine, manualCity } = useApp();
  const { requestSearch } = useFlowNavigation();
  const router = useRouter(); // OVBORD_FLOW4_DEDICATED_RIT
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [board, setBoard] = useState<HalteBoardData | null>(initialBoard || null);
  const [loading, setLoading] = useState(!initialBoard);
  const [fetchedAt, setFetchedAt] = useState<number | null>(initialBoard ? initialFetchedAt ?? Date.now() : null);
  const [cachePending,setCachePending]=useState(initialStale);
  const position=useWalkingPosition(visible && !manualCity);
  const [nowMs,setNowMs] = useState(Date.now());
  const previousBoard = useRef<HalteBoardData | null>(initialBoard || null);
  const [timeChanges, setTimeChanges] = useState<DepartureTimeChanges>({});
  const [platformChanges, setPlatformChanges] = useState<PlatformChanges>({});
  const [departedNotices, setDepartedNotices] = useState<DepartedNotices>({});
  const [recentDepartures, setRecentDepartures] = useState<DepartureItem[]>([]);
  const departedCheckedAt = useRef<Record<string, number>>({});
  const [gpsQuality, setGpsQuality] = useState<Record<string, ReliabilityInfo>>({});
  const gpsQualityCheckedAt = useRef(0);
  /** Initial load failed: nothing to show. */
  const [error, setError] = useState<string | null>(null);
  /** A refresh failed: the board shows earlier times that are no longer being checked. */
  const [refreshFailure, setRefreshFailure] = useState<FailureKind | null>(null);
  const [retryBoard, setRetryBoard] = useState(0);
  const [tab, setTab] = useState<BoardTab>("departures");
  const [selectedMode,setSelectedMode]=useState<Mode|null>(null);
  const headerInfo=stopBoardHeader(stop,board);
  const modes=stopBoardModes(stop,board);
  const [selectedLine, setSelectedLine] = useState<string | null>(initialLine || null);
  /** Destination filter (departures only), combined with the line filter. */
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticesExpanded, setNoticesExpanded] = useState(false);
  const boardRequest = useRef(0);
  const listRef = useRef<FlatList<DepartureItem>>(null);
  const reloadBoardRef = useRef<() => Promise<void>>(async () => {});
  const hasArrivals = hasAvailableArrivals(board);
  const freshness = feedFreshness(board || {}, fetchedAt, nowMs);
  const activeNotices = useMemo(() => (board?.disruptions || []).filter(notice =>
    isActiveStopNotice(notice, stop.id, nowMs)), [board, stop.id, nowMs]);
  // Timing expires at the existing age limit; failed requests suspend GPS/departure confirmation immediately.
  const timingCurrent = freshness.level === "fresh";
  const staleDisplay=Boolean(refreshFailure)||cachePending;
  const dataCurrent = timingCurrent && !staleDisplay;
  useEffect(() => { addRecentStop(stop); }, [stop.id]);
  useEffect(() => { setNoticesExpanded(false); }, [stop.id]);
  useEffect(() => {
    gpsQualityCheckedAt.current = 0;
    setGpsQuality({});
    previousBoard.current = initialBoard || null;
    setTimeChanges({});
    setPlatformChanges({});
    setDepartedNotices({});
    setRecentDepartures([]);
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
  useBoardFocusRefresh(() => reloadBoardRef.current(), stop.id, visible);

  useEffect(()=>{const t=setInterval(()=>setNowMs(Date.now()),15000);return()=>clearInterval(t);},[]);

  // The halt board has no departure-event field today. Verify only a few near-term
  // live journeys against recent GPS progress; never claim "Vertrokken" from time alone.
  useEffect(() => {
    if (!board || !visible || !dataCurrent) return;
    let active = true;
    const checkedNow = Date.now();
    const fromFeed = confirmDepartedNotices(departedNotices, board.departures, checkedNow);
    if (fromFeed !== departedNotices) { setDepartedNotices(fromFeed); setNowMs(checkedNow); return; }
    const candidates = recentDepartureCandidates(recentDepartures, board.departures, checkedNow).filter(item => {
      const key = departureNoticeIdentity(item);
      return departedNotices[key] === undefined &&
        (!departedCheckedAt.current[key] ||
          checkedNow - departedCheckedAt.current[key] >= DEPARTURE_CHECK_COOLDOWN_MS);
    }).slice(0, MAX_DEPARTURE_CHECKS);
    let completed = false;
    for (const item of candidates) departedCheckedAt.current[departureNoticeIdentity(item)] = checkedNow;
    // Apply the small batch together so the first confirmation does not cancel the second check.
    if (candidates.length) void Promise.all(candidates.map(async (item): Promise<DepartureItem | null> => {
      try {
        const rit = await getRit(item.ritId!);
        return journeyConfirmsDeparture(rit, board.stop) ? { ...item, departed: true } : null;
      } catch { return null; } // Missing confirmation leaves the ordinary departure display intact.
    })).then(results => {
      completed = true;
      if (active) {
        const confirmedAt = Date.now();
        setDepartedNotices(previous => confirmDepartedNotices(previous,
          results.filter((item): item is DepartureItem => item !== null), confirmedAt));
        setNowMs(confirmedAt);
      }
    });
    return () => {
      active = false;
      if (!completed) for (const item of candidates) {
        const key = departureNoticeIdentity(item);
        if (departedCheckedAt.current[key] === checkedNow) delete departedCheckedAt.current[key];
      }
    };
  }, [board, visible, stop.id, nowMs, departedNotices, recentDepartures, dataCurrent]);

  const visibleDepartures = useMemo(() => staleDisplay ? (board?.departures || []).filter(d=>!d.departed) : visibleBoardDepartures(board?.departures || [], departedNotices, nowMs),
    [board, departedNotices, nowMs,staleDisplay]);

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
          if (failureKind(firstError) === "offline" || stop.variants?.length) throw firstError;
          // Trip feeds occasionally provide a journey-local stop ID instead of a public stop ID.
          // Fall back to the official stop search, and keep the UI in the same tab.
          const matches = await searchStops(stop.name);
          const normalize = (value: string) => value.toLocaleLowerCase("nl").trim();
          const found = matches.find((match) => normalize(match.name) === normalize(stop.name));
          if (!found) throw firstError;
          result = await getHalte(found.id);
        }
        if (!active || seq !== boardRequest.current) return;
        result={...result,stop:{...result.stop,variants:stop.variants||result.stop.variants,
          lat:stop.lat??result.stop.lat,lon:stop.lon??result.stop.lon}};
        const receivedAt = Date.now();
        rememberBoard(result,receivedAt);
        const before = previousBoard.current;
        const previousRows = before && before.stop.id === result.stop.id ? before.departures : null;
        setRecentDepartures(previous => recentDepartureCandidates([...previous, ...(previousRows || [])], result.departures, receivedAt));
        setTimeChanges((existing) => refreshDepartureTimeChanges(previousRows, result.departures, existing, receivedAt));
        setPlatformChanges((existing) => refreshPlatformChanges(previousRows, result.departures, existing, receivedAt));
        previousBoard.current = result;
        setBoard(result);
        setFetchedAt(receivedAt);
        setError(null);
        setRefreshFailure(null);
        setCachePending(false);
        if (initial) addRecentStop(result.stop);
      } catch (caught) {
        if (!active) return;
        const kind = failureKind(caught);
        if (initial && !previousBoard.current) setError(kind === "offline" ? "Je bent offline. Vertrektijden van deze halte zijn nog niet geladen." : "Vertrektijden niet beschikbaar.");
        else setRefreshFailure(kind);
      } finally {
        pending = false;
        if (active && initial) setLoading(false);
      }
    };
    reloadBoardRef.current = () => load(false);
    void(async()=>{
      const entry=await cachedBoard(stop.id);
      if(!active||seq!==boardRequest.current)return;
      if(!previousBoard.current&&entry){previousBoard.current=entry.board;setBoard(entry.board);setFetchedAt(entry.fetchedAt);setCachePending(true);setLoading(false);}
      await load(!initialBoard&&!entry);
    })();
    return () => { active = false; reloadBoardRef.current = async () => {}; };
  }, [stop.id, retryBoard]);


  const source = useMemo(() => {
    if (!board) return [];
    // V5.8: departures are shown in ascending order of their real expected departure time
    // (effectiveAt, otherwise the existing clock/delay estimate), never the raw feed order.
    const entries = tab === "arrivals" ? board.arrivals
      : tab === "departures" ? sortBoardDepartures(visibleDepartures, nowMs) : [];
    return entries.map((rawItem) => {
      const item = withBoardFreshness(rawItem, timingCurrent);
      const quality = dataCurrent ? gpsQuality[item.ritId || ""] : undefined;
      return quality ? { ...item, reliabilityDetail: quality,
        reliability: quality.level === "very" ? "high" as const :
          quality.level === "good" || quality.level === "reasonable" ? "medium" as const : "low" as const
      } : item;
    });
  }, [board, tab, gpsQuality, visibleDepartures, dataCurrent, timingCurrent, nowMs]);

  /** Favourite lines (a star in the Lijnen tab) are shown in "Jouw lijnen". */
  const favoriteKeySet = useMemo(() => new Set(favoriteLines), [favoriteLines]);
  const lineEntries = useMemo(
    () => source.filter((item) => (!selectedMode||(item.mode||stop.mode)===selectedMode)&&matchesBoardLineFilter(item, selectedLine)),
    [source, selectedLine, selectedMode]
  );
  const directions = useMemo(() => tab === "departures" ? boardDirectionChoices(lineEntries) : [], [tab, lineEntries]);
  const entries = useMemo(
    () => tab === "departures" ? lineEntries.filter((item) => matchesBoardDirection(item, selectedDirection)) : lineEntries,
    [tab, lineEntries, selectedDirection]
  );
  // "Jouw lijnen": up to three rows above "Alle vertrekken"; those rows are not repeated below.
  const pinned = useMemo(() => tab === "departures" && !selectedLine && selectedDirection === null
    ? pinnedDepartures(source.filter(item=>!selectedMode||(item.mode||stop.mode)===selectedMode), favoriteLines, nowMs, MAX_PINNED_ROWS) : [], [tab, selectedLine, selectedDirection, selectedMode, source, favoriteLines, nowMs]);
  const listRows = useMemo(() => {
    if (!pinned.length) return entries;
    const shown = new Set(pinned.map((item) => boardDepartureIdentity(item)));
    return entries.filter((item) => !shown.has(boardDepartureIdentity(item)));
  }, [entries, pinned]);
  const selectedDirectionLabel = selectedDirection === null ? ""
    : directions.find((choice) => choice.key === selectedDirection)?.label ||
      source.find((item) => matchesBoardDirection(item, selectedDirection))?.destination || "";

  const selectTab = (next: BoardTab) => { setTab(next); setSelectedLine(null); setSelectedDirection(null); setDirectionsOpen(false); };
  const selectMode=(mode:Mode|null)=>{selectTab("departures");setSelectedMode(mode);listRef.current?.scrollToOffset({offset:0,animated:false});};
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

  const viewTitle = tab === "disruptions" ? "Storingen" : tab === "arrivals" ? "Aankomsten" : "";
  const selectedLineLabel = selectedLine ? source.find((row) => matchesBoardLineFilter(row, selectedLine))?.line || selectedLine : "";
  const disruptionCount = activeNotices.length;
  // Options that do not need to be on screen all the time.
  const menuItems: MenuItem[] = [];
  if(hasArrivals)menuItems.push({key:"arrivals",label:tab==="arrivals"?"Vertrekken":"Aankomsten",icon:"swap-vertical-outline",onPress:()=>selectTab(tab==="arrivals"?"departures":"arrivals")});
  if (tab === "departures" && selectedDirection === null && directions.length > 1) {
    menuItems.push({ key: "direction", label: "Filter op richting", icon: "navigate-outline", onPress: () => setDirectionsOpen(true) });
  }
  if (selectedDirection !== null) menuItems.push({ key: "direction-clear", label: "Richtingfilter wissen", icon: "close-circle-outline", onPress: () => selectDirection(null) });
  if (selectedLine) menuItems.push({ key: "line-clear", label: "Lijnfilter wissen", icon: "close-circle-outline", onPress: () => selectLine(null) });
  if (disruptionCount && tab !== "disruptions") menuItems.push({ key: "disruptions", label: "Storingen (" + disruptionCount + ")", icon: "warning-outline", onPress: () => selectTab("disruptions") });
  menuItems.push({ key: "feedback", label: "Klopt dit niet?", icon: "chatbubble-outline", group: 2, onPress: () => {
    const current = board?.stop || stop;
    router.push({ pathname: "/feedback", params: { stop_id: current.id, stop_name: current.name, reported_at: new Date().toISOString() } });
  } });
  menuItems.push({ key: "refresh", label: "Vertrektijden verversen", icon: "refresh", group: 2, onPress: () => { void pullToRefresh(); } });
  const pinnedHeader = pinned.length ? (
    <View>
      <DepartureHeading title="Jouw lijnen" star />
      {pinned.map((item, index) => (
        <StopBoardRow key={"pin:" + departureKey(item, index)} item={item} nowMs={nowMs} stale={staleDisplay}
          detail={!staleDisplay ? walkingDepartureAdvice(item,position,board?.stop||stop,nowMs) || undefined : undefined}
          onPress={() => openTrip(item)} last={index === pinned.length - 1} />
      ))}
      <DepartureHeading title="Alle vertrekken" />
    </View>
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {visible ? <ExpoStatusBar style="light"/> : null}
      <View style={[styles.head,{paddingTop:Math.max(insets.top,24)+6,backgroundColor:STOP_BOARD_BLUE}]}>
        <View style={styles.headRow}>
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Terug" style={styles.back}><Ionicons name="arrow-back" size={23} color="#fff"/></Pressable>
          <Text maxFontSizeMultiplier={1.3} style={styles.title} numberOfLines={1} ellipsizeMode="tail" accessibilityRole="header" accessibilityLabel={stop.name}>{headerInfo.title}</Text>
          <Pressable onPress={requestSearch} accessibilityRole="button" accessibilityLabel="Zoek halte, lijn of plaats" hitSlop={6} style={styles.back}><Ionicons name="search-outline" size={22} color="#fff"/></Pressable>
          <Pressable onPress={()=>toggleFavoriteStop(board?.stop||stop)} accessibilityRole="button"
            accessibilityLabel={isFavoriteStop(board?.stop.id||stop.id)?"Verwijder favoriete halte":"Bewaar als favoriete halte"}
            accessibilityState={{selected:isFavoriteStop(board?.stop.id||stop.id)}} style={styles.back}>
            <Ionicons name={isFavoriteStop(board?.stop.id||stop.id)?"star":"star-outline"} size={23} color="#fff"/>
          </Pressable>
          <MenuButton onPress={()=>setMenuOpen(true)} color="#fff" label="Meer opties voor deze halte"/>
        </View>
        <View style={styles.subtitleRow}>
          <View accessibilityLabel={dataCurrent?"Actueel":"Gegevens niet actueel"} style={[styles.statusDot,{backgroundColor:dataCurrent?"#66e69c":staleDisplay?"#b8c5d2":"#ffd175"}]}/>
          <Text style={styles.subtitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {[headerInfo.city,headerInfo.count+" "+(headerInfo.count===1?"lijn":"lijnen"),fetchedAt?"bijgewerkt "+new Intl.DateTimeFormat("nl-NL",{hour:"2-digit",minute:"2-digit",timeZone:"Europe/Amsterdam"}).format(fetchedAt):"bijwerken…"].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.modeFilterBar,{backgroundColor:colors.surface,borderBottomColor:colors.border}]} contentContainerStyle={styles.modeFilters}>
        {[{key:"all",label:"Alle",mode:null},...modes.map(mode=>({key:mode,label:BOARD_MODE_LABEL[mode],mode})),{key:"lines",label:"Lijnen",mode:null}].map(option=>{
          const active=option.key==="lines"?tab==="lines":tab!=="lines"&&(option.key==="all"?!selectedMode:selectedMode===option.mode);
          return <Pressable key={option.key} accessibilityRole="button" accessibilityState={{selected:active}} accessibilityLabel={option.key==="lines"?"Lijnen op deze halte":option.key==="all"?"Alle vertrekken":option.label+" filter"}
            onPress={()=>option.key==="lines"?selectTab("lines"):selectMode(option.mode)}
            style={[styles.modeFilter,{backgroundColor:active?STOP_BOARD_BLUE:colors.surface,borderColor:active?STOP_BOARD_BLUE:colors.border}]}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.modeFilterText,{color:active?"#fff":colors.text}]}>{option.label}</Text>
          </Pressable>;
        })}
      </ScrollView>

      {viewTitle ? (
        <View style={[styles.viewBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.viewTitle, { color: colors.text }]} accessibilityRole="header">{viewTitle}</Text>
          <Pressable onPress={() => selectTab("departures")} accessibilityRole="button" accessibilityLabel="Terug naar vertrekken" hitSlop={6} style={styles.viewBack}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.viewBackText, { color: colors.accentText }]}>Vertrekken</Text>
            <Ionicons name="close" size={17} color={colors.accentText} />
          </Pressable>
        </View>
      ) : null}
      {board && tab !== "disruptions" && disruptionCount > 0 ? (
        <View style={{ backgroundColor: activeNotices.some((n) => n.severity === "warning") ? colors.warningSoft : colors.surfaceSoft }}>
          <Pressable onPress={() => setNoticesExpanded(v => !v)} accessibilityRole="button"
            accessibilityState={{ expanded: noticesExpanded }}
            accessibilityLabel={disruptionSummary("", activeNotices).title + (noticesExpanded ? ", inklappen" : ", tik voor meer")}
            style={styles.alertLine}>
            <Ionicons name={activeNotices.some((n) => n.severity === "warning") ? "warning-outline" : "information-circle-outline"}
              size={17} color={activeNotices.some((n) => n.severity === "warning") ? colors.danger : colors.accentText} />
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.alertLineText, { color: colors.text }]}>
              {disruptionSummary("", activeNotices).title}{noticesExpanded ? "" : " · tik voor meer"}
            </Text>
            <Ionicons name={noticesExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
          </Pressable>
          {noticesExpanded ? activeNotices.map((notice,index) =>
            <View key={index} style={[styles.disruptionItem, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.alertHeadline, { color: colors.text }]}>{notice.title}</Text>
                {notice.description ? <Text maxFontSizeMultiplier={1.3} style={[styles.alertDescription, { color: colors.textSoft }]}>{notice.description}</Text> : null}
              </View>
            </View>) : null}
        </View>
      ) : null}
      {board && freshness.level !== "fresh" ? (
        <View style={[styles.dataFreshness, { borderBottomColor: colors.border,
          backgroundColor: freshness.level === "aging" ? colors.warningSoft :
            freshness.level === "stale" ? (resolvedScheme === "dark" ? colors.warningSoft : "#FFF0ED") : colors.surfaceAlt }]}>
          <Ionicons name={freshness.level === "aging" ? "alert-circle-outline" :
            freshness.level === "stale" ? "cloud-offline-outline" : "help-circle-outline"}
            size={16} color={freshness.level === "aging" ? (resolvedScheme === "dark" ? colors.warning : "#B76B00") :
              freshness.level === "stale" ? colors.danger : colors.textSoft} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.freshnessText, { color: colors.text }]}>{freshness.label}</Text>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 10, color: colors.textSoft }}>
            {freshness.level === "stale" ? "Ververs om te controleren" : "Laatste bekende gegevens"}
          </Text>
        </View>
      ) : null}
      {board && refreshFailure ? <View style={[styles.refreshWarning, { backgroundColor: colors.warningSoft, borderBottomColor: colors.border }]}><Ionicons name="cloud-offline-outline" size={16} color={colors.text} /><Text maxFontSizeMultiplier={1.3} style={{ color: colors.text, flex: 1, fontSize: 12 }}>{boardRefreshNotice(refreshFailure, fetchedAt)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Vertrektijden opnieuw laden" onPress={() => setRetryBoard((n) => n + 1)}><Ionicons name="refresh" size={19} color={colors.accentText} /></Pressable></View> : null}
      {loading && !board ? (
        <DepartureSkeleton rowHeight={52} />
      ) : error && !board ? (
        <View style={styles.center}>
          <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSoft }}>{error}</Text>
          <Pressable onPress={() => setRetryBoard((value) => value + 1)} accessibilityRole="button" accessibilityLabel="Vertrektijden opnieuw laden" style={styles.retry}>
            <Ionicons name="refresh" size={17} color={colors.accentText} />
            <Text maxFontSizeMultiplier={1.3} style={{ color: colors.accentText }}>Probeer opnieuw</Text>
          </Pressable>
          <Pressable onPress={onBack} accessibilityRole="button" style={styles.retry}><Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSoft }}>Terug naar vorige halte</Text></Pressable>
        </View>
      ) : tab === "disruptions" ? (
        <View style={styles.alerts}>
          {activeNotices.length ? activeNotices.map((notice, index) => (
            <View key={index} style={[styles.disruptionItem, { borderBottomColor: colors.border }]}>
              <Ionicons name={notice.severity === "warning" ? "warning-outline" : "information-circle-outline"}
                color={notice.severity === "warning" ? colors.danger : colors.accentText} size={18} />
              <View style={{ flex: 1 }}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.alertHeadline, { color: colors.text }]}>{notice.title}</Text>
                {notice.description ? <Text maxFontSizeMultiplier={1.3} style={[styles.alertDescription, { color: colors.textSoft }]}>
                  {notice.description}</Text> : null}
              </View>
            </View>
          )) : <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSoft }}>
            {board?.disruptionsAvailable ? "Geen storingen gemeld." :
              "Storingsinformatie wordt nog niet door deze halte-API geleverd."}
          </Text>}
        </View>
      ) : tab === "lines" ? (
        <FlowLineGroups
          departures={sortBoardDepartures(visibleDepartures.filter(row=>!selectedMode||(row.mode||stop.mode)===selectedMode), nowMs).map(row => withBoardFreshness(row, timingCurrent))}
          onSelectLine={(line) => { setTab("departures"); setSelectedDirection(null); selectLine(line); }}
          onOpenDeparture={openTrip}
          favoriteKeys={favoriteKeySet}
          onToggleFavorite={(line, carrier) => {const key=favoriteLineKey(line,carrier);rememberLineOrigin(key,board?.stop||stop);toggleFavoriteLine(key);}}
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
                    <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>Lijn {selectedLineLabel}</Text>
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
                    <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>Richting {selectedDirectionLabel}</Text>
                    <Ionicons name="close" size={15} color={colors.textSoft} />
                  </Pressable>
                </View>
              ) : null}
              {directionsOpen && tab === "departures" && selectedDirection === null ? (
                <View>
                  <View style={styles.directionHead}>
                    <Text maxFontSizeMultiplier={1.3} style={[styles.directionHeadText, { color: colors.textSoft }]}>Kies een richting</Text>
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
                        <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>{choice.label}</Text>
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
                <Text maxFontSizeMultiplier={1.3} style={[styles.empty, { color: colors.textSoft }]}>Geen {tab === "arrivals" ? "aankomsten" : "vertrekken"}
                  {selectedLine ? " van lijn " + selectedLine : ""}{selectedDirection !== null ? " richting " + selectedDirectionLabel : ""}.</Text>
                <Pressable accessibilityRole="button" onPress={clearFilters} style={styles.retry}>
                  <Text maxFontSizeMultiplier={1.3} style={{ color: colors.accentText, fontWeight: "800" }}>{selectedDirection !== null ? "Toon alle vertrekken" : "Toon alle lijnen"}</Text>
                </Pressable>
              </View>
            ) : pinned.length ? null : <Text maxFontSizeMultiplier={1.3} style={[styles.empty, { color: colors.textSoft }]}>{tab === "arrivals" ? "Geen aankomsten beschikbaar." : "Geen vertrektijden beschikbaar."}</Text>}
            renderItem={({ item, index }) => {
              const changedFrom = tab === "departures" && item.cancelled !== true && item.departed !== true ? departureTimeChangeLabel(item, timeChanges, nowMs) : "";
              const platformChange = platformChangeFor(item, platformChanges, nowMs);
              const platformName = item.mode === "train" ? "Spoor" : "Perron";
              const afterMidnight = tab==="departures" && index>0 && isNextServiceDay(listRows[index-1],item);
              return (
                <View>
                  {afterMidnight ? <View style={[styles.midnightRow,{borderBottomColor:colors.border,backgroundColor:colors.surfaceAlt}]}><Text maxFontSizeMultiplier={1.3} style={[styles.midnightText,{color:colors.text}]}>Na middernacht</Text></View> : null}
                  {/* Failed refreshes show last-known times rather than a live countdown. */}
                  <StopBoardRow item={item} nowMs={nowMs} stale={staleDisplay} note={changedFrom}
                    detail={!staleDisplay && tab==="departures" ? walkingDepartureAdvice(item,position,board?.stop||stop,nowMs) || undefined : undefined}
                    onPress={item.ritId ? () => openTrip(item) : undefined} />
                  {platformChange ? (
                    <View style={[styles.platformNotice, {
                      backgroundColor: nowMs - platformChange.changedAt < 120000 ? colors.warningSoft : colors.surfaceAlt,
                      borderBottomColor: colors.border
                    }]}>
                      <Ionicons name="swap-horizontal-outline" size={15} color={colors.accentText} />
                      <Text maxFontSizeMultiplier={1.3} style={[styles.platformNoticeText, { color: colors.text }]}
                        accessibilityLabel={platformName + " gewijzigd naar " + platformChange.current +
                          (platformChange.previous ? ", was " + platformChange.previous : "")}>
                        {platformName} gewijzigd: {platformChange.current}
                        {platformChange.previous ? " (was " + platformChange.previous + ")" : ""}
                      </Text>
                      <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 10, color: colors.textSoft }}>
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
      {/* Last child: the menu lies above the list. */}
      <OverflowMenu open={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} title="Meer opties voor deze halte" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { flexShrink:0,paddingHorizontal:6,paddingBottom:12 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  back: { width: 36, height: 40, justifyContent: "center", alignItems: "center" },
  title:{flex:1,minWidth:0,fontSize:19,lineHeight:25,fontWeight:"700",color:"#fff"},
  subtitleRow:{flexDirection:"row",alignItems:"center",gap:6,paddingLeft:42,paddingRight:6,marginTop:1},
  statusDot:{width:6,height:6,borderRadius:3,flexShrink:0},subtitle:{fontSize:11,lineHeight:16,color:"#e1edfa",flexShrink:1},
  modeFilterBar:{flexGrow:0,flexShrink:0,borderBottomWidth:StyleSheet.hairlineWidth},modeFilters:{paddingHorizontal:12,paddingVertical:9,gap:7,alignItems:"center"},
  modeFilter:{minHeight:32,borderRadius:17,borderWidth:StyleSheet.hairlineWidth,paddingHorizontal:15,alignItems:"center",justifyContent:"center"},modeFilterText:{fontSize:13,fontWeight:"600"},
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
  alertLineMore: { fontSize: 12, fontWeight: "800", maxWidth: 100 },
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
