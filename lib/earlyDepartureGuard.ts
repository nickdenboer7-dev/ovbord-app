/** An early driver login/live GPS fix is not evidence that the vehicle has departed. */
export const EXTREME_EARLY_SECONDS = 10 * 60;

export function isUnconfirmedExtremeEarlyDeparture(item: {
  cancelled?: boolean;
  departed?: boolean;
  departure_confirmed?: boolean;
  actual_departure_confirmed?: boolean;
  planned_at?: string;
  effective_time?: string;
  feed_generated_at?: string;
  delay?: number;
  delay_seconds?: number;
  delay_minutes?: number;
}): boolean {
  if (item.cancelled === true || item.departed === true ||
      item.departure_confirmed === true || item.actual_departure_confirmed === true) return false;
  const planned = typeof item.planned_at === "string" ? Date.parse(item.planned_at) : NaN;
  const effective = typeof item.effective_time === "string" ? Date.parse(item.effective_time) : NaN;
  const byTimes = Number.isFinite(planned) && Number.isFinite(effective) &&
    planned - effective >= EXTREME_EARLY_SECONDS * 1000;
  // A continuously moving "expected" timestamp matching feed generation is a live login,
  // not a credible early departure. Keep the schedule until there is a departure event.
  const generated = typeof item.feed_generated_at === "string" ? Date.parse(item.feed_generated_at) : NaN;
  const tracksFeedNow = Number.isFinite(planned) && Number.isFinite(effective) &&
    Number.isFinite(generated) && planned - effective >= 90 * 1000 &&
    Math.abs(generated - effective) <= 120 * 1000;
  const delaySec = typeof item.delay_seconds === "number" ? item.delay_seconds :
    typeof item.delay === "number" ? item.delay :
    typeof item.delay_minutes === "number" ? item.delay_minutes * 60 : NaN;
  return byTimes || tracksFeedNow || (Number.isFinite(delaySec) && delaySec <= -EXTREME_EARLY_SECONDS);
}
