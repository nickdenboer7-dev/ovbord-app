import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import type { JourneyStop, RitData } from "../types/api";

type Props = {
  journey: RitData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onStopPress: (stop: JourneyStop) => void;
};

export function InlineJourney({ journey, loading, error, onRetry, onStopPress }: Props) {
  const { colors } = useApp();
  const [showAll, setShowAll] = useState(false);
  const stops = journey?.stops || [];
  const activeIndex = useMemo(() => stops.findIndex((stop) => stop.state === "current"), [stops]);
  const clipped = !showAll && stops.length > 7;
  const start = clipped && activeIndex >= 0 ? Math.max(0, activeIndex - 2) : 0;
  const end = clipped ? Math.min(stops.length, start + 7) : stops.length;
  const shownStops = stops.slice(start, end);

  return (
    <View style={[styles.box, { backgroundColor: colors.surfaceSoft, borderBottomColor: colors.border }]}>
      <View style={styles.top}>
        <View style={styles.topText}>
          <Text style={[styles.heading, { color: colors.text }]}>Ritverloop · lijn {journey?.line || ""}</Text>
          <Text style={[styles.subheading, { color: colors.textSoft }]}>
            {loading ? "Ritinformatie laden…" : journey ? `${stops.length} haltes · tik op een halte` : "Ritinformatie"}
          </Text>
        </View>
        <Ionicons name="git-branch-outline" size={18} color={colors.accent} />
      </View>
      {loading && !journey ? <ActivityIndicator size="small" color={colors.accent} style={styles.spinner} /> : null}
      {error ? (
        <Pressable onPress={onRetry} style={styles.retry}>
          <Ionicons name="refresh" size={16} color={colors.accent} />
          <Text style={{ color: colors.textSoft, fontSize: 12 }}>{error} · probeer opnieuw</Text>
        </Pressable>
      ) : null}
      {start > 0 ? <Text style={[styles.moreLabel, { color: colors.textSoft }]}>{start} eerdere haltes</Text> : null}
      {shownStops.map((stop, i) => {
        const index = i + start;
        const current = stop.state === "current";
        const passed = stop.state === "passed";
        const endOfLine = index === stops.length - 1;
        const showDelay = typeof stop.delayMinutes === "number" && stop.delayMinutes >= 1;
        return (
          <Pressable
            key={`${stop.id}-${index}`}
            onPress={() => onStopPress(stop)}
            accessibilityRole="button"
            accessibilityLabel={`Bekijk halte ${stop.name}`}
            style={({ pressed }) => [
              styles.stop,
              current && { backgroundColor: colors.accentSoft },
              pressed && { opacity: 0.65 }
            ]}
          >
            <Text style={[styles.stopTime, { color: passed ? colors.textMuted : colors.textSoft }]}>
              {stop.actualTime || stop.plannedTime}
            </Text>
            <View style={styles.railWrap}>
              <View style={[styles.dot, {
                backgroundColor: current ? colors.accent : colors.surfaceSoft,
                borderColor: current || endOfLine ? colors.accent : colors.textMuted
              }]} />
              {!endOfLine ? <View style={[styles.rail, { backgroundColor: colors.border }]} /> : null}
            </View>
            <Text style={[styles.stopName, { color: passed ? colors.textSoft : colors.text }, current && styles.currentName]} numberOfLines={2}>
              {stop.name}
            </Text>
            {current ? <Text style={[styles.now, { color: colors.accent }]}>Nu</Text> : null}
            {showDelay ? <Text style={[styles.delay, { color: colors.danger }]}>+{stop.delayMinutes}</Text> : null}
            <Ionicons name="chevron-forward" size={15} color={colors.textMuted} />
          </Pressable>
        );
      })}
      {end < stops.length ? <Text style={[styles.moreLabel, { color: colors.textSoft }]}>{stops.length - end} volgende haltes</Text> : null}
      {stops.length > 7 ? (
        <Pressable
          onPress={() => setShowAll((prev) => !prev)}
          style={[styles.allButton, { backgroundColor: colors.accentSoft }]}
        >
          <Text style={[styles.allButtonText, { color: colors.accent }]}>
            {showAll ? "Toon minder haltes" : `Bekijk alle ${stops.length} haltes`}
          </Text>
          <Ionicons name={showAll ? "chevron-up" : "chevron-down"} size={17} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { paddingHorizontal: 13, paddingTop: 13, paddingBottom: 14, borderBottomWidth: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: 11 },
  topText: { flex: 1 },
  heading: { fontSize: 14, fontWeight: "800" },
  subheading: { marginTop: 3, fontSize: 11.5 },
  spinner: { padding: 16 },
  retry: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 9 },
  moreLabel: { fontSize: 11, textAlign: "center", paddingVertical: 6 },
  stop: { minHeight: 41, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  stopTime: { width: 43, fontSize: 11.5, fontVariant: ["tabular-nums"] },
  railWrap: { width: 14, alignSelf: "stretch", alignItems: "center", paddingTop: 6 },
  dot: { width: 10, height: 10, borderRadius: 6, borderWidth: 2, zIndex: 1 },
  rail: { width: 2, flex: 1, minHeight: 18 },
  stopName: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 17, fontWeight: "600" },
  currentName: { fontWeight: "800" },
  now: { fontSize: 11, fontWeight: "800" },
  delay: { fontSize: 11, fontWeight: "800" },
  allButton: { marginTop: 11, height: 38, borderRadius: 10, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 },
  allButtonText: { fontSize: 12, fontWeight: "800" }
});
