import type { RitData } from "../types/api";
import { linesConflict } from "./flowRitQuality";
import { directionMatches } from "./favoritesLive";

/**
 * The last loaded data of the trip being followed, kept on the device so the trip
 * page can still show it (as last known) after a restart without a connection,
 * e.g. in a metro tunnel. One trip at a time.
 */
export const TRIP_SNAPSHOT_STORAGE_KEY = "ovbord.activeTripData";
export const TRIP_SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60_000;
/** Stored at most once a minute: the page refreshes every 15 s. */
export const TRIP_SNAPSHOT_INTERVAL_MS = 60_000;
/** Very large trips (long train routes with shapes) are not stored. */
export const TRIP_SNAPSHOT_MAX_CHARS = 1_500_000;

export type TripSnapshot = { tripId: string; fetchedAt: number; data: RitData };

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function serializeTripSnapshot(tripId: string, data: RitData, fetchedAt: number): string | null {
  if (!tripId || !data || !Number.isFinite(fetchedAt)) return null;
  const raw = JSON.stringify({ tripId, fetchedAt, data });
  return raw.length > TRIP_SNAPSHOT_MAX_CHARS ? null : raw;
}

/** Stored snapshot back; anything unreadable gives null instead of throwing. */
export function parseTripSnapshot(raw: string | null | undefined): TripSnapshot | null {
  if (typeof raw !== "string" || !raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!isRecord(value) || typeof value.tripId !== "string" || !value.tripId || typeof value.fetchedAt !== "number" ||
      !Number.isFinite(value.fetchedAt) || !isRecord(value.data) || !Array.isArray(value.data.stops) ||
      typeof value.data.line !== "string" || typeof value.data.destination !== "string") return null;
  const data = value.data as RitData;
  return { tripId: value.tripId, fetchedAt: value.fetchedAt,
    data: { ...data, polyline: Array.isArray(data.polyline) ? data.polyline : [] } };
}

/** Only for the same trip, line and direction, and not older than two hours. */
export function usableTripSnapshot(snapshot: TripSnapshot | null, tripId: string, expectedLine: string,
  nowMs: number, expectedDestination = ""): snapshot is TripSnapshot {
  if (!snapshot || !tripId || snapshot.tripId !== tripId) return false;
  const age = nowMs - snapshot.fetchedAt;
  if (!Number.isFinite(age) || age < 0 || age >= TRIP_SNAPSHOT_MAX_AGE_MS) return false;
  if (expectedLine && linesConflict(expectedLine, snapshot.data.line)) return false;
  return !expectedDestination || !snapshot.data.destination || directionMatches(expectedDestination, snapshot.data.destination);
}
