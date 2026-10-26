import { Ionicons } from "@expo/vector-icons";
import * as Updates from "expo-updates";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React, { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appConfig from "../../app.json";
import type { ThemeMode } from "../../constants/colors";
import { useApp } from "../../context/AppProvider";
import { updateInfoRows } from "../../lib/appVersion";
import { MANUAL_CITIES } from "../../lib/location";
import type { DepartureTimeMode, MaxWalkMinutes, WalkBufferMinutes } from "../../lib/userSettings";
import { STOP_BOARD_BLUE } from "../../lib/stopBoardDesign";

const UPDATE_ROWS = updateInfoRows({
  isDev: __DEV__,
  isEnabled: Updates.isEnabled,
  isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  createdAt: Updates.createdAt,
  channel: Updates.channel,
  updateId: Updates.updateId
}, appConfig.expo.version);
type IconName = React.ComponentProps<typeof Ionicons>["name"];

function Section({ title, icon, children }: { title: string; icon: IconName; children: React.ReactNode }) {
  const { colors } = useApp();
  return <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={styles.sectionHead}>
      <View style={styles.sectionIcon}><Ionicons name={icon} color="#fff" size={17} /></View>
      <Text maxFontSizeMultiplier={1.3} style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">{title}</Text>
    </View>
    {children}
  </View>;
}

function Divider() {
  const { colors } = useApp();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

function Choices<T extends string | number>({ value, options, onChange, label }: {
  value: T; options: readonly { key: T; label: string }[]; onChange: (next: T) => void; label: string;
}) {
  const { colors } = useApp();
  return <View style={[styles.choices, { backgroundColor: colors.surfaceAlt }]} accessibilityRole="radiogroup">
    {options.map(option => {
      const active = option.key === value;
      return <Pressable key={String(option.key)} accessibilityRole="radio" accessibilityLabel={label + ": " + option.label}
        accessibilityState={{ checked: active }} onPress={() => onChange(option.key)}
        style={[styles.choice, active && { backgroundColor: STOP_BOARD_BLUE }]}>
        <Text style={[styles.choiceText, { color: active ? "#fff" : colors.text }]}
          maxFontSizeMultiplier={1.3} adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1}>{option.label}</Text>
      </Pressable>;
    })}
  </View>;
}

function ToggleRow({ label, hint, value, onChange, last = false }: {
  label: string; hint?: string; value: boolean; onChange: (next: boolean) => void; last?: boolean;
}) {
  const { colors } = useApp();
  return <>
    <View style={styles.toggleRow}>
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.text }]}>{label}</Text>
        {hint ? <Text maxFontSizeMultiplier={1.3} style={[styles.hint, { color: colors.textSoft }]}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label}
        trackColor={{ false: colors.border, true: "#38A36E" }} thumbColor="#FFFFFF" />
    </View>
    {!last ? <Divider /> : null}
  </>;
}

function ChoiceRow<T extends string | number>({ label, hint, value, options, onChange, last = false }: {
  label: string; hint?: string; value: T; options: readonly { key: T; label: string }[];
  onChange: (next: T) => void; last?: boolean;
}) {
  const { colors } = useApp();
  return <>
    <View style={styles.choiceRow}>
      <Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.text }]}>{label}</Text>
      {hint ? <Text maxFontSizeMultiplier={1.3} style={[styles.hint, { color: colors.textSoft }]}>{hint}</Text> : null}
      <Choices value={value} options={options} onChange={onChange} label={label} />
    </View>
    {!last ? <Divider /> : null}
  </>;
}

export default function MeerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, themeMode, setThemeMode, manualCity, setManualCity, settings, setSetting,
    favoriteStops, favoriteJourneys, favoriteLines, recentStops, clearRecentStops } = useApp();
  const [locationOpen, setLocationOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));

  const confirmClearRecents = () => Alert.alert("Recente haltes wissen?",
    "De lijst met onlangs bekeken haltes wordt leeggemaakt. Favorieten blijven bewaard.", [
      { text: "Annuleren", style: "cancel" },
      { text: "Wissen", style: "destructive", onPress: clearRecentStops }
    ]);

  const locationName = MANUAL_CITIES.find(city => city.key === manualCity)?.name || "GPS automatisch";
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    {focused ? <ExpoStatusBar style="light" /> : null}
    <View style={[styles.header, { paddingTop: Math.max(insets.top, 24) + 10 }]}>
      <Text maxFontSizeMultiplier={1.3} style={styles.headerTitle} accessibilityRole="header">Instellingen</Text>
      <Text maxFontSizeMultiplier={1.3} style={styles.headerSubtitle}>Maak OVbord persoonlijk</Text>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 30 }]}>
      <Section title="Weergave" icon="color-palette-outline">
        <ChoiceRow label="Thema" value={themeMode} onChange={setThemeMode}
          options={[{ key: "light" as ThemeMode, label: "Licht" }, { key: "dark" as ThemeMode, label: "Donker" },
            { key: "system" as ThemeMode, label: "Systeem" }]} />
        <ChoiceRow label="Vertrektijden" hint="Op het haltebord" value={settings.departureTimeMode}
          onChange={(value: DepartureTimeMode) => setSetting("departureTimeMode", value)}
          options={[{ key: "both", label: "Klok + min" }, { key: "clock", label: "Klok" },
            { key: "minutes", label: "Minuten" }]} last />
      </Section>

      <Section title="Reisadvies" icon="bus-outline">
        <ToggleRow label="Slimme haltekeuze" hint="Kies een beter bereikbare halte voor dezelfde rit"
          value={settings.smartStopChoice} onChange={value => setSetting("smartStopChoice", value)} />
        <ChoiceRow label="Maximaal lopen" hint="Voor het beste vertrekadvies" value={settings.maxWalkMinutes}
          onChange={(value: MaxWalkMinutes) => setSetting("maxWalkMinutes", value)}
          options={[{ key: 5, label: "5 min" }, { key: 10, label: "10 min" }, { key: 15, label: "15 min" }]} />
        <ChoiceRow label="Loopmarge" hint="Extra tijd om ontspannen je halte te halen" value={settings.walkBufferMinutes}
          onChange={(value: WalkBufferMinutes) => setSetting("walkBufferMinutes", value)}
          options={[{ key: 3, label: "3 min" }, { key: 5, label: "5 min" }, { key: 10, label: "10 min" }]} last />
      </Section>

      <Section title="Haltebord & Buurtbord" icon="star-outline">
        <ToggleRow label="Live ritten vooraan" hint="Sorteer actuele ritten vóór geplande ritten"
          value={settings.liveFirst} onChange={value => setSetting("liveFirst", value)} />
        <ToggleRow label="Dagscheidingen" hint="Toon de scheiding bij ruim een uur zonder vertrek"
          value={settings.daySeparators} onChange={value => setSetting("daySeparators", value)} />
        <ToggleRow label="Kaart op Buurtbord" value={settings.buurtbordMap}
          onChange={value => setSetting("buurtbordMap", value)} last />
      </Section>

      <Section title="Locatie & gegevens" icon="map-outline">
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: locationOpen }}
          accessibilityLabel={"Startlocatie: " + locationName}
          onPress={() => setLocationOpen(value => !value)} style={styles.linkRow}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.text }]}>Startlocatie</Text>
          <View style={styles.rowEnd}>
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.rowValue, { color: colors.textSoft }]}>{locationName}</Text>
            <Ionicons name={locationOpen ? "chevron-up" : "chevron-down"} size={18} color={colors.textSoft} />
          </View>
        </Pressable>
        {locationOpen ? <View style={styles.locationChoices}>
          {[{ key: null, name: "GPS automatisch" }, ...MANUAL_CITIES.map(city => ({ key: city.key as string | null, name: city.name }))].map(city =>
            <Pressable key={city.key || "gps"} accessibilityRole="button"
              accessibilityState={{ selected: city.key === manualCity }}
              onPress={() => { setManualCity(city.key); setLocationOpen(false); }}
              style={[styles.cityChip, { borderColor: city.key === manualCity ? STOP_BOARD_BLUE : colors.border,
                backgroundColor: city.key === manualCity ? colors.surfaceAlt : colors.surface }]}>
              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.text, fontSize: 13 }}>{city.name}</Text>
            </Pressable>
          )}
        </View> : null}
        <Divider />
        <Pressable onPress={() => router.push("/favorieten")} accessibilityRole="button"
          accessibilityLabel="Favorieten beheren" style={styles.linkRow}>
          <View style={styles.rowText}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.text }]}>Favorieten beheren</Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.hint, { color: colors.textSoft }]}>
              {favoriteStops.length} haltes · {favoriteJourneys.length} ritten · {favoriteLines.length} lijnen
            </Text>
          </View>
          <View style={styles.rowEnd}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.rowValue, { color: colors.textSoft }]}>
              {favoriteStops.length + favoriteJourneys.length + favoriteLines.length}
            </Text>
            <Ionicons name="chevron-forward" color={colors.textSoft} size={18} />
          </View>
        </Pressable>
        <Divider />
        <Pressable onPress={confirmClearRecents} disabled={!recentStops.length}
          accessibilityRole="button" accessibilityLabel="Recente haltes wissen"
          accessibilityState={{ disabled: !recentStops.length }} style={[styles.linkRow, !recentStops.length && { opacity: 0.45 }]}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.rowTitle, { color: colors.text }]}>Recente haltes ({recentStops.length})</Text>
          <Text maxFontSizeMultiplier={1.3} style={{ color: colors.danger, fontSize: 13, fontWeight: "700" }}>Wissen</Text>
        </Pressable>
      </Section>

      <Section title="Over OVbord" icon="information-circle-outline">
        <Text maxFontSizeMultiplier={1.3} style={[styles.about, { color: colors.textSoft }]}>Live vertrekborden en ritinformatie voor Nederland.</Text>
        {UPDATE_ROWS.map(row => <View key={row.label} style={styles.versionRow}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.versionLabel, { color: colors.textSoft }]} numberOfLines={1}>{row.label}</Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.versionValue, { color: colors.text }]} selectable>{row.value}</Text>
        </View>)}
        <Pressable style={styles.helpRow} accessibilityRole="link" accessibilityLabel="Uitleg over OVbord"
          onPress={() => Linking.openURL("https://ovspot.nl/uitleg#ovbord")
            .catch(() => Alert.alert("Uitleg openen lukt niet", "Open ovspot.nl/uitleg in je browser."))}>
          <Ionicons name="help-circle-outline" size={19} color={colors.textSoft} />
          <Text maxFontSizeMultiplier={1.3} style={{ color: STOP_BOARD_BLUE, fontWeight: "700" }}>Uitleg</Text>
        </Pressable>
        <Pressable style={styles.helpRow} accessibilityRole="button" accessibilityLabel="Feedback geven"
          onPress={() => router.push("/feedback")}>
          <Ionicons name="chatbubble-outline" size={19} color={colors.textSoft} />
          <Text maxFontSizeMultiplier={1.3} style={{ color: colors.textSoft, fontWeight: "700" }}>Feedback geven</Text>
        </Pressable>
      </Section>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 12, backgroundColor: STOP_BOARD_BLUE },
  headerTitle: { fontSize: 23, fontWeight: "800", color: "#FFFFFF" },
  headerSubtitle: { fontSize: 12, marginTop: 3, color: "#DCEBFA" },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 12, paddingTop: 14, gap: 12 },
  section: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 13, paddingBottom: 2, overflow: "hidden" },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 54 },
  sectionIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: STOP_BOARD_BLUE,
    justifyContent: "center", alignItems: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "800", flexShrink: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 2 },
  rowTitle: { fontSize: 14.5, fontWeight: "600" },
  hint: { fontSize: 11.5, lineHeight: 15, marginTop: 3 },
  toggleRow: { minHeight: 51, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1, minWidth: 0 },
  choiceRow: { paddingVertical: 10, gap: 5 },
  choices: { flexDirection: "row", borderRadius: 9, padding: 3, gap: 3 },
  choice: { flex: 1, minHeight: 37, paddingHorizontal: 5, justifyContent: "center", alignItems: "center", borderRadius: 7 },
  choiceText: { fontSize: 12.5, fontWeight: "700", textAlign: "center" },
  linkRow: { minHeight: 51, paddingVertical: 7, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowEnd: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  rowValue: { fontSize: 12.5, flexShrink: 1 },
  locationChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingBottom: 10 },
  cityChip: { borderWidth: 1, borderRadius: 18, paddingVertical: 7, paddingHorizontal: 11, minHeight: 35 },
  about: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  versionRow: { flexDirection: "row", gap: 9, marginBottom: 6 },
  versionLabel: { width: 92, fontSize: 12 },
  versionValue: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: "600" },
  helpRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8 }
});
