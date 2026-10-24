import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StopSummary } from "../types/api";
import { isStoredStop } from "./storedJson";
const KEY="ovbord.favoriteLineOrigins.v1";
const origins:Record<string,StopSummary>={};let loaded:Promise<void>|undefined;
export async function loadLineOrigins():Promise<Record<string,StopSummary>> {
  if(!loaded)loaded=(async()=>{try{
    const raw=await AsyncStorage.getItem(KEY),data=raw?JSON.parse(raw):{};
    for(const [key,stop] of Object.entries(data||{}))if(isStoredStop<StopSummary>(stop)&&!origins[key])origins[key]={...stop,lines:Array.isArray(stop.lines)?stop.lines:[]};
  }catch{}})();
  await loaded;return {...origins};
}
export function rememberLineOrigin(key:string,stop:StopSummary):void {
  origins[key]={...stop,lines:Array.isArray(stop.lines)?stop.lines:[]};
  void loadLineOrigins().then(()=>AsyncStorage.setItem(KEY,JSON.stringify(origins))).catch(()=>{});
}
