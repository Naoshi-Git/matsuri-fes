/* Sailing KOBE 2026 stage guide. Source: official TT (2026-05-25, 2nd edition). */
(() => {
  "use strict";
  const ROOT = "./";
  const JST = "Asia/Tokyo";
  const LS = "sailing-tt-2026:v1";
  const $ = id => document.getElementById(id);
  const symbols = id => '<svg aria-hidden="true"><use href="#i-' + id + '"/></svg>';
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const hhmm = n => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  const localTime = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone:JST,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).filter(p => p.type !== "literal").map(p => [p.type,p.value]));
    return {date:parts.year+"-"+parts.month+"-"+parts.day, minute:Number(parts.hour)*60+Number(parts.minute)};
  };
  const today = () => localTime().date;
  const initialPrefs = {favorites:[],favoriteAlerts:true,finaleAlerts:true,seen:[]};
  let prefs;
  try {prefs = {...initialPrefs,...JSON.parse(localStorage.getItem(LS) || "{}")};} catch (_) {prefs = {...initialPrefs};}
  if (!Array.isArray(prefs.favorites)) prefs.favorites = [];
  if (!Array.isArray(prefs.seen)) prefs.seen = [];
  let data, teams=[], teamIndex=new Map(), eventMap=new Map();
  let tab="timeline", cursor=750, replay=false, deferredInstall=null, pushActive=false, syncing=false;
  let liveState=null, firebaseConnection=null, toastTimeout=null, isRendering=false;
  const persist = () => {try{localStorage.setItem(LS,JSON.stringify(prefs));}catch(_){}};
  const isFavorite = team => prefs.favorites.includes(team);
  const performance = ev => ev && ev.kind === "performance";
  const effectiveMinutes = ev => minutes(ev.time) + (liveState?.offsetMinutes?.[ev.venue] || 0);
  const showMessage = value => {const m=$("message");m.textContent=value;m.classList.add("visible")};
  const notifyToast = message => {
    document.querySelector(".toast")?.remove();
    if(toastTimeout) clearTimeout(toastTimeout);
    const el=document.createElement("div");el.className="toast";el.role="status";el.textContent=message;document.body.appendChild(el);
    toastTimeout=setTimeout(()=>el.remove(),2600);
  };
  const venue = key => data.venues.find(v => v.id===key)?.name || key;
  const when = ev => hhmm(effectiveMinutes(ev));
  const renderStatus = () => {
    const same=today()===data.date;
    const tag=$("statusChip");
    tag.className="status-chip"+(same?" is-live":"");
    tag.textContent=today()>data.date?"大会終了・アーカイブ":today()<data.date?"開催前":"大会当日";
    $("playbackTitle").textContent=same&&!replay?"現在の時刻に同期": "時刻を指定して再生";
    const offset=liveState?.updatedAt && same && !replay ? " / 運営更新を反映" : "";
    $("playbackHelp").textContent=same&&!replay?"予定TTを基準に表示しています"+offset:"過去のTTを再生するプレビューモードです。実際の進行記録ではありません。";
    $("followNowButton").hidden=!(same&&replay);
    $("cursorLabel").textContent=hhmm(cursor);
    $("timeSlider").value=String(cursor);
  };
  const atCursor = key => {
    const all=data.events.filter(e=>e.venue===key).slice().sort((a,b)=>effectiveMinutes(a)-effectiveMinutes(b));
    const earlier=all.filter(e=>effectiveMinutes(e)<=cursor);
    const cur=earlier.at(-1) || null;
    // A 5-minute grid is a timetable slot, not proof of actual performance.
    const now=cur && cursor-effectiveMinutes(cur)<5 ? cur : null;
    const next=all.find(e=>effectiveMinutes(e)>cursor) || null;
    return {now,next};
  };
  const renderOverview = () => {
    $("venueOverview").innerHTML=data.venues.map(v=>{
      const {now,next}=atCursor(v.id);
      const title=now?.name||"この時間は演舞予定なし";
      return '<article class="venue-card"><div class="venue-title"><span>'+esc(v.name)+'</span><span>'+esc(v.short)+'</span></div><div class="venue-now">'+esc(title)+'</div><div class="venue-next">'+(next?"次 "+esc(when(next))+" · "+esc(next.name):"この会場の予定は終了")+'</div></article>';
    }).join("");
  };
  const getSlots = () => {const out=[];for(let m=570;m<=920;m+=5)out.push(m);return out};
  const star = name => {
    const index=teamIndex.get(name);
    const saved=isFavorite(name);
    return '<button class="slot-star '+(saved?'is-saved':'')+'" type="button" data-fav="'+index+'" title="'+(saved?'お気に入り解除':'お気に入り登録')+'" aria-label="'+esc(name)+'を'+(saved?'お気に入りから解除':'お気に入りに登録')+'">'+symbols(saved?'star-filled':'star')+'</button>';
  };
  const renderTimeline = () => {
    const hdr='<div class="stage-th">時刻</div>'+data.venues.map(v=>'<div class="stage-th">'+esc(v.name)+'</div>').join("");
    const rows=getSlots().map(m=>{
      const time=hhmm(m),isCurrent=m===Math.floor(cursor/5)*5;
      let row='<div class="stage-time '+(isCurrent?'current':'')+'" data-minute="'+m+'">'+time+'</div>';
      for(const v of data.venues){
        const ev=eventMap.get(v.id+":"+time);
        const curClass=isCurrent?' current':'';
        if(!ev){row+='<div class="stage-cell is-empty'+curClass+'"></div>';continue;}
        row+='<div class="stage-cell'+curClass+'"><div class="slot-button '+(performance(ev)&&isFavorite(ev.name)?'is-saved ':'')+(ev.kind!=="performance"?"ceremony":"")+'"><button class="team-name slot-title" data-event="'+esc(ev.id)+'" type="button">'+esc(ev.name)+'</button>'+(performance(ev)?star(ev.name):"")+'</div></div>';
      }
      return row;
    }).join("");
    $("stageTable").innerHTML=hdr+rows;
  };
  const renderFinale = () => {
    $("finaleList").innerHTML=data.finale.map(item=>'<div class="finale-row"><time>'+esc(item.time)+'</time><span>'+esc(item.name)+(item.approximate?'<small>時刻はTTからの目安</small>':'')+'</span></div>').join("");
  };
  const showTeamCard = (name) => {
    const evs=data.events.filter(e=>e.name===name);
    const idx=teamIndex.get(name),saved=isFavorite(name);
    return '<article class="team-card"><div class="team-body"><button class="team-name" data-team="'+idx+'" type="button">'+esc(name)+'</button><div class="team-times">'+evs.map(e=>'<span class="time-chip"><strong>'+esc(venue(e.venue))+'</strong>'+esc(when(e))+'</span>').join("")+'</div></div>'+star(name)+'</article>';
  };
  const renderTeams = () => {
    const search=$("teamSearch").value.trim().toLocaleLowerCase("ja");
    const filtered=teams.filter(name=>name.toLocaleLowerCase("ja").includes(search));
    $("teamCount").textContent=filtered.length+" チーム";
    $("teamList").innerHTML=filtered.length?filtered.map(showTeamCard).join(""):'<div class="empty-state">該当するチームがありません。</div>';
  };
  const renderFavorites = () => {
    const names=teams.filter(name=>isFavorite(name));
    $("favoriteCount").textContent=names.length+" チーム";
    $("favoriteList").innerHTML=names.length?names.map(showTeamCard).join(""):'<div class="empty-state">'+symbols("star")+'<div>まだお気に入りのチームがありません。</div><p>「チーム」から星をタップすると、ここに全会場の出演予定が表示されます。</p><button class="text-button" data-go-teams="true">チームを探す</button></div>';
  };
  const render = () => {
    renderStatus();renderOverview();renderTimeline();renderFinale();renderTeams();renderFavorites();updatePushView();
  };
  const goTab = next => {
    tab=next;
    for(const name of ["timeline","teams","favorites"]){$(name+"View").hidden=name!==next;}
    document.querySelectorAll(".nav-item").forEach(b=>{const active=b.dataset.tab===next;b.classList.toggle("active",active);if(active)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current")});
    if(next==="favorites")renderFavorites();if(next==="teams")renderTeams();
    window.scrollTo({top:0,behavior:"instant"});
  };
  const setCursor = (m,manual=true) => {
    cursor=Math.max(570,Math.min(920,Math.round(m/5)*5));
    if(manual)replay=true;
    renderStatus();renderOverview();renderTimeline();
  };
  const jumpToCursor = () => {
    const row=document.querySelector('.stage-time[data-minute="'+Math.floor(cursor/5)*5+'"]');
    if(row)row.scrollIntoView({behavior:"smooth",block:"center"});
  };
  const openModal = (title,body) => {
    $("modalTitle").textContent=title;$("modalBody").innerHTML=body;$("modal").hidden=false;
    $("modalClose").focus();
    document.body.style.overflow="hidden";
  };
  const closeModal=()=>{$("modal").hidden=true;document.body.style.overflow=""};
  const teamModal = name => {
    const es=data.events.filter(e=>e.name===name).sort((a,b)=>effectiveMinutes(a)-effectiveMinutes(b));
    const part=es.map(e=>'<div class="modal-slot"><time>'+esc(when(e))+'</time><strong>'+esc(venue(e.venue))+'</strong><small>予定</small></div>').join("");
    openModal(name,'<div class="modal-subtitle">出演予定 · '+es.length+' 回</div>'+part+'<button class="filled-button dialog-action" data-modal-fav="'+teamIndex.get(name)+'">'+(isFavorite(name)?'★ お気に入り解除':'☆ お気に入りに追加')+'</button>');
  };
  const toggleFavorite=name=>{
    if(isFavorite(name))prefs.favorites=prefs.favorites.filter(n=>n!==name);
    else prefs.favorites.push(name);
    persist();renderTimeline();renderTeams();renderFavorites();syncSubscription();
    notifyToast(isFavorite(name)?"お気に入りに追加しました":"お気に入りから外しました");
  };
  function updatePushView(){
    if(!data)return;
    $("favoriteAlerts").checked=!!prefs.favoriteAlerts;
    $("finaleAlerts").checked=!!prefs.finaleAlerts;
    const ready=!!window.SAILING_CONFIG?.firebase && !!window.SAILING_CONFIG?.vapidPublicKey;
    const installed=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
    const permission=("Notification" in window)?Notification.permission:"unsupported";
    $("pushStatus").textContent=pushActive?"バックグラウンド通知を登録済み":!ready?"プッシュ配信サーバー未設定":permission==="granted"?"端末の通知は許可済み":"端末の通知は未設定";
    $("pushHelp").textContent=!ready?"この版は通知サーバー未接続です。端末でのテスト通知は可能ですが、アプリを閉じた後の5分前通知はまだ配信されません。":!installed&&/iPhone|iPad|iPod/.test(navigator.userAgent)?"iPhoneでは先にSafariの共有メニューからホーム画面に追加してください。":"通知を許可すると、登録したチームの出演5分前とフィナーレ発表を受信できます。";
    $("enablePush").textContent=pushActive?"通知設定を更新":"出演通知を有効にする";
  }
  async function notificationTest(){
    if(!("Notification" in window)){notifyToast("この環境ではWeb通知を利用できません");return}
    if(Notification.permission!=="granted"){
      const result=await Notification.requestPermission();
      if(result!=="granted"){notifyToast("通知が許可されていません");updatePushView();return}
    }
    const sw=await navigator.serviceWorker.ready;
    await sw.showNotification("Sailing KOBE · テスト通知",{body:"端末通知の動作確認です。出演5分前の自動配信とは異なります。",icon:ROOT+"icon.svg",tag:"sailing-test"});
    updatePushView();notifyToast("テスト通知を送信しました");
  }
  async function connectFirebase(){
    const cfg=window.SAILING_CONFIG;
    if(!cfg?.firebase)return null;
    if(firebaseConnection)return firebaseConnection;
    const [{initializeApp,getApps},{getAuth,signInAnonymously,onAuthStateChanged},{getFunctions,httpsCallable},{getFirestore,doc,onSnapshot}]=await Promise.all([
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js"),
      import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js")
    ]);
    const app=getApps()[0]||initializeApp(cfg.firebase);
    const auth=getAuth(app);
    if(!auth.currentUser)await signInAnonymously(auth);
    const functions=getFunctions(app,cfg.region||"asia-northeast1");
    firebaseConnection={auth,update:httpsCallable(functions,"updateSubscription")};
    onSnapshot(doc(getFirestore(app),"live","status"),snap=>{
      const d=snap.exists()?snap.data():null;
      const offsets={};
      for(const v of data.venues)offsets[v.id]=Math.max(-60,Math.min(120,Number(d?.venues?.[v.id]?.offsetMinutes)||0));
      liveState=d?{offsetMinutes:offsets,updatedAt:d.updatedAt}:null;
      renderOverview();renderTimeline();renderTeams();renderFavorites();renderStatus();
    },err=>console.warn("Live state unavailable",err));
    return firebaseConnection;
  }
  async function syncSubscription(){
    if(!pushActive||!firebaseConnection||syncing)return;
    syncing=true;
    try{
      const sw=await navigator.serviceWorker.ready;
      const subscription=await sw.pushManager.getSubscription();
      if(subscription)await firebaseConnection.update({subscription:subscription.toJSON(),favorites:prefs.favorites,favoriteAlerts:!!prefs.favoriteAlerts,finaleAlerts:!!prefs.finaleAlerts});
    }catch(e){console.warn("Push synchronization failed",e)}finally{syncing=false}
  }
  const toUint8 = base64=>{
    const fixed=base64.replace(/-/g,"+").replace(/_/g,"/");
    const decoded=atob(fixed+"=".repeat((4-fixed.length%4)%4));
    return Uint8Array.from(decoded,ch=>ch.charCodeAt(0));
  };
  async function enablePush(){
    const cfg=window.SAILING_CONFIG;
    if(!cfg?.firebase||!cfg?.vapidPublicKey){
      openModal("バックグラウンド通知",'<p>ホーム画面への追加と通知の受信はiPhoneでも利用できます。ただし、この公開版には配信サーバーがまだ接続されていないため、出演5分前の自動通知を有効にできません。</p><p>通知サーバーの接続手順はリポジトリ内のREADMEに記載しています。テスト通知は端末単体で試せます。</p>');
      return;
    }
    if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)){notifyToast("このブラウザではWeb Pushに対応していません");return}
    try{
      const granted=await Notification.requestPermission();
      if(granted!=="granted"){notifyToast("通知の許可が必要です");return}
      const sw=await navigator.serviceWorker.ready;
      let sub=await sw.pushManager.getSubscription();
      if(!sub)sub=await sw.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toUint8(cfg.vapidPublicKey)});
      const connection=await connectFirebase();
      await connection.update({subscription:sub.toJSON(),favorites:prefs.favorites,favoriteAlerts:!!prefs.favoriteAlerts,finaleAlerts:!!prefs.finaleAlerts});
      pushActive=true;updatePushView();notifyToast("通知の登録が完了しました");
    }catch(e){console.error("Enable push failed",e);notifyToast("通知を登録できませんでした。設定をご確認ください")}
  }
  async function registerSW(){
    if(!("serviceWorker" in navigator))return;
    try{
      const reg=await navigator.serviceWorker.register(ROOT+"sw.js",{scope:ROOT});
      if(window.SAILING_CONFIG?.firebase && "PushManager" in window){
        const sub=await reg.pushManager.getSubscription();
        if(sub){await connectFirebase();pushActive=true;await syncSubscription();updatePushView()}
      }
    }catch(e){console.warn("Service worker registration unavailable",e)}
  }
  function startClock(){
    const t=localTime();
    if(t.date===data.date&&!replay){cursor=Math.max(570,Math.min(920,Math.floor(t.minute/5)*5));renderStatus();renderOverview();renderTimeline();}
    if(t.date!==data.date || replay || !prefs.favoriteAlerts)return;
    const candidates=data.events.filter(e=>performance(e)&&isFavorite(e.name)&&effectiveMinutes(e)-5===t.minute);
    if(pushActive || Notification?.permission!=="granted")return;
    for(const ev of candidates){
      const id=data.date+":"+ev.id;
      if(prefs.seen.includes(id))continue;
      prefs.seen.push(id);persist();
      navigator.serviceWorker.ready.then(sw=>sw.showNotification("あと5分 · "+ev.name,{body:ev.time+" "+venue(ev.venue)+"会場で出演予定",tag:id,icon:ROOT+"icon.svg",data:{url:location.href+"?team="+encodeURIComponent(ev.name)}})).catch(console.warn);
    }
  }
  function installInstructions(){
    const standalone=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
    if(standalone){notifyToast("ホーム画面から起動しています");return}
    if(deferredInstall){deferredInstall.prompt();deferredInstall=null;return}
    const apple=/iPhone|iPad|iPod/.test(navigator.userAgent);
    const desc=apple?'<ol><li>このページをSafariで開く</li><li>画面下の共有ボタンをタップ</li><li>「ホーム画面に追加」を選択</li><li>追加されたSailing TTを開き、通知の設定を行う</li></ol>':'<p>ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選択してください。</p>';
    openModal("ホーム画面に追加",desc+'<p>iPhoneで通知を受けるにはホーム画面のWebアプリから許可してください。</p>');
  }
  function bind(){
    document.querySelectorAll(".nav-item").forEach(el=>el.addEventListener("click",()=>goTab(el.dataset.tab)));
    $("timeSlider").addEventListener("input",e=>setCursor(Number(e.target.value)));
    $("jumpCursor").addEventListener("click",jumpToCursor);
    $("followNowButton").addEventListener("click",()=>{replay=false;const t=localTime();setCursor(t.minute,false)});
    $("teamSearch").addEventListener("input",renderTeams);
    $("installButton").addEventListener("click",installInstructions);
    $("aboutButton").addEventListener("click",()=>openModal("このアプリについて",'<p>Sailing KOBE 2026の公式TT（2026年5月25日更新）を元に、3会場の予定を横断表示しています。2026年7月4日の大会は終了しています。</p><p>お気に入りの星を押すとチームの全出演が保存されます。アーカイブはスライダーで時刻を再生できます。</p><p>タイムラインは予定TTからの推定表示です。運営からのリアルタイム進行更新とは区別して表示します。</p>'));
    $("modalClose").addEventListener("click",closeModal);
    $("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal()});
    document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("modal").hidden)closeModal()});
    $("enablePush").addEventListener("click",enablePush);
    $("testPush").addEventListener("click",()=>notificationTest().catch(()=>notifyToast("通知を送信できませんでした")));
    for(const [input,key] of [["favoriteAlerts","favoriteAlerts"],["finaleAlerts","finaleAlerts"]]){
      $(input).addEventListener("change",e=>{prefs[key]=e.target.checked;persist();syncSubscription()});
    }
    document.addEventListener("click",e=>{
      const fav=e.target.closest("[data-fav]");
      if(fav){const team=teams[Number(fav.dataset.fav)];if(team)toggleFavorite(team);return}
      const modalFav=e.target.closest("[data-modal-fav]");
      if(modalFav){const team=teams[Number(modalFav.dataset.modalFav)];if(team){toggleFavorite(team);closeModal()}return}
      const team=e.target.closest("[data-team]");
      if(team){teamModal(teams[Number(team.dataset.team)]);return}
      const event=e.target.closest("[data-event]");
      if(event){const ev=data.events.find(x=>x.id===event.dataset.event);if(ev){if(performance(ev))teamModal(ev.name);else openModal(ev.name,'<p>'+ev.time+' · '+venue(ev.venue)+'会場の予定です。</p>')}return}
      if(e.target.closest("[data-go-teams]"))goTab("teams");
    });
    window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e});
    window.addEventListener("appinstalled",()=>notifyToast("ホーム画面への追加が完了しました"));
  }
  async function init(){
    bind();
    try{
      const response=await fetch(ROOT+"data/schedule.json",{cache:"no-store"});
      if(!response.ok)throw new Error("TT data HTTP "+response.status);
      data=await response.json();
      if(!Array.isArray(data.events)||!data.date)throw new Error("Invalid timetable");
      teams=[...new Set(data.events.filter(performance).map(ev=>ev.name))].sort((a,b)=>{
        const aa=data.events.find(e=>e.name===a)?.time||"99:99", bb=data.events.find(e=>e.name===b)?.time||"99:99";
        return aa.localeCompare(bb,"ja") || a.localeCompare(b,"ja");
      });
      teamIndex=new Map(teams.map((name,i)=>[name,i]));
      eventMap=new Map(data.events.map(ev=>[ev.venue+":"+ev.time,ev]));
      replay=today()!==data.date;
      cursor=replay?750:Math.max(570,Math.min(920,Math.floor(localTime().minute/5)*5));
      render();
      registerSW();
      if(window.SAILING_CONFIG?.firebase)connectFirebase().catch(console.warn);
      const route=new URL(location.href).searchParams.get("team");
      if(route&&teamIndex.has(route)){goTab("teams");teamModal(route)}
      setInterval(startClock,30000);
    }catch(e){console.error(e);showMessage("タイムテーブルを読み込めませんでした。ネットワーク接続を確認して再読み込みしてください。");$("statusChip").textContent="読込エラー"}
  }
  init();
})();
