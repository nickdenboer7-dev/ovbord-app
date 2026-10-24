import type { DepartureItem } from "../types/api";
import { departureCountdown, effectiveDepartureClock } from "./format";

/** Use the expected clock consistently; cancelled trips never get a countdown. */
export function departurePresentation(item: DepartureItem, nowMs = Date.now()) {
  const cancelled = item.cancelled === true;
  return {
    cancelled,
    clock: effectiveDepartureClock(item),
    countdown: cancelled ? "" : departureCountdown(item, nowMs)
  };
}
