/**
 * Identity of what the map should frame. The map re-frames only when this key
 * changes (new set of stops, other city, other route), so periodic refreshes of
 * the same stops keep the user's own panning and zoom. An empty key means there
 * is nothing to frame yet (e.g. stops still loading): the map then stays put.
 */
export function mapFitKey(
  markers: readonly { id: string; lat: number; lon: number }[],
  center?: { lat: number; lon: number },
  polylineLength = 0
): string {
  const ids = markers
    .filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lon))
    .map((m) => m.id)
    .sort()
    .join("|");
  const c = center && Number.isFinite(center.lat) && Number.isFinite(center.lon)
    ? center.lat.toFixed(3) + "," + center.lon.toFixed(3) : "";
  if (!ids && !c && !polylineLength) return "";
  return ids + "#" + c + "#" + polylineLength;
}
