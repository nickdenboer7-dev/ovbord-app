import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import { DepartureItem } from "../types/api";
import { BetrouwbaarheidsBar } from "./BetrouwbaarheidsBar";
import { LijnBadge } from "./LijnBadge";
import { StoppingBadge } from "./StoppingBadge";

type Props = { item: DepartureItem; compactItems?: DepartureItem[]; onPress?: () => void };

export function VertrekRegel({ item, compactItems = [], onPress }: Props) {
  const { colors } = useApp();
  const trendSymbol = item.trend === "up" ? "↑" : item.trend === "down" ? "↓" : "→";
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.cardShadow }]}>
      <BetrouwbaarheidsBar reliability={item.reliability} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.leftArea}>
            <LijnBadge line={item.line} carrier={item.carrier} />
            <View style={styles.destinationArea}>
              <Text style={[styles.destination, { color: colors.text }]} numberOfLines={1}>{item.destination}</Text>
              <View style={styles.metaRow}>
                <Text style={[styles.metaText, { color: colors.textSoft }]}>{item.plannedTime}</Text>
                <Text style={[styles.metaText, { color: colors.textSoft }]}>{item.relativeText}</Text>
                <Text style={[styles.metaText, { color: colors.textSoft }]}>{trendSymbol}</Text>
              </View>
            </View>
          </View>
          <View style={styles.rightArea}>
            {item.platform ? <Text style={[styles.platform, { color: colors.textSoft }]}>{item.platform}</Text> : null}
            {item.delayMinutes ? <Text style={[styles.delay, { color: colors.danger }]}>+{item.delayMinutes} min</Text> : <Text style={[styles.delay, { color: colors.textSoft }]}>Op tijd</Text>}
          </View>
        </View>
        <StoppingBadge text={item.alert} />
        {compactItems.length > 0 ? (
          <View style={[styles.compactBlock, { borderTopColor: colors.border }]}> 
            {compactItems.map((compact) => (
              <View key={compact.id} style={styles.compactRow}>
                <LijnBadge line={compact.line} carrier={compact.carrier} compact />
                <Text style={[styles.compactDestination, { color: colors.text }]} numberOfLines={1}>{compact.destination}</Text>
                <Text style={[styles.compactTime, { color: colors.textSoft }]}>{compact.plannedTime}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 14, flexDirection: "row", gap: 12, shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  content: { flex: 1, gap: 10 },
  topRow: { flexDirection: "row", gap: 12 },
  leftArea: { flexDirection: "row", gap: 12, flex: 1 },
  destinationArea: { flex: 1, gap: 4 },
  destination: { fontSize: 17, fontWeight: "800" },
  metaRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  metaText: { fontSize: 13, fontWeight: "500" },
  rightArea: { alignItems: "flex-end", justifyContent: "space-between" },
  platform: { fontSize: 13, fontWeight: "700" },
  delay: { fontSize: 13, fontWeight: "800" },
  compactBlock: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  compactRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  compactDestination: { flex: 1, fontSize: 13, fontWeight: "600" },
  compactTime: { fontSize: 12, fontWeight: "600" }
});
