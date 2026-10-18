import { Mode, Reliability } from "../types/api";

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
  if (typeof value === "string") {
    const hhmm = value.match(/^(\d{1,2}):(\d{2})$/);
    if (hhmm) {
      const parts = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Amsterdam"
      }).formatToParts(new Date());
      const nowTotal = Number(parts.find((part) => part.type === "hour")?.value || 0) * 60
        + Number(parts.find((part) => part.type === "minute")?.value || 0);
      const targetTotal = Number(hhmm[1]) * 60 + Number(hhmm[2]);
      let diff = targetTotal - nowTotal;
      // A departure from a few minutes ago is NOT tomorrow.
      // Without a service date, roll over only at a likely midnight boundary.
      if (diff < -720) diff += 24 * 60;
      return diff;
    }
  }

  const date = parseDateLoose(value);
  if (!date) return 0;
  // Full timestamps include the service date: never roll expired dates into tomorrow.
  return Math.round((date.getTime() - Date.now()) / 60000);
}

export function relativeMinutesText(value?: string | number | null) {
  const minutes = minutesUntil(value);
  if (minutes === 0) return "nu";
  if (minutes >= 1 && minutes <= 60) return `over ${minutes} min`;
  return "";
}

export function inferReliability(source?: string): Reliability {
  const input = (source || "").toLowerCase();
  if (input.includes("gps") || input.includes("live")) return "high";
  if (input.includes("geschat") || input.includes("estimated")) return "medium";
  return "low";
}


/** Shared Dutch service clock for the Vertrekken and Lijnen tabs. */
export function formatDutchClock(value?: string | number | null): string {
  if (typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value)) return value.padStart(5, "0");
  const date = parseDateLoose(value);
  if (!date) return "--:--";
  return new Intl.DateTimeFormat("nl-NL", { hour:"2-digit", minute:"2-digit",
    hour12:false, timeZone:"Europe/Amsterdam" }).format(date);
}
export function shiftClock(value: string, difference: number): string {
  const m=/^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m || !Number.isFinite(difference)) return value;
  const n=((Number(m[1])*60+Number(m[2])+Math.round(difference))%1440+1440)%1440;
  return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
}
export function effectiveDepartureClock(row: {plannedTime:string; expectedTime?:string; delayMinutes?:number; effectiveAt?:string}): string {
  // V5.8: prefer the same absolute instant the countdown (departureCountdown) and the sort
  // (departureTimeRemainingMs) already use, so the clock and the countdown never disagree.
  if(row.effectiveAt){
    const at=Date.parse(row.effectiveAt);
    if(Number.isFinite(at))return formatDutchClock(at);
  }
  if(row.expectedTime && row.expectedTime!=="--:--")return row.expectedTime;
  return typeof row.delayMinutes==="number" && row.delayMinutes!==0
    ?shiftClock(row.plannedTime,row.delayMinutes):row.plannedTime;
}
export function departureCountdown(row: {plannedTime:string;expectedTime?:string;effectiveAt?:string;delayMinutes?:number},nowMs=Date.now()):string {
  let mins:number|undefined;
  if(row.effectiveAt){const t=Date.parse(row.effectiveAt);if(Number.isFinite(t))mins=Math.ceil((t-nowMs)/60000);}
  if(mins===undefined){
    const m=/^(\d{1,2}):(\d{2})$/.exec(effectiveDepartureClock(row));
    if(!m)return "tijd onbekend";
    const parts=new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"Europe/Amsterdam"}).formatToParts(new Date(nowMs));
    const h=Number(parts.find(p=>p.type==="hour")?.value||0);
    const min=Number(parts.find(p=>p.type==="minute")?.value||0);
    mins=Number(m[1])*60+Number(m[2])-h*60-min;
    // Recent past departures must not become fake "over 1437 min" predictions.
    if(mins < -720) mins+=1440;
  }
  if (mins > 60 || mins < -1) return "";
  return mins <= 0 ? "nu" : "over " + mins + " min";
}
export function isNextServiceDay(a:{plannedTime:string;expectedTime?:string;effectiveAt?:string},b:{plannedTime:string;expectedTime?:string;effectiveAt?:string}):boolean {
  if(a.effectiveAt&&b.effectiveAt){
    const da=Date.parse(a.effectiveAt),db=Date.parse(b.effectiveAt);
    if(Number.isFinite(da)&&Number.isFinite(db)){
      const date=(x:string)=>new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:"Europe/Amsterdam"}).format(new Date(x));
      return db>da&&date(a.effectiveAt)!==date(b.effectiveAt);
    }
  }
  const minutes=(x:string)=>{const m=/^(\d{1,2}):(\d{2})$/.exec(x);return m?Number(m[1])*60+Number(m[2]):-1;};
  const x=minutes(effectiveDepartureClock(a)),y=minutes(effectiveDepartureClock(b));
  return x>1080&&y>=0&&y<360;
}
