import React from "react";
import { Platform } from "react-native";
import { getWidgetInfo, requestPinWidget, requestWidgetUpdate } from "react-native-android-widget";
import { loadFavoriteWidgetModel } from "../widgets/widget-task-handler";
import { OVbordFavoriteWidget } from "../widgets/OVbordFavoriteWidget";

export async function pinFavoriteWidget(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  return requestPinWidget({ widgetName: "MijnHalte" });
}

let updating: Promise<void> | null = null;
export function refreshFavoriteWidget(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  if (updating) return updating;
  updating = (async () => {
    const widgets = await getWidgetInfo("MijnHalte");
    if (!widgets.length) return;
    const model = await loadFavoriteWidgetModel();
    await requestWidgetUpdate({
      widgetName: "MijnHalte",
      renderWidget: () => <OVbordFavoriteWidget model={model} />
    });
  })().finally(() => { updating = null; });
  return updating;
}
