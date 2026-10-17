import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { getVervoerderStyle, inferCarrierFromLine } from "../constants/vervoerders";
import { compactTrainLineLabel } from "../lib/trainLineLabel";
import { modeBadgeColors } from "../lib/lineColors";
import type { Mode } from "../types/api";

/** tone "mode": a colour per kind of transport (metro red, tram and bus blue); give the mode. */
type Props = { line: string; carrier?: string; compact?: boolean; tone?: "carrier" | "flow" | "mode"; mode?: Mode };

export function LijnBadge({ line, carrier, compact = false, tone = "carrier", mode }: Props) {
  const resolvedCarrier = inferCarrierFromLine(line, carrier);
  const palette = getVervoerderStyle(resolvedCarrier, line);
  const badgeLine = compactTrainLineLabel(line, resolvedCarrier);
  const byMode = tone === "mode" ? modeBadgeColors(mode) : null;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: byMode ? byMode.bg : tone === "flow" ? "#1767D2" : palette.bg,
          minHeight: compact ? 27 : 32,
          paddingHorizontal: compact ? 8 : 10
        }
      ]}
    >
      <Text
        style={[styles.text, { color: byMode ? byMode.text : tone === "flow" ? "#FFFFFF" : palette.text, fontSize: compact ? 12.5 : 13.5 }]}
        numberOfLines={1}
        // Badges sit in fixed rows next to times: grow with the system font, but not without limit.
        maxFontSizeMultiplier={1.3}
        accessibilityLabel={badgeLine !== line ? line : undefined}
      >
        {badgeLine}
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
