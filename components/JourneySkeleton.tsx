import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppProvider";

/** Stable placeholder of real route rows; never display fictitious stops or times. */
export function JourneySkeleton() {
  const { colors } = useApp();
  return <View accessibilityRole="progressbar" accessibilityLabel="Ritverloop laden"
    style={[styles.root,{backgroundColor:colors.surface}]}>
    <Text style={[styles.heading,{color:colors.textSoft}]}>Ritverloop laden…</Text>
    {Array.from({length:8},(_,index)=><View key={index} style={styles.row}>
      <View style={[styles.time,{backgroundColor:colors.surfaceAlt}]} />
      <View style={styles.rail}>
        <View style={[styles.track,{backgroundColor:colors.border}]} />
        <View style={[styles.dot,{backgroundColor:colors.textMuted,borderColor:colors.surface}]} />
      </View>
      <View style={styles.texts}>
        <View style={[styles.name,{backgroundColor:colors.surfaceAlt,width:index%3===0?"60%":"82%"}]} />
        <View style={[styles.secondary,{backgroundColor:colors.surfaceAlt}]} />
      </View>
    </View>)}
  </View>;
}
const styles=StyleSheet.create({
 root:{flex:1,paddingTop:22,paddingHorizontal:14},
 heading:{fontSize:13,fontWeight:"600",marginBottom:18,marginLeft:4},
 row:{minHeight:55,flexDirection:"row",alignItems:"center",gap:12},
 time:{width:45,height:13,borderRadius:4},
 rail:{width:24,height:55,alignItems:"center",justifyContent:"center"},
 track:{position:"absolute",top:0,bottom:0,width:3},
 dot:{width:13,height:13,borderRadius:8,borderWidth:2},
 texts:{flex:1,gap:9},
 name:{height:14,borderRadius:4},
 secondary:{width:"43%",height:9,borderRadius:3}
});