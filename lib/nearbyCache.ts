import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DepartureItem, StopSummary } from "../types/api";
import type { LocatieResultaat } from "./location";
import { haversineMeters } from "./liveLocation";

export type NearbyPreview = { loading: boolean; departures: DepartureItem[]; stale?: boolean };
export type NearbySnapshot = {
  scope: string; location: LocatieResultaat; items: StopSummary[];
  previews: Record<string, NearbyPreview>; updatedAt: number;
};
const KEY = "ovbord_nearby_cache_v1";
let lastLocation: LocatieResultaat | null = null;
const snapshots = new Map<string, NearbySnapshot>();
let hydration: Promise<void> | null = null;
let writes = Promise.resolve();
const validLocation = (value: any): value is LocatieResultaat => Boolean(value &&
  Number.isFinite(value.fixAt) && Number.isFinite(value.coords?.latitude) && Number.isFinite(value.coords?.longitude) &&
  value.coords.latitude >= 50.65 && value.coords.latitude <= 53.75 && value.coords.longitude >= 3.25 && value.coords.longitude <= 7.35);

export function nearbyScope(manualCity: string | null): string { return manualCity ? "city:" + manualCity : "gps"; }
export function sameNearbyLocation(a: LocatieResultaat, b: LocatieResultaat): boolean {
  return haversineMeters(a.coords, b.coords) < 1000;
}
export function peekLastLocation(): LocatieResultaat | null {
  return lastLocation ? { ...lastLocation, bron: "laatst-bekend" } : null;
}
export function peekNearby(scope: string, location?: LocatieResultaat | null): NearbySnapshot | null {
  const snapshot = snapshots.get(scope);
  const current = location || (scope === "gps" ? lastLocation : null);
  if (!snapshot || current && !sameNearbyLocation(snapshot.location, current)) return null;
  return { ...snapshot, previews: Object.fromEntries(Object.entries(snapshot.previews).map(([id, value]) =>
    [id, { ...value, loading: false, stale: true }])) };
}

export function hydrateNearbyCache(): Promise<void> {
  if (!hydration) hydration = AsyncStorage.getItem(KEY).then(raw => {
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (validLocation(saved.lastLocation) && (!lastLocation || saved.lastLocation.fixAt > lastLocation.fixAt)) lastLocation = saved.lastLocation;
    for (const snapshot of Array.isArray(saved.snapshots) ? saved.snapshots.slice(-6) : []) {
      if (!validLocation(snapshot.location) || !Array.isArray(snapshot.items) || !Number.isFinite(snapshot.updatedAt) ||
          typeof snapshot.scope !== "string" || !snapshot.previews || typeof snapshot.previews !== "object") continue;
      if ((snapshots.get(snapshot.scope)?.updatedAt || 0) < snapshot.updatedAt) snapshots.set(snapshot.scope, snapshot);
    }
  }).catch(() => {});
  return hydration;
}
function persist(): void {
  writes = writes.catch(() => {}).then(async () => {
    await hydrateNearbyCache();
    await AsyncStorage.setItem(KEY, JSON.stringify({ lastLocation, snapshots: [...snapshots.values()].slice(-6) }));
  }).catch(() => {});
}
export function rememberLocation(location: LocatieResultaat): void {
  if (!validLocation(location) || !["gps", "laatst-bekend"].includes(location.bron)) return;
  if (!lastLocation || location.fixAt >= lastLocation.fixAt) { lastLocation = location; persist(); }
}
export function rememberNearby(snapshot: NearbySnapshot): void {
  if (!validLocation(snapshot.location)) return;
  const before = peekNearby(snapshot.scope, snapshot.location);
  const previews = Object.fromEntries(snapshot.items.slice(0, 5).map(stop => [stop.id,
    snapshot.previews[stop.id] || before?.previews[stop.id] || { loading: false, departures: [] }]));
  snapshots.delete(snapshot.scope);
  snapshots.set(snapshot.scope, { ...snapshot, items: snapshot.items.slice(0, 5), previews });
  while (snapshots.size > 6) snapshots.delete(snapshots.keys().next().value!);
  rememberLocation(snapshot.location);
  persist();
}
