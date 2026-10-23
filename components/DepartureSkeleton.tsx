import React from "react";
import { StyleSheet, View } from "react-native";
import { useApp } from "../context/AppProvider";

const SKELETON_ROWS = 6;
export const DEPARTURE_ROW_HEIGHT = 66;

/** Static placeholders: no spinner, no calls, no layout jump when departures arrive. */
export function DepartureSkeleton() {
  const { colors } = useApp();
  const shade = colors.surfaceAlt;
  return (
    <View accessibilityLabel="Vertrektijden laden" accessibilityRole="progressbar">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <View key={index} style={[styles.row, { borderBottomColor: colors.border }]}>
          <View style={[styles.number, { backgroundColor: shade }]} />
          <View style={styles.center}>
            <View style={[styles.destination, { backgroundColor: shade }]} />
            <View style={[styles.status, { backgroundColor: shade }]} />
          </View>
          <View style={[styles.time, { backgroundColor: shade }]} />
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { minHeight: DEPARTURE_ROW_HEIGHT, height: DEPARTURE_ROW_HEIGHT,
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  number: { width: 40, height: 30, borderRadius: 5 },
  center: { flex: 1, gap: 7 },
  destination: { width: "75%", height: 15, borderRadius: 4 },
  status: { width: "50%", height: 10, borderRadius: 3 },
  time: { width: 59, height: 20, borderRadius: 4 }
});
