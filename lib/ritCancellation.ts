export type TripCancellation = { cancelled: boolean; source: "rit" | "haltebord" | null };

/**
 * /api/rit and /api/halte can disagree about a cancelled trip (seen for GTFS trip
 * 391344404: halte cancelled=true, rit cancelled=false). Show the cancellation when
 * either source reports it, and say which one did, so the trip page never presents
 * a trip as running while the stop board already shows "Rijdt niet".
 */
export function tripCancellation(apiCancelled: boolean | undefined, boardCancelled: boolean): TripCancellation {
  if (apiCancelled === true) return { cancelled: true, source: "rit" };
  if (boardCancelled) return { cancelled: true, source: "haltebord" };
  return { cancelled: false, source: null };
}
