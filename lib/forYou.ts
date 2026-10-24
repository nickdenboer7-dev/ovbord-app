import type { DepartureItem, HalteBoardData, StopSummary } from "../types/api";
import { feedFreshness } from "./haltebordV4";
import { withBoardFreshness } from "./realtimeConsistency";
import { favoriteLineKey } from "./favoriteLines";
import { favoriteJourneyDepartures, type FavoriteJourneyMatch } from "./favoritesLive";
import { boardDepartureIdentity, departureTimeRemainingMs } from "./boardSmartness";

export type ForYouBoard = { board?: HalteBoardData; stale?: boolean; fetchedAt?: number };
export type ForYouRow = { stop: StopSummary; item: DepartureItem; stale: boolean; fetchedAt?: number };
/** Mix favourite stops, lines and saved directions, without showing one trip twice. */
export function forYouDepartures(boards: Record<string, ForYouBoard>, stops: readonly StopSummary[], lines: readonly string[],
  journeys: readonly FavoriteJourneyMatch[], now: number, limit = 6): ForYouRow[] {
  const stopIds = new Set(stops.map(s => s.id)), lineKeys = new Set(lines);
  const seen = new Set<string>(), rows: ForYouRow[] = [];
  for (const [id, entry] of Object.entries(boards)) {
    if (!entry.board) continue;
    const current = feedFreshness(entry.board,entry.fetchedAt??null,now).level === "fresh";
    const saved = journeys.filter(j => j.stop.id === id);
    const directionRows = new Set(saved.flatMap(j => favoriteJourneyDepartures(entry.board!.departures, j, now, 100)).map(boardDepartureIdentity));
    for (const item of entry.board.departures) {
      if (item.departed || item.cancelled || !stopIds.has(id) && !lineKeys.has(favoriteLineKey(item.line, item.carrier)) && !directionRows.has(boardDepartureIdentity(item))) continue;
      const ms = departureTimeRemainingMs(item, now);
      if (ms === null || ms < 0) continue;
      const key = entry.board.stop.id + "|" + boardDepartureIdentity(item);
      if (seen.has(key)) continue;
      seen.add(key); rows.push({ stop: entry.board.stop, item:withBoardFreshness(item,current), stale: Boolean(entry.stale), fetchedAt: entry.fetchedAt });
    }
  }
  return rows.sort((a,b) => (departureTimeRemainingMs(a.item, now) ?? Infinity) - (departureTimeRemainingMs(b.item, now) ?? Infinity)).slice(0,limit);
}
