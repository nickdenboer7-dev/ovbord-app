import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LijnBadge } from "../../components/LijnBadge";
import { VertrekRegel } from "../../components/VertrekRegel";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { getHalte } from "../../lib/api";
import { DepartureItem, HalteBoardData, Mode } from "../../types/api";

type BoardTab = "departures" | "arrivals" | "disruptions";

type LineChoice = {
  key: string;
  line: string;
  destination: string;
  carrier?: string;
  isLive?: boolean;
  nextTime: string;
};

const modeLabel: Record<Mode, string> = {
  train: "Trein",
  metro: "Metro",
  tram: "Tram",
  bus: "Bus",
  ferry: "Veer"
};

function choiceKey(item: DepartureItem) {
  return `${item.line}::${item.destination}`;
}

export default function HalteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, toggleFavoriteStop, isFavoriteStop, addRecentStop } = useApp();
  const [data, setData] = useState<HalteBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BoardTab>("departures");
  const [lineSheetOpen, setLineSheetOpen] = useState(false);
  const [selectedLineKey, setSelectedLineKey] = useState<string | null>(null);
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
    setSelectedLineKey(null);
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
      const key = choiceKey(item);
      if (!map.has(key)) {
        map.set(key, {
          key,
          line: item.line,
          destination: item.destination,
          carrier: item.carrier,
          isLive: item.isLive,
          nextTime: item.plannedTime
        });
      } else if (item.isLive) {
        const old = map.get(key)!;
        map.set(key, { ...old, isLive: true });
      }
    }
    return Array.from(map.values());
  }, [baseItems, tab]);

  useEffect(() => {
    if (selectedLineKey && !lineChoices.some((choice) => choice.key === selectedLineKey)) {
      setSelectedLineKey(null);
    }
  }, [lineChoices, selectedLineKey]);

  const activeItems = useMemo(() => {
    if (!selectedLineKey || tab === "disruptions") return baseItems;
    return baseItems.filter((item) => choiceKey(item) === selectedLineKey);
  }, [baseItems, selectedLineKey, tab]);

  const selectedChoice = lineChoices.find((choice) => choice.key === selectedLineKey);

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
          <Pressable
            onPress={() => setLineSheetOpen(true)}
            style={[styles.lineFilter, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {selectedChoice ? (
              <LijnBadge line={selectedChoice.line} carrier={selectedChoice.carrier} compact />
            ) : (
              <Ionicons name="options-outline" size={15} color={colors.accent} />
            )}
            <Text style={[styles.lineFilterText, { color: colors.text }]} numberOfLines={1}>
              {selectedChoice ? selectedChoice.destination : "Kies lijn"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSoft} />
          </Pressable>
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

      <Modal
        visible={lineSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLineSheetOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setLineSheetOpen(false)} />

          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Kies een lijn</Text>
                <Text style={[styles.sheetSubtitle, { color: colors.textSoft }]}>
                  Meerdere ritten vanaf deze halte
                </Text>
              </View>
              <Pressable
                onPress={() => setLineSheetOpen(false)}
                style={[styles.closeButton, { backgroundColor: colors.surfaceAlt }]}
              >
                <Ionicons name="close" size={20} color={colors.textSoft} />
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                setSelectedLineKey(null);
                setLineSheetOpen(false);
              }}
              style={[
                styles.choiceRow,
                { borderColor: colors.border, backgroundColor: !selectedLineKey ? colors.accentSoft : colors.background }
              ]}
            >
              <View style={[styles.allLinesIcon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="git-branch-outline" size={20} color={colors.accent} />
              </View>
              <View style={styles.choiceCopy}>
                <Text style={[styles.choiceDestination, { color: colors.text }]}>Alle lijnen</Text>
                <Text style={[styles.choiceStatus, { color: colors.textSoft }]}>Volledig halteoverzicht</Text>
              </View>
              {!selectedLineKey ? <Ionicons name="checkmark" size={20} color={colors.accent} /> : null}
            </Pressable>

            <FlatList
              data={lineChoices}
              keyExtractor={(choice) => choice.key}
              style={styles.choiceList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const selected = item.key === selectedLineKey;
                return (
                  <Pressable
                    onPress={() => {
                      setSelectedLineKey(item.key);
                      setLineSheetOpen(false);
                    }}
                    style={[
                      styles.choiceRow,
                      {
                        borderColor: colors.border,
                        backgroundColor: selected ? colors.accentSoft : colors.background
                      }
                    ]}
                  >
                    <LijnBadge line={item.line} carrier={item.carrier} />
                    <View style={styles.choiceCopy}>
                      <Text style={[styles.choiceDestination, { color: colors.text }]} numberOfLines={1}>
                        {item.destination}
                      </Text>
                      <View style={styles.choiceMeta}>
                        <View
                          style={[
                            styles.choiceDot,
                            { backgroundColor: item.isLive ? colors.success : colors.textMuted }
                          ]}
                        />
                        <Text
                          style={[
                            styles.choiceStatus,
                            { color: item.isLive ? colors.success : colors.textSoft }
                          ]}
                        >
                          {item.isLive ? "Live" : "Dienstregeling"} · {item.nextTime}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={selected ? "checkmark" : "chevron-forward"}
                      size={19}
                      color={selected ? colors.accent : colors.textMuted}
                    />
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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

  lineFilter: {
    height: 38,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 7
  },
  lineFilterText: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "800" },

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

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(7, 16, 13, 0.42)"
  },
  sheet: {
    maxHeight: "72%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingTop: 9,
    paddingHorizontal: 14,
    paddingBottom: 24
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 99,
    alignSelf: "center",
    marginBottom: 12
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 11
  },
  sheetTitle: { fontSize: 20, fontWeight: "900" },
  sheetSubtitle: { marginTop: 2, fontSize: 12, fontWeight: "600" },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center"
  },
  choiceList: { marginTop: 4 },
  choiceRow: {
    minHeight: 62,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  allLinesIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center"
  },
  choiceCopy: { flex: 1, minWidth: 0 },
  choiceDestination: { fontSize: 14, fontWeight: "900" },
  choiceMeta: { marginTop: 3, flexDirection: "row", alignItems: "center", gap: 5 },
  choiceDot: { width: 7, height: 7, borderRadius: 99 },
  choiceStatus: { fontSize: 11, fontWeight: "700" }
});
