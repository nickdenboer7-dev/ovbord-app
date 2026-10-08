import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InlineJourney } from "../../components/InlineJourney";
import { LijnBadge } from "../../components/LijnBadge";
import { StopQuickSheet } from "../../components/StopQuickSheet";
import { useApp } from "../../context/AppProvider";
import { getHalte, getRit } from "../../lib/api";
import type { DepartureItem, HalteBoardData, JourneyStop, RitData } from "../../types/api";

type BoardTab = "departures" | "arrivals" | "disruptions";

function relativeLabel(item: DepartureItem) {
  const raw = item.relativeText || "";
  const match = raw.match(/(?:over\s*)?(\d+)\s*(?:min|minute)/i);
  return match ? `${match[1]} min` : raw.replace(/^over\s+/i, "");
}

export default function StopOverlay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, addRecentStop, toggleFavoriteStop, isFavoriteStop } = useApp();
  const [board, setBoard] = useState<HalteBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<BoardTab>("departures");
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [openedRit, setOpenedRit] = useState<string | null>(null);
  const [journey, setJourney] = useState<RitData | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyError, setJourneyError] = useState<string | null>(null);
  const [journeyReload, setJourneyReload] = useState(0);
  const [pickedStop, setPickedStop] = useState<JourneyStop | null>(null);
  const refreshToken = useRef(0);

  useEffect(() => {
    if (!id) return;
    let active = true;
    const load = async (initial: boolean) => {
      try {
        if (initial) setLoading(true);
        const data = await getHalte(id);
        if (!active) return;
        setBoard(data);
        setError(null);
        if (initial) addRecentStop(data.stop);
      } catch {
        if (active && initial) setError("Haltebord kon niet worden geladen.");
      } finally {
        if (active && initial) setLoading(false);
      }
    };
    void load(true);
    const timer = setInterval(() => void load(false), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [id]);

  useEffect(() => {
    if (!openedRit) { setJourney(null); setJourneyError(null); return; }
    let active = true;
    const token = ++refreshToken.current;
    setJourney(null);
    setJourneyLoading(true);
    setJourneyError(null);
    const load = async () => {
      try {
        const result = await getRit(openedRit);
        if (!active || refreshToken.current !== token) return;
        setJourney(result);
        setJourneyError(null);
      } catch {
        if (active && refreshToken.current === token) setJourneyError("Ritverloop niet beschikbaar");
      } finally {
        if (active && refreshToken.current === token) setJourneyLoading(false);
      }
    };
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => { active = false; clearInterval(interval); };
  }, [openedRit, journeyReload]);

  const source = useMemo(() => {
    if (!board) return [];
    if (tab === "arrivals") return board.arrivals;
    if (tab === "disruptions") return [];
    return board.departures;
  }, [board, tab]);
  const lines = useMemo(() => {
    const unique = Array.from(new Set(source.map((d) => String(d.line))));
    return unique.sort((a,b) => a.localeCompare(b, "nl", { numeric: true }));
  }, [source]);
  const departures = useMemo(
    () => selectedLine && tab !== "disruptions" ? source.filter((d) => String(d.line) === selectedLine) : source,
    [source, selectedLine, tab]
  );

  const close = () => {
    if (pickedStop) { setPickedStop(null); return; }
    router.back();
  };
  const selectTab = (next: BoardTab) => {
    setTab(next);
    setSelectedLine(null);
    setOpenedRit(null);
  };
  const selectLine = (line: string | null) => {
    setSelectedLine(line);
    setOpenedRit(null);
  };
  const toggleJourney = (item: DepartureItem) => {
    if (!item.ritId) return;
    setOpenedRit((previous) => previous === item.ritId ? null : item.ritId || null);
  };

  return (
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Sluit halteoverzicht" />
      <View style={[styles.panel, { backgroundColor: colors.surface, marginTop: Math.max(insets.top + 10, 36), paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        {loading && !board ? (
          <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
        ) : !board ? (
          <View style={styles.center}>
            <Text style={{ color: colors.text }}>{error || "Halte niet gevonden."}</Text>
            <Pressable onPress={close} style={styles.retry}><Text style={{ color: colors.accent }}>Terug</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Pressable accessibilityLabel="Terug naar vorige scherm" onPress={close} style={[styles.back, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="chevron-back" size={24} color={colors.accent} />
              </Pressable>
              <View style={styles.headText}>
                <Text style={[styles.stopTitle, { color: colors.text }]} numberOfLines={2}>{board.stop.name}</Text>
                <Text style={[styles.stopSub, { color: colors.textSoft }]} numberOfLines={1}>Halte · {board.stop.city || "Nederland"}</Text>
              </View>
              <Pressable accessibilityLabel="Bewaar favoriete halte" onPress={() => toggleFavoriteStop(board.stop)} style={styles.star}>
                <Ionicons name={isFavoriteStop(board.stop.id) ? "star" : "star-outline"} size={25} color={colors.accent} />
              </Pressable>
            </View>

            {lines.length > 1 && tab !== "disruptions" ? (
              <View style={styles.filterWrap}>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filters}
                  data={[null, ...lines] as (string | null)[]}
                  keyExtractor={(line) => line ?? "all"}
                  renderItem={({ item: line }) => {
                    const active = line === selectedLine;
                    return (
                      <Pressable
                        onPress={() => selectLine(line)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[styles.filter, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.accent : colors.border }]}
                      >
                        <Text style={[styles.filterText, { color: active ? "#FFFFFF" : colors.text }]}>
                          {line === null ? "Alle lijnen" : line}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              </View>
            ) : null}

            <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
              {([
                ["departures", "Vertrekken"],
                ["arrivals", "Aankomsten"],
                ["disruptions", "Storingen"]
              ] as const).map(([key,label]) => (
                <Pressable key={key} onPress={() => selectTab(key)} style={[styles.tab, tab === key && { borderBottomColor: colors.accent }]}>
                  <Text style={[styles.tabText, { color: tab === key ? colors.accent : colors.textSoft }]}>{label}</Text>
                  {key === "disruptions" && board.disruptions.length ? <Text style={[styles.disruptionCount, { backgroundColor: colors.accentSoft, color: colors.accent }]}>{board.disruptions.length}</Text> : null}
                </Pressable>
              ))}
            </View>

            {tab === "disruptions" ? (
              <View style={styles.disruptionList}>
                {board.disruptions.length === 0 ? <Text style={{ color: colors.textSoft }}>Geen storingen bekend.</Text> : board.disruptions.map((item, index) => <Text key={index} style={[styles.disruptionText, { color: colors.text }]}>{item}</Text>)}
              </View>
            ) : (
              <FlatList
                data={departures}
                extraData={[openedRit, journeyLoading, journey, journeyError]}
                keyExtractor={(item,index) => `${item.id}:${index}`}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.departureList}
                ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSoft }]}>Geen vertrektijden beschikbaar.</Text>}
                renderItem={({ item }) => {
                  const expanded = Boolean(item.ritId && item.ritId === openedRit);
                  const delayed = typeof item.delayMinutes === "number" && item.delayMinutes >= 1;
                  const live = item.isLive === true;
                  return (
                    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Pressable
                        onPress={() => toggleJourney(item)}
                        disabled={!item.ritId}
                        accessibilityRole={item.ritId ? "button" : undefined}
                        accessibilityLabel={item.ritId ? `Toon ritverloop van lijn ${item.line} naar ${item.destination}` : undefined}
                        style={[styles.departure, expanded && { backgroundColor: colors.surfaceSoft }]}
                      >
                        <View style={[styles.liveRail, { backgroundColor: delayed ? colors.warning : live ? colors.accent : colors.border }]} />
                        <View style={styles.timeWrap}>
                          <Text style={[styles.time, { color: delayed ? colors.danger : colors.text }]} numberOfLines={1}>{item.plannedTime}</Text>
                          <Text style={[styles.relative, { color: colors.textSoft }]} numberOfLines={1}>{relativeLabel(item)}</Text>
                        </View>
                        <LijnBadge line={item.line} carrier={item.carrier} compact />
                        <View style={styles.departureContent}>
                          <Text style={[styles.destination, { color: colors.text }]} numberOfLines={2}>{item.destination}</Text>
                          <View style={styles.meta}>
                            <View style={[styles.miniDot, { backgroundColor: live ? colors.accent : colors.textMuted }]} />
                            <Text style={[styles.metaText, { color: colors.textSoft }]} numberOfLines={1}>{live ? "Live" : "Dienstregeling"}</Text>
                            {delayed ? <Text style={[styles.delay, { color: colors.danger }]}>+{item.delayMinutes} min</Text> : null}
                          </View>
                        </View>
                        {item.ritId ? <Ionicons name={expanded ? "chevron-up" : "chevron-forward"} color={colors.textSoft} size={18} /> : null}
                      </Pressable>
                      {expanded ? (
                        <InlineJourney
                          journey={journey}
                          loading={journeyLoading}
                          error={journeyError}
                          onRetry={() => setJourneyReload((value) => value + 1)}
                          onStopPress={(stop) => setPickedStop(stop)}
                        />
                      ) : null}
                    </View>
                  );
                }}
              />
            )}
          </>
        )}
      </View>
      <StopQuickSheet stop={pickedStop} onClose={() => setPickedStop(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "transparent" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(4, 20, 13, .42)" },
  panel: { flex: 1, borderTopLeftRadius: 25, borderTopRightRadius: 25, overflow: "hidden" },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 5, marginTop: 9, marginBottom: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  retry: { padding: 10 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10, gap: 10 },
  back: { width: 39, height: 43, borderRadius: 12, justifyContent: "center", alignItems: "center" },
  headText: { flex: 1, minWidth: 0 },
  stopTitle: { fontSize: 19, fontWeight: "800", lineHeight: 22 },
  stopSub: { fontSize: 12, marginTop: 3 },
  star: { width: 37, height: 40, alignItems: "center", justifyContent: "center" },
  filterWrap: { paddingBottom: 10 },
  filters: { paddingHorizontal: 13, alignItems: "center", gap: 7 },
  filter: { minWidth: 50, minHeight: 36, borderRadius: 11, borderWidth: 1, paddingHorizontal: 13, justifyContent: "center", alignItems: "center" },
  filterText: { fontSize: 13, fontWeight: "800" },
  tabs: { flexDirection: "row", borderBottomWidth: 1 },
  tab: { flex: 1, minHeight: 46, borderBottomWidth: 3, borderBottomColor: "transparent", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  tabText: { fontSize: 13, fontWeight: "700" },
  disruptionCount: { fontSize: 10, paddingHorizontal: 5, borderRadius: 10, fontWeight: "800" },
  departureList: { paddingBottom: 22 },
  departure: { minHeight: 75, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 13 },
  liveRail: { width: 3, height: "100%", alignSelf: "center", borderRadius: 6 },
  timeWrap: { width: 51, gap: 4 },
  time: { fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] },
  relative: { fontSize: 10.5, fontWeight: "600" },
  departureContent: { flex: 1, minWidth: 0, gap: 3 },
  destination: { fontSize: 13.5, lineHeight: 17, fontWeight: "800" },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  miniDot: { width: 6, height: 6, borderRadius: 4 },
  metaText: { fontSize: 11.5, fontWeight: "500" },
  delay: { fontSize: 11, fontWeight: "800" },
  empty: { marginTop: 30, textAlign: "center", fontSize: 13 },
  disruptionList: { paddingHorizontal: 15, paddingTop: 20 },
  disruptionText: { paddingVertical: 8, fontSize: 14 }
});
