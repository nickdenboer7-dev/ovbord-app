import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getVervoerderStyle } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { getHalte, getRit } from "../../lib/api";
import { DepartureItem, HalteBoardData, Mode, RitData } from "../../types/api";

type Tab = "departures" | "arrivals" | "disruptions";

type Row = {
  id: string;
  line: string;
  carrier?: string;
  direction: string;
  planned: string;
  actual: string;
  delay: number;
  live: boolean;
  estimated: boolean;
  countdown: number | null;
  ritId?: string;
};

type Disruption = {
  id: string;
  title: string;
  description: string;
  lines: string[];
};

type LineChoice = { line: string; carrier?: string };
const DARK = "#143F2A";
const GREEN = "#147A4A";
const RED = "#B42318";
const MUTED = "#68766F";
const BG = "#FFFFFF";
const FONT500 = "Manrope_500Medium";
const FONT600 = "Manrope_600SemiBold";
const FONT700 = "Manrope_700Bold";
const FONT800 = "Manrope_800ExtraBold";

const modeNames: Record<Mode, string> = {
  bus: "Bushalte",
  tram: "Tramhalte",
  metro: "Metrostation",
  train: "Treinstation",
  ferry: "Veerhalte",
};

function clockMinutes(value: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function clockWithDelay(planned: string, delay: number) {
  const minutes = clockMinutes(planned);
  if (minutes === null) return planned;
  const total = ((minutes + delay) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function timeFromIso(value: unknown, fallback = "") {
  if (typeof value !== "string" || !value) return fallback;
  const iso = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  if (iso) return iso[2];
  const clock = /^(\d{1,2}:\d{2})/.exec(value);
  return clock ? clock[1].padStart(5, "0") : fallback;
}

function countdownFromRelative(value: string): number | null {
  const text = (value || "").trim().toLowerCase();
  if (text === "nu" || text === "0 min") return 0;
  const m = /(?:over\s+)?(\d+)\s*min/.exec(text);
  return m ? Number(m[1]) : null;
}

function liveRow(item: DepartureItem, idx: number): Row {
  const delay = Number.isFinite(item.delayMinutes) ? Math.max(0, item.delayMinutes || 0) : 0;
  return {
    id: `${item.id}:${idx}`,
    line: item.line,
    carrier: item.carrier,
    direction: item.destination,
    planned: item.plannedTime,
    actual: delay > 0 ? clockWithDelay(item.plannedTime, delay) : item.plannedTime,
    delay,
    live: item.isLive === true,
    estimated: item.isLive !== true && item.reliability !== "planned" && item.reliability !== "high",
    countdown: countdownFromRelative(item.relativeText),
    ritId: item.ritId,
  };
}

function arrivalRow(item: any, idx: number): Row {
  const planned = timeFromIso(
    item?.planned_time || item?.planned_arrival || item?.arrival_time || item?.time,
    "--:--"
  );
  const seconds = Number(item?.delay ?? item?.delay_seconds ?? 0);
  const delay = Number.isFinite(seconds) && seconds > 0 && seconds <= 7200
    ? Math.round(seconds / 60)
    : 0;
  const actual = timeFromIso(item?.effective_time, clockWithDelay(planned, delay));
  const timestamp = typeof item?.effective_time === "string"
    ? Date.parse(item.effective_time)
    : NaN;
  const left = Number.isFinite(timestamp)
    ? Math.max(0, Math.ceil((timestamp - Date.now()) / 60000))
    : null;
  return {
    id: String(item?.gtfs_trip_id || item?.trip_id || item?.journey_id || `arr-${idx}`) + ":" + idx,
    line: String(item?.line || item?.line_number || "?"),
    carrier: String(item?.carrier || item?.operator || ""),
    direction: `van ${String(item?.origin || item?.from || item?.origin_name || "Herkomst onbekend")}`,
    planned,
    actual: delay > 0 ? actual : planned,
    delay,
    live: item?.live === true,
    estimated: item?.live !== true && (item?.estimated_position === true || item?.realtime === true),
    countdown: left,
    ritId: String(item?.journey_id || item?.gtfs_trip_id || item?.trip_id || "") || undefined,
  };
}

function lineNorm(line: string) { return String(line || "").trim().toUpperCase(); }

function incidentRow(raw: any, idx: number): Disruption {
  const lines = Array.isArray(raw?.lines)
    ? raw.lines.map((line: unknown) => String(line))
    : raw?.line ? [String(raw.line)] : [];
  return {
    id: String(raw?.id || `incident-${idx}`),
    title: String(raw?.title || raw?.badge || "Reisinformatie"),
    description: String(raw?.description || raw?.message || ""),
    lines: Array.from(new Set(lines.filter(Boolean))),
  };
}

async function loadExtra(id: string) {
  const base = `https://ovbord.nl`;
  const target = encodeURIComponent(id);
  const load = async (path: string) => {
    const response = await fetch(`${base}${path}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`OVbord API ${response.status}`);
    return response.json();
  };
  const [arrivals, incidents] = await Promise.allSettled([
    load(`/api/aankomsten/${target}`),
    load(`/api/storingen/${target}`),
  ]);
  return {
    arrivals: arrivals.status === "fulfilled" && Array.isArray(arrivals.value?.arrivals)
      ? arrivals.value.arrivals.map(arrivalRow)
      : [] as Row[],
    disruptions: incidents.status === "fulfilled" && Array.isArray(incidents.value?.items)
      ? incidents.value.items.map(incidentRow)
      : [] as Disruption[],
  };
}

function selectionKey(id: string) {
  return `ovbord.halte.lines.v1:${id}`;
}

function getStatus(row: Row) {
  if (row.live) return { text: row.delay >= 1 ? `Live · +${row.delay} min` : "Live", color: GREEN };
  if (row.estimated) return { text: row.delay >= 1 ? `Geschat · +${row.delay} min` : "Geschat", color: "#C18D1A" };
  return { text: "Dienstregeling", color: "#8A928E" };
}

export default function HalteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toggleFavoriteStop, isFavoriteStop, addRecentStop } = useApp();
  const recentRef = useRef(addRecentStop);
  recentRef.current = addRecentStop;
  const [fontsLoaded] = useFonts({
    Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
  });
  const [data, setData] = useState<HalteBoardData | null>(null);
  const [arrivals, setArrivals] = useState<Row[]>([]);
  const [disruptions, setDisruptions] = useState<Disruption[]>([]);
  const [tab, setTab] = useState<Tab>("departures");
  const [selectedLines, setSelectedLines] = useState<string[]>([]);
  const [readyForId, setReadyForId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [journey, setJourney] = useState<RitData | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState(false);
  const [allJourneyStops, setAllJourneyStops] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setSelectedLines([]);
    setExpandedId(null);
    setExpandedTripId(null);
    setJourney(null);
    setReadyForId(null);
    AsyncStorage.getItem(selectionKey(id))
      .then((value) => {
        if (!active) return;
        if (value) {
          const parsed: unknown = JSON.parse(value);
          setSelectedLines(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : []);
        }
      })
      .catch(() => { if (active) setSelectedLines([]); })
      .finally(() => { if (active) setReadyForId(id); });
    return () => { active = false; };
  }, [id]);

  const reload = useCallback(async (initial = false, pull = false) => {
    if (!id) return;
    if (initial) setLoading(true);
    if (pull) setRefreshing(true);
    try {
      const [board, extra] = await Promise.all([getHalte(id), loadExtra(id)]);
      setData(board);
      setArrivals(extra.arrivals);
      setDisruptions(extra.disruptions);
      setError(null);
      if (initial) recentRef.current(board.stop);
    } catch (e) {
      setError("Kon haltegegevens niet ophalen. Trek omlaag om opnieuw te proberen.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void reload(true);
    const timer = setInterval(() => { void reload(); }, 30000);
    return () => clearInterval(timer);
  }, [id, reload]);

  const departures = useMemo(() => (data?.departures || []).map(liveRow), [data?.departures]);
  const lineChoices = useMemo<LineChoice[]>(() => {
    const map = new Map<string, LineChoice>();
    for (const row of [...departures, ...arrivals]) {
      const normalized = lineNorm(row.line);
      if (normalized && !map.has(normalized)) map.set(normalized, { line: row.line, carrier: row.carrier });
    }
    for (const line of data?.stop.lines || []) {
      const normalized = lineNorm(line.line);
      if (normalized && !map.has(normalized)) map.set(normalized, line);
    }
    return Array.from(map.values()).sort((a, b) => a.line.localeCompare(b.line, "nl", { numeric: true }));
  }, [departures, arrivals, data?.stop.lines]);

  const toggleLine = (line?: string) => {
    if (!id || readyForId !== id) return;
    const norm = line ? lineNorm(line) : "";
    let next: string[];
    if (!norm) next = [];
    else if (selectedLines.length === 0) next = [norm];
    else if (selectedLines.includes(norm)) next = selectedLines.filter((x) => x !== norm);
    else next = [...selectedLines, norm];
    setExpandedId(null);
    setExpandedTripId(null);
    setSelectedLines(next);
    void AsyncStorage.setItem(selectionKey(id), JSON.stringify(next)).catch(() => {});
  };

  const rows = useMemo(() => {
    const source = tab === "arrivals" ? arrivals : departures;
    return selectedLines.length === 0
      ? source
      : source.filter((row) => selectedLines.includes(lineNorm(row.line)));
  }, [tab, arrivals, departures, selectedLines]);

  const scopedDisruptions = useMemo(() => selectedLines.length === 0
    ? disruptions
    : disruptions.filter((d) => d.lines.length === 0 || d.lines.some((line) => selectedLines.includes(lineNorm(line)))),
    [disruptions, selectedLines]);

  useEffect(() => {
    if (!expandedTripId) {
      setJourney(null);
      setJourneyLoading(false);
      setJourneyError(false);
      return;
    }
    let active = true;
    setJourneyLoading(true);
    setJourneyError(false);
    setJourney(null);
    getRit(expandedTripId)
      .then((result) => { if (active) setJourney(result); })
      .catch(() => { if (active) setJourneyError(true); })
      .finally(() => { if (active) setJourneyLoading(false); });
    return () => { active = false; };
  }, [expandedTripId]);

  const expandRow = (row: Row) => {
    if (!row.ritId) return;
    if (expandedId === row.id) {
      setExpandedId(null);
      setExpandedTripId(null);
    } else {
      setExpandedId(row.id);
      setExpandedTripId(row.ritId);
    }
    setAllJourneyStops(false);
  };

  if (!fontsLoaded || (loading && !data)) {
    return (
      <View style={styles.overlay}>
        <Pressable style={styles.scrim} onPress={() => router.back()} />
        <View style={styles.root}>
          <View style={styles.center}><ActivityIndicator color={GREEN}/></View>
        </View>
      </View>
    );
  }

  const stop = data?.stop;
  const stopName = stop?.name || id || "Halte";
  const city = stop?.city || stopName.split(",")[0];
  const subtitle = `${modeNames[stop?.mode || "bus"]} · ${city}`;
  const favorite = stop ? isFavoriteStop(stop.id) : false;

  const renderRow = ({ item }: { item: Row }) => {
    const delayed = item.delay >= 1;
    const status = getStatus(item);
    const carrierStyle = getVervoerderStyle(item.carrier, item.line);
    const expanded = expandedId === item.id;
    const countdown = item.countdown !== null && item.countdown >= 0 && item.countdown < 60
      ? item.countdown === 0 ? "nu" : `${item.countdown} min`
      : "";

    const journeyStops = journey?.stops || [];
    const stopNameNorm = String(stop?.name || "").toLowerCase().trim();
    const stopIdx = journeyStops.findIndex((s) =>
      (s.id && stop?.id && s.id === stop.id) ||
      (stopNameNorm && s.name.toLowerCase().trim() === stopNameNorm)
    );
    const currentIdx = journeyStops.findIndex((s) => s.state === "current");
    const focus = currentIdx >= 0 ? currentIdx : stopIdx >= 0 ? stopIdx : 0;
    const from = Math.max(0, focus - 2);
    const to = Math.min(journeyStops.length, Math.max(focus + 4, from + 6));
    const shownStops = allJourneyStops ? journeyStops : journeyStops.slice(from, to);
    const scheduled = currentIdx < 0 && !journeyStops.some((s) => s.state === "passed");

    return (
      <View style={styles.rowShell}>
        <Pressable
          onPress={() => expandRow(item)}
          disabled={!item.ritId}
          accessibilityRole={item.ritId ? "button" : undefined}
          accessibilityLabel={`${item.line} naar ${item.direction}, ${item.actual}${item.ritId ? ", ritverloop tonen" : ""}`}
          accessibilityState={item.ritId ? { expanded } : undefined}
          style={({ pressed }) => [
            styles.departureRow,
            expanded && styles.rowExpanded,
            pressed && { opacity: 0.74 },
          ]}
        >
          <View style={[styles.railStripe, { backgroundColor: delayed ? "#D7882C" : item.live ? GREEN : "#C4D0C9" }]}/>
          <View style={styles.timeCell}>
            <Text style={[styles.time, delayed && { color: RED }]} numberOfLines={1}>{item.actual}</Text>
            {delayed ? (
              <Text style={styles.oldTime}>{item.planned}</Text>
            ) : countdown ? (
              <Text style={styles.timeRelative}>{countdown}</Text>
            ) : null}
          </View>
          <View style={styles.badgeCell}>
            <View style={[styles.lineBadge, { backgroundColor: carrierStyle.bg }]}>
              <Text style={[styles.lineBadgeText, { color: carrierStyle.text }]} numberOfLines={1}>{item.line}</Text>
            </View>
          </View>
          <View style={styles.directionCell}>
            <Text style={styles.direction} numberOfLines={2}>{item.direction}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: status.color }]}/>
              <Text style={styles.statusText} numberOfLines={1}>{status.text}</Text>
            </View>
          </View>
          {item.ritId ? (
            <Ionicons name={expanded ? "chevron-up" : "chevron-forward"} size={18} color={MUTED}/>
          ) : null}
        </Pressable>

        {expanded ? (
          <View style={styles.journeyBox}>
            <View style={styles.journeyTitleRow}>
              <Ionicons name="git-branch-outline" size={16} color={GREEN}/>
              <Text style={styles.journeyTitle}>Ritverloop · lijn {item.line}</Text>
              <Pressable onPress={() => expandRow(item)} accessibilityLabel="Sluit ritverloop">
                <Ionicons name="close" size={18} color={MUTED}/>
              </Pressable>
            </View>
            {journeyLoading ? (
              <View style={styles.journeyLoader}><ActivityIndicator size="small" color={GREEN}/><Text style={styles.journeyHint}>Rit ophalen...</Text></View>
            ) : journeyError ? (
              <Text style={styles.journeyHint}>Ritgegevens tijdelijk niet beschikbaar.</Text>
            ) : journey ? (
              <>
                <Text style={styles.journeyInfo} numberOfLines={2}>
                  {scheduled ? `Volgens dienstregeling · vertrek ${journeyStops[0]?.plannedTime || item.planned}` : "Actuele ritinformatie"}
                  {` · ${journeyStops.length} haltes`}
                </Text>
                {from > 0 && !allJourneyStops ? <Text style={styles.journeyFold}>{from} eerdere haltes</Text> : null}
                {shownStops.map((s, index) => {
                  const current = s.state === "current";
                  const atThisStop = Boolean(stopIdx >= 0 && s.id === journeyStops[stopIdx]?.id && s.name === journeyStops[stopIdx]?.name);
                  const delay = typeof s.delayMinutes === "number" && s.delayMinutes >= 1 ? `+${s.delayMinutes} min` : "";
                  return (
                    <View key={`${s.id}-${index}`} style={[styles.journeyStop, current && styles.journeyStopCurrent]}>
                      <Text style={styles.journeyClock}>{s.actualTime || s.plannedTime}</Text>
                      <View style={[styles.journeyDot, (current || atThisStop) && styles.journeyDotCurrent]}/>
                      <Text style={[styles.journeyStopText, (current || atThisStop) && styles.journeyStopTextFocus]} numberOfLines={2}>
                        {s.name}
                      </Text>
                      {delay ? <Text style={styles.journeyDelay}>{delay}</Text> : null}
                      {current ? <Text style={styles.journeyNow}>Nu</Text> : null}
                    </View>
                  );
                })}
                {to < journeyStops.length && !allJourneyStops ? (
                  <Text style={styles.journeyFold}>{journeyStops.length - to} volgende haltes</Text>
                ) : null}
                {journeyStops.length > 6 ? (
                  <Pressable style={styles.journeyMore} onPress={() => setAllJourneyStops((v) => !v)}>
                    <Text style={styles.journeyMoreText}>
                      {allJourneyStops ? "Toon minder haltes" : `Bekijk alle ${journeyStops.length} haltes`}
                    </Text>
                    <Ionicons name={allJourneyStops ? "chevron-up" : "chevron-down"} size={16} color={GREEN}/>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.scrim} onPress={() => router.back()} accessibilityLabel="Sluit halte"/>
      <View style={styles.root}>
      <View style={styles.handleOuter}><View style={styles.handle}/></View>
      <View style={styles.greenHeader}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Terug" style={styles.back}>
            <Ionicons name="chevron-back" size={24} color={DARK}/>
          </Pressable>
          <View style={styles.headCopy}>
            <Text style={styles.stopName} numberOfLines={2}>{stopName}</Text>
            <Text style={styles.stopSubtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <Pressable
            onPress={() => { if (stop) toggleFavoriteStop(stop); }}
            accessibilityLabel="Favoriete halte"
            style={styles.star}
          >
            <Ionicons name={favorite ? "star" : "star-outline"} size={25} color={DARK}/>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsInner}
        >
          <Pressable
            onPress={() => toggleLine()}
            style={[styles.chip, selectedLines.length === 0 ? styles.chipActive : styles.chipInactive]}
          >
            <Text style={[styles.chipText, selectedLines.length === 0 ? styles.chipTextActive : styles.chipTextInactive]}>
              Alle lijnen
            </Text>
          </Pressable>
          {lineChoices.map((line) => {
            const active = selectedLines.includes(lineNorm(line.line));
            const cs = getVervoerderStyle(line.carrier, line.line);
            return (
              <Pressable
                key={lineNorm(line.line)}
                onPress={() => toggleLine(line.line)}
                style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
              >
                <View style={[styles.lineSquare, { backgroundColor: cs.bg }]}/>
                <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>
                  {line.line}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.tabs}>
        {([
          ["departures", "Vertrekken"],
          ["arrivals", "Aankomsten"],
          ["disruptions", "Storingen"],
        ] as const).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => { setTab(key); setExpandedId(null); setExpandedTripId(null); }}
            style={[styles.tab, tab === key && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            {key === "disruptions" && disruptions.length > 0 ? (
              <View style={styles.countBubble}><Text style={styles.countBubbleText}>{disruptions.length}</Text></View>
            ) : null}
          </Pressable>
        ))}
      </View>

      {tab === "disruptions" ? (
        <FlatList
          data={scopedDisruptions}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload(false, true)} tintColor={GREEN}/>}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <View style={styles.empty}><Ionicons name="checkmark-circle-outline" size={22} color={GREEN}/><Text style={styles.emptyText}>Geen actuele storingen bekend.</Text></View>
          }
          renderItem={({ item }) => (
            <View style={styles.incident}>
              <View style={styles.incidentHead}>
                <Ionicons name="warning-outline" color="#A96B0B" size={18}/>
                <Text style={styles.incidentTitle}>{item.title}</Text>
              </View>
              {item.description && item.description !== item.title ? (
                <Text style={styles.incidentDescription}>{item.description}</Text>
              ) : null}
              {item.lines.length > 0 ? (
                <View style={styles.incidentLines}>
                  {item.lines.map((line) => {
                    const cs = getVervoerderStyle(undefined, line);
                    return (
                      <View key={line} style={[styles.incidentLine, { backgroundColor: cs.bg }]}>
                        <Text style={[styles.incidentLineText, { color: cs.text }]}>{line}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          )}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          extraData={`${expandedId}:${journeyLoading}:${allJourneyStops}:${Boolean(journey)}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.rows}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload(false, true)} tintColor={GREEN}/>}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={<Text style={styles.emptyText}>Geen {tab === "arrivals" ? "aankomsten" : "vertrekken"} voor deze selectie.</Text>}
        />
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "transparent" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(11, 34, 23, 0.46)" },
  root: {
    height: "94%", backgroundColor: BG,
    borderTopLeftRadius: 23, borderTopRightRadius: 23,
    overflow: "hidden",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BG },
  handleOuter: { height: 13, justifyContent: "center", alignItems: "center" },
  handle: { width: 34, height: 4, borderRadius: 9, backgroundColor: "#D5DFD8" },
  greenHeader: { backgroundColor: "#FFFFFF", paddingTop: 13, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#E7EDE9" },
  headerTop: { paddingHorizontal: 15, flexDirection: "row", alignItems: "center", gap: 10 },
  back: { width: 36, height: 38, borderRadius: 10, backgroundColor: "#F0F4F1", alignItems: "center", justifyContent: "center" },
  headCopy: { flex: 1, minWidth: 0 },
  stopName: { color: "#172920", fontFamily: FONT800, fontSize: 17.5, lineHeight: 21 },
  stopSubtitle: { color: MUTED, fontFamily: FONT500, fontSize: 11, marginTop: 2 },
  star: { width: 35, height: 38, alignItems: "center", justifyContent: "center" },
  chipsScroll: { marginTop: 12, maxHeight: 33 },
  chipsInner: { paddingHorizontal: 15, gap: 7, alignItems: "center" },
  chip: { height: 32, borderRadius: 10, paddingHorizontal: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  chipActive: { backgroundColor: GREEN, borderColor: GREEN },
  chipInactive: { backgroundColor: "#FFFFFF", borderColor: "#DCE5DF" },
  chipText: { fontFamily: FONT800, fontSize: 11.5 },
  chipTextActive: { color: "#FFFFFF" },
  chipTextInactive: { color: "#31483A" },
  lineSquare: { width: 9, height: 9, borderRadius: 3 },
  tabs: { flexDirection: "row", minHeight: 45, backgroundColor: BG, borderBottomColor: "#E9EFEB", borderBottomWidth: 1 },
  tab: { flex: 1, minHeight: 45, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: GREEN },
  tabText: { fontFamily: FONT700, fontSize: 12.5, color: "#6A7770" },
  tabTextActive: { color: GREEN },
  countBubble: { borderRadius: 10, paddingHorizontal: 5, minWidth: 18, height: 18, backgroundColor: "#EAF3ED", alignItems: "center", justifyContent: "center" },
  countBubbleText: { fontFamily: FONT800, fontSize: 10, color: GREEN },
  rows: { paddingBottom: 45 },
  rowShell: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#E4ECE6" },
  departureRow: { minHeight: 68, flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 12, backgroundColor: BG, gap: 5 },
  rowExpanded: { backgroundColor: "#F5F9F6" },
  railStripe: { width: 3, height: 41, borderRadius: 6, marginRight: 2 },
  timeCell: { width: 55, justifyContent: "center", gap: 2 },
  time: { fontFamily: FONT800, fontSize: 15.3, color: "#17221B", fontVariant: ["tabular-nums"], letterSpacing: -0.4 },
  oldTime: { color: "#7E8882", fontFamily: FONT500, fontSize: 10.5, textDecorationLine: "line-through", fontVariant: ["tabular-nums"] },
  timeRelative: { fontFamily: FONT700, fontSize: 10, color: MUTED },
  badgeCell: { width: 38, alignItems: "flex-start" },
  lineBadge: { borderRadius: 6, minWidth: 30, maxWidth: 38, height: 24, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  lineBadgeText: { fontFamily: FONT800, fontSize: 11.5, lineHeight: 15 },
  directionCell: { flex: 1, minWidth: 0, justifyContent: "center" },
  direction: { fontFamily: FONT700, fontSize: 13, lineHeight: 17, color: "#13211A" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  statusDot: { width: 6, height: 6, borderRadius: 6 },
  statusText: { fontFamily: FONT500, fontSize: 10.8, color: "#68756D", flexShrink: 1 },
  journeyBox: { borderTopWidth: 1, borderTopColor: "#E2EAE3", backgroundColor: "#F7FAF8", paddingHorizontal: 14, paddingTop: 11, paddingBottom: 13 },
  journeyTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  journeyTitle: { flex: 1, color: "#18382A", fontFamily: FONT800, fontSize: 12.5 },
  journeyHint: { color: MUTED, fontFamily: FONT600, fontSize: 11.5, marginTop: 10 },
  journeyLoader: { flexDirection: "row", alignItems: "center", gap: 9 },
  journeyInfo: { marginTop: 5, marginBottom: 8, fontFamily: FONT600, color: MUTED, fontSize: 11 },
  journeyStop: { minHeight: 35, flexDirection: "row", alignItems: "center", paddingVertical: 6, paddingHorizontal: 6, gap: 9, borderRadius: 8 },
  journeyStopCurrent: { backgroundColor: "#E5F3E9" },
  journeyClock: { width: 42, color: "#596D62", fontFamily: FONT700, fontSize: 11.5, fontVariant: ["tabular-nums"] },
  journeyDot: { width: 9, height: 9, borderWidth: 2, borderColor: "#A8B9AF", borderRadius: 9 },
  journeyDotCurrent: { backgroundColor: GREEN, borderColor: GREEN },
  journeyStopText: { flex: 1, minWidth: 0, color: "#2E3E34", fontFamily: FONT600, fontSize: 11.5, lineHeight: 15 },
  journeyStopTextFocus: { color: "#163E28", fontFamily: FONT800 },
  journeyDelay: { color: RED, fontFamily: FONT800, fontSize: 10 },
  journeyNow: { color: GREEN, fontFamily: FONT800, fontSize: 10 },
  journeyFold: { fontFamily: FONT500, fontSize: 10.5, color: "#7B8A80", paddingVertical: 5, paddingLeft: 54 },
  journeyMore: { alignSelf: "stretch", flexDirection: "row", alignItems: "center", justifyContent: "center", marginTop: 8, borderRadius: 9, backgroundColor: "#E9F2EC", paddingVertical: 10, gap: 6 },
  journeyMoreText: { color: GREEN, fontFamily: FONT800, fontSize: 11.5 },
  emptyText: { color: MUTED, fontFamily: FONT600, fontSize: 13, padding: 18 },
  empty: { flexDirection: "row", alignItems: "center", padding: 12, gap: 8 },
  error: { paddingHorizontal: 16, paddingVertical: 8, color: RED, fontFamily: FONT600, fontSize: 12 },
  incident: { paddingHorizontal: 16, paddingVertical: 15, borderBottomColor: "#E3E8E5", borderBottomWidth: StyleSheet.hairlineWidth },
  incidentHead: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  incidentTitle: { fontFamily: FONT800, fontSize: 14, flex: 1, color: "#1C2821" },
  incidentDescription: { fontFamily: FONT500, fontSize: 12, lineHeight: 19, color: "#63716A", marginTop: 6 },
  incidentLines: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  incidentLine: { minWidth: 28, borderRadius: 5, paddingHorizontal: 6, height: 21, alignItems: "center", justifyContent: "center" },
  incidentLineText: { fontFamily: FONT800, fontSize: 11 },
});
