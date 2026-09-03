import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { fetchSpendingSummary, type SpendingSummary } from "../../core/pricing/spendingApi";

const C={card:"#12151B",border:"rgba(255,255,255,.10)",text:"#FFFFFF",soft:"rgba(255,255,255,.62)",gold:"#D2B07A",green:"#8DD8AA"};
function money(value:any,currency="USD"){const n=Number(value||0);try{return new Intl.NumberFormat("en-US",{style:"currency",currency:currency==="MIXED"?"USD":currency||"USD",minimumFractionDigits:2}).format(n)+(currency==="MIXED"?"+":"")}catch{return `${currency} ${n.toFixed(2)}`}}
function delta(value:any){const n=Number(value);if(!Number.isFinite(n))return "No prior comparison";if(n===0)return "Same as last period";return `${n>0?"↑":"↓"} ${Math.abs(n).toFixed(1)}% vs prior`}

export default function SpendingSummaryCard({token}:{token?:string|null}){
  const[data,setData]=React.useState<SpendingSummary|null>(null);const[loading,setLoading]=React.useState(false);const[error,setError]=React.useState("");
  const load=React.useCallback(async()=>{if(!token)return;setLoading(true);setError("");try{setData(await fetchSpendingSummary(token,"month"))}catch(e:any){setError(String(e?.message||"Could not load spending"))}finally{setLoading(false)}},[token]);
  React.useEffect(()=>{void load()},[load]);
  const currency=data?.money?.currency||"USD";const top=data?.top_category;
  return <View style={styles.card}>
    <View style={styles.head}><View><Text style={styles.kicker}>SPENDING & CREDITS</Text><Text style={styles.title}>This month</Text></View><Pressable onPress={()=>router.push("/pricing/spending-history" as any)}><Text style={styles.link}>View details →</Text></Pressable></View>
    {loading&&!data?<ActivityIndicator color={C.gold}/>:error&&!data?<Pressable onPress={()=>void load()}><Text style={styles.error}>{error} · Tap to retry</Text></Pressable>:data?<>
      <View style={styles.kpis}><View><Text style={styles.value}>{Math.round(data.credits.consumed).toLocaleString()}</Text><Text style={styles.label}>credits used</Text><Text style={styles.meta}>{delta(data.comparison.credits_consumed_delta_percent)}</Text></View><View><Text style={styles.value}>{money(data.money.paid,currency)}</Text><Text style={styles.label}>money paid</Text><Text style={styles.meta}>actual recorded payments</Text></View></View>
      <View style={styles.row}><Text style={styles.rowLabel}>Available</Text><Text style={styles.rowValue}>{Math.round(data.credits.available).toLocaleString()} credits</Text></View>
      <View style={styles.row}><Text style={styles.rowLabel}>Top category</Text><Text style={styles.rowValue}>{top?`${top.category} · ${top.percent.toFixed(0)}%`:"No usage yet"}</Text></View>
      <View style={styles.bar}><View style={[styles.fill,{width:`${Math.max(0,Math.min(100,top?.percent||0))}%`}]}/></View>
      <Text style={styles.note}>Money paid and credits used are shown separately.</Text>
    </>:<Text style={styles.meta}>Spending history will appear here after activity.</Text>}
  </View>
}

const styles=StyleSheet.create({card:{marginHorizontal:16,marginTop:12,padding:16,borderRadius:18,borderWidth:1,borderColor:C.border,backgroundColor:C.card},head:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-start",gap:12},kicker:{fontSize:10,fontWeight:"900",letterSpacing:1.1,color:C.gold},title:{marginTop:3,fontSize:18,fontWeight:"900",color:C.text},link:{fontSize:11,fontWeight:"800",color:C.gold,paddingVertical:4},kpis:{marginTop:15,flexDirection:"row",gap:10},value:{fontSize:22,fontWeight:"900",color:C.text},label:{fontSize:11,color:C.soft,marginTop:2},meta:{fontSize:10,color:C.soft,marginTop:3},row:{marginTop:12,paddingTop:10,borderTopWidth:1,borderTopColor:"rgba(255,255,255,.06)",flexDirection:"row",justifyContent:"space-between",gap:12},rowLabel:{fontSize:11,color:C.soft},rowValue:{fontSize:11,fontWeight:"800",color:C.text},bar:{height:5,borderRadius:99,backgroundColor:"rgba(255,255,255,.08)",overflow:"hidden",marginTop:10},fill:{height:"100%",backgroundColor:C.gold,borderRadius:99},note:{marginTop:10,fontSize:10,color:C.soft},error:{fontSize:11,color:"#FFB4BD",paddingVertical:12}});
