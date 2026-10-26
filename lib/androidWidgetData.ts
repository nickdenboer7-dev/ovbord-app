import type { DepartureItem, HalteBoardData } from "../types/api";
import { departureTimeRemainingMs } from "./boardSmartness";

export type WidgetDeparture = { line: string; destination: string; clock: string; minutes: number; mode: string };
export type FavoriteWidgetModel = { stopName: string; rows: WidgetDeparture[]; updatedAt: number | null; stale: boolean; hint: string };

/** A widget must never present cached timing as verified real-time data. */
export function favoriteWidgetModel(
  stopName: string,
  board: HalteBoardData | null,
  fetchedAt: number | null,
  nowMs: number
): FavoriteWidgetModel {
  const age = fetchedAt === null ? Infinity : nowMs - fetchedAt;
  const stale = !Number.isFinite(age) || age < 0 || age > 5 * 60_000;
  const rows = board?.departures
    .filter((item: DepartureItem) => !item.cancelled && !item.departed)
    .map((item) => ({ item, remaining: departureTimeRemainingMs(item, nowMs) }))
    .filter((entry): entry is { item: DepartureItem; remaining: number } =>
      entry.remaining !== null && entry.remaining >= -60_000 && entry.remaining < 24 * 60 * 60_000)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 3)
    .map(({ item, remaining }) => ({
      line: item.line,
      destination: item.destination,
      clock: item.expectedTime || item.plannedTime,
      minutes: Math.max(0, Math.ceil(remaining / 60_000)),
      mode: item.mode || board?.stop.mode || "bus"
    })) || [];
  return {
    stopName: stopName || "Mijn halte",
    rows,
    updatedAt: fetchedAt,
    stale,
    hint: !board ? "Open OVbord voor vertrektijden" :
      !rows.length ? "Geen komende vertrekken" :
      stale ? "Momentopname verouderd · open OVbord" : "Momentopname"
  };
}
