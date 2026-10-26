import * as Location from "expo-location";

export const VOORBEELD_LOCATIE_UTRECHT = { latitude: 52.0907, longitude: 5.1214 };

export const MANUAL_CITIES = [
  { key: "utrecht", name: "Utrecht", latitude: 52.0907, longitude: 5.1214 },
  { key: "amsterdam", name: "Amsterdam", latitude: 52.3676, longitude: 4.9041 },
  { key: "rotterdam", name: "Rotterdam", latitude: 51.9244, longitude: 4.4777 },
  { key: "denhaag", name: "Den Haag", latitude: 52.0705, longitude: 4.3007 },
  { key: "leeuwarden", name: "Leeuwarden", latitude: 53.2012, longitude: 5.7999 }
] as const;

export type LocatieResultaat = {
  coords: { latitude: number; longitude: number };
  bron: "gps" | "laatst-bekend" | "voorbeeld" | "handmatig";
  cityName?: string;
  /**
   * V5.8.1: the real moment this fix was taken (the GPS reading's own timestamp for "gps" and
   * "laatst-bekend"; "now" for "handmatig"/"voorbeeld", which are not real GPS reads). Lets callers
   * order fixes correctly even when requests resolve out of order (lib/liveLocation.ts).
   */
  fixAt: number;
};

export type LocatieFoutCode = "permission-denied" | "no-gps" | "outside-nl";

export class LocatieFout extends Error {
  constructor(public readonly code: LocatieFoutCode) {
    super(code);
    this.name = "LocatieFout";
  }
}

/** Strict foreground location validation: reject 0,0 and locations outside the Netherlands. */
function valideCoords(coords: { latitude: number; longitude: number }): boolean {
  return Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude) &&
    coords.latitude >= 50.65 && coords.latitude <= 53.75 &&
    coords.longitude >= 3.25 && coords.longitude <= 7.35;
}

function isOutside(coords: { latitude: number; longitude: number }): boolean {
  return Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude) &&
    Math.abs(coords.latitude) <= 90 && Math.abs(coords.longitude) <= 180 && !valideCoords(coords);
}

/**
 * preferFresh (V5.8.1, live location): ask for a current GPS fix first and only fall back to a
 * last-known position when no current one arrives, so a last-known fix never goes ahead of an
 * available current one.
 */
type Opties = { manualCity?: string | null; fallbackToExample?: boolean; preferFresh?: boolean;
  /** Use a more accurate foreground GPS reading when the last fix is old or the user retries. */
  preferPrecise?: boolean;
  /** V5.9: false = never show the permission dialog here (the caller already asked once). */
  askPermission?: boolean };

/** Shared by Start and Buurtbord; only explicit choices may override a real GPS position. */
export async function bepaalLocatie(options: Opties = {}): Promise<LocatieResultaat> {
  const manual = MANUAL_CITIES.find((city) => city.key === options.manualCity);
  if (manual) {
    return { coords: { latitude: manual.latitude, longitude: manual.longitude }, bron: "handmatig", cityName: manual.name, fixAt: Date.now() };
  }
  const voorbeeld: LocatieResultaat = { coords: VOORBEELD_LOCATIE_UTRECHT, bron: "voorbeeld", fixAt: Date.now() };
  const fail = (code: LocatieFoutCode): LocatieResultaat => {
    if (options.fallbackToExample !== false) return voorbeeld;
    throw new LocatieFout(code);
  };

  try {
    const current = await Location.getForegroundPermissionsAsync();
    const permission = current.granted || !current.canAskAgain || options.askPermission === false
      ? current : await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return fail("permission-denied");

    if (!(await Location.hasServicesEnabledAsync())) return fail("no-gps");
    let outside = false;

    if (!options.preferFresh) {
      const recent = await Location.getLastKnownPositionAsync({ maxAge: 120000 }).catch(() => null);
      if (recent && valideCoords(recent.coords)) {
        return { coords: recent.coords, bron: "laatst-bekend", fixAt: recent.timestamp ?? Date.now() };
      }
      if (recent && isOutside(recent.coords)) outside = true;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), options.preferPrecise ? 12000 : 8000); });
      const fresh = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: options.preferPrecise ? Location.Accuracy.High : Location.Accuracy.Balanced }).catch(() => null),
        deadline
      ]);
      if (fresh && valideCoords(fresh.coords)) return { coords: fresh.coords, bron: "gps", fixAt: fresh.timestamp ?? Date.now() };
      if (fresh && isOutside(fresh.coords)) outside = true;
    } finally {
      if (timer) clearTimeout(timer);
    }

    const older = await Location.getLastKnownPositionAsync({ maxAge: 600000 }).catch(() => null);
    if (older && valideCoords(older.coords)) {
      return { coords: older.coords, bron: "laatst-bekend", fixAt: older.timestamp ?? Date.now() };
    }
    if (older && isOutside(older.coords)) outside = true;
    return fail(outside ? "outside-nl" : "no-gps");
  } catch (error) {
    if (error instanceof LocatieFout) throw error;
    if (__DEV__) console.warn("Locatie mislukt, val terug", error);
    return fail("no-gps");
  }
}
