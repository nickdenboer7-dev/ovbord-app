import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppProvider";
import { getHalte, getNearby } from "../lib/api";
import { cachedBoard, rememberBoard } from "../lib/boardCache";
import { directionDescription, directionStops } from "../lib/stopDirections";
import { runLimited } from "../lib/concurrency";
import { distanceMeters } from "../lib/boardingMatch";
import { useWalkingPosition } from "../lib/useWalkingPosition";
import type { HalteBoardData, StopSummary } from "../types/api";

type Entry={stop:StopSummary;board?:HalteBoardData;fetchedAt?:number;stale?:boolean;loading:boolean};
export function StopDirectionPicker({stop,onChoose,onBack}:{stop:StopSummary;
  onChoose:(stop:StopSummary,board?:HalteBoardData,fetchedAt?:number,stale?:boolean)=>void;onBack:()=>void}) {
  const {colors,manualCity}=useApp();const insets=useSafeAreaInsets();
  const coords=useWalkingPosition(!manualCity);
  const [entries,setEntries]=useState<Entry[]>([]),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    void(async()=>{
      let nearby:StopSummary[]=[];
      if(!stop.variants?.length && Number.isFinite(stop.lat)&&Number.isFinite(stop.lon)) {
        try{nearby=await getNearby(stop.lat!,stop.lon!);}catch{/* Explicit/cached platforms remain usable offline. */}
      }
      if(!active)return;
      const members=directionStops(stop,nearby).map(({variants,...s})=>s);
      if(members.length<=1){onChoose(members[0]||stop);return;}
      const stops=members.map(s=>({...s,variants:members}));
      setEntries(stops.map(stop=>({stop,loading:true})));setLoading(false);
      await runLimited(stops,3,async quay=>{
        const cached=await cachedBoard(quay.id);
        if(active&&cached)setEntries(list=>list.map(e=>e.stop.id===quay.id?{...e,...cached,stale:true,loading:false}:e));
        try{
          const raw=await getHalte(quay.id),board={...raw,stop:{...raw.stop,...quay}};
          const fetchedAt=Date.now();rememberBoard(board,fetchedAt);
          if(active)setEntries(list=>list.map(e=>e.stop.id===quay.id?{stop:quay,board,fetchedAt,stale:false,loading:false}:e));
        }catch{if(active)setEntries(list=>list.map(e=>e.stop.id===quay.id?{...e,loading:false,stale:true}:e));}
      });
    })();
    return()=>{active=false;};
  },[stop.id]);
  return <View style={{flex:1,backgroundColor:colors.background}}>
    <View style={[styles.header,{paddingTop:Math.max(insets.top,24)+12,borderBottomColor:colors.border}]}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Terug" style={styles.back}><Ionicons name="arrow-back" size={24} color={colors.text}/></Pressable>
      <Text accessibilityRole="header" style={[styles.title,{color:colors.heading}]}>{loading?"Halte laden…":"Kies je richting"}</Text>
    </View>
    {loading?<ActivityIndicator style={{marginTop:30}} color={colors.accentText}/>:<FlatList data={entries} keyExtractor={e=>e.stop.id}
      ListHeaderComponent={<Text style={[styles.stopName,{color:colors.text}]}>{stop.name}</Text>}
      renderItem={({item:e})=>{
        const direction=directionDescription(e.board,Date.now()),distance=coords?distanceMeters(coords,e.stop):Infinity;
        const walk=Number.isFinite(distance)?Math.ceil(distance*1.3):null;
        return <Pressable onPress={()=>onChoose(e.stop,e.board,e.fetchedAt,e.stale)} accessibilityRole="button"
          accessibilityLabel={direction.label+", "+(walk===null?"loopafstand onbekend":walk+" meter lopen")}
          style={[styles.row,{borderBottomColor:colors.border}]}>
          <View style={{flex:1,gap:6}}><Text style={{color:colors.heading,fontSize:17,fontWeight:"700"}}>{direction.label}</Text>
            <Text style={{color:colors.textSoft,fontSize:13}}>{e.stop.platform?"Perron "+e.stop.platform+" · ":""}{walk===null?"Loopafstand onbekend":walk+" m lopen"}</Text>
            <Text style={{color:colors.textSoft,fontSize:13}}>{e.loading?"Vertrektijden laden…":direction.next?(e.stale?"Laatst bekende tijd ":"Eerstvolgende vertrek ")+direction.next:"Geen vertrektijd beschikbaar"}</Text>
          </View><Ionicons name="chevron-forward" size={20} color={colors.textSoft}/>
        </Pressable>;
      }}/>}
  </View>;
}
const styles=StyleSheet.create({header:{flexDirection:"row",alignItems:"center",gap:8,paddingHorizontal:12,paddingBottom:12,borderBottomWidth:StyleSheet.hairlineWidth},back:{width:40,height:40,justifyContent:"center"},title:{fontSize:22,fontWeight:"800",flex:1},stopName:{fontSize:18,fontWeight:"700",margin:16},row:{padding:18,minHeight:112,borderBottomWidth:StyleSheet.hairlineWidth,flexDirection:"row",alignItems:"center",gap:12}});
