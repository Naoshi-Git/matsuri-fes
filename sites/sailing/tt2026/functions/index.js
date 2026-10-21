"use strict";
const {initializeApp}=require("firebase-admin/app");
const {getFirestore,FieldValue}=require("firebase-admin/firestore");
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {onSchedule}=require("firebase-functions/v2/scheduler");
const {onDocumentWritten}=require("firebase-functions/v2/firestore");
const {defineSecret}=require("firebase-functions/params");
const webpush=require("web-push");
const schedule=require("./schedule.json");
initializeApp();
const db=getFirestore();
const PUBLIC_KEY=defineSecret("VAPID_PUBLIC_KEY");
const PRIVATE_KEY=defineSecret("VAPID_PRIVATE_KEY");
const REGION="asia-northeast1";
const APP_URL="https://naoshi-git.github.io/matsuri-fes/sites/sailing/tt2026/";
const validTeams=new Set(schedule.events.filter(e=>e.kind==="performance").map(e=>e.name));
function validateSubscription(raw){
  if(!raw||typeof raw!=="object"||typeof raw.endpoint!=="string"||!raw.keys)throw new HttpsError("invalid-argument","Invalid push subscription");
  let u;try{u=new URL(raw.endpoint)}catch(_){throw new HttpsError("invalid-argument","Invalid endpoint URL")}
  const h=u.hostname.toLowerCase();
  const allowed=["push.apple.com","push.services.mozilla.com","fcm.googleapis.com","googleapis.com","notify.windows.com"];
  if(u.protocol!=="https:"||!allowed.some(s=>h===s||h.endsWith("."+s))||raw.endpoint.length>2048){
    throw new HttpsError("invalid-argument","Unsupported push endpoint");
  }
  if(typeof raw.keys.p256dh!=="string"||raw.keys.p256dh.length>180||typeof raw.keys.auth!=="string"||raw.keys.auth.length>100){
    throw new HttpsError("invalid-argument","Invalid encryption keys");
  }
  return {endpoint:raw.endpoint,keys:{p256dh:raw.keys.p256dh,auth:raw.keys.auth}};
}
exports.updateSubscription=onCall({region:REGION,maxInstances:10},async request=>{
  if(!request.auth?.uid)throw new HttpsError("unauthenticated","Sign-in required");
  const d=request.data||{};
  const sub=validateSubscription(d.subscription);
  if(!Array.isArray(d.favorites)||d.favorites.length>75)throw new HttpsError("invalid-argument","Invalid favorites");
  const favorites=[...new Set(d.favorites)].filter(s=>typeof s==="string"&&validTeams.has(s));
  if(favorites.length!==new Set(d.favorites).size)throw new HttpsError("invalid-argument","Unknown team");
  await db.collection("subscriptions").doc(request.auth.uid).set({
    subscription:sub,
    favorites,
    favoriteAlerts:d.favoriteAlerts===true,
    finaleAlerts:d.finaleAlerts===true,
    updatedAt:FieldValue.serverTimestamp()
  },{merge:false});
  return {ok:true};
});
function initWebPush(){
  webpush.setVapidDetails("mailto:sailing.kobe@matsuri-fes.com",PUBLIC_KEY.value(),PRIVATE_KEY.value());
}
async function sendOnce(userId,record,message){
  const ref=db.collection("sent_notifications").doc(userId+"_"+record);
  try{await ref.create({sentAt:FieldValue.serverTimestamp()})}catch(e){if(e.code===6||e.code==="already-exists")return;throw e}
  try{
    await webpush.sendNotification(message.subscription,JSON.stringify(message.payload),{TTL:300,urgency:"high"});
  }catch(err){
    if([404,410].includes(err.statusCode)){await db.collection("subscriptions").doc(userId).delete()}
    else {await ref.delete();console.error("Web push error",err.statusCode||err.message)}
  }
}
const pushPayload=(ev)=>({
  title:"まもなく出演 · "+ev.name,
  body:ev.time+" · "+schedule.venues.find(v=>v.id===ev.venue)?.name+"会場（予定）",
  tag:"favorite-"+ev.id,
  url:APP_URL+"?team="+encodeURIComponent(ev.name)
});
async function forEachWithLimit(rows,limit,callback){
  for(let i=0;i<rows.length;i+=limit)await Promise.allSettled(rows.slice(i,i+limit).map(callback));
}
exports.dispatchScheduled=onSchedule({
  schedule:"every 1 minutes",timeZone:"Asia/Tokyo",region:REGION,
  secrets:[PUBLIC_KEY,PRIVATE_KEY],maxInstances:1
},async()=>{
  // No work, no Firestore reads, and no notifications outside this edition's event day.
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  const day=parts.year+"-"+parts.month+"-"+parts.day;
  if(day!==schedule.date)return;
  const now=Date.now();
  // The public live/status document can adjust the 5-minute notification trigger by venue.
  const live=await db.doc("live/status").get();
  const venueOffsets={};
  for(const v of schedule.venues){
    const value=Number(live.data()?.venues?.[v.id]?.offsetMinutes)||0;
    venueOffsets[v.id]=Math.round(Math.max(-60,Math.min(120,value))/5)*5;
  }
  const upcoming=schedule.events.filter(e=>{
    if(e.kind!=="performance")return false;
    const due=new Date(schedule.date+"T"+e.time+":00+09:00").getTime()+(venueOffsets[e.venue]||0)*60000-5*60000;
    return now>=due&&now<due+110000;
  });
  if(!upcoming.length)return;
  initWebPush();
  const names=[...new Set(upcoming.map(e=>e.name))];
  const snapshot=await db.collection("subscriptions").where("favorites","array-contains-any",names).get();
  await forEachWithLimit(snapshot.docs,15,async doc=>{
    const d=doc.data();if(!d.favoriteAlerts)return;
    for(const ev of upcoming){if(!d.favorites.includes(ev.name))continue;
      await sendOnce(doc.id,ev.id,{subscription:d.subscription,payload:pushPayload({...ev,time:new Date(new Date(schedule.date+"T"+ev.time+":00+09:00").getTime()+(venueOffsets[ev.venue]||0)*60000).toLocaleTimeString("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit",hour12:false})})});
    }
  });
});
exports.finaleAnnouncement=onDocumentWritten({
  document:"announcements/finale",region:REGION,secrets:[PUBLIC_KEY,PRIVATE_KEY],maxInstances:1
},async event=>{
  const before=event.data?.before?.data(),after=event.data?.after?.data();
  if(!after?.published||typeof after.publishVersion!=="number"||after.publishVersion<=0)return;
  if(before?.publishVersion===after.publishVersion&&before?.published===after.published)return;
  const title=typeof after.title==="string"&&after.title.trim()?after.title.trim().slice(0,80):"フィナーレ進出チーム発表";
  const body=typeof after.message==="string"&&after.message.trim()?after.message.trim().slice(0,180):"フィナーレ進出チームが発表されました。";
  initWebPush();
  const snapshot=await db.collection("subscriptions").where("finaleAlerts","==",true).get();
  await forEachWithLimit(snapshot.docs,15,async doc=>{
    const d=doc.data();
    await sendOnce(doc.id,"finale-"+after.publishVersion,{subscription:d.subscription,payload:{title,body,tag:"finale-"+after.publishVersion,url:APP_URL}});
  });
});
