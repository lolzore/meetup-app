const MODE = "__MODE__";
const ONLINE_URL = "__ONLINE_URL__";
const D = __DATA__;
let H = D.home || null;   // where we're staying: never in the public code; comes encrypted from the group (or a private build)
const GOLEM = {lat:41.2560, lon:19.5180};
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const store = {
  get(k, d){ try{ const v = localStorage.getItem("gb."+k); return v===null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem("gb."+k, JSON.stringify(v)); return true; }catch(e){ return false; } },
  del(k){ try{ localStorage.removeItem("gb."+k); }catch(e){} }
};
function toast(t){ const el=$("#toast"); el.textContent=t; el.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>el.hidden=true,2200); }
async function copy(text, el){ try{ await navigator.clipboard.writeText(text); toast("Copied"); return true; }catch(e){ if(el){ if(el.select){ el.hidden=false; el.focus(); el.select(); } else { const r=document.createRange(); r.selectNodeContents(el); const s=getSelection(); s.removeAllRanges(); s.addRange(r); } } toast("Selected. Copy it from the menu."); return false; } }
function esc(s){ return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function dist(a,b,c,d){ const R=6371e3,t=Math.PI/180; const x=Math.sin((c-a)*t/2)**2+Math.cos(a*t)*Math.cos(c*t)*Math.sin((d-b)*t/2)**2; return 2*R*Math.asin(Math.sqrt(x)); }
function bearing(a,b,c,d){ const t=Math.PI/180; const y=Math.sin((d-b)*t)*Math.cos(c*t); const x=Math.cos(a*t)*Math.sin(c*t)-Math.sin(a*t)*Math.cos(c*t)*Math.cos((d-b)*t); return (Math.atan2(y,x)/t+360)%360; }
function fmtDist(m){ return m<1000 ? Math.round(m/10)*10+" m" : (m/1000).toFixed(m<10000?1:0)+" km"; }
const DIRS=["north","north-east","east","south-east","south","south-west","west","north-west"];
const dirName = b => DIRS[Math.round(b/45)%8];
const when = ts => { if(!ts) return ""; const d=new Date(ts); return d.toLocaleDateString("en-GB",{weekday:"short"})+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}); };
const rid = () => Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);
const gmaps = p => p.lat!=null ? `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name+" "+({golem:"Golem",durres:"Durrës",tirana:"Tirana",airport:"Tirana airport"}[p.area]))}`;

/* ================= identity ================= */
let myName = store.get("name","");
let nameResolve = null;
function ensureName(){
  if(myName) return Promise.resolve(myName);
  $("#nameIn").value=""; $("#nameSheet").hidden=false; setTimeout(()=>$("#nameIn").focus(),50);
  return new Promise(r=>nameResolve=r);
}
$("#nameSheet").addEventListener("submit",e=>{ e.preventDefault(); const n=$("#nameIn").value.trim().slice(0,24); if(!n){ $("#nameIn").focus(); return; }
  myName=n; store.set("name",n); $("#nameSheet").hidden=true; renderAll(); publishProfile(); if(nameResolve){ nameResolve(n); nameResolve=null; } });
$("#nameCancel").onclick=()=>{ $("#nameSheet").hidden=true; if(nameResolve){ nameResolve(null); nameResolve=null; } };

/* ================= crypto ================= */
const enc=new TextEncoder(), dec=new TextDecoder();
const SALT=enc.encode("golem-basecamp/2026-11/ledger-v1");
const b64=buf=>{ const u=new Uint8Array(buf); let s=""; for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s); };
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const HAS_CRYPTO = !!(window.crypto && crypto.subtle);
let KEY=null;
async function deriveKey(pass){ const base=await crypto.subtle.importKey("raw",enc.encode(pass.normalize("NFKC")),"PBKDF2",false,["deriveKey"]);
  return crypto.subtle.deriveKey({name:"PBKDF2",salt:SALT,iterations:310000,hash:"SHA-256"},base,{name:"AES-GCM",length:256},true,["encrypt","decrypt"]); }
async function seal(obj, ts){ const iv=crypto.getRandomValues(new Uint8Array(12)); const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},KEY,enc.encode(JSON.stringify(obj))); return {v:1,iv:b64(iv),ct:b64(ct),ts:ts||Date.now()}; }
async function unseal(doc, key){ try{ const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(doc.iv)},key||KEY,unb64(doc.ct)); return JSON.parse(dec.decode(pt)); }catch(e){ return null; } }
async function loadSavedKey(){ const raw=store.get("key",null); if(!raw||!HAS_CRYPTO) return; try{ KEY=await crypto.subtle.importKey("raw",unb64(raw),{name:"AES-GCM"},true,["encrypt","decrypt"]); }catch(e){ KEY=null; } }
async function saveKey(){ try{ store.set("key", b64(await crypto.subtle.exportKey("raw",KEY))); }catch(e){} }

/* ================= ledger ================= */
// Every phone holds the full encrypted ledger: { "messages/<id>": sealed, "pins/<id>": sealed, "meta/meetup": sealed, "meta/keycheck": sealed }.
// Merge rule: union by key, newer ts wins. Deletions are tombstones, so they travel too.
let LEDGER = store.get("ledger",{});
let OUTBOX = new Set(store.get("outbox",[]));
const serverTs = {};        // key -> ts the server has confirmed
let serverKeycheck; // undefined = not known yet, null = server has none
function saveLedger(){ if(!store.set("ledger",LEDGER)) toast("Phone storage is full. Old messages may not be kept."); store.set("outbox",[...OUTBOX]); }
function mergeDoc(key, doc){ if(!doc||typeof doc.ct!=="string"||typeof doc.iv!=="string") return false; const cur=LEDGER[key]; if(cur && (cur.ts||0) >= (doc.ts||0)) return false;
  LEDGER[key]={v:1,iv:doc.iv,ct:doc.ct,ts:doc.ts||0}; return true; }
async function writeLocal(key, obj){ const doc=await seal(obj); LEDGER[key]=doc; OUTBOX.add(key); saveLedger(); await rebuild(); flush(); return doc; }

/* decrypted view */
const S = { messages:[], pins:[], meetup:null, profiles:{} };
const plainCache = new Map(); // key -> {ts, obj}
async function rebuild(){
  if(!KEY){ S.messages=[]; S.pins=[]; H=D.home||null; S.meetup=homeMeet(); renderAll(); return; }
  const msgs=[], pins=[], profiles={}; let meet=null, home=null;
  for(const [key,doc] of Object.entries(LEDGER)){
    let c=plainCache.get(key); if(!c||c.ts!==doc.ts){ c={ts:doc.ts,obj:await unseal(doc)}; plainCache.set(key,c); }
    const o=c.obj; const [coll,id]=key.split("/");
    if(coll==="messages") msgs.push({key,id,ts:doc.ts,locked:!o,...(o||{})});
    else if(coll==="pins" && o && !o.deleted && !(o.exp && o.exp<Date.now())) pins.push({key,id,ts:doc.ts,...o});
    else if(key==="meta/home" && o && isFinite(o.lat)) home={...o,ts:doc.ts};
    else if(coll==="profiles" && o) profiles[id]={...o,ts:doc.ts};
    else if(key==="meta/meetup" && o && isFinite(o.lat)) meet={...o,ts:doc.ts};
  }
  msgs.sort((a,b)=>a.ts-b.ts); pins.sort((a,b)=>b.ts-a.ts);
  S.messages=msgs; S.pins=pins; S.profiles=profiles; H=home||D.home||null; S.meetup=meet||homeMeet();
  renderAll();
}

/* server sync (online page only) */
let db=null, flushing=false, subs=false;
function canSync(){ return RELAY ? relayOnline() : (MODE==="artifact" && db && navigator.onLine); }
async function flush(){
  if(RELAY){ if(relayOnline() && OUTBOX.size){ for(const key of [...OUTBOX]){ const doc=LEDGER[key]; if(doc) relayPub("d/"+key,{v:1,iv:doc.iv,ct:doc.ct,ts:doc.ts}); OUTBOX.delete(key); } store.set("outbox",[...OUTBOX]); }
    renderChatNote(); renderMessages(); return; }
  if(!canSync()||flushing||!OUTBOX.size) { renderChatNote(); return; }
  flushing=true;
  try{
    for(const key of [...OUTBOX]){
      const doc=LEDGER[key]; if(!doc){ OUTBOX.delete(key); continue; }
      if((serverTs[key]||0) >= doc.ts){ OUTBOX.delete(key); continue; }
      const [coll,id]=key.split("/");
      try{ await db.collection(coll).doc(id).set({v:1,iv:doc.iv,ct:doc.ct,ts:doc.ts}); serverTs[key]=doc.ts; OUTBOX.delete(key); }
      catch(e){ if(e&&e.code==="invalid_argument"){ readOnly=true; } break; }
    }
  } finally { flushing=false; store.set("outbox",[...OUTBOX]); renderChatNote(); renderMessages(); }
}
let readOnly=false;
function ingest(coll, docs){ let changed=false;
  for(const d of docs){ const data=d.data(); if(!data) continue; const key=coll+"/"+d.id; serverTs[key]=Math.max(serverTs[key]||0,data.ts||0);
    if(key==="meta/keycheck") continue;
    if(mergeDoc(key,data)) changed=true;
    if(LEDGER[key] && (serverTs[key]||0) < LEDGER[key].ts) OUTBOX.add(key); }
  // anything we hold that the server lacks goes back up: friends' messages we got hand to hand included
  if(changed) saveLedger(); return changed; }
async function startSync(){
  if(RELAY){ serverKeycheck=null; renderLock(); if(KEY && GID) relayConnect(); return; }
  if(MODE!=="artifact"||!window.claude){ serverKeycheck=null; renderLock(); return; }
  db = await claude.use("db");
  if(!db){ serverKeycheck=null; renderLock(); renderChatNote(); return; }
  try{ const kc=await db.doc("meta/keycheck").get(); serverKeycheck = kc.exists ? kc.data() : null; if(kc.exists) serverTs["meta/keycheck"]=kc.data().ts||0; }catch(e){ }
  renderLock();
  if(subs) return; subs=true;
  const loadTimer=setTimeout(()=>{ syncNote="Can't reach the server yet. Showing what's saved on this phone."; renderChatNote(); },10000);
  const onErr = e => { clearTimeout(loadTimer); syncNote="Live updates stopped ("+e.code+"). Reopen the app to reconnect; nothing is lost."; renderChatNote(); };
  db.collection("messages").orderBy("ts","desc").limit(300).onSnapshot(async snap=>{ if(!snap.metadata.fromCache){ clearTimeout(loadTimer); syncNote=""; }
    const ch=ingest("messages",snap.docs);
    if(!snap.metadata.fromCache){ const minTs = snap.size<300 ? 0 : Math.min(...snap.docs.map(d=>d.data().ts||0));
      for(const [k,d] of Object.entries(LEDGER)) if(k.startsWith("messages/") && !(k in serverTs) && d.ts>=minTs) OUTBOX.add(k); }
    if(ch) await rebuild(); flush(); }, onErr);
  db.collection("pins").onSnapshot(async snap=>{ const ch=ingest("pins",snap.docs); if(!snap.metadata.fromCache) for(const k of Object.keys(LEDGER)) if(k.startsWith("pins/") && !(k in serverTs)) OUTBOX.add(k); if(ch) await rebuild(); flush(); }, onErr);
  db.collection("profiles").onSnapshot(async snap=>{ const ch=ingest("profiles",snap.docs); if(!snap.metadata.fromCache) for(const k of Object.keys(LEDGER)) if(k.startsWith("profiles/") && !(k in serverTs)) OUTBOX.add(k); if(ch) await rebuild(); flush(); }, onErr);
  db.doc("meta/meetup").onSnapshot(async d=>{ if(d.exists){ const ch=ingest("meta",[d]); if(ch) await rebuild(); } else if(!d.metadata.fromCache && LEDGER["meta/meetup"]) OUTBOX.add("meta/meetup"); flush(); }, onErr);
  // keycheck lives in the ledger too, so a phone that never met the server can still verify the passphrase
  if(LEDGER["meta/keycheck"] && serverKeycheck===null){ OUTBOX.add("meta/keycheck"); }
  flush();
}
let syncNote="";

/* ================= relay sync (apps and website) =================
   Two free public MQTT relays carry the encrypted ledger. Every entry is a retained message on its own topic,
   so the relay remembers the latest copy of each one. When a phone (re)connects it receives everything it missed,
   then republishes anything it holds that the relay lacks: the group's ledger heals itself on every reconnect. */
const RELAY = MODE==="app" || MODE==="web";
const BROKERS = ["wss://broker.hivemq.com:8884/mqtt","wss://broker.emqx.io:8084/mqtt"];
let GID = store.get("gid",null), clients=[], relayKeycheck=null, rebuildT=null;
const DEVICE = store.get("device",null) || (()=>{ const d=rid(); store.set("device",d); return d; })();
async function groupId(pass){ const h=await crypto.subtle.digest("SHA-256",enc.encode("golem-basecamp/topic/"+pass.normalize("NFKC"))); return [...new Uint8Array(h)].slice(0,12).map(b=>b.toString(16).padStart(2,"0")).join(""); }
const T = () => "golembasecamp/v1/"+GID;
function relayOnline(){ return navigator.onLine && clients.some(c=>c.connected); }
let PENDING={}, PENDING_LOC={};   // encrypted entries heard before unlocking; merged once the passphrase checks out
function relayReset(){ for(const c of clients){ try{ c.end(true); }catch(e){} } clients=[]; renderChatNote(); }
function relayPub(sub, obj){ const s=obj==null?"":JSON.stringify(obj); let ok=false; for(const c of clients) if(c.connected){ c.publish(T()+"/"+sub, s, {qos:1,retain:true}); ok=true; } return ok; }
function relayConnect(){
  if(!RELAY||!GID||clients.length) return;
  if(typeof mqtt==="undefined"){ syncNote="The relay library didn't load."; renderChatNote(); return; }
  for(const url of (window.GB_BROKERS||BROKERS)){
    const c=mqtt.connect(url,{clientId:"gb"+DEVICE.replace(/[^a-z0-9]/g,"").slice(-10)+Math.random().toString(36).slice(2,6),keepalive:30,reconnectPeriod:5000,connectTimeout:12000,clean:true,protocolVersion:4});
    c._seen={};
    c.on("connect",()=>{ c._seen={}; c.subscribe([T()+"/d/#",T()+"/loc/+"],{qos:1},()=>{ c._subAt=Date.now(); clearTimeout(c._ae); c._ae=setTimeout(()=>antiEntropy(c),3500); }); renderChatNote(); if(SHARE.on) SHARE.last=0; });
    c.on("close",()=>renderChatNote());
    c.on("error",()=>{});
    c.on("message",(topic,payload)=>onRelay(c,topic,payload));
    clients.push(c);
  }
  renderChatNote();
}
function antiEntropy(c){ if(!c.connected) return;
  for(const [key,doc] of Object.entries(LEDGER)) if((c._seen[key]||0) < doc.ts) c.publish(T()+"/d/"+key, JSON.stringify({v:1,iv:doc.iv,ct:doc.ct,ts:doc.ts}), {qos:1,retain:true});
  OUTBOX.clear(); store.set("outbox",[]); renderChatNote(); renderMessages();
  if(SHARE.on && SHARE.lastPub) relayPub("loc/"+DEVICE, SHARE.lastPub);
}
function onRelay(c, topic, payload){
  const rest=topic.slice(T().length+1); const txt=payload && payload.length ? new TextDecoder().decode(payload) : "";
  if(rest.startsWith("loc/")){ onPeer(rest.slice(4), txt); return; }
  if(!rest.startsWith("d/") || !txt) return;
  const key=rest.slice(2); if(!/^(messages|pins|meta|profiles)\/[A-Za-z0-9._:-]{1,60}$/.test(key)) return;
  let doc; try{ doc=JSON.parse(txt); }catch(e){ return; }
  c._seen[key]=Math.max(c._seen[key]||0, doc.ts||0);
  if(key==="meta/keycheck"){ relayKeycheck=relayKeycheck && relayKeycheck.ts<=doc.ts ? relayKeycheck : doc; if(!LEDGER[key] && KEY){ LEDGER[key]=doc; saveLedger(); } return; }
  if(!KEY){ if(!PENDING[key] || PENDING[key].ts<doc.ts) PENDING[key]=doc; return; }
  if(mergeDoc(key,doc)){ saveLedger(); clearTimeout(rebuildT); rebuildT=setTimeout(rebuild,120); }
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function peekKeycheck(gid, ms){ relayReset(); GID=gid; relayKeycheck=null; PENDING={}; PENDING_LOC={}; relayConnect();
  const t0=Date.now(); while(Date.now()-t0<ms){ if(relayKeycheck) return relayKeycheck; if(clients.some(c=>c._subAt && Date.now()-c._subAt>2500)) break; if(!relayOnline() && Date.now()-t0>ms*0.7) break; await sleep(150); }
  return relayKeycheck; }


/* ================= live location sharing (apps and website) =================
   Off by default. When on, your encrypted position goes to the group every ~20 s while the app is open.
   Leaving Albania for more than an hour turns it off; turning it on outside Albania asks first. */
const SHARE = { on:false, watch:null, last:0, lastPos:null, lastPub:null, outsideSince:store.get("outsideSince",null), override:store.get("shareOverride",false), note:"" };
const PEERS = {};   // device -> {name, lat, lon, acc, ts}
const OUTSIDE_LIMIT = 60*60*1000;
/* In the apps, sharing keeps running with the screen off: the background-geolocation plugin keeps delivering positions,
   and each one goes out through the phone's own networking (not the web view, which Android throttles in the background)
   to ntfy.sh, a free public relay that takes plain HTTP posts. Payloads are sealed with the group key like everything else. */
const NATIVE = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
const BGGEO = NATIVE && Capacitor.registerPlugin ? Capacitor.registerPlugin("BackgroundGeolocation") : null;
const LNOTIF = NATIVE && Capacitor.registerPlugin ? Capacitor.registerPlugin("LocalNotifications") : null;
const NTFY = "https://ntfy.sh/";
const ntfyTopic = () => "meetupapp-"+GID+"-loc";
const PEER_OFF = {};   // device -> time we learnt it stopped sharing
async function ntfyPost(obj){ if(!RELAY||!GID) return false; const url=NTFY+ntfyTopic(), body=JSON.stringify(obj);
  try{ const H=NATIVE && Capacitor.Plugins && Capacitor.Plugins.CapacitorHttp;
    if(H){ const r=await H.request({method:"POST",url,data:body,headers:{"Content-Type":"text/plain"}}); return r.status<300; }
    const r=await fetch(url,{method:"POST",body,keepalive:true}); return r.ok; }catch(e){ return false; } }
let ntfyBusy=false;
async function ntfyPoll(){ if(!RELAY||!GID||!KEY||ntfyBusy||document.hidden||!navigator.onLine) return; ntfyBusy=true;
  try{ const r=await fetch(NTFY+ntfyTopic()+"/json?poll=1&since=12h"); if(!r.ok) return; const lines=(await r.text()).trim().split("\n");
    for(const ln of lines){ let m; try{ m=JSON.parse(ln); }catch(e){ continue; } if(m.event!=="message"||!m.message) continue;
      let o; try{ o=JSON.parse(m.message); }catch(e){ continue; } if(!o||typeof o.d!=="string"||o.d===DEVICE) continue;
      if(o.off){ if(!PEER_OFF[o.d]||PEER_OFF[o.d]<o.ts) PEER_OFF[o.d]=o.ts; if(PEERS[o.d] && PEERS[o.d].ts<=o.ts){ delete PEERS[o.d]; } continue; }
      if(o.doc) await onPeer(o.d, JSON.stringify(o.doc)); }
    renderPeers(); } catch(e){} finally{ ntfyBusy=false; } }
setInterval(ntfyPoll, 30000);
document.addEventListener("visibilitychange",()=>{ if(!document.hidden){ ntfyPoll(); if(SHARE.on) SHARE.last=0; } });
let peerLayer=null, peerMarkers={};
function inPoly(la,lo,ring){ let ins=false; for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const [ai,bi]=ring[i],[aj,bj]=ring[j]; if(((bi>lo)!==(bj>lo)) && (la < (aj-ai)*(lo-bi)/(bj-bi)+ai)) ins=!ins; } return ins; }
let ALB=null;
async function inAlbania(la,lo){ if(!ALB){ const g=await loadCountry(); if(!g) return true; ALB=g.bd.map(decodeLine); } return ALB.some(r=>inPoly(la,lo,r)); }
function askConfirm(title, body, ok){ return new Promise(res=>{ const sh=$("#confirmSheet"); $("#cfTitle").textContent=title; $("#cfBody").textContent=body; $("#cfOk").textContent=ok; sh.hidden=false; $("#cfOk").focus();
  const done=v=>{ sh.hidden=true; $("#cfOk").onclick=$("#cfCancel").onclick=null; res(v); }; $("#cfOk").onclick=()=>done(true); $("#cfCancel").onclick=()=>done(false); }); }
async function stopWatch(){ const w=SHARE.watch; SHARE.watch=null; if(w==null) return;
  if(typeof w==="object" && w.bg!=null){ try{ await BGGEO.removeWatcher({id:w.bg}); }catch(e){} } else navigator.geolocation.clearWatch(w); }
async function setShare(on, silent){
  if(on){
    if(!RELAY) return;
    if(!await needUnlock("Unlock the group first. Your location is encrypted with the group passphrase.")) return;
    if(!await ensureName()) return;
    if(!navigator.geolocation){ SHARE.note="This phone can't share its location."; renderShare(); return; }
    SHARE.on=true; store.set("share",true); SHARE.note="Getting your position…"; SHARE.last=0; renderShare();
    await stopWatch();
    if(BGGEO){
      try{ if(LNOTIF){ const st=await LNOTIF.checkPermissions(); if(st.display!=="granted") await LNOTIF.requestPermissions(); } }catch(e){}
      try{ SHARE.watch={bg:await BGGEO.addWatcher({backgroundTitle:"Sharing your location",backgroundMessage:"Your dot is visible to the group. Turn it off in the app.",requestPermissions:true,stale:false,distanceFilter:10},
        (loc,err)=>{ if(err){ SHARE.note = err.code==="NOT_AUTHORIZED" ? "Location permission is off. Allow it in the phone's settings for this app, ideally \"Always\"." : "Waiting for GPS…"; renderShare(); return; }
          if(loc) onSharePos({coords:{latitude:loc.latitude,longitude:loc.longitude,accuracy:loc.accuracy||0}}); })}; }
      catch(e){ SHARE.note="Couldn't start location sharing on this phone."; renderShare(); }
      return;
    }
    SHARE.watch=navigator.geolocation.watchPosition(onSharePos, err=>{ SHARE.note = err.code===1 ? "Location permission is off. Allow it in the phone's settings for this app." : "Waiting for GPS…"; renderShare(); }, {enableHighAccuracy:true,maximumAge:10000,timeout:30000});
  } else {
    SHARE.on=false; store.set("share",false); await stopWatch();
    SHARE.lastPub=null; relayPub("loc/"+DEVICE, null);   // empty retained message removes your dot for everyone
    ntfyPost({d:DEVICE,off:true,ts:Date.now()});
    if(!silent) SHARE.note="Your dot is hidden from the group."; renderShare();
  }
}
let confirming=false;
async function onSharePos(p){
  if(!SHARE.on) return;
  const la=p.coords.latitude, lo=p.coords.longitude, now=Date.now(); SHARE.lastPos={lat:la,lon:lo,acc:p.coords.accuracy};
  lastPos={lat:la,lon:lo,acc:p.coords.accuracy}; paintArrow(); updateMe();
  const inside=await inAlbania(la,lo);
  if(inside){ SHARE.outsideSince=null; SHARE.override=false; store.set("outsideSince",null); store.set("shareOverride",false); }
  else if(!SHARE.override){
    if(SHARE.last===0 && !SHARE.lastPub){ // switching on while abroad: ask before anything is sent
      if(confirming) return; confirming=true;
      const ok=await askConfirm("Share your location outside Albania?","You are about to activate location sharing outside of Albania, which would show your location to the other group members.","Share my location"); confirming=false;
      if(!ok){ await setShare(false,true); SHARE.note="Location sharing stays off while you're outside Albania."; renderShare(); return; }
      SHARE.override=true; store.set("shareOverride",true);
    } else {
      if(!SHARE.outsideSince){ SHARE.outsideSince=now; store.set("outsideSince",now); }
      if(now-SHARE.outsideSince > OUTSIDE_LIMIT){ expireShare(); return; }
    }
  }
  const moved = SHARE.lastPub ? dist(SHARE.lastPub._la||0,SHARE.lastPub._lo||0,la,lo) : 1e9;
  if(now-SHARE.last > (document.hidden?300000:60000) || (now-SHARE.last > 15000 && moved > 15)){
    const doc=await seal({name:myName,lat:+la.toFixed(5),lon:+lo.toFixed(5),acc:Math.round(p.coords.accuracy),ts:now});
    SHARE.lastPub=doc; Object.defineProperty(doc,"_la",{value:la,enumerable:false}); Object.defineProperty(doc,"_lo",{value:lo,enumerable:false});
    SHARE.last=now; relayPub("loc/"+DEVICE, doc); ntfyPost({d:DEVICE,doc:{v:1,iv:doc.iv,ct:doc.ct,ts:doc.ts}});
    SHARE.note = relayOnline() ? "" : "No signal. Your dot updates when you're back online.";
  }
  renderShare();
}
function expireShare(){ SHARE.outsideSince=null; store.set("outsideSince",null); setShare(false,true); SHARE.note="Location sharing turned off: you've been outside Albania for over an hour. Turn it on again if you want the group to see you."; renderShare(); toast("Location sharing turned off"); }
setInterval(()=>{ if(S.pins.some(p=>p.exp && p.exp<Date.now())) rebuild(); if(SHARE.on && !SHARE.override && SHARE.outsideSince && Date.now()-SHARE.outsideSince > OUTSIDE_LIMIT) expireShare(); renderPeers(); }, 60000);
async function onPeer(dev, txt){
  if(dev===DEVICE) return;
  if(!txt){ delete PEERS[dev]; delete PENDING_LOC[dev]; PEER_OFF[dev]=Date.now(); renderPeers(); return; }
  let doc; try{ doc=JSON.parse(txt); }catch(e){ return; } if(!KEY){ PENDING_LOC[dev]=txt; return; }
  const o=await unseal(doc); if(!o||!isFinite(o.lat)) return;
  if(PEERS[dev] && PEERS[dev].ts>=o.ts) return;
  if(PEER_OFF[dev] && PEER_OFF[dev]>=(o.ts||doc.ts)) return;
  PEERS[dev]={name:String(o.name||"?").slice(0,24),lat:o.lat,lon:o.lon,acc:o.acc||0,ts:o.ts||doc.ts}; renderPeers();
}
const ago = ts => { const m=Math.round((Date.now()-ts)/60000); return m<1?"just now":m<60?m+" min ago":Math.round(m/60)+" h ago"; };
function peerColor(name){ let h=0; for(const ch of name) h=(h*31+ch.charCodeAt(0))>>>0; return `hsl(${h%360} 70% 45%)`; }
function livePeers(){ return Object.entries(PEERS).filter(([,p])=>Date.now()-p.ts < 7*24*3600e3).sort((a,b)=>a[1].name.localeCompare(b[1].name)); }
function renderPeers(){
  const list=$("#peerList"); if(list){ const ps=livePeers();
    list.innerHTML = ps.length ? ps.map(([d,p])=>{ const from = lastPos ? fmtDist(dist(lastPos.lat,lastPos.lon,p.lat,p.lon))+" from you" : (H ? fmtDist(dist(H.lat,H.lon,p.lat,p.lon))+" from home" : "");
      return `<button type="button" class="peer" data-peer="${esc(d)}"><i style="background:${peerColor(p.name)}"></i><b>${esc(p.name)}</b><span>${from} · ${ago(p.ts)}</span></button>`; }).join("")
      : `<p class="small muted">Nobody else is sharing right now.</p>`;
    list.querySelectorAll("[data-peer]").forEach(b=>b.onclick=()=>{ const p=PEERS[b.dataset.peer]; if(!p) return; location.hash="#map"; setTimeout(()=>{ initMap(); map?.setView([p.lat,p.lon],16); },80); }); }
  if(!map||!peerLayer) return;
  const live=new Set();
  for(const [d,p] of livePeers()){ live.add(d); const stale=Date.now()-p.ts>30*60000; const label=esc(p.name)+(stale?` · ${ago(p.ts)}`:"");
    let m=peerMarkers[d];
    if(!m){ m=L.circleMarker([p.lat,p.lon],{radius:9,color:"#fff",weight:3,fillColor:peerColor(p.name),fillOpacity:1}).bindTooltip(label,{permanent:true,direction:"top",offset:[0,-10],className:"peerlabel"}); m.addTo(peerLayer); peerMarkers[d]=m; }
    else { m.setLatLng([p.lat,p.lon]); m.setTooltipContent(label); }
    m.setStyle({fillOpacity:stale?.45:1,opacity:stale?.6:1}); }
  for(const d of Object.keys(peerMarkers)) if(!live.has(d)){ peerLayer.removeLayer(peerMarkers[d]); delete peerMarkers[d]; }
}
function renderShare(){
  const sw=$("#shareSw"); if(!sw) return;
  $("#sharePanel").hidden=!RELAY;
  sw.setAttribute("aria-checked",String(SHARE.on));
  $("#shareHow").textContent = BGGEO ? "Only people with the group passphrase can see it. It keeps sharing when the app is closed or the phone is locked, until you turn it off; Android shows a notification while it's on. It also turns off by itself after an hour outside Albania."
    : "Only people with the group passphrase can see it. On the website it only updates while this page is open; the Android and iPhone apps keep sharing in the background. It turns off by itself after an hour outside Albania.";
  let st = SHARE.on ? (SHARE.lastPub ? `The group sees your dot as ${myName||"you"}. Updated ${ago(SHARE.last)}.`+(BGGEO?" It keeps updating with the app closed until you turn it off.":"") : (SHARE.note||"Getting your position…")) : (SHARE.note||"Off. Nobody can see where you are.");
  if(SHARE.on && SHARE.override) st+=" You're outside Albania and chose to keep sharing.";
  else if(SHARE.on && SHARE.lastPub && SHARE.outsideSince) st+=` You're outside Albania, so sharing turns off in ${Math.max(1,Math.round((SHARE.outsideSince+OUTSIDE_LIMIT-Date.now())/60000))} min.`;
  $("#shareStatus").textContent=st;
  const ms=$("#mapShareSw"); if(ms){ ms.hidden=!RELAY; ms.setAttribute("aria-pressed",String(SHARE.on)); ms.lastChild.textContent = SHARE.on ? "Sharing" : "Share location"; }
  renderPeers();
}

/* ================= unlock ================= */
async function knownKeycheck(){ return LEDGER["meta/keycheck"] || serverKeycheck || null; }
function renderLock(){
  const locked=!KEY; $("#lockPanel").hidden=!locked; $("#lockLine").hidden=locked;
  $("#chatForm").hidden=locked; $("#quick").hidden=locked;
  if(locked){ const needNew = RELAY ? relayNeedNew : (!LEDGER["meta/keycheck"] && serverKeycheck===null); $("#pass2Wrap").hidden=!needNew;
    if(!HAS_CRYPTO){ $("#lockErr").textContent="This browser can't encrypt. Open the app in Chrome or Safari."; $("#unlockBtn").disabled=true; } }
}
$("#showPass").onclick=()=>{ const t=$("#passIn").type==="password"?"text":"password"; $("#passIn").type=t; $("#pass2In").type=t; $("#showPass").textContent=t==="password"?"Show":"Hide"; };
$("#lockPanel").addEventListener("submit",async e=>{ e.preventDefault();
  const p=$("#passIn").value; const err=$("#lockErr"); err.textContent="";
  if(p.length<8){ err.textContent="Use at least 8 characters."; return; }
  if(!RELAY && serverKeycheck===undefined && !LEDGER["meta/keycheck"]){ err.textContent="Still connecting to the group. Try again in a few seconds."; return; }
  $("#unlockBtn").disabled=true; $("#unlockBtn").textContent="Unlocking…";
  try{
    if(RELAY){ await unlockRelay(p, err); return; }
    const k=await deriveKey(p); const kc=await knownKeycheck();
    if(kc){ const ok=await unseal(kc,k); if(!ok||ok.check!=="golem-basecamp"){ err.textContent="That passphrase doesn't match the group's. Check spelling and capitals."; return; } KEY=k; if(!LEDGER["meta/keycheck"]){ LEDGER["meta/keycheck"]=kc; saveLedger(); } }
    else { if($("#pass2In").value!==p){ $("#pass2Wrap").hidden=false; err.textContent="Type the same passphrase in both boxes to set it."; return; }
      KEY=k; LEDGER["meta/keycheck"]=await seal({check:"golem-basecamp"}); OUTBOX.add("meta/keycheck"); saveLedger(); }
    await saveKey(); $("#passIn").value=""; $("#pass2In").value=""; renderLock(); await rebuild(); flush(); toast("Unlocked");
    if(!myName) await ensureName(); else if(!S.profiles[DEVICE]) publishProfile();
  } finally { $("#unlockBtn").disabled=false; $("#unlockBtn").textContent="Unlock"; }
});
let relayNeedNew=false;
async function unlockRelay(p, err){
  const gid=await groupId(p), k=await deriveKey(p); const sameGroup = store.get("gid",null)===gid;
  let kc = sameGroup ? LEDGER["meta/keycheck"] : null;
  const confirming2 = relayNeedNew && $("#pass2In").value===p && GID===gid;
  if(!kc && navigator.onLine && !confirming2){ $("#unlockBtn").textContent="Looking for your group…"; kc=await peekKeycheck(gid, 8000); }
  if(!kc && confirming2) kc=relayKeycheck;
  if(kc){ const ok=await unseal(kc,k); if(!ok||ok.check!=="golem-basecamp"){ err.textContent="That passphrase doesn't match the group's. Check spelling and capitals."; return; } }
  else if($("#pass2In").value!==p){ relayNeedNew=true; $("#pass2Wrap").hidden=false;
    $("#pass2Wrap label").textContent = navigator.onLine && relayOnline() ? "Nobody has used this passphrase yet. Type it again to start the group, or check the spelling if your friends already set one." : "You're offline, so the app can't check whether this group exists. Type the passphrase again to continue.";
    err.textContent=""; $("#pass2In").focus(); return; }
  if(!sameGroup){ LEDGER={}; OUTBOX=new Set(); plainCache.clear(); for(const k2 of Object.keys(PEERS)) delete PEERS[k2]; }
  KEY=k; GID=gid; store.set("gid",gid); relayNeedNew=false;
  if(kc){ LEDGER["meta/keycheck"]=kc; } else { LEDGER["meta/keycheck"]=await seal({check:"golem-basecamp"}); OUTBOX.add("meta/keycheck"); }
  for(const [k2,d] of Object.entries(PENDING)) mergeDoc(k2,d); PENDING={};
  saveLedger(); await saveKey(); $("#passIn").value=""; $("#pass2In").value=""; renderLock();
  for(const [dv,tx] of Object.entries(PENDING_LOC)) onPeer(dv,tx); PENDING_LOC={};
  if(!relayOnline()) { relayReset(); relayConnect(); } else { for(const c of clients) antiEntropy(c); }
  await rebuild(); flush(); ntfyPoll(); toast("Unlocked"); if(!myName) await ensureName(); else if(!S.profiles[DEVICE]) publishProfile(); renderShare();
}
$("#forgetKey").onclick=async()=>{ if(SHARE.on) await setShare(false,true); KEY=null; store.del("key"); plainCache.clear(); renderLock(); await rebuild(); toast("Locked. Messages stay saved, encrypted."); };
async function needUnlock(why){ if(KEY) return true; location.hash="#chat"; setTimeout(()=>{ $("#lockErr").textContent=why; $("#passIn").focus(); },120); return false; }

/* ================= network badge ================= */
function net(){ const on=navigator.onLine; $("#net").textContent= on ? "online" : "offline"; }
addEventListener("online",()=>{ net(); flush(); renderChatNote(); });
addEventListener("offline",()=>{ net(); renderChatNote(); });
net();

/* ================= routing ================= */
const VIEWS=["home","map","places","info","chat"];
function route(){
  let v=(location.hash||"#home").slice(1); if(!VIEWS.includes(v)) v="home";
  VIEWS.forEach(x=>$("#v-"+x).hidden = x!==v);
  $$(".tabs a").forEach(a=>a.setAttribute("aria-current", a.getAttribute("href")==="#"+v ? "page":"false"));
  if(v==="map") initMap();
  if(v==="chat"){ renderLock(); renderMessages(true); }
  scrollTo(0,0);
}
addEventListener("hashchange",route);

/* ================= home ================= */
function homeMeet(){ return H ? {label:"Our place", lat:H.lat, lon:H.lon, by:null, ts:0, home:true} : null; }
function plusCode(lat,lng){ // Open Location Code, 11 digits, integer maths as in the reference implementation
  const A="23456789CFGHJMPQRVWX"; lat=Math.min(Math.max(lat,-90),90); lng=((lng+180)%360+360)%360-180;
  let la=Math.floor(Math.round((lat+90)*40000*1e6)/1e6), lo=Math.floor(Math.round((lng+180)*32000*1e6)/1e6); if(la>=180*40000) la=180*40000-1;
  let code=A[(la%5)*4+(lo%4)]; la=Math.floor(la/5); lo=Math.floor(lo/4);
  for(let i=0;i<5;i++){ code=A[la%20]+A[lo%20]+code; la=Math.floor(la/20); lo=Math.floor(lo/20); }
  return code.slice(0,8)+"+"+code.slice(8); }
function taxiLines(){ if(!H) return null; const sq=`Ju lutem, më çoni në ${H.address}.`+(H.sq?" "+H.sq:""), en=`Please take me to ${H.address}.`+(H.en?" "+H.en:""); return {sq,en}; }
function renderHome(){
  const has=!!H; $("#taxiCard").hidden=!has; $("#homeEmpty").hidden=has||!$("#homeForm").hidden;
  if(!has){ $("#homeUnlock").hidden=!!KEY; $("#homeEmptyText").textContent = KEY ? "Nobody has set it yet. One person adds it once and it syncs to everyone, encrypted." : "The address isn't stored in the app itself, so it stays private. Unlock the group with your passphrase and it loads from the group, encrypted."; return; }
  const t=taxiLines(), pc=plusCode(H.lat,H.lon);
  $("#taxiSq").textContent=t.sq; $("#taxiEn").textContent=t.en;
  $("#plus").textContent=pc.slice(4); $("#coords").textContent=H.lat.toFixed(6)+", "+H.lon.toFixed(6);
  $("#gmapsHome").href=`https://www.google.com/maps/search/?api=1&query=${H.lat},${H.lon}`;
  $("#homeBy").textContent = "Show this card to a taxi driver." + (H.by ? ` Set by ${H.by}.` : "");
  $("#homeEdit").hidden = !(RELAY||MODE==="artifact"||MODE==="file") || !KEY;
}
$("#copyAddr").onclick=()=>{ if(H) copy(`${H.address}, Albania (plus code ${plusCode(H.lat,H.lon)}; ${H.lat}, ${H.lon})`,$("#taxiSq")); };
$("#copyLL").onclick=()=>{ if(H) copy(`${H.lat}, ${H.lon}`,$("#coords")); };
function showBig(big, sub, code){ $("#ovBig").textContent=big; $("#ovSub").textContent=sub||""; $("#ovCode").textContent=code||""; $("#overlay").hidden=false;
  try{ navigator.wakeLock?.request("screen").then(l=>showBig._l=l).catch(()=>{}); }catch(e){} }
$("#bigBtn").onclick=()=>{ if(!H) return; showBig(H.address, [H.sq,H.en].filter(Boolean).join(" · "), `${plusCode(H.lat,H.lon)} · ${H.lat}, ${H.lon}`); };
/* setting where we're staying */
let homeDraft=null;
function parseLL(t){ t=String(t||""); const m=t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)||t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)||t.match(/(-?\d{1,2}\.\d{3,})\s*[,;\s]\s*(-?\d{1,3}\.\d{3,})/);
  if(!m) return null; const la=+m[1], lo=+m[2]; return (Math.abs(la)<=90&&Math.abs(lo)<=180)?{lat:la,lon:lo}:null; }
function openHomeForm(){ $("#homeForm").hidden=false; $("#homeEmpty").hidden=true; $("#hErr").textContent="";
  $("#hAddr").value=H?.address||""; $("#hSq").value=H?.sq||""; $("#hEn").value=H?.en||""; $("#hLL").value=H?`${H.lat}, ${H.lon}`:""; $("#hLLnote").textContent=""; location.hash="#home"; setTimeout(()=>$("#hAddr").focus(),60); }
$("#homeSet").onclick=async()=>{ if(!await needUnlock("Unlock the group first, then set where you're staying.")) return; openHomeForm(); };
$("#homeUnlock").onclick=()=>needUnlock("Type the group passphrase to load where you're staying.");
$("#homeEdit").onclick=()=>openHomeForm();
$("#hCancel").onclick=()=>{ $("#homeForm").hidden=true; renderHome(); };
$("#hPick").onclick=()=>{ location.hash="#map"; setTimeout(()=>startPick("home"),120); };
$("#hLL").addEventListener("input",()=>{ const ll=parseLL($("#hLL").value); $("#hLLnote").textContent = ll ? `Plus code ${plusCode(ll.lat,ll.lon)}` : ""; });
$("#homeForm").addEventListener("submit",async e=>{ e.preventDefault(); const addr=$("#hAddr").value.trim(), ll=parseLL($("#hLL").value);
  if(!addr){ $("#hAddr").focus(); return; } if(!ll){ $("#hErr").textContent="Add the location: paste coordinates like 41.3275, 19.8187, a Google Maps link, or pick it on the map."; return; }
  if(!await needUnlock("Unlock the group first, then set where you're staying.")) return; const n=await ensureName(); if(!n) return;
  await writeLocal("meta/home",{address:addr.slice(0,120),sq:$("#hSq").value.trim().slice(0,200),en:$("#hEn").value.trim().slice(0,200),lat:+ll.lat.toFixed(6),lon:+ll.lon.toFixed(6),by:n});
  $("#homeForm").hidden=true; renderHome(); toast("Saved for the group"); });
$("#ovClose").onclick=()=>{ $("#overlay").hidden=true; try{showBig._l?.release();}catch(e){} };
addEventListener("keydown",e=>{ if(e.key==="Escape" && !$("#overlay").hidden) $("#ovClose").click(); });
const notes=$("#notes"); notes.value=store.get("notes",""); notes.addEventListener("input",()=>store.set("notes",notes.value));
let CHECKS=store.get("checklist",[]); if(!Array.isArray(CHECKS)) CHECKS=[];
function renderChecks(){ const el=$("#checklist");
  el.innerHTML = CHECKS.length ? CHECKS.map((c,i)=>`<div class="checkitem"><label class="check" for="ck${i}"><input type="checkbox" id="ck${i}" ${c.done?"checked":""}><span>${esc(c.t)}</span></label><button type="button" data-delck="${i}" aria-label="Remove ${esc(c.t)}"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>`).join("")
    : `<p class="small muted">Nothing on the list yet.</p>`;
  CHECKS.forEach((c,i)=>{ $("#ck"+i).onchange=e=>{ c.done=e.target.checked; store.set("checklist",CHECKS); }; });
  el.querySelectorAll("[data-delck]").forEach(b=>b.onclick=()=>{ CHECKS.splice(+b.dataset.delck,1); store.set("checklist",CHECKS); renderChecks(); }); }
$("#checkForm").addEventListener("submit",e=>{ e.preventDefault(); const v=$("#checkIn").value.trim(); if(!v) return; CHECKS.push({t:v.slice(0,120),done:false}); store.set("checklist",CHECKS); $("#checkIn").value=""; renderChecks(); $("#checkIn").focus(); });
renderChecks();

/* meeting point panel */
function renderMeet(){
  const m=S.meetup; $("#meetCard").hidden=!m;
  if(!m){ $("#meetShare").textContent = KEY ? "Not set yet. Pick a spot so everyone knows where to regroup." : "Unlock the group to see the meeting point."; if(map) drawMeet(); return; }
  $("#meetLabel").textContent=m.label;
  const d=H?dist(H.lat,H.lon,m.lat,m.lon):null;
  $("#meetBy").textContent = (m.home ? "Default: where we're staying" : (m.by ? `Set by ${m.by} · ${when(m.ts)}` : "")) + (d!=null && !m.home ? ` · ${d<40?"at our place":fmtDist(d)+" from our place"}` : "");
  $("#meetShare").textContent = !KEY ? "Unlock the group in Chat to change it for everyone." : (MODE==="file" ? "Changes are saved in your ledger. Share the ledger (Chat tab) so the others get them." : (OUTBOX.has("meta/meetup") ? "Waiting for signal to share the change." : ""));
  if(map) drawMeet();
}
$("#meetCard").onclick=()=>{ if(!S.meetup) return; location.hash="#map"; setTimeout(()=>{ initMap(); if(map){ map.setView([S.meetup.lat,S.meetup.lon],17); meetMarker?.openPopup(); } },80); };
$("#meetEdit").onclick=()=>{ const o=$("#meetOpts"); o.hidden=!o.hidden; $("#meetEdit").setAttribute("aria-expanded",String(!o.hidden)); };
$("#meetPick").onclick=async()=>{ if(!await needUnlock("Unlock the group first, then set the meeting point.")) return; location.hash="#map"; setTimeout(()=>startPick("meet"),120); };
$("#meetReset").onclick=()=>{ if(!H){ toast("Set where you're staying first"); return; } setMeetup({label:"Our place",lat:H.lat,lon:H.lon}); };
$("#meetHere").onclick=()=>{ if(!navigator.geolocation){ toast("Location isn't available here"); return; }
  toast("Getting your position…");
  navigator.geolocation.getCurrentPosition(p=>{ openPinForm({lat:p.coords.latitude,lng:p.coords.longitude},"meet"); location.hash="#map"; },
    ()=>toast(MODE==="artifact" ? "Location is blocked in the online page. Pick the spot on the map instead." : "Couldn't get your location. Pick the spot on the map instead."),
    {enableHighAccuracy:true,timeout:15000}); };
async function setMeetup(m){
  if(!await needUnlock("Unlock the group first, then set the meeting point.")) return false;
  const n=await ensureName(); if(!n) return false;
  await writeLocal("meta/meetup",{label:m.label.slice(0,60),lat:+(+m.lat).toFixed(6),lon:+(+m.lon).toFixed(6),by:n});
  $("#meetOpts").hidden=true; $("#meetEdit").setAttribute("aria-expanded","false");
  toast("Meeting point set"); return true;
}

/* compass */
let watchId=null, heading=null, lastPos=null, target="home";
const tgt = () => target==="home" ? (H?{lat:H.lat,lon:H.lon,label:"Home"}:null) : (S.meetup?{lat:S.meetup.lat,lon:S.meetup.lon,label:"The meeting point"}:null);
$$("[data-target]").forEach(b=>b.onclick=()=>{ target=b.dataset.target; $$("[data-target]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  $("#wayTitle").textContent = target==="home" ? "Which way is home?" : "Which way to meet?"; paintArrow(); updateMe(); });
// The dial has two modes. With a compass reading it is "heading-up": the notch at the top is the way the phone points,
// the arrow turns to the destination and the N travels round the rim to wherever north really is.
// Without one it is "north-up": the N sits at the top and the arrow is the bearing from north.
let rotArrow=0, rotRim=0;
const norm = d => ((d%360)+540)%360-180;                       // -> (-180, 180]
const turnTo = (cur, want) => cur + norm(want - cur);          // shortest way round, so 359 -> 1 doesn't spin
function paintArrow(){
  const T=tgt(), dial=$("#dial");
  if(!T){ $("#dist").textContent="—"; $("#distNote").textContent = target==="home" ? "Unlock the group to load where you're staying." : "No meeting point set yet."; return; }
  if(!lastPos){ $("#dist").textContent="—"; return; }
  const b=bearing(lastPos.lat,lastPos.lon,T.lat,T.lon), m=dist(lastPos.lat,lastPos.lon,T.lat,T.lon);
  const hasHeading = heading!=null, rel = hasHeading ? norm(b-heading) : b;
  rotArrow=turnTo(rotArrow, rel); rotRim=turnTo(rotRim, hasHeading ? -heading : 0);
  $("#arrow").style.transform=`rotate(${rotArrow}deg)`; $("#rim").style.transform=`rotate(${rotRim}deg)`;
  dial.classList.toggle("heading",hasHeading);
  let cue="";
  if(m<40) cue = target==="home" ? "You're home" : "You're here";
  else if(hasHeading){ const r=Math.abs(rel); cue = r<=20 ? "Straight ahead" : r>=150 ? "Behind you" : rel>0 ? (r<60?"Bear right":"Turn right") : (r<60?"Bear left":"Turn left"); }
  else cue = "To the "+dirName(b);
  const onTrack = m<40 || (hasHeading && Math.abs(rel)<=20);
  dial.classList.toggle("ontrack",onTrack);
  $("#arrowPath").setAttribute("fill", onTrack ? "var(--green)" : "var(--red)");
  $("#dist").innerHTML = esc(fmtDist(m))+`<small>${esc(cue)}</small>`;
  $("#distNote").textContent = m<40 ? "" : hasHeading
    ? `Hold the phone flat and turn until the arrow points at the notch on top, then walk that way. The N shows where north is.`
    : `${T.label} is to the ${dirName(b)}. This phone gives no compass reading, so the top of the dial is north (N), not the way you're facing.`;
}
function onOrient(e){ let h = e.webkitCompassHeading ?? (e.absolute && e.alpha!=null ? 360-e.alpha : null); if(h==null) return;
  const so=(screen.orientation && screen.orientation.angle) || window.orientation || 0; heading=(h+so+360)%360; paintArrow(); }
$("#findBtn").onclick=async()=>{
  try{ if(typeof DeviceOrientationEvent!=="undefined" && DeviceOrientationEvent.requestPermission){ await DeviceOrientationEvent.requestPermission().catch(()=>{}); } }catch(e){}
  addEventListener("deviceorientationabsolute",onOrient); addEventListener("deviceorientation",onOrient);
  if(!navigator.geolocation){ $("#distNote").textContent="Location isn't available on this device. Use Organic Maps instead."; return; }
  $("#distNote").textContent="Getting your position…";
  if(watchId!==null) navigator.geolocation.clearWatch(watchId);
  watchId=navigator.geolocation.watchPosition(p=>{ lastPos={lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy}; paintArrow(); updateMe(); },
    err=>{ $("#distNote").textContent = MODE==="artifact" ? "Location is blocked inside this online page. Use the offline copy (golem-basecamp.html) or Organic Maps for live directions." : "Couldn't get your location ("+err.message+"). Allow location for this page, or use Organic Maps."; },
    {enableHighAccuracy:true,maximumAge:5000,timeout:20000});
};

/* ================= categories & places ================= */
const CATS={people:["Friends","#1d6fd1"],eat:["Restaurants","#0f5566"],cheap:["Cheap eats","#2a6e46"],cafe:["Cafés & bars","#7a4fb0"],shop:["Shops","#58707a"],money:["Exchange","#b8860b"],atm:["ATMs","#d4a017"],bus:["Bus","#1d6fd1"],health:["Health","#d0396b"],sight:["Sights","#8a5a2b"],transport:["Airport","#1d6fd1"],avoid:["Avoid","#c32f27"],protest:["Protest zones","#c32f27"],ours:["Our pins","#e0661b"]};
const placeDist = p => (p.lat==null||!H) ? null : dist(H.lat,H.lon,p.lat,p.lon);
let pArea="golem", pCat="all";
const LISTCATS=["all","eat","cheap","cafe","money","atm","shop","bus","health","sight","avoid","protest"];
const SRC={ta:"TripAdvisor",osm:"OpenStreetMap",reddit:"r/tirana",tom:"Explorer Tom",guide:"food guides",bus:"bus guides",news:"news reports"};
function renderCatChips(){
  if(pArea==="pins"){ $("#catChips").innerHTML=""; return; }
  const inArea=new Set(D.places.filter(p=>p.area===pArea).map(p=>p.cat));
  $("#catChips").innerHTML=LISTCATS.filter(c=>c==="all"||inArea.has(c)).map(c=>`<button type="button" class="chip" data-cat="${c}" aria-pressed="${c===pCat}">${c==="all"?"All":`<i style="background:${CATS[c][1]}"></i>${CATS[c][0]}`}</button>`).join("");
  $$("#catChips .chip").forEach(b=>b.onclick=()=>{pCat=b.dataset.cat;renderCatChips();renderPlaces();});
}
const ICON_MAP='<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/></svg>';
function renderPlaces(){
  const list=$("#placeList");
  if(pArea==="pins"){
    if(!KEY){ list.innerHTML=`<p class="muted">Unlock the group in Chat to see the pins everyone has added.</p>`; return; }
    list.innerHTML = S.pins.length ? S.pins.map(p=>`<article class="place"><div><h3>${esc(p.label)}</h3>
      <div class="meta">${p.avoid?`<span class="badge red">Avoid · until ${new Date(p.exp).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>`:""}${H?`<span>${fmtDist(placeDist(p))} from home</span>`:""}<span>Added by ${esc(p.by||"someone")} · ${when(p.ts)}</span>${OUTBOX.has(p.key)?"<span>waiting for signal</span>":""}</div></div><div></div>
      ${p.note?`<p class="note">${esc(p.note)}</p>`:""}
      <div class="acts"><button type="button" data-showpin="${esc(p.key)}">${ICON_MAP}Show on map</button><button type="button" data-meetpin="${esc(p.key)}">Make meeting point</button><button type="button" data-delpin="${esc(p.key)}">Delete</button></div></article>`).join("")
      : `<p class="muted">No pins yet. On the Map tab, tap Add pin or long-press anywhere on the map.</p>`;
    bindPinActs(list); return;
  }
  let items=D.places.filter(p=>p.area===pArea && (pCat==="all" || p.cat===pCat));
  if(pCat==="all") items=items.filter(p=>p.cat!=="transport");
  items.sort((a,b)=>{ const ra=a.cat==="avoid"||a.cat==="protest", rb=b.cat==="avoid"||b.cat==="protest"; if(ra!==rb) return ra?1:-1;
    if((b.rating||0)!==(a.rating||0)) return (b.rating||0)-(a.rating||0); return (placeDist(a)??9e9)-(placeDist(b)??9e9); });
  list.innerHTML = items.length ? items.map(p=>{
    const i=D.places.indexOf(p), d=placeDist(p), bad=p.cat==="avoid", pro=p.cat==="protest";
    return `<article class="place ${bad?"avoid":""} ${pro?"protest":""}">
      <div><h3>${esc(p.name)}</h3>
        <div class="tags"><span class="badge ${bad||pro?"red":""}">${CATS[p.cat][0]}</span>${p.near_protest?'<span class="badge amber">near protest zone</span>':""}</div>
        <div class="meta">${p.price?`<span>${esc(p.price)}</span>`:""}${d!=null?`<span>${fmtDist(d)} from home</span>`:(p.lat==null?`<span>not pinned</span>`:"")}${p.hours?`<span>${esc(p.hours)}</span>`:""}<span>via ${SRC[p.src]||p.src}</span></div></div>
      ${p.rating?`<div class="score">${p.rating.toFixed(1)}<small>${p.reviews} reviews</small></div>`:"<div></div>"}
      ${p.note?`<p class="note">${esc(p.note)}</p>`:""}
      <div class="acts">${p.lat!=null?`<button type="button" data-show="${i}">${ICON_MAP}Show on map</button>`:""}<a class="btn" href="${gmaps(p)}" target="_blank" rel="noopener">Google Maps</a></div>
    </article>`; }).join("") : `<p class="muted">Nothing in this category here.</p>`;
  $$("#placeList [data-show]").forEach(b=>b.onclick=()=>{ location.hash="#map"; setTimeout(()=>focusPlace(+b.dataset.show),80); });
}
function bindPinActs(root){
  root.querySelectorAll("[data-showpin]").forEach(b=>b.onclick=()=>{ const p=S.pins.find(x=>x.key===b.dataset.showpin); if(!p) return; location.hash="#map"; setTimeout(()=>{ initMap(); map.setView([p.lat,p.lon],17); pinMarkers[p.key]?.openPopup(); },80); });
  root.querySelectorAll("[data-meetpin]").forEach(b=>b.onclick=()=>{ const p=S.pins.find(x=>x.key===b.dataset.meetpin); if(p) setMeetup({label:p.label,lat:p.lat,lon:p.lon}); });
  root.querySelectorAll("[data-delpin]").forEach(b=>b.onclick=()=>delPin(b.dataset.delpin, b));
}
async function delPin(key, btn){
  if(btn && btn.dataset.confirm!=="1"){ btn.dataset.confirm="1"; btn.textContent="Tap again to delete"; setTimeout(()=>{ if(btn.isConnected){ btn.dataset.confirm=""; btn.textContent="Delete"; } },3000); return; }
  await writeLocal(key,{deleted:true,by:myName}); map?.closePopup(); toast("Pin deleted");
}
$$("[data-area]").forEach(b=>b.onclick=()=>{ pArea=b.dataset.area; pCat="all"; $$("[data-area]").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); renderCatChips(); renderPlaces(); });
$$("[data-places]").forEach(a=>a.addEventListener("click",()=>{ pCat=a.dataset.places; setTimeout(()=>{renderCatChips();renderPlaces();},0); }));

/* ================= info ================= */
function showSec(s){ $$(".isec").forEach(x=>x.hidden = x.id!=="s-"+s); $$("#infoChips .chip").forEach(c=>c.setAttribute("aria-pressed",String(c.dataset.sec===s))); }
$$("#infoChips .chip").forEach(c=>c.onclick=()=>showSec(c.dataset.sec));
$$("[data-info]").forEach(a=>a.addEventListener("click",()=>setTimeout(()=>showSec(a.dataset.info),0)));
$("#srcList").innerHTML=D.sources.map(([t,u])=>`<li><a href="${u}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("");
$("#phraseList").innerHTML=D.phrases.map(([g,rows])=>`<div class="panel"><h3>${esc(g)}</h3><div>${rows.map(([en,sq,pr])=>`<div class="phrase"><span class="muted small">${esc(en)}</span><span class="sq">${esc(sq)}</span><span class="pr">${esc(pr)}</span><button type="button" data-ph="${esc(sq)}" data-en="${esc(en)}" data-pr="${esc(pr)}">Show</button></div>`).join("")}</div></div>`).join("");
$$("[data-ph]").forEach(b=>b.onclick=()=>showBig(b.dataset.ph,b.dataset.en,b.dataset.pr));
if(MODE==="file") $("#fileTip").innerHTML="<b>You're using the offline copy.</b> It needs no internet, including the map and the GPS arrow. Its chat syncs by passing the ledger between phones; the online version"+(ONLINE_URL?` (<a href="${ONLINE_URL}" target="_blank" rel="noopener">open it</a>)`:"")+" also syncs over the internet.";

/* converter */
const rateIn=$("#rateIn"), eurIn=$("#eurIn"), allIn=$("#allIn");
rateIn.value=store.get("rate",90.8);
const num=v=>parseFloat(String(v).replace(/\s/g,"").replace(",","."));
function fromEur(){ const r=num(rateIn.value), e=num(eurIn.value); allIn.value = isFinite(r*e) ? Math.round(r*e).toLocaleString("en-US") : ""; old(); }
function fromAll(){ const r=num(rateIn.value), a=num(allIn.value.replace(/,/g,"")); eurIn.value = isFinite(a/r) ? (a/r).toFixed(2) : ""; old(); }
function old(){ const a=num(allIn.value.replace(/,/g,"")); $("#oldLek").textContent = isFinite(a) ? `If someone quotes ${Math.round(a*10).toLocaleString("en-US")} "old lek", that's the same ${Math.round(a).toLocaleString("en-US")} lek.` : ""; }
eurIn.oninput=fromEur; allIn.oninput=fromAll; rateIn.oninput=()=>{store.set("rate",num(rateIn.value)||90.8);fromEur();}; fromEur();

/* ================= map ================= */
let homeMarker=null, map=null, layers={}, markers=[], meMarker=null, meLine=null, tiles=null, meetMarker=null, pinLayer=null, pinMarkers={}, pick=null, draft=null, draftMarker=null;
const AREAS={golem:[[GOLEM.lat,GOLEM.lon],14],durres:[[41.3140,19.4500],15],tirana:[[41.3260,19.8180],14],airport:[[41.4140,19.7197],14]};
const ALBANIA=[[39.64,19.26],[42.66,21.06]];
const MAPCATS=["people","ours","eat","cheap","cafe","money","atm","shop","bus","health","sight","avoid","protest"];
let mapOn=Object.assign({people:1,ours:1,eat:1,cheap:1,cafe:1,money:1,atm:1,bus:1,health:1,sight:1,avoid:1,protest:1,shop:0}, store.get("mapcats",{}));

/* ---- offline country map (OpenStreetMap, built in) ---- */
let G=null;
async function loadCountry(){
  if(G) return G;
  const el=document.getElementById("mapdata"); if(!el || typeof DecompressionStream==="undefined") return null;
  const bin=Uint8Array.from(atob(el.textContent.trim()),c=>c.charCodeAt(0));
  const txt=await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  G=JSON.parse(txt); return G;
}
function decodeLine(a){ const out=new Array(a.length/2); let la=a[0], lo=a[1]; out[0]=[39+la/1e5,19+lo/1e5]; for(let i=2,j=1;i<a.length;i+=2,j++){ la+=a[i]; lo+=a[i+1]; out[j]=[39+la/1e5,19+lo/1e5]; } return out; }
// [min zoom, width at z15, colour token]; drawn bottom to top
const RS={res:[14,5,"--road"],ped:[15,4,"--road"],unc:[13,5,"--road"],ter:[12,6,"--road"],lnk:[11,4,"--road-major"],sec:[9,7,"--road-major"],pri:[8,8,"--road-major"],tru:[7,9,"--road-major"],mot:[7,10,"--road-major"]};
const ORDER=["res","ped","unc","ter","lnk","sec","pri","tru","mot"];
const PLACEZ={city:7,town:9,village:12,suburb:13};
const wFor=(cls,z)=>Math.max(cls==="res"||cls==="unc"||cls==="ped"?1.2:1.6, RS[cls][1]*Math.pow(2,(z-15)*.62));
let R=null, RD={}, tok=null, globalRoads={}, cellCache={}, activeCells=new Set(), placeLayer=null, roadLabelLayer=null, rivers=null, urbanStyle=null;
const MAJOR=new Set(["lnk","sec","pri","tru","mot"]);
function roadPair(lines, cls){ const mj=MAJOR.has(cls); return { cls, c:L.polyline(lines,{renderer:mj?RD.casMaj:RD.casMin,color:tok("--road-edge"),weight:3,interactive:false,lineCap:"round",lineJoin:"round",smoothFactor:.6}),
  f:L.polyline(lines,{renderer:mj?RD.filMaj:RD.filMin,color:tok(RS[cls][2]),weight:2,interactive:false,lineCap:"round",lineJoin:"round",smoothFactor:.6}) }; }
function buildCell(key){
  const c=G.c[key]; const out={pairs:[], urban:null, b:L.latLngBounds([c.b[0],c.b[1]],[c.b[2],c.b[3]])};
  if(c.u && c.u.length) out.urban=L.polygon(c.u.map(r=>[decodeLine(r)]),{renderer:RD.urb,stroke:false,fillColor:tok("--urban"),fillOpacity:1,interactive:false});
  for(const cls of ORDER){ const ls=c.r[cls]; if(ls && ls.length) out.pairs.push(roadPair(ls.map(decodeLine),cls)); }
  return out;
}
function syncMap(){
  if(!map||!G) return; const z=map.getZoom(); const view=map.getBounds().pad(.25);
  // global roads: show by zoom, restyle widths
  for(const cls of ORDER){ const p=globalRoads[cls]; if(!p) continue; const show=z>=RS[cls][0];
    if(show!==map.hasLayer(p.f)){ if(show){ p.c.addTo(map); p.f.addTo(map); } else { map.removeLayer(p.c); map.removeLayer(p.f); } }
    if(show){ const w=wFor(cls,z); p.f.setStyle({weight:w}); p.c.setStyle({weight:w+(z>=13?2.2:1.2)}); } }
  if(rivers) rivers.setStyle({weight:Math.max(1,2*Math.pow(2,(z-12)*.5))});
  // street cells: only those in view, only from z11
  const want=new Set();
  if(z>=11) for(const [key,c] of Object.entries(G.c)){ if(view.intersects([[c.b[0],c.b[1]],[c.b[2],c.b[3]]])) want.add(key); }
  for(const key of activeCells) if(!want.has(key)){ const cl=cellCache[key]; if(cl.urban) map.removeLayer(cl.urban); for(const p of cl.pairs){ map.removeLayer(p.c); map.removeLayer(p.f); } activeCells.delete(key); }
  for(const key of want){ const cl=cellCache[key] ||= buildCell(key); activeCells.add(key);
    if(cl.urban && !map.hasLayer(cl.urban)) cl.urban.addTo(map);
    for(const p of cl.pairs){ const show=z>=RS[p.cls][0];
      if(show!==map.hasLayer(p.f)){ if(show){ p.c.addTo(map); p.f.addTo(map); } else { map.removeLayer(p.c); map.removeLayer(p.f); } }
      if(show){ const w=wFor(p.cls,z); p.f.setStyle({weight:w}); p.c.setStyle({weight:w+(z>=13?2.2:1.2)}); } } }
  // labels: towns first, then villages, then street names; skip any that would overlap
  placeLayer.clearLayers(); roadLabelLayer.clearLayers(); const tight=map.getBounds();
  const PRI={city:0,town:1,suburb:2,village:3}; const cands=[];
  for(const c of Object.values(G.c)){ if(!tight.intersects([[c.b[0],c.b[1]],[c.b[2],c.b[3]]])) continue;
    for(const [name,type,la,lo] of c.p){ if(z<PLACEZ[type]||!tight.contains([la,lo])||/^Nj[eë]sia/i.test(name)) continue; cands.push([/^Tiran/.test(name)&&type==="city"?-1:PRI[type],name,la,lo,"plabel p-"+type,type==="city"?9.5:type==="town"?7.8:6.6]); }
    if(z>=15) for(const [name,cls,la,lo] of c.l){ if(!tight.contains([la,lo])) continue; if(z<16 && (cls==="res"||cls==="ped")) continue; cands.push([5+(MAJOR.has(cls)?0:1),name,la,lo,"rlabel",5.8]); } }
  cands.sort((x,y)=>x[0]-y[0]);
  const boxes=[]; let n=0;
  for(const [pr,name,la,lo,cls,cw] of cands){ if(n>140) break;
    const pt=map.latLngToContainerPoint([la,lo]); const w=name.length*cw/2+4, h=pr<5?9:7;
    if(boxes.some(b=>Math.abs(b[0]-pt.x)<b[2]+w && Math.abs(b[1]-pt.y)<b[3]+h)) continue;
    boxes.push([pt.x,pt.y,w,h]); n++;
    L.tooltip({permanent:true,direction:"center",className:cls,interactive:false}).setLatLng([la,lo]).setContent(esc(name)).addTo(pr<5?placeLayer:roadLabelLayer); }
}
async function drawBase(){
  const g=await loadCountry(); if(!g){ $("#maptip").hidden=false; $("#maptip").textContent="This browser can't unpack the built-in map. Update the browser, or use Organic Maps."; return; }
  const z=map.getZoom();
  L.polygon(decodeLine(g.sea),{renderer:RD.sea,stroke:false,fillRule:"nonzero",fillColor:tok("--water"),fillOpacity:1,interactive:false,smoothFactor:.5}).addTo(map);
  if(g.isl.length) L.polygon(g.isl.map(r=>[decodeLine(r)]),{renderer:RD.sea,stroke:false,fillColor:tok("--land"),fillOpacity:1,interactive:false}).addTo(map);
  L.polyline(g.cst.map(decodeLine),{renderer:R,color:tok("--coast"),weight:1.2,interactive:false}).addTo(map);
  L.polygon(g.lk.map(r=>[decodeLine(r)]),{renderer:R,stroke:false,fillColor:tok("--water"),fillOpacity:1,interactive:false}).addTo(map);
  rivers=L.polyline(g.rv.map(decodeLine),{renderer:R,color:tok("--water-line"),weight:1.5,interactive:false}).addTo(map);
  L.polyline(g.bd.map(decodeLine),{renderer:R,color:tok("--border"),weight:1.6,dashArray:"7 5",interactive:false}).addTo(map);
  for(const cls of ORDER){ const ls=g.g[cls]; if(ls&&ls.length) globalRoads[cls]=roadPair(ls.map(decodeLine),cls); }
  placeLayer=L.layerGroup().addTo(map); roadLabelLayer=L.layerGroup().addTo(map);
  map.on("moveend zoomend",syncMap); syncMap();
  for(const m of [meetMarker, meMarker]) m?.bringToFront?.();
}
function initMap(){
  if(map){ setTimeout(()=>map.invalidateSize(),50); return; }
  if(typeof L==="undefined"){ $("#map").innerHTML='<p class="empty">The map library didn\'t load. Use the Places list or Organic Maps.</p>'; return; }
  const css=getComputedStyle(document.documentElement);
  map=L.map("map",{zoomControl:true,preferCanvas:true,minZoom:7,maxZoom:19,maxBounds:[[39.2,18.6],[43.0,21.6]],maxBoundsViscosity:.8}).setView(AREAS.golem[0],AREAS.golem[1]);
  map.attributionControl.setPrefix(false); map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>');
  tok=n=>css.getPropertyValue(n).trim();
  [["sea",330],["urb",332],["base",334],["casMin",336],["filMin",337],["casMaj",338],["filMaj",339]].forEach(([n,zi])=>{ map.createPane("p-"+n).style.zIndex=zi; RD[n]=L.canvas({pane:"p-"+n,padding:.25}); });
  R=RD.base;
  drawBase();
  // places
  MAPCATS.forEach(c=>layers[c]=L.layerGroup());
  D.places.forEach((p,i)=>{ if(p.lat==null) return; const col=CATS[p.cat][1]; let m;
    if(p.cat==="protest") m=L.circle([p.lat,p.lon],{radius:p.radius||300,color:col,weight:2,dashArray:"6 5",fillColor:col,fillOpacity:.18});
    else m=L.circleMarker([p.lat,p.lon],{radius:p.cat==="avoid"?7:8,color:"#fff",weight:2,fillColor:col,fillOpacity:1});
    const d=placeDist(p);
    m.bindPopup(()=>`<b>${esc(p.name)}</b><br>${p.rating?`${p.rating.toFixed(1)} on TripAdvisor (${p.reviews}) · `:""}${p.price?esc(p.price)+" · ":""}${d!=null?fmtDist(d)+" from home":""}${p.hours?`<br>${esc(p.hours)}`:""}${p.note?`<br>${esc(p.note)}`:""}
      <div class="popbtns"><button type="button" data-act="meetplace" data-i="${i}">Make meeting point</button><a href="${gmaps(p)}" target="_blank" rel="noopener" class="btn" style="min-height:32px;padding:.15rem .65rem;font-size:.8rem">Google Maps</a></div>`);
    markers[i]=m; (layers[p.cat] ||= L.layerGroup()).addLayer(m); });
  pinLayer=layers.ours; peerLayer=layers.people;
  Object.entries(layers).forEach(([c,g])=>{ if(mapOn[c]!==0) g.addTo(map); });
  const homeIcon=L.divIcon({className:"",iconSize:[34,34],iconAnchor:[17,32],popupAnchor:[0,-28],html:`<svg class="homepin" viewBox="0 0 34 34"><path d="M17 33 C17 33 4 20 4 12 A13 13 0 0 1 30 12 C30 20 17 33 17 33Z" fill="${tok("--red")}" stroke="#fff" stroke-width="2"/><path d="M11 15 17 10l6 5v5h-4v-3h-4v3h-4z" fill="#fff"/></svg>`});
  homeMarker=L.marker([GOLEM.lat,GOLEM.lon],{icon:homeIcon,zIndexOffset:1000}).bindPopup(()=>H?`<b>Home</b><br>${esc(H.address)}<br>${plusCode(H.lat,H.lon)}`:""); drawHome();
    map.on("click",e=>{ if(pick) openPinForm(e.latlng,pick); });
  map.on("contextmenu",e=>{ openPinForm(e.latlng,"pin"); });
  $("#map").addEventListener("click",onPopupAction);
  renderMapChips(); drawPins(); drawMeet(); updateMe(); renderPeers(); setTimeout(()=>map.invalidateSize(),60);
}
function onPopupAction(e){ const b=e.target.closest("[data-act]"); if(!b) return;
  const act=b.dataset.act;
  if(act==="meetplace"){ const p=D.places[+b.dataset.i]; setMeetup({label:p.name,lat:p.lat,lon:p.lon}).then(ok=>ok&&map.closePopup()); }
  if(act==="meetpin"){ const p=S.pins.find(x=>x.key===b.dataset.key); if(p) setMeetup({label:p.label,lat:p.lat,lon:p.lon}).then(ok=>ok&&map.closePopup()); }
  if(act==="delpin") delPin(b.dataset.key,b);
  if(act==="navmeet"){ $$("[data-target]")[1].click(); location.hash="#home"; }
}
const pinIcon = (col,glyph) => L.divIcon({className:"",iconSize:[30,30],iconAnchor:[15,29],popupAnchor:[0,-26],html:`<svg class="homepin" style="width:30px;height:30px" viewBox="0 0 34 34"><path d="M17 33C17 33 4 20 4 12a13 13 0 0 1 26 0c0 8-13 21-13 21Z" fill="${col}" stroke="#fff" stroke-width="2"/>${glyph}</svg>`});
function drawPins(){ if(!map) return; pinLayer.clearLayers(); pinMarkers={};
  for(const p of S.pins){ const m = p.avoid ? L.circle([p.lat,p.lon],{radius:p.radius||300,color:"#c32f27",weight:2,dashArray:"6 5",fillColor:"#c32f27",fillOpacity:.2})
      : L.marker([p.lat,p.lon],{icon:pinIcon(CATS.ours[1],'<circle cx="17" cy="12" r="4.5" fill="#fff"/>')});
    if(p.avoid) m.bindTooltip("Avoid: "+esc(p.label),{permanent:true,direction:"center",className:"peerlabel"});
    m.bindPopup(()=>`<b>${esc(p.label)}</b>${p.note?`<br>${esc(p.note)}`:""}<br><span class="small">Added by ${esc(p.by||"someone")} · ${when(p.ts)}${OUTBOX.has(p.key)?" · waiting for signal":""}</span>
      ${p.avoid?`<br><b class="small" style="color:var(--red)">Reported by ${esc(p.by||"someone")}; disappears ${new Date(p.exp).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</b>`:""}
      <div class="popbtns"><button type="button" data-act="meetpin" data-key="${esc(p.key)}">Make meeting point</button><button type="button" class="danger" data-act="delpin" data-key="${esc(p.key)}">Delete</button></div>`);
    m.addTo(pinLayer); pinMarkers[p.key]=m; } }
function drawHome(){ if(!map||!homeMarker) return; if(H){ homeMarker.setLatLng([H.lat,H.lon]); if(!map.hasLayer(homeMarker)) homeMarker.addTo(map); } else if(map.hasLayer(homeMarker)) map.removeLayer(homeMarker); }
function drawMeet(){ if(!map) return; const m=S.meetup; if(!m || m.home){ if(meetMarker){ map.removeLayer(meetMarker); meetMarker=null; } return; } const css=getComputedStyle(document.documentElement);
  const icon=pinIcon(css.getPropertyValue("--amber").trim(),'<path d="M13 6v13M13 6h9l-2 3 2 3h-9" fill="#fff" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>');
  const html=()=>`<b>Meeting point</b><br>${esc(m.label)}<br><span class="small">${m.by?`Set by ${esc(m.by)} · ${when(m.ts)}`:"Default"}</span><div class="popbtns"><button type="button" data-act="navmeet">Compass to here</button></div>`;
  if(!meetMarker) meetMarker=L.marker([m.lat,m.lon],{icon,zIndexOffset:900}).addTo(map).bindPopup(html);
  else { meetMarker.setLatLng([m.lat,m.lon]); meetMarker.setPopupContent(html()); } }
function renderMapChips(){
  $("#mapChips").innerHTML=MAPCATS.filter(c=>RELAY||c!=="people").map(c=>`<button type="button" class="chip" data-mc="${c}" aria-pressed="${mapOn[c]!==0}"><i style="background:${CATS[c][1]}"></i>${CATS[c][0]}</button>`).join("");
  $$("#mapChips .chip").forEach(b=>b.onclick=()=>{ const c=b.dataset.mc; mapOn[c]= mapOn[c]===0?1:0; store.set("mapcats",mapOn); if(mapOn[c]) layers[c].addTo(map); else map.removeLayer(layers[c]); renderMapChips(); });
}
function focusPlace(i){ initMap(); if(!map) return; const p=D.places[i], c=p.cat; if(mapOn[c]===0){ mapOn[c]=1; layers[c].addTo(map); renderMapChips(); }
  map.setView([p.lat,p.lon],p.cat==="protest"?15:17); markers[i]?.openPopup(); }
$$("[data-go]").forEach(b=>b.onclick=()=>{ initMap(); if(!map) return; if(b.dataset.go==="region") map.fitBounds(ALBANIA); else { const [c,z]=AREAS[b.dataset.go]; map.setView(c,z); } $$("[data-go]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  const tip=$("#maptip"); tip.hidden = true; tip.textContent = "Built-in map for browsing. For turn-by-turn directions use Organic Maps."; clearTimeout(tip._t); tip._t=setTimeout(()=>tip.hidden=true,5000); });

/* pick + pin form */
function startPick(kind){ initMap(); pick=kind; $("#pickbar").hidden=false; $("#pickText").textContent= kind==="meet" ? "Tap the map where everyone should meet" : kind==="home" ? "Tap where you're staying" : "Tap the map where the pin goes"; $("#mapwrap").classList.add("mapping"); $("#pinForm").hidden=true; }
function endPick(){ pick=null; $("#pickbar").hidden=true; $("#mapwrap").classList.remove("mapping"); }
$("#pickCancel").onclick=endPick;
$("#addPinBtn").onclick=async()=>{ if(!await needUnlock("Unlock the group first. Pins are shared with everyone, encrypted.")) return; startPick("pin"); };
function openPinForm(latlng, kind){
  if(kind==="home"){ endPick(); $("#hLL").value=`${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`; $("#hLL").dispatchEvent(new Event("input")); location.hash="#home"; $("#homeForm").hidden=false; $("#homeEmpty").hidden=true; setTimeout(()=>$("#homeForm").scrollIntoView({block:"start"}),120); return; }
  initMap(); endPick(); draft={lat:latlng.lat,lon:latlng.lng,kind};
  if(draftMarker) map.removeLayer(draftMarker);
  draftMarker=L.circleMarker([draft.lat,draft.lon],{radius:10,color:"#fff",weight:3,fillColor:CATS.ours[1],fillOpacity:.9}).addTo(map);
  $("#pinFormTitle").textContent = kind==="meet" ? "New meeting point" : "New pin";
  $("#pinLabel").value = kind==="meet" ? "" : ""; $("#pinNote").value="";
  $("#pinLabel").placeholder = kind==="meet" ? "e.g. Café by the beach" : "e.g. Good byrek place";
  $("#pinSave").hidden = kind==="meet"; $("#pinMeet").classList.toggle("btn-primary",kind==="meet");
  $("#pinMeet").textContent = kind==="meet" ? "Set meeting point" : "Make it the meeting point";
  $("#pinNote").parentElement.hidden = kind==="meet"; $("#pinAvoid").checked=false; $("#pinAvoid").parentElement.hidden = kind==="meet"; $("#pinRadiusWrap").hidden=true;
  $("#pinWhere").textContent=`${draft.lat.toFixed(5)}, ${draft.lon.toFixed(5)}`+(H?` · ${fmtDist(dist(H.lat,H.lon,draft.lat,draft.lon))} from home`:"");
  $("#pinShareNote").textContent = !KEY ? "Unlock the group in Chat to share this." : (MODE==="file" ? "Saved to your ledger. Share the ledger (Chat tab) so the others get it." : "Shared with the group, encrypted. Without signal it waits and sends later.");
  $("#pinForm").hidden=false; $("#pinLabel").focus(); $("#pinForm").scrollIntoView({block:"nearest",behavior:"smooth"});
}
function closePinForm(){ $("#pinForm").hidden=true; if(draftMarker){ map.removeLayer(draftMarker); draftMarker=null; } draft=null; }
$("#pinCancel").onclick=closePinForm;
$("#pinForm").addEventListener("submit",async e=>{ e.preventDefault(); if(!draft) return; const label=$("#pinLabel").value.trim(); if(!label){ $("#pinLabel").focus(); return; }
  if(!await needUnlock("Unlock the group first. Pins are shared with everyone, encrypted.")) return;
  const n=await ensureName(); if(!n) return;
  const avoid=$("#pinAvoid").checked;
  await writeLocal("pins/"+rid(),{label:label.slice(0,60),note:$("#pinNote").value.trim().slice(0,200),lat:+draft.lat.toFixed(6),lon:+draft.lon.toFixed(6),by:n,
    ...(avoid?{avoid:true,radius:+$("#pinRadius").value,exp:Date.now()+12*3600e3}:{})});
  closePinForm(); toast(avoid?"Avoid area shared for 12 hours":"Pin added"); });
$("#pinAvoid").onchange=()=>{ $("#pinRadiusWrap").hidden=!$("#pinAvoid").checked; $("#pinLabel").placeholder=$("#pinAvoid").checked?"e.g. Protest at the main square":"e.g. Good byrek place"; };
$("#pinMeet").onclick=async()=>{ if(!draft) return; const label=$("#pinLabel").value.trim(); if(!label){ $("#pinLabel").focus(); return; }
  if(await setMeetup({label,lat:draft.lat,lon:draft.lon})){ closePinForm(); map.setView([S.meetup.lat,S.meetup.lon],Math.max(map.getZoom(),16)); } };

function updateMe(){ if(!map||!lastPos) return; const ll=[lastPos.lat,lastPos.lon], T=tgt();
  if(!meMarker){ meMarker=L.circleMarker(ll,{radius:8,color:"#fff",weight:3,fillColor:"#1d6fd1",fillOpacity:1}).addTo(map).bindPopup("You"); meLine=L.polyline([ll,[T.lat,T.lon]],{color:"#1d6fd1",weight:3,dashArray:"4 6"}).addTo(map); }
  else { meMarker.setLatLng(ll); meLine.setLatLngs([ll,[T.lat,T.lon]]); } }
$("#locBtn").onclick=()=>{ $("#findBtn").click(); const t=setInterval(()=>{ if(lastPos&&map){ clearInterval(t); const T=tgt(); map.fitBounds(L.latLngBounds([[lastPos.lat,lastPos.lon],[T.lat,T.lon]]).pad(.3),{maxZoom:17}); } },500); setTimeout(()=>clearInterval(t),20000);
  if(MODE==="artifact") setTimeout(()=>{ if(!lastPos){ const tip=$("#maptip"); tip.hidden=false; tip.textContent="Location is blocked in the online page. Use the offline copy or Organic Maps for a live position."; } },3000); };
if(MODE==="file"){ const tb=$("#tileBtn"); tb.hidden=false; tb.onclick=()=>{ initMap(); if(!map) return; if(tiles){ map.removeLayer(tiles); tiles=null; tb.setAttribute("aria-pressed","false"); } else { tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map); tiles.bringToBack(); tb.setAttribute("aria-pressed","true"); } }; }


/* ================= profile picture and chat background ================= */
function profileFor(m){ if(m.dev && S.profiles[m.dev]) return S.profiles[m.dev];
  let best=null; for(const p of Object.values(S.profiles)) if(p.name===m.name && (!best||p.ts>best.ts)) best=p; return best; }
function avatarEl(p, name){ const a=document.createElement("div"); a.className="avatar"; a.setAttribute("aria-hidden","true");
  if(p && typeof p.img==="string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.img)) a.style.backgroundImage=`url("${p.img}")`;
  else { a.style.background=peerColor(name||"?"); a.textContent=(name||"?").trim().slice(0,1); } return a; }
async function loadImage(file){ const url=URL.createObjectURL(file); try{ const img=new Image(); img.decoding="async"; img.src=url; await img.decode(); return img; } finally { setTimeout(()=>URL.revokeObjectURL(url),1000); } }
async function squareAvatar(file){ const img=await loadImage(file); const S0=Math.min(img.naturalWidth,img.naturalHeight); const c=document.createElement("canvas"); c.width=c.height=128;
  c.getContext("2d").drawImage(img,(img.naturalWidth-S0)/2,(img.naturalHeight-S0)/2,S0,S0,0,0,128,128); return c.toDataURL("image/jpeg",0.82); }
async function fitBackground(file){ const img=await loadImage(file); const k=Math.min(1,1080/Math.max(img.naturalWidth,img.naturalHeight)); const c=document.createElement("canvas");
  c.width=Math.round(img.naturalWidth*k); c.height=Math.round(img.naturalHeight*k); c.getContext("2d").drawImage(img,0,0,c.width,c.height); return c.toDataURL("image/jpeg",0.78); }
let myImg=store.get("avatar",null);
async function publishProfile(){ if(!KEY||!myName) return; await writeLocal("profiles/"+DEVICE,{name:myName,img:myImg||null}); }
function renderSettings(){ const me={name:myName,img:myImg}; const av=$("#setAvatar"); av.replaceChildren(); const a=avatarEl(me,myName||"?"); av.style.cssText=a.style.cssText; av.textContent=a.textContent;
  $("#avatarRemove").hidden=!myImg; if(document.activeElement!==$("#setName")) $("#setName").value=myName||"";
  const bg=store.get("chatbg",null), op=store.get("chatbgop",35); $("#bgOpacity").value=op; $("#bgOpacityVal").textContent=op+"%";
  $("#bgThumb").style.backgroundImage=bg?`url("${bg}")`:""; $("#bgRemove").hidden=!bg; applyBg(); }
function applyBg(){ const bg=store.get("chatbg",null)||sessionBg, op=store.get("chatbgop",35); $("#chatbg").style.backgroundImage=bg?`url("${bg}")`:""; $("#chatwrap").style.setProperty("--bg-op",String(op/100)); }
let sessionBg=null;
$("#cogBtn").onclick=()=>{ const p=$("#chatSettings"); p.hidden=!p.hidden; $("#cogBtn").setAttribute("aria-expanded",String(!p.hidden)); if(!p.hidden){ $("#setErr").textContent=""; renderSettings(); } };
$("#setNameSave").onclick=async()=>{ const n=$("#setName").value.trim().slice(0,24); if(!n){ $("#setName").focus(); return; } myName=n; store.set("name",n); renderAll(); renderSettings(); await publishProfile(); toast("You're "+n); };
$("#avatarFile").onchange=async e=>{ const f=e.target.files[0]; e.target.value=""; if(!f) return; $("#setErr").textContent="";
  try{ myImg=await squareAvatar(f); store.set("avatar",myImg); renderSettings(); renderMessages(); if(!myName) await ensureName(); if(KEY) await publishProfile(); else $("#setErr").textContent="Saved on this phone. It goes to the group once you unlock."; toast("Profile picture set"); }
  catch(err){ $("#setErr").textContent="That file couldn't be read as a picture. Try a JPEG or PNG."; } };
$("#avatarRemove").onclick=async()=>{ myImg=null; store.set("avatar",null); renderSettings(); await publishProfile(); renderMessages(); toast("Picture removed"); };
$("#bgFile").onchange=async e=>{ const f=e.target.files[0]; e.target.value=""; if(!f) return; $("#setErr").textContent="";
  try{ const d=await fitBackground(f); if(!store.set("chatbg",d)){ sessionBg=d; $("#setErr").textContent="The phone's storage is full, so the background lasts until you close the app."; } renderSettings(); }
  catch(err){ $("#setErr").textContent="That file couldn't be read as a picture. Try a JPEG or PNG."; } };
$("#bgRemove").onclick=()=>{ store.set("chatbg",null); sessionBg=null; renderSettings(); };
$("#bgOpacity").oninput=e=>{ store.set("chatbgop",+e.target.value); $("#bgOpacityVal").textContent=e.target.value+"%"; applyBg(); };

/* ================= chat ================= */
function renderChatNote(){
  let t="";
  const waiting=[...OUTBOX].filter(k=>k.startsWith("messages/")).length;
  if(RELAY){ if(!KEY) t=""; else if(!navigator.onLine) t = waiting ? `No signal. ${waiting} message${waiting>1?"s":""} will send when you're back online.` : "No signal. New messages will arrive when you're back online.";
    else if(!relayOnline()) t = waiting ? `Connecting to the relay… ${waiting} waiting to send.` : "Connecting to the relay…"; else t = waiting ? `Sending ${waiting}…` : ""; }
  else if(MODE==="file") t="Offline copy: messages are saved in your ledger. Pass the ledger between phones to sync.";
  else if(!db) t = window.claude ? "Connecting…" : "Live sync isn't available in this view. Messages stay on this phone until you share the ledger.";
  else if(readOnly) t="You can read but not post. Ask the trip organiser to invite you as an Editor on this page.";
  else if(!navigator.onLine) t = waiting ? `No signal. ${waiting} message${waiting>1?"s":""} will send when you're back online.` : "No signal. New messages will arrive when you're back online.";
  else if(waiting) t=`Sending ${waiting}…`;
  else t=syncNote;
  $("#chatNote").textContent=t;
}
function renderMessages(force){
  const box=$("#chatbox");
  if(!KEY){ box.innerHTML='<p class="empty">Unlock the group to read messages.</p>'; return; }
  const atBottom = box.scrollHeight-box.scrollTop-box.clientHeight < 80;
  if(!S.messages.length){ box.innerHTML='<p class="empty">No messages yet. Say hi so everyone knows it works.</p>'; return; }
  box.innerHTML=""; let prev=null;
  for(const m of S.messages){ const mine = m.dev ? m.dev===DEVICE : m.name===myName;
    const row=document.createElement("div"); const same = prev && prev.name===m.name && !m.locked && m.ts-prev.ts < 5*60000;
    row.className="row-msg"+(mine?" me":"")+(same?" same":""); prev=m;
    const el=document.createElement("div");
    el.className="msg"+(mine?" me":"")+(m.kind==="status"?" status":"")+(m.locked?" locked":"");
    const who=document.createElement("div"); who.className="who"; const n=document.createElement("span"); n.textContent=m.locked?"Locked":(m.name||"?"); const t=document.createElement("span"); t.textContent=when(m.ts);
    who.append(n,t); if(OUTBOX.has(m.key) && (MODE==="artifact"||RELAY)){ const w=document.createElement("span"); w.textContent="waiting"; who.append(w); }
    const tx=document.createElement("div"); tx.className="txt"; tx.textContent= m.locked ? "Written with a different passphrase." : (m.text||""); el.append(who,tx);
    row.append(avatarEl(m.locked?null:profileFor(m), m.locked?"?":m.name), el); box.append(row); }
  if(atBottom||force) box.scrollTop=box.scrollHeight;
}
async function send(text, kind){
  text=text.trim(); if(!text) return false;
  if(!KEY){ needUnlock("Unlock the group to send messages."); return false; }
  const n=await ensureName(); if(!n) return false;
  await writeLocal("messages/"+rid(),{name:n,dev:DEVICE,text:text.slice(0,1000),kind:kind||"text"});
  renderMessages(true); return true;
}
$("#chatForm").addEventListener("submit",async e=>{ e.preventDefault(); const v=$("#chatIn").value; $("#chatIn").value=""; if(!await send(v)) $("#chatIn").value=v; });
$("#chatIn").addEventListener("keydown",e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); $("#chatForm").requestSubmit(); } });
$$("#quick .chip").forEach(b=>b.onclick=()=>send(b.dataset.q,"status"));

/* ledger hand-to-hand */
$("#ledgerCopy").onclick=async()=>{
  const keys=Object.keys(LEDGER); if(!keys.length){ toast("Your ledger is empty"); return; }
  const text="GB1:"+b64(enc.encode(JSON.stringify({v:1,docs:LEDGER})));
  const ta=$("#ledgerIn"); ta.value=text;
  const ok=await copy(text, null);
  if(!ok){ $("#ledgerPasteWrap").hidden=false; ta.focus(); ta.select(); }
  $("#ledgerNote").textContent=`${keys.length} entries, ${Math.round(text.length/1024)} KB. It's encrypted, so it's safe to send any way you like.`;
};
$("#ledgerPasteBtn").onclick=()=>{ const w=$("#ledgerPasteWrap"); w.hidden=!w.hidden; if(!w.hidden){ $("#ledgerIn").value=""; $("#ledgerIn").focus(); } };
$("#ledgerMerge").onclick=async()=>{
  const raw=$("#ledgerIn").value.trim(); const note=$("#ledgerNote");
  let inc=null; try{ if(!raw.startsWith("GB1:")) throw 0; inc=JSON.parse(dec.decode(unb64(raw.slice(4)))); if(!inc||typeof inc.docs!=="object") throw 0; }catch(e){ note.textContent="That isn't a ledger. Copy the whole text, starting with GB1:"; return; }
  const kc=inc.docs["meta/keycheck"];
  if(KEY && kc){ const ok=await unseal(kc); if(!ok){ note.textContent="This ledger was made with a different passphrase, so it wasn't merged."; return; } }
  if(!KEY && !LEDGER["meta/keycheck"] && kc && !serverKeycheck){ LEDGER["meta/keycheck"]=kc; }
  let added=0; for(const [k,d] of Object.entries(inc.docs)){ if(!/^(messages|pins|meta|profiles)\/[A-Za-z0-9._:-]{1,60}$/.test(k)) continue; if(mergeDoc(k,d)){ added++; OUTBOX.add(k); } }
  saveLedger(); await rebuild(); flush(); renderLock();
  note.textContent = added ? `Merged ${added} new entr${added>1?"ies":"y"}.` : "Nothing new: you already had all of it.";
  $("#ledgerIn").value=""; $("#ledgerPasteWrap").hidden=true;
};

function renderAll(){ renderHome(); drawHome(); renderMeet(); renderMessages(); renderChatNote(); if(pArea==="pins") renderPlaces(); drawPins(); paintArrow(); updateMe(); }

/* ================= boot ================= */
renderCatChips(); renderPlaces(); route();
applyBg();
$("#shareSw").onclick=()=>setShare(!SHARE.on);
$("#mapShareSw").onclick=()=>setShare(!SHARE.on);
(async()=>{ await loadSavedKey(); renderLock(); await rebuild(); startSync(); renderShare(); ntfyPoll();
  if(RELAY && KEY && store.get("share",false)){ if(SHARE.outsideSince && !SHARE.override && Date.now()-SHARE.outsideSince>OUTSIDE_LIMIT) expireShare(); else setShare(true); } })();
