import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { getVervoerderStyle, inferCarrierFromLine } from "../constants/vervoerders";

type Props = { line: string; carrier?: string; compact?: boolean };

export function LijnBadge({ line, carrier, compact = false }: Props) {
  const resolvedCarrier = inferCarrierFromLine(line, carrier);
  const palette = getVervoerderStyle(resolvedCarrier, line);

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: palette.bg,
          minHeight: compact ? 27 : 32,
          paddingHorizontal: compact ? 8 : 10
        }
      ]}
    >
      <Text
        style={[styles.text, { color: palette.text, fontSize: compact ? 12.5 : 13.5 }]}
        numberOfLines={1}
      >
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    minWidth: 34
  },
  text: { fontWeight: "900", letterSpacing: -0.1 }
});
