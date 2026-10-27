import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";
import { getVervoerderStyle, inferCarrierFromLine } from "../constants/vervoerders";
import { compactTrainLineLabel } from "../lib/trainLineLabel";
import { modeBadgeColors } from "../lib/lineColors";
import { stopBoardLineBadge } from "../lib/stopBoardDesign";
import { accentGreen } from "../constants/colors";
import type { Mode } from "../types/api";

/** tone "mode": a colour per kind of transport (metro red, tram and bus blue); give the mode.
 * tone "accent": OVbord green, for the white trip header (V5.7). */
type Props = { line: string; carrier?: string; compact?: boolean; tone?: "carrier" | "flow" | "mode" | "accent" | "plain" | "board";
  mode?: Mode; routeId?: string; routeColor?: string; routeTextColor?: string };

export function LijnBadge({ line, carrier, compact = false, tone = "carrier", mode,
  routeId, routeColor, routeTextColor }: Props) {
  const { colors } = useApp();
  const resolvedCarrier = inferCarrierFromLine(line, carrier);
  const palette = getVervoerderStyle(resolvedCarrier, line);
  const badgeLine = compactTrainLineLabel(line, resolvedCarrier);
  const byMode = tone === "mode" ? modeBadgeColors(mode) : null;
  const boardBadge = tone === "board" ? stopBoardLineBadge({ line, carrier, mode, routeId, routeColor, routeTextColor }) : null;

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone === "plain" ? colors.surface : boardBadge ? boardBadge.bg : byMode ? byMode.bg : tone === "flow" ? "#1767D2" : tone === "accent" ? accentGreen : palette.bg,
          borderWidth: tone === "plain" ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
          minHeight: compact ? 27 : 32,
          paddingHorizontal: compact ? 8 : 10
        }
      ]}
    >
      <Text
        style={[styles.text, { color: tone === "plain" ? colors.text : boardBadge ? boardBadge.text : byMode ? byMode.text : tone === "flow" || tone === "accent" ? "#FFFFFF" : palette.text, fontSize: compact ? 12.5 : 13.5 }]}
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
