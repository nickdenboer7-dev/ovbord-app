import type { DepartureItem } from "../types/api";
import { normalizeText } from "./favoritesLive";

export type DirectionChoice = { key: string; label: string; count: number };

/** One key per destination, so "Centraal Station" and "centraal station" are one choice. */
export function boardDirectionKey(destination: string): string {
  return normalizeText(destination || "");
}

/** Destinations on the board, most departures first; the most common spelling is the label. */
export function boardDirectionChoices(rows: readonly Pick<DepartureItem, "destination">[], max = 12): DirectionChoice[] {
  const byKey = new Map<string, { count: number; labels: Map<string, number> }>();
  for (const row of rows) {
    const key = boardDirectionKey(row.destination);
    if (!key) continue;
    const entry = byKey.get(key) || { count: 0, labels: new Map<string, number>() };
    entry.count++;
    const label = String(row.destination).trim();
    entry.labels.set(label, (entry.labels.get(label) || 0) + 1);
    byKey.set(key, entry);
  }
  return [...byKey.entries()]
    .map(([key, entry]) => ({
      key, count: entry.count,
      label: [...entry.labels.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "nl"))[0][0]
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "nl"))
    .slice(0, max);
}

export function matchesBoardDirection(row: Pick<DepartureItem, "destination">, selected: string | null): boolean {
  return selected === null || boardDirectionKey(row.destination) === selected;
}
