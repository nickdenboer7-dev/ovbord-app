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

function compactRelativeText(value?: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^nu$/i.test(text)) return "nu";
  const match = text.match(/(?:over\s*)?(\d+)\s*min/i);
  return match ? `${match[1]} min` : text;
}

export function VertrekRegel({ item, onPress }: Props) {
  const { colors } = useApp();
  const hasDelay = typeof item.delayMinutes === "number" && item.delayMinutes >= 1;
  const carrierLabel = item.carrier && item.carrier !== "Default" ? item.carrier : "";
  const relativeText = compactRelativeText(item.relativeText);

  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.72 : 1
        }
      ]}
    >
      <View style={styles.reliabilityRail}>
        <BetrouwbaarheidsBar reliability={item.reliability} />
      </View>

      <View style={styles.timeColumn}>
        <Text style={[styles.time, { color: colors.text }]}>{item.plannedTime}</Text>
        {relativeText ? (
          <Text style={[styles.relative, { color: colors.textSoft }]} numberOfLines={1}>
            {relativeText}
          </Text>
        ) : null}
      </View>

      <View style={styles.infoColumn}>
        <View style={styles.topRow}>
          <LijnBadge line={item.line} carrier={item.carrier} compact />
          <Text style={[styles.destination, { color: colors.text }]} numberOfLines={2}>
            {item.destination}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          {carrierLabel ? (
            <Text style={[styles.carrier, { color: colors.textSoft }]} numberOfLines={1}>
              {carrierLabel}
            </Text>
          ) : null}

          {item.isLive ? (
            <View style={styles.liveMeta}>
              <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
              <Text style={[styles.statusText, { color: colors.success }]}>Live</Text>
            </View>
          ) : item.isLive === false ? (
            <Text style={[styles.plannedText, { color: colors.textSoft }]}>Dienstregeling</Text>
          ) : null}

          {hasDelay ? (
            <Text style={[styles.delayText, { color: colors.danger }]}>+{item.delayMinutes} min</Text>
          ) : null}

          {item.alert ? (
            <Text style={[styles.delayText, { color: colors.danger }]}>Storing</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rightColumn}>
        {item.platform ? (
          <View style={[styles.platformBadge, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.platformSmall, { color: colors.textMuted }]}>{platformLabel(item)}</Text>
            <Text style={[styles.platformText, { color: colors.text }]}>{item.platform}</Text>
          </View>
        ) : null}
        {onPress ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "stretch",
    paddingVertical: 8,
    paddingRight: 8,
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 7,
    overflow: "hidden"
  },
  reliabilityRail: { width: 4, alignSelf: "stretch", marginRight: 9 },
  timeColumn: { width: 57, paddingRight: 6, justifyContent: "center", gap: 2 },
  time: {
    fontSize: 16.5,
    fontWeight: "900",
    lineHeight: 18,
    letterSpacing: -0.25,
    fontVariant: ["tabular-nums"]
  },
  relative: { fontSize: 9.5, lineHeight: 11, fontWeight: "700" },
  infoColumn: { flex: 1, minWidth: 0, justifyContent: "center", gap: 4 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  destination: { flex: 1, minWidth: 0, fontSize: 13.2, lineHeight: 16, fontWeight: "900" },
  bottomRow: { minHeight: 16, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  carrier: { maxWidth: 72, fontSize: 10, fontWeight: "700" },
  liveMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 99 },
  statusText: { fontSize: 9.5, fontWeight: "900" },
  plannedText: { fontSize: 9.5, fontWeight: "700" },
  delayText: { fontSize: 9.5, fontWeight: "900" },
  rightColumn: {
    minWidth: 48,
    marginLeft: 5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3
  },
  platformBadge: {
    minWidth: 38,
    minHeight: 36,
    paddingHorizontal: 6,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center"
  },
  platformSmall: { fontSize: 7.5, lineHeight: 9, fontWeight: "800", textTransform: "uppercase" },
  platformText: { fontSize: 11.5, lineHeight: 13, fontWeight: "900" }
});
