import { departureTimeRemainingMs } from "./boardSmartness";
import { effectiveDepartureClock } from "./format";
import type { DepartureItem } from "../types/api";

export const DEPARTURE_DAY_GAP_MS = 60 * 60 * 1000;
export const MAX_GROUPED_EXTRA_TIMES = 3;

export type BoardDisplayDeparture = DepartureItem & {
  /** Up to three later planned departures collapsed into this row. */
  groupedTimes?: string[];
  /** Displayed only when more than an hour separates adjacent departures. */
  gapStartClock?: string;
};

const normalize = (text: string | undefined) => (text || "").trim().toLocaleLowerCase("nl-NL");
const canGroup = (item: DepartureItem) =>
  false;

function sameLineAndDestination(a: DepartureItem, b: DepartureItem) {
  return normalize(a.line) === normalize(b.line) &&
    normalize(a.destination) === normalize(b.destination);
}

/**
 * Input is already sorted/filtered in visible departure order.
 * First merge consecutive planned trips by line and destination, even when their
 * absolute instants are >60 min apart (for example across the autumn clock change).
 * Only then attach a gap divider to the NEXT separate visible row. Live stays separate.
 */
export function groupBoardDepartures(rows: readonly DepartureItem[], nowMs: number): BoardDisplayDeparture[] {
  const display: BoardDisplayDeparture[] = [];
  let previousMs: number | null = null;
  for (let index = 0; index < rows.length; index++) {
    const item = rows[index];
    const ms = departureTimeRemainingMs(item, nowMs);
    const clock = effectiveDepartureClock(item);
    const validClock = /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(clock);
    const gap = previousMs !== null && ms !== null && ms - previousMs > DEPARTURE_DAY_GAP_MS;
    const currentDisplay: BoardDisplayDeparture = { ...item, ...(gap && validClock ? { gapStartClock: clock } : {}) };
    display.push(currentDisplay);
    previousMs = ms;
    if (!canGroup(item) || ms === null) continue;

    const times: string[] = [];
    while (index + 1 < rows.length) {
      const next = rows[index + 1];
      const nextMs = departureTimeRemainingMs(next, nowMs);
      const nextClock = effectiveDepartureClock(next);
      if (!canGroup(next) || nextMs === null || !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(nextClock) ||
          !sameLineAndDestination(item, next)) break;
      // Consume EVERY sibling, even after the three displayed extra times are full.
      index++;
      // The next divider starts after the last consumed trip, including hidden times.
      previousMs = nextMs;
      if (times.length < MAX_GROUPED_EXTRA_TIMES) times.push(nextClock);
    }
    if (times.length) currentDisplay.groupedTimes = times;
  }
  return display;
}
