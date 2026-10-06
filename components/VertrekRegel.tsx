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

function platformLabel(item: DepartureItem) {
  if (item.mode === "train") return "Spoor";
  if (item.mode === "ferry") return "Steiger";
  if (item.mode === "tram" || item.mode === "metro") return "Halte";
  return "Perron";
}

export function VertrekRegel({ item, onPress }: Props) {
  const { colors } = useApp();
  const trendSymbol = item.trend === "up" ? "↑" : item.trend === "down" ? "↓" : "→";
  const hasDelay = typeof item.delayMinutes === "number" && item.delayMinutes > 0;
  const carrierLabel = item.carrier && item.carrier !== "Default" ? item.carrier : "";
  const plannedOnly = item.isLive === false;

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
          opacity: pressed ? 0.72 : 1
        }
      ]}
    >
      <View style={styles.reliabilityRail}>
        <BetrouwbaarheidsBar reliability={item.reliability} />
      </View>

      <View style={styles.timeColumn}>
        <Text style={[styles.time, { color: colors.text }]} numberOfLines={1}>
          {item.plannedTime}
        </Text>
        {item.relativeText ? (
          <Text style={[styles.relative, { color: colors.textSoft }]} numberOfLines={1}>
            {item.relativeText}
          </Text>
        ) : null}
      </View>

      <View style={styles.infoColumn}>
        <View style={styles.topRow}>
          <LijnBadge line={item.line} carrier={item.carrier} compact />
          <Text style={[styles.destination, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
            {item.destination}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          {carrierLabel ? (
            <Text style={[styles.carrier, { color: colors.textSoft }]} numberOfLines={1}>
              {carrierLabel}
            </Text>
          ) : null}

          {plannedOnly ? (
            <View style={[styles.statusChip, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.statusText, { color: colors.textSoft }]}>Dienstregeling</Text>
            </View>
          ) : hasDelay ? (
            <View style={[styles.statusChip, { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.statusText, { color: colors.danger }]}>+{item.delayMinutes} min {trendSymbol}</Text>
            </View>
          ) : item.isLive ? (
            <View style={[styles.statusChip, { backgroundColor: colors.successSoft }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.statusText, { color: colors.success }]}>Live</Text>
            </View>
          ) : (
            <Text style={[styles.onTime, { color: colors.success }]}>Op tijd</Text>
          )}

          {item.alert ? (
            <View style={[styles.statusChip, { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.statusText, { color: colors.danger }]}>Storing</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.rightColumn}>
        {item.platform ? (
          <View style={styles.platformWrap}>
            <Text style={[styles.platformLabel, { color: colors.textMuted }]}>{platformLabel(item)}</Text>
            <View style={[styles.platformBadge, { backgroundColor: colors.surfaceAlt }]}>
              <Text style={[styles.platformText, { color: colors.text }]} numberOfLines={1}>{item.platform}</Text>
            </View>
          </View>
        ) : null}
        {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 11,
    paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  reliabilityRail: {
    width: 4,
    alignSelf: "stretch",
    marginRight: 11
  },
  timeColumn: {
    width: 62,
    paddingRight: 8,
    justifyContent: "center",
    gap: 4
  },
  time: {
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 19,
    letterSpacing: -0.25,
    fontVariant: ["tabular-nums"]
  },
  relative: {
    fontSize: 10.5,
    lineHeight: 12,
    fontWeight: "700"
  },
  infoColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 6
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0
  },
  destination: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "800"
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    flexWrap: "wrap"
  },
  carrier: {
    maxWidth: 78,
    fontSize: 10.5,
    fontWeight: "700"
  },
  statusChip: {
    minHeight: 20,
    paddingHorizontal: 7,
    borderRadius: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: "900"
  },
  liveDot: { width: 6, height: 6, borderRadius: 99 },
  onTime: {
    fontSize: 10,
    fontWeight: "800"
  },
  rightColumn: {
    width: 62,
    marginLeft: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4
  },
  platformWrap: { alignItems: "flex-end", gap: 3 },
  platformLabel: { fontSize: 8.5, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.3 },
  platformBadge: {
    minWidth: 34,
    minHeight: 24,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  platformText: {
    fontSize: 11,
    fontWeight: "900"
  }
});
