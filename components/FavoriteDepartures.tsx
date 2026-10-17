import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import type { FavoriteBoard } from "../context/FavoritesLive";
import { departurePresentation } from "../lib/departurePresentation";
import { staleCountdown } from "../lib/offline";
import type { DepartureItem } from "../types/api";

/** Clock, countdown and delay of one departure; a stale countdown becomes "± N min". */
export function departureTimeLabel(item: DepartureItem, nowMs: number, stale: boolean) {
  const { cancelled, clock, countdown } = departurePresentation(item, nowMs);
  return {
    cancelled, clock,
    countdown: cancelled ? "" : stale ? staleCountdown(countdown) : countdown,
    delayed: !cancelled && typeof item.delayMinutes === "number" && item.delayMinutes >= 1
  };
}

/** Status line for a favourite whose departures cannot be shown (yet). */
export function favoriteStatusText(entry: FavoriteBoard | undefined, rowsShown: boolean): string {
  if (rowsShown) return "";
  if (!entry || (!entry.board && !entry.failure)) return "Vertrektijden laden…";
  if (!entry.board) return entry.failure === "offline" ? "Geen internet · vertrektijden niet geladen" : "Vertrektijden niet beschikbaar";
  return "Geen vertrekken in de komende tijd";
}

export function departureAccessibilityLabel(item: DepartureItem, time: ReturnType<typeof departureTimeLabel>): string {
  return "Lijn " + item.line + " naar " + item.destination + ", " + time.clock +
    (time.cancelled ? ", rijdt niet" : time.countdown ? ", " + time.countdown : "") + (item.ritId ? ", rit openen" : ", vertrekbord openen");
}

/** Next departures of a saved trip as tappable chips; the first one shows its countdown. */
export function DepartureChips({ rows, stale, nowMs, onOpen }: {
  rows: readonly DepartureItem[];
  stale: boolean;
  nowMs: number;
  onOpen: (item: DepartureItem) => void;
}) {
  const { colors } = useApp();
  return (
    <View style={styles.chips}>
      {rows.map((item, index) => {
        const time = departureTimeLabel(item, nowMs, stale);
        const first = index === 0 && Boolean(time.countdown);
        return (
          <Pressable key={item.id + ":" + index} onPress={() => onOpen(item)}
            accessibilityRole="button" accessibilityLabel={departureAccessibilityLabel(item, time)}
            style={[styles.chip, { borderColor: time.cancelled ? colors.danger : colors.border,
              backgroundColor: time.cancelled ? colors.dangerSoft : colors.surfaceSoft }]}>
            <Text style={[styles.chipMain, { color: time.cancelled ? colors.danger : first && stale ? colors.textMuted : colors.text },
              time.cancelled && styles.struck]}>{first ? time.countdown : time.clock}</Text>
            {first ? <Text style={[styles.chipSub, { color: colors.textSoft }]}>{time.clock}</Text> : null}
            {time.delayed ? <Text style={[styles.chipSub, { color: colors.danger }]}>+{item.delayMinutes}</Text> : null}
            {time.cancelled ? <Text style={[styles.chipSub, { color: colors.danger }]}>Rijdt niet</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  chipMain: { fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
  chipSub: { fontSize: 10.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
  struck: { textDecorationLine: "line-through" }
});
