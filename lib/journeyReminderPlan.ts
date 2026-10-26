import { clockRemainingMs } from "./alighting";
import type { ActiveTrip } from "./activeTrip";

export const ALIGHT_REMINDER_LEAD_MINUTES = 5;
/** A timetable-based reminder, not a claim of real-time vehicle position. */
export function plannedAlightReminder(trip: ActiveTrip | null, nowMs: number): { key: string; at: number; title: string; body: string } | null {
  if (!trip?.alighting?.id || !trip.alightName || !trip.alightClock) return null;
  const remaining = clockRemainingMs(trip.alightClock, nowMs);
  if (remaining === null || remaining <= (ALIGHT_REMINDER_LEAD_MINUTES + 1) * 60_000 || remaining > 3 * 60 * 60_000) return null;
  return {
    key: trip.tripId + "|" + trip.alighting.id + "|" + trip.alightClock,
    at: nowMs + remaining - ALIGHT_REMINDER_LEAD_MINUTES * 60_000,
    title: "Bijna uitstappen · lijn " + trip.line,
    body: trip.alightName + " · verwacht om " + trip.alightClock + ". Controleer de actuele ritinformatie."
  };
}
