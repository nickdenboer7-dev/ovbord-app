import type { DisruptionNotice, JourneyStop } from "../types/api";
import type { JourneyLocation } from "./ritConsistency";
import { isActiveStopNotice } from "./haltebordV4";

/** Keep a notice while at least one affected stop is still ahead; retain repeated stops on loop trips. */
export function upcomingJourneyNotices(notices: readonly DisruptionNotice[], stops: readonly JourneyStop[],
  progress: JourneyLocation, nowMs: number, ended = false): DisruptionNotice[] {
  if (ended) return [];
  const upcoming = new Set(stops.filter((stop, index) => progress
    ? progress.kind === "at" ? index >= progress.index : index > progress.index
    : stop.state !== "passed").map(stop => String(stop.id)));
  return notices.flatMap(notice => {
    const stopIds = (notice.stopIds || []).filter(id => upcoming.has(id) && isActiveStopNotice(notice, id, nowMs));
    return stopIds.length ? [{ ...notice, stopIds }] : [];
  });
}
