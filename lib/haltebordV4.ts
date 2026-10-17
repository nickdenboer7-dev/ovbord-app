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

const ENGLISH_WORDS = /\b(the|runs|run|served|diverted|from|due|will|cancelled|delayed|instead|between|only|does|not)\b/i;
const DUTCH_WORDS = /\b(de|het|een|rijdt|rijden|halte|haltes|vanaf|niet|wegens|omleiding|stopt|vervalt|tussen|naar)\b/i;

/**
 * Some carriers (GVB) put "Dutch -- English" in one string. Keep the Dutch part,
 * but only when the second half really reads as English.
 */
export function dutchNoticeText(text: string): string {
  const parts = text.split(/\s+--\s+/);
  if (parts.length < 2) return text;
  const first = parts[0].trim(), rest = parts.slice(1).join(" -- ");
  return DUTCH_WORDS.test(first) && ENGLISH_WORDS.test(rest) && !DUTCH_WORDS.test(rest) ? first : text;
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
    notices.push({
      title: shownTitle,
      description: shownDescription,
      severity: /^(severe|critical|error|major|warning|alert|high)$/i.test(severity) ? "warning" : "info",
      ...(badge && !/^unknown/i.test(badge) ? { badge } : {}),
      ...(stopIds.length ? { stopIds } : {})
    });
  }
  return notices;
}

/** One compact line for several notices: "Lijn N85 · 3 meldingen" and "2× Omleiding · Halte vervalt". */
export function disruptionSummary(line: string, notices: readonly DisruptionNotice[]): { title: string; detail: string } {
  const count = notices.length;
  const prefix = line && line !== "?" ? "Lijn " + line + " · " : "";
  const title = prefix + count + (count === 1 ? " melding" : " meldingen");
  const badges = new Map<string, number>();
  for (const notice of notices) if (notice.badge) badges.set(notice.badge, (badges.get(notice.badge) || 0) + 1);
  const detail = badges.size
    ? [...badges.entries()].map(([badge, n]) => (n > 1 ? n + "× " : "") + badge).join(" · ")
    : notices[0]?.title || "";
  return { title, detail };
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
  const ageSeconds = Math.ceil(Math.max(elapsed, Number.isFinite(serverAge) ? serverAge : 0,
    Number.isFinite(sourceAge) ? sourceAge : 0));
  const level = board.stale === true || ageSeconds > 300 ? "stale" :
    ageSeconds > 90 ? "aging" : "fresh";
  const human = ageSeconds < 60 ? ageSeconds + " sec" :
    ageSeconds < 3600 ? Math.ceil(ageSeconds / 60) + " min" :
    Math.floor(ageSeconds / 3600) + " uur";
  return {
    level, ageSeconds, ageLabel: human + " oud",
    label: level === "stale" ? "Verouderde vertrekgegevens · " + human :
      level === "aging" ? "Gegevens " + human + " oud" :
      "Vertrekgegevens · " + human + " oud"
  };
}
