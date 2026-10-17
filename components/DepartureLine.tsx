import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useApp } from "../context/AppProvider";
import { departureLineLabel, departureLineStatus, departureRightText, departureSubParts, showsLive } from "../lib/departureLine";
import { largeText, wordFitScale } from "../lib/textScale";
import type { DepartureItem } from "../types/api";
import { LijnBadge } from "./LijnBadge";

type Props = {
  item: DepartureItem;
  nowMs: number;
  onPress?: () => void;
  /** The times are last known (a refresh failed or they were stored earlier). */
  stale?: boolean;
  /** Leaves before the user can walk there (Buurtbord): dimmed, not hidden. */
  tooTight?: boolean;
  /** Carrier for the badge when the row itself has none. */
  carrier?: string;
  /** Replaces the small line under the destination, e.g. walking advice on Start. */
  detail?: { text: string; icon?: React.ComponentProps<typeof Ionicons>["name"]; warn?: boolean };
  /** Appended to the small line, e.g. "was 09:40". */
  note?: string;
  /** "board": stop board and Start; "list": a little smaller, inside cards. */
  size?: "board" | "list";
  /** No separator line under the row (last row in a card). */
  last?: boolean;
};

/**
 * One departure (OVinfo style): the line, the destination with a live icon, a small
 * line with the clock, and the minutes large on the right.
 */
export function DepartureLine({ item, nowMs, onPress, stale = false, tooTight = false, carrier, detail, note,
  size = "board", last = false }: Props) {
  const { colors } = useApp();
  const large = largeText(useWindowDimensions().fontScale);
  const departed = item.departed === true && item.cancelled !== true;
  const status = departureLineStatus(item, nowMs, { stale, tooTight, note });
  const right = departureRightText(item, nowMs, { stale, tooTight });
  const sub = departureSubParts(item, nowMs, tooTight ? "te krap om te lopen" : note);
  const live = showsLive(item, stale);
  const opensTrip = Boolean(onPress) && Boolean(item.ritId) && !departed;
  const list = size === "list";
  const rightColor = right.tone === "cancelled" ? colors.danger : right.tone === "normal" ? colors.text : colors.textMuted;
  // With a large font the column for the destination is narrow (on a small phone about 120 dp). A word
  // that is wider than that is broken in the middle by Android, so the font of such a text is made
  // a little smaller, just enough to keep its longest word whole.
  const [bodyWidth, setBodyWidth] = useState<number>();
  const subText = detail ? detail.text : [sub.clock, sub.delay, sub.rest].join(" ");
  return (
    <Pressable onPress={onPress} disabled={!onPress || departed}
      accessibilityRole={onPress && !departed ? "button" : undefined}
      accessibilityLabel={detail ? departureLineLabel(item, nowMs, { tone: status.tone, text: detail.text }, opensTrip)
        : departureLineLabel(item, nowMs, status, opensTrip)}
      style={({ pressed }) => [styles.row, list ? styles.rowList : styles.rowBoard,
        large && styles.rowLarge, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        (tooTight || departed) && styles.dim, pressed && { backgroundColor: colors.surfaceSoft }]}>
      {/* LijnBadge aligns itself to the top; the wrapper centres it. */}
      <View style={[styles.badge, (list || large) && styles.badgeList]}>
        <LijnBadge line={item.line} carrier={item.carrier || carrier} tone="mode" mode={item.mode} compact={list} />
      </View>
      <View style={styles.body} onLayout={large ? (event: LayoutChangeEvent) => setBodyWidth(Math.floor(event.nativeEvent.layout.width)) : undefined}>
        {/* The live icon sits inside the text: a Text that shrinks next to a sibling in a row was
            broken in the middle of a word on Android with a large font. */}
        <Text style={[styles.destination, list && styles.destinationList, { color: colors.text }]}
          maxFontSizeMultiplier={wordFitScale(item.destination, bodyWidth, list ? 14.5 : 16, 1.5)} numberOfLines={large ? 2 : 1}>
          {item.destination}{live ? <Text style={{ color: colors.success }}>{"  "}<Ionicons name="wifi" size={14} color={colors.success} /></Text> : null}
        </Text>
        {detail ? (
          // One Text with the icon inside, like the live icon: no shrinking Text next to a sibling.
          <Text style={[styles.sub, { color: detail.warn ? colors.danger : colors.textSoft }]}
            maxFontSizeMultiplier={wordFitScale(subText, bodyWidth, 12.5, 1.3)} numberOfLines={large ? 3 : 2}>
            {detail.icon ? <Ionicons name={detail.icon} size={13} color={detail.warn ? colors.danger : colors.textSoft} /> : null}
            {detail.icon ? " " : ""}{detail.text}
          </Text>
        ) : (
          <Text style={[styles.sub, { color: colors.textSoft }]}
            maxFontSizeMultiplier={wordFitScale(subText, bodyWidth, 12.5, 1.3)} numberOfLines={large ? 2 : 1}>
            <Text style={(item.cancelled === true || departed) ? styles.struck : undefined}>{sub.clock}</Text>
            {sub.delay ? <Text style={{ color: sub.late ? colors.danger : colors.success, fontWeight: "800" }}>{" " + sub.delay}</Text> : null}
            {sub.rest ? " · " + sub.rest : ""}
          </Text>
        )}
      </View>
      <Text maxFontSizeMultiplier={1.3} style={[styles.right, list && styles.rightList, { color: rightColor },
        (right.tone === "cancelled" || right.tone === "departed") && styles.rightWord]} numberOfLines={1}>{right.text}</Text>
      {opensTrip ? <Ionicons name="chevron-forward" size={17} color={colors.textMuted} /> : <View style={styles.noChevron} />}
    </Pressable>
  );
}

/** Small grey heading between groups of rows ("Jouw lijnen", "Alle vertrekken"). */
export function DepartureHeading({ title, star = false }: { title: string; star?: boolean }) {
  const { colors } = useApp();
  return (
    <View style={[styles.heading, { backgroundColor: colors.surfaceSoft }]} accessibilityRole="header">
      {star ? <Ionicons name="star" size={14} color={colors.accentText} /> : null}
      <Text style={[styles.headingText, { color: colors.textSoft }]}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15 },
  rowBoard: { minHeight: 66, paddingVertical: 10 },
  rowList: { minHeight: 54, paddingVertical: 8, paddingHorizontal: 0, gap: 10 },
  // Large font: smaller gaps and badge column, so the destination gets the room.
  rowLarge: { gap: 8 },
  dim: { opacity: 0.55 },
  badge: { alignSelf: "center", minWidth: 48, alignItems: "center" },
  badgeList: { minWidth: 40 },
  body: { flex: 1, minWidth: 0, gap: 2 },
  destination: { fontSize: 16, lineHeight: 21, fontWeight: "600" },
  destinationList: { fontSize: 14.5, lineHeight: 19 },
  // No tabular figures here: on Android a Text with fontVariant was measured differently from how it was
  // drawn, and the stop name in this line ("Rembrandtplein") was broken in the middle of the word.
  sub: { fontSize: 12.5, lineHeight: 17 },
  struck: { textDecorationLine: "line-through" },
  // The minutes: large on the right; a word ("Rijdt niet") a little smaller.
  right: { fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"], textAlign: "right", minWidth: 48 },
  rightList: { fontSize: 17 },
  rightWord: { fontSize: 13, fontWeight: "900" },
  noChevron: { width: 17 },
  heading: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 15, paddingVertical: 7 },
  headingText: { fontSize: 12.5, fontWeight: "800" }
});
