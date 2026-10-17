/** Index of the route point nearest to a position (screen or map units); -1 when there is none. */
export function nearestPointIndex(points: readonly { lat: number; lon: number }[], target: { lat: number; lon: number } | undefined | null): number {
  if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lon)) return -1;
  let best = -1, bestDistance = Infinity;
  const cos = Math.cos(target.lat * Math.PI / 180);
  points.forEach((point, index) => {
    const dLat = point.lat - target.lat, dLon = (point.lon - target.lon) * cos;
    const distance = dLat * dLat + dLon * dLon;
    if (distance < bestDistance) { bestDistance = distance; best = index; }
  });
  return best;
}

/**
 * Part of the route the user still rides: from the vehicle (or the boarding stop)
 * to the alighting stop. Null when either end is unknown or they are in the wrong order.
 */
export function rideSegmentRange(points: readonly { lat: number; lon: number }[],
  from: { lat: number; lon: number } | undefined | null, to: { lat: number; lon: number } | undefined | null): { start: number; end: number } | null {
  const start = nearestPointIndex(points, from), end = nearestPointIndex(points, to);
  if (start < 0 || end < 0 || end <= start) return null;
  return { start, end };
}
