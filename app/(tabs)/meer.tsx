import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appConfig from "../../app.json";
import { SettingsButton } from "../../components/SettingsButton";
import { ThemeMode } from "../../constants/colors";
import { useApp } from "../../context/AppProvider";
import { describeUpdate } from "../../lib/appVersion";

// Read once per launch: the running bundle cannot change without a reload.
const UPDATE = describeUpdate({
  isDev: __DEV__,
  isEnabled: Updates.isEnabled,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  createdAt: Updates.createdAt,
  channel: Updates.channel,
  updateId: Updates.updateId
});

export default function MeerScreen() {
  const { colors, themeMode, setThemeMode, favoriteStops, favoriteJourneys, favoriteLines, recentStops, clearRecentStops } = useApp();
  const confirmClearRecents = () => Alert.alert("Recente haltes wissen?", "De lijst met onlangs bekeken haltes wordt leeggemaakt. Favorieten blijven bewaard.", [
    { text: "Annuleren", style: "cancel" },
    { text: "Wissen", style: "destructive", onPress: clearRecentStops }
  ]);
  const insets = useSafeAreaInsets();
  const themeOptions: { key: ThemeMode; label: string }[] = [{ key: "light", label: "Licht" }, { key: "dark", label: "Donker" }, { key: "system", label: "Systeem" }];
  // Notifications stay hidden until they actually work: a switch that does nothing misleads users.
  // Favourite lines are set with the star in a stop board's Lijnen tab (V5.3).
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRow, { paddingTop: Math.max(insets.top, 24) + 34 }]}>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]} maxFontSizeMultiplier={1.3}>Instellingen</Text>
          <Text style={[styles.subtitle, { color: colors.textSoft }]}>Profiel en voorkeuren</Text>
        </View>
        <SettingsButton disabled />
      </View>
      {/* Scrolls: with a large system font the settings do not fit on one screen. */}
      <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Thema</Text>
          <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="radiogroup">
            {themeOptions.map((option) => {
              const active = themeMode === option.key;
              return (
                <Pressable key={option.key} onPress={() => setThemeMode(option.key)}
                  accessibilityRole="radio" accessibilityState={{ checked: active }} accessibilityLabel={"Thema " + option.label}
                  style={[styles.segmentItem, { backgroundColor: active ? colors.successSoft : "transparent" }]}>
                  {/* Three labels share one row: they grow less with the system font and never break inside a word. */}
                  <Text maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
                    style={[styles.segmentText, { color: active ? (colors.accentText) : colors.textSoft }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Ionicons name="star" size={22} color="#ffc917" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Favoriete haltes</Text>
              <Text style={[styles.itemText, { color: colors.textSoft }]}>{favoriteStops.length} opgeslagen</Text>
            </View>
          </View>
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <View style={styles.row}>
            <Ionicons name="bookmark" size={22} color={colors.accentText} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Favoriete ritten</Text>
              <Text style={[styles.itemText, { color: colors.textSoft }]}>{favoriteJourneys.length} opgeslagen</Text>
            </View>
          </View>
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <View style={styles.row}>
            <Ionicons name="star-half" size={22} color="#ffc917" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Favoriete lijnen</Text>
              <Text style={[styles.itemText, { color: colors.textSoft }]}>{favoriteLines.length} opgeslagen · ster bij een lijn in het tabblad Lijnen van een haltebord</Text>
            </View>
          </View>
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <View style={styles.row}>
            <Ionicons name="time-outline" size={22} color={colors.textSoft} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Recente haltes</Text>
              <Text style={[styles.itemText, { color: colors.textSoft }]}>{recentStops.length} bewaard op dit toestel</Text>
            </View>
            <Pressable onPress={confirmClearRecents} disabled={!recentStops.length} accessibilityRole="button"
              accessibilityLabel="Recente haltes wissen" accessibilityState={{ disabled: !recentStops.length }}
              style={[styles.clearButton, { borderColor: colors.border, opacity: recentStops.length ? 1 : 0.4 }]}>
              <Text style={{ color: colors.accentText, fontWeight: "800", fontSize: 12 }}>Wissen</Text>
            </Pressable>
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.row}>
            <Ionicons name="information-circle" size={22} color={colors.textSoft} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Over OVbord</Text>
              <Text style={[styles.itemText, { color: colors.textSoft }]}>Live vertrekborden en ritinformatie voor Nederland.</Text>
            </View>
          </View>
          <Text style={[styles.version, { color: colors.textMuted }]}>OVbord app · versie {appConfig.expo.version} · {UPDATE.label}</Text>
          {UPDATE.detail ? <Text style={[styles.versionDetail, { color: colors.textMuted }]} selectable>{UPDATE.detail}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, scroll: { flex: 1 }, headerRow: { paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }, headerCopy: { flex: 1 }, title: { fontSize: 27, fontWeight: "800" }, subtitle: { marginTop: 4, fontSize: 13 }, content: { padding: 16, gap: 10 }, card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10 }, cardTitle: { fontSize: 16, fontWeight: "800" }, itemText: { fontSize: 13, marginTop: 3 }, row: { flexDirection: "row", alignItems: "center", gap: 10 }, separator: { height: 1 }, segmented: { borderRadius: 14, padding: 4, flexDirection: "row" }, segmentItem: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 }, segmentText: { fontWeight: "700" }, version: { fontSize: 12, marginTop: 2 }, versionDetail: { fontSize: 11, marginTop: -6 }, clearButton: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 }
});
