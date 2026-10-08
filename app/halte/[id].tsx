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
import { getHalte } from "../../lib/api";
import { DepartureItem, HalteBoardData, Mode } from "../../types/api";

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
  if (row.live) return { text: row.delay >= 1 ? `Live · +${row.delay} min` : "Live · op tijd", color: GREEN };
  if (row.estimated) return { text: row.delay >= 1 ? `Geschat · +${row.delay} min` : "Geschat", color: "#D59A16" };
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

  useEffect(() => {
    if (!id) return;
    let active = true;
    setSelectedLines([]);
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

  if (!fontsLoaded || (loading && !data)) {
    return <View style={styles.center}><ActivityIndicator color={GREEN}/></View>;
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
    const countdown = item.countdown !== null && item.countdown >= 0 && item.countdown < 60
      ? item.countdown === 0 ? "nu" : `${item.countdown} min`
      : "";
    return (
      <Pressable
        onPress={item.ritId ? () => router.push({ pathname: "/rit/[id]", params: { id: item.ritId! } }) : undefined}
        disabled={!item.ritId}
        accessibilityRole={item.ritId ? "button" : undefined}
        style={({ pressed }) => [
          styles.departureRow,
          delayed && styles.delayRow,
          pressed && { opacity: 0.66 },
        ]}
      >
        <View style={styles.timeCell}>
          <Text style={[styles.time, delayed && { color: RED }]}>{item.actual}</Text>
          {delayed && <Text style={styles.oldTime}>{item.planned}</Text>}
        </View>
        <View style={styles.badgeCell}>
          <View style={[styles.lineBadge, { backgroundColor: carrierStyle.bg }]}>
            <Text style={[styles.lineBadgeText, { color: carrierStyle.text }]} numberOfLines={1}>{item.line}</Text>
          </View>
        </View>
        <View style={styles.directionCell}>
          <Text style={styles.direction} numberOfLines={1}>{item.direction}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]}/>
            <Text style={styles.statusText} numberOfLines={1}>{status.text}</Text>
          </View>
        </View>
        <Text style={[
          styles.countdown,
          { color: delayed ? RED : item.live ? GREEN : "#1B2420" },
        ]} numberOfLines={1}>{countdown}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.greenHeader}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => router.back()} accessibilityLabel="Terug" style={styles.back}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF"/>
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
            <Ionicons name={favorite ? "star" : "star-outline"} size={25} color="#FFFFFF"/>
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
            onPress={() => setTab(key)}
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
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.rows}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload(false, true)} tintColor={GREEN}/>}
          ListHeaderComponent={
            <>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.columnHeader}>
                <Text style={[styles.columnTitle, styles.hTime]}>TIJD</Text>
                <Text style={[styles.columnTitle, styles.hLine]}>LIJN</Text>
                <Text style={[styles.columnTitle, styles.hDirection]}>RICHTING</Text>
                <Text style={[styles.columnTitle, styles.hCountdown]}>VERTREK</Text>
              </View>
            </>
          }
          ListEmptyComponent={<Text style={styles.emptyText}>Geen {tab === "arrivals" ? "aankomsten" : "vertrekken"} voor deze selectie.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BG },
  greenHeader: { backgroundColor: DARK, paddingTop: 48, paddingBottom: 10 },
  headerTop: { paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 11 },
  back: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  headCopy: { flex: 1, minWidth: 0 },
  stopName: { color: BG, fontFamily: FONT800, fontSize: 20, lineHeight: 24 },
  stopSubtitle: { color: "#B9D3C4", fontFamily: FONT500, fontSize: 13, marginTop: 3 },
  star: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  chipsScroll: { marginTop: 14, maxHeight: 34 },
  chipsInner: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  chip: { height: 34, borderRadius: 18, paddingHorizontal: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 7 },
  chipActive: { backgroundColor: BG, borderColor: BG },
  chipInactive: { backgroundColor: "transparent", borderColor: "rgba(255,255,255,0.28)" },
  chipText: { fontFamily: FONT800, fontSize: 12 },
  chipTextActive: { color: DARK },
  chipTextInactive: { color: BG },
  lineSquare: { width: 13, height: 13, borderRadius: 3 },
  tabs: { flexDirection: "row", minHeight: 48, backgroundColor: BG, borderBottomColor: "#E3E8E5", borderBottomWidth: 1 },
  tab: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderBottomWidth: 3, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: GREEN },
  tabText: { fontFamily: FONT700, fontSize: 13, color: "#6A7770" },
  tabTextActive: { color: GREEN },
  countBubble: { borderRadius: 10, paddingHorizontal: 5, minWidth: 18, height: 18, backgroundColor: "#EAF3ED", alignItems: "center", justifyContent: "center" },
  countBubbleText: { fontFamily: FONT800, fontSize: 10, color: GREEN },
  rows: { paddingBottom: 105 },
  columnHeader: { height: 34, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, backgroundColor: "#F9FAF9", borderBottomColor: "#E5EBE7", borderBottomWidth: 1 },
  columnTitle: { fontFamily: FONT800, fontSize: 12, letterSpacing: 0.5, color: MUTED },
  hTime: { width: 50 },
  hLine: { width: 44 },
  hDirection: { flex: 1 },
  hCountdown: { width: 58, textAlign: "right" },
  departureRow: { minHeight: 56, flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 16, borderBottomColor: "#E9EEEA", borderBottomWidth: StyleSheet.hairlineWidth, backgroundColor: BG },
  delayRow: { backgroundColor: "#FBF3F2" },
  timeCell: { width: 50, justifyContent: "center" },
  time: { fontFamily: FONT800, fontSize: 17, color: "#17221B", fontVariant: ["tabular-nums"] },
  oldTime: { color: "#7E8882", fontFamily: FONT500, fontSize: 11, textDecorationLine: "line-through", fontVariant: ["tabular-nums"], marginTop: 1 },
  badgeCell: { width: 44, alignItems: "flex-start" },
  lineBadge: { borderRadius: 6, minWidth: 30, maxWidth: 38, height: 24, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" },
  lineBadgeText: { fontFamily: FONT800, fontSize: 11, lineHeight: 15 },
  directionCell: { flex: 1, minWidth: 0, justifyContent: "center" },
  direction: { fontFamily: FONT700, fontSize: 14.5, color: "#13211A" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 6 },
  statusText: { fontFamily: FONT500, fontSize: 11.5, color: "#68756D", flexShrink: 1 },
  countdown: { width: 58, textAlign: "right", fontFamily: FONT800, fontSize: 12, fontVariant: ["tabular-nums"] },
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
