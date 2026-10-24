import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HalteBoardData } from "../types/api";
import { isStoredStop } from "./storedJson";

const KEY = "ovbord.boardSnapshots.v1";
export const BOARD_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;
const MAX_BOARDS = 48;
export type BoardSnapshot = { board: HalteBoardData; fetchedAt: number };
const snapshots = new Map<string, BoardSnapshot>();
let hydration: Promise<void> | undefined;
let writes = Promise.resolve();
let persistScheduled = false;
function valid(value: any, now: number): value is BoardSnapshot {
  return Boolean(value && Number.isFinite(value.fetchedAt) && value.fetchedAt <= now && now - value.fetchedAt < BOARD_CACHE_MAX_AGE_MS &&
    value.board && isStoredStop(value.board.stop) && Array.isArray(value.board.departures) && value.board.departures.every((d: any) =>
      d && typeof d.id === "string" && typeof d.line === "string" && typeof d.destination === "string" && typeof d.plannedTime === "string"));
}
export function hydrateBoardCache(): Promise<void> {
  if (!hydration) hydration = (async () => {
    const now = Date.now();
    for (const key of [KEY, "ovbord.favoriteBoards"]) {
      try {
        const raw = await AsyncStorage.getItem(key);
        const values = raw ? JSON.parse(raw) : {};
        for (const value of Object.values(values || {}).slice(0, MAX_BOARDS)) {
          if (!valid(value, now)) continue;
          const id = value.board.stop.id, stop=value.board.stop;
          const normalized={...value,board:{...value.board,stop:{...stop,city:stop.city||"",mode:stop.mode||"bus",lines:Array.isArray(stop.lines)?stop.lines:[]},arrivals:Array.isArray(value.board.arrivals)?value.board.arrivals:[],disruptions:Array.isArray(value.board.disruptions)?value.board.disruptions:[]}};
          if ((snapshots.get(id)?.fetchedAt || 0) < value.fetchedAt) snapshots.set(id, normalized);
        }
      } catch { /* One broken or unavailable storage key does not prevent the others loading. */ }
    }
  })();
  return hydration;
}
export function peekBoard(id: string, now = Date.now()): BoardSnapshot | undefined {
  const value = snapshots.get(id);
  return valid(value, now) ? value : undefined;
}
export async function cachedBoard(id: string): Promise<BoardSnapshot | undefined> {
  await hydrateBoardCache();
  return peekBoard(id);
}
export function rememberBoard(board: HalteBoardData, fetchedAt = Date.now()): void {
  const stop={...board.stop,variants:board.stop.variants||snapshots.get(board.stop.id)?.board.stop.variants};
  const value = { board: { ...board, stop, departures: board.departures.slice(0, 100), arrivals: board.arrivals.slice(0, 60) }, fetchedAt };
  if (!valid(value, fetchedAt)) return;
  snapshots.delete(board.stop.id); snapshots.set(board.stop.id, value);
  while (snapshots.size > MAX_BOARDS) snapshots.delete(snapshots.keys().next().value!);
  if(persistScheduled)return;
  persistScheduled=true;
  writes = writes.catch(() => {}).then(async () => {
    await hydrateBoardCache();
    persistScheduled=false;
    // Coalesce a batch of API replies and serialize each snapshot once. Keep the
    // newest boards within a conservative UTF-8 budget for Android AsyncStorage.
    const pairs:string[]=[];let length=2;
    for(const [id,entry] of [...snapshots.entries()].reverse()) {
      if(!valid(entry,Date.now()))continue;
      const pair=JSON.stringify(id)+":"+JSON.stringify(entry),size=pair.length+(pairs.length?1:0);
      if(length+size>450000)continue;
      pairs.push(pair);length+=size;
    }
    await AsyncStorage.setItem(KEY,"{"+pairs.reverse().join(",")+"}");
  }).catch(() => { persistScheduled=false; });
}
export function cachedStops(): HalteBoardData["stop"][] {
  return [...snapshots.keys()].flatMap(id => { const entry = peekBoard(id); return entry ? [entry.board.stop] : []; });
}
