import type { JourneyStop, RitData } from "../types/api";

export type GpsFix = { lat: number; lon: number; observedMs: number };
export type JourneyLocation = { kind: "at" | "between"; index: number; updated: Date } | null;

/** Convert scheduled HH:mm plus live delay in seconds to the same clock precision as the board. */
export function delayedClock(planned: string, seconds: number | undefined): string | undefined {
  if (!/^\d{1,2}:\d{2}$/.test(planned) || seconds === undefined || !Number.isFinite(seconds)) return undefined;
  const [hours, minutes] = planned.split(":").map(Number);
  if (hours > 23 || minutes > 59 || !Number.isInteger(seconds)) return undefined;
  const totalMinutes = Math.floor((hours * 3600 + minutes * 60 + seconds) / 60);
  const localMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  return String(Math.floor(localMinutes / 60)).padStart(2, "0") + ":" + String(localMinutes % 60).padStart(2, "0");
}

function distanceMeters(a: {lat:number;lon:number}, b: {lat:number;lon:number}): number {
  const radians = Math.PI / 180;
  const east = (a.lon - b.lon) * Math.cos((a.lat + b.lat) * 0.5 * radians) * 111320;
  const north = (a.lat - b.lat) * 111320;
  return Math.hypot(east, north);
}

/** Time-stamped independent GPS fixes are needed before saying the bus is standing at a stop. */
export function confirmedDwellStop(
  previous: GpsFix | null, current: GpsFix | null, stops: readonly JourneyStop[]
): number | null {
  if (!previous || !current) return null;
  const secondsBetween = (current.observedMs - previous.observedMs) / 1000;
  if (secondsBetween < 8 || secondsBetween > 90 || distanceMeters(previous, current) > 7) return null;
  const near = stops.map((stop, index) => ({
    index,
    position: typeof stop.lat === "number" && typeof stop.lon === "number" ? {lat:stop.lat,lon:stop.lon} : null
  })).filter((entry) => {
    if (!entry.position) return false;
    // Bus bays may be tens of metres from the published stop marker.
    // Allow the wider radius only for the backend current stop and two stable GPS fixes.
    const stop = stops[entry.index];
    const radius = stop.state === "current" ? 55 : 12;
    return distanceMeters(previous, entry.position) <= radius &&
      distanceMeters(current, entry.position) <= radius;
  });
  return near.length === 1 ? near[0].index : null;
}

/** Being near a stop isn't enough to claim 'Nu hier'; show the incoming rail segment instead. */
export function verifiedTimelineLocation(
  matched: JourneyLocation, stationaryAt: number | null
): JourneyLocation {
  if (!matched) return null;
  if (stationaryAt !== null && Math.abs(stationaryAt - matched.index) <= 1)
    return {kind:"at",index:stationaryAt,updated:matched.updated};
  if (matched.kind !== "at") return matched;
  return matched.index > 0 ? {kind:"between",index:matched.index-1,updated:matched.updated} : null;
}

/** Do not claim a bus has departed based on a single ambiguous GPS fix near
 * the physical stop. Wait for confirmed dwell or movement away from the stop. */
export function safeTimelineLocation(
  matched: JourneyLocation, stationaryAt: number | null,
  fix: GpsFix | null, stops: readonly JourneyStop[]
): JourneyLocation {
  const location = verifiedTimelineLocation(matched, stationaryAt);
  if (!location || location.kind !== "between" || !fix) return location;
  for (const i of [location.index, location.index + 1]) {
    const stop = stops[i];
    if (!stop || stop.state !== "current" ||
        typeof stop.lat !== "number" || typeof stop.lon !== "number") continue;
    if (distanceMeters(fix, {lat:stop.lat, lon:stop.lon}) <= 55) return null;
  }
  return location;
}

export type ArrivalPosition = "approaching" | "at" | "passed" | "unknown";
export function boardingPosition(index: number, location: JourneyLocation): ArrivalPosition {
  if (index < 0 || !location) return "unknown";
  if (location.kind === "at") return location.index === index ? "at" :
    location.index > index ? "passed" : "approaching";
  return location.index >= index ? "passed" : "approaching";
}

export function gpsFixForRit(journey: RitData, fetchMs: number): GpsFix | null {
  const v = journey.vehicle;
  const age = journey.gpsAgeSeconds;
  if (journey.live !== true || journey.estimatedPosition === true ||
      !v || !Number.isFinite(v.lat) || !Number.isFinite(v.lon) ||
      typeof age !== "number" || age < 0 || age > 45) return null;
  return {lat:v.lat,lon:v.lon,observedMs:fetchMs-age*1000};
}
