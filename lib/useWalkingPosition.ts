import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { hydrateNearbyCache, peekLastLocation } from "./nearbyCache";

/** Read existing permission only. Never request permission just to render advice. */
export function useWalkingPosition(enabled = true): { lat: number; lon: number } | null {
  const [coords,setCoords] = useState<{lat:number;lon:number}|null>(null);
  useEffect(() => {
    let active=true;
    const read=async()=>{
      try {
        const permission=await Location.getForegroundPermissionsAsync();
        await hydrateNearbyCache();
        const fix=peekLastLocation();
        const usable=enabled && permission.granted && fix && Date.now()-fix.fixAt>=0 && Date.now()-fix.fixAt<=120000;
        if(active)setCoords(usable ? {lat:fix.coords.latitude,lon:fix.coords.longitude}:null);
      }catch{if(active)setCoords(null);}
    };
    if(enabled)void read();else setCoords(null);
    const interval=enabled ? setInterval(()=>void read(),15000):undefined;
    const sub=AppState.addEventListener("change",state=>{if(state==="active"&&enabled)void read();});
    return()=>{active=false;if(interval)clearInterval(interval);sub.remove();};
  },[enabled]);
  return enabled ? coords : null;
}
