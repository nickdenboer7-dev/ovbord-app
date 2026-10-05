import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { ThemeMode } from "../../constants/colors";
import { useApp } from "../../context/AppProvider";

export default function MeerScreen() {
  const { colors, themeMode, setThemeMode, notificationsEnabled, setNotificationsEnabled, favoriteStops, favoriteLines } = useApp();
  const themeOptions: { key: ThemeMode; label: string }[] = [{ key: "light", label: "Licht" }, { key: "dark", label: "Donker" }, { key: "system", label: "Systeem" }];
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}> 
      <View style={styles.header}><Text style={[styles.title, { color: colors.text }]}>Instellingen</Text><Text style={[styles.subtitle, { color: colors.textSoft }]}>Profiel en voorkeuren</Text></View>
      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.row}><Ionicons name="star" size={22} color="#ffc917" /><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.text }]}>Favoriete haltes</Text><Text style={[styles.itemText, { color: colors.textSoft }]}>{favoriteStops.length} opgeslagen</Text></View></View><View style={[styles.separator, { backgroundColor: colors.border }]} /><View style={styles.row}><Ionicons name="heart" size={22} color="#d92b2b" /><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.text }]}>Favoriete lijnen</Text><Text style={[styles.itemText, { color: colors.textSoft }]}>{favoriteLines.length} opgeslagen</Text></View></View></View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.text }]}>Thema</Text><View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>{themeOptions.map((option) => { const active = themeMode === option.key; return <Pressable key={option.key} onPress={() => setThemeMode(option.key)} style={[styles.segmentItem, { backgroundColor: active ? colors.accentSoft : "transparent" }]}><Text style={[styles.segmentText, { color: active ? colors.accent : colors.textSoft }]}>{option.label}</Text></Pressable>; })}</View></View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.row}><Ionicons name="notifications" size={22} color={colors.accent} /><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.text }]}>Meldingen</Text><Text style={[styles.itemText, { color: colors.textSoft }]}>Storingen, vertragingen en spoorwijzigingen</Text></View><Switch value={notificationsEnabled} onValueChange={setNotificationsEnabled} trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#fff" /></View></View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={styles.row}><Ionicons name="information-circle" size={22} color={colors.textSoft} /><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: colors.text }]}>Over OVbord</Text><Text style={[styles.itemText, { color: colors.textSoft }]}>Live vertrekborden en ritinformatie voor Nederland.</Text></View></View><Text style={[styles.version, { color: colors.textMuted }]}>OVbord app · versie 1.0.0</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { paddingTop: 58, paddingHorizontal: 16 }, title: { fontSize: 27, fontWeight: "800" }, subtitle: { marginTop: 4, fontSize: 13 }, content: { padding: 16, gap: 12 }, card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 }, cardTitle: { fontSize: 16, fontWeight: "800" }, itemText: { fontSize: 13, marginTop: 3 }, row: { flexDirection: "row", alignItems: "center", gap: 12 }, separator: { height: 1 }, segmented: { borderRadius: 14, padding: 4, flexDirection: "row" }, segmentItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 }, segmentText: { fontWeight: "700" }, version: { fontSize: 12, marginTop: 2 }
});
