import { inferCarrierFromLine } from "../constants/vervoerders";
import { DepartureItem, HalteBoardData, JourneyStop, LineInfo, Mode, ReliabilityInfo, RitData, StopSummary } from "../types/api";
import { mergeLines, primaryMode } from "./lineSet";
import { formatClock, formatDutchClock, normalizeMode, relativeMinutesText, shiftClock } from "./format";
import { delayedClock } from "./ritConsistency";
import { isUnconfirmedExtremeEarlyDeparture } from "./earlyDepartureGuard";
import { parseDisruptions, parseStopDisruptions } from "./haltebordV4";

const API_BASE = "https://ovbord.nl";

function arrayOf<T = any>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

function str(value: any, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

/** The vehicle (wagon) number from /api/rit, when present: digits and letters only, at most 10. */
function vehicleNumberOf(raw: any, vehicle: any): string | undefined {
  const value = first(vehicle?.vehicle_number, vehicle?.vehicleNumber, vehicle?.number,
    raw?.vehicle_number, raw?.vehicleNumber, typeof raw?.vehicle === "string" || typeof raw?.vehicle === "number" ? raw.vehicle : undefined);
  const text = value === undefined || value === null ? "" : String(value).trim();
  return /^[A-Za-z0-9-]{1,10}$/.test(text) ? text : undefined;
}

function num(value: any, fallback?: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function first<T = any>(...values: T[]): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * V5.9.1: every kind of transport the API names for this item. /api/nearby and /api/search send a
 * "modes" array (["bus", "metro"]) and no single "mode" field; it was ignored, so a metro
 * platform became a "Bushalte". An empty list stays empty (station entrances have no lines).
 */
function modesOf(item: any): Mode[] {
  const single = first(item?.mode, item?.modaliteit, item?.route_type, item?.vehicle_type, item?.type);
  const raw = [...(single !== undefined ? [single] : []), ...arrayOf<any>(item?.modes)];
  const modes: Mode[] = [];
  for (const value of raw) {
    if (value === undefined || value === null || String(value).trim() === "") continue;
    const mode = normalizeMode(String(value));
    if (!modes.includes(mode)) modes.push(mode);
  }
  return modes;
}

function pickMode(item: any): Mode {
  const single = first(item?.mode, item?.modaliteit, item?.route_type, item?.vehicle_type, item?.type);
  if (single !== undefined) return normalizeMode(single);
  return primaryMode(modesOf(item)) || "bus";
}

/**
 * V5.9.1: all lines of an entry. "line_details" (with operator) used to replace "lines" entirely,
 * so a line missing from the details disappeared from the app (Derkinderenstraat: lines 1, 17,
 * 27, 28 but details only 1, 17, 27). Both lists are now merged without duplicates
 * ("Sprinter" in the details and "SPR" in lines are one line). A line gets its own mode from the
 * API, or the stop's mode when the stop serves exactly one kind of transport.
 */
function mapLines(item: any): LineInfo[] {
  const modes = modesOf(item);
  const stopMode = modes.length === 1 ? modes[0] : undefined;
  const toLine = (entry: any): LineInfo | null => {
    const line = str(first(entry?.line, entry?.number, entry?.name, typeof entry === "object" ? undefined : entry)).trim();
    if (!line) return null;
    const entryMode = first(entry?.mode, entry?.modality, entry?.modaliteit);
    const mode = entryMode !== undefined ? normalizeMode(String(entryMode)) : stopMode;
    return {
      line,
      carrier: str(first(entry?.carrier, entry?.operator, entry?.agency_name, item?.carrier), inferCarrierFromLine(line)),
      ...(mode ? { mode } : {})
    };
  };
  const parse = (list: any[]) => list.map(toLine).filter((entry): entry is LineInfo => entry !== null);
  const merged = mergeLines(
    parse(arrayOf<any>(item?.line_details)),
    parse(arrayOf<any>(first(item?.lines, item?.lijnbadges, item?.line_badges, item?.routes)))
  );
  return merged.length ? merged : parse(item?.line ? [{ line: item.line, carrier: item.carrier }] : []);
}

function stopNaam(item: any): string {
  return str(first(item?.name, item?.stop_name, item?.stopName, item?.quayName,
    item?.quay_name, item?.stopAreaName, item?.stop_area_name, item?.title)).trim();
}

function normalizeStop(item: any): StopSummary {
  const id = str(first(item?.id, item?.stop_id, item?.halte_id, item?.code, item?.ids?.[0])) || "unknown";
  const distanceMeters = num(first(item?.distance_meters, item?.distance_m, item?.distance, item?.distanceMeters));
  const walkMinutes = distanceMeters !== undefined
    ? Math.max(1, Math.round(distanceMeters / 80))
    : undefined;

  const modes = modesOf(item);
  return {
    id,
    name: stopNaam(item) || "Onbekende halte",
    city: str(first(item?.city, item?.place, item?.town, item?.municipality, item?.gemeente), ""),
    mode: pickMode(item),
    ...(modes.length ? { modes } : {}),
    walkMinutes,
    distanceMeters,
    lat: num(first(item?.lat, item?.latitude)),
    lon: num(first(item?.lon, item?.lng, item?.longitude)),
    lines: mapLines(item),
    ...(item?.lines_complete === true || item?.complete_lines === true ? { linesComplete: true } : {})
  };
}

/**
 * V5.9.1: /api/nearby keeps only the nearest platform per stop name (with only that platform's
 * lines). A backend that sends every platform ("quays": [{ id, lat, lon, modes, lines, ... }])
 * keeps each real stop ID: they become variants of the entry, which Start groups per mode.
 */
function normalizeNearbyRow(row: any): StopSummary {
  const stop = normalizeStop(row);
  const quays = arrayOf<any>(first(row?.quays, row?.platforms, row?.variants));
  if (!quays.length) return stop;
  const variants = quays
    .map((quay) => normalizeStop({ ...quay, name: first(quay?.name, row?.name), city: first(quay?.city, row?.city),
      distance_m: first(quay?.distance_m, quay?.distance_meters, quay?.distance), lines_complete: first(quay?.lines_complete, row?.lines_complete) }))
    .filter((quay, index, all) => quay.id !== "unknown" && all.findIndex((other) => other.id === quay.id) === index);
  return variants.length ? { ...stop, variants } : stop;
}

export function normalizeDeparture(item: any): DepartureItem {
  const line = str(first(item?.line, item?.line_number, item?.service, item?.route_short_name), "?");
  const plannedRaw = first(item?.planned_time, item?.planned_departure, item?.departure_time, item?.time, item?.vertrek);
  const rawDelayMinutes = num(item?.delay_minutes);
  const rawDelaySeconds = num(first(item?.delay_seconds, item?.delay, item?.vertraging));
  // A driver logging in early can create a false negative delay despite a future first stop.
  // Keep the scheduled departure unless actual departure is explicitly confirmed.
  const unconfirmedEarly = isUnconfirmedExtremeEarlyDeparture(item);
  const delayMinutes = unconfirmedEarly ? undefined : rawDelayMinutes !== undefined
    ? Math.round(rawDelayMinutes)
    : rawDelaySeconds !== undefined
      ? Math.round(rawDelaySeconds / 60)
      : undefined;
  const rawEffective = first(item?.effective_time, item?.actual_time, item?.expected_time, item?.realtime_time, plannedRaw);
  // Preserve legitimate small early deviations and verified actual departures.
  const effectiveRaw = unconfirmedEarly ? first(item?.planned_at, plannedRaw) : rawEffective;
  const predictedRaw = (effectiveRaw === plannedRaw || effectiveRaw === undefined) && delayMinutes !== undefined
    ? shiftClock(formatDutchClock(plannedRaw), delayMinutes) : effectiveRaw;
  const absoluteRaw = typeof effectiveRaw === "string" && /\d{4}-\d{2}-\d{2}T/.test(effectiveRaw) ? effectiveRaw
    : typeof plannedRaw === "string" && /\d{4}-\d{2}-\d{2}T/.test(plannedRaw) && delayMinutes !== undefined
    ? new Date(Date.parse(plannedRaw) + delayMinutes*60000).toISOString() : undefined;
  const alert = str(first(item?.alert, item?.disruption, item?.storing), "") || undefined;
  const isLive = typeof item?.live === "boolean"
    ? item.live
    : item?.realtime === true
      ? true
      : undefined;
  // Realtime departure TIMING is not proof of a fresh GPS position.
  const reliability: DepartureItem["reliability"] = "planned";

  return {
    id: str(first(item?.id, item?.trip_id, item?.rit_id, `${line}-${plannedRaw}-${item?.destination}`)),
    ritId: str(first(item?.rit_id, item?.journey_id, item?.trip_id, item?.gtfs_trip_id, item?.realtime_trip_id), "") || undefined,
    ...(typeof item?.service_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.service_date)
      ? { serviceDate: item.service_date } : {}),
    line,
    carrier: str(
      first(
        item?.carrier,
        item?.vervoerder,
        item?.operator_name,
        item?.operator?.name,
        item?.agency_name,
        item?.agency?.name,
        typeof item?.operator === "string" ? item.operator : undefined
      ),
      inferCarrierFromLine(line)
    ),
    destination: str(first(item?.destination, item?.headsign, item?.richting), "Onbekende bestemming"),
    plannedTime: formatDutchClock(plannedRaw || effectiveRaw),
    expectedTime: predictedRaw !== undefined ? formatDutchClock(predictedRaw) : undefined,
    effectiveAt: absoluteRaw,
    relativeText: relativeMinutesText(absoluteRaw || predictedRaw || effectiveRaw),
    delayMinutes,
    reliability,
    trend: !unconfirmedEarly && ["up", "down", "flat"].includes(item?.trend) && Number(item?.trend_samples) >= 2
      ? item.trend : undefined,
    trendDeltaMinutes: num(item?.trend_delta_minutes),
    trendWindowSeconds: num(item?.trend_window_seconds),
    trendSamples: num(item?.trend_samples),
    platform: str(first(item?.platform, item?.spoor, item?.perron), "") || undefined,
    platformChanged: item?.platform_changed === true || item?.platform_change === true || item?.spoorwijziging === true,
    platformPrevious: str(first(item?.previous_platform, item?.old_platform, item?.platform_previous, item?.previous_track), "") || undefined,
    alert,
    cancelled: item?.cancelled === true,
    departed: item?.departed === true || item?.departure_confirmed === true,
    mode: pickMode(item),
    isLive
  };
}

function normalizeJourneyStop(item: any, index: number, total: number, journeyDelaySeconds?: number, journeyLive = false): JourneyStop {
  const stateRaw = str(first(item?.state, item?.status), "").toLowerCase();
  let state: JourneyStop["state"] = "upcoming";
  if (stateRaw.includes("passed") || stateRaw.includes("gepasseerd")) state = "passed";
  else if (stateRaw.includes("current") || stateRaw.includes("nu")) state = "current";
  else if (index === total - 1) state = "end";

  const plannedRaw = first(
    item?.planned_departure_time,
    item?.planned_arrival_time,
    item?.planned_time,
    item?.planned_departure,
    item?.planned_arrival,
    item?.time
  );
  // Backend "current" means route progress, not confirmation that a bus stands at a stop.
  // Likewise arrival_timing_live can be true for an unchanged scheduled clock.
  const reportedArrival = first(item?.actual_arrival, item?.actual_time, item?.arrival_time);
  const arrivalPlan = first(item?.planned_arrival_time, item?.planned_arrival);
  const explicitActual = first(item?.actual_arrival, item?.actual_departure, item?.actual_time);
  const distinctArrival = item?.arrival_timing_live === true &&
    reportedArrival !== undefined && arrivalPlan !== undefined &&
    formatDutchClock(reportedArrival) !== formatDutchClock(arrivalPlan);
  const actualKnown = state === "passed" && Boolean(explicitActual || distinctArrival);
  const actualRaw = explicitActual || (distinctArrival ? reportedArrival : undefined);
  const directDelay = num(item?.delay_minutes);
  const delaySeconds = num(item?.delay_seconds);
  const delayMinutes = directDelay !== undefined
    ? Math.round(directDelay)
    : delaySeconds !== undefined
      ? Math.round(delaySeconds / 60)
      : undefined;
  const plannedArrival = first(item?.planned_arrival_time, item?.planned_arrival, plannedRaw);
  const scheduledClock = formatDutchClock(plannedArrival);
  const plannedDepartureRaw = first(item?.planned_departure_time, item?.planned_departure);
  const plannedDeparture = plannedDepartureRaw !== undefined ? formatDutchClock(plannedDepartureRaw) : undefined;
  const expectedDeparture = plannedDeparture && journeyLive && journeyDelaySeconds !== undefined
    ? delayedClock(plannedDeparture, journeyDelaySeconds) : plannedDeparture;
  const expectedFromJourney = journeyLive && !actualKnown
    ? delayedClock(scheduledClock, journeyDelaySeconds)
    : undefined;

  return {
    id: str(first(item?.id, item?.stop_id, `${index}`)),
    name: str(first(item?.name, item?.stop_name), "Onbekende halte"),
    plannedTime: scheduledClock,
    actualTime: actualKnown && actualRaw ? formatDutchClock(actualRaw) : undefined,
    actualKnown,
    expectedTime: expectedFromJourney || (!actualKnown && delayMinutes !== undefined
      ? shiftClock(scheduledClock,delayMinutes) : scheduledClock),
    plannedDepartureTime: plannedDeparture,
    expectedDepartureTime: expectedDeparture,
    delayMinutes: journeyLive && journeyDelaySeconds !== undefined
      ? Math.round(journeyDelaySeconds / 60) : delayMinutes,
    state,
    platform: str(first(item?.track, item?.platform, item?.spoor, item?.perron), "") || undefined,
    platformChanged: Boolean(first(item?.platform_changed, item?.spoorwijziging, item?.platform_change)),
    lat: num(first(item?.lat, item?.latitude)),
    lon: num(first(item?.lon, item?.longitude))
  };
}

/** Failure of one HTTP attempt. Messages stay compatible with existing error parsing in the UI. */
class RequestFailure extends Error {
  readonly status?: number;
  readonly timedOut?: boolean;
  readonly network?: boolean;
  constructor(message: string, info: { status?: number; timedOut?: boolean; network?: boolean }) {
    super(message);
    this.name = "RequestFailure";
    this.status = info.status;
    this.timedOut = info.timedOut;
    this.network = info.network;
  }
}

export const REQUEST_RETRY_DELAY_MS = 700;

/**
 * Retry once for a dropped connection (common when switching between Wi-Fi and
 * mobile data) or a temporary gateway error. Never retry a timeout (the user
 * already waited 15 s) or a 4xx/500 answer, which a retry will not fix.
 */
export function shouldRetryRequest(failure: { status?: number; timedOut?: boolean; network?: boolean }): boolean {
  if (failure.timedOut) return false;
  if (failure.network) return true;
  return failure.status === 502 || failure.status === 503 || failure.status === 504;
}

async function requestOnce(url: string, path: string) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
  try {
    let response: Response;
    try {
      response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new RequestFailure(`OVbord timeout: ${path}`, { timedOut: true });
      throw new RequestFailure(error instanceof Error ? error.message : String(error), { network: true });
    }
    if (!response.ok) throw new RequestFailure(`OVbord API ${response.status}: ${path}`, { status: response.status });
    try {
      return await response.json();
    } catch (error) {
      if (timedOut) throw new RequestFailure(`OVbord timeout: ${path}`, { timedOut: true });
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function requestJson(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
  try {
    return await requestOnce(url.toString(), path);
  } catch (error) {
    // Duck-typed: instanceof on Error subclasses depends on the Babel class transform.
    const failure = error as Partial<RequestFailure> | null;
    if (!failure || failure.name !== "RequestFailure" || !shouldRetryRequest(failure)) throw error;
    await new Promise((resolve) => setTimeout(resolve, REQUEST_RETRY_DELAY_MS));
    return await requestOnce(url.toString(), path);
  }
}

export type SearchJourney = {
  kind: "rit";
  journeyId: string;
  line: string;
  destination: string;
  carrier: string;
  position: string;
  live: boolean;
  mode: Mode;
};

/** /api/search returns heterogeneous records: haltes and live ritten. */
export async function searchCatalog(query: string): Promise<{ stops: StopSummary[]; journeys: SearchJourney[] }> {
  const raw = await requestJson("/api/search", { q: query });
  const items = arrayOf<any>(first(raw?.results, raw?.items, raw));
  let debugSamples = 0;
  const stops = items.filter((item) => {
    const kind = str(item?.kind).toLowerCase();
    if (kind && !["halte", "stop", "station", "quay", "stoparea", "stop_area", "hub"].includes(kind)) return false;
    const naam = stopNaam(item);
    if (!naam && __DEV__ && debugSamples++ < 3) {
      console.warn("Zoekresultaat zonder naam:", JSON.stringify(item));
    }
    const type = first(item?.location_type, item?.locationType);
    return Boolean(naam) && ![3, 4, "3", "4"].includes(type);
  }).map(normalizeStop);
  const seen = new Set<string>();
  const journeys: SearchJourney[] = items
    .filter((item) => str(item?.kind).toLowerCase() === "rit")
    .map((item) => ({
      kind: "rit" as const,
      journeyId: str(first(item?.journey_id, item?.journeyId, item?.trip_id)).trim(),
      line: str(first(item?.line, item?.line_number), "?"),
      destination: str(first(item?.destination, item?.headsign), "Bestemming onbekend"),
      carrier: str(first(item?.carrier, item?.operator), ""),
      position: str(first(item?.position, item?.current_stop), ""),
      live: Boolean(item?.live),
      mode: pickMode(item)
    }))
    .filter((item) => {
      if (!item.journeyId || seen.has(item.journeyId)) return false;
      seen.add(item.journeyId);
      return true;
    });
  return { stops, journeys };
}

export async function searchStops(query: string): Promise<StopSummary[]> {
  return (await searchCatalog(query)).stops;
}

export async function getNearby(lat: number, lon: number): Promise<StopSummary[]> {
  const raw = await requestJson("/api/nearby", { lat, lon });
  return arrayOf<any>(first(raw?.stops, raw?.items, raw?.results, raw)).map(normalizeNearbyRow);
}

export async function getHalte(id: string): Promise<HalteBoardData> {
  const raw = await requestJson(`/api/halte/${encodeURIComponent(id)}`);
  const stopRaw = first(raw?.stop, raw?.halte, raw);
  return {
    stop: normalizeStop({ ...stopRaw, id, lines: first(raw?.lines, raw?.routes, stopRaw?.lines) }),
    departures: arrayOf<any>(first(raw?.departures, raw?.vertrekken, raw?.rows, raw?.items))
      .map((item) => normalizeDeparture({ ...item, feed_generated_at: raw?.generated_at })),
    arrivals: arrayOf<any>(first(raw?.arrivals, raw?.aankomsten)).map(normalizeDeparture),
    disruptions: parseStopDisruptions(first(raw?.disruptions, raw?.storingen, raw?.alerts), id),
    disruptionsAvailable: raw?.disruptions_available !== false && ["disruptions", "storingen", "alerts"].some(key => Object.prototype.hasOwnProperty.call(raw || {}, key) && raw[key] !== null),
    generatedAt: typeof raw?.generated_at === "string" ? raw.generated_at : undefined,
    feedAgeSeconds: typeof raw?.feed_age_seconds === "number" && Number.isFinite(raw.feed_age_seconds) && raw.feed_age_seconds >= 0
      ? raw.feed_age_seconds : undefined,
    stale: raw?.stale === true
  };
}

/** One bulk request for live position quality; never one request per departure. */
export async function getStopReliability(stopId: string, departures: readonly DepartureItem[]): Promise<Record<string, ReliabilityInfo>> {
  const ids = [...new Set(departures.filter((item) => item.isLive && item.ritId).map((item) => item.ritId!))].slice(0, 25);
  if (!ids.length) return {};
  const query = new URLSearchParams();
  ids.forEach((id) => query.append("journey", id));
  const raw = await requestJson(`/api/halte-extra/${encodeURIComponent(stopId)}?${query.toString()}`);
  const result: Record<string, ReliabilityInfo> = {};
  for (const id of ids) {
    const value = raw?.items?.[id]?.reliability;
    if (!value || !["very", "good", "reasonable", "low"].includes(value.level)) continue;
    result[id] = {
      level: value.level,
      label: str(value.label, "Onbekend"),
      ageSeconds: typeof value.age_seconds === "number" && Number.isFinite(value.age_seconds) ? value.age_seconds : null,
      estimatedPosition: value.estimated_position === true,
      explanation: str(value.explanation),
      source: str(value.source),
      receivedAt: Date.now()
    };
  }
  return result;
}

export async function getRit(id: string): Promise<RitData> {
  return normalizeRit(id, await requestJson(`/api/rit/${encodeURIComponent(id)}`));
}

/** Pure mapping of an /api/rit response; exported for regression tests. */
export function normalizeRit(id: string, raw: any): RitData {
  const line = str(first(raw?.line, raw?.line_number, raw?.trip?.line, raw?.service), "?");
  const carrier = str(first(raw?.carrier, raw?.operator, raw?.agency_name), inferCarrierFromLine(line));
  const points = arrayOf<any>(first(raw?.polyline, raw?.shape, raw?.route_shape, raw?.path)).map((point) => ({
    latitude: num(Array.isArray(point) ? point[0] : first(point?.latitude, point?.lat), 0) || 0,
    longitude: num(Array.isArray(point) ? point[1] : first(point?.longitude, point?.lon, point?.lng), 0) || 0
  }));
  const stopItems = arrayOf<any>(first(raw?.stops, raw?.timeline, raw?.haltes, raw?.journey));
  const vehicle = first(raw?.vehicle, raw?.position, raw?.live_position);
  const vLat = num(first(vehicle?.lat, vehicle?.latitude));
  const vLon = num(first(vehicle?.lon, vehicle?.lng, vehicle?.longitude));
  // /api/rit supplies the GPS age at the root, not inside `vehicle`.
  // Keep missing/invalid age absent: it must not turn into a fresh 0 seconds.
  // Delay from /api/rit is in SECONDS, including negative values for early running.
  // Missing data remains unknown; never manufacture a zero delay.
  const rawJourneyDelay = first(raw?.delay, raw?.delay_seconds);
  const journeyDelaySeconds = rawJourneyDelay === undefined ? undefined : num(rawJourneyDelay);
  const rawGpsAge = first(raw?.gps_age_seconds, raw?.gpsAgeSeconds);
  const gpsAgeSeconds = typeof rawGpsAge === "number" ||
    (typeof rawGpsAge === "string" && rawGpsAge.trim() !== "")
    ? num(rawGpsAge)
    : undefined;
  // Keep the ORIGINAL road geometry for live-position checks. Do not filter
  // invalid points: that could connect road segments which are not connected.
  const shape = first(raw?.shape, raw?.route_shape, raw?.routeShape, raw?.polyline, raw?.path);

  return {
    id,
    line,
    destination: str(first(raw?.destination, raw?.headsign, raw?.trip?.destination), "Onbekende bestemming"),
    carrier,
    mode: pickMode(raw),
    live: raw?.live === true,
    vehicle: vLat !== undefined && vLon !== undefined ? { lat: vLat, lon: vLon } : undefined,
    vehicleNumber: vehicleNumberOf(raw, vehicle),
    gpsAgeSeconds,
    delaySeconds: journeyDelaySeconds,
    shape: Array.isArray(shape) ? shape : undefined,
    estimatedPosition: raw?.estimated_position === true || raw?.estimatedPosition === true ||
      vehicle?.estimated_position === true || vehicle?.estimatedPosition === true,
    polyline: points.filter((point) => point.latitude !== 0 && point.longitude !== 0),
    stops: stopItems.map((item, index) => normalizeJourneyStop(item, index, stopItems.length, journeyDelaySeconds, raw?.live === true)),
    liveLabel: str(first(raw?.live_label, raw?.status_label), raw?.live === false ? "Dienstregeling" : "Live ritinformatie"),
    delayLabel: str(first(raw?.delay_label, raw?.delay_text), "") || undefined,
    cancelled: raw?.cancelled === true,
    disruptions: parseDisruptions(first(raw?.disruptions, raw?.alerts))
  };
}
