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
  item.isLive !== true && !item.liveDataStale && !item.cancelled && !item.departed;

function sameLineAndDestination(a: DepartureItem, b: DepartureItem) {
  return normalize(a.line) === normalize(b.line) &&
    normalize(a.destination) === normalize(b.destination);
}

/**
 * Input is already sorted/filtered in visible departure order.
 * A >60-minute gap starts a new displayed row before we attempt to merge it;
 * never hide a day divider inside a collapsed group. Live data stays separate.
 */
export function groupBoardDepartures(rows: readonly DepartureItem[], nowMs: number): BoardDisplayDeparture[] {
  const display: BoardDisplayDeparture[] = [];
  let previous: DepartureItem | undefined;
  let previousMs: number | null = null;
  let currentDisplay: BoardDisplayDeparture | undefined;
  for (const item of rows) {
    const ms = departureTimeRemainingMs(item, nowMs);
    const clock = effectiveDepartureClock(item);
    const validClock = /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(clock);
    const gap = previousMs !== null && ms !== null && ms - previousMs > DEPARTURE_DAY_GAP_MS;
    if (!gap && previous && currentDisplay && canGroup(previous) && canGroup(item) &&
        previousMs !== null && ms !== null && validClock && sameLineAndDestination(previous, item)) {
      const times = currentDisplay.groupedTimes || [];
      if (times.length < MAX_GROUPED_EXTRA_TIMES) currentDisplay.groupedTimes = [...times, clock];
    } else {
      currentDisplay = { ...item, ...(gap && validClock ? { gapStartClock: clock } : {}) };
      display.push(currentDisplay);
    }
    previous = item;
    previousMs = ms;
  }
  return display;
}
