import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LijnBadge } from "../../components/LijnBadge";
import { useApp } from "../../context/AppProvider";
import { getRit } from "../../lib/api";
import { JourneyStop, RitData } from "../../types/api";

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
    }, 220);
    return () => clearTimeout(timer);
  }, [data?.id, activeIndex, followCurrent]);

  const pauseFollowing = () => {
    setFollowCurrent(false);
    if (followTimer.current) clearTimeout(followTimer.current);
    followTimer.current = setTimeout(() => setFollowCurrent(true), 25000);
  };

  if (loading || !data) {
    return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.accent} /></View>;
  }

  const isFavoriteLine = favoriteLines.includes(data.line);
  const isLive = data.live === true || Boolean(data.vehicle);
  const progressLabel = activeIndex >= 0 ? `${activeIndex + 1}/${data.stops.length}` : `${data.stops.length} haltes`;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={23} color={colors.text} />
        </Pressable>

        <View style={styles.headerMain}>
          <View style={styles.headerLine}>
            <LijnBadge line={data.line} carrier={data.carrier} />
            <Text style={[styles.destination, { color: colors.text }]} numberOfLines={2}>{data.destination}</Text>
          </View>
          <Text style={[styles.headerSub, { color: colors.textSoft }]} numberOfLines={1}>
            {[data.carrier, isLive ? "Live ritinformatie" : "Dienstregeling"].filter(Boolean).join(" · ")}
          </Text>
        </View>

        <Pressable
          onPress={() => toggleFavoriteLine(data.line)}
          style={({ pressed }) => [styles.favoriteButton, { opacity: pressed ? 0.55 : 1 }]}
        >
          <Ionicons name={isFavoriteLine ? "heart" : "heart-outline"} size={27} color={isFavoriteLine ? colors.danger : colors.textSoft} />
        </Pressable>
      </View>

      <View style={[styles.tripStrip, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
        <View style={styles.tripStatus}>
          <View style={[styles.statusDot, { backgroundColor: isLive ? colors.success : colors.textMuted }]} />
          <Text style={[styles.statusText, { color: isLive ? colors.success : colors.textSoft }]}>
            {isLive ? "Live gevolgd" : "Volgens dienstregeling"}
          </Text>
        </View>

        {nextStop ? (
          <Text style={[styles.nextStop, { color: colors.text }]} numberOfLines={2}>
            <Text style={{ color: colors.textSoft }}>Volgende · </Text>{nextStop.name}
          </Text>
        ) : null}
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
          const mainTime = showDelay && item.actualTime ? item.actualTime : item.plannedTime;
          const showPlannedUnderActual = showDelay && item.actualTime && item.actualTime !== item.plannedTime;

          return (
            <View style={[styles.stopRow, { opacity: passed ? 0.42 : 1 }]}> 
              <View style={styles.timeColumn}>
                <Text style={[styles.stopTime, { color: showDelay ? colors.danger : colors.text }]}>{mainTime}</Text>
                {showPlannedUnderActual ? (
                  <Text style={[styles.plannedTime, { color: colors.textMuted }]}>{item.plannedTime}</Text>
                ) : null}
                {showDelay ? <Text style={[styles.delayText, { color: colors.danger }]}>+{delay}</Text> : null}
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
                current ? { backgroundColor: colors.accentSoft } : { backgroundColor: "transparent" }
              ]}>
                <View style={styles.stopTop}>
                  <Text style={[styles.stopName, { color: colors.text }]} numberOfLines={2}>{item.name}</Text>
                  {current ? <Text style={[styles.nowText, { color: colors.accent }]}>Nu hier</Text> : null}
                </View>

                {item.platform || item.platformChanged ? (
                  <View style={styles.stopMetaRow}>
                    {item.platform ? (
                      <Text style={[styles.platformText, { color: colors.textSoft }]}>
                        {data.mode === "train" ? `Spoor ${item.platform}` : `Perron ${item.platform}`}
                      </Text>
                    ) : null}
                    {item.platformChanged ? (
                      <Text style={[styles.changeText, { color: colors.danger }]}>Gewijzigd</Text>
                    ) : null}
                  </View>
                ) : null}
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
  header: { paddingTop: 47, paddingHorizontal: 13, paddingBottom: 7, flexDirection: "row", alignItems: "center", gap: 8 },
  backButton: { width: 39, height: 39, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  headerMain: { flex: 1, minWidth: 0 },
  headerLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  destination: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 22, fontWeight: "900", letterSpacing: -0.35 },
  headerSub: { marginTop: 2, fontSize: 11.5, lineHeight: 14, fontWeight: "700" },
  favoriteButton: { width: 38, height: 39, alignItems: "center", justifyContent: "center" },

  tripStrip: {
    marginHorizontal: 13,
    marginBottom: 6,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9
  },
  tripStatus: { flexDirection: "row", alignItems: "center", gap: 5, minWidth: 95 },
  statusDot: { width: 6, height: 6, borderRadius: 99 },
  statusText: { fontSize: 10.5, lineHeight: 13, fontWeight: "900" },
  nextStop: { flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 14, fontWeight: "800" },

  timelineHeading: { paddingHorizontal: 14, paddingTop: 2, paddingBottom: 3, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timelineTitle: { fontSize: 14, fontWeight: "900" },
  timelineMeta: { fontSize: 10.5, fontWeight: "800" },

  timeline: { paddingHorizontal: 9, paddingBottom: 68 },
  stopRow: { minHeight: 54, flexDirection: "row", alignItems: "stretch" },
  timeColumn: { width: 61, paddingTop: 7, paddingRight: 6, alignItems: "flex-end" },
  stopTime: { fontSize: 14, lineHeight: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  plannedTime: { marginTop: 1, fontSize: 9, lineHeight: 10, textDecorationLine: "line-through", fontWeight: "700" },
  delayText: { marginTop: 1, fontSize: 9.5, lineHeight: 10, fontWeight: "900" },

  railColumn: { width: 20, alignItems: "center" },
  dot: { marginTop: 9, width: 13, height: 13, borderRadius: 99, borderWidth: 2, zIndex: 2, alignItems: "center", justifyContent: "center" },
  endDot: { width: 5, height: 5, borderRadius: 99 },
  rail: { width: 2.2, flex: 1, minHeight: 40, marginTop: 1, borderRadius: 99 },

  stopBody: { flex: 1, minWidth: 0, marginLeft: 4, marginBottom: 2, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  stopTop: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  stopName: { flex: 1, minWidth: 0, fontSize: 14.5, lineHeight: 17, fontWeight: "900" },
  nowText: { fontSize: 9.5, lineHeight: 16, fontWeight: "900" },
  stopMetaRow: { minHeight: 14, marginTop: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  platformText: { fontSize: 9.5, fontWeight: "700" },
  changeText: { fontSize: 9.5, fontWeight: "900" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { padding: 18, textAlign: "center" }
});
