/** Read-only adapter for available journey information. Never synthesise GPS positions. */
import type { JourneyStop, RitData } from "../types/api";

type Dict = Record<string, unknown>;
type Point = {lat: number; lon: number};
// Cache the actual observation time per fetched journey. Without this,
// rerendering every 10 seconds would keep resetting GPS freshness.
const observedGPS = new WeakMap<object, {seconds: number; updatedMs: number}>();
export type LiveLocation = { kind: "at" | "between"; index: number; updated: Date } | null;
export type JourneyExtras = { busNumber?: string; carrier?: string; journeyNumber?: string; block?: string; lastUpdate?: string; liveLocation: LiveLocation };

function dict(value: unknown): Dict {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Dict : {};
}
function valueOf(source: Dict, keys: string[]): unknown {
  for (const key of keys) {
    const val = source[key];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return undefined;
}
function readable(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}
function clock(v: unknown): Date | null {
  if (v instanceof Date && Number.isFinite(v.getTime())) return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v < 100000000000 ? v * 1000 : v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof v === "string" && /^\d{4}-\d\d-\d\d[T ]/.test(v)) {
    // Time-zone-less backend timestamps are ambiguous; do not certify them as live.
    if (!/(Z|[+-]\d\d:?\d\d)$/i.test(v)) return null;
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}
function point(source: Dict): Point | null {
  const pos = dict(valueOf(source, ["position", "location", "gps"]));
  const obj = Object.keys(pos).length ? pos : source;
  const a = valueOf(obj, ["lat", "latitude"]);
  const b = valueOf(obj, ["lon", "lng", "longitude"]);
  if ((typeof a !== "number" && typeof a !== "string") || (typeof b !== "number" && typeof b !== "string")) return null;
  const lat = Number(a), lon = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 47 || lat > 56 || lon < 2 || lon > 16) return null;
  return {lat, lon};
}
function meters(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dx = (a.lon - b.lon) * Math.cos((a.lat + b.lat) * 0.5 * rad) * 111320;
  const dy = (a.lat - b.lat) * 111320;
  return Math.hypot(dx, dy);
}
/** Project a point onto a polyline segment and return metres along the route. */
type RouteProjection = {distance: number; along: number; segment: number};
function projectToRoute(pos: Point, route: Point[], offsets: number[]): RouteProjection[] {
  const scale = Math.cos(pos.lat * Math.PI / 180) * 111320;
  const projections: RouteProjection[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const ax = (a.lon - pos.lon) * scale, ay = (a.lat - pos.lat) * 111320;
    const bx = (b.lon - pos.lon) * scale, by = (b.lat - pos.lat) * 111320;
    const vx = bx - ax, vy = by - ay, sq = vx * vx + vy * vy;
    if (sq < 0.01) continue;
    const t = Math.max(0, Math.min(1, -(ax * vx + ay * vy) / sq));
    projections.push({
      distance: Math.hypot(ax + t * vx, ay + t * vy),
      along: offsets[i] + t * (offsets[i + 1] - offsets[i]),
      segment: i
    });
  }
  return projections;
}
function routePoints(input: unknown): Point[] | null {
  if (!Array.isArray(input) || input.length < 2 || input.length > 2500) return null;
  const route: Point[] = [];
  for (const row of input) {
    // The existing /api/rit shape is [latitude, longitude]; tolerate keyed points too.
    const p = Array.isArray(row) && row.length >= 2
      ? point({lat: row[0], lon: row[1]})
      : point(dict(row));
    // Do not silently join across invalid points: that can invent a route segment.
    if (!p) return null;
    route.push(p);
  }
  return route;
}
/** Use only contiguous ordered stops that really match the supplied route.
 * An incomplete shape can omit an early or late section of the journey.
 * Never infer progress across a gap or switch to stop-to-stop chords when a
 * shape was supplied but cannot be trusted.
 */
function matchRoute(pos: Point, stops: JourneyStop[], updated: Date, rawShape: unknown):
    {usable: boolean; location: LiveLocation} {
  const provided = rawShape !== undefined && rawShape !== null;
  const route = routePoints(rawShape);
  if (!route || stops.length < 2) return {usable: provided, location: null};
  const offsets = [0];
  for (let i = 1; i < route.length; i++) {
    const step = meters(route[i - 1], route[i]);
    if (!Number.isFinite(step) || step > 5000) return {usable:true, location:null};
    offsets.push(offsets[i - 1] + step);
  }

  type MatchedStop = {index: number; along: number; point: Point};
  const runs: MatchedStop[][] = [];
  let current: MatchedStop[] = [];
  const flush = () => { if (current.length) runs.push(current); current = []; };
  stops.forEach((stop, index) => {
    const location = point(dict(stop));
    if (!location) {flush(); return;}
    const projected = projectToRoute(location, route, offsets);
    projected.sort((a, b) => a.distance - b.distance);
    const nearest = projected[0];
    if (!nearest || nearest.distance > 100) {flush(); return;}
    if (current.length) {
      const previous = current[current.length - 1];
      // A different loop, a reversed segment, or a huge route jump breaks
      // the trustworthy ordered section. Do not bridge it.
      if (nearest.along < previous.along - 20 || nearest.along - previous.along > 6000)
        flush();
    }
    const previous = current[current.length - 1];
    current.push({index, along: previous ? Math.max(previous.along, nearest.along) : nearest.along, point: location});
  });
  flush();
  // On a longer journey, two accidentally matching isolated stops are not
  // sufficient evidence. A two-stop journey can legitimately match both.
  const minRun = stops.length <= 3 ? 2 : 3;
  const validRuns = runs.filter((r) => r.length >= minRun && r[r.length - 1].along - r[0].along >= 30);
  if (!validRuns.length) return {usable:true, location:null};

  const projections = projectToRoute(pos, route, offsets);
  projections.sort((a, b) => a.distance - b.distance);
  const closest = projections[0];
  if (!closest || closest.distance > 65) return {usable:true, location:null};
  const ambiguous = projections.some((candidate) =>
    Math.abs(candidate.along - closest.along) > 250 &&
    candidate.distance <= 45 && candidate.distance <= closest.distance + 30);
  if (ambiguous) return {usable:true, location:null};

  // Only trust a GPS point within exactly one mapped section. No extrapolation
  // over the unmapped leading/trailing stops or a missing middle section.
  const matchingRuns = validRuns.filter((r) =>
    closest.along >= r[0].along - 70 && closest.along <= r[r.length - 1].along + 70);
  if (matchingRuns.length !== 1) return {usable:true, location:null};
  const matched = matchingRuns[0];
  const atStops = matched.filter((r) =>
    meters(pos, r.point) <= 35 && Math.abs(r.along - closest.along) <= 65);
  if (atStops.length === 1)
    return {usable:true, location:{kind:'at', index:atStops[0].index, updated}};
  if (atStops.length > 1) return {usable:true, location:null};
  for (let i = 0; i < matched.length - 1; i++) {
    if (closest.along >= matched[i].along && closest.along < matched[i + 1].along)
      return {usable:true, location:{kind:'between', index:matched[i].index, updated}};
  }
  return {usable:true, location:null};
}

function matchLocation(pos: Point, stops: JourneyStop[], updated: Date): LiveLocation {
  const locations = stops.map((stop) => point(dict(stop)));
  let closestStop = -1;
  let closestStopDistance = Infinity;
  locations.forEach((p, idx) => { if (p && meters(pos,p) < closestStopDistance) {closestStopDistance = meters(pos,p); closestStop = idx;} });
  // Only claim that the bus is AT a stop if very close to its actual coordinates.
  if (closestStop >= 0 && closestStopDistance <= 35) {
    const competing = locations.some((p, idx) => idx !== closestStop && p && meters(pos,p) <= 35);
    if (!competing) return {kind:"at", index:closestStop, updated};
  }
  const candidates: {index:number; distance:number}[] = [];
  for (let i = 0; i < locations.length - 1; i++) {
    const a = locations[i], b = locations[i+1];
    if (!a || !b) continue;
    const rad = Math.PI / 180, scale = Math.cos(pos.lat * rad) * 111320;
    const ax = (a.lon - pos.lon) * scale, ay = (a.lat-pos.lat)*111320;
    const bx = (b.lon - pos.lon) * scale, by = (b.lat-pos.lat)*111320;
    const vx = bx-ax, vy = by-ay, lengthSq = vx*vx+vy*vy;
    if (lengthSq < 1 || lengthSq > 2000*2000) continue;
    const t = Math.max(0,Math.min(1,-(ax*vx+ay*vy)/lengthSq));
    if (t <= 0.04 || t >= 0.96) continue;
    candidates.push({index:i,distance:Math.hypot(ax+t*vx,ay+t*vy)});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  if (candidates.length && candidates[0].distance <= 60 &&
      !candidates.some((other,idx)=>idx > 0 && Math.abs(other.index-candidates[0].index)>1 && other.distance <= candidates[0].distance + 45)) {
    return {kind:"between", index:candidates[0].index, updated};
  }
  return null;
}
export function journeyExtras(journey: RitData | null, stops: JourneyStop[], nowMs: number = Date.now()): JourneyExtras {
  if (!journey) return {liveLocation:null};
  const root = dict(journey), vehicle = dict(root.vehicle);
  // OVbord /api/rit sends GPS freshness as a journey-level age (seconds),
  // while vehicle contains lat/lon but usually no timestamp. Treat this age
  // as an observation clock, *not* a timetable-based estimate.
  const providedAge = valueOf(root, ["gps_age_seconds", "gpsAgeSeconds"]);
  const gpsAgeSeconds = typeof providedAge === "number" ? providedAge :
    (typeof providedAge === "string" && /^\d+(?:\.\d+)?$/.test(providedAge.trim()) ? Number(providedAge) : NaN);
  const hasAge = Number.isFinite(gpsAgeSeconds);
  const statedTime = clock(valueOf(vehicle,["positionTime", "position_time", "gps_time", "timestamp", "lastUpdate", "last_update", "updatedAt", "updated_at"]));
  let ageTime: Date | null = null;
  if (hasAge && gpsAgeSeconds >= 0) {
    let observation = observedGPS.get(journey);
    if (!observation || observation.seconds !== gpsAgeSeconds) {
      observation = {seconds: gpsAgeSeconds, updatedMs: nowMs - gpsAgeSeconds * 1000};
      observedGPS.set(journey, observation);
    }
    ageTime = new Date(observation.updatedMs);
  }
  // An explicitly stale/invalid API age must never be overridden by another clock.
  const last = hasAge ? ageTime : statedTime;
  const age = last ? nowMs-last.getTime() : Infinity;
  const gpsPos = point(vehicle);
  // Never certify timetable-only, estimated, invalid, or stale coordinates.
  const eligible = root.live !== false &&
    valueOf(root,["estimated_position", "estimatedPosition"]) !== true &&
    valueOf(vehicle,["estimated_position", "estimatedPosition"]) !== true;
  // Strict freshness, valid coordinates and an unambiguous location along this journey are required.
  let liveLocation: LiveLocation = null;
  if (eligible && gpsPos && last && age >= -5000 && age <= 45000) {
    const road = matchRoute(gpsPos, stops, last, valueOf(root, ["shape", "route_shape", "routeShape"]));
    // A valid road shape supersedes the legacy chord calculation, even if off-route.
    liveLocation = road.usable ? road.location : matchLocation(gpsPos, stops, last);
  }
  // Use an explicitly supplied next stop as a fallback when the API omits stop coordinates.
  // A fresh, coordinate-bearing vehicle is still compulsory: a timetable guess is not live GPS.
  if (!liveLocation && eligible && gpsPos && last && age >= -5000 && age <= 45000) {
    const nextId = readable(valueOf(vehicle,["nextStopId","next_stop_id", "next_stop_code"]));
    const norm = (value: string) => value.toLocaleLowerCase("nl").replace(/[^a-z0-9]/g, "");
    if (nextId) {
      const indexes = stops.map((stop,index) => norm(String(stop.id)) === norm(nextId) ? index : -1).filter((i)=>i>=0);
      if (indexes.length === 1 && indexes[0] > 0) liveLocation = {kind:"between",index:indexes[0]-1,updated:last};
    }
  }
  const rawVehicle = readable(root.vehicle);
  const busNumber = readable(valueOf(vehicle,["vehicleNumber","vehicle_number","vehicleNo","vehicle_no","number","wagen_nummer"])) || readable(valueOf(root,["vehicleNumber", "vehicle_number"])) || (rawVehicle && /^\d{3,6}$/.test(rawVehicle) ? rawVehicle : undefined);
  const carrier = readable(valueOf(root,["carrier", "operator", "agency"]));
  const journeyNumber = readable(valueOf(root,["journeyNumber","journey_number", "tripNumber", "trip_number"]));
  const block = readable(valueOf(root,["block", "blockNumber", "omloop", "block_id"]));
  const lastUpdate = last ? `${String(last.getHours()).padStart(2,"0")}:${String(last.getMinutes()).padStart(2,"0")}` : undefined;
  return {busNumber,carrier,journeyNumber,block,lastUpdate,liveLocation};
}
