import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type MobilePerformanceStyle = "natural" | "calm" | "expressive" | "energetic";
export type MobileEmotionStyle = "auto" | "warm" | "happy" | "serious" | "dramatic";
export type MobileMovementStyle = "auto" | "subtle" | "natural" | "expressive";
export type MobileSceneMotionStyle = "auto" | "still" | "ambient" | "lively";

const C={border:"rgba(255,255,255,.10)",bg:"rgba(255,255,255,.045)",text:"#FFFFFF",soft:"rgba(255,255,255,.62)",gold:"#D2B07A",active:"rgba(210,176,122,.15)"};

function Chips<T extends string>({value,options,onChange}:{value:T;options:Array<{value:T;label:string}>;onChange:(value:T)=>void}){
  return <View style={styles.chips}>{options.map(item=><Pressable key={item.value} onPress={()=>onChange(item.value)} style={[styles.chip,value===item.value&&styles.chipActive]}><Text style={[styles.chipText,value===item.value&&styles.chipTextActive]}>{item.label}</Text></Pressable>)}</View>
}

export default function MobileVideoDirectionControls({performance,emotion,movement,sceneMotion,onPerformance,onEmotion,onMovement,onSceneMotion}:{performance:MobilePerformanceStyle;emotion:MobileEmotionStyle;movement:MobileMovementStyle;sceneMotion:MobileSceneMotionStyle;onPerformance:(value:MobilePerformanceStyle)=>void;onEmotion:(value:MobileEmotionStyle)=>void;onMovement:(value:MobileMovementStyle)=>void;onSceneMotion:(value:MobileSceneMotionStyle)=>void}){
  const[open,setOpen]=React.useState(false);
  return <View style={styles.card}>
    <View style={styles.head}><View style={{flex:1}}><Text style={styles.title}>Performance</Text><Text style={styles.subtitle}>Natural works without any extra setup.</Text></View><Pressable onPress={()=>setOpen(v=>!v)} style={styles.more}><Text style={styles.moreText}>{open?"Fewer controls":"More controls"} {open?"⌃":"⌄"}</Text></Pressable></View>
    <Chips value={performance} onChange={onPerformance} options={[{value:"natural",label:"Natural"},{value:"calm",label:"Calm"},{value:"expressive",label:"Expressive"},{value:"energetic",label:"Energetic"}]}/>
    {open&&<View style={styles.advanced}>
      <View><Text style={styles.label}>Emotion</Text><Chips value={emotion} onChange={onEmotion} options={[{value:"auto",label:"Auto"},{value:"warm",label:"Warm"},{value:"happy",label:"Happy"},{value:"serious",label:"Serious"}]}/></View>
      <View><Text style={styles.label}>Movement</Text><Chips value={movement} onChange={onMovement} options={[{value:"auto",label:"Auto"},{value:"subtle",label:"Subtle"},{value:"natural",label:"Natural"},{value:"expressive",label:"Expressive"}]}/></View>
      <View><Text style={styles.label}>Scene motion</Text><Chips value={sceneMotion} onChange={onSceneMotion} options={[{value:"auto",label:"Auto"},{value:"still",label:"Still"},{value:"ambient",label:"Ambient"},{value:"lively",label:"Lively"}]}/></View>
      <Text style={styles.note}>Auto preserves the selected image context and lets desifaces apply only motion the scene naturally supports.</Text>
    </View>}
  </View>
}

const styles=StyleSheet.create({card:{marginTop:12,borderRadius:18,borderWidth:1,borderColor:C.border,backgroundColor:C.bg,padding:12},head:{flexDirection:"row",alignItems:"flex-start",gap:10},title:{color:C.text,fontSize:14,fontWeight:"900"},subtitle:{color:C.soft,fontSize:11,fontWeight:"700",marginTop:4},more:{paddingHorizontal:9,paddingVertical:7,borderRadius:999,borderWidth:1,borderColor:C.border},moreText:{color:C.gold,fontSize:10,fontWeight:"900"},chips:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:10},chip:{paddingHorizontal:10,paddingVertical:8,borderRadius:999,borderWidth:1,borderColor:C.border,backgroundColor:"rgba(0,0,0,.12)"},chipActive:{borderColor:"rgba(210,176,122,.42)",backgroundColor:C.active},chipText:{color:C.soft,fontSize:10,fontWeight:"800"},chipTextActive:{color:C.gold},advanced:{marginTop:14,paddingTop:4,borderTopWidth:1,borderTopColor:"rgba(255,255,255,.06)",gap:12},label:{color:C.text,fontSize:11,fontWeight:"900"},note:{color:C.soft,fontSize:10,lineHeight:15,marginTop:2}});
