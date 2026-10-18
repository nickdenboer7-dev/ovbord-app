import type { LineInfo, Mode, StopSummary } from "../types/api";
import { MODE_ORDER, mergeLines, sortLines } from "./lineSet";

/** Nearby only: group apparent stop-area variants without dropping any public stop ID. */
export type NearbyStopGroup = {
  key: string;
  name: string;
  walkMinutes?: number;
  /** Every real stop ID in the group (backend "quays" are expanded), nearest first per input order. */
  stops: StopSummary[];
};

/**
 * V5.9.1: one row per kind of transport inside a stop area ("Metrostation", "Bushalte"), with the
 * complete line set of that mode across all of the area's platforms, without duplicates.
 */
export type NearbyModeRow = {
  key: string;
  mode: Mode;
  label: string;
  lines: LineInfo[];
  /** The real stops of this mode, nearest first (empty when only the stop area's board knows the mode). */
  stops: StopSummary[];
  /** The real stop ID this row opens: the nearest stop of this mode, else the group's nearest stop. */
  openStop: StopSummary;
  walkMinutes?: number;
};

const MODE_LABEL: Record<Mode, string> = { bus: "Bushalte", tram: "Tramhalte", metro: "Metrostation", train: "Treinstation", ferry: "Veerhalte" };

export function modeLabel(mode: Mode | undefined): string {
  return (mode && MODE_LABEL[mode]) || "Halte";
}

function normalized(value: string): string {
  return value.toLocaleLowerCase("nl").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

/** "[Amsterdam Lelylaan] Halte C, Willem Frogerplein": the station between the brackets. */
function bracketParent(name: string): string | null {
  const match = /^\[([^\]]+)\]\s*/.exec(name);
  return match ? match[1].trim() : null;
}

/** The stop's place: the API city, or (when the feed left it empty) a short "Plaats, " name prefix. */
function cityOf(stop: StopSummary): string {
  if (stop.city) return stop.city;
  // V5.9.1: a bracketed node takes its place from the station it belongs to; its own name after
  // the brackets ("Halte C, Willem Frogerplein") is not a "Plaats, straat" name.
  const parent = bracketParent(stop.name);
  const parts = (parent ?? stop.name).split(", ");
  return parts.length === 2 && parts[0].length <= 30 ? parts[0] : "";
}

function presentableName(stop: StopSummary): string {
  let name = (bracketParent(stop.name) ?? stop.name).trim();
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

/** A backend entry with its real platforms ("quays") stands for all of them, each with its own ID. */
function expandVariants(stops: readonly StopSummary[]): StopSummary[] {
  const out: StopSummary[] = [];
  for (const stop of stops) {
    const members = stop.variants?.length
      ? stop.variants.map((variant) => ({
        ...variant,
        walkMinutes: variant.walkMinutes ?? stop.walkMinutes,
        distanceMeters: variant.distanceMeters ?? stop.distanceMeters
      }))
      : [stop];
    for (const member of members) if (!out.some((known) => known.id === member.id)) out.push(member);
  }
  return out;
}

export function groupNearbyStops(stops: readonly StopSummary[]): NearbyStopGroup[] {
  const groups: NearbyStopGroup[] = [];
  for (const stop of expandVariants(stops)) {
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

function nearestFirst(stops: readonly StopSummary[]): StopSummary[] {
  const rank = (stop: StopSummary) => stop.distanceMeters ?? (stop.walkMinutes !== undefined ? stop.walkMinutes * 80 : Number.POSITIVE_INFINITY);
  return stops.map((stop, index) => ({ stop, index })).sort((a, b) => rank(a.stop) - rank(b.stop) || a.index - b.index).map((row) => row.stop);
}

/** The kinds of transport a stop itself serves: the API list, else the mode of its lines. */
function stopModes(stop: StopSummary): Mode[] {
  if (stop.modes?.length) return stop.modes;
  return stop.lines.length ? [stop.mode] : [];
}

/**
 * V5.9.1: rows per mode for one stop area. Lines come from every platform in the group plus,
 * optionally, `areaLines` (lines seen on the stop area's own board, keyed by stop ID). Each line
 * shows once per mode; a line from the API is never dropped because it has no departure now.
 */
export function nearbyGroupRows(group: NearbyStopGroup, areaLines: Readonly<Record<string, readonly LineInfo[]>> = {}): NearbyModeRow[] {
  const byMode = new Map<Mode, { stops: StopSummary[]; lines: LineInfo[][] }>();
  const slot = (mode: Mode) => {
    let entry = byMode.get(mode);
    if (!entry) { entry = { stops: [], lines: [] }; byMode.set(mode, entry); }
    return entry;
  };
  for (const stop of group.stops) {
    const modes = stopModes(stop);
    for (const mode of modes) if (!slot(mode).stops.includes(stop)) slot(mode).stops.push(stop);
    const fallback = modes.length === 1 ? modes[0] : stop.mode;
    for (const line of stop.lines) slot(line.mode ?? fallback).lines.push([{ ...line, mode: line.mode ?? fallback }]);
  }
  for (const stop of group.stops) {
    for (const line of areaLines[stop.id] || []) {
      const mode = line.mode ?? stop.mode;
      slot(mode).lines.push([{ ...line, mode }]);
    }
  }
  const nearest = nearestFirst(group.stops);
  const fallbackStop = nearest.find((stop) => stop.lines.length > 0) ?? nearest[0];
  const rows: NearbyModeRow[] = MODE_ORDER.filter((mode) => byMode.has(mode)).map((mode) => {
    const entry = byMode.get(mode)!;
    const stops = nearestFirst(entry.stops);
    const walks = stops.map((stop) => stop.walkMinutes).filter((value): value is number => value !== undefined);
    return {
      key: group.key + ":" + mode,
      mode,
      label: modeLabel(mode),
      lines: sortLines(mergeLines(...entry.lines)).map((line) => ({ ...line, mode })),
      stops,
      openStop: stops[0] ?? fallbackStop,
      walkMinutes: walks.length ? Math.min(...walks) : group.walkMinutes
    };
  });
  if (rows.length || !fallbackStop) return rows;
  // Only station nodes without lines: still one tappable row, never an invented line.
  return [{ key: group.key + ":halte", mode: fallbackStop.mode, label: "Halte", lines: [], stops: [fallbackStop], openStop: fallbackStop, walkMinutes: group.walkMinutes }];
}

export function nearbyModeLabel(stop: StopSummary): string {
  return modeLabel(stop.mode);
}

/**
 * V5.9.1: which stops to ask for their stop area's board. One per station name inside a group
 * ("[Amsterdam Lelylaan] …" nodes count as "Amsterdam Lelylaan"), the nearest one with lines:
 * the board answers for the whole area, so asking every platform again would only cost requests.
 */
export function areaLineSources(groups: readonly NearbyStopGroup[]): StopSummary[] {
  const sources: StopSummary[] = [];
  for (const group of groups) {
    const byName = new Map<string, StopSummary[]>();
    for (const stop of group.stops) {
      const base = normalized(bracketParent(stop.name) ?? stop.name);
      byName.set(base, [...(byName.get(base) || []), stop]);
    }
    for (const stops of byName.values()) {
      const nearest = nearestFirst(stops);
      const pick = nearest.find((stop) => stop.lines.length > 0) ?? nearest[0];
      if (pick && !sources.some((known) => known.id === pick.id)) sources.push(pick);
    }
  }
  return sources;
}
