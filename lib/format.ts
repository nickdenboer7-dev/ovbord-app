import { Mode, Reliability, Trend } from "../types/api";

export function normalizeMode(value?: string): Mode {
  const input = (value || "").toLowerCase();
  if (input.includes("tram")) return "tram";
  if (input.includes("metro")) return "metro";
  if (input.includes("train") || input.includes("trein") || input.includes("rail")) return "train";
  if (input.includes("veer") || input.includes("ferry")) return "ferry";
  return "bus";
}

export function parseDateLoose(value?: string | number | null) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const hhmm = value.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const date = new Date();
    date.setHours(Number(hhmm[1]), Number(hhmm[2]), 0, 0);
    return date;
  }
  return undefined;
}

export function formatClock(value?: string | number | null) {
  if (typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value)) return value;
  const date = parseDateLoose(value);
  if (!date) return "--:--";
  return date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
}

export function minutesUntil(value?: string | number | null) {
  const date = parseDateLoose(value);
  if (!date) return 0;
  return Math.round((date.getTime() - Date.now()) / 60000);
}

export function relativeMinutesText(value?: string | number | null) {
  const minutes = minutesUntil(value);
  if (minutes <= 0) return "nu";
  if (minutes === 1) return "over 1 min";
  return `over ${minutes} min`;
}

export function inferTrend(delayMinutes?: number): Trend {
  if (!delayMinutes || delayMinutes === 0) return "flat";
  if (delayMinutes > 3) return "up";
  if (delayMinutes < 0) return "down";
  return "flat";
}

export function inferReliability(source?: string): Reliability {
  const input = (source || "").toLowerCase();
  if (input.includes("gps") || input.includes("live")) return "high";
  if (input.includes("geschat") || input.includes("estimated")) return "medium";
  return "low";
}
