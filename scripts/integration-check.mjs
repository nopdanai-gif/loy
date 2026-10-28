import {createRequire} from 'node:module';
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
const root=path.resolve('dist/server');
const files=readdirSync(root,{recursive:true}).filter(f=>/\.m?js$/.test(f));
const modules=['index.js',...files.filter(f=>f!=='index.js')].map(f=>({type:'ESModule',path:path.join(root,f)}));
const mf=new Miniflare({modulesRoot:root,modules,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'test-db'},cf:false,port:0});
let checks=0;const ok=(name,condition)=>{assert.ok(condition,name);checks++;console.log('PASS '+name);};
const origin='https://test.local';
const owner={'oai-authenticated-user-id':'qa-owner','oai-authenticated-user-email':'qa-owner@example.test'};
async function req(url,method='GET',body,identity,extra={}){const r=await mf.dispatchFetch(origin+'/api/'+url,{method,headers:{...(body?{'Content-Type':'application/json',origin}:{}),...identity,...extra},body:body?JSON.stringify(body):undefined});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,data};}
const fresh=()=>({id:crypto.randomUUID(),device:crypto.randomUUID(),event_id:eventId,name:'ผู้ร่วมงาน',message:'ขอให้ทุกคนมีความสุข',style:0,consent:true});
let eventId;
try{
const db=await mf.getD1Database('DB');
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
for(const entry of journal.entries){
  const sql=readFileSync('drizzle/'+entry.tag+'.sql','utf8');
  for(const s of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(s).run();
  if(entry.idx===0){
    await db.prepare("INSERT INTO events (id,owner,title,place,created_at) VALUES ('aaaaaaaaaaaaaaaaaaaa','legacy','งานเดิม','บางทอง',1)").run();
    await db.prepare("INSERT INTO wishes (id,event_id,device,name,message,style,status,created_at) VALUES ('legacy-wish','aaaaaaaaaaaaaaaaaaaa','legacy-device','ชื่อเดิม','คำอวยพรเดิม',2,'approved',1)").run();
    await db.prepare("INSERT INTO feed (event_id,wish_id,action,created_at) VALUES ('aaaaaaaaaaaaaaaaaaaa','legacy-wish','add',1)").run();
  }
}
const legacy=await req('events/aaaaaaaaaaaaaaaaaaaa/feed');
ok('migration preserves legacy wishes and supplies default design',legacy.status===200&&legacy.data.wishes[0].message==='คำอวยพรเดิม'&&legacy.data.wishes[0].design.shape==='lotus'&&legacy.data.event.float_ms===24000);
ok('legacy events receive LED defaults without a ceremony',legacy.data.event.led.qrPosition==='top-right'&&legacy.data.event.led.highlight===true&&legacy.data.event.ceremony===null);
let r=await req('events','POST',{title:'งานทดสอบ',place:'ข้อมูลจำลองเท่านั้น'},owner);ok('owner creates event',r.status===201);eventId=r.data.event.id;
r=await req('events','POST',{title:'x',place:'x'});ok('anonymous cannot create',r.status===401);
r=await req('events/'+eventId+'/manage');ok('anonymous cannot manage',r.status===401);
r=await req('events/'+eventId+'/manage','GET',undefined,{...owner,'oai-authenticated-user-id':'someone-else'});ok('other owner forbidden',r.status===403);
r=await req('wishes','POST',fresh(),undefined,{origin:'https://evil.test'});ok('foreign origin rejected',r.status===403);
r=await req('wishes','POST',{...fresh(),name:'ก'.repeat(41)});ok('length validation',r.status===400);
r=await req('wishes','POST',{...fresh(),message:'x'.repeat(70000)});ok('oversized rejected',r.status===413);
const custom={v:1,shape:'swan',primary:'#f39cbc',secondary:'#59b99b',glow:'#ffb671',glowPower:91,candles:3,speed:1.4,decorations:[{kind:'butterfly',x:210,y:95,scale:1.25,rotation:-35,color:'#74e0cf'}],strokes:[{color:'#ffcf6a',width:5,points:[[100,170],[125,150],[150,175],[175,150]]}]};
for(const [label,design] of [
  ['unsafe color',{...custom,primary:'url(https://evil.test)'}],
  ['unknown shape',{...custom,shape:'script'}],
  ['unknown decoration',{...custom,decorations:[{...custom.decorations[0],kind:'script'}]}],
  ['excess decorations',{...custom,decorations:Array.from({length:25},()=>custom.decorations[0])}],
  ['out of bounds drawing',{...custom,strokes:[{...custom.strokes[0],points:[[321,40]]}]}],
  ['too many points per stroke',{...custom,strokes:[{...custom.strokes[0],points:Array.from({length:161},()=>[30,40])}]}],
  ['too many total points',{...custom,strokes:Array.from({length:16},()=>({...custom.strokes[0],points:Array.from({length:160},()=>[30,40])}))}],
  ['invalid personal speed',{...custom,speed:12}]
]){r=await req('wishes','POST',{...fresh(),design});ok(label+' rejected',r.status===400);}
const first={...fresh(),design:custom};r=await req('wishes','POST',first);ok('guest submits custom drawing and decorations',r.status===201&&JSON.stringify(r.data.wish.design)===JSON.stringify(custom));
r=await req('wishes','POST',{...first,message:'changed',design:{...custom,shape:'heart'}});ok('retry does not duplicate and returns saved text',r.status===200&&r.data.wish.message===first.message&&JSON.stringify(r.data.wish.design)===JSON.stringify(custom));
r=await req('wishes','POST',{...fresh(),device:first.device});ok('device throttle',r.status===429);
const scene={theme:'aurora',intensity:98,brightness:140,lanterns:true,fireflies:false,fireworks:true,water:true};
const config={scene,float_ms:16000,title:'งานทดสอบ',place:'ข้อมูลจำลอง',interval_ms:2200,accepting:true,moderation:true,paused:false};
r=await req('events/'+eventId,'PATCH',config,owner);ok('owner enables moderation and changes scene',r.status===200&&r.data.event.float_ms===16000&&JSON.stringify(r.data.event.scene)===JSON.stringify(scene));
r=await req('events/'+eventId,'PATCH',{...config,float_ms:200},owner);ok('invalid global speed rejected',r.status===400);
r=await req('events/'+eventId,'PATCH',{...config,scene:{...scene,theme:'unknown'}},owner);ok('invalid scene rejected',r.status===400);
r=await req('events/'+eventId,'PATCH',{...config,interval_ms:600},owner);ok('fine release interval accepted',r.status===200&&r.data.event.interval_ms===600);
r=await req('events/'+eventId,'PATCH',config,{...owner,'oai-authenticated-user-id':'other'});ok('scene cannot be changed by another organizer',r.status===403);
r=await req('events/'+eventId+'/manage','GET',undefined,owner);ok('moderator sees exact custom art',JSON.stringify(r.data.wishes.find(w=>w.id===first.id).design)===JSON.stringify(custom));
r=await req('events/'+eventId+'/feed');ok('display gets exact art and scene without private fields',JSON.stringify(r.data.wishes[0].design)===JSON.stringify(custom)&&r.data.event.scene.theme==='aurora'&&!('owner' in r.data.event)&&!('scene_json' in r.data.event)&&!('device' in r.data.wishes[0])&&!('design_json' in r.data.wishes[0]));
const pending=fresh();r=await req('wishes','POST',pending);ok('new wish pending',r.status===201&&r.data.wish.status==='pending'&&r.data.wish.design.shape==='lotus');
r=await req('events/'+eventId+'/feed');ok('pending excluded',r.data.wishes.length===1);const cursor=r.data.cursor;
r=await req('events/'+eventId+'/manage','PATCH',{id:pending.id,status:'approved'},owner);assert.equal(r.status,200);
r=await req('events/'+eventId+'/feed?after='+cursor);ok('late approval appears after cursor',r.data.wishes[0]?.id===pending.id);
r=await req('events/'+eventId+'/manage','PATCH',{id:first.id,status:'hidden'},owner);assert.equal(r.status,200);
r=await req('events/'+eventId+'/feed');ok('hidden removed and removal delivered',!r.data.wishes.some(w=>w.id===first.id)&&r.data.hidden.some(w=>w.id===first.id));
await req('events/'+eventId,'PATCH',{...config,moderation:false},owner);
const results=await Promise.all(Array.from({length:100},(_,i)=>req('wishes','POST',{...fresh(),design:{...custom,shape:['lotus','leaf','swan','heart','moon','star','palace','boat'][i%8]}})));
ok('100 concurrent custom-design requests persisted',results.every(r=>r.status===201));
let after=0,all=[];for(let i=0;i<4;i++){r=await req('events/'+eventId+'/feed?after='+after);all.push(...r.data.wishes);after=r.data.cursor;if(r.data.wishes.length<100)break;}
ok('cursor pagination retrieves all 101 approved without duplicates',all.length===101&&new Set(all.map(w=>w.id)).size===101);
ok('all eight shapes delivered to display',new Set(all.map(w=>w.design.shape)).size===8);
for(const route of ['/','/studio','/display/demo','/join/'+eventId]){
  const page=await mf.dispatchFetch(origin+route);const html=await page.text();
  ok('page renders '+route,page.status===200&&html.includes('lang="th"')&&!html.includes('Internal Server Error'));
}
await req('events/'+eventId,'PATCH',{...config,accepting:false},owner);r=await req('wishes','POST',fresh());ok('closed event blocks submissions',r.status===409);
r=await req('events/'+eventId+'/qr');ok('real SVG QR generated',r.status===200&&r.data.includes('<svg'));

// Event-night additions: use the same compiled Worker and disposable database.
const foreign={...owner,'oai-authenticated-user-id':'other-organizer'};
const led={fontScale:1.65,qrPosition:'bottom-left',qrSize:192,showQR:true,showLogo:true,showControls:false,highlight:true,safeMargin:5};
r=await req('events/'+eventId,'PATCH',{...config,led},owner);ok('owner persists LED settings',r.status===200&&r.data.event.led.fontScale===1.65&&r.data.event.led.qrPosition==='bottom-left');
// Compare by fields because validation deliberately canonicalizes property order.
assert.deepEqual(r.data.event.led,led);
r=await req('events/'+eventId,'PATCH',{...config,led:{...led,fontScale:99}},owner);ok('invalid LED scale rejected',r.status===400);
r=await req('events/'+eventId,'PATCH',{...config,led:{...led,qrPosition:'center'}},owner);ok('invalid QR placement rejected',r.status===400);
r=await req('events/'+eventId,'PATCH',{...config,led:{...led,showLogo:'yes'}},owner);ok('invalid LED boolean rejected',r.status===400);
r=await req('events/'+eventId,'PATCH',{...config,led},foreign);ok('other organizer cannot change LED settings',r.status===403);
r=await req('events/'+eventId,'PATCH',config,owner);ok('older settings clients preserve saved LED settings',r.status===200&&r.data.event.led.fontScale===1.65&&r.data.event.led.qrPosition==='bottom-left');
r=await req('events/'+eventId);ok('public event exposes safe metadata and server clock only',r.status===200&&r.data.serverTime>Date.now()-2000&&!('led_json' in r.data.event)&&!('ceremony_json' in r.data.event)&&!('owner' in r.data.event));
const ceremonyRequest={id:crypto.randomUUID(),action:'start',seconds:15,count:6};
r=await req('events/'+eventId+'/ceremony','POST',ceremonyRequest);ok('anonymous cannot start ceremony',r.status===401);
r=await req('events/'+eventId+'/ceremony','POST',ceremonyRequest,foreign);ok('other organizer cannot start ceremony',r.status===403);
r=await req('events/'+eventId+'/ceremony','POST',ceremonyRequest,owner,{origin:'https://evil.test'});ok('ceremony requires same origin',r.status===403);
r=await req('events/'+eventId+'/ceremony','POST',{...ceremonyRequest,seconds:0},owner);ok('invalid countdown rejected',r.status===400);
r=await req('events/'+eventId+'/ceremony','POST',{...ceremonyRequest,count:13},owner);ok('oversized ceremony rejected',r.status===400);
const notApproved={...fresh(),name:'ยังไม่อนุมัติ'};r=await req('wishes','POST',notApproved);assert.equal(r.data.wish.status,'pending');
r=await req('events/'+eventId+'/ceremony','POST',ceremonyRequest,owner);const ceremony=r.data.ceremony;
ok('owner starts scheduled ceremony with shared clock',r.status===201&&ceremony.count===6&&ceremony.startsAt===r.data.serverTime+3500&&ceremony.releaseAt-ceremony.startsAt===15000&&ceremony.endsAt-ceremony.releaseAt===18000&&!('wishIds' in ceremony));
r=await req('events/'+eventId+'/ceremony','POST',ceremonyRequest,owner);ok('ceremony retries preserve schedule without duplicate start',r.status===200&&JSON.stringify(r.data.ceremony)===JSON.stringify(ceremony));
r=await req('events/'+eventId+'/ceremony','POST',{...ceremonyRequest,id:crypto.randomUUID()},owner);ok('overlapping ceremony rejected',r.status===409);
r=await req('events/'+eventId,'PATCH',{...config,ceremony:null},owner);ok('saving event settings cannot overwrite a running ceremony',r.status===200&&r.data.event.ceremony.id===ceremony.id);
r=await req('events/'+eventId+'/feed?limit=0');const fleet=r.data.ceremonyWishes;
ok('ceremony batch contains only approved wishes with complete art',fleet.length===6&&!fleet.some(w=>w.id===first.id||w.id===notApproved.id)&&fleet.every(w=>w.design&&w.name&&w.message&&!('device' in w))&&r.data.wishes.length===0);
const otherScreen=await req('events/'+eventId+'/feed?limit=0');ok('two displays receive the same ordered batch and release time',otherScreen.data.event.ceremony.releaseAt===ceremony.releaseAt&&JSON.stringify(otherScreen.data.ceremonyWishes.map(w=>w.id))===JSON.stringify(fleet.map(w=>w.id)));
r=await req('events/'+eventId+'/feed?ceremonySeen='+ceremony.id);ok('seen ceremony does not resend drawing payloads',!('ceremonyWishes' in r.data));
r=await req('events/'+eventId+'/manage','PATCH',{id:fleet[0].id,status:'hidden'},owner);assert.equal(r.status,200);
r=await req('events/'+eventId+'/feed');ok('moderation removes a ceremony wish and sends removal update',r.data.ceremonyWishes.length===5&&!r.data.ceremonyWishes.some(w=>w.id===fleet[0].id)&&r.data.hidden.some(w=>w.id===fleet[0].id));
r=await req('events/'+eventId+'/ceremony','POST',{action:'cancel',id:crypto.randomUUID()},owner);ok('stale cancellation cannot stop current ceremony',r.status===409);
r=await req('events/'+eventId+'/ceremony','POST',{action:'cancel',id:ceremony.id},owner);ok('organizer can cancel a ceremony',r.status===200&&r.data.ceremony.status==='cancelled');
r=await req('events/'+eventId+'/feed');ok('cancelled ceremony stops transmitting a batch',r.data.event.ceremony.status==='cancelled'&&!('ceremonyWishes' in r.data));
const races=await Promise.all([1,2].map(()=>req('events/'+eventId+'/ceremony','POST',{...ceremonyRequest,id:crypto.randomUUID(),seconds:10},owner)));
ok('simultaneous organizers cannot overwrite a ceremony',races.filter(x=>x.status===201).length===1&&races.filter(x=>x.status===409).length===1);
const raceWinner=races.find(x=>x.status===201).data.ceremony;await req('events/'+eventId+'/ceremony','POST',{id:raceWinner.id,action:'cancel'},owner);
const empty=(await req('events','POST',{title:'งานไม่มีคำอวยพร',place:'ข้อมูลทดสอบ'},owner)).data.event;
r=await req('events/'+empty.id+'/ceremony','POST',{...ceremonyRequest,id:crypto.randomUUID()},owner);ok('empty event cannot start a phantom ceremony',r.status===409);
r=await req('events/'+eventId+'/archive');ok('archive requires organizer login',r.status===401);
r=await req('events/'+eventId+'/archive','GET',undefined,foreign);ok('archive rejects another organizer',r.status===403);
r=await req('events/'+eventId+'/archive?status=script','GET',undefined,owner);ok('archive rejects invalid status',r.status===400);
r=await req('events/'+eventId+'/archive?after=-1','GET',undefined,owner);ok('archive rejects invalid cursor',r.status===400);
await req('events/'+eventId,'PATCH',{...config,moderation:false},owner);
const archiveRequests=await Promise.all(Array.from({length:120},(_,i)=>req('wishes','POST',{...fresh(),name:i===0?'=2+2 & <test>':i===1?'ค้นคำ 100%':'รายชื่อ '+i,message:i===1?'คำอวยพร _ เครื่องหมาย':'ความทรงจำของบางทอง',design:custom})));
ok('120 additional archive rows persist',archiveRequests.every(x=>x.status===201));
const startPage=await req('events/'+eventId+'/archive','GET',undefined,owner);const a1=startPage.data;
ok('archive provides first 200 rows and a stable upper bound',a1.rows.length===200&&a1.hasMore&&a1.total===223&&Number.isSafeInteger(a1.snapshot));
const late={...fresh(),name:'เข้ามาหลังเริ่มดาวน์โหลด'};assert.equal((await req('wishes','POST',late)).status,201);
const a2=(await req('events/'+eventId+'/archive?after='+a1.cursor+'&snapshot='+a1.snapshot,'GET',undefined,owner)).data;
const archived=[...a1.rows,...a2.rows];ok('archive retrieves all matching pages without gaps or duplicates',archived.length===223&&new Set(archived.map(x=>x.id)).size===223&&!a2.hasMore&&a2.total===223);
ok('archive snapshot excludes later arrivals',!archived.some(x=>x.id===late.id));
ok('archive omits device and drawing payloads',archived.every(x=>!('device' in x)&&!('design_json' in x)&&!('design' in x)&&typeof x.shape==='string'));
r=await req('events/'+eventId+'/archive?q='+encodeURIComponent('%'),'GET',undefined,owner);ok('search treats percent as a literal character',r.data.total===1&&r.data.rows[0].name==='ค้นคำ 100%');
r=await req('events/'+eventId+'/archive?q='+encodeURIComponent("' OR 1=1 --"),'GET',undefined,owner);ok('archive search does not interpret SQL',r.status===200&&r.data.total===0);
r=await req('events/'+eventId+'/archive?q='+encodeURIComponent('=2+2'),'GET',undefined,owner);ok('archive preserves formula-looking names as literal text',r.data.rows[0].name==='=2+2 & <test>');
r=await req('events/'+eventId+'/archive?status=pending','GET',undefined,owner);ok('pending filter returns only pending wishes',r.data.total===1&&r.data.rows[0].id===notApproved.id);
r=await req('events/'+eventId+'/archive?status=hidden','GET',undefined,owner);ok('hidden filter returns removed wishes',r.data.total===2&&r.data.rows.every(x=>x.status==='hidden'));
r=await req('events/'+empty.id+'/archive','GET',undefined,owner);ok('archive remains scoped to the selected event',r.data.total===0&&r.data.rows.length===0);
await req('events/'+eventId,'PATCH',{...config,accepting:false},owner);r=await req('events/'+eventId+'/archive','GET',undefined,owner);ok('archive remains available after closing event',r.status===200&&r.data.total===224);
const authPage=await mf.dispatchFetch(origin+'/admin/'+eventId,{headers:owner});const authHTML=await authPage.text();ok('organizer route renders event controls',authPage.status===200&&authHTML.includes('lang="th"')&&!authHTML.includes('Internal Server Error'));

// Realistic metadata uses the existing design JSON without changing legacy records.
const realEvent=(await req('events','POST',{title:'สมจริง',place:'ข้อมูลจำลอง'},owner)).data.event.id;
const realistic={...custom,realism:{shape:true,color:true,decor:true,light:true,base:'coconut',tone:'moon',finish:'dew',saturation:1.2,exposure:1.1,contrast:1.15,lightPreset:'moon',reflection:75,ripples:true,smoke:false,sparks:true,motion:'breeze',flameSize:1.2},decorations:[{kind:'rose',x:95,y:165,scale:.7,rotation:-20,color:'#f3a7bf',realAsset:'rose'},{kind:'leaf',x:220,y:155,scale:.8,rotation:15,color:'#ddbd68',realAsset:'goldleaf'}]};
const realWish={...fresh(),event_id:realEvent,design:realistic};
r=await req('wishes','POST',realWish);ok('realistic submission preserves every setting, stroke and asset',r.status===201);assert.deepEqual(r.data.wish.design,realistic);
r=await req('events/'+realEvent+'/feed');ok('display receives exact realistic design with no image bytes',r.data.wishes.length===1&&!JSON.stringify(r.data).includes('data:image'));assert.deepEqual(r.data.wishes[0].design,realistic);
r=await req('events/'+realEvent+'/archive','GET',undefined,owner);ok('archive identifies the photographic base for Excel',r.status===200&&r.data.rows[0].shape==='real:coconut');
r=await req('events/'+realEvent+'/manage','GET',undefined,owner);ok('moderator receives same realistic art',r.status===200);assert.deepEqual(r.data.wishes[0].design,realistic);
r=await req('wishes','POST',{...realWish,design:custom});ok('realistic retry retains the submitted version',r.status===200);assert.deepEqual(r.data.wish.design,realistic);
for(const [label,design] of [
 ['external image URL',{...realistic,realism:{...realistic.realism,base:'https://evil.test/x.png'}}],
 ['unknown photographic decoration',{...realistic,decorations:[{...realistic.decorations[0],realAsset:'external'}]}],
 ['mismatched realistic decoration',{...realistic,decorations:[{...realistic.decorations[0],realAsset:'leaf'}]}],
 ['invalid realistic toggle',{...realistic,realism:{...realistic.realism,shape:'yes'}}],
 ['out of range reflection',{...realistic,realism:{...realistic.realism,reflection:101}}],
 ['out of range flame',{...realistic,realism:{...realistic.realism,flameSize:5}}],
 ['out of range tone control',{...realistic,realism:{...realistic.realism,exposure:10}}],
 ['unknown surface',{...realistic,realism:{...realistic.realism,finish:'url(x)'}}],
 ['incomplete realistic settings',{...realistic,realism:{shape:true}}]
]){r=await req('wishes','POST',{...fresh(),event_id:realEvent,design});ok(label+' rejected',r.status===400);}
for(const base of ['banana','lotus','marigold','orchid','coconut','swan']){
 const d={...realistic,realism:{...realistic.realism,base}};
 r=await req('wishes','POST',{...fresh(),event_id:realEvent,design:d});ok('realistic base '+base+' persists',r.status===201);assert.deepEqual(r.data.wish.design,d);
}
const hybrid={...realistic,realism:{...realistic.realism,shape:false,color:true,decor:false,light:true,reflection:0,ripples:false,smoke:false,sparks:false}};
r=await req('wishes','POST',{...fresh(),event_id:realEvent,design:hybrid});ok('independent normal and realistic modes preserve false and zero',r.status===201);assert.deepEqual(r.data.wish.design,hybrid);

console.log(JSON.stringify({checks,concurrentSubmissions:100,archiveRows:224,scope:'isolated compiled Worker and disposable D1'}));
}finally{await mf.dispose();}

