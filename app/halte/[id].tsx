import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { LijnBadge } from "../../components/LijnBadge";
import { VertrekRegel } from "../../components/VertrekRegel";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { getHalte } from "../../lib/api";
import { DepartureItem, HalteBoardData, Mode } from "../../types/api";

type BoardTab = "departures" | "arrivals" | "disruptions";

type LineChoice = {
  line: string;
  carrier?: string;
  isLive?: boolean;
  nextTime: string;
  destinations: string[];
};

const modeLabel: Record<Mode, string> = {
  train: "Trein",
  metro: "Metro",
  tram: "Tram",
  bus: "Bus",
  ferry: "Veer"
};

export default function HalteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, toggleFavoriteStop, isFavoriteStop, addRecentStop } = useApp();
  const [data, setData] = useState<HalteBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BoardTab>("departures");
  const [openFilter, setOpenFilter] = useState<"line" | "direction" | null>(null);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [selectedDirection, setSelectedDirection] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    let active = true;

    const load = async (showLoader = false) => {
      try {
        if (showLoader) setLoading(true);
        const result = await getHalte(id);
        if (!active) return;
        setData(result);
        addRecentStop(result.stop);
      } catch (error) {
        console.error("Halte laden mislukt", error);
      } finally {
        if (active && showLoader) setLoading(false);
      }
    };

    void load(true);
    const timer = setInterval(() => void load(false), 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id]);

  useEffect(() => {
    setSelectedLine(null);
    setSelectedDirection(null);
    setOpenFilter(null);
  }, [tab]);

  const baseItems = useMemo(() => {
    if (!data) return [];
    if (tab === "arrivals") return data.arrivals;
    if (tab === "disruptions") {
      return data.disruptions.map((disruption, index): DepartureItem => ({
        id: `alert-${index}`,
        line: "!",
        destination: disruption,
        plannedTime: "--:--",
        relativeText: "Actieve storing",
        reliability: "low",
        trend: "flat",
        carrier: "Default",
        alert: disruption
      }));
    }
    return data.departures;
  }, [data, tab]);

  const lineChoices = useMemo<LineChoice[]>(() => {
    if (tab === "disruptions") return [];

    const map = new Map<string, LineChoice>();
    for (const item of baseItems) {
      const line = String(item.line || "").trim();
      if (!line) continue;

      const existing = map.get(line);
      if (!existing) {
        map.set(line, {
          line,
          carrier: item.carrier,
          isLive: item.isLive,
          nextTime: item.plannedTime,
          destinations: item.destination ? [item.destination] : []
        });
        continue;
      }

      if (item.isLive) existing.isLive = true;
      if (item.destination && !existing.destinations.includes(item.destination)) {
        existing.destinations.push(item.destination);
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      a.line.localeCompare(b.line, "nl", { numeric: true, sensitivity: "base" })
    );
  }, [baseItems, tab]);

  useEffect(() => {
    if (selectedLine && !lineChoices.some((choice) => choice.line === selectedLine)) {
      setSelectedLine(null);
      setSelectedDirection(null);
    }
  }, [lineChoices, selectedLine]);

  const selectedChoice = lineChoices.find((choice) => choice.line === selectedLine);
  const directionChoices = selectedChoice?.destinations ?? [];

  useEffect(() => {
    if (selectedDirection && !directionChoices.includes(selectedDirection)) {
      setSelectedDirection(null);
    }
  }, [directionChoices, selectedDirection]);

  const activeItems = useMemo(() => {
    if (tab === "disruptions") return baseItems;
    return baseItems.filter((item) => {
      if (selectedLine && item.line !== selectedLine) return false;
      if (selectedDirection && item.destination !== selectedDirection) return false;
      return true;
    });
  }, [baseItems, selectedLine, selectedDirection, tab]);

  const transportSummary = useMemo(() => {
    if (!data) return "";
    const modes = Array.from(new Set([...data.departures, ...data.arrivals].map((item) => item.mode).filter(Boolean))) as Mode[];
    return modes.length ? modes.map((mode) => modeLabel[mode]).join(" · ") : modeLabel[data.stop.mode];
  }, [data]);

  if (loading || !data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const favorite = isFavoriteStop(data.stop.id);
  const tabs: { key: BoardTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "departures", label: "Vertrekken", icon: "arrow-up-circle-outline" },
    { key: "arrivals", label: "Aankomsten", icon: "arrow-down-circle-outline" },
    { key: "disruptions", label: "Storingen", icon: "warning-outline" }
  ];

  const hasLineChoice = tab !== "disruptions" && lineChoices.length > 1;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.iconButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>

          <View style={styles.headerCopy}>
            <View style={styles.stopTitleRow}>
              <View style={[styles.modeDot, { backgroundColor: modaliteitColors[data.stop.mode] }]} />
              <Text
                style={[styles.title, data.stop.name.length > 28 ? styles.titleLong : null, { color: colors.text }]}
                numberOfLines={2}
              >
                {data.stop.name}
              </Text>
            </View>
            <Text style={[styles.subtitle, { color: colors.textSoft }]} numberOfLines={1}>
              {[data.stop.city, transportSummary].filter(Boolean).join(" · ")}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Favoriete halte"
            onPress={() => toggleFavoriteStop(data.stop)}
            style={({ pressed }) => [styles.favoriteButton, { opacity: pressed ? 0.55 : 1 }]}
          >
            <Ionicons
              name={favorite ? "star" : "star-outline"}
              size={25}
              color={favorite ? colors.warning : colors.textSoft}
            />
          </Pressable>
        </View>

        <View style={[styles.tabWrap, { backgroundColor: colors.surfaceAlt }]}>
          {tabs.map((item) => {
            const active = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[styles.tabButton, { backgroundColor: active ? colors.accent : "transparent" }]}
              >
                <Ionicons name={item.icon} size={14} color={active ? "#FFFFFF" : colors.textSoft} />
                <Text style={[styles.tabButtonText, { color: active ? "#FFFFFF" : colors.textSoft }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleWrap}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {tab === "departures"
              ? "Eerstvolgende vertrekken"
              : tab === "arrivals"
                ? "Eerstvolgende aankomsten"
                : "Actuele storingen"}
          </Text>
          <Text style={[styles.sectionCount, { color: colors.textSoft }]}>{activeItems.length}</Text>
        </View>

        {hasLineChoice ? (
          <>
            <View style={styles.filterRow}>
              <Pressable
                onPress={() => setOpenFilter(openFilter === "line" ? null : "line")}
                style={[
                  styles.selector,
                  styles.selectorLine,
                  {
                    backgroundColor: selectedLine ? colors.accentSoft : colors.surface,
                    borderColor: selectedLine ? colors.accent : colors.border
                  }
                ]}
              >
                <View style={styles.selectorCopy}>
                  <View style={styles.selectorTopRow}>
                    {selectedChoice ? (
                      <LijnBadge line={selectedChoice.line} carrier={selectedChoice.carrier} compact />
                    ) : (
                      <Ionicons name="git-branch-outline" size={16} color={colors.accent} />
                    )}
                    <Text style={[styles.selectorTitle, { color: colors.text }]} numberOfLines={1}>
                      {selectedChoice ? `Lijn ${selectedChoice.line}` : "Alle lijnen"}
                    </Text>
                  </View>
                  <Text style={[styles.selectorSub, { color: colors.textSoft }]} numberOfLines={1}>
                    {selectedChoice
                      ? `${selectedChoice.destinations.length} ${selectedChoice.destinations.length === 1 ? "richting" : "richtingen"}`
                      : `${lineChoices.length} lijnen`}
                  </Text>
                </View>
                <Ionicons
                  name={openFilter === "line" ? "chevron-up" : "chevron-down"}
                  size={15}
                  color={colors.textSoft}
                />
              </Pressable>

              <Pressable
                disabled={!selectedLine}
                onPress={() => selectedLine && setOpenFilter(openFilter === "direction" ? null : "direction")}
                style={[
                  styles.selector,
                  styles.selectorDirection,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: selectedLine ? 1 : 0.45
                  }
                ]}
              >
                <View style={styles.selectorCopy}>
                  <View style={styles.selectorTopRow}>
                    <Ionicons name="navigate-outline" size={15} color={selectedLine ? colors.accent : colors.textMuted} />
                    <Text style={[styles.selectorTitle, { color: colors.text }]} numberOfLines={1}>
                      {selectedDirection || "Alle richtingen"}
                    </Text>
                  </View>
                  <Text style={[styles.selectorSub, { color: colors.textSoft }]} numberOfLines={1}>
                    {selectedLine
                      ? `${directionChoices.length} ${directionChoices.length === 1 ? "richting" : "richtingen"}`
                      : "Kies eerst lijn"}
                  </Text>
                </View>
                <Ionicons
                  name={openFilter === "direction" ? "chevron-up" : "chevron-down"}
                  size={15}
                  color={colors.textSoft}
                />
              </Pressable>
            </View>

            {openFilter === "line" ? (
              <View style={[styles.inlineMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Pressable
                  onPress={() => {
                    setSelectedLine(null);
                    setSelectedDirection(null);
                    setOpenFilter(null);
                  }}
                  style={[
                    styles.inlineOption,
                    { backgroundColor: !selectedLine ? colors.accentSoft : "transparent" }
                  ]}
                >
                  <View style={[styles.inlineIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="git-branch-outline" size={17} color={colors.accent} />
                  </View>
                  <View style={styles.inlineOptionCopy}>
                    <Text style={[styles.inlineOptionTitle, { color: colors.text }]}>Alle lijnen</Text>
                    <Text style={[styles.inlineOptionSub, { color: colors.textSoft }]}>Volledig halteoverzicht</Text>
                  </View>
                  {!selectedLine ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                </Pressable>

                {lineChoices.map((choice) => {
                  const selected = choice.line === selectedLine;
                  return (
                    <Pressable
                      key={choice.line}
                      onPress={() => {
                        setSelectedLine(choice.line);
                        setSelectedDirection(null);
                        setOpenFilter(null);
                      }}
                      style={[
                        styles.inlineOption,
                        { backgroundColor: selected ? colors.accentSoft : "transparent" }
                      ]}
                    >
                      <LijnBadge line={choice.line} carrier={choice.carrier} compact />
                      <View style={styles.inlineOptionCopy}>
                        <Text style={[styles.inlineOptionTitle, { color: colors.text }]}>Lijn {choice.line}</Text>
                        <Text style={[styles.inlineOptionSub, { color: colors.textSoft }]}>
                          {choice.destinations.length} {choice.destinations.length === 1 ? "richting" : "richtingen"}
                          {choice.isLive ? " · Live" : ""}
                        </Text>
                      </View>
                      {selected ? (
                        <Ionicons name="checkmark" size={18} color={colors.accent} />
                      ) : (
                        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {openFilter === "direction" && selectedLine ? (
              <View style={[styles.inlineMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Pressable
                  onPress={() => {
                    setSelectedDirection(null);
                    setOpenFilter(null);
                  }}
                  style={[
                    styles.inlineOption,
                    { backgroundColor: !selectedDirection ? colors.accentSoft : "transparent" }
                  ]}
                >
                  <View style={[styles.inlineIcon, { backgroundColor: colors.accentSoft }]}>
                    <Ionicons name="navigate-outline" size={17} color={colors.accent} />
                  </View>
                  <View style={styles.inlineOptionCopy}>
                    <Text style={[styles.inlineOptionTitle, { color: colors.text }]}>Alle richtingen</Text>
                    <Text style={[styles.inlineOptionSub, { color: colors.textSoft }]}>Lijn {selectedLine}</Text>
                  </View>
                  {!selectedDirection ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                </Pressable>

                {directionChoices.map((destination) => {
                  const selected = destination === selectedDirection;
                  return (
                    <Pressable
                      key={destination}
                      onPress={() => {
                        setSelectedDirection(destination);
                        setOpenFilter(null);
                      }}
                      style={[
                        styles.inlineOption,
                        { backgroundColor: selected ? colors.accentSoft : "transparent" }
                      ]}
                    >
                      <View style={[styles.inlineIcon, { backgroundColor: colors.surfaceAlt }]}>
                        <Ionicons name="arrow-forward" size={16} color={colors.textSoft} />
                      </View>
                      <View style={styles.inlineOptionCopy}>
                        <Text style={[styles.inlineOptionTitle, { color: colors.text }]} numberOfLines={2}>
                          {destination}
                        </Text>
                      </View>
                      {selected ? (
                        <Ionicons name="checkmark" size={18} color={colors.accent} />
                      ) : (
                        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      <FlatList
        data={activeItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <VertrekRegel
            item={item}
            onPress={item.ritId ? () => router.push({ pathname: "/rit/[id]", params: { id: item.ritId! } }) : undefined}
          />
        )}
        ListEmptyComponent={
          <View style={[styles.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="checkmark-circle-outline" size={24} color={colors.textMuted} />
            <Text style={{ color: colors.textSoft }}>Geen gegevens beschikbaar.</Text>
          </View>
        }
      />

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingTop: 48, paddingHorizontal: 14, paddingBottom: 8, gap: 11 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  favoriteButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent"
  },
  stopTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  modeDot: { width: 11, height: 11, borderRadius: 99 },
  title: {
    fontSize: 20,
    fontWeight: "900",
    flex: 1,
    lineHeight: 22,
    letterSpacing: -0.35
  },
  titleLong: { fontSize: 18, lineHeight: 20 },
  subtitle: { marginTop: 3, fontSize: 11.5, fontWeight: "700" },
  tabWrap: { borderRadius: 13, padding: 3, flexDirection: "row", gap: 2 },
  tabButton: {
    flex: 1,
    minHeight: 37,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    borderRadius: 10
  },
  tabButtonText: { fontWeight: "900", fontSize: 11.5 },

  sectionHead: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 7, gap: 7 },
  sectionTitleWrap: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  sectionTitle: { fontSize: 14.5, fontWeight: "900" },
  sectionCount: { fontSize: 11.5, fontWeight: "800" },

  filterRow: { flexDirection: "row", gap: 7 },
  selector: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  selectorLine: { flex: 1.02 },
  selectorDirection: { flex: 1.18 },
  selectorCopy: { flex: 1, minWidth: 0 },
  selectorTopRow: { flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0 },
  selectorTitle: { flex: 1, minWidth: 0, fontSize: 11.5, lineHeight: 14, fontWeight: "900" },
  selectorSub: { marginTop: 2, fontSize: 9.5, lineHeight: 11, fontWeight: "700" },

  inlineMenu: {
    marginTop: 1,
    borderWidth: 1,
    borderRadius: 13,
    padding: 5
  },
  inlineOption: {
    minHeight: 51,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  inlineIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center"
  },
  inlineOptionCopy: { flex: 1, minWidth: 0 },
  inlineOptionTitle: { fontSize: 12.5, lineHeight: 15, fontWeight: "900" },
  inlineOptionSub: { marginTop: 1, fontSize: 9.5, lineHeight: 11, fontWeight: "700" },

  listContent: { paddingHorizontal: 14, paddingBottom: 110 },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },

});
