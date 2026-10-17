import type { RitData } from "../types/api";

/** Minutes the trip page keeps refreshing after the scheduled/expected arrival at the final stop. */
export const JOURNEY_END_GRACE_MINUTES = 10;

function amsterdamMinutes(nowMs: number): number | null {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date(nowMs));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return Number.isFinite(h) && Number.isFinite(m) ? (h % 24) * 60 + m : null;
}

/** Minutes elapsed since a "HH:MM" clock today, wrapped around midnight to -720..720. */
export function minutesSinceClock(clock: string | undefined, nowMs: number): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(clock || ""));
  const now = amsterdamMinutes(nowMs);
  if (!match || now === null) return null;
  let diff = now - (Number(match[1]) * 60 + Number(match[2]));
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff;
}

/**
 * True when the trip is over: the feed marks the final stop as passed, or the
 * final stop's (actual/expected/planned) arrival lies more than the grace period
 * in the past. A cancelled trip is never "ended": a cancellation can be withdrawn.
 */
export function journeyEnded(journey: RitData | null | undefined, nowMs: number): boolean {
  if (!journey || journey.cancelled === true || !journey.stops.length) return false;
  const last = journey.stops[journey.stops.length - 1];
  if (last.state === "passed") return true;
  const clock = last.actualKnown && last.actualTime ? last.actualTime : last.expectedTime || last.plannedTime;
  const since = minutesSinceClock(clock, nowMs);
  return since !== null && since >= JOURNEY_END_GRACE_MINUTES;
}

/** Plain-text summary for the system share sheet. */
export function ritShareText(input: {
  line: string; destination: string; boardingName?: string; boardingClock?: string;
  delayMinutes?: number; platform?: string; cancelled?: boolean;
}): string {
  const head = "Lijn " + input.line + " naar " + input.destination;
  if (input.cancelled) return head + " rijdt niet." + (input.boardingName ? " (" + input.boardingName + ")" : "");
  if (!input.boardingName || !input.boardingClock) return head + ".";
  const delay = typeof input.delayMinutes === "number" && Number.isFinite(input.delayMinutes) && input.delayMinutes !== 0
    ? " (" + (input.delayMinutes > 0 ? "+" : "−") + Math.abs(input.delayMinutes) + " min)" : "";
  const platform = input.platform ? ", " + input.platform.toLocaleLowerCase("nl") : "";
  return head + ": " + input.boardingName + " om " + input.boardingClock + delay + platform + ".";
}
