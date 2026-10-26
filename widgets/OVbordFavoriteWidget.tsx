'use no memo';
import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";
import type { FavoriteWidgetModel } from "../lib/androidWidgetData";
import { modeBadgeColors } from "../lib/lineColors";

export function OVbordFavoriteWidget({ model }: { model: FavoriteWidgetModel }) {
  const last = model.updatedAt ? new Date(model.updatedAt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <FlexWidget style={{ width: "match_parent", height: "match_parent", borderRadius: 16, backgroundColor: "#FFFFFF", flexDirection: "column" }}
      clickAction="OPEN_URI" clickActionData={{ uri: "ovbord://favorieten" }}
      accessibilityLabel={"OVbord mijn halte: " + model.stopName}>
      <FlexWidget style={{ width: "match_parent", backgroundColor: "#185C98", padding: 10, flexDirection: "row", alignItems: "center" }}>
        <TextWidget text="OVbord · " style={{ fontSize: 12, color: "#D9ECFF", fontWeight: "bold" }} />
        <FlexWidget style={{ flex: 1 }}><TextWidget text={model.stopName} style={{ fontSize: 13, color: "#FFFFFF", fontWeight: "bold" }} /></FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ width: "match_parent", paddingHorizontal: 11, paddingTop: 5, flexDirection: "column" }}>
        {model.rows.map((row, i) => {
          const badge = modeBadgeColors(row.mode);
          return <FlexWidget key={String(i)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4, width: "match_parent" }}>
            <FlexWidget style={{ backgroundColor: badge.bg as `#${string}`, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 3, width: 35, alignItems: "center" }}>
              <TextWidget text={row.line} style={{ fontSize: 12, fontWeight: "bold", color: badge.text as `#${string}` }} />
            </FlexWidget>
            <FlexWidget style={{ flex: 1, marginLeft: 8 }}><TextWidget text={row.destination} style={{ color: "#253348", fontSize: 12 }} /></FlexWidget>
            <TextWidget text={row.clock} style={{ color: "#185C98", fontWeight: "bold", fontSize: 13, marginLeft: 5 }} />
          </FlexWidget>;
        })}
        {!model.rows.length ? <TextWidget text={model.hint} style={{ color: "#586477", fontSize: 12, paddingVertical: 12 }} /> : null}
      </FlexWidget>
      <FlexWidget style={{ flex: 1, justifyContent: "flex-end", paddingHorizontal: 11, paddingBottom: 7 }}>
        <TextWidget text={model.stale ? model.hint : model.hint + (last ? " · " + last : "")}
          style={{ fontSize: 10, color: model.stale ? "#A45110" : "#657285" }} />
      </FlexWidget>
    </FlexWidget>
  );
}
