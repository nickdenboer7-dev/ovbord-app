import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import { DepartureItem } from "../types/api";
import { BetrouwbaarheidsBar } from "./BetrouwbaarheidsBar";
import { LijnBadge } from "./LijnBadge";

type Props = {
  item: DepartureItem;
  onPress?: () => void;
};

export function VertrekRegel({ item, onPress }: Props) {
  const { colors } = useApp();
  const hasDelay = typeof item.delayMinutes === "number" && item.delayMinutes >= 1;
  const carrierLabel = item.carrier && item.carrier !== "Default" ? item.carrier : "";
  const plannedOnly = item.isLive === false;

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
          borderBottomColor: colors.border
        }
      ]}
    >
      <View style={styles.reliabilityRail}>
        <BetrouwbaarheidsBar reliability={item.reliability} />
      </View>

      <View style={styles.timeColumn}>
        <Text style={[styles.time, { color: hasDelay ? colors.danger : colors.text }]}>{item.plannedTime}</Text>
        {hasDelay ? (
          <Text style={[styles.delay, { color: colors.danger }]}>+{item.delayMinutes} min</Text>
        ) : item.relativeText ? (
          <Text style={[styles.relative, { color: colors.textSoft }]}>{item.relativeText}</Text>
        ) : null}
      </View>

      <View style={styles.infoColumn}>
        <View style={styles.topRow}>
          <LijnBadge line={item.line} carrier={item.carrier} compact />
          <Text style={[styles.destination, { color: colors.text }]} numberOfLines={2} ellipsizeMode="tail">
            {item.destination}
          </Text>
        </View>

        <View style={styles.metaRow}>
          {carrierLabel ? <Text style={[styles.carrier, { color: colors.textSoft }]}>{carrierLabel}</Text> : null}

          {plannedOnly ? (
            <Text style={[styles.planned, { color: colors.textMuted }]}>Dienstregeling</Text>
          ) : item.isLive ? (
            <View style={styles.liveWrap}>
              <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.liveText, { color: colors.success }]}>Live</Text>
            </View>
          ) : null}

          {item.alert ? <Text style={[styles.alertText, { color: colors.danger }]}>Storing</Text> : null}
        </View>
      </View>

      <View style={styles.rightColumn}>
        {item.platform ? (
          <View style={[styles.platformBadge, { backgroundColor: colors.surfaceAlt }]}> 
            <Text style={[styles.platformText, { color: colors.text }]} numberOfLines={1}>{item.platform}</Text>
          </View>
        ) : null}
        {onPress ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 8,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  reliabilityRail: { width: 3, alignSelf: "stretch", marginRight: 10 },
  timeColumn: { width: 58, paddingRight: 7, justifyContent: "center" },
  time: {
    fontSize: 16.5,
    lineHeight: 18,
    fontWeight: "900",
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"]
  },
  relative: { marginTop: 2, fontSize: 9.5, lineHeight: 11, fontWeight: "700" },
  delay: { marginTop: 2, fontSize: 10, lineHeight: 11, fontWeight: "900" },

  infoColumn: { flex: 1, minWidth: 0, justifyContent: "center" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0 },
  destination: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 15.5, fontWeight: "900" },
  metaRow: { minHeight: 16, marginTop: 3, flexDirection: "row", alignItems: "center", gap: 6 },
  carrier: { fontSize: 10, fontWeight: "800" },
  planned: { fontSize: 9.5, fontWeight: "800" },
  liveWrap: { flexDirection: "row", alignItems: "center", gap: 3 },
  liveDot: { width: 5, height: 5, borderRadius: 99 },
  liveText: { fontSize: 9.5, fontWeight: "900" },
  alertText: { fontSize: 9.5, fontWeight: "900" },

  rightColumn: {
    minWidth: 52,
    marginLeft: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4
  },
  platformBadge: {
    minWidth: 31,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  platformText: { fontSize: 11, fontWeight: "900" }
});
