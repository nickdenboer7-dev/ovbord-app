import type { JourneyProgress } from "./ritRedesign";

/** The next stop is a fact only when we have fresh route-matched GPS progress.
 * Never use schedule-derived current/upcoming states for a "Volgende halte" claim.
 */
export function verifiedNextStopIndex(location: JourneyProgress, stopCount: number): number | null {
  if (!location || !Number.isInteger(location.index) || !Number.isInteger(stopCount) ||
      location.index < 0 || location.index >= stopCount) return null;
  const following = location.index + 1;
  return following < stopCount ? following : null;
}

/** Distinguish an explicitly known zero delay from unknown timing quality. */
export function overdueNextStop(clock: string, nowMs: number, verified: boolean): boolean {
  if (!verified || !/^\d{1,2}:\d{2}$/.test(clock)) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).formatToParts(new Date(nowMs));
  const h = Number(parts.find(x => x.type === "hour")?.value);
  const m = Number(parts.find(x => x.type === "minute")?.value);
  const [hour, minute] = clock.split(":").map(Number);
  let minutes = hour * 60 + minute - h * 60 - m;
  if (minutes < -720) minutes += 1440;
  if (minutes > 720) minutes -= 1440;
  return minutes < 0;
}

export function arrivalTimingDescription(
  journeyLive: boolean,
  delayMinutes: number | undefined,
  passed: boolean,
  actualKnown: boolean
): string {
  if (passed) return actualKnown ? "Werkelijke aankomsttijd" : "Passeertijd niet bevestigd";
  if (!journeyLive) return "Volgens dienstregeling";
  if (typeof delayMinutes !== "number" || !Number.isFinite(delayMinutes)) return "Vertraging niet bekend";
  if (delayMinutes > 0) return delayMinutes + " min vertraging";
  if (delayMinutes < 0) return Math.abs(delayMinutes) + " min eerder dan gepland";
  return "Op tijd";
}
