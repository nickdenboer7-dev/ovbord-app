import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { largeText } from "../../lib/textScale";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { favoriteStatusText } from "../../components/FavoriteDepartures";
import { DepartureLine } from "../../components/DepartureLine";
import { LijnBadge } from "../../components/LijnBadge";
import { SettingsButton } from "../../components/SettingsButton";
import { modaliteitColors } from "../../constants/vervoerders";
import { useApp } from "../../context/AppProvider";
import { useFavoritesLive } from "../../context/FavoritesLive";
import { useFlowNavigation } from "../../context/FlowNavigation";
import type { ShowStopOptions } from "../../context/FlowNavigation";
import { buurtbordPreviewRows } from "../../lib/buurtbord";
import { favoriteJourneyDepartures } from "../../lib/favoritesLive";
import { boardRefreshNotice } from "../../lib/offline";
import { ritParamsForDeparture } from "../../lib/ritRoute";
import { useSmartRefresh } from "../../lib/useSmartRefresh";
import type { DepartureItem, StopSummary } from "../../types/api";
import type { SavedJourney } from "../../context/AppProvider";

export default function FavorietenScreen() {
  const { colors, favoriteStops, favoriteJourneys, addRecentStop, toggleFavoriteStop, toggleFavoriteJourney,
    moveFavoriteStop, moveFavoriteJourney } = useApp();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const large = largeText(useWindowDimensions().fontScale);
  const { showStop: showFlowStop } = useFlowNavigation();
  const { boards, refreshFailure, refreshing: favoritesRefreshing, updatedAt, refresh, stopsKey } = useFavoritesLive();
  const [refreshing, setRefreshing] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  // Opening the tab refreshes times older than 15 s; while open, every minute (sooner after a failure).
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useSmartRefresh(() => refresh(), refreshFailure ? 20000 : 60000, "favorieten:" + stopsKey, stopsKey !== "");

  const openStop = (stop: StopSummary, options?: ShowStopOptions) => { addRecentStop(stop); showFlowStop(stop, options); router.navigate("/"); };
  /** The trip opens on top of the stop board in Start, so Back and stop taps in the trip lead there. */
  const openDeparture = (stop: StopSummary, item: DepartureItem, options?: ShowStopOptions) => {
    openStop(stop, options);
    if (item.ritId) router.push({ pathname: "/rit/[id]", params: ritParamsForDeparture(item, stop) });
  };
  const confirmRemove = (title: string, onConfirm: () => void) => Alert.alert("Favoriet verwijderen?", title, [
    { text: "Annuleren", style: "cancel" },
    { text: "Verwijderen", style: "destructive", onPress: onConfirm }
  ]);
  const removeJourney = (item: SavedJourney) => confirmRemove("Lijn " + item.line + " naar " + item.direction + " bij " + item.stop.name, () => toggleFavoriteJourney(item));
  const removeStop = (stop: StopSummary) => confirmRemove(stop.name, () => toggleFavoriteStop(stop));
  const pullToRefresh = async () => {
    setRefreshing(true);
    try { await refresh(true); } finally { setRefreshing(false); }
  };
  const anyBoard = Object.values(boards).some((entry) => entry.board);
  const canOrder = favoriteJourneys.length > 1 || favoriteStops.length > 1;

  /** Up/down buttons in ordering mode; disabled at the ends of the list. */
  const orderButtons = (index: number, count: number, label: string, move: (delta: number) => void) => (
    <View style={styles.orderButtons}>
      {([[-1, "chevron-up", "omhoog"], [1, "chevron-down", "omlaag"]] as const).map(([delta, icon, word]) => {
        const disabled = index + delta < 0 || index + delta >= count;
        return (
          <Pressable key={word} onPress={() => move(delta)} disabled={disabled} hitSlop={4}
            accessibilityRole="button" accessibilityLabel={label + " " + word + " verplaatsen"} accessibilityState={{ disabled }}
            style={[styles.orderButton, { borderColor: colors.border, opacity: disabled ? 0.35 : 1 }]}>
            <Ionicons name={icon} size={17} color={colors.accentText} />
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 24) + 24 }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.heading }]}>Favorieten</Text>
          <Text style={[styles.subtitle, { color: colors.textSoft }]}>{favoritesRefreshing && Object.values(boards).some((entry) => Boolean(entry.board)) ? "Bijwerken…" : ordering ? "Zet je vaste ritten en haltes bovenaan" : "Jouw vaste haltes en ritten"}</Text>
        </View>
        {canOrder ? (
          <Pressable onPress={() => setOrdering((value) => !value)} accessibilityRole="button"
            accessibilityLabel={ordering ? "Klaar met ordenen" : "Favorieten ordenen"} accessibilityState={{ selected: ordering }}
            style={[styles.orderToggle, { borderColor: colors.border, backgroundColor: ordering ? colors.accentSoft : colors.surface }]}>
            <Ionicons name={ordering ? "checkmark" : "swap-vertical"} size={16} color={colors.accentText} />
            <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: "800" }}>{ordering ? "Klaar" : "Ordenen"}</Text>
          </Pressable>
        ) : null}
        <SettingsButton />
      </View>
      <FlatList
        data={favoriteStops}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        extraData={{ boards, nowMs, ordering }}
        refreshControl={stopsKey ? <RefreshControl refreshing={refreshing} onRefresh={() => void pullToRefresh()}
          colors={[colors.accentText]} tintColor={colors.accentText} progressBackgroundColor={colors.surface} /> : undefined}
        ListHeaderComponent={<View style={styles.headerList}>
          {refreshFailure && anyBoard ? (
            <View style={[styles.notice, { backgroundColor: colors.warningSoft }]}>
              <Ionicons name="cloud-offline-outline" size={16} color={colors.text} />
              <Text style={{ color: colors.text, flex: 1, fontSize: 12 }}>{boardRefreshNotice(refreshFailure, updatedAt)}</Text>
            </View>
          ) : null}
          {favoriteJourneys.length ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Favoriete ritten per halte</Text>
            {favoriteJourneys.map((item, index) => {
              const entry = boards[item.stop.id];
              const rows = entry?.board ? favoriteJourneyDepartures(entry.board.departures, item, nowMs) : [];
              const boardStop = entry?.board?.stop || item.stop;
              return (
              <View key={item.key} style={[styles.journey, { borderTopColor: colors.border }]}>
                <View style={styles.journeyTop}>
                  {/* Opens the stop board with this line already filtered. */}
                  <Pressable onPress={() => openStop(item.stop, { line: item.boardLine || item.line, carrier: item.carrier })}
                    accessibilityRole="button" accessibilityLabel={"Lijn " + item.line + " naar " + item.direction + " bij " + item.stop.name + ". Vertrekbord openen"}
                    style={styles.journeyMain}>
                    <LijnBadge line={item.line} carrier={item.carrier} compact tone="flow" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text }} numberOfLines={large ? 2 : 1}>{item.direction}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSoft }} numberOfLines={large ? 2 : 1}>{item.stop.name}</Text>
                    </View>
                  </Pressable>
                  {ordering ? orderButtons(index, favoriteJourneys.length, "Lijn " + item.line + " naar " + item.direction,
                    (delta) => moveFavoriteJourney(item.key, delta)) : null}
                  <Pressable onPress={() => removeJourney(item)} hitSlop={8} accessibilityRole="button"
                    accessibilityLabel={"Verwijder favoriete rit lijn " + item.line + " naar " + item.direction} style={styles.removeButton}>
                    <Ionicons name="close" size={18} color={colors.textSoft} />
                  </Pressable>
                </View>
                {rows.length ? rows.slice(0, 2).map((dep, rowIndex, shown) => (
                  <DepartureLine key={dep.id + ":" + rowIndex} item={dep} nowMs={nowMs} stale={Boolean(entry?.stale)} carrier={item.carrier}
                    size="list" last={rowIndex === shown.length - 1}
                    onPress={() => openDeparture(boardStop, dep, { line: dep.line, carrier: dep.carrier })} />
                )) : <Text style={[styles.status, { color: colors.textSoft }]}>{favoriteStatusText(entry, false)}</Text>}
              </View>
              );
            })}
          </View>
          ) : null}
        </View>}
        renderItem={({ item, index }) => {
          const entry = boards[item.id];
          const stale = Boolean(entry?.stale);
          const rows = entry?.board ? buurtbordPreviewRows(entry.board.departures, nowMs, 3) : [];
          const boardStop = entry?.board?.stop || item;
          return (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.stopRow}>
              <Pressable onPress={() => openStop(item)} accessibilityRole="button" accessibilityLabel={"Open halte " + item.name}
                style={styles.stopMain}>
                <View style={[styles.modeDot, { backgroundColor: modaliteitColors[item.mode] }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stopTitle, { color: colors.text }]}>{item.name}</Text>
                  {item.city ? <Text style={[styles.stopMeta, { color: colors.textSoft }]}>{item.city}</Text> : null}
                  {!rows.length ? <View style={styles.lineWrap}>{item.lines.slice(0, 5).map((line, lineIndex) => <LijnBadge key={`${line.line}-${lineIndex}`} line={line.line} carrier={line.carrier} compact />)}</View> : null}
                </View>
              </Pressable>
              {ordering ? orderButtons(index, favoriteStops.length, "Halte " + item.name, (delta) => moveFavoriteStop(item.id, delta)) : null}
              <Pressable onPress={() => removeStop(item)} hitSlop={8} accessibilityRole="button"
                accessibilityLabel={"Verwijder favoriete halte " + item.name} style={styles.removeButton}>
                <Ionicons name="close" size={18} color={colors.textSoft} />
              </Pressable>
            </View>
            {rows.length ? <View style={[styles.rows, { borderTopColor: colors.border }]}>
              {rows.map((dep, rowIndex) => (
                <DepartureLine key={dep.id + ":" + rowIndex} item={dep} nowMs={nowMs} stale={stale}
                  carrier={item.lines.find((line) => line.line === dep.line)?.carrier}
                  size="list" last={rowIndex === rows.length - 1} onPress={() => openDeparture(boardStop, dep)} />
              ))}
            </View> : <Text style={[styles.status, { color: colors.textSoft }]}>{favoriteStatusText(entry, false)}</Text>}
          </View>
          );
        }}
        ListEmptyComponent={favoriteJourneys.length ? null : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textSoft }}>Nog geen favorieten. Tik op de ster bij een halte of rit om die hier te bewaren.</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, headerRow: { paddingHorizontal: 14, marginBottom: 7, flexDirection: "row", alignItems: "center", gap: 12 }, headerCopy: { flex: 1 }, title: { fontSize: 21, fontWeight: "800" }, subtitle: { marginTop: 3, fontSize: 12 }, content: { padding: 13, gap: 8, paddingBottom: 28 }, card: { borderWidth: 0, borderRadius: 0, padding: 12 }, cardTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10 }, stopRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, modeDot: { width: 16, height: 16, borderRadius: 999, marginTop: 4 }, stopTitle: { fontSize: 16, fontWeight: "800" }, stopMeta: { marginTop: 4, fontSize: 13 }, lineWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }, removeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerList: { gap: 8 },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10 },
  journey: { borderTopWidth: 1, paddingBottom: 8 },
  journeyTop: { flexDirection: "row", alignItems: "center" },
  journeyMain: { flex: 1, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  struck: { textDecorationLine: "line-through" },
  status: { fontSize: 12, marginTop: 4 },
  stopMain: { flex: 1, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  rows: { marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  orderToggle: { minHeight: 34, paddingHorizontal: 10, borderWidth: 1, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 5 },
  orderButtons: { flexDirection: "row", gap: 4 },
  orderButton: { width: 32, height: 32, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" }
});
