export type Mode = "bus" | "tram" | "metro" | "train" | "ferry";
export type Reliability = "high" | "medium" | "low" | "planned";
export type Trend = "up" | "down" | "flat";
export interface ReliabilityInfo {
  level: "very" | "good" | "reasonable" | "low";
  label: string;
  ageSeconds: number | null;
  estimatedPosition: boolean;
  explanation: string;
  source?: string;
  receivedAt?: number;
}
export type JourneyStopState = "passed" | "current" | "upcoming" | "end";

export interface LineInfo {
  line: string;
  carrier?: string;
  /** V5.9.1: the kind of transport of this line at this stop, when the API says so. */
  mode?: Mode;
}

export interface StopSummary {
  id: string;
  name: string;
  city: string;
  mode: Mode;
  /** V5.9.1: every kind of transport the API lists for this stop (/api/nearby "modes"). */
  modes?: Mode[];
  walkMinutes?: number;
  distanceMeters?: number;
  lat?: number;
  lon?: number;
  lines: LineInfo[];
  /** V5.9.1: the backend says these lines are complete for the whole stop area (no enrichment needed). */
  linesComplete?: boolean;
  /** V5.9.1: the real platform/stop IDs behind this entry, when the backend sends them ("quays"). */
  variants?: StopSummary[];
}

export interface DepartureItem {
  id: string;
  ritId?: string;
  line: string;
  carrier?: string;
  destination: string;
  plannedTime: string;
  /** Feed-provided effective departure time, if any; never synthesized from the delay. */
  expectedTime?: string;
  effectiveAt?: string;
  relativeText: string;
  delayMinutes?: number;
  reliability: Reliability;
  /** Actual change from multiple observed live measurements; absent means unknown. */
  trend?: Trend;
  trendDeltaMinutes?: number;
  trendWindowSeconds?: number;
  trendSamples?: number;
  /** GPS/source-based reliability; no inferred high rating from low delay. */
  reliabilityDetail?: ReliabilityInfo;
  platform?: string;
  platformChanged?: boolean;
  platformPrevious?: string;
  alert?: string;
  /** A live timing feed was received but is no longer fresh; do not call it planned-only. */
  liveDataStale?: boolean;
  /** Explicit cancellation from the feed; do not infer from missing GPS. */
  cancelled?: boolean;
  /** Explicit departure acknowledgement, or confirmation from live journey monitoring. */
  departed?: boolean;
  mode?: Mode;
  isLive?: boolean;
}

export interface DisruptionNotice {
  title: string;
  description: string;
  severity: "warning" | "info";
  /** Short category from the feed, e.g. "Omleiding" or "Halte vervalt"; absent when not supplied. */
  badge?: string;
  /** Stops the notice is attached to (for "Halte vervalt": the stops that are skipped). */
  stopIds?: string[];
}

export interface HalteBoardData {
  stop: StopSummary;
  departures: DepartureItem[];
  arrivals: DepartureItem[];
  disruptions: DisruptionNotice[];
  /** False when the server did not supply a disruptions field at all. */
  disruptionsAvailable?: boolean;
  /** Time when server assembled the snapshot. */
  generatedAt?: string;
  /** Age of the underlying feed at snapshot time, NOT the HTTP request age. */
  feedAgeSeconds?: number;
  stale?: boolean;
}

export interface JourneyStop {
  id: string;
  name: string;
  plannedTime: string;
  actualTime?: string;
  /** True only when the feed supplies a distinct, verified passing time. */
  actualKnown?: boolean;
  expectedTime?: string;
  plannedDepartureTime?: string;
  expectedDepartureTime?: string;
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
  /** Vehicle (wagon) number, when the feed has one; shown next to the position. */
  vehicleNumber?: string;
  /** GPS age from the /api/rit response, in seconds; undefined is NOT live. */
  gpsAgeSeconds?: number;
  /** Current journey-wide delay in seconds; undefined is unknown (not zero). */
  delaySeconds?: number;
  /** Unmodified road shape for trustworthy GPS-to-route matching. */
  shape?: Array<[number, number] | { lat: number; lon: number } | { latitude: number; longitude: number }>;
  /** Explicitly estimated coordinates must never be presented as live GPS. */
  estimatedPosition?: boolean;
  polyline: { latitude: number; longitude: number }[];
  stops: JourneyStop[];
  liveLabel?: string;
  delayLabel?: string;
  /** Explicit cancellation of the whole trip from /api/rit; never inferred from missing GPS. */
  cancelled?: boolean;
  /** Notices that apply to this trip, from /api/rit. */
  disruptions?: DisruptionNotice[];
}
