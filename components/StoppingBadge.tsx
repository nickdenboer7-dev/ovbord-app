import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";

export function StoppingBadge({ text }: { text?: string }) {
  const { colors } = useApp();
  if (!text) return null;
  return (
    <View style={[styles.badge, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}> 
      <Text style={[styles.text, { color: colors.danger }]} numberOfLines={2}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start" },
  text: { fontSize: 12, fontWeight: "700" }
});
