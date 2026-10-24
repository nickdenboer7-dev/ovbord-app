import { clockRemainingMs } from "./alighting";

export type TimelineDelayTone = "orange" | "red" | "early";

/** The same +1..+4 amber / +5 and higher red threshold as the stop board. */
export function timelineTimeDelta(value: number | undefined): { text: string; tone: TimelineDelayTone } | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const minutes = Math.round(value);
  if (!minutes) return null;
  return minutes > 0
    ? { text: "+" + minutes, tone: minutes >= 5 ? "red" : "orange" }
    : { text: "−" + Math.abs(minutes), tone: "early" };
}

/** Keep the origin visible without showing a misleading negative countdown. */
export function boardingCountdown(clock: string, nowMs: number, passed: boolean, lastKnown = false): string {
  if (passed) return "";
  const remaining = clockRemainingMs(clock, nowMs);
  if (remaining === null || remaining < -60000) return "";
  const minutes = Math.max(0, Math.ceil(remaining / 60000));
  return minutes === 0 ? (lastKnown ? "± nu" : "nu") : (lastKnown ? "± over " : "over ") + minutes + " min";
}
