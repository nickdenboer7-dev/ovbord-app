/** Distances below a kilometre stay in metres, matching the web stop list. */
export function nearbyDistance(meters: number | undefined, walkMinutes?: number): string {
  if (typeof meters === "number" && Number.isFinite(meters) && meters >= 0) {
    return meters < 1000 ? Math.round(meters) + " m"
      : (meters / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " km";
  }
  return walkMinutes !== undefined ? walkMinutes + " min lopen" : "Afstand onbekend";
}

export function nearbyCountText(count: number): string {
  return count + " " + (count === 1 ? "halte" : "haltes") + " in deze omgeving";
}
