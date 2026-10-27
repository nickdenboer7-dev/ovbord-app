import { clockRemainingMs } from "./alighting";
import type { ActiveTrip } from "./activeTrip";

export const ALIGHT_REMINDER_LEAD_MINUTES = 5;
const MIN_SCHEDULE_DELAY_MS = 2_000;
/** The same chosen stop stays the same reminder when its expected clock changes. */
export function sameAlightSelection(pending: { tripId: string; key: string; stopId?: string }, trip: ActiveTrip | null): boolean {
  if (!trip?.alighting?.id || pending.tripId !== trip.tripId) return false;
  return pending.stopId ? pending.stopId === trip.alighting.id :
    pending.key.startsWith(trip.tripId + "|" + trip.alighting.id + "|");
}
/** A timetable-based reminder, not a claim of real-time vehicle position. */
export function plannedAlightReminder(trip: ActiveTrip | null, nowMs: number): { key: string; at: number; title: string; body: string } | null {
  if (!trip?.alighting?.id || !trip.alightName || !trip.alightClock) return null;
  const remaining = clockRemainingMs(trip.alightClock, nowMs);
  if (remaining === null || remaining <= 0 || remaining > 3 * 60 * 60_000) return null;
  return {
    key: trip.tripId + "|" + trip.alighting.id + "|" + trip.alightClock,
    // If the user chooses a nearby stop, notify once almost immediately instead of silently skipping it.
    at: nowMs + Math.max(MIN_SCHEDULE_DELAY_MS, remaining - ALIGHT_REMINDER_LEAD_MINUTES * 60_000),
    title: "Bijna uitstappen · lijn " + trip.line,
    body: trip.alightName + " · verwacht om " + trip.alightClock + ". Controleer de actuele ritinformatie."
  };
}
