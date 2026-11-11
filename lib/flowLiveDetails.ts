/** Read-only adapter for available journey information. Never synthesise GPS positions. */
import type { JourneyStop, RitData } from "../types/api";
import { firstPlannedDepartureMs, tripNotYetStarted } from "./ritStartGuard";

type Dict = Record<string, unknown>;
type Point = {lat: number; lon: number};
// Cache the actual observation time per fetched journey. Without this,
// rerendering every 10 seconds would keep resetting GPS freshness.
const observedGPS = new WeakMap<object, {seconds: number; updatedMs: number}>();
declare const __DEV__: boolean | undefined;
/** The backend's /api/rit does not send nextStopId and next_event is timetable-based, so it is no GPS evidence.
 * Keep false until the origin of a next-stop field is explicitly established as GPS-confirmed. */
const ALLOW_BACKEND_NEXT: boolean = false;
/** Where a live location came from. "backend-next" is the weakest source: it relies on the backend's own next-stop field. */
export type LocationSource = "shape" | "chord" | "backend-next";
/** Why no live location was produced (diagnosis only; never shown as a position). */
export type NoLocationReason =
  | "no-journey" | "not-live" | "no-gps-position" | "no-gps-time" | "stale-gps" | "gps-clock-ahead"
  | "shape-invalid" | "shape-too-long" | "shape-bad-point" | "shape-gap"
  | "too-few-stops" | "no-stop-run"
  | "off-route" | "ambiguous-route" | "outside-mapped-section" | "ambiguous-section" | "ambiguous-stop" | "no-segment"
  | "before-first-stop" | "after-last-stop" | "before-trip-start"
  | "chord-no-match" | "no-next-stop";
export type LiveLocation = { kind: "at" | "between"; index: number; updated: Date; source?: LocationSource } | null;
export type JourneyExtras = { busNumber?: string; carrier?: string; journeyNumber?: string; block?: string; lastUpdate?: string; liveLocation: LiveLocation; liveReason?: NoLocationReason };

const ROUTE_FAILURES: ReadonlySet<NoLocationReason> = new Set<NoLocationReason>([
  "shape-invalid", "shape-too-long", "shape-bad-point", "shape-gap", "too-few-stops", "no-stop-run",
  "off-route", "ambiguous-route", "outside-mapped-section", "ambiguous-section", "ambiguous-stop", "no-segment",
  "before-first-stop", "after-last-stop",
  "chord-no-match", "no-next-stop"
]);
/** True when GPS was fresh and live but could not be tied to this journey's route ("Routepositie onbekend").
 * Stale, not-live and missing-GPS reasons are deliberately not route failures. */
export function isRouteMatchFailure(reason: NoLocationReason | undefined): boolean {
  return reason !== undefined && ROUTE_FAILURES.has(reason);
}

// Dev-only: log once per fetched journey object when the outcome changes.
const diagnosed = new WeakMap<object, string>();
function diagnose(journey: object, outcome: string, journeyNumber?: string): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  if (diagnosed.get(journey) === outcome) return;
  diagnosed.set(journey, outcome);
  console.debug(`[ovbord-gps] rit ${journeyNumber ?? "?"}: ${outcome}`);
}

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
type RouteProjection = {distance: number; along: number; segment: number; rawT: number};
function projectToRoute(pos: Point, route: Point[], offsets: number[]): RouteProjection[] {
  const scale = Math.cos(pos.lat * Math.PI / 180) * 111320;
  const projections: RouteProjection[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const ax = (a.lon - pos.lon) * scale, ay = (a.lat - pos.lat) * 111320;
    const bx = (b.lon - pos.lon) * scale, by = (b.lat - pos.lat) * 111320;
    const vx = bx - ax, vy = by - ay, sq = vx * vx + vy * vy;
    if (sq < 0.01) continue;
    const rawT = -(ax * vx + ay * vy) / sq;
    const t = Math.max(0, Math.min(1, rawT));
    projections.push({
      distance: Math.hypot(ax + t * vx, ay + t * vy),
      along: offsets[i] + t * (offsets[i + 1] - offsets[i]),
      segment: i,
      rawT
    });
  }
  return projections;
}
function routePoints(input: unknown): Point[] | NoLocationReason {
  if (!Array.isArray(input) || input.length < 2) return "shape-invalid";
  if (input.length > 2500) return "shape-too-long";
  const route: Point[] = [];
  for (const row of input) {
    // The existing /api/rit shape is [latitude, longitude]; tolerate keyed points too.
    const p = Array.isArray(row) && row.length >= 2
      ? point({lat: row[0], lon: row[1]})
      : point(dict(row));
    // Do not silently join across invalid points: that can invent a route segment.
    if (!p) return "shape-bad-point";
    route.push(p);
  }
  return route;
}
/** Use only contiguous ordered stops that really match the supplied route.
 * An incomplete shape can omit an early or late section of the journey.
 * Never infer progress across a gap or switch to stop-to-stop chords when a
 * shape was supplied but cannot be trusted.
 */
type RouteMatch = {usable: boolean; location: LiveLocation; reason?: NoLocationReason; rejected?: boolean; detail?: string};
function matchRoute(pos: Point, stops: JourneyStop[], updated: Date, rawShape: unknown): RouteMatch {
  const provided = rawShape !== undefined && rawShape !== null;
  if (!provided) return {usable: false, location: null};
  // `rejected` = a trustworthy route was evaluated and this GPS point was refused.
  // Other reasons only mean the shape could not be used to judge the position.
  const none = (reason: NoLocationReason, rejected = false, detail?: string): RouteMatch =>
    ({usable: true, location: null, reason, rejected, detail});
  const route = routePoints(rawShape);
  if (typeof route === "string") return none(route);
  if (stops.length < 2) return none("too-few-stops");
  const offsets = [0];
  for (let i = 1; i < route.length; i++) {
    const step = meters(route[i - 1], route[i]);
    if (!Number.isFinite(step) || step > 5000) return none("shape-gap");
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
  if (!validRuns.length) return none("no-stop-run");

  const projections = projectToRoute(pos, route, offsets);
  projections.sort((a, b) => a.distance - b.distance);
  const closest = projections[0];
  if (!closest || closest.distance > 65) return none("off-route", true,
    closest ? `${Math.round(closest.distance)} m van route` : undefined);
  const ambiguous = projections.some((candidate) =>
    Math.abs(candidate.along - closest.along) > 250 &&
    candidate.distance <= 45 && candidate.distance <= closest.distance + 30);
  if (ambiguous) return none("ambiguous-route", true);

  // Reject GPS positions before the first or after the last actual stop.
  // This is separate from the 65 m perpendicular distance to the route.
  const mappedStops = validRuns.flat();
  const firstStop = mappedStops.find((s) => s.index === 0);
  const lastStop = mappedStops.find((s) => s.index === stops.length - 1);
  if (firstStop && lastStop && lastStop.along > firstStop.along) {
    const beforeMeters = firstStop.along - closest.along;
    const afterMeters = closest.along - lastStop.along;
    if (beforeMeters > 0.05)
      return none("before-first-stop", true, `${Math.round(beforeMeters)} m vóór eerste halte`);
    if (afterMeters > 0.05)
      return none("after-last-stop", true, `${Math.round(afterMeters)} m voorbij laatste halte`);

    // A projection at the first/last *shape* vertex is clamped. Check the
    // direction of travel to recognize positions beyond that vertex.
    if (firstStop.along <= 0.05 && closest.segment === 0 && closest.rawT < 0) {
      const overrun = -closest.rawT * meters(route[0], route[1]);
      if (overrun > 0.05)
        return none("before-first-stop", true, `${Math.round(overrun)} m vóór eerste halte`);
    }
    if (offsets[offsets.length - 1] - lastStop.along <= 0.05 &&
        closest.segment === route.length - 2 && closest.rawT > 1) {
      const overrun = (closest.rawT - 1) * meters(route[route.length - 2], route[route.length - 1]);
      if (overrun > 0.05)
        return none("after-last-stop", true, `${Math.round(overrun)} m voorbij laatste halte`);
    }
  }

  // Do not extend a recognized route section by 70 m beyond its stop bounds.
  const matchingRuns = validRuns.filter((r) =>
    closest.along >= r[0].along && closest.along <= r[r.length - 1].along);
  if (matchingRuns.length === 0) return none("outside-mapped-section", true);
  if (matchingRuns.length > 1) return none("ambiguous-section", true);
  const matched = matchingRuns[0];
  const atStops = matched.filter((r) =>
    meters(pos, r.point) <= 35 && Math.abs(r.along - closest.along) <= 65);
  if (atStops.length === 1)
    return {usable:true, location:{kind:'at', index:atStops[0].index, updated, source:"shape"}};
  if (atStops.length > 1) return none("ambiguous-stop", true);
  for (let i = 0; i < matched.length - 1; i++) {
    if (closest.along >= matched[i].along && closest.along < matched[i + 1].along)
      return {usable:true, location:{kind:'between', index:matched[i].index, updated, source:"shape"}};
  }
  const nearestStop = Math.min(...matched.map((s) => meters(pos, s.point)));
  return none("no-segment", true, `${Math.round(nearestStop)} m tot dichtstbijzijnde halte`);
}

function matchLocation(pos: Point, stops: JourneyStop[], updated: Date): RouteMatch {
  const locations = stops.map((stop) => point(dict(stop)));
  // A missing shape is not permission to extrapolate past the terminal stops.
  const terminalOverrun = (terminal: number, adjacent: number): number | null => {
    const a = locations[terminal], b = locations[adjacent];
    if (!a || !b) return null;
    const scale = Math.cos(pos.lat * Math.PI / 180) * 111320;
    const dx = (pos.lon - a.lon) * scale, dy = (pos.lat - a.lat) * 111320;
    const vx = (b.lon - a.lon) * scale, vy = (b.lat - a.lat) * 111320;
    const length = Math.hypot(vx, vy);
    if (length < 30) return null;
    const inward = (dx * vx + dy * vy) / length;
    const sideways = Math.abs(dx * vy - dy * vx) / length;
    return inward < -0.05 && sideways <= 65 ? -inward : null;
  };
  let closestStop = -1;
  let closestStopDistance = Infinity;
  locations.forEach((p, idx) => { if (p && meters(pos,p) < closestStopDistance) {closestStopDistance = meters(pos,p); closestStop = idx;} });
  if (closestStop === 0 && stops.length > 1) {
    const overrun = terminalOverrun(0, 1);
    if (overrun !== null) return {usable:true, location:null, reason:"before-first-stop",
      rejected:true, detail:`${Math.round(overrun)} m vóór eerste halte`};
  }
  if (closestStop === stops.length - 1 && stops.length > 1) {
    const overrun = terminalOverrun(stops.length - 1, stops.length - 2);
    if (overrun !== null) return {usable:true, location:null, reason:"after-last-stop",
      rejected:true, detail:`${Math.round(overrun)} m voorbij laatste halte`};
  }
  // Only claim that the bus is AT a stop if very close to its actual coordinates.
  if (closestStop >= 0 && closestStopDistance <= 35) {
    const competing = locations.some((p, idx) => idx !== closestStop && p && meters(pos,p) <= 35);
    if (!competing) return {usable:true, location:{kind:"at", index:closestStop, updated, source:"chord"}};
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
    return {usable:true, location:{kind:"between", index:candidates[0].index, updated, source:"chord"}};
  }
  return {usable:true, location:null};
}
export function journeyExtras(journey: RitData | null, stops: JourneyStop[], nowMs: number = Date.now()): JourneyExtras {
  if (!journey) return {liveLocation:null, liveReason:"no-journey"};
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
  let liveReason: NoLocationReason | undefined;
  let liveDetail: string | undefined;
  if (tripNotYetStarted(journey, nowMs)) {
    liveReason = "before-trip-start";
    const start = firstPlannedDepartureMs(journey);
    if (start !== null) liveDetail = `vertrek over ${Math.ceil((start - nowMs) / 60000)} min`;
  }
  else if (!eligible) liveReason = "not-live";
  else if (!gpsPos) liveReason = "no-gps-position";
  else if (!last) liveReason = "no-gps-time";
  else if (age < -5000) liveReason = "gps-clock-ahead";
  else if (age > 45000) liveReason = "stale-gps";
  else {
    const road = matchRoute(gpsPos, stops, last, valueOf(root, ["shape", "route_shape", "routeShape"]));
    if (road.usable) {
      // A usable road shape supersedes the legacy chord calculation, even if off-route.
      liveLocation = road.location;
      liveReason = road.reason;
      liveDetail = road.detail;
    } else {
      const chord = matchLocation(gpsPos, stops, last);
      liveLocation = chord.location;
      if (!liveLocation) liveReason = chord.reason ?? "chord-no-match";
      liveDetail = chord.detail;
    }
    // Optional fallback on the backend's next stop (disabled, see ALLOW_BACKEND_NEXT). Even when enabled
    // it never runs after a trustworthy route has refused this GPS point.
    if (ALLOW_BACKEND_NEXT && !liveLocation && !road.rejected) {
      const nextId = readable(valueOf(vehicle,["nextStopId","next_stop_id", "next_stop_code"]));
      const norm = (value: string) => value.toLocaleLowerCase("nl").replace(/[^a-z0-9]/g, "");
      if (nextId) {
        const indexes = stops.map((stop,index) => norm(String(stop.id)) === norm(nextId) ? index : -1).filter((i)=>i>=0);
        if (indexes.length === 1 && indexes[0] > 0) {
          liveLocation = {kind:"between", index:indexes[0]-1, updated:last, source:"backend-next"};
          liveReason = undefined;
        } else {
          liveReason = liveReason ?? "no-next-stop";
        }
      }
    }
  }
  const rawVehicle = readable(root.vehicle);
  const busNumber = readable(valueOf(vehicle,["vehicleNumber","vehicle_number","vehicleNo","vehicle_no","number","wagen_nummer"])) || readable(valueOf(root,["vehicleNumber", "vehicle_number"])) || (rawVehicle && /^\d{3,6}$/.test(rawVehicle) ? rawVehicle : undefined);
  const carrier = readable(valueOf(root,["carrier", "operator", "agency"]));
  const journeyNumber = readable(valueOf(root,["journeyNumber","journey_number", "tripNumber", "trip_number"]));
  const block = readable(valueOf(root,["block", "blockNumber", "omloop", "block_id"]));
  const lastUpdate = last ? `${String(last.getHours()).padStart(2,"0")}:${String(last.getMinutes()).padStart(2,"0")}` : undefined;
  const diagnosticId = readable(valueOf(root, ["id", "journey_id", "journeyId"])) ?? journeyNumber;
  diagnose(journey, liveLocation ? `ok (${liveLocation.source ?? "?"}, ${liveLocation.kind} ${liveLocation.index})` :
    `geen positie: ${liveReason ?? "onbekend"}${liveDetail ? ", " + liveDetail : ""}`, diagnosticId);
  return {busNumber,carrier,journeyNumber,block,lastUpdate,liveLocation,liveReason};
}
