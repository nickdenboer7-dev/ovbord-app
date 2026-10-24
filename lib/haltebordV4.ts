import type { DepartureItem, HalteBoardData, DisruptionNotice } from "../types/api";
import { boardDepartureIdentity } from "./boardSmartness";

export const PLATFORM_NOTICE_MS = 10 * 60 * 1000;
export type PlatformChange = { previous?: string; current: string; changedAt: number };
export type PlatformChanges = Record<string, PlatformChange>;

const clean = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

function isPlatform(value: string | undefined): value is string {
  return Boolean(value && value.trim() && value !== "-");
}

/** Never infer an original platform when it is not supplied or observed. */
export function refreshPlatformChanges(
  previous: readonly DepartureItem[] | null,
  current: readonly DepartureItem[],
  old: PlatformChanges,
  nowMs: number
): PlatformChanges {
  const before = new Map((previous || []).map(d => [boardDepartureIdentity(d), d]));
  const next: PlatformChanges = {};
  for (const row of current) {
    const key = boardDepartureIdentity(row);
    const oldRow = before.get(key);
    const currentPlatform = clean(row.platform);
    const previousPlatform = clean(oldRow?.platform);
    const explicitPrevious = clean(row.platformPrevious);
    const suppliedChange = row.platformChanged === true;
    const newObservedChange = Boolean(
      oldRow && isPlatform(previousPlatform) &&
      isPlatform(currentPlatform) && previousPlatform !== currentPlatform
    );
    if (isPlatform(currentPlatform) && (newObservedChange || suppliedChange)) {
      const from = newObservedChange ? previousPlatform : explicitPrevious;
      const prior = old[key];
      if (!prior || prior.current !== currentPlatform || (from && from !== prior.previous)) {
        next[key] = {
          previous: isPlatform(from) && from !== currentPlatform ? from : undefined,
          current: currentPlatform,
          changedAt: nowMs
        };
        continue;
      }
    }
    if (old[key] && nowMs >= old[key].changedAt &&
      nowMs - old[key].changedAt < PLATFORM_NOTICE_MS) next[key] = old[key];
  }
  return next;
}

export function platformChangeFor(
  row: DepartureItem, changes: PlatformChanges, nowMs: number
): PlatformChange | null {
  const change = changes[boardDepartureIdentity(row)];
  return change && nowMs >= change.changedAt &&
    nowMs - change.changedAt < PLATFORM_NOTICE_MS ? change : null;
}

/** Carriers put Dutch -- English in one field. The delimiter ends the Dutch text. */
export function dutchNoticeText(text: string): string {
  return text.split(" -- ", 1)[0].trim();
}

function noticePriority(notice: DisruptionNotice): number {
  const text = [notice.title, notice.description, notice.badge].join(" ").toLocaleLowerCase("nl");
  if (/halte vervalt|haltewijziging|tijdelijke halte|halte verplaatst|stopt hier niet|stoppen hier niet|andere kant|niet instappen/.test(text)) return 0;
  if (/omleiding|omgeleid|rijdt om|rijden om|ingekort|rijdt t\/m|rijdt tot|stremming/.test(text)) return 1;
  return /vertraging/.test(text) ? 3 : 2;
}

/** "… Details: gvb.nl" at the end of a notice becomes a separate "Meer informatie" line. */
function splitDetails(text: string): { text: string; details: string } {
  const match = /^(.*?)[\s.]*\b(?:details|meer info(?:rmatie)?)\s*:\s*(\S+?)\.?$/i.exec(text);
  return match && match[1].trim() ? { text: match[1].trim().replace(/([^.!?])$/, "$1."), details: match[2] } : { text, details: "" };
}

export function parseDisruptions(source: unknown): DisruptionNotice[] {
  if (!Array.isArray(source)) return [];
  const seen = new Set<string>();
  const notices: DisruptionNotice[] = [];
  for (const item of source) {
    const effect = clean(typeof item === "object" && item ? item.effect : "").toUpperCase();
    const cancellationTitle = dutchNoticeText(clean(typeof item === "object" && item ? item.title ?? item.header ?? item.name : item));
    if (effect === "CANCELLED" || /\b(?:rit(?:ten)? (?:is |zijn )?vervallen|vervallen rit(?:ten)?)\b/i.test(cancellationTitle)) continue;
    const rawTitle = dutchNoticeText(clean(typeof item === "object" && item ? item.title ?? item.header ?? item.name : item));
    const rawDescription = dutchNoticeText(clean(typeof item === "object" && item ? item.message ?? item.description ?? item.text : ""));
    const title = splitDetails(rawTitle), description = splitDetails(rawDescription);
    // Feeds often repeat the title as description: show it once.
    const body = description.text && description.text !== title.text ? description.text : "";
    const details = title.details || description.details;
    const shownTitle = title.text || body;
    const shownDescription = [title.text ? body : "", details ? "Meer informatie: " + details : ""].filter(Boolean).join(" ");
    const text = [shownTitle, shownDescription].filter(Boolean).join(" · ");
    if (!text || seen.has(text.toLocaleLowerCase("nl"))) continue;
    seen.add(text.toLocaleLowerCase("nl"));
    const severity = clean(typeof item === "object" && item ? item.severity ?? item.level : "").toLowerCase();
    const badge = clean(typeof item === "object" && item ? item.badge : "");
    const rawStops = typeof item === "object" && item ? item.stop_ids ?? item.stopIds : undefined;
    const stopIds = Array.isArray(rawStops)
      ? rawStops.filter((id: unknown) => typeof id === "string" || typeof id === "number").map((id: string | number) => String(id).trim()).filter(Boolean)
      : [];
    const rawPeriods = typeof item === "object" && item ? item.active_periods ?? item.activePeriods : undefined;
    const activePeriods: [number | null, number | null][] = Array.isArray(rawPeriods)
      ? rawPeriods.filter((p: unknown) => Array.isArray(p) && p.length === 2 && p.every(x => x === null || typeof x === "number" && Number.isFinite(x)))
        .map((p: [number | null, number | null]) => [p[0], p[1]]) : [];
    notices.push({
      title: shownTitle,
      description: shownDescription,
      severity: /^(severe|critical|error|major|warning|alert|high)$/i.test(severity) ? "warning" : "info",
      ...(badge && !/^unknown/i.test(badge) ? { badge } : {}),
      ...(stopIds.length ? { stopIds } : {}),
      ...(activePeriods.length ? { activePeriods } : {})
    });
  }
  return notices.sort((a, b) => noticePriority(a) - noticePriority(b));
}

/** Stop boards never inherit route-only or opposite-platform notices. */
export function isActiveStopNotice(notice: DisruptionNotice, stopId: string, nowMs: number): boolean {
  if (!notice.stopIds?.includes(stopId)) return false;
  return !notice.activePeriods?.length || notice.activePeriods.some(([start, end]) =>
    (!start || nowMs >= start * 1000) && (!end || nowMs < end * 1000));
}

export function parseStopDisruptions(source: unknown, stopId: string, nowMs = Date.now()): DisruptionNotice[] {
  if (!Array.isArray(source)) return [];
  const gtfs = source.filter(item => item && typeof item === "object" &&
    (item.source === "GTFS-RT" || Array.isArray(item.sources) && item.sources.includes("GTFS-RT")));
  return parseDisruptions(gtfs).filter(notice => isActiveStopNotice(notice, stopId, nowMs));
}

/** The most important notice remains visible, with the number of other notices. */
export function disruptionSummary(_line: string, notices: readonly DisruptionNotice[]): { title: string; detail: string } {
  if (!notices.length) return { title: "", detail: "" };
  const sorted = [...notices].sort((a, b) => noticePriority(a) - noticePriority(b));
  const others = sorted.length - 1;
  const text = dutchNoticeText(sorted[0].title);
  const first = others ? text.split(/(?<=[.!?])\s+/, 1)[0].replace(/[. ]+$/, "") : text;
  return { title: first + (others ? " · " + others + " andere melding" + (others > 1 ? "en" : "") : ""), detail: "" };
}

export type FeedFreshness = {
  level: "fresh" | "aging" | "stale" | "unknown";
  ageSeconds?: number;
  ageLabel?: string;
  label: string;
};

/** Server source-age and elapsed local time BOTH count. A successful fetch is not evidence
    that underlying realtime measurements are current. */
export function feedFreshness(board: Pick<HalteBoardData, "generatedAt" | "feedAgeSeconds" | "stale">,
  fetchedAt: number | null, nowMs: number): FeedFreshness {
  if (!fetchedAt || !Number.isFinite(fetchedAt)) return { level: "unknown", label: "Actualiteit onbekend" };
  const elapsed = Math.max(0, (nowMs - fetchedAt) / 1000);
  const generated = board.generatedAt ? Date.parse(board.generatedAt) : NaN;
  const serverAge = Number.isFinite(generated) ? Math.max(0, (nowMs - generated) / 1000) : NaN;
  const sourceAge = typeof board.feedAgeSeconds === "number" && Number.isFinite(board.feedAgeSeconds) &&
    board.feedAgeSeconds >= 0 ? board.feedAgeSeconds + elapsed : NaN;
  if (!Number.isFinite(serverAge) && !Number.isFinite(sourceAge))
    return { level: "unknown", label: "Actualiteit onbekend" };
  const ageSeconds = Math.max(elapsed, Number.isFinite(serverAge) ? serverAge : 0,
    Number.isFinite(sourceAge) ? sourceAge : 0);
  const level = board.stale === true || ageSeconds > 300 ? "stale" :
    ageSeconds > 90 ? "aging" : "fresh";
  const human = ageSeconds < 60 ? Math.floor(ageSeconds) + " sec" :
    ageSeconds < 3600 ? Math.floor(ageSeconds / 60) + " min" :
    Math.floor(ageSeconds / 3600) + " uur";
  return {
    level, ageSeconds, ageLabel: human + " oud",
    label: level === "stale" ? "Verouderde vertrekgegevens · " + human :
      level === "aging" ? "Gegevens " + human + " oud" :
      "Vertrekgegevens · " + human + " oud"
  };
}
