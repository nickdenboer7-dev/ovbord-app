import type { LineInfo, Mode } from "../types/api";
import { compactTrainLineLabel } from "./trainLineLabel";

/**
 * V5.9.1: one identity per line as the traveller sees it. The feed writes the same train service
 * as "SPR" and as "Sprinter" (and "IC"/"Intercity"); case and spaces never make a different line.
 */
export function lineIdentityKey(line: string, carrier?: string): string {
  return compactTrainLineLabel(String(line || "").trim(), carrier).toLocaleUpperCase("nl").replace(/\s+/g, "");
}

/**
 * OVinfo order: numbered lines first, lowest number first (36, 39, 391, 394), then lettered
 * lines alphabetically with their number (IC, N91, N93, SPR). Never depends on API order.
 */
export function compareLines(a: string, b: string): number {
  const parse = (value: string) => {
    const text = String(value || "").trim().toLocaleUpperCase("nl");
    const match = /^(\D*)(\d+)?(.*)$/.exec(text) || ["", text, undefined, ""];
    return { prefix: match[1] || "", number: match[2] === undefined ? Number.POSITIVE_INFINITY : Number(match[2]), rest: match[3] || "", text };
  };
  const x = parse(a), y = parse(b);
  if (!x.prefix !== !y.prefix) return x.prefix ? 1 : -1; // "36" before "N93"
  return x.prefix.localeCompare(y.prefix, "nl") || x.number - y.number || x.rest.localeCompare(y.rest, "nl") || x.text.localeCompare(y.text, "nl");
}

/**
 * Merge line lists without duplicates, keeping the first (most specific) entry of each line and
 * filling in a missing carrier or mode from a later one. A different kind of transport with the
 * same number (tram 1 / bus 1) stays a separate line.
 */
export function mergeLines(...lists: ReadonlyArray<readonly LineInfo[] | undefined>): LineInfo[] {
  const result: LineInfo[] = [];
  for (const list of lists) {
    for (const entry of list || []) {
      const line = String(entry?.line ?? "").trim();
      if (!line) continue;
      const key = lineIdentityKey(line, entry.carrier);
      // Same number shown twice is one line, unless both name a different kind of transport.
      const match = result.find((known) => lineIdentityKey(known.line, known.carrier) === key &&
        (!known.mode || !entry.mode || known.mode === entry.mode));
      if (match) {
        if (!match.carrier && entry.carrier) match.carrier = entry.carrier;
        if (!match.mode && entry.mode) match.mode = entry.mode;
        continue;
      }
      result.push({ line, ...(entry.carrier ? { carrier: entry.carrier } : {}), ...(entry.mode ? { mode: entry.mode } : {}) });
    }
  }
  return result;
}

export function sortLines(lines: readonly LineInfo[]): LineInfo[] {
  return [...lines].sort((a, b) => compareLines(compactTrainLineLabel(a.line, a.carrier), compactTrainLineLabel(b.line, b.carrier)));
}

/** Most telling kind of transport first: a station with trains is a station, not a bus stop. */
export const MODE_ORDER: readonly Mode[] = ["train", "metro", "tram", "bus", "ferry"];

export function primaryMode(modes: readonly Mode[]): Mode | undefined {
  return MODE_ORDER.find((mode) => modes.includes(mode));
}
