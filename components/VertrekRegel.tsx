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
        <Text style={[styles.time, { color: colors.text }]} numberOfLines={1} ellipsizeMode="clip">
          {item.plannedTime}
        </Text>
        <Text
          style={[styles.relative, { color: colors.textSoft }]}
          numberOfLines={1}
          ellipsizeMode="clip"
          adjustsFontSizeToFit
          minimumFontScale={0.9}
        >
          {item.relativeText}
        </Text>
      </View>

      <View style={styles.infoColumn}>
        <View style={styles.topRow}>
          <LijnBadge line={item.line} carrier={item.carrier} compact />
          <Text style={[styles.destination, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
            {item.destination}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text style={[styles.carrier, { color: colors.textMuted || colors.textSoft }]} numberOfLines={1}>
            {carrierLabel || " "}
          </Text>

          {hasDelay ? (
            <View style={[styles.delayChip, { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.delayText, { color: colors.danger }]} numberOfLines={1}>
                +{item.delayMinutes} min {trendSymbol}
              </Text>
            </View>
          ) : (
            <Text style={[styles.onTime, { color: colors.success }]} numberOfLines={1}>
              Op tijd
            </Text>
          )}

          {item.alert ? (
            <View style={[styles.alertChip, { backgroundColor: colors.dangerSoft }]}>
              <Text style={[styles.alertText, { color: colors.danger }]} numberOfLines={1}>
                Storing
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.platformColumn}>
        {item.platform ? (
          <View style={[styles.platformBadge, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.platformText, { color: colors.text }]} numberOfLines={1}>
              {item.platform}
            </Text>
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
    minHeight: 60,
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 10,
    paddingRight: 10,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  reliabilityRail: {
    width: 4,
    alignSelf: "stretch",
    marginRight: 10,
    overflow: "visible"
  },
  timeColumn: {
    width: 64,
    paddingRight: 8,
    justifyContent: "center",
    gap: 4
  },
  time: {
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 18,
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
    flexWrap: "nowrap"
  },
  relative: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600"
  },
  infoColumn: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 4
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0
  },
  destination: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: "800"
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0
  },
  carrier: {
    flexShrink: 1,
    maxWidth: 74,
    fontSize: 11,
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
    fontSize: 10,
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
    minHeight: 24,
    paddingHorizontal: 6,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  platformText: {
    fontSize: 10.5,
    fontWeight: "900"
  },
  platformPlaceholder: {
    width: 42,
    height: 24
  }
});
