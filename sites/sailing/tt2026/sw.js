const CACHE="sailing-2026-v2";
const ASSETS=["./","./index.html","./style.css","./app.js","./config.js","./icon.svg","./icon-192.png","./manifest.webmanifest","./data/schedule.json"];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("sailing-2026-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin || !url.pathname.startsWith(new URL("./",self.registration.scope).pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    // Prefer fresh TT and configuration when online; use the last verified version offline.
    if(url.pathname.endsWith("schedule.json")||url.pathname.endsWith("config.js")||request.mode==="navigate"){
      try {const res=await fetch(request);if(res.ok)await cache.put(request,res.clone());return res}
      catch(e){const stored=await cache.match(request);if(stored)return stored;throw e}
    }
    const hit=await cache.match(request);if(hit)return hit;
    const res=await fetch(request);if(res.ok)await cache.put(request,res.clone());return res;
  })());
});
self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?.json()||{}}catch(_){data={title:"Sailing KOBE",body:event.data?.text()||""}}
  const title=String(data.title||"Sailing KOBE");
  const opts={body:String(data.body||"大会からのお知らせ"),icon:"./icon-192.png",badge:"./icon-192.png",tag:String(data.tag||"sailing-notice"),data:{url:typeof data.url==="string"?data.url:"./"},renotify:false};
  event.waitUntil(self.registration.showNotification(title,opts));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||"./",self.registration.scope);
  if(target.origin!==self.location.origin||!target.pathname.startsWith(new URL("./",self.registration.scope).pathname))return;
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async windows=>{
    for(const client of windows){if(client.url.startsWith(self.registration.scope)){await client.focus();return client.navigate(target.href)}}
    return self.clients.openWindow(target.href);
  }));
});
