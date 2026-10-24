import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import React from "react";
import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appConfig from "../../app.json";
import { ThemeMode } from "../../constants/colors";
import { useApp } from "../../context/AppProvider";
import { updateInfoRows } from "../../lib/appVersion";

// Read once per launch: the running bundle cannot change without a reload.
const UPDATE_ROWS = updateInfoRows({
  isDev: __DEV__,
  isEnabled: Updates.isEnabled,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  createdAt: Updates.createdAt,
  channel: Updates.channel,
  updateId: Updates.updateId
}, appConfig.expo.version);

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** One row in the "Opgeslagen" card: icon, name with an optional hint, and the number on the right. */
function SavedRow({ icon, iconColor, count, hint, children, last = false, action }: {
  icon: IconName; iconColor: string; count: number; hint?: string; children: string; last?: boolean; action?: React.ReactNode;
}) {
  const { colors } = useApp();
  return (
    <View style={[styles.savedRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
      accessible={!action} accessibilityLabel={children + ": " + count + (hint ? ". " + hint : "")}>
      <View style={[styles.savedIcon, { backgroundColor: colors.surfaceSoft }]}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      <View style={styles.savedText}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{children}</Text>
        {hint ? <Text style={[styles.rowHint, { color: colors.textSoft }]}>{hint}</Text> : null}
      </View>
      <Text style={[styles.count, { color: colors.text }]} maxFontSizeMultiplier={1.3}>{count}</Text>
      {action}
    </View>
  );
}

export default function MeerScreen() {
  const router = useRouter();
  const { colors, themeMode, setThemeMode, favoriteStops, favoriteJourneys, favoriteLines, recentStops, clearRecentStops } = useApp();
  const confirmClearRecents = () => Alert.alert("Recente haltes wissen?", "De lijst met onlangs bekeken haltes wordt leeggemaakt. Favorieten blijven bewaard.", [
    { text: "Annuleren", style: "cancel" },
    { text: "Wissen", style: "destructive", onPress: clearRecentStops }
  ]);
  const insets = useSafeAreaInsets();
  const themeOptions: { key: ThemeMode; label: string; icon: IconName }[] = [
    { key: "light", label: "Licht", icon: "sunny-outline" },
    { key: "dark", label: "Donker", icon: "moon-outline" },
    { key: "system", label: "Systeem", icon: "phone-portrait-outline" }
  ];
  // Notifications stay hidden until they actually work: a switch that does nothing misleads users.
  // No arrows on rows that do not open anything. Favourite lines are set with the star in a stop board's Lijnen tab (V5.3).
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 12, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">Instellingen</Text>
      </View>
      {/* Scrolls: with a large system font the settings do not fit on one screen. */}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <Text style={[styles.sectionLabel, { color: colors.textSoft }]} accessibilityRole="header">Weergave</Text>
        <View style={[styles.card, styles.cardPadded, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Thema</Text>
          <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="radiogroup">
            {themeOptions.map((option) => {
              const active = themeMode === option.key;
              return (
                <Pressable key={option.key} onPress={() => setThemeMode(option.key)}
                  accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={"Thema " + option.label}
                  style={[styles.segmentItem, active && { backgroundColor: colors.accent }]}>
                  <Ionicons name={active ? "checkmark-circle" : option.icon} size={18} color={active ? "#FFFFFF" : colors.textSoft} />
                  {/* Three labels share one row: they grow less with the system font and never break inside a word. */}
                  <Text maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                    style={[styles.segmentText, { color: active ? "#FFFFFF" : colors.textSoft }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSoft }]} accessibilityRole="header">Opgeslagen</Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SavedRow icon="star" iconColor={colors.warning} count={favoriteStops.length}>Favoriete haltes</SavedRow>
          <SavedRow icon="bookmark" iconColor={colors.accentText} count={favoriteJourneys.length}>Favoriete ritten</SavedRow>
          <SavedRow icon="star-half" iconColor={colors.warning} count={favoriteLines.length}
            hint="Ster bij een lijn in het tabblad Lijnen van een haltebord">Favoriete lijnen</SavedRow>
          <SavedRow icon="time-outline" iconColor={colors.textSoft} count={recentStops.length} hint="Bewaard op dit toestel" last
            action={
              <Pressable onPress={confirmClearRecents} disabled={!recentStops.length} accessibilityRole="button"
                accessibilityLabel="Recente haltes wissen" accessibilityState={{ disabled: !recentStops.length }} hitSlop={6}
                style={[styles.clearButton, { borderColor: colors.border, opacity: recentStops.length ? 1 : 0.4 }]}>
                <Text maxFontSizeMultiplier={1.3} style={[styles.clearText, { color: colors.danger }]}>Wissen</Text>
              </Pressable>
            }>Recente haltes</SavedRow>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textSoft }]} accessibilityRole="header">Over OVbord</Text>
        <View style={[styles.card, styles.cardPadded, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.rowHint, { color: colors.textSoft, marginTop: 0 }]}>Live vertrekborden en ritinformatie voor Nederland.</Text>
          <View style={styles.infoList}>
            {UPDATE_ROWS.map((row) => (
              <View key={row.label} style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSoft }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>{row.label}</Text>
                <Text style={[styles.infoValue, { color: colors.text }]} selectable>{row.value}</Text>
              </View>
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Feedback geven" onPress={() => router.push("/feedback")} style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, paddingVertical: 7, paddingHorizontal: 2 }}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.textSoft} />
            <Text style={{ color: colors.textSoft, fontSize: 13 }}>Feedback geven</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 23, fontWeight: "900", letterSpacing: -0.4 },
  content: { paddingHorizontal: 12, paddingTop: 6 },
  sectionLabel: { fontSize: 12.5, fontWeight: "800", marginTop: 16, marginBottom: 7, marginLeft: 4 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: "hidden" },
  cardPadded: { padding: 12, gap: 10 },
  rowTitle: { fontSize: 15, fontWeight: "700" },
  rowHint: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  segmented: { borderRadius: 10, padding: 3, flexDirection: "row", gap: 3 },
  segmentItem: { flex: 1, minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 4, borderRadius: 8 },
  segmentText: { fontSize: 13.5, fontWeight: "800", flexShrink: 1 },
  savedRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 8 },
  savedIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  savedText: { flex: 1, minWidth: 0 },
  count: { fontSize: 15, fontWeight: "800", minWidth: 20, textAlign: "right" },
  clearButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6, marginLeft: 2 },
  clearText: { fontWeight: "800", fontSize: 12.5 },
  infoList: { gap: 6 },
  infoRow: { flexDirection: "row", gap: 12 },
  // Wide enough for "Update-ID" at a large font: the label never wraps.
  infoLabel: { width: 104, fontSize: 13 },
  infoValue: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "600" }
});
