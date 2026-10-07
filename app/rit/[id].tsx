import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

function minutesUntil(clock?: string) {
  if (!clock || !/^\d{2}:\d{2}$/.test(clock)) return null;
  const [hour, minute] = clock.split(":").map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  let diff = Math.round((target.getTime() - now.getTime()) / 60000);
  if (diff < -240) diff += 24 * 60;
  if (diff < 0 || diff > 180) return null;
  return diff;
}

export default function RitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, toggleFavoriteLine, favoriteLines } = useApp();
  const [data, setData] = useState<RitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [followCurrent, setFollowCurrent] = useState(true);
  const router = useRouter();
  const listRef = useRef<FlatList<JourneyStop>>(null);
  const followTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (followTimer.current) clearTimeout(followTimer.current);
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

  useEffect(() => {
    if (!data || activeIndex < 0 || !followCurrent) return;
    const index = Math.max(0, activeIndex - 2);
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
    }, 250);
    return () => clearTimeout(timer);
  }, [data?.id, activeIndex, followCurrent]);

  const pauseFollowing = () => {
    setFollowCurrent(false);
    if (followTimer.current) clearTimeout(followTimer.current);
    followTimer.current = setTimeout(() => setFollowCurrent(true), 25000);
  };

  if (loading || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const isFavoriteLine = favoriteLines.includes(data.line);
  const isLive = data.live === true || Boolean(data.vehicle);
  const progressLabel = activeIndex >= 0 ? `${activeIndex + 1} van ${data.stops.length}` : `${data.stops.length} haltes`;
  const nextMinutes = minutesUntil(nextStop?.actualTime || nextStop?.plannedTime);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={25} color={colors.text} />
        </Pressable>

        <View style={styles.headerMain}>
          <View style={styles.headerLine}>
            <LijnBadge line={data.line} carrier={data.carrier} />
            <Text style={[styles.destination, { color: colors.text }]} numberOfLines={2}>
              {data.destination}
            </Text>
          </View>
          <Text style={[styles.headerStatus, { color: colors.textSoft }]}>
            {isLive ? "Live ritinformatie" : "Dienstregeling"}
          </Text>
        </View>

        <Pressable
          onPress={() => toggleFavoriteLine(data.line)}
          style={({ pressed }) => [styles.favoriteButton, { opacity: pressed ? 0.55 : 1 }]}
        >
          <Ionicons
            name={isFavoriteLine ? "heart" : "heart-outline"}
            size={27}
            color={isFavoriteLine ? colors.danger : colors.textSoft}
          />
        </Pressable>
      </View>

      <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.modeIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={modeIcon(data.mode)} size={21} color={colors.accent} />
        </View>

        <View style={styles.summaryText}>
          <View style={styles.summaryTop}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>Lijn {data.line}</Text>
            <View style={styles.liveMeta}>
              <View style={[styles.liveDot, { backgroundColor: isLive ? colors.success : colors.textMuted }]} />
              <Text style={[styles.liveText, { color: isLive ? colors.success : colors.textSoft }]}>
                {isLive ? "Live gevolgd" : "Dienstregeling"}
              </Text>
            </View>
          </View>

          <Text style={[styles.summaryRoute, { color: colors.textSoft }]} numberOfLines={2}>
            Richting {data.destination}
          </Text>

          {nextStop ? (
            <View style={styles.nextRow}>
              <Text style={[styles.nextLabel, { color: colors.textSoft }]}>Volgende halte</Text>
              <Text style={[styles.nextStop, { color: colors.text }]} numberOfLines={1}>
                {nextStop.name}
              </Text>
              {nextMinutes !== null ? (
                <Text style={[styles.nextMinutes, { color: colors.accent }]}>over {nextMinutes} min</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.timelineHeading}>
        <Text style={[styles.timelineTitle, { color: colors.text }]}>Haltes</Text>
        <Text style={[styles.timelineMeta, { color: colors.textSoft }]}>{progressLabel}</Text>
      </View>

      <FlatList
        ref={listRef}
        data={data.stops}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.timeline}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={pauseFollowing}
        onScrollToIndexFailed={(info) => {
          const target = Math.max(0, activeIndex - 2);
          listRef.current?.scrollToOffset({ offset: target * info.averageItemLength, animated: true });
        }}
        renderItem={({ item, index }) => {
          const passed = item.state === "passed";
          const current = item.state === "current";
          const isEnd = item.state === "end" || index === data.stops.length - 1;
          const delay = typeof item.delayMinutes === "number" ? item.delayMinutes : 0;
          const showDelay = delay >= 1;
          const displayTime = item.actualTime || item.plannedTime;

          return (
            <View style={[styles.stopRow, { opacity: passed ? 0.43 : 1 }]}>
              <View style={styles.timeColumn}>
                <Text style={[styles.stopTime, { color: colors.text }]}>{displayTime}</Text>
              </View>

              <View style={styles.railColumn}>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: current ? colors.accent : colors.background,
                      borderColor: current || passed || isEnd ? colors.accent : colors.border
                    }
                  ]}
                >
                  {isEnd && !current ? <View style={[styles.endDot, { backgroundColor: colors.accent }]} /> : null}
                </View>

                {index < data.stops.length - 1 ? (
                  <View
                    style={[
                      styles.rail,
                      { backgroundColor: passed || current ? colors.accent : colors.border }
                    ]}
                  />
                ) : null}
              </View>

              <View
                style={[
                  styles.stopBody,
                  current ? { backgroundColor: colors.accentSoft } : { backgroundColor: "transparent" }
                ]}
              >
                <View style={styles.stopTop}>
                  <Text style={[styles.stopName, { color: colors.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>

                  {showDelay ? (
                    <Text style={[styles.delayBadge, { color: colors.danger }]}>+{delay} min</Text>
                  ) : current ? (
                    <Text style={[styles.nowBadge, { color: colors.accent }]}>Nu hier</Text>
                  ) : null}
                </View>

                {item.platform || item.platformChanged ? (
                  <View style={styles.stopMetaRow}>
                    {item.platform ? (
                      <Text style={[styles.platformText, { color: colors.textSoft }]}>
                        {data.mode === "train" ? `Spoor ${item.platform}` : `Perron ${item.platform}`}
                      </Text>
                    ) : null}
                    {item.platformChanged ? (
                      <Text style={[styles.changedText, { color: colors.danger }]}>Gewijzigd</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingTop: 47,
    paddingHorizontal: 14,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  headerMain: { flex: 1, minWidth: 0 },
  headerLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  destination: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "900",
    letterSpacing: -0.35
  },
  headerStatus: { marginTop: 2, marginLeft: 1, fontSize: 11.5, fontWeight: "700" },
  favoriteButton: { width: 37, height: 42, alignItems: "center", justifyContent: "center" },

  summaryCard: {
    marginHorizontal: 14,
    marginBottom: 7,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  modeIcon: {
    width: 39,
    height: 39,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2
  },
  summaryText: { flex: 1, minWidth: 0 },
  summaryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  summaryTitle: { fontSize: 14.5, fontWeight: "900" },
  liveMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 99 },
  liveText: { fontSize: 9.5, fontWeight: "900" },
  summaryRoute: { marginTop: 1, fontSize: 11.5, lineHeight: 14, fontWeight: "700" },
  nextRow: { marginTop: 5, flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 },
  nextLabel: { fontSize: 9.5, fontWeight: "700" },
  nextStop: { flex: 1, minWidth: 0, fontSize: 11, fontWeight: "900" },
  nextMinutes: { fontSize: 9.5, fontWeight: "900" },

  timelineHeading: {
    paddingHorizontal: 15,
    paddingTop: 2,
    paddingBottom: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  timelineTitle: { fontSize: 15, fontWeight: "900" },
  timelineMeta: { fontSize: 10.5, fontWeight: "800" },
  timeline: { paddingHorizontal: 10, paddingBottom: 72 },

  stopRow: { minHeight: 55, flexDirection: "row", alignItems: "stretch" },
  timeColumn: { width: 58, paddingTop: 8, paddingRight: 7, alignItems: "flex-end" },
  stopTime: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "900",
    fontVariant: ["tabular-nums"]
  },
  railColumn: { width: 22, alignItems: "center" },
  dot: {
    marginTop: 9,
    width: 14,
    height: 14,
    borderRadius: 99,
    borderWidth: 2,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  endDot: { width: 5, height: 5, borderRadius: 99 },
  rail: { width: 2.2, flex: 1, minHeight: 38, marginTop: 1, borderRadius: 99 },

  stopBody: {
    flex: 1,
    minWidth: 0,
    marginLeft: 5,
    marginBottom: 2,
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 6
  },
  stopTop: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  stopName: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 17, fontWeight: "900" },
  nowBadge: { fontSize: 9.5, lineHeight: 15, fontWeight: "900" },
  delayBadge: { fontSize: 10, lineHeight: 15, fontWeight: "900" },
  stopMetaRow: { marginTop: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  platformText: { fontSize: 9, fontWeight: "700" },
  changedText: { fontSize: 9, fontWeight: "900" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" }
});
