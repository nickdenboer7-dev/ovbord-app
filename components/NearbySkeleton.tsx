import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";

export function NearbySkeleton({ label = "Locatie bepalen…" }: { label?: string }) {
  const { colors } = useApp();
  return <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.wrap}>
    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 10 }}>{label}</Text>
    {Array.from({ length: 5 }, (_, i) => <View key={i} style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={[styles.name, { backgroundColor: colors.border, width: i % 2 ? "52%" : "68%" }]} />
      <View style={[styles.meta, { backgroundColor: colors.border }]} />
    </View>)}
  </View>;
}
const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 12 },
  row: { minHeight: 64, justifyContent: "center", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  name: { height: 13, borderRadius: 4 }, meta: { width: "36%", height: 9, borderRadius: 4 }
});
