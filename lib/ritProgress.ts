/**
 * Texts for the calm trip page (V5.4 "Rustig"): one position card with one line
 * that follows the trip, and spoken labels for the timeline.
 */

/** Headline of the position card: where the vehicle is, or why that is not known. */
/** V5.7: "Tussen A en B" from verified GPS reads as "Onderweg tussen A en B"; anything else is unchanged. */
export function onTheWayText(placeText: string): string {
  return placeText.startsWith("Tussen ") ? "Onderweg tussen " + placeText.slice("Tussen ".length) : placeText;
}

export function positionHeadline(input: { ended: boolean; placeText: string; live: boolean; cancelled: boolean }): string {
  if (input.cancelled) return "Deze rit rijdt niet";
  if (input.ended) return "Rit beëindigd";
  if (input.placeText) return input.placeText;
  return "Positie niet bevestigd";
}

function countdown(minutes: number | null, lastKnown: boolean): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes > 90) return "";
  if (minutes <= 0) return lastKnown ? "± nu" : "nu";
  return (lastKnown ? "± " : "over ") + minutes + " min";
}

/** One row in the position card: the stop name first, then time and countdown; details on a second line. */
export type StopRow = { name: string; clock: string; delay: string; countdown: string; detail: string };

/**
 * Row for the boarding stop: "Rembrandtplein · 02:41 −1 · over 6 min" with
 * "Vertrek 02:42 · spoor 5" below; null once the vehicle has passed the stop.
 */
export function boardingProgress(input: {
  name: string; clock: string; delayMinutes?: number; minutes: number | null;
  state: "at" | "approaching" | "passed" | "unknown"; platform?: string; note?: string | null; lastKnown: boolean;
}): StopRow | null {
  if (input.state === "passed" || !input.name) return null;
  // Without GPS the timetable decides: more than a minute past the time, the stop is behind the trip.
  if (input.state === "unknown" && input.minutes !== null && input.minutes < -1) return null;
  const d = input.delayMinutes;
  const delay = typeof d === "number" && Number.isFinite(d) && Math.round(d) !== 0 ? (d > 0 ? "+" + Math.round(d) : "−" + Math.abs(Math.round(d))) : "";
  const at = input.state === "at";
  return {
    name: input.name, clock: input.clock, delay,
    countdown: at ? (input.lastKnown ? "laatst bij je halte" : "bij je halte") : countdown(input.minutes, input.lastKnown),
    detail: [input.note || "", input.platform || ""].filter(Boolean).join(" · ")
  };
}

/** Row for the alighting stop: "Spaklerweg · 02:57 · over 22 min" with "nog 11 haltes" below. */
export function alightRow(input: {
  name: string; clock: string; minutes: number | null; status: "approaching" | "next" | "at" | "passed";
  remaining: number | null; lastKnown: boolean;
}): StopRow {
  const { status, lastKnown, remaining } = input;
  const detail = status === "at" ? (lastKnown ? "Laatst bekend: bij je uitstaphalte" : "Stap hier uit")
    : status === "passed" ? "Uitstaphalte gepasseerd"
    : status === "next" ? (lastKnown ? "Laatst bekend: volgende halte" : "Volgende halte: uitstappen")
    : remaining !== null && remaining > 0 ? "nog " + remaining + (remaining === 1 ? " halte" : " haltes") : "";
  return {
    name: input.name, clock: input.clock, delay: "",
    countdown: status === "passed" ? "" : status === "at" ? (lastKnown ? "± nu" : "nu") : countdown(input.minutes, lastKnown),
    detail
  };
}

/** Spoken label of one timeline stop: name, time, and what it means for this trip. */
export function timelineStopLabel(input: {
  name: string; clock: string; delayMinutes?: number; platform?: string;
  passed: boolean; vehicleHere: boolean; next: boolean; boarding: boolean; alight: boolean; last: boolean; lastKnown: boolean; estimated?: boolean;
  /** A notice says the vehicle does not call here. */
  skipped?: boolean;
}): string {
  const parts = [input.name, input.clock];
  const d = input.delayMinutes;
  if (!input.passed && typeof d === "number" && Number.isFinite(d) && Math.round(d) !== 0) {
    parts.push(Math.abs(Math.round(d)) + (Math.abs(Math.round(d)) === 1 ? " minuut " : " minuten ") + (d > 0 ? "later" : "eerder"));
  }
  if (input.platform && !input.passed) parts.push(input.platform);
  if (input.vehicleHere) parts.push(input.estimated ? "huidige halte volgens verwachte tijden" : input.lastKnown ? "voertuig was hier" : "voertuig is hier");
  else if (input.passed) parts.push("gepasseerd");
  else if (input.next) parts.push(input.lastKnown ? "laatst bekend als volgende halte" : "volgende halte");
  if (input.boarding) parts.push("jouw halte");
  if (input.alight) parts.push("jouw uitstaphalte");
  if (input.last) parts.push("eindhalte");
  if (input.skipped && !input.passed) parts.push("stopt hier niet volgens een melding");
  return parts.join(", ");
}

/**
 * Vibrate once per trip and alighting stop when it becomes the next stop (or the
 * vehicle is already there); never on last-known data. Returns the key to remember, or null.
 */
export function alightAlertKey(tripId: string, alighting: { id: string; index: number } | null,
  status: "approaching" | "next" | "at" | "passed", lastKnown: boolean): string | null {
  if (!tripId || !alighting || lastKnown) return null;
  if (status !== "next" && status !== "at") return null;
  return tripId + "|" + alighting.index + "|" + alighting.id;
}

const alerted = new Set<string>();
export const MAX_ALIGHT_ALERTS = 30;

/** True the first time a key is seen while the app runs; reopening the trip does not vibrate again. */
export function markAlightAlert(key: string): boolean {
  if (alerted.has(key)) return false;
  alerted.add(key);
  while (alerted.size > MAX_ALIGHT_ALERTS) {
    const oldest = alerted.values().next();
    if (oldest.done) break;
    alerted.delete(oldest.value);
  }
  return true;
}

/** A notice that says the vehicle does not call at its stops ("Halte vervalt", "stopt hier niet"). */
export function isSkipNotice(notice: { badge?: string; title?: string; description?: string }): boolean {
  return /halte\s*vervalt|vervallen\s+halte|stopt\s+(hier\s+)?niet|rijdt\s+niet\s+langs/i.test(
    [notice.badge, notice.title, notice.description].filter(Boolean).join(" "));
}

/** Stops of this trip that are skipped according to the notices (matched by stop ID). */
export function skippedStopIds(notices: readonly { badge?: string; title?: string; description?: string; stopIds?: string[] }[],
  stops: readonly { id: string }[]): Set<string> {
  const onTrip = new Set(stops.map((stop) => String(stop.id)));
  const skipped = new Set<string>();
  for (const notice of notices) {
    if (!isSkipNotice(notice)) continue;
    for (const id of notice.stopIds || []) if (onTrip.has(id)) skipped.add(id);
  }
  return skipped;
}

/** "Geldt voor: Wibautstraat, Prins Bernhardplein" for the stops of this trip a notice is attached to. */
export function noticeStopsText(stopIds: readonly string[] | undefined, stops: readonly { id: string; name: string }[],
  shortName: (name: string) => string, max = 4): string {
  if (!stopIds?.length) return "";
  const wanted = new Set(stopIds);
  const names: string[] = [];
  for (const stop of stops) {
    const name = shortName(stop.name);
    if (wanted.has(String(stop.id)) && !names.includes(name)) names.push(name);
  }
  if (!names.length) return "";
  const shown = names.slice(0, max).join(", ");
  return "Geldt voor: " + shown + (names.length > max ? " en " + (names.length - max) + " meer" : "");
}

/** Only stop-relocation notices can offer a map link; a general delay is not a boarding change. */
export function isStopRelocationNotice(notice: { badge?: string; title?: string; description?: string }): boolean {
  return /andere\s+(kant|zijde)|halte\s*(?:wijziging|verplaatst)|verplaatste\s+halte|tijdelijke\s+halte|andere\s+halte/i.test(
    [notice.badge, notice.title, notice.description].filter(Boolean).join(" "));
}

/** Locate affected route stops by their actual stop IDs, never by matching names or guessing a quay. */
export function noticeStopTargets<T extends { id: string }>(
  notice: { badge?: string; title?: string; description?: string; stopIds?: readonly string[] },
  stops: readonly T[]
): T[] {
  if (!isStopRelocationNotice(notice) || !notice.stopIds?.length) return [];
  const affected = new Set(notice.stopIds.map(String));
  const seen = new Set<string>();
  return stops.filter(stop => {
    const id = String(stop.id);
    if (!affected.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}
