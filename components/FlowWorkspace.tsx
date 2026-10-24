import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { useApp } from "../context/AppProvider";
import { BackHandler, StyleSheet, View } from "react-native";
import { useFlowNavigation } from "../context/FlowNavigation";
import { FlowBoard } from "./FlowBoard";
import { DepartureSkeleton } from "./DepartureSkeleton";

/** Invisible earlier boards stay mounted. The FlatList offset and open journey survive back navigation. */
export function FlowWorkspace() {
  const { screens, back, pendingStopName, pendingStopError, clearPendingError } = useFlowNavigation();
  const { colors } = useApp();
  const router = useRouter();
  const goBack = useCallback(() => {
    const current = screens[screens.length - 1];
    back();
    if (current?.returnTrip?.id) {
      router.push({ pathname: "/rit/[id]", params: current.returnTrip });
    }
  }, [back, router, screens]);

  // OVBORD_FLOW4_FOCUS_BACK: do not swallow Android Back while /rit/[id] is the focused screen.
  useFocusEffect(useCallback(() => {
    if (screens.length === 0) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      goBack();
      return true;
    });
    return () => subscription.remove();
  }, [screens.length, goBack]));
  return (
    <View style={styles.workspace}>
      {screens.map((screen, index) => {
        const visible = index === screens.length - 1;
        return (
          <View
            key={screen.key}
            style={[styles.layer, !visible && styles.hidden]}
            pointerEvents={visible ? "auto" : "none"}
            accessibilityElementsHidden={!visible}
            importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
          >
            <FlowBoard
              key={screen.stop.id}
              stop={screen.stop}
              initialBoard={screen.initialBoard}
              initialFetchedAt={screen.initialFetchedAt}
              initialStale={screen.initialStale}
              initialLine={screen.initialLine}
              visible={visible}
              onBack={goBack}
            />
          </View>
        );
      })}
      {pendingStopName ? (
        <View style={[styles.pendingScreen, { backgroundColor: colors.background }]}>
          <View style={[styles.pendingHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[styles.pendingTitle, { color: colors.heading }]} numberOfLines={2}>{pendingStopName}</Text>
            <Text style={[styles.noticeText, { color: colors.textSoft }]}>Vertrektijden laden…</Text>
          </View>
          <DepartureSkeleton />
        </View>
      ) : pendingStopError ? (
        <Pressable onPress={clearPendingError} accessibilityRole="button" accessibilityLabel={pendingStopError + ". Sluiten"} style={[styles.notice, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={[styles.noticeText, { color: colors.text }]} numberOfLines={2}>{pendingStopError}</Text>
          <Ionicons name="close" size={16} color={colors.textSoft} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1 },
  layer: { flex: 1 },
  hidden: { display: "none" },
  notice: { position: "absolute", bottom: 12, left: 12, right: 12, padding: 13, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  noticeText: { flex: 1, fontSize: 12.5, fontWeight: "700" },
  pendingScreen: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 50 },
  pendingHeader: { paddingTop: 58, paddingHorizontal: 18, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  pendingTitle: { fontSize: 21, lineHeight: 27, fontWeight: "800", marginBottom: 6 }
});
