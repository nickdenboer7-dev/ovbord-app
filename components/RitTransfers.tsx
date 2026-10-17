import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import { MAX_TRANSFER_WAIT_MINUTES, transferOptions, transferSummary } from "../lib/alighting";
import { departurePresentation } from "../lib/departurePresentation";
import { failureKind } from "../lib/offline";
import type { FailureKind } from "../lib/offline";
import { ritColors } from "../lib/ritTheme";
import type { RitColors } from "../lib/ritTheme";
import { loadJourneyStopBoard } from "../lib/stopBoardLookup";
import { useSmartRefresh } from "../lib/useSmartRefresh";
import type { DepartureItem, HalteBoardData, JourneyStop, StopSummary } from "../types/api";
import { LijnBadge } from "./LijnBadge";

function stopShort(name: string): string {
  const words = String(name || "").split(", ");
  return words.length === 2 && words[0].length <= 30 ? words[1] : name;
}

/**
 * Connections at the stop where the user gets off: other lines leaving after the
 * expected arrival (within 30 min), with the transfer time and "Te krap" below
 * 2 minutes. Collapsed it is a single line, so the trip itself stays in view.
 */
export function RitTransfers({ stop, arrivalClock, tripId, line, destination, expanded, onToggle, onOpenTrip, onOpenBoard }: {
  stop: JourneyStop;
  arrivalClock: string;
  tripId: string;
  line: string;
  destination: string;
  expanded: boolean;
  onToggle: () => void;
  onOpenTrip: (item: DepartureItem, boardStop: StopSummary) => void;
  onOpenBoard: () => void;
}) {
  const { resolvedScheme } = useApp();
  const scheme = resolvedScheme === "dark" ? "dark" : "light";
  const c = ritColors[scheme];
  const styles = TRANSFER_STYLES[scheme];
  const [board, setBoard] = useState<HalteBoardData | null>(null);
  const [failure, setFailure] = useState<FailureKind | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const request = useRef(0);
  const key = stop.id + "|" + stop.name;

  const load = useCallback(async () => {
    const sequence = ++request.current;
    try {
      const result = await loadJourneyStopBoard(stopRef.current);
      if (sequence !== request.current) return;
      setBoard(result);
      setFailure(null);
    } catch (error) {
      if (sequence === request.current) setFailure(failureKind(error));
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setBoard(null);
    setFailure(null);
    setLoading(true);
    void load();
  }, [key, load]);
  useSmartRefresh(load, failure ? 20000 : 60000, "transfers:" + key, true);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const options = board ? transferOptions(board.departures, { arrivalClock, tripId, line, destination }, nowMs) : [];
  const status = loading && !board ? "Vertrektijden laden…"
    : !board ? (failure === "offline" ? "Geen internet · overstappen niet geladen" : "Overstapinformatie niet beschikbaar")
    : options.length ? "" : "Geen aansluitingen binnen " + MAX_TRANSFER_WAIT_MINUTES + " min na je aankomst";
  const name = stopShort(stop.name);
  const summary = options.length ? transferSummary(options, departurePresentation(options[0].item, nowMs).clock) : status;

  return (
    <View style={styles.card}>
      {/* The title gets the full width (long stop names wrap); the board link sits at the bottom. */}
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }}
        accessibilityLabel={"Overstappen op " + name + (summary ? ", " + summary : "") + (expanded ? ", inklappen" : ", uitklappen")}
        style={styles.head}>
        <Ionicons name="swap-horizontal" size={19} color={c.green} />
        <View style={styles.headBody}>
          <Text style={styles.title} numberOfLines={2}>Overstappen op {name}</Text>
          {!expanded && summary ? <Text style={styles.summary} numberOfLines={1}>{summary}</Text> : null}
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={17} color={c.muted} />
      </Pressable>
      {expanded ? <>
      {options.map(({ item, marginMinutes, tight }, index) => {
        const { cancelled, clock } = departurePresentation(item, nowMs);
        const delayed = !cancelled && typeof item.delayMinutes === "number" && item.delayMinutes >= 1;
        const transfer = marginMinutes <= 0 ? "direct bij aankomst" : marginMinutes + " min overstaptijd";
        const platform = item.platform ? (item.mode === "train" ? "Spoor " : "Perron ") + item.platform : "";
        return (
          <Pressable key={item.id + ":" + index} onPress={() => item.ritId && board ? onOpenTrip(item, board.stop) : onOpenBoard()}
            accessibilityRole="button"
            accessibilityLabel={"Lijn " + item.line + " naar " + item.destination + ", " + clock + ", " +
              (cancelled ? "rijdt niet" : transfer + (tight ? ", te krap" : "")) + (item.ritId ? ", rit openen" : ", vertrekbord openen")}
            style={[styles.row, (tight || cancelled) && styles.rowDim]}>
            <LijnBadge line={item.line} carrier={item.carrier} compact tone="flow" />
            <View style={styles.rowBody}>
              <Text style={styles.destination} numberOfLines={1}>{item.destination}</Text>
              <Text style={styles.sub} numberOfLines={1}>
                <Text style={[styles.clock, cancelled && styles.struck]}>{clock}</Text>
                {delayed ? <Text style={styles.delay}> +{item.delayMinutes}</Text> : null}
                {cancelled ? "" : " · " + transfer}{platform ? " · " + platform : ""}
              </Text>
            </View>
            {cancelled ? <Text style={styles.tag}>Rijdt niet</Text> : tight ? <Text style={styles.tag}>Te krap</Text> : null}
          </Pressable>
        );
      })}
      {status ? <Text style={styles.status}>{status}</Text> : null}
      {failure && board ? <Text style={styles.status}>Laatst bekende vertrektijden · worden niet meer gecontroleerd</Text> : null}
      <Pressable onPress={onOpenBoard} accessibilityRole="button" accessibilityLabel={"Alle vertrekken bij " + name} style={styles.linkRow}>
        <Text style={styles.link} numberOfLines={1}>Alle vertrekken bij {name}</Text>
        <Ionicons name="chevron-forward" size={15} color={c.green} />
      </Pressable>
      </> : null}
    </View>
  );
}

function makeStyles(c: RitColors) {
  return StyleSheet.create({
    card: { marginHorizontal: 12, marginTop: 10, marginBottom: 12, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12,
      backgroundColor: c.stageNeutralBg, gap: 8 },
    head: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 34 },
    headBody: { flex: 1, minWidth: 0 },
    title: { color: c.text, fontSize: 13.5, fontWeight: "800" },
    summary: { color: c.muted, fontSize: 11.5, fontWeight: "700", marginTop: 2 },
    link: { flexShrink: 1, color: c.green, fontSize: 12, fontWeight: "800" },
    linkRow: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 6 },
    row: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, paddingTop: 8 },
    rowDim: { opacity: 0.75 },
    rowBody: { flex: 1, minWidth: 0 },
    destination: { color: c.text, fontSize: 12.5, fontWeight: "800" },
    sub: { color: c.muted, fontSize: 11, fontWeight: "600", marginTop: 2 },
    clock: { color: c.text, fontWeight: "900", fontVariant: ["tabular-nums"] },
    delay: { color: c.red, fontWeight: "800" },
    struck: { textDecorationLine: "line-through", color: c.red },
    tag: { backgroundColor: c.cancelBg, color: c.red, fontSize: 10, fontWeight: "900", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
    status: { color: c.muted, fontSize: 11.5 }
  });
}

const TRANSFER_STYLES = { light: makeStyles(ritColors.light), dark: makeStyles(ritColors.dark) };
