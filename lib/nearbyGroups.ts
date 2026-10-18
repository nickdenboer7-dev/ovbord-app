import type { StopSummary } from "../types/api";

/** Nearby only: group apparent stop-area variants without dropping any public stop ID. */
export type NearbyStopGroup = {
  key: string;
  name: string;
  walkMinutes?: number;
  stops: StopSummary[];
};

function normalized(value: string): string {
  return value.toLocaleLowerCase("nl").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** The stop's place: the API city, or (when the feed left it empty) a short "Plaats, " name prefix. */
function cityOf(stop: StopSummary): string {
  if (stop.city) return stop.city;
  const parts = stop.name.replace(/^\[[^\]]+\]\s*/, "").split(", ");
  return parts.length === 2 && parts[0].length <= 30 ? parts[0] : "";
}

function presentableName(stop: StopSummary): string {
  let name = stop.name.replace(/^\[[^\]]+\]\s*/, "").trim();
  const city = cityOf(stop);
  if (city && name.toLocaleLowerCase("nl").startsWith(city.toLocaleLowerCase("nl") + ", ")) {
    name = name.slice(city.length + 2);
  }
  name = name.replace(/^(?:metrostation|busstation|treinstation|bushalte)\s+/i, "")
    .replace(/\s+(?:metrostation|metrohalte|metro|bushalte)$/i, "");
  return name || stop.name;
}

function groupStem(stop: StopSummary): string {
  let name = presentableName(stop);
  name = name.replace(/^(?:station|halte)\s+/i, "");
  const city = cityOf(stop);
  if (city && name.toLocaleLowerCase("nl").startsWith(city.toLocaleLowerCase("nl") + " ")) name = name.slice(city.length + 1);
  return normalized(name);
}

function distanceMeters(a: StopSummary, b: StopSummary): number | null {
  if (a.lat === undefined || a.lon === undefined || b.lat === undefined || b.lon === undefined) return null;
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad;
  const dlon = (b.lon - a.lon) * rad;
  const t = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlon / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(t)));
}

function sameArea(a: StopSummary, b: StopSummary): boolean {
  const aa = groupStem(a), bb = groupStem(b);
  if (!aa || !bb) return false;
  const cityA = normalized(cityOf(a)), cityB = normalized(cityOf(b));
  if (cityA && cityB && cityA !== cityB) return false;
  const distance = distanceMeters(a, b);
  if (distance !== null && distance > 180) return false;
  if (aa === bb) return true;
  // "Amsterdam Lelylaan" / "Station Lelylaan": allow one locality prefix only with actual
  // nearby coordinates, not based on text alone (other similarly named stops stay separate).
  return distance !== null && Math.min(aa.length, bb.length) >= 7 &&
    (aa.endsWith(" " + bb) || bb.endsWith(" " + aa));
}

export function groupNearbyStops(stops: readonly StopSummary[]): NearbyStopGroup[] {
  const groups: NearbyStopGroup[] = [];
  for (const stop of stops) {
    // A stop joins a group only when it matches one member AND no member lies in another known
    // place: a member without a city must never bridge "Zaandam, X" into an Amsterdam group.
    const place = normalized(cityOf(stop));
    const existing = groups.find((group) => group.stops.some((member) => sameArea(member, stop)) &&
      (!place || group.stops.every((member) => { const other = normalized(cityOf(member)); return !other || other === place; })));
    if (existing) {
      if (!existing.stops.some((member) => member.id === stop.id)) existing.stops.push(stop);
      if (stop.walkMinutes !== undefined) existing.walkMinutes = Math.min(existing.walkMinutes ?? Infinity, stop.walkMinutes);
      const name = presentableName(stop);
      if (!name.startsWith("[") && name.length < existing.name.length) existing.name = name;
    } else {
      groups.push({ key: stop.id, name: presentableName(stop), walkMinutes: stop.walkMinutes, stops: [stop] });
    }
  }
  return groups;
}

export function nearbyModeLabel(stop: StopSummary): string {
  const label = { bus: "Bushalte", tram: "Tramhalte", metro: "Metrostation", train: "Treinstation", ferry: "Veerhalte" };
  return label[stop.mode] || "Halte";
}
