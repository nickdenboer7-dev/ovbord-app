import * as Updates from "expo-updates";
import React, { useEffect, useRef, useState } from "react";
import { Alert, AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppProvider";
import { createUpdatePoller } from "../lib/updateAvailability";

export function AppUpdateNotice() {
  const status = Updates.useUpdates();
  const current = useRef(status);
  current.current = status;
  const { colors } = useApp();
  const insets = useSafeAreaInsets();
  const [restarting, setRestarting] = useState(false);
  const restartInProgress = useRef(false);
  useEffect(() => {
    const poll = createUpdatePoller({
      enabled: Updates.isEnabled,
      busy: () => current.current.isStartupProcedureRunning || current.current.isChecking || current.current.isDownloading,
      pending: () => current.current.isUpdatePending,
      check: Updates.checkForUpdateAsync,
      download: Updates.fetchUpdateAsync
    });
    const check = () => { if (AppState.currentState === "active") void poll(); };
    check();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") check(); });
    const interval = setInterval(check, 300000);
    return () => { subscription.remove(); clearInterval(interval); };
  }, []);
  if (!Updates.isEnabled || !status.isUpdatePending) return null;
  const restart = async () => {
    if (restartInProgress.current) return;
    restartInProgress.current = true;
    setRestarting(true);
    try { await Updates.reloadAsync(); }
    catch {
      restartInProgress.current = false;
      setRestarting(false);
      Alert.alert("Opnieuw starten lukt niet", "Probeer het nog eens.");
    }
  };
  return <View style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
    <Text accessibilityRole="alert" style={[styles.label, { color: colors.text }]}>Update klaar</Text>
    <Pressable onPress={() => void restart()} disabled={restarting || status.isRestarting}
      accessibilityRole="button" accessibilityLabel="Opnieuw starten met de nieuwe versie"
      accessibilityState={{ disabled: restarting || status.isRestarting }}
      style={[styles.button, { backgroundColor: colors.accent, opacity: restarting ? 0.65 : 1 }]}>
      <Text style={styles.buttonText}>{restarting ? "Opnieuw starten…" : "Opnieuw starten"}</Text>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  label: { flex: 1, fontSize: 14, fontWeight: "600" },
  button: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9 },
  buttonText: { color: "#fff", fontSize: 13, fontWeight: "800" }
});
