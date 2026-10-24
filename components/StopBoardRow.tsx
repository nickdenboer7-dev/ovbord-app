import React from "react";
import { Pressable,StyleSheet,Text,View } from "react-native";
import { useApp } from "../context/AppProvider";
import { departureClockDelay,departureLineLabel } from "../lib/departureLine";
import { compactTrainLineLabel } from "../lib/trainLineLabel";
import { BOARD_MODE_LABEL,STOP_BOARD_BLUE,stopBoardBadge,stopBoardTiming } from "../lib/stopBoardDesign";
import type { DepartureItem } from "../types/api";

type Props={item:DepartureItem;nowMs:number;stale?:boolean;onPress?:()=>void;last?:boolean;note?:string;
  detail?:{text:string;label?:string;tight?:boolean}};
export function StopBoardBadge({item}:{item:DepartureItem}) {
  const badge=stopBoardBadge(item);
  return <View style={[styles.badge,{backgroundColor:badge.bg}]}><Text style={[styles.badgeText,{color:badge.text}]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3}>{compactTrainLineLabel(item.line,item.carrier)}</Text></View>;
}
/** Compact row used only by FlowBoard; Start, favourites and trips retain their own rows. */
export function StopBoardRow({item,nowMs,stale=false,onPress,last=false,note,detail}:Props) {
  const {colors}=useApp(),timing=stopBoardTiming(item,nowMs,stale),delay=departureClockDelay(item);
  const departed=item.departed===true&&!item.cancelled;
  const label=item.cancelled?"Rijdt niet":departed?"Vertrokken":stale?"Laatst bekende tijd":item.liveDataStale?"Live-info oud":item.isLive===true?"Live":"Gepland";
  const mode=BOARD_MODE_LABEL[item.mode||"bus"];
  const extras=[mode,item.platform?(item.mode==="train"?"spoor ":"perron ")+item.platform:"",!stale&&!item.liveDataStale?detail?.text:"",note].filter(Boolean).join(" · ");
  const color=item.cancelled?colors.danger:stale||item.liveDataStale?colors.textSoft:item.isLive?colors.success:colors.textSoft;
  return <Pressable onPress={onPress} disabled={!onPress||departed} accessibilityRole={onPress&&!departed?"button":undefined}
    accessibilityLabel={departureLineLabel(item,nowMs,{tone:departed?"departed":stale?"stale":item.isLive?"live":"planned",text:[label,extras,detail?.label].filter(Boolean).join(" · ")},Boolean(onPress&&item.ritId&&!departed))}
    style={({pressed})=>[styles.row,{backgroundColor:pressed?colors.surfaceAlt:colors.surface,borderBottomColor:colors.border},!last&&styles.divider]}>
    <StopBoardBadge item={item}/>
    <View style={styles.body}>
      <Text style={[styles.destination,{color:colors.text}]} maxFontSizeMultiplier={1.3} numberOfLines={1} ellipsizeMode="tail">{item.destination}</Text>
      {departed?<View style={styles.departedWrap}><Text style={styles.departed} maxFontSizeMultiplier={1.3}>Vertrokken</Text></View>:
        <Text style={[styles.status,{color:colors.textSoft}]} maxFontSizeMultiplier={1.3} numberOfLines={2}>
          <Text style={{color}}>{label}</Text>{extras?" · "+extras:""}
          {detail?.label&&!stale&&!item.liveDataStale?<Text style={{color:detail.label==="Krap"?colors.delayWarning:colors.textMuted}}>{" · "+detail.label}</Text>:null}
        </Text>}
    </View>
    <View style={styles.times}>
      <Text style={[styles.primary,{color:departed?colors.textSoft:colors.text},item.cancelled&&styles.cancelled]} maxFontSizeMultiplier={1.3} numberOfLines={1}>{timing.primary}</Text>
      {timing.secondary||delay?<Text style={[styles.secondary,{color:colors.textSoft}]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {timing.secondary}{timing.secondary&&delay?" ":""}{delay?<Text style={{color:delay.tone==="red"?colors.danger:colors.delayWarning,fontWeight:"700"}}>{delay.text}</Text>:null}
      </Text>:null}
    </View>
  </Pressable>;
}
const styles=StyleSheet.create({
  row:{minHeight:52,paddingVertical:7,paddingHorizontal:12,flexDirection:"row",alignItems:"center",gap:10},
  divider:{borderBottomWidth:StyleSheet.hairlineWidth},badge:{width:44,minHeight:28,paddingHorizontal:5,borderRadius:6,alignItems:"center",justifyContent:"center"},
  badgeText:{fontSize:13,fontWeight:"800"},body:{flex:1,minWidth:0,gap:2},destination:{fontSize:15,lineHeight:19,fontWeight:"600"},
  status:{fontSize:12,lineHeight:16},times:{minWidth:65,flexShrink:0,alignItems:"flex-end",gap:1},
  primary:{fontSize:17,lineHeight:21,fontWeight:"700",fontVariant:["tabular-nums"],textAlign:"right"},secondary:{fontSize:11,lineHeight:15,fontVariant:["tabular-nums"],textAlign:"right"},
  departedWrap:{flexDirection:"row"},departed:{fontSize:11,lineHeight:15,fontWeight:"700",backgroundColor:STOP_BOARD_BLUE,color:"#fff",paddingHorizontal:6,paddingVertical:1,borderRadius:3,overflow:"hidden"},
  cancelled:{textDecorationLine:"line-through"}
});
