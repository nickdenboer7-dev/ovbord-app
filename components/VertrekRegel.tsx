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
  const trendSymbol = item.trend === "up" ? "↑" : item.trend === "down" ? "↓" : "→";
  const hasDelay = typeof item.delayMinutes === "number" && item.delayMinutes > 0;
  const carrierLabel = item.carrier && item.carrier !== "Default" ? item.carrier : "";

  return (
    <Pressable
      onPress={onPress}
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
        <Text style={[styles.time, { color: colors.text }]}>{item.plannedTime}</Text>
        <Text style={[styles.relative, { color: colors.textSoft }]} numberOfLines={1}>
          {item.relativeText}
        </Text>
      </View>

      <View style={styles.infoColumn}>
        <View style={styles.destinationRow}>
          <LijnBadge line={item.line} carrier={item.carrier} compact />
          <Text style={[styles.destination, { color: colors.text }]} numberOfLines={1}>
            {item.destination}
          </Text>
          {carrierLabel ? (
            <Text style={[styles.carrier, { color: colors.textSoft }]} numberOfLines={1}>
              {carrierLabel}
            </Text>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          {hasDelay ? (
            <View style={[styles.delayChip, { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.delayText, { color: colors.danger }]}>+{item.delayMinutes} min {trendSymbol}</Text>
            </View>
          ) : (
            <Text style={[styles.onTime, { color: colors.success }]}>Op tijd</Text>
          )}

          {item.alert ? (
            <View style={[styles.alertChip, { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.alertText, { color: colors.danger }]} numberOfLines={1}>Storing</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.platformColumn}>
        {item.platform ? (
          <View style={[styles.platformBadge, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.platformText, { color: colors.text }]}> {item.platform} </Text>
          </View>
        ) : (
          <View style={styles.platformPlaceholder} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    paddingRight: 12,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  reliabilityRail: {
    width: 4,
    alignSelf: "stretch",
    overflow: "hidden"
  },
  timeColumn: {
    width: 66,
    paddingLeft: 10,
    paddingRight: 8,
    justifyContent: "center"
  },
  time: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.45,
    fontVariant: ["tabular-nums"]
  },
  relative: {
    marginTop: 2,
    fontSize: 9.5,
    fontWeight: "600"
  },
  infoColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center"
  },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minWidth: 0
  },
  destination: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: "800"
  },
  metaRow: {
    minHeight: 18,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0
  },
  carrier: {
    maxWidth: 70,
    flexShrink: 1,
    fontSize: 9.5,
    fontWeight: "600"
  },
  delayChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  delayText: {
    fontSize: 9.5,
    fontWeight: "800"
  },
  onTime: {
    fontSize: 9.5,
    fontWeight: "800"
  },
  alertChip: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6
  },
  alertText: {
    fontSize: 9,
    fontWeight: "800"
  },
  platformColumn: {
    width: 48,
    marginLeft: 8,
    alignItems: "flex-end",
    justifyContent: "center"
  },
  platformBadge: {
    minWidth: 42,
    minHeight: 28,
    paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center"
  },
  platformText: {
    fontSize: 10.5,
    fontWeight: "900"
  },
  platformPlaceholder: {
    width: 42,
    height: 28
  }
});
