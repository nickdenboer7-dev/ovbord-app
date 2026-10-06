export type Mode = "bus" | "tram" | "metro" | "train" | "ferry";
export type Reliability = "high" | "medium" | "low" | "planned";
export type Trend = "up" | "down" | "flat";
export type JourneyStopState = "passed" | "current" | "upcoming" | "end";

export interface LineInfo {
  line: string;
  carrier?: string;
}

export interface StopSummary {
  id: string;
  name: string;
  city: string;
  mode: Mode;
  walkMinutes?: number;
  distanceMeters?: number;
  lat?: number;
  lon?: number;
  lines: LineInfo[];
}

export interface DepartureItem {
  id: string;
  ritId?: string;
  line: string;
  carrier?: string;
  destination: string;
  plannedTime: string;
  relativeText: string;
  delayMinutes?: number;
  reliability: Reliability;
  trend: Trend;
  platform?: string;
  alert?: string;
  mode?: Mode;
  isLive?: boolean;
}

export interface HalteBoardData {
  stop: StopSummary;
  departures: DepartureItem[];
  arrivals: DepartureItem[];
  disruptions: string[];
}

export interface JourneyStop {
  id: string;
  name: string;
  plannedTime: string;
  actualTime?: string;
  delayMinutes?: number;
  state: JourneyStopState;
  platform?: string;
  platformChanged?: boolean;
  lat?: number;
  lon?: number;
}

export interface RitData {
  id: string;
  line: string;
  destination: string;
  carrier?: string;
  mode: Mode;
  live?: boolean;
  vehicle?: { lat: number; lon: number };
  polyline: { latitude: number; longitude: number }[];
  stops: JourneyStop[];
  liveLabel?: string;
  delayLabel?: string;
}
