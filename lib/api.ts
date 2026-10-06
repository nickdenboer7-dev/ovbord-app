import { inferCarrierFromLine } from "../constants/vervoerders";
import { DepartureItem, HalteBoardData, JourneyStop, Mode, RitData, StopSummary } from "../types/api";
import { formatClock, inferTrend, normalizeMode, relativeMinutesText } from "./format";

const API_BASE = "https://ovbord.nl";

function arrayOf<T = any>(value: any): T[] {
  return Array.isArray(value) ? value : [];
}

function str(value: any, fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
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

function pickMode(item: any): Mode {
  return normalizeMode(first(item?.mode, item?.modaliteit, item?.route_type, item?.vehicle_type, item?.type));
}

function mapLines(item: any) {
  const detailedLines = arrayOf<any>(item?.line_details);
  const rawLines = detailedLines.length
    ? detailedLines
    : arrayOf<any>(first(item?.lines, item?.lijnbadges, item?.line_badges, item?.routes));
  const source = rawLines.length ? rawLines : arrayOf<any>(item?.line ? [{ line: item.line, carrier: item.carrier }] : []);
  return source.map((entry) => {
    const line = str(first(entry?.line, entry?.number, entry?.name, entry));
    return {
      line,
      carrier: str(first(entry?.carrier, entry?.operator, entry?.agency_name, item?.carrier), inferCarrierFromLine(line))
    };
  });
}

function normalizeStop(item: any): StopSummary {
  const id = str(first(item?.id, item?.stop_id, item?.halte_id, item?.code, item?.ids?.[0])) || "unknown";
  const distanceMeters = num(first(item?.distance_meters, item?.distance_m, item?.distance, item?.distanceMeters));
  const walkMinutes = distanceMeters !== undefined
    ? Math.max(1, Math.round(distanceMeters / 80))
    : undefined;

  return {
    id,
    name: str(first(item?.name, item?.stop_name, item?.title), "Onbekende halte"),
    city: str(first(item?.city, item?.place, item?.town, item?.municipality, item?.gemeente), ""),
    mode: pickMode(item),
    walkMinutes,
    distanceMeters,
    lat: num(first(item?.lat, item?.latitude)),
    lon: num(first(item?.lon, item?.lng, item?.longitude)),
    lines: mapLines(item)
  };
}

function normalizeDeparture(item: any): DepartureItem {
  const line = str(first(item?.line, item?.line_number, item?.service, item?.route_short_name), "?");
  const plannedRaw = first(item?.planned_time, item?.planned_departure, item?.departure_time, item?.time, item?.vertrek);
  const effectiveRaw = first(item?.effective_time, item?.actual_time, item?.expected_time, item?.realtime_time, plannedRaw);
  const delayMinutes = num(first(item?.delay_minutes, item?.delay, item?.vertraging));
  const alert = str(first(item?.alert, item?.disruption, item?.storing), "") || undefined;
  const effectiveDelay = Math.max(0, delayMinutes ?? 0);
  const reliability: DepartureItem["reliability"] = alert || effectiveDelay > 3
    ? "low"
    : effectiveDelay >= 1
      ? "medium"
      : "high";

  return {
    id: str(first(item?.id, item?.trip_id, item?.rit_id, `${line}-${plannedRaw}-${item?.destination}`)),
    ritId: str(first(item?.rit_id, item?.journey_id, item?.trip_id, item?.gtfs_trip_id, item?.realtime_trip_id), "") || undefined,
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
    plannedTime: formatClock(effectiveRaw),
    relativeText: relativeMinutesText(effectiveRaw),
    delayMinutes,
    reliability,
    trend: item?.trend || inferTrend(delayMinutes),
    platform: str(first(item?.platform, item?.spoor, item?.perron), "") || undefined,
    alert,
    mode: pickMode(item)
  };
}

function normalizeJourneyStop(item: any, index: number, total: number): JourneyStop {
  const stateRaw = str(first(item?.state, item?.status), "").toLowerCase();
  let state: JourneyStop["state"] = "upcoming";
  if (stateRaw.includes("passed") || stateRaw.includes("gepasseerd")) state = "passed";
  else if (stateRaw.includes("current") || stateRaw.includes("nu")) state = "current";
  else if (index === total - 1) state = "end";

  return {
    id: str(first(item?.id, item?.stop_id, `${index}`)),
    name: str(first(item?.name, item?.stop_name), "Onbekende halte"),
    plannedTime: formatClock(first(item?.planned_time, item?.planned_arrival, item?.time)),
    actualTime: first(item?.actual_time, item?.actual_arrival, item?.actual_departure)
      ? formatClock(first(item?.actual_time, item?.actual_arrival, item?.actual_departure))
      : undefined,
    delayMinutes: num(first(item?.delay_minutes, item?.delay)),
    state,
    platform: str(first(item?.platform, item?.spoor, item?.perron), "") || undefined,
    platformChanged: Boolean(first(item?.platform_changed, item?.spoorwijziging)),
    lat: num(first(item?.lat, item?.latitude)),
    lon: num(first(item?.lon, item?.longitude))
  };
}

async function requestJson(path: string, params?: Record<string, string | number | undefined>) {
  const url = new URL(`${API_BASE}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`OVbord API ${response.status}: ${path}`);
  return response.json();
}

export async function searchStops(query: string): Promise<StopSummary[]> {
  const raw = await requestJson("/api/search", { q: query });
  return arrayOf<any>(first(raw?.results, raw?.items, raw)).map(normalizeStop);
}

export async function getNearby(lat: number, lon: number): Promise<StopSummary[]> {
  const raw = await requestJson("/api/nearby", { lat, lon });
  return arrayOf<any>(first(raw?.stops, raw?.items, raw?.results, raw)).map(normalizeStop);
}

export async function getHalte(id: string): Promise<HalteBoardData> {
  const raw = await requestJson(`/api/halte/${encodeURIComponent(id)}`);
  const stopRaw = first(raw?.stop, raw?.halte, raw);
  return {
    stop: normalizeStop({ ...stopRaw, id, lines: first(raw?.lines, raw?.routes, stopRaw?.lines) }),
    departures: arrayOf<any>(first(raw?.departures, raw?.vertrekken, raw?.rows, raw?.items)).map(normalizeDeparture),
    arrivals: arrayOf<any>(first(raw?.arrivals, raw?.aankomsten)).map(normalizeDeparture),
    disruptions: arrayOf<any>(first(raw?.disruptions, raw?.storingen, raw?.alerts)).map((item) =>
      str(first(item?.title, item?.message, item), "")
    ).filter(Boolean)
  };
}

export async function getRit(id: string): Promise<RitData> {
  const raw = await requestJson(`/api/rit/${encodeURIComponent(id)}`);
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

  return {
    id,
    line,
    destination: str(first(raw?.destination, raw?.headsign, raw?.trip?.destination), "Onbekende bestemming"),
    carrier,
    mode: pickMode(raw),
    vehicle: vLat !== undefined && vLon !== undefined ? { lat: vLat, lon: vLon } : undefined,
    polyline: points.filter((point) => point.latitude !== 0 && point.longitude !== 0),
    stops: stopItems.map((item, index) => normalizeJourneyStop(item, index, stopItems.length)),
    liveLabel: str(first(raw?.live_label, raw?.status_label), raw?.live === false ? "Dienstregeling" : "Live ritinformatie"),
    delayLabel: str(first(raw?.delay_label, raw?.delay_text), "") || undefined
  };
}
