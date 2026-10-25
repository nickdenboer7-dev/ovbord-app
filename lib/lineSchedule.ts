import type { DepartureItem } from "../types/api";

/**
 * Dienstregeling per lijn/richting/datum (Lijnen-tab, inline uitklap).
 * Pure helpers: geen React Native imports, zodat tests/lineSchedule.test.cjs ze kan draaien.
 *
 * Datumcontract (zelfde als /api/dienstregeling): `date` is een kalenderdatum (JJJJ-MM-DD);
 * een rit hoort erbij als het geplande vertrek bij deze halte op die dag valt. `serviceDate`
 * blijft de GTFS-dienstdag, zodat een nachtrit (24:30 van gisteren) herkenbaar blijft.
 */

export interface ScheduleTrip {
  tripId: string;
  realtimeTripId?: string;
  routeId: string;
  directionId: number | null;
  destination: string;
  stopId: string;
  platform?: string;
  plannedTime: string;
  plannedAt: string;
  serviceDate: string;
  /** Eindbestemming wijkt af van de hoofdbestemming van deze richting (korte rit, variant). */
  variant: boolean;
}

export interface ScheduleDirection {
  key: string;
  routeId: string;
  directionId: number | null;
  line: string;
  destination: string;
  destinations: string[];
  tripCount: number;
  firstTime?: string;
  lastTime?: string;
  trips: ScheduleTrip[];
}

export interface LineSchedule {
  date: string;
  inFeed: boolean;
  feedFirstDate?: string;
  feedLastDate?: string;
  /** Dagen in het komende venster waarop deze lijn(en) hier rijden. */
  serviceDates: string[];
  directions: ScheduleDirection[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function text(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function isoOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && ISO_DATE.test(value) ? value : undefined;
}

export function normalizeSchedule(raw: any): LineSchedule {
  const directions: ScheduleDirection[] = (Array.isArray(raw?.directions) ? raw.directions : []).map((d: any) => {
    const trips: ScheduleTrip[] = (Array.isArray(d?.trips) ? d.trips : [])
      .filter((t: any) => typeof t?.planned_at === "string" && Number.isFinite(Date.parse(t.planned_at)))
      .map((t: any) => ({
        tripId: text(t.trip_id),
        realtimeTripId: text(t.realtime_trip_id) || undefined,
        routeId: text(t.route_id),
        directionId: typeof t.direction_id === "number" ? t.direction_id : null,
        destination: text(t.destination, "Bestemming onbekend"),
        stopId: text(t.stop_id),
        platform: text(t.platform) || undefined,
        plannedTime: text(t.planned_time),
        plannedAt: t.planned_at,
        serviceDate: text(t.service_date),
        variant: t.variant === true
      }))
      .sort((a: ScheduleTrip, b: ScheduleTrip) => Date.parse(a.plannedAt) - Date.parse(b.plannedAt));
    return {
      key: text(d?.key),
      routeId: text(d?.route_id),
      directionId: typeof d?.direction_id === "number" ? d.direction_id : null,
      line: text(d?.line),
      destination: text(d?.destination, "Bestemming onbekend"),
      destinations: (Array.isArray(d?.destinations) ? d.destinations : []).map((x: any) => text(x)).filter(Boolean),
      tripCount: trips.length,
      firstTime: trips[0]?.plannedTime,
      lastTime: trips[trips.length - 1]?.plannedTime,
      trips
    };
  }).filter((d: ScheduleDirection) => d.key);
  return {
    date: isoOrUndefined(raw?.date) || "",
    inFeed: raw?.in_feed !== false,
    feedFirstDate: isoOrUndefined(raw?.feed_first_date),
    feedLastDate: isoOrUndefined(raw?.feed_last_date),
    serviceDates: (Array.isArray(raw?.service_dates) ? raw.service_dates : []).filter((x: any) => isoOrUndefined(x)),
    directions
  };
}

// ---------- datums (lokale kalenderdag van het toestel) ----------

export function localIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function partsOf(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = partsOf(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

function weekday(iso: string): number {
  const [y, m, d] = partsOf(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "Maandag 26 oktober" */
export function longDateLabel(iso: string): string {
  const [, m, d] = partsOf(iso);
  const day = DAYS[weekday(iso)];
  return day.charAt(0).toUpperCase() + day.slice(1) + " " + d + " " + MONTHS[m - 1];
}

/** "do 29 okt" */
export function shortDateLabel(iso: string): string {
  const [, m, d] = partsOf(iso);
  return DAYS[weekday(iso)].slice(0, 2) + " " + d + " " + MONTHS[m - 1].slice(0, 3);
}

export function monthLabel(year: number, month: number): string {
  const name = MONTHS[month - 1];
  return name.charAt(0).toUpperCase() + name.slice(1) + " " + year;
}

/** Weken (maandag eerst) met ISO-datums; null voor lege vakjes. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const offset = (weekday(first) + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(addDays(first, d - 1));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type DayState = "selectable" | "noService" | "unavailable";

/** Kalenderdag: vóór vandaag of buiten de dienstregeling = niet kiesbaar; zonder ritten = gedimd maar kiesbaar. */
export function dayState(iso: string, today: string, schedule: Pick<LineSchedule, "feedLastDate" | "serviceDates"> | null, maxDaysAhead = 62): DayState {
  if (iso < today || iso > addDays(today, maxDaysAhead)) return "unavailable";
  if (schedule?.feedLastDate && iso > schedule.feedLastDate) return "unavailable";
  if (schedule && schedule.serviceDates.length && !schedule.serviceDates.includes(iso)) return "noService";
  return "selectable";
}

// ---------- richting kiezen en live koppelen ----------

function norm(value: string): string {
  return value.toLocaleLowerCase("nl").split(/\s+/).filter(Boolean).join(" ");
}

/**
 * Bij welke dienstregelingsrichting hoort een rij uit het Lijnen-overzicht?
 * Eerst via echte GTFS-trip-ID's, dan via eindbestemming; nooit een richting verzinnen.
 */
export function pickDirection(schedule: LineSchedule, row: { destination: string; gtfsTripIds: string[]; routeIds?: string[] }): ScheduleDirection | null {
  const dirs = schedule.directions.filter((d) => !row.routeIds?.length || row.routeIds.includes(d.routeId));
  const pool = dirs.length ? dirs : schedule.directions;
  const ids = new Set(row.gtfsTripIds.filter(Boolean));
  if (ids.size) {
    const byTrip = pool.find((d) => d.trips.some((t) => ids.has(t.tripId)));
    if (byTrip) return byTrip;
  }
  const dest = norm(row.destination);
  return pool.find((d) => norm(d.destination) === dest)
    || pool.find((d) => d.destinations.some((x) => norm(x) === dest))
    || null;
}

/** Tegenrichting op dezelfde route (alleen bij een echte direction_id, anders bij precies twee groepen). */
export function oppositeDirection(schedule: LineSchedule, current: ScheduleDirection): ScheduleDirection | null {
  const same = schedule.directions.filter((d) => d.routeId === current.routeId && d.key !== current.key);
  if (current.directionId !== null) {
    return same.find((d) => d.directionId !== null && d.directionId !== current.directionId) || null;
  }
  return same.length === 1 ? same[0] : null;
}

export function liveByTripId(departures: readonly DepartureItem[]): Map<string, DepartureItem> {
  const map = new Map<string, DepartureItem>();
  for (const dep of departures) {
    if (dep.gtfsTripId && !map.has(dep.gtfsTripId)) map.set(dep.gtfsTripId, dep);
  }
  return map;
}

/** Vertrekmoment voor "al geweest": live verwachting als die er is, anders gepland. */
export function tripMomentMs(trip: ScheduleTrip, live?: DepartureItem): number {
  const effective = live?.effectiveAt ? Date.parse(live.effectiveAt) : NaN;
  return Number.isFinite(effective) ? effective : Date.parse(trip.plannedAt);
}

/** Index van het eerstvolgende vertrek (vandaag), of -1 als alles al geweest is. */
export function nextTripIndex(trips: readonly ScheduleTrip[], live: Map<string, DepartureItem>, nowMs: number): number {
  return trips.findIndex((t) => {
    const dep = live.get(t.tripId);
    if (dep?.departed === true) return false;
    return tripMomentMs(t, dep) >= nowMs - 60_000;
  });
}

/** Meerdere perrons in één richting: dan per rit het perron tonen. */
export function showsPlatforms(direction: ScheduleDirection): boolean {
  return new Set(direction.trips.map((t) => t.stopId)).size > 1 && direction.trips.some((t) => t.platform);
}

// ---------- kleine cache (zelfde dag + lijn niet opnieuw ophalen) ----------

const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: Promise<LineSchedule> }>();

export function scheduleCacheKey(stopId: string, routeIds: readonly string[], line: string, date: string): string {
  return [stopId, [...routeIds].sort().join(","), routeIds.length ? "" : line.toLowerCase(), date].join("|");
}

export function cachedSchedule(key: string, load: () => Promise<LineSchedule>, nowMs = Date.now()): Promise<LineSchedule> {
  const hit = cache.get(key);
  if (hit && nowMs - hit.at < CACHE_TTL_MS) return hit.value;
  const value = load();
  cache.set(key, { at: nowMs, value });
  value.catch(() => { if (cache.get(key)?.value === value) cache.delete(key); });
  if (cache.size > 60) cache.delete(cache.keys().next().value as string);
  return value;
}

// ---------- onthouden binnen de sessie (terug naar de Lijnen-tab) ----------

export type LinesTabMemory = { expanded: string | null; date: string | null; scrollY: number };
const memory = new Map<string, LinesTabMemory>();

export function rememberLinesTab(stopId: string, patch: Partial<LinesTabMemory>): void {
  const prev = memory.get(stopId) || { expanded: null, date: null, scrollY: 0 };
  memory.set(stopId, { ...prev, ...patch });
}

export function recallLinesTab(stopId: string): LinesTabMemory {
  return memory.get(stopId) || { expanded: null, date: null, scrollY: 0 };
}
