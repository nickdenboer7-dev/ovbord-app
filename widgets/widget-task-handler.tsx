import React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { getHalte } from "../lib/api";
import { parseStoredFavoriteBoards, FAVORITE_BOARDS_STORAGE_KEY } from "../lib/favoritesLive";
import { favoriteWidgetModel } from "../lib/androidWidgetData";
import { OVbordFavoriteWidget } from "./OVbordFavoriteWidget";
import type { HalteBoardData } from "../types/api";

const FAVORITE_STOPS_STORAGE_KEY = "ovbord.favoriteStops";

export async function loadFavoriteWidgetModel() {
  const now = Date.now();
  let favorite: { id: string; name: string } | undefined;
  try {
    const stored = JSON.parse(await AsyncStorage.getItem(FAVORITE_STOPS_STORAGE_KEY) || "[]");
    favorite = Array.isArray(stored)
      ? stored.find((item) => item && typeof item.id === "string" && typeof item.name === "string")
      : undefined;
  } catch { /* No saved favorites */ }
  if (!favorite) return favoriteWidgetModel("Mijn halte", null, null, now);

  let board: HalteBoardData | null = null;
  let fetchedAt: number | null = null;
  try {
    board = await getHalte(favorite.id);
    fetchedAt = Date.now();
  } catch {
    try {
      const cached = parseStoredFavoriteBoards(await AsyncStorage.getItem(FAVORITE_BOARDS_STORAGE_KEY), now);
      const entry = cached[favorite.id];
      if (entry) { board = entry.board; fetchedAt = entry.fetchedAt; }
    } catch { /* No usable cache */ }
  }
  return favoriteWidgetModel(favorite.name, board, fetchedAt, Date.now());
}

/** Android launches this without opening the regular React UI. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== "MijnHalte") return;
  if (!["WIDGET_ADDED", "WIDGET_UPDATE", "WIDGET_RESIZED"].includes(props.widgetAction)) return;
  const model = await loadFavoriteWidgetModel();
  props.renderWidget(<OVbordFavoriteWidget model={model} />);
}
