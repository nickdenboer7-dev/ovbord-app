import AsyncStorage from "@react-native-async-storage/async-storage";
import { ACTIVE_TRIP_STORAGE_KEY, activeTripValid, parseActiveTrip } from "./activeTrip";
import type { ActiveTrip } from "./activeTrip";
import { TRIP_SNAPSHOT_STORAGE_KEY, parseTripSnapshot, serializeTripSnapshot } from "./tripSnapshot";
import type { TripSnapshot } from "./tripSnapshot";
import type { RitData } from "../types/api";
import { cancelNativeAlightReminder, syncNativeAlightReminder } from "./journeyReminders";

/** Storage is a convenience: failures are ignored, the trip page never depends on it. */
export async function saveActiveTrip(trip: ActiveTrip): Promise<void> {
  try { await AsyncStorage.setItem(ACTIVE_TRIP_STORAGE_KEY, JSON.stringify(trip)); } catch { /* ignore */ }
  void syncNativeAlightReminder(trip).catch(() => { /* Reminder must never break trip tracking. */ });
}

export async function loadActiveTrip(nowMs: number): Promise<ActiveTrip | null> {
  try {
    const trip = parseActiveTrip(await AsyncStorage.getItem(ACTIVE_TRIP_STORAGE_KEY));
    return activeTripValid(trip, nowMs) ? trip : null;
  } catch {
    return null;
  }
}

/** Clears the stored trip and its data; with a trip ID only when that trip is the stored one. */
export async function clearActiveTrip(tripId?: string): Promise<void> {
  void cancelNativeAlightReminder(tripId).catch(() => {});
  try {
    if (tripId) {
      const stored = parseActiveTrip(await AsyncStorage.getItem(ACTIVE_TRIP_STORAGE_KEY));
      if (stored && stored.tripId === tripId) await AsyncStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
      const snapshot = parseTripSnapshot(await AsyncStorage.getItem(TRIP_SNAPSHOT_STORAGE_KEY));
      if (snapshot && snapshot.tripId === tripId) await AsyncStorage.removeItem(TRIP_SNAPSHOT_STORAGE_KEY);
      return;
    }
    await AsyncStorage.removeItem(ACTIVE_TRIP_STORAGE_KEY);
    await AsyncStorage.removeItem(TRIP_SNAPSHOT_STORAGE_KEY);
  } catch { /* ignore */ }
}

/** Last loaded data of the followed trip, for a restart without a connection. */
export async function saveTripSnapshot(tripId: string, data: RitData, fetchedAt: number): Promise<void> {
  const raw = serializeTripSnapshot(tripId, data, fetchedAt);
  if (!raw) return;
  try { await AsyncStorage.setItem(TRIP_SNAPSHOT_STORAGE_KEY, raw); } catch { /* ignore */ }
}

export async function loadTripSnapshot(): Promise<TripSnapshot | null> {
  try { return parseTripSnapshot(await AsyncStorage.getItem(TRIP_SNAPSHOT_STORAGE_KEY)); } catch { return null; }
}
