/** Lightweight, testable viewport logic for the native-view OVbord route map. */
export type MapPoint = { lat: number; lon: number };
export type MapViewMode = "overview" | "follow" | "stop" | "manual";

function valid(p: MapPoint | null | undefined): p is MapPoint {
  return Boolean(p && Number.isFinite(p.lat) && Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 85 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0));
}

/** Following is possible only with a fresh, vetted vehicle position passed by the screen. */
export function routeMapCenter(
  mode: MapViewMode,
  vehicle: MapPoint | null | undefined,
  boarding: MapPoint | null | undefined,
  fallback: MapPoint | null | undefined,
  selected: MapPoint | null | undefined
): MapPoint | null {
  if (mode === "follow" && valid(vehicle)) return vehicle;
  if ((mode === "stop" || mode === "manual" || mode === "follow") && valid(selected)) return selected;
  if (valid(vehicle) && valid(boarding))
    return { lat: (vehicle.lat + boarding.lat) / 2, lon: (vehicle.lon + boarding.lon) / 2 };
  return valid(vehicle) ? vehicle : valid(boarding) ? boarding : valid(fallback) ? fallback : null;
}

function projected(point: MapPoint, zoom: number) {
  const rad = point.lat * Math.PI / 180;
  const size = 256 * Math.pow(2, zoom);
  return {
    x: (point.lon + 180) / 360 * size,
    y: (0.5 - Math.log((1 + Math.sin(rad)) / (1 - Math.sin(rad))) / (4 * Math.PI)) * size
  };
}

/** Overview fits vehicle and chosen stop. The component must not re-fit after manual zoom. */
export function routeOverviewZoom(
  vehicle: MapPoint | null | undefined,
  boarding: MapPoint | null | undefined,
  width: number,
  height: number
): number {
  if (!valid(vehicle) || !valid(boarding) || width < 150 || height < 150) return 14;
  for (let z = 16; z >= 11; z--) {
    const a = projected(vehicle, z), b = projected(boarding, z);
    if (Math.abs(a.x - b.x) < width - 100 && Math.abs(a.y - b.y) < height - 105)
      return z;
  }
  return 11;
}

/** Include the next GPS-confirmed stop while keeping the vehicle centered. */
export function routeFollowZoom(
  vehicle: MapPoint | null | undefined,
  nextStop: MapPoint | null | undefined,
  width: number,
  height: number
): number {
  if (!valid(vehicle) || !valid(nextStop) || width < 150 || height < 150) return 16;
  for (let z = 16; z >= 11; z--) {
    const a = projected(vehicle, z), b = projected(nextStop, z);
    if (Math.abs(a.x - b.x) < width / 2 - 38 && Math.abs(a.y - b.y) < height / 2 - 60) return z;
  }
  return 11;
}

/** Map drag in screen pixels (rightward drag means westward map-center shift). */
export function panMapCenter(
  center: MapPoint | null | undefined, zoom: number, dx: number, dy: number
): MapPoint | null {
  if (!valid(center) || !Number.isFinite(zoom) || !Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const size = 256 * Math.pow(2, zoom);
  const p = projected(center, zoom);
  const x = p.x - dx, y = Math.max(0.01, Math.min(size - 0.01, p.y - dy));
  const lon = ((x / size * 360 + 540) % 360 + 360) % 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI;
  return { lat: Math.max(-85, Math.min(85, lat)), lon };
}

/** A stale GPS observation must never be described as a live vehicle position. */
export function mapGpsLabel(age: number | undefined, confirmed: boolean, estimated: boolean): {
  text: string; tone: "green" | "amber" | "red" | "muted"
} {
  if (estimated) return { text: "Geschatte positie · geen live GPS", tone: "muted" };
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0)
    return { text: "Geen bevestigde GPS-positie", tone: "muted" };
  const seconds = Math.floor(age);
  if (confirmed && age <= 30) return { text: `Live GPS · ${seconds} sec geleden`, tone: "green" };
  if (confirmed && age < 45) return { text: `GPS · ${seconds} sec geleden`, tone: "amber" };
  if (age <= 120) return { text: `GPS ${seconds} sec oud · niet live`, tone: "amber" };
  return { text: "GPS ouder dan 2 min · niet live", tone: "red" };
}
