const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const load=p=>fs.readFileSync(path.join(root,p),"utf8");
const schedule=JSON.parse(load("data/schedule.json"));

test("official metadata, date, venues and source attribution",()=>{
  assert.equal(schedule.date,"2026-07-04");
  assert.equal(schedule.timezone,"Asia/Tokyo");
  assert.deepEqual(schedule.venues.map(x=>x.id),["main","sub","parade"]);
  assert.match(schedule.source,/drive\.google\.com/);
  assert.match(schedule.crosscheck,/drive\.google\.com/);
});

test("189 five-minute slots, no venue/time collision",()=>{
  assert.equal(schedule.events.length,189);
  const ids=new Set(),slots=new Set();
  for(const e of schedule.events){
    assert.match(e.time,/^\d{2}:\d{2}$/);
    assert.equal(Number(e.time.slice(-2))%5,0,e.id);
    assert.ok(["performance","ceremony","break"].includes(e.kind));
    assert.ok(e.name.trim().length>0);
    assert.ok(!ids.has(e.id),e.id);ids.add(e.id);
    const slot=e.venue+":"+e.time;assert.ok(!slots.has(slot),slot);slots.add(slot);
  }
  assert.equal(schedule.events.filter(e=>e.venue==="main").length,70);
  assert.equal(schedule.events.filter(e=>e.venue==="sub").length,69);
  assert.equal(schedule.events.filter(e=>e.venue==="parade").length,50);
});

test("62 performance teams and PDF extraction corrections",()=>{
  const teams=new Set(schedule.events.filter(e=>e.kind==="performance").map(e=>e.name));
  assert.equal(teams.size,62);
  const get=(venue,time)=>schedule.events.find(e=>e.venue===venue&&e.time===time)?.name;
  assert.equal(get("parade","13:55"),"嘉們-KAMON-");
  assert.equal(get("parade","14:50"),"一華 -Ikka-");
  assert.equal(get("main","15:20"),"総踊り");
  assert.equal(get("sub","15:20"),"総踊り");
  assert.equal(get("main","09:45"),"大阪大学お祭りダンスサークル祭楽人");
  assert.equal(get("sub","12:40"),"大阪大学お祭りダンスサークル祭楽人");
  assert.equal(get("parade","11:20"),"大阪大学お祭りダンスサークル祭楽人");
});

test("backend schedule matches Pages schedule byte-for-byte",()=>{
  assert.equal(load("data/schedule.json"),load("functions/schedule.json"));
});

test("front-end and service worker syntax and scope",()=>{
  for(const file of ["app.js","sw.js","config.js","functions/index.js"]){
    assert.doesNotThrow(()=>new vm.Script(load(file),{filename:file}),file);
  }
  assert.match(load("sw.js"),/showNotification/);
  assert.match(load("app.js"),/notificationTest/);
  assert.match(load("app.js"),/Notification\.permission/);
  assert.match(load("index.html"),/manifest\.webmanifest/);
  assert.match(load("index.html"),/Sailing KOBE 2026/);
});

test("public config never contains secrets or a private VAPID key",()=>{
  const config=load("config.js");
  assert.match(config,/firebase:\s*null/);
  assert.doesNotMatch(config,/privateKey\s*:/);
  assert.doesNotMatch(config,/serviceAccount/);
});
