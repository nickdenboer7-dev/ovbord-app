import type { JourneyStop } from "../types/api";
import { shiftClock } from "./format";
import { clockRemainingMs } from "./alighting";

export type TimelineLocation = {kind:"at"|"between";index:number};
const isClock=(s:string|undefined):s is string=>Boolean(s&&/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(s));
/** Actual observations are used for history only; expected times lead the remaining route. */
export function journeyStopClock(stop:JourneyStop,passed=false):string {
  if(passed&&stop.actualKnown&&isClock(stop.actualTime))return stop.actualTime;
  if(isClock(stop.expectedTime))return stop.expectedTime;
  if(isClock(stop.plannedTime))return typeof stop.delayMinutes==="number"&&Number.isFinite(stop.delayMinutes)
    ? shiftClock(stop.plannedTime,stop.delayMinutes):stop.plannedTime;
  return isClock(stop.expectedDepartureTime)?stop.expectedDepartureTime:"—";
}
/** Latest expected arrival, including the current stop until the next expected arrival.
 * Display only: never use this estimate to confirm a departure, GPS or an alighting alert. */
export function expectedTimelineLocation(stops:readonly JourneyStop[],nowMs:number):TimelineLocation|null {
  let index=-1;
  stops.forEach((stop,i)=>{const remaining=clockRemainingMs(journeyStopClock(stop),nowMs);if(remaining!==null&&remaining<=0)index=i;});
  return index<0?null:{kind:"at",index};
}
export function timelineDisplayProgress(stops:readonly JourneyStop[],verified:TimelineLocation|null|undefined,nowMs:number,
  options:{lastKnown?:boolean;ended?:boolean;cancelled?:boolean}={}) {
  const confirmed=Boolean(verified&&!options.lastKnown&&Number.isInteger(verified.index)&&verified.index>=0&&verified.index<stops.length);
  const location=options.ended||options.cancelled?null:confirmed?verified!:expectedTimelineLocation(stops,nowMs);
  return {location,estimated:!confirmed,passed:(index:number)=>Boolean(!options.cancelled&&(options.ended||location&&
    (location.kind==="at"?index<location.index:index<=location.index)))};
}
