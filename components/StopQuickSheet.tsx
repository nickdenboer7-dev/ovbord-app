import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppProvider";
import { getHalte } from "../lib/api";
import type { HalteBoardData, JourneyStop } from "../types/api";
import { LijnBadge } from "./LijnBadge";

type Props = { stop: JourneyStop | null; onClose: () => void };

export function StopQuickSheet({ stop, onClose }: Props) {
  const { colors, isFavoriteStop, toggleFavoriteStop } = useApp();
  const insets = useSafeAreaInsets();
  const [board, setBoard] = useState<HalteBoardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBoard, setShowBoard] = useState(false);
  useEffect(() => {
    if (!stop) {
      setBoard(null);
      setShowBoard(false);
      return;
    }
    let active = true;
    setBoard(null);
    setLoading(true);
    setError(null);
    setShowBoard(false);
    void getHalte(stop.id).then((result) => {
      if (active) setBoard(result);
    }).catch(() => {
      if (active) setError("Geen haltebordgegevens beschikbaar");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [stop?.id]);

  return (
    <Modal transparent visible={!!stop} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.top}>
            <View style={styles.topText}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{stop?.name}</Text>
              <Text style={[styles.caption, { color: colors.textSoft }]}>Tussenhalte · {stop?.plannedTime || ""}</Text>
            </View>
            <Pressable accessibilityLabel="Sluit haltepaneel" onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="close" size={20} color={colors.textSoft} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => setShowBoard((v) => !v)}
            style={[styles.action, { backgroundColor: colors.accentSoft }]}
          >
            <Ionicons name="time-outline" size={20} color={colors.accent} />
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Vertrekken vanaf deze halte</Text>
              <Text style={[styles.caption, { color: colors.textSoft }]}>Toon live vertrektijden zonder deze rit te verlaten</Text>
            </View>
            <Ionicons name={showBoard ? "chevron-up" : "chevron-forward"} size={18} color={colors.accent} />
          </Pressable>

          {showBoard ? (
            <ScrollView style={styles.departures} nestedScrollEnabled>
              {loading ? <ActivityIndicator color={colors.accent} style={styles.loading} /> : null}
              {error ? <Text style={[styles.message, { color: colors.textSoft }]}>{error}</Text> : null}
              {board && board.departures.length === 0 ? <Text style={[styles.message, { color: colors.textSoft }]}>Geen vertrekken gevonden.</Text> : null}
              {board?.departures.slice(0, 15).map((item, index) => (
                <View key={`${item.id}-${index}`} style={[styles.departure, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.departureTime, { color: colors.text }]}>{item.plannedTime}</Text>
                  <LijnBadge line={item.line} carrier={item.carrier} compact />
                  <Text style={[styles.departureDestination, { color: colors.text }]} numberOfLines={2}>{item.destination}</Text>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <Pressable
            onPress={() => { if (board?.stop) toggleFavoriteStop(board.stop); }}
            disabled={!board}
            style={[styles.action, { backgroundColor: colors.surfaceAlt, opacity: board ? 1 : 0.5 }]}
          >
            <Ionicons name={board && isFavoriteStop(board.stop.id) ? "star" : "star-outline"} size={20} color={colors.accent} />
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: colors.text }]}>
                {board && isFavoriteStop(board.stop.id) ? "Verwijder uit favorieten" : "Voeg halte toe aan favorieten"}
              </Text>
            </View>
          </Pressable>

          <Pressable onPress={onClose} style={styles.returnButton}>
            <Text style={[styles.returnLabel, { color: colors.accent }]}>Terug naar open rit</Text>
            <Ionicons name="arrow-back" size={18} color={colors.accent} />
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(8, 22, 17, .43)" },
  sheet: { maxHeight: "82%", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 10 },
  handle: { width: 40, height: 4, borderRadius: 4, alignSelf: "center", marginBottom: 13 },
  top: { flexDirection: "row", alignItems: "center", marginBottom: 14, gap: 12 },
  topText: { flex: 1 }, title: { fontSize: 19, fontWeight: "800", lineHeight: 24 },
  caption: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  close: { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  action: { minHeight: 62, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 9 },
  actionText: { flex: 1 }, actionTitle: { fontSize: 13.5, fontWeight: "800" },
  departures: { maxHeight: 260, marginBottom: 12 },
  loading: { padding: 12 }, message: { fontSize: 13, padding: 14 },
  departure: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: 1, paddingHorizontal: 2, paddingVertical: 8 },
  departureTime: { width: 47, fontSize: 14, fontWeight: "800" },
  departureDestination: { flex: 1, fontSize: 13, fontWeight: "700" },
  returnButton: { height: 45, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  returnLabel: { fontSize: 14, fontWeight: "800" }
});
