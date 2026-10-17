import type { DepartureItem } from "../types/api";
import { boardLineFilterKey } from "./boardLineFilters";
import { departureTimeRemainingMs, keepBoardDeparture } from "./boardSmartness";
import { normalizeText } from "./favoritesLive";

/**
 * A favourite line is a line of one carrier ("14|GVB"), so line 14 in Utrecht is
 * not pinned because of line 14 in Amsterdam.
 */
export function favoriteLineKey(line: string, carrier?: string): string {
  return boardLineFilterKey(line, carrier).trim().toUpperCase() + "|" + String(carrier || "").trim().toUpperCase();
}

/** "Jouw lijnen" on a board: the next departure per favourite line and direction, soonest first. */
export function pinnedDepartures(rows: readonly DepartureItem[], favoriteKeys: readonly string[], nowMs: number, limit = 4): DepartureItem[] {
  if (!favoriteKeys.length) return [];
  const favorites = new Set(favoriteKeys);
  const seen = new Set<string>();
  return rows
    .filter((item) => item.departed !== true && item.cancelled !== true && keepBoardDeparture(item, nowMs) &&
      favorites.has(favoriteLineKey(item.line, item.carrier)))
    .map((item) => ({ item, ms: departureTimeRemainingMs(item, nowMs) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.ms - b.ms)
    .filter(({ item }) => {
      const key = favoriteLineKey(item.line, item.carrier) + "|" + normalizeText(item.destination);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit)
    .map(({ item }) => item);
}

/** Line filter chips with favourite lines first, otherwise in their usual order. */
export function favoriteLinesFirst(choices: readonly string[], favoriteFilterKeys: ReadonlySet<string>): string[] {
  return [...choices.filter((choice) => favoriteFilterKeys.has(choice)), ...choices.filter((choice) => !favoriteFilterKeys.has(choice))];
}
