import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LijnBadge } from "../../components/LijnBadge";
import { useApp } from "../../context/AppProvider";
import { getRit } from "../../lib/api";
import { JourneyStop, RitData } from "../../types/api";

function modeIcon(mode: RitData["mode"]): keyof typeof Ionicons.glyphMap {
  if (mode === "train") return "train-outline";
  if (mode === "metro") return "subway-outline";
  if (mode === "tram") return "subway-outline";
  if (mode === "ferry") return "boat-outline";
  return "bus-outline";
}

function stopStatus(stop: JourneyStop) {
  if (stop.state === "current") return "Nu hier";
  if (typeof stop.delayMinutes === "number" && stop.delayMinutes >= 1) return `+${stop.delayMinutes} min`;
  return "";
}

export default function RitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, toggleFavoriteLine, favoriteLines } = useApp();
  const [data, setData] = useState<RitData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    let active = true;

    const load = async (showLoader = false) => {
      try {
        if (showLoader) setLoading(true);
        const result = await getRit(id);
        if (active) setData(result);
      } catch (error) {
        console.error("Rit laden mislukt", error);
      } finally {
        if (active && showLoader) setLoading(false);
      }
    };

    void load(true);
    const timer = setInterval(() => void load(false), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);

  const activeIndex = useMemo(() => {
    if (!data) return -1;
    return data.stops.findIndex((stop) => stop.state === "current");
  }, [data]);

  const nextStop = useMemo(() => {
    if (!data?.stops.length) return undefined;
    if (activeIndex >= 0) return data.stops[activeIndex + 1] || data.stops[activeIndex];
    return data.stops.find((stop) => stop.state === "upcoming" || stop.state === "end") || data.stops[0];
  }, [data, activeIndex]);

  if (loading || !data) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  const isFavoriteLine = favoriteLines.includes(data.line);
  const isLive = data.live === true || Boolean(data.vehicle);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>

        <View style={styles.headerMain}>
          <View style={styles.headerLine}>
            <LijnBadge line={data.line} carrier={data.carrier} />
            <Text style={[styles.destination, { color: colors.text }]} numberOfLines={2}>{data.destination}</Text>
          </View>
          <Text style={[styles.headerSub, { color: colors.textSoft }]}>{isLive ? "Live ritinformatie" : "Dienstregeling"}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Favoriete lijn"
          onPress={() => toggleFavoriteLine(data.line)}
          style={({ pressed }) => [styles.favoriteButton, { opacity: pressed ? 0.55 : 1 }]}
        >
          <Ionicons name={isFavoriteLine ? "heart" : "heart-outline"} size={30} color={isFavoriteLine ? colors.danger : colors.textSoft} />
        </Pressable>
      </View>

      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <View style={[styles.modeIcon, { backgroundColor: colors.accentSoft }]}> 
          <Ionicons name={modeIcon(data.mode)} size={20} color={colors.accent} />
        </View>
        <View style={styles.summaryMain}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>Lijn {data.line}</Text>
          <Text style={[styles.summaryRoute, { color: colors.textSoft }]} numberOfLines={1}>Richting {data.destination}</Text>
          <Text style={[styles.summaryStatus, { color: isLive ? colors.success : colors.textSoft }]}>{isLive ? "Live gevolgd" : "Volgens dienstregeling"}</Text>
        </View>
        {nextStop ? (
          <View style={[styles.nextStopBox, { borderLeftColor: colors.border }]}> 
            <Text style={[styles.nextLabel, { color: colors.textSoft }]}>Volgende halte</Text>
            <Text style={[styles.nextName, { color: colors.text }]} numberOfLines={2}>{nextStop.name}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.timelineHeading}>
        <Text style={[styles.timelineTitle, { color: colors.text }]}>Haltes</Text>
        <Text style={[styles.timelineMeta, { color: colors.textSoft }]}>{data.stops.length} haltes</Text>
      </View>

      <FlatList
        data={data.stops}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.timeline}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const passed = item.state === "passed";
          const current = item.state === "current";
          const isEnd = item.state === "end" || index === data.stops.length - 1;
          const status = stopStatus(item);
          const showDelay = typeof item.delayMinutes === "number" && item.delayMinutes >= 1;
          const displayTime = item.actualTime || item.plannedTime;

          return (
            <View style={[styles.stopRow, { opacity: passed ? 0.52 : 1 }]}> 
              <View style={styles.timeColumn}>
                <Text style={[styles.stopTime, { color: showDelay ? colors.danger : colors.text }]}>{displayTime}</Text>
                {showDelay ? <Text style={[styles.delayText, { color: colors.danger }]}>+{item.delayMinutes} min</Text> : null}
              </View>

              <View style={styles.railColumn}>
                <View style={[
                  styles.dot,
                  {
                    backgroundColor: current ? colors.accent : colors.background,
                    borderColor: current || passed || isEnd ? colors.accent : colors.border
                  }
                ]}>
                  {isEnd && !current ? <View style={[styles.endDot, { backgroundColor: colors.accent }]} /> : null}
                </View>
                {index < data.stops.length - 1 ? (
                  <View style={[styles.rail, { backgroundColor: passed || current ? colors.accent : colors.border }]} />
                ) : null}
              </View>

              <View style={[
                styles.stopBody,
                current ? { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft } : { borderColor: "transparent" }
              ]}>
                <View style={styles.stopTop}>
                  <Text style={[styles.stopName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                  {status ? (
                    <Text style={[styles.rowStatus, { color: current ? colors.accent : colors.danger }]}>{status}</Text>
                  ) : null}
                </View>

                <View style={styles.stopMetaRow}>
                  {item.platform ? (
                    <Text style={[styles.platformText, { color: colors.textSoft }]}>
                      {data.mode === "train" ? `Spoor ${item.platform}` : `Perron ${item.platform}`}
                    </Text>
                  ) : null}
                  {item.platformChanged ? (
                    <View style={[styles.changeBadge, { backgroundColor: colors.dangerSoft }]}> 
                      <Ionicons name="swap-horizontal" size={12} color={colors.danger} />
                      <Text style={[styles.changeText, { color: colors.danger }]}>Gewijzigd</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSoft }]}>Geen ritverloop beschikbaar.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 48, paddingHorizontal: 16, paddingBottom: 8, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  backButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerMain: { flex: 1, minWidth: 0 },
  headerLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  destination: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 24, fontWeight: "900", letterSpacing: -0.35 },
  headerSub: { marginTop: 3, marginLeft: 2, fontSize: 13, fontWeight: "600" },
  favoriteButton: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },

  summaryCard: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  modeIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 14, fontWeight: "900" },
  summaryRoute: { marginTop: 1, fontSize: 11.5, fontWeight: "600" },
  summaryStatus: { marginTop: 3, fontSize: 11, fontWeight: "800" },
  nextStopBox: { width: 112, minHeight: 48, paddingLeft: 10, borderLeftWidth: 1, justifyContent: "center" },
  nextLabel: { fontSize: 9.5, fontWeight: "700" },
  nextName: { marginTop: 2, fontSize: 11.5, lineHeight: 14, fontWeight: "900" },

  timelineHeading: { paddingHorizontal: 18, paddingBottom: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timelineTitle: { fontSize: 15, fontWeight: "900" },
  timelineMeta: { fontSize: 11.5, fontWeight: "700" },
  timeline: { paddingHorizontal: 12, paddingBottom: 72 },
  stopRow: { minHeight: 68, flexDirection: "row", alignItems: "stretch" },
  timeColumn: { width: 62, paddingTop: 10, paddingRight: 8, alignItems: "flex-end" },
  stopTime: { fontSize: 13, lineHeight: 17, fontWeight: "900", fontVariant: ["tabular-nums"] },
  delayText: { marginTop: 1, fontSize: 9.5, fontWeight: "900" },
  railColumn: { width: 24, alignItems: "center" },
  dot: { marginTop: 12, width: 14, height: 14, borderRadius: 99, borderWidth: 2, zIndex: 2, alignItems: "center", justifyContent: "center" },
  endDot: { width: 6, height: 6, borderRadius: 99 },
  rail: { width: 2.5, flex: 1, minHeight: 48, marginTop: 1, borderRadius: 99 },
  stopBody: { flex: 1, minWidth: 0, marginLeft: 6, marginBottom: 6, borderRadius: 13, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10 },
  stopTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stopName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 18, fontWeight: "900" },
  rowStatus: { fontSize: 10.5, fontWeight: "900" },
  stopMetaRow: { minHeight: 16, marginTop: 3, flexDirection: "row", alignItems: "center", gap: 6 },
  platformText: { fontSize: 10, fontWeight: "700" },
  changeBadge: { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 },
  changeText: { fontSize: 9.5, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { padding: 20, textAlign: "center" }
});
