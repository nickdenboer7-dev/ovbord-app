import type { DepartureItem, HalteBoardData, Mode, StopSummary } from "../types/api";
import { MODE_ORDER, mergeLines } from "./lineSet";
import { departureTimeRemainingMs } from "./boardSmartness";
import { departurePresentation } from "./departurePresentation";
import palette from "../constants/ovspotMapPalette.json";
import type { DepartureTimeMode } from "./userSettings";

export const STOP_BOARD_BLUE = "#185c98";
export const BOARD_MODE_LABEL: Record<Mode,string> = {train:"Trein",metro:"Metro",tram:"Tram",bus:"Bus",ferry:"Veerboot"};
const carrierKey=(s:string|undefined)=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]/g,"");
const hex=(s:unknown)=>typeof s==="string"&&/^#?[a-f0-9]{6}$/i.test(s.trim())?"#"+s.trim().replace(/^#/,""):undefined;
const fallback:Record<Mode,string>={train:"#1877f2",metro:"#d22545",tram:"#d22545",ferry:"#0b878a",bus:"#16865f"};
const lineMeta=palette.lines as Record<string,(string|null)[]>;
const routeMeta=palette.routes as Record<string,(string|null)[]>;
/** Shared badge palette; same OVspot precedence: feed, exact route, line metadata, carrier. */
export function stopBoardLineBadge(item:Pick<DepartureItem,"line"|"carrier"|"mode"|"routeId"|"routeColor"|"routeTextColor">) {
  const mode=item.mode||"bus",line=item.line.trim().toUpperCase(),route=routeMeta[item.routeId||""];
  const exact=route&&String(route[1]).trim().toUpperCase()===line&&route[2]===mode?route:undefined;
  const meta=lineMeta[carrierKey(item.carrier)+"|"+line+"|"+mode];
  const carrier=palette.carriers.find(p=>p.aliases.some(alias=>carrierKey(alias)===carrierKey(item.carrier)));
  const bg=hex(item.routeColor)||hex(exact?.[3])||hex(meta?.[0])||carrier?.color||fallback[mode];
  const text=hex(item.routeTextColor)||hex(exact?.[4])||hex(meta?.[1])||carrier?.text||"#ffffff";
  return {bg,text};
}
export const stopBoardBadge=(item:DepartureItem)=>stopBoardLineBadge(item);
export function stopBoardHeader(stop:StopSummary,board?:HalteBoardData|null) {
  const comma=stop.name.indexOf(","),city=stop.city?.trim()||(comma>0?stop.name.slice(0,comma).trim():"");
  const prefix=comma>0?stop.name.slice(0,comma).trim():"";
  const title=prefix&&carrierKey(prefix)===carrierKey(city)?stop.name.slice(comma+1).trim():stop.name;
  const lines=mergeLines(stop.lines,board?.stop.lines,...(stop.variants||[]).map(s=>s.lines),board?.departures.map(d=>({line:d.line,carrier:d.carrier,mode:d.mode})));
  const count=Math.max(stop.lineCount||0,board?.stop.lineCount||0,lines.length);
  return {title:title||stop.name,city,count};
}
export function stopBoardModes(stop:StopSummary,board?:HalteBoardData|null):Mode[] {
  const known=[...(stop.modes||[]),...(board?.stop.modes||[]),...(stop.lines||[]).map(l=>l.mode),
    ...(stop.variants||[]).flatMap(s=>s.modes?.length?s.modes:[s.mode]),...(board?.departures||[]).map(d=>d.mode)];
  const available=new Set(known.filter(Boolean));
  if(!available.size)available.add(stop.mode);
  return MODE_ORDER.filter(m=>available.has(m));
}
/** One expected instant drives both the minute display and the service clock. */
export function stopBoardTiming(item:DepartureItem,now:number,stale=false,display:DepartureTimeMode="both") {
  const {clock}=departurePresentation(item,now),remaining=departureTimeRemainingMs(item,now);
  const minutes=remaining===null?null:Math.ceil(remaining/60000);
  const showMinutes=!stale&&!item.liveDataStale&&!item.cancelled&&!item.departed&&minutes!==null&&minutes>=0
    &&(display==="minutes"||minutes<=30);
  const showCountdown = showMinutes && display !== "clock";
  return {primary:showCountdown?minutes+" min":clock,secondary:showCountdown&&display==="both"?clock:"",clock};
}
