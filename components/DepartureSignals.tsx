import React from "react";
import { Text } from "react-native";
import { useApp } from "../context/AppProvider";
import type { DepartureItem } from "../types/api";

/** Only show trends measured over two or more independent backend observations. */
export function TrendChip({ item }: { item: DepartureItem }) {
  const { colors } = useApp();
  if (!item.trend || (item.trendSamples || 0) < 2) return null;
  const direction = item.trend === "up" ? "↑" : item.trend === "down" ? "↓" : "→";
  const change = item.trend === "flat" ? 0 : Math.abs(item.trendDeltaMinutes || 0);
  const label = item.trend === "flat" ? "→ stabiel" : direction + " " + change + " min";
  const description = item.trend === "up" ? "Vertraging neemt toe" :
    item.trend === "down" ? "Vertraging neemt af" : "Vertraging blijft stabiel";
  const color = item.trend === "up" ? colors.danger : item.trend === "down" ? colors.accentText : colors.textSoft;
  return <Text accessibilityLabel={description + " · " + change + " minuten verandering"} style={{ color, fontSize: 10, fontWeight: "800" }}>{label}</Text>;
}
