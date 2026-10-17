import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { BackHandler, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppProvider";

export type MenuItem = {
  key: string;
  label: string;
  /** One short line under the label. */
  description?: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  /** A setting: a switch at the end; the panel stays open when it is flipped. */
  checked?: boolean;
  danger?: boolean;
  /** Options are shown in groups; a new number starts a new group. */
  group?: number;
};

/** The ⋮ button. */
export function MenuButton({ onPress, color, label = "Meer opties" }: { onPress: () => void; color: string; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={styles.button}>
      <Ionicons name="ellipsis-vertical" size={21} color={color} />
    </Pressable>
  );
}

/**
 * Options that do not need to be on screen all the time, opened with ⋮: a panel at
 * the bottom of the screen, within reach of the thumb. A plain overlay, not a Modal
 * (in the Android build taps on Modal items closed the menu without running the
 * option). Render it as the last child of the screen. Android Back closes it.
 */
export function OverflowMenu({ open, onClose, items, title = "Meer opties" }: { open: boolean; onClose: () => void; items: MenuItem[]; title?: string }) {
  const { colors, resolvedScheme } = useApp();
  const insets = useSafeAreaInsets();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { closeRef.current(); return true; });
    return () => subscription.remove();
  }, [open]);
  if (!open) return null;
  return (
    <View style={styles.overlay}>
      {/* Backdrop and panel are siblings: a tap on an option never reaches the backdrop. */}
      <Pressable style={[styles.backdrop, { backgroundColor: resolvedScheme === "dark" ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.28)" }]}
        onPress={onClose} accessibilityLabel="Menu sluiten" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 10) + 6, backgroundColor: colors.surface }]} accessibilityRole="menu">
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Sluiten" hitSlop={8}
            style={[styles.close, { backgroundColor: colors.surfaceSoft }]}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.list} bounces={false}>
          {items.map((item, index) => {
            const newGroup = index > 0 && (item.group ?? 0) !== (items[index - 1].group ?? 0);
            const setting = item.checked !== undefined;
            return (
              <React.Fragment key={item.key}>
                {newGroup ? <View style={[styles.groupGap, { borderTopColor: colors.border }]} /> : null}
                <Pressable accessibilityRole={setting ? "switch" : "menuitem"} accessibilityState={setting ? { checked: item.checked } : undefined}
                  accessibilityLabel={item.label + (item.description ? ". " + item.description : "")}
                  // The option runs first; closing afterwards cannot cancel it. A switch keeps the panel open.
                  onPress={() => { item.onPress(); if (!setting) onClose(); }}
                  style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surfaceSoft }]}>
                  <Ionicons name={item.icon} size={22} color={item.danger ? colors.danger : colors.text} />
                  <View style={styles.itemText}>
                    <Text style={[styles.label, { color: item.danger ? colors.danger : colors.text }]}>{item.label}</Text>
                    {item.description ? <Text style={[styles.description, { color: colors.textMuted }]} selectable>{item.description}</Text> : null}
                  </View>
                  {setting ? <Switch value={item.checked} onValueChange={() => item.onPress()} accessibilityElementsHidden
                    importantForAccessibility="no" trackColor={{ false: colors.border, true: colors.accent }} thumbColor="#FFFFFF" /> : null}
                </Pressable>
              </React.Fragment>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 42, alignItems: "center", justifyContent: "center" },
  overlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, zIndex: 100, elevation: 100 },
  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "85%", borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 8, elevation: 12 },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, marginBottom: 6 },
  head: { flexDirection: "row", alignItems: "center", paddingLeft: 20, paddingRight: 14, paddingBottom: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: "900" },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  list: { flexGrow: 0 },
  item: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 22, paddingVertical: 10 },
  itemText: { flex: 1, minWidth: 0 },
  label: { fontSize: 16, fontWeight: "500" },
  description: { fontSize: 13, lineHeight: 17, marginTop: 2 },
  groupGap: { marginHorizontal: 22, marginVertical: 6, borderTopWidth: StyleSheet.hairlineWidth }
});
