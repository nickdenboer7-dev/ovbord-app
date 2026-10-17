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
