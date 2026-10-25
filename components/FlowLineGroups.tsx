import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import type { DepartureItem } from "../types/api";
import { effectiveDepartureClock } from "../lib/format";
import { departureClockDelay } from "../lib/departureLine";
import { stopBoardTiming } from "../lib/stopBoardDesign";
import { StopBoardBadge } from "./StopBoardRow";
import { favoriteLineKey } from "../lib/favoriteLines";

type Direction = { destination: string; key: string; departures: DepartureItem[] };
type Group = { line: string; carrier: string; directions: Direction[]; total: number };
type Props = {
  /** Favourite line keys (favoriteLineKey): their cards get a filled star. */
  favoriteKeys?: ReadonlySet<string>;
  onToggleFavorite?: (line: string, carrier: string) => void;
  departures: DepartureItem[];
  onOpenDeparture: (item: DepartureItem) => void;
  onSelectLine: (line: string) => void;
};

/** One card per line, direction rows and real times only. No invented occupancy/GPS. */
export function FlowLineGroups({ departures, onOpenDeparture, onSelectLine, favoriteKeys, onToggleFavorite }: Props) {
  const { colors, resolvedScheme } = useApp();
  const groups = useMemo<Group[]>(() => {
    const byLine = new Map<string, { line: string; carrier: string; byDirection: Map<string, Direction>; total: number }>();
    for (const dep of departures) {
      const line = String(dep.line || "?").trim();
      const carrier = String(dep.carrier || "").trim();
      const lineKey = [line.toLowerCase(), carrier.toLowerCase()].join(":");
      let grp = byLine.get(lineKey);
      if (!grp) {
        grp = { line, carrier, byDirection: new Map(), total: 0 };
        byLine.set(lineKey, grp);
      }
      const destination = String(dep.destination || "Bestemming onbekend").trim();
      const directionKey = destination.toLocaleLowerCase("nl");
      let direction = grp.byDirection.get(directionKey);
      if (!direction) {
        direction = { destination, key: lineKey + "/" + directionKey, departures: [] };
        grp.byDirection.set(directionKey, direction);
      }
      direction.departures.push(dep);
      grp.total++;
    }
    return [...byLine.values()]
      .sort((a, b) => a.line.localeCompare(b.line, "nl", { numeric: true }))
      .map((grp) => ({
        line: grp.line, carrier: grp.carrier, total: grp.total,
        directions: [...grp.byDirection.values()].sort((a,b)=>a.destination.localeCompare(b.destination,"nl"))
      }));
  }, [departures]);
  const directionsCount = groups.reduce((n, g) => n + g.directions.length, 0);

  function directionSummary(rows: DepartureItem[], nowMs: number) {
    const times: number[]=[];
    let previous=-1;
    let day=0;
    // Alleen ritten die nog in de toekomst liggen
    const futureRows = rows.filter(dep => {
      if (dep.cancelled === true || dep.departed === true) return false;
      const ts = dep.effectiveAt ? Date.parse(dep.effectiveAt) : dep.plannedTime ? Date.parse(dep.plannedTime) : 0;
      return ts > nowMs;
    });
    for(const dep of futureRows){
      const match=/^(\d{1,2}):(\d{2})$/.exec(effectiveDepartureClock(dep));
      if(!match)continue;
      const clock=Number(match[1])*60+Number(match[2]);
      if(previous>=0 && clock+day*1440<previous-600)day++;
      const value=clock+day*1440;
      if(value>=previous){times.push(value);previous=value;}
    }
    const gaps=times.slice(1).map((v,i)=>v-times[i]).filter(n=>n>0&&n<=180).sort((a,b)=>a-b);
    const median=gaps.length>=2?(gaps.length%2===1?gaps[(gaps.length-1)/2]:(gaps[gaps.length/2-1]+gaps[gaps.length/2])/2):null;
    // Laatste toekomstige rit
    const last = futureRows.length ? effectiveDepartureClock(futureRows[futureRows.length-1]) : null;
    return {last, frequency:median===null?null:Math.max(5,Math.round(median/5)*5)};
  }

  const nowMs = Date.now();

  return (
    <FlatList
      data={groups}
      keyExtractor={(group) => group.line + "/" + group.carrier}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.intro}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.text }]}>Lijnen op deze halte</Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.subtitle, { color: colors.textSoft }]}>
            {groups.length} lijnen · {directionsCount} richtingen · kies een vertrektijd
          </Text>
        </View>
      }
      ListEmptyComponent={<Text maxFontSizeMultiplier={1.3} style={[styles.empty, { color: colors.textSoft }]}>Geen geplande vertrekken beschikbaar.</Text>}
      renderItem={({ item: group }) => (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <Pressable
              style={styles.headerMain}
              onPress={() => onSelectLine(group.line)}
              accessibilityRole="button"
              accessibilityLabel={`Alle vertrekken van lijn ${group.line} tonen`}
            >
              <StopBoardBadge item={group.directions[0].departures[0]} />
              <View style={styles.headerText}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.lineCaption, { color: colors.heading }]}>Lijn {group.line}</Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.carrier, { color: colors.textSoft }]}>{group.carrier || "Vervoerder onbekend"} · {group.total} vertrekken</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
            {onToggleFavorite ? (() => {
              const favorite = Boolean(favoriteKeys?.has(favoriteLineKey(group.line, group.carrier)));
              return (
                <Pressable onPress={() => onToggleFavorite(group.line, group.carrier)} hitSlop={6} accessibilityRole="button"
                  accessibilityLabel={(favorite ? "Verwijder favoriete lijn " : "Bewaar als favoriete lijn ") + group.line}
                  accessibilityState={{ selected: favorite }} style={styles.star}>
                  <Ionicons name={favorite ? "star" : "star-outline"} size={21} color={favorite ? colors.warning : colors.textSoft} />
                </Pressable>
              );
            })() : null}
          </View>
          {group.directions.map((direction, index) => {
            const summary = directionSummary(direction.departures, nowMs);
            return (
              <View key={direction.key} style={[styles.direction, { borderTopColor: colors.border }]}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.directionName, { color: colors.text }]} numberOfLines={2}>Richting {direction.destination}</Text>
                {(summary.last || summary.frequency) ? (
                  <Text maxFontSizeMultiplier={1.3} style={[styles.frequency, {color: colors.textSoft}]}>
                    {[summary.last ? "Laatste vertrek " + summary.last : "", summary.frequency ? "ca. elke " + summary.frequency + " min" : ""].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}
                <View style={styles.departureTimes}>
                  {direction.departures.slice(0, 4).map((dep, i) => {
                    const timing = stopBoardTiming(dep, nowMs, false);
                    const delay = departureClockDelay(dep);
                    const departed = dep.departed === true && !dep.cancelled;
                    const cancelled = dep.cancelled === true;
                    return (
                      <Pressable
                        key={dep.id + ":" + i}
                        disabled={!dep.ritId || departed}
                        accessibilityRole={dep.ritId && !departed ? "button" : undefined}
                        accessibilityLabel={departed ? "Lijn " + group.line + " richting " + direction.destination + ", vertrokken" : cancelled ? "Lijn " + group.line + " richting " + direction.destination + ", " + timing.primary + ", rijdt niet" : "Lijn " + group.line + " richting " + direction.destination + ", " + timing.primary + ", rit openen"}
                        onPress={() => onOpenDeparture(dep)}
                        style={[styles.timeChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <View style={styles.timeStack}>
                          <Text maxFontSizeMultiplier={1.3} style={[styles.timeText, { color: cancelled ? colors.danger : departed ? colors.textMuted : colors.text }, (cancelled || departed) && { textDecorationLine: "line-through" }]}>{timing.primary}</Text>
                          {timing.secondary
                            ? <Text maxFontSizeMultiplier={1.3} style={[styles.timeSecondary, { color: colors.textSoft }]}>
                                {timing.secondary}{delay ? <Text style={{ color: delay.tone === "red" ? colors.danger : colors.delayWarning, fontWeight: "700" }}>{" "}{delay.text}</Text> : null}
                              </Text>
                            : delay
                              ? <Text maxFontSizeMultiplier={1.3} style={[styles.timeSecondary, { color: delay.tone === "red" ? colors.danger : colors.delayWarning, fontWeight: "700" }]}>{delay.text}</Text>
                              : null}
                        </View>
                        {cancelled
                          ? <Text maxFontSizeMultiplier={1.3} style={{ color: colors.danger, fontSize: 9, fontWeight: "900" }}>Rijdt niet</Text>
                          : departed
                            ? <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textMuted, fontSize: 9, fontWeight: "800" }}>Vertrokken</Text>
                            : dep.liveDataStale === true
                              ? <Text maxFontSizeMultiplier={1.3} style={{ color: colors.warning, fontSize: 9, fontWeight: "800" }}>Live-info oud</Text>
                              : dep.isLive === true
                                ? <View style={[styles.dot, { backgroundColor: colors.success }]} />
                                : null}
                      </Pressable>
                    );
                  })}
                  {direction.departures.length > 4 ? (
                    <Pressable
                      onPress={() => onSelectLine(group.line)}
                      accessibilityRole="button"
                      style={styles.more}
                    >
                      <Text maxFontSizeMultiplier={1.3} style={[styles.moreText, { color: colors.accentText }]}>+{direction.departures.length - 4}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 12, paddingBottom: 32, gap: 0 },
  intro: { paddingTop: 16, paddingBottom: 4, gap: 5 },
  title: { fontSize: 17, fontWeight: "900" },
  subtitle: { fontSize: 11, lineHeight: 16 },
  empty: { textAlign: "center", marginTop: 30, fontSize: 12 },
  card: { borderRadius: 0, borderWidth: 0, borderBottomWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  header: { minHeight: 54, paddingHorizontal: 12, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 9 },
  headerMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 9 },
  star: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  lineCaption: { fontSize: 13, fontWeight: "800" },
  carrier: { fontSize: 10.5 },
  direction: { borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  directionName: { fontSize: 12, fontWeight: "700" },
  departureTimes: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  frequency: { fontSize: 11, fontWeight: "600" },
  timeChip: { minHeight: 37, paddingHorizontal: 9, borderRadius: 0, borderWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 },
  timeStack: { alignItems: "flex-end", gap: 1 },
  timeText: { fontSize: 12.5, fontWeight: "800", fontVariant: ["tabular-nums"] },
  timeSecondary: { fontSize: 9.5, fontVariant: ["tabular-nums"] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  more: { justifyContent: "center", paddingHorizontal: 7, minHeight: 37 },
  moreText: { fontSize: 11, fontWeight: "900" }
});
