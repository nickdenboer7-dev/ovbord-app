import type { DepartureItem, JourneyStop, RitData, StopSummary } from "../types/api";

/** An open journey belongs to one departure row, not merely to the reusable trip ID. */
export function departureKey(item: DepartureItem, index: number): string {
  return [item.id, item.ritId || "", item.plannedTime, item.line, item.destination, index].join("|");
}

export function linesConflict(expected: string, actual: string): boolean {
  const normal = (value: string) => value.trim().replace(/^0+(?=\d)/, "").toUpperCase();
  const first = normal(expected);
  const second = normal(actual);
  if (!first || !second || first === "?" || second === "?") return false;
  // Compare only unambiguous service badges. Names like IC/Intercity may vary by source.
  if (/^\d+$/.test(first) && /^\d+$/.test(second)) return first !== second;
  if (/^N\d+$/.test(first) && /^N\d+$/.test(second)) return first !== second;
  return false;
}

export function usableClock(value?: string): boolean {
  if (!value) return false;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return false;
  return Number(match[1]) <= 29 && Number(match[2]) < 60;
}

export function reliableCurrent(stop: JourneyStop, journey: RitData | null): boolean {
  // 'current' alone is often inferred from timetable, not live vehicle tracking.
  return stop.state === "current" && Boolean(journey?.vehicle) && usableClock(stop.actualTime || stop.plannedTime);
}

export function incompleteJourney(stops: JourneyStop[]): boolean {
  return stops.length <= 2 || stops.some((stop) => !usableClock(stop.actualTime || stop.plannedTime));
}

function placeKey(stop: StopSummary): string {
  let name = stop.name.toLocaleLowerCase("nl").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
  const city = (stop.city || "").toLocaleLowerCase("nl").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
  if (city && name.startsWith(`${city} `)) name = name.slice(city.length + 1);
  return [city, name].join("|");
}

/** Different platform IDs from the same named stop should not produce duplicate Recents. */
export function uniqueRecentStops(stops: StopSummary[]): StopSummary[] {
  const seen = new Set<string>();
  return stops.filter((stop) => {
    const key = placeKey(stop) || `id:${stop.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
