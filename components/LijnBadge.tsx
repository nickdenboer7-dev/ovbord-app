import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { getVervoerderStyle, inferCarrierFromLine } from "../constants/vervoerders";

type Props = { line: string; carrier?: string; compact?: boolean };

export function LijnBadge({ line, carrier, compact = false }: Props) {
  const palette = getVervoerderStyle(inferCarrierFromLine(line, carrier));
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, minHeight: compact ? 26 : 32, paddingHorizontal: compact ? 8 : 10 }]}>
      <Text style={[styles.text, { color: palette.text, fontSize: compact ? 12 : 13 }]} numberOfLines={1}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  text: { fontWeight: "800" }
});
