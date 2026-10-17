import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import type { DepartureItem } from "../types/api";

/** Compact departure status; live timing is not a claim of confirmed GPS. */
export function DepartureStatus({ item }: { item: DepartureItem }) {
  const { colors } = useApp();
  if (item.cancelled === true) {
    return <View style={styles.row} accessibilityLabel="Deze rit rijdt niet">
      <View style={[styles.dot, { backgroundColor: colors.danger }]} />
      <Text style={[styles.label, { color: colors.danger }]}>Rijdt niet</Text>
    </View>;
  }
  if (item.departed === true) {
    return <View style={styles.row} accessibilityLabel="Deze rit is vertrokken">
      <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
      <Text style={[styles.label, { color: colors.textMuted }]}>Vertrokken</Text>
    </View>;
  }
  if (item.liveDataStale === true) {
    return <View style={styles.row} accessibilityLabel="Realtime informatie voor deze rit is verouderd">
      <View style={[styles.dot, { backgroundColor: colors.warning }]} />
      <Text style={[styles.label, { color: colors.warning }]}>Live-info oud</Text>
    </View>;
  }
  const estimated = item.reliabilityDetail?.estimatedPosition === true ||
    (item.isLive === undefined && Boolean(item.expectedTime && item.expectedTime !== item.plannedTime));
  const label = estimated ? "Geschat" : item.isLive === true ? "Live" : "Gepland";
  const color = estimated ? colors.warning : item.isLive === true ? colors.success : colors.textMuted;
  return <View style={styles.row}>
    <View style={[styles.dot, { backgroundColor: color }]} />
    <Text style={[styles.label, { color }]}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 10.5, fontWeight: "700" }
});
