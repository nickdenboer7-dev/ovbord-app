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
          <Ionicons name={modeIcon(data.mode)} size={25} color={colors.accent} />
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
  header: { paddingTop: 52, paddingHorizontal: 16, paddingBottom: 14, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  backButton: { width: 48, height: 48, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerMain: { flex: 1, minWidth: 0 },
  headerLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  destination: { flex: 1, minWidth: 0, fontSize: 24, lineHeight: 29, fontWeight: "900", letterSpacing: -0.55 },
  headerSub: { marginTop: 5, marginLeft: 2, fontSize: 15, fontWeight: "600" },
  favoriteButton: { width: 44, height: 48, alignItems: "center", justifyContent: "center" },

  summaryCard: { marginHorizontal: 16, marginBottom: 14, borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  modeIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  summaryMain: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 16, fontWeight: "900" },
  summaryRoute: { marginTop: 2, fontSize: 12.5, fontWeight: "600" },
  summaryStatus: { marginTop: 5, fontSize: 12, fontWeight: "800" },
  nextStopBox: { width: 120, minHeight: 58, paddingLeft: 12, borderLeftWidth: 1, justifyContent: "center" },
  nextLabel: { fontSize: 10.5, fontWeight: "700" },
  nextName: { marginTop: 3, fontSize: 12.5, lineHeight: 16, fontWeight: "900" },

  timelineHeading: { paddingHorizontal: 18, paddingBottom: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timelineTitle: { fontSize: 15, fontWeight: "900" },
  timelineMeta: { fontSize: 11.5, fontWeight: "700" },
  timeline: { paddingHorizontal: 12, paddingBottom: 86 },
  stopRow: { minHeight: 82, flexDirection: "row", alignItems: "stretch" },
  timeColumn: { width: 69, paddingTop: 15, paddingRight: 9, alignItems: "flex-end" },
  stopTime: { fontSize: 15, lineHeight: 19, fontWeight: "900", fontVariant: ["tabular-nums"] },
  delayText: { marginTop: 2, fontSize: 10.5, fontWeight: "900" },
  railColumn: { width: 27, alignItems: "center" },
  dot: { marginTop: 18, width: 17, height: 17, borderRadius: 99, borderWidth: 2.5, zIndex: 2, alignItems: "center", justifyContent: "center" },
  endDot: { width: 7, height: 7, borderRadius: 99 },
  rail: { width: 3, flex: 1, minHeight: 62, marginTop: 1, borderRadius: 99 },
  stopBody: { flex: 1, minWidth: 0, marginLeft: 7, marginBottom: 5, borderRadius: 15, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12 },
  stopTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  stopName: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20, fontWeight: "900" },
  rowStatus: { fontSize: 11.5, fontWeight: "900" },
  stopMetaRow: { minHeight: 20, marginTop: 5, flexDirection: "row", alignItems: "center", gap: 7 },
  platformText: { fontSize: 11, fontWeight: "700" },
  changeBadge: { alignSelf: "flex-start", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, flexDirection: "row", alignItems: "center", gap: 4 },
  changeText: { fontSize: 9.5, fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { padding: 20, textAlign: "center" }
});
