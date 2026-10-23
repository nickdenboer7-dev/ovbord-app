import React, { useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useApp } from "../context/AppProvider";
import { departureDelayLabel, departureLineLabel, departureLineStatus } from "../lib/departureLine";
import { departurePresentation } from "../lib/departurePresentation";
import { largeText, wordFitScale } from "../lib/textScale";
import type { DepartureItem } from "../types/api";
import { LijnBadge } from "./LijnBadge";

type Props = {
  item: DepartureItem;
  nowMs: number;
  onPress?: () => void;
  stale?: boolean;
  tooTight?: boolean;
  carrier?: string;
  detail?: { text: string; icon?: any; warn?: boolean };
  note?: string;
  size?: "board" | "list";
  last?: boolean;
};

/** Flat Concept C row: line, destination, departure clock; secondary live information. */
export function DepartureLine({ item, nowMs, onPress, stale = false, tooTight = false, carrier, detail, note,
  size = "board", last = false }: Props) {
  const { colors } = useApp();
  const large = largeText(useWindowDimensions().fontScale);
  const departed = item.departed === true && item.cancelled !== true;
  const status = departureLineStatus(item, nowMs, { stale, tooTight, note });
  const { clock } = departurePresentation(item, nowMs);
  const delay = departureDelayLabel(item);
  const opensTrip = Boolean(onPress) && Boolean(item.ritId) && !departed;
  const list = size === "list";
  const [bodyWidth, setBodyWidth] = useState<number>();
  const statusTail = status.text.startsWith("Live · ") ? status.text.slice(4) : status.text;
  const statusIsLive = status.text.startsWith("Live · ");
  const right = item.cancelled === true ? "Rijdt niet" : departed ? "Vertrokken" : clock;
  const rightColor = item.cancelled === true ? colors.danger : departed ? colors.textMuted : colors.text;
  const extra = [delay?.text, detail?.text].filter(Boolean).join(" · ");
  return (
    <Pressable onPress={onPress} disabled={!onPress || departed}
      accessibilityRole={onPress && !departed ? "button" : undefined}
      accessibilityLabel={departureLineLabel(item, nowMs, status, opensTrip)}
      style={({ pressed }) => [styles.row, list ? styles.rowList : styles.rowBoard,
        large && styles.rowLarge, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        (tooTight || departed) && styles.dim, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <View style={styles.badge}>
        <LijnBadge line={item.line} carrier={item.carrier || carrier} tone="plain" compact={list} />
      </View>
      <View style={styles.body} onLayout={large ? (event: LayoutChangeEvent) => setBodyWidth(Math.floor(event.nativeEvent.layout.width)) : undefined}>
        <Text style={[styles.destination, list && styles.destinationList, { color: colors.text }]}
          maxFontSizeMultiplier={wordFitScale(item.destination, bodyWidth, list ? 14.5 : 16, 1.5)} numberOfLines={2}>
          {item.destination}
        </Text>
        <Text style={[styles.sub, { color: colors.textSoft }]}
          maxFontSizeMultiplier={wordFitScale(status.text + extra, bodyWidth, 12.5, 1.3)}
          numberOfLines={large ? 3 : 2}>
          {statusIsLive ? <><Text style={{ color: colors.success }}>Live</Text>{statusTail}</> : statusTail}
          {extra ? " · " : ""}
          {delay ? <Text style={{ color: delay.late ? colors.danger : colors.success }}>{delay.text}</Text> : null}
          {delay && detail ? " · " : null}
          {detail ? <Text style={{ color: detail.warn ? colors.danger : colors.textSoft }}>{detail.text}</Text> : null}
        </Text>
      </View>
      <Text style={[styles.right, list && styles.rightList, { color: rightColor },
        (item.cancelled === true || departed) && styles.rightWord]} maxFontSizeMultiplier={1.3}
        numberOfLines={1}>{right}</Text>
    </Pressable>
  );
}
export function DepartureHeading({ title, star = false }: { title: string; star?: boolean }) {
  const { colors } = useApp();
  return (
    <View style={[styles.heading, { backgroundColor: colors.surface }]} accessibilityRole="header">
      <Text style={[styles.headingText, { color: colors.heading }]}>{star ? "★  " : ""}{title}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15 },
  rowBoard: { minHeight: 66, paddingVertical: 10 },
  rowList: { minHeight: 54, paddingVertical: 8, paddingHorizontal: 0, gap: 10 },
  rowLarge: { gap: 8 },
  dim: { opacity: 0.55 },
  badge: { alignSelf: "center", minWidth: 44, alignItems: "center" },
  body: { flex: 1, minWidth: 0, gap: 3 },
  destination: { fontSize: 16, lineHeight: 21, fontWeight: "600" },
  destinationList: { fontSize: 14.5, lineHeight: 19 },
  sub: { fontSize: 12.5, lineHeight: 17 },
  right: { fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "right", minWidth: 62 },
  rightList: { fontSize: 17 },
  rightWord: { fontSize: 13, fontWeight: "900" },
  heading: { flexDirection: "row", paddingHorizontal: 15, paddingVertical: 7 },
  headingText: { fontSize: 13, fontWeight: "800" }
});
