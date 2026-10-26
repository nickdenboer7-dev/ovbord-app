import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import React, { useEffect, useState } from "react";
import { Alert, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import appConfig from "../app.json";
import { useApp } from "../context/AppProvider";
import {
  APK_DISMISS_MS, createApkReleasePoller, parseApkDismissal, shouldShowApkRelease,
  type ApkRelease, type ApkDismissal
} from "../lib/apkRelease";
import { fetchApprovedApkRelease } from "../lib/apkReleaseCheck";

const DISMISSAL_KEY = "ovbord.apkUpdateDismissal";
const INSTALLED_VERSION_CODE = appConfig.expo.android.versionCode;

/** Only announces a separately approved APK; it never installs or downloads one in the background. */
export function AppBinaryUpdateNotice() {
  const updateStatus = Updates.useUpdates();
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [release, setRelease] = useState<ApkRelease | null>(null);
  const [dismissed, setDismissed] = useState<ApkDismissal | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let mounted = true;
    void AsyncStorage.getItem(DISMISSAL_KEY).then((raw) => {
      if (mounted) setDismissed(parseApkDismissal(raw));
    }).catch(() => {}).finally(() => { if (mounted) setLoaded(true); });
    const poll = createApkReleasePoller({
      check: async () => {
        const next = await fetchApprovedApkRelease(INSTALLED_VERSION_CODE);
        if (mounted) setRelease(next);
      }
    });
    const check = () => { if (AppState.currentState === "active") void poll(); };
    check();
    const sub = AppState.addEventListener("change", state => { if (state === "active") check(); });
    const timer = setInterval(check, 30 * 60_000);
    return () => { mounted = false; sub.remove(); clearInterval(timer); };
  }, []);

  if (Platform.OS !== "android" || !loaded || updateStatus.isUpdatePending ||
      !shouldShowApkRelease(release, dismissed, Date.now())) return null;

  const later = () => {
    const next = { versionCode: release!.versionCode, until: Date.now() + APK_DISMISS_MS };
    setDismissed(next);
    void AsyncStorage.setItem(DISMISSAL_KEY, JSON.stringify(next)).catch(() => {});
  };
  const openApk = () => {
    void Linking.openURL(release!.apkUrl).catch(() =>
      Alert.alert("Download openen lukt niet", "Controleer de internetverbinding en probeer opnieuw."));
  };
  return <View style={[styles.bar, {
    backgroundColor: colors.surface, borderTopColor: colors.border,
    paddingBottom: Math.max(insets.bottom, 8)
  }]}>
    <View style={styles.copy}>
      <Text maxFontSizeMultiplier={1.3} accessibilityRole="alert"
        style={[styles.title, { color: colors.text }]}>Nieuwe appversie {release!.version}</Text>
      <Text maxFontSizeMultiplier={1.3} style={[styles.detail, { color: colors.textSoft }]}>
        {release!.notes || "Nieuwe Android-functies beschikbaar."} · Android vraagt je toestemming voor installatie.
      </Text>
    </View>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="Deze update later bekijken"
        onPress={later} style={styles.later}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.laterText, { color: colors.textSoft }]}>Later</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={"APK " + release!.version + " downloaden"}
        onPress={openApk} style={[styles.button, { backgroundColor: colors.accent }]}>
        <Text maxFontSizeMultiplier={1.3} style={styles.buttonText}>APK downloaden</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 10, gap: 9 },
  copy: { gap: 3 },
  title: { fontSize: 14, fontWeight: "800" },
  detail: { fontSize: 11.5, lineHeight: 16 },
  actions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10 },
  later: { minHeight: 42, justifyContent: "center", paddingHorizontal: 12 },
  laterText: { fontSize: 12.5, fontWeight: "700" },
  button: { minHeight: 42, justifyContent: "center", paddingHorizontal: 14, borderRadius: 9 },
  buttonText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" }
});
