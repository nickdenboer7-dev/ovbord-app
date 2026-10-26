import { Ionicons } from "@expo/vector-icons";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
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
import { STOP_BOARD_BLUE } from "../../lib/stopBoardDesign";
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
  const { showStop: showFlowStop, requestSearch } = useFlowNavigation();
  const { boards, refreshFailure, refreshing: favoritesRefreshing, updatedAt, refresh, stopsKey } = useFavoritesLive();
  const [refreshing, setRefreshing] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  // Opening the tab refreshes times older than 15 s; while open, every minute (sooner after a failure).
  useFocusEffect(useCallback(() => { setFocused(true); void refresh(); return () => setFocused(false); }, [refresh]));
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
      {focused ? <ExpoStatusBar style="light" /> : null}
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 24) + 10 }]}>
        <View style={styles.headerCopy}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: "#FFFFFF" }]}>Favorieten</Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.subtitle, { color: "#DCEAF7" }]}>{favoritesRefreshing && Object.values(boards).some((entry) => Boolean(entry.board)) ? "Bijwerken…" : ordering ? "Zet je favoriete haltes bovenaan" : "Jouw vaste haltes en ritten"}</Text>
        </View>
        {canOrder ? (
          <Pressable onPress={() => setOrdering((value) => !value)} accessibilityRole="button"
            accessibilityLabel={ordering ? "Klaar met ordenen" : "Favorieten ordenen"} accessibilityState={{ selected: ordering }}
            style={[styles.orderToggle, { borderColor: "rgba(255,255,255,0.45)", backgroundColor: ordering ? "#FFFFFF" : "rgba(255,255,255,0.12)" }]}>
            <Ionicons name={ordering ? "checkmark" : "swap-vertical"} size={16} color={ordering ? STOP_BOARD_BLUE : "#FFFFFF"} />
            <Text maxFontSizeMultiplier={1.3} style={{ color: ordering ? STOP_BOARD_BLUE : "#FFFFFF", fontSize: 12, fontWeight: "800" }}>{ordering ? "Klaar" : "Ordenen"}</Text>
          </Pressable>
        ) : null}
        <SettingsButton inverted />
      </View>
      <FlatList
        data={favoriteStops}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 72 }]}
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
          <View style={[styles.card, { backgroundColor: colors.background === "#FFFFFF" ? "#F4F8FF" : colors.surface, borderColor: colors.border }]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.cardTitle, { color: colors.text }]}>Favoriete ritten per halte</Text>
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
          <View style={[styles.card, { backgroundColor: colors.background === "#FFFFFF" ? "#F4F8FF" : colors.surface, borderColor: colors.border }]}>
            <View style={styles.stopRow}>
              <Pressable onPress={() => openStop(item)} accessibilityRole="button" accessibilityLabel={"Open halte " + item.name}
                style={styles.stopMain}>
                <View style={[styles.modeDot, { backgroundColor: modaliteitColors[item.mode] }]} />
                <View style={{ flex: 1 }}>
                  <Text maxFontSizeMultiplier={1.3} numberOfLines={large ? 3 : 2} style={[styles.stopTitle, { color: colors.text }]}>{item.name}</Text>
                  {item.city ? <Text maxFontSizeMultiplier={1.3} style={[styles.stopMeta, { color: colors.textSoft }]}>{item.city}</Text> : null}
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
            <Pressable onPress={() => openStop(item)} accessibilityRole="button"
              accessibilityLabel={"Open haltebord van " + item.name}
              style={[styles.openBoard, { backgroundColor: colors.background === "#FFFFFF" ? "#E2EEFF" : colors.surfaceAlt }]}>
              <Ionicons name="bus-outline" size={17} color={colors.background === "#FFFFFF" ? STOP_BOARD_BLUE : colors.accentText} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.openBoardText, { color: colors.background === "#FFFFFF" ? STOP_BOARD_BLUE : colors.accentText }]}>Open haltebord</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.background === "#FFFFFF" ? STOP_BOARD_BLUE : colors.accentText} />
            </Pressable>
          </View>
          );
        }}
        ListEmptyComponent={favoriteJourneys.length ? null : (
          <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
              <Ionicons name="star-outline" size={32} color={STOP_BOARD_BLUE} />
            </View>
            <Text maxFontSizeMultiplier={1.3} style={[styles.emptyTitle, { color: colors.heading }]}>Nog geen favorieten</Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.emptyHint, { color: colors.textSoft }]}>
              Bewaar een halte of richting met het sterretje. Dan zie je hier sneller jouw vertrekken.
            </Text>
            <Pressable onPress={() => { requestSearch(); router.navigate("/"); }} accessibilityRole="button"
              accessibilityLabel="Zoek een halte om als favoriet op te slaan"
              style={[styles.emptyPrimary, { backgroundColor: STOP_BOARD_BLUE }]}>
              <Ionicons name="search" size={18} color="#fff" />
              <Text maxFontSizeMultiplier={1.3} style={styles.emptyPrimaryText}>Zoek een halte</Text>
            </Pressable>
            <Pressable onPress={() => router.navigate("/")} accessibilityRole="button" accessibilityLabel="Haltes in de buurt bekijken"
              style={[styles.emptySecondary, { borderColor: colors.border }]}>
              <Ionicons name="location-outline" size={18} color={STOP_BOARD_BLUE} />
              <Text maxFontSizeMultiplier={1.3} style={[styles.emptySecondaryText, { color: STOP_BOARD_BLUE }]}>Haltes in de buurt</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, headerRow: { backgroundColor: STOP_BOARD_BLUE, paddingHorizontal: 14, paddingBottom: 13, flexDirection: "row", alignItems: "center", gap: 9 }, headerCopy: { flex: 1 }, title: { fontSize: 21, fontWeight: "800" }, subtitle: { marginTop: 3, fontSize: 12 }, content: { padding: 13, gap: 9 }, card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 7 }, cardTitle: { fontSize: 15, fontWeight: "800", marginBottom: 10 }, stopRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" }, modeDot: { width: 16, height: 16, borderRadius: 999, marginTop: 4 }, stopTitle: { fontSize: 16, fontWeight: "800" }, stopMeta: { marginTop: 4, fontSize: 13 }, lineWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }, removeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerList: { gap: 8 },
  openBoard: { minHeight: 40, borderRadius: 9, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, marginTop: 6 },
  openBoardText: { flex: 1, fontSize: 12, fontWeight: "800" },
  notice: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10 },
  emptyState: { marginTop: 30, padding: 22, alignItems: "center", gap: 13, borderRadius: 15 },
  emptyIcon: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "900" },
  emptyHint: { textAlign: "center", fontSize: 13, lineHeight: 19, marginBottom: 7 },
  emptyPrimary: { alignSelf: "stretch", minHeight: 48, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  emptyPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  emptySecondary: { alignSelf: "stretch", minHeight: 48, borderWidth: 1, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  emptySecondaryText: { fontWeight: "800", fontSize: 14 },
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
