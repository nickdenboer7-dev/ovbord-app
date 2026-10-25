import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import type { DepartureItem } from "../types/api";
import { getDienstregeling } from "../lib/api";
import { departureClockDelay } from "../lib/departureLine";
import { STOP_BOARD_BLUE } from "../lib/stopBoardDesign";
import {
  addDays, cachedSchedule, dayState, LineSchedule, liveByTripId, localIsoDate, longDateLabel, monthGrid, monthLabel,
  nextTripIndex, oppositeDirection, pickDirection, scheduleCacheKey, ScheduleDirection, shortDateLabel, showsPlatforms
} from "../lib/lineSchedule";

type Props = {
  stopId: string;
  line: string;
  routeIds: string[];
  destination: string;
  gtfsTripIds: string[];
  /** Live vertrekken van deze lijn; alleen vandaag gekoppeld via GTFS-trip-ID. */
  liveDepartures: DepartureItem[];
  date: string;
  onChangeDate: (iso: string) => void;
  onOpenDeparture: (item: DepartureItem) => void;
  /** Het bestaande compacte overzicht; zichtbaar tijdens laden en als de dienstregeling niet beschikbaar is. */
  fallback?: React.ReactNode;
};

type DirectionChoice = { routeId: string; directionId: number | null; destination: string };

const WEEKDAYS = ["ma", "di", "wo", "do", "vr", "za", "zo"];

/** Inline dienstregeling onder een richting in de Lijnen-tab: geen apart scherm, geen extra terugstap. */
export function LineSchedulePanel({ stopId, line, routeIds, destination, gtfsTripIds, liveDepartures, date, onChangeDate, onOpenDeparture, fallback }: Props) {
  const { colors } = useApp();
  const [schedule, setSchedule] = useState<LineSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [choice, setChoice] = useState<DirectionChoice | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const routeKey = routeIds.join(",");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    const key = scheduleCacheKey(stopId, routeIds, line, date);
    cachedSchedule(key, () => getDienstregeling(stopId, { routeIds, line, date }))
      .then((data) => { if (alive) { setSchedule(data); setLoading(false); } })
      .catch(() => { if (alive) { setSchedule(null); setFailed(true); setLoading(false); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopId, routeKey, line, date, retry]);

  const today = localIsoDate(new Date());
  const tomorrow = addDays(today, 1);
  const nowMs = Date.now();
  const isToday = date === today;

  const direction: ScheduleDirection | null = useMemo(() => {
    if (!schedule) return null;
    if (choice) {
      const picked = schedule.directions.find((d) => d.routeId === choice.routeId && (choice.directionId !== null
        ? d.directionId === choice.directionId
        : d.destination.toLocaleLowerCase("nl") === choice.destination.toLocaleLowerCase("nl")));
      if (picked) return picked;
    }
    return pickDirection(schedule, { destination, gtfsTripIds, routeIds });
  }, [schedule, choice, destination, gtfsTripIds, routeIds]);

  const live = useMemo(() => isToday ? liveByTripId(liveDepartures) : new Map<string, DepartureItem>(), [isToday, liveDepartures]);
  const opposite = schedule && direction ? oppositeDirection(schedule, direction) : null;
  const trips = direction?.trips || [];
  const nextIndex = isToday ? nextTripIndex(trips, live, nowMs) : 0;
  const pastCount = isToday ? (nextIndex < 0 ? trips.length : nextIndex) : 0;
  const visible = isToday && !showPast ? trips.slice(pastCount) : trips;
  const offset = trips.length - visible.length;
  const platforms = direction ? showsPlatforms(direction) : false;
  const liveCount = trips.filter((t) => live.get(t.tripId)?.isLive === true).length;

  function chip(label: string, active: boolean, onPress: () => void, icon?: keyof typeof Ionicons.glyphMap) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}
        style={[styles.chip, { backgroundColor: active ? STOP_BOARD_BLUE : colors.surface, borderColor: active ? STOP_BOARD_BLUE : colors.border }]}>
        {icon ? <Ionicons name={icon} size={14} color={active ? "#fff" : colors.text} /> : null}
        <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.chipText, { color: active ? "#fff" : colors.text }]}>{label}</Text>
      </Pressable>
    );
  }

  const otherDay = date !== today && date !== tomorrow;

  return (
    <View style={[styles.panel, { backgroundColor: colors.surfaceSoft, borderTopColor: colors.border }]}>
      <View style={styles.chips}>
        {chip("Vandaag", date === today, () => { setShowPast(false); onChangeDate(today); })}
        {chip("Morgen", date === tomorrow, () => onChangeDate(tomorrow))}
        {chip(otherDay ? shortDateLabel(date) : "Andere dag", otherDay, () => setCalendarOpen(true), "calendar-outline")}
      </View>

      <View style={styles.headRow}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.dateLabel, { color: colors.text }]}>{longDateLabel(date)}</Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.status, { color: liveCount ? colors.accentText : colors.textSoft }]}>{liveCount ? "Live" : "Gepland"}</Text>
      </View>

      {loading || failed ? (
        <View style={styles.fallback}>
          {fallback}
          {loading
            ? <View style={styles.loading}><ActivityIndicator size="small" color={STOP_BOARD_BLUE} /><Text maxFontSizeMultiplier={1.3} style={[styles.muted, { color: colors.textSoft }]}>Dienstregeling laden…</Text></View>
            : <Pressable onPress={() => setRetry((n) => n + 1)} accessibilityRole="button" style={styles.loading}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.muted, { color: colors.textSoft }]}>Volledige dienstregeling nu niet beschikbaar.</Text>
                <Text maxFontSizeMultiplier={1.3} style={[styles.link, { color: STOP_BOARD_BLUE }]}>Opnieuw</Text>
              </Pressable>}
        </View>
      ) : schedule && direction ? (
        <>
          <View style={styles.dirRow}>
            <View style={styles.dirText}>
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.dirName, { color: colors.heading }]}>Richting {direction.destination}</Text>
              <Text maxFontSizeMultiplier={1.3} style={[styles.muted, { color: colors.textSoft }]}>
                {direction.tripCount} {direction.tripCount === 1 ? "rit" : "ritten"}{direction.firstTime ? " · " + direction.firstTime + "–" + direction.lastTime : ""}
              </Text>
            </View>
            {opposite ? (
              <Pressable onPress={() => { setShowPast(false); setChoice({ routeId: opposite.routeId, directionId: opposite.directionId, destination: opposite.destination }); }}
                accessibilityRole="button" accessibilityLabel={"Andere richting: " + opposite.destination} hitSlop={6}
                style={[styles.swap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Ionicons name="swap-horizontal" size={18} color={STOP_BOARD_BLUE} />
              </Pressable>
            ) : null}
          </View>

          {pastCount > 0 ? (
            <Pressable onPress={() => setShowPast((v) => !v)} accessibilityRole="button" style={styles.pastToggle}>
              <Ionicons name={showPast ? "chevron-up" : "chevron-down"} size={14} color={STOP_BOARD_BLUE} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.link, { color: STOP_BOARD_BLUE }]}>
                {showPast ? "Eerdere ritten verbergen" : "Eerdere ritten tonen (" + pastCount + ")"}
              </Text>
            </Pressable>
          ) : null}

          {isToday && nextIndex < 0 ? (
            <Text maxFontSizeMultiplier={1.3} style={[styles.empty, { color: colors.textSoft }]}>Vandaag geen ritten meer in deze richting.</Text>
          ) : null}

          <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {visible.map((trip, i) => {
              const index = i + offset;
              const dep = live.get(trip.tripId);
              const delay = dep ? departureClockDelay(dep) : null;
              const cancelled = dep?.cancelled === true;
              const past = isToday && (nextIndex < 0 || index < nextIndex);
              const isNext = isToday && index === nextIndex;
              const opens = Boolean(dep?.ritId) && !past;
              const note = [trip.variant ? "naar " + trip.destination : "", platforms && trip.platform ? "perron " + trip.platform : ""].filter(Boolean).join(" · ");
              return (
                <Pressable key={trip.tripId + ":" + trip.plannedAt} disabled={!opens} onPress={() => dep && onOpenDeparture(dep)}
                  accessibilityRole={opens ? "button" : undefined}
                  accessibilityLabel={"Lijn " + line + ", " + trip.plannedTime + (note ? ", " + note : "") + (cancelled ? ", rijdt niet" : delay ? ", " + delay.text + " minuten later" : "") + (opens ? ", rit openen" : "")}
                  style={[styles.trip, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <Text maxFontSizeMultiplier={1.3}
                    style={[styles.tripTime, { color: cancelled ? colors.danger : past ? colors.textMuted : isNext ? colors.heading : colors.text },
                      cancelled && { textDecorationLine: "line-through" }]}>{trip.plannedTime}</Text>
                  {delay && !past ? <Text maxFontSizeMultiplier={1.3} style={[styles.delay, { color: delay.tone === "red" ? colors.danger : colors.delayWarning }]}>{delay.text}</Text> : null}
                  <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.note, { color: past ? colors.textMuted : colors.textSoft }]}>{note}</Text>
                  {cancelled
                    ? <Text maxFontSizeMultiplier={1.3} style={[styles.flag, { color: colors.danger }]}>Rijdt niet</Text>
                    : dep?.isLive === true && dep.liveDataStale !== true && !past
                      ? <View style={[styles.dot, { backgroundColor: colors.success }]} />
                      : null}
                  {opens ? <Ionicons name="chevron-forward" size={15} color={colors.textMuted} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : schedule ? (
        <View style={styles.emptyBox}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.empty, { color: colors.textSoft }]}>
            {!schedule.inFeed ? "Voor deze dag is nog geen dienstregeling bekend."
              : schedule.directions.length ? "Op deze dag geen ritten in deze richting."
              : "Lijn " + line + " rijdt op deze dag niet vanaf deze halte."}
          </Text>
          {schedule.directions.map((d) => (
            <Pressable key={d.key} onPress={() => setChoice({ routeId: d.routeId, directionId: d.directionId, destination: d.destination })} accessibilityRole="button">
              <Text maxFontSizeMultiplier={1.3} style={[styles.link, { color: STOP_BOARD_BLUE }]}>Toon richting {d.destination}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScheduleCalendar visible={calendarOpen} today={today} selected={date} schedule={schedule}
        onClose={() => setCalendarOpen(false)}
        onPick={(iso) => { setCalendarOpen(false); setShowPast(false); onChangeDate(iso); }} />
    </View>
  );
}

function ScheduleCalendar({ visible, today, selected, schedule, onClose, onPick }: {
  visible: boolean; today: string; selected: string; schedule: LineSchedule | null; onClose: () => void; onPick: (iso: string) => void;
}) {
  const { colors } = useApp();
  const [month, setMonth] = useState(() => selected.slice(0, 7));
  useEffect(() => { if (visible) setMonth(selected.slice(0, 7)); }, [visible, selected]);
  const [year, monthNo] = month.split("-").map(Number);
  const lastDay = [addDays(today, 62), schedule?.feedLastDate].filter(Boolean).sort()[0] as string;
  const canPrev = month > today.slice(0, 7);
  const canNext = month < lastDay.slice(0, 7);
  const shift = (n: number) => {
    const d = new Date(Date.UTC(year, monthNo - 1 + n, 1));
    setMonth(d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0"));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kalender sluiten">
        <Pressable style={[styles.calendar, { backgroundColor: colors.surface }]} onPress={() => undefined}>
          <View style={styles.calHead}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.calTitle, { color: colors.text }]}>Kies een dag</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Sluiten" style={styles.calClose}>
              <Ionicons name="close" size={22} color={colors.textSoft} />
            </Pressable>
          </View>
          <View style={styles.monthRow}>
            <Pressable disabled={!canPrev} onPress={() => shift(-1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Vorige maand" style={styles.monthBtn}>
              <Ionicons name="chevron-back" size={20} color={canPrev ? colors.text : colors.border} />
            </Pressable>
            <Text maxFontSizeMultiplier={1.3} style={[styles.monthText, { color: colors.text }]}>{monthLabel(year, monthNo)}</Text>
            <Pressable disabled={!canNext} onPress={() => shift(1)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Volgende maand" style={styles.monthBtn}>
              <Ionicons name="chevron-forward" size={20} color={canNext ? colors.text : colors.border} />
            </Pressable>
          </View>
          <View style={styles.week}>
            {WEEKDAYS.map((d) => <Text key={d} maxFontSizeMultiplier={1.2} style={[styles.weekday, { color: colors.textMuted }]}>{d}</Text>)}
          </View>
          {monthGrid(year, monthNo).map((week, w) => (
            <View key={w} style={styles.week}>
              {week.map((iso, i) => {
                if (!iso) return <View key={i} style={styles.cell} />;
                const state = dayState(iso, today, schedule);
                const active = iso === selected;
                const disabled = state === "unavailable";
                return (
                  <Pressable key={iso} disabled={disabled} onPress={() => onPick(iso)} accessibilityRole="button"
                    accessibilityLabel={longDateLabel(iso) + (state === "noService" ? ", geen ritten" : "")}
                    accessibilityState={{ selected: active, disabled }}
                    style={[styles.cell, active && { backgroundColor: STOP_BOARD_BLUE, borderRadius: 10 }]}>
                    <Text maxFontSizeMultiplier={1.2} style={[styles.cellText, {
                      color: active ? "#fff" : disabled ? colors.border : state === "noService" ? colors.textMuted : colors.text,
                      fontWeight: iso === today || active ? "900" : "600"
                    }]}>{Number(iso.slice(8))}</Text>
                    {iso === today && !active ? <View style={[styles.todayDot, { backgroundColor: STOP_BOARD_BLUE }]} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
          {schedule?.serviceDates.length ? (
            <Text maxFontSizeMultiplier={1.3} style={[styles.calHint, { color: colors.textMuted }]}>Grijze dagen: deze lijn rijdt dan niet vanaf deze halte.</Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12, gap: 9 },
  chips: { flexDirection: "row", gap: 7 },
  chip: { flex: 1, minHeight: 38, borderRadius: 9, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 6 },
  chipText: { fontSize: 12.5, fontWeight: "700" },
  headRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 2 },
  dateLabel: { fontSize: 13, fontWeight: "800" },
  status: { fontSize: 11, fontWeight: "700" },
  fallback: { gap: 8 },
  loading: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 },
  muted: { fontSize: 11 },
  link: { fontSize: 12, fontWeight: "800" },
  dirRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dirText: { flex: 1, minWidth: 0, gap: 1 },
  dirName: { fontSize: 13, fontWeight: "800" },
  swap: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pastToggle: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 30 },
  list: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, overflow: "hidden" },
  trip: { minHeight: 46, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  tripTime: { fontSize: 17, fontWeight: "800", fontVariant: ["tabular-nums"], minWidth: 52 },
  delay: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  note: { flex: 1, minWidth: 0, fontSize: 11.5 },
  flag: { fontSize: 10, fontWeight: "900" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  empty: { fontSize: 12, lineHeight: 17 },
  emptyBox: { gap: 8, paddingVertical: 4 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.42)", alignItems: "center", justifyContent: "center", padding: 18 },
  calendar: { width: "100%", maxWidth: 380, borderRadius: 18, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 16 },
  calHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  calTitle: { fontSize: 18, fontWeight: "900" },
  calClose: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  monthBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  monthText: { fontSize: 15, fontWeight: "800" },
  week: { flexDirection: "row" },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700", paddingVertical: 6 },
  cell: { flex: 1, height: 44, alignItems: "center", justifyContent: "center" },
  cellText: { fontSize: 15 },
  todayDot: { position: "absolute", bottom: 6, width: 5, height: 5, borderRadius: 3 },
  calHint: { fontSize: 11, marginTop: 8, textAlign: "center" }
});
