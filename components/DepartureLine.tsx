import React, { useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useApp } from "../context/AppProvider";
import { departureClockDelay, departureLineLabel, departureLineStatus } from "../lib/departureLine";
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
  detail?: { text: string; icon?: any; warn?: boolean; label?: string };
  note?: string;
  size?: "board" | "list";
  last?: boolean;
};

/** Line on the left, destination/status in the middle, expected clock and delay on the right. */
export function DepartureLine({ item, nowMs, onPress, stale = false, tooTight = false, carrier, detail, note,
  size = "board", last = false }: Props) {
  const { colors } = useApp();
  const large = largeText(useWindowDimensions().fontScale);
  const departed = item.departed === true && item.cancelled !== true;
  const status = departureLineStatus(item, nowMs, { stale, tooTight, note });
  const { clock } = departurePresentation(item, nowMs);
  const delay = departureClockDelay(item);
  const opensTrip = Boolean(onPress) && Boolean(item.ritId) && !departed;
  const list = size === "list";
  const [bodyWidth, setBodyWidth] = useState<number>();
  const statusIsLive = status.tone === "live";
  const statusTail = statusIsLive ? status.text.slice(4) : status.text;
  const right = clock;
  const rightColor = item.cancelled === true ? colors.danger : departed ? colors.textSoft : colors.text;
  const visibleDetail = departed ? undefined : detail;
  return (
    <Pressable onPress={onPress} disabled={!onPress || departed}
      accessibilityRole={onPress && !departed ? "button" : undefined}
      accessibilityLabel={departureLineLabel(item, nowMs, status, opensTrip)}
      style={({ pressed }) => [styles.row, list ? styles.rowList : styles.rowBoard,
        large && styles.rowLarge, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        tooTight && !departed && styles.dim, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <View style={styles.badge}>
        <LijnBadge line={item.line} carrier={item.carrier || carrier} tone="plain" compact={list} />
      </View>
      <View style={styles.body} onLayout={large ? (event: LayoutChangeEvent) => setBodyWidth(Math.floor(event.nativeEvent.layout.width)) : undefined}>
        <Text style={[styles.destination, list && styles.destinationList, { color: colors.text }]}
          maxFontSizeMultiplier={wordFitScale(item.destination, bodyWidth, list ? 14.5 : 16, 1.5)} numberOfLines={1} ellipsizeMode="tail">
          {item.destination}
        </Text>
        {departed ? <View style={styles.departedStatus}>
          <Text style={[styles.departedLabel, { backgroundColor: colors.heading, color: colors.surface }]}
            maxFontSizeMultiplier={1.3}>Vertrokken</Text>
        </View> : <Text style={[styles.sub, { color: colors.textSoft }]}
          maxFontSizeMultiplier={wordFitScale(status.text, bodyWidth, 12.5, 1.3)}
          numberOfLines={large ? 3 : 2}>
          {statusIsLive ? <><Text style={{ color: colors.success }}>Live</Text>{statusTail}</> : statusTail}
        </Text>}
        {visibleDetail ? <Text style={[styles.sub,{color:colors.textSoft}]} maxFontSizeMultiplier={1.3}>{visibleDetail.text}</Text> : null}
        {visibleDetail?.label ? <Text style={[styles.sub,{color:visibleDetail.warn?colors.delayWarning:colors.accentText}]} maxFontSizeMultiplier={1.3}>{visibleDetail.label} · schatting</Text> : null}
      </View>
      <View style={styles.clockColumn}>
        <Text style={[styles.right, list && styles.rightList, large && styles.clockLarge, { color: rightColor },
          item.cancelled === true && styles.cancelledClock]} maxFontSizeMultiplier={1.3}
          numberOfLines={1}>{right}</Text>
        {delay ? <Text style={[styles.clockDelay, { color: delay.tone === "red" ? colors.danger : colors.delayWarning }]}
          maxFontSizeMultiplier={1.3}>{delay.text}</Text> : null}
      </View>
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
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 15 },
  rowBoard: { minHeight: 66, paddingVertical: 10 },
  rowList: { minHeight: 54, paddingVertical: 8, paddingHorizontal: 0, gap: 10 },
  rowLarge: { gap: 8 },
  dim: { opacity: 0.55 },
  badge: { alignSelf: "flex-start", minWidth: 44, alignItems: "center" },
  body: { flex: 1, minWidth: 0, gap: 3 },
  destination: { fontSize: 16, lineHeight: 32, fontWeight: "600" },
  destinationList: { fontSize: 14.5, lineHeight: 27 },
  sub: { fontSize: 12.5, lineHeight: 17 },
  departedStatus: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  departedLabel: { fontSize: 11.5, lineHeight: 17, fontWeight: "700", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  clockColumn: { flexShrink: 0, alignItems: "flex-end", minWidth: 62 },
  clockDelay: { fontSize: 12.5, lineHeight: 19, fontWeight: "700", textAlign: "right" },
  right: { fontSize: 20, lineHeight: 32, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "right", width: 62, flexShrink: 0 },
  rightList: { fontSize: 17, lineHeight: 27, width: 55 },
  clockLarge: { width: 78 },
  cancelledClock: { textDecorationLine: "line-through" },
  heading: { flexDirection: "row", paddingHorizontal: 15, paddingVertical: 7 },
  headingText: { fontSize: 13, fontWeight: "800" }
});
