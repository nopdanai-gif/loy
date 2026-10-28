import {createRequire} from 'node:module';import {readdirSync,readFileSync} from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json')),{Miniflare}=wranglerRequire('miniflare'),root=path.resolve('dist/server'),files=readdirSync(root,{recursive:true}).filter(f=>/\.m?js$/.test(f));
const mf=new Miniflare({modulesRoot:root,modules:['index.js',...files.filter(f=>f!=='index.js')].map(f=>({type:'ESModule',path:path.join(root,f)})),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'load-db'},cf:false,port:0});
const origin='https://load.test',owner={'oai-authenticated-user-id':'load-owner','oai-authenticated-user-email':'load@example.test'};
async function request(route,method='GET',body,headers={}){const start=performance.now(),r=await mf.dispatchFetch(origin+'/api/'+route,{method,headers:{...(body?{'Content-Type':'application/json',origin}:{}),...headers},body:body?JSON.stringify(body):undefined}),text=await r.text();return {status:r.status,data:JSON.parse(text),bytes:Buffer.byteLength(text),ms:performance.now()-start};}
const design={v:1,shape:'lotus',primary:'#f39cbc',secondary:'#59b99b',glow:'#ffb671',glowPower:91,candles:3,speed:1.4,decorations:Array.from({length:24},(_,i)=>({kind:'rose',realAsset:'rose',x:45+i%8*30,y:100+Math.floor(i/8)*40,scale:.65,rotation:-20,color:'#f4b4ca'})),strokes:Array.from({length:40},(_,i)=>({color:'#ffd79c',width:4,points:Array.from({length:60},(_,j)=>[(j*5+i)%320,(j*11+i*5)%250])})),realism:{shape:true,color:true,decor:true,light:true,base:'lotus',tone:'warm',finish:'dew',saturation:1.2,exposure:1.1,contrast:1.15,lightPreset:'candle',reflection:75,ripples:true,smoke:true,sparks:true,motion:'gentle',flameSize:1.2}};
let checks=0;function ok(label,v){assert.ok(v,label);checks++;console.log('PASS '+label)}
try{
 const db=await mf.getD1Database('DB'),journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
 for(const e of journal.entries)for(const sql of readFileSync('drizzle/'+e.tag+'.sql','utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
 const event=(await request('events','POST',{title:'ทดสอบโหลด',place:'ฐานข้อมูลจำลอง'},owner)).data.event;
 const submitted=[],latencies=[],begin=performance.now();
 for(let round=0;round<5;round++){
  const entries=Array.from({length:200},(_,i)=>({id:crypto.randomUUID(),device:crypto.randomUUID(),event_id:event.id,name:'กระทง '+(round*200+i),message:'ขอให้ครอบครัวมีความสุขและสุขภาพแข็งแรง',style:0,consent:true,design}));
  const result=await Promise.all(entries.map(w=>request('wishes','POST',w,{'cf-connecting-ip':'198.51.100.8'})));
  assert.ok(result.every(r=>r.status===201),JSON.stringify(result.filter(r=>r.status!==201).map(r=>({status:r.status,error:r.data.error}))));
  submitted.push(...entries);latencies.push(...result.map(r=>r.ms));console.log('Stored '+submitted.length+' / 1000 max-detail wishes');
 }
 ok('1000 full-detail wishes accepted in bursts of 200 from one shared IP',submitted.length===1000);
 const elapsed=performance.now()-begin;
 let cursor=0,maxBytes=0,pages=0;const received=new Set(),times=[];let first;
 for(let i=0;i<1000;i++){
  const r=await request('events/'+event.id+'/feed?after='+cursor+'&limit=100');assert.equal(r.status,200);if(!first)first=r;
  maxBytes=Math.max(maxBytes,r.bytes);times.push(r.ms);pages++;
  assert.ok(r.bytes<=192*1024+4096,'normal feed bounded by byte budget');
  for(const w of r.data.wishes){assert.ok(!received.has(w.id));received.add(w.id);assert.equal(w.design.strokes.length,40);assert.equal(w.design.decorations.length,24);}
  if(!r.data.hasMore)break;assert.ok(r.data.cursor>cursor,'cursor advances');cursor=r.data.cursor;
 }
 ok('all 1000 complete designs arrive without gaps or duplicate IDs',received.size===1000&&submitted.every(w=>received.has(w.id)));
 ok('large artwork is split into bounded pages',first.data.wishes.length<100&&pages>10);
 const full=await request('events/'+event.id+'/feed?after=5&limit=0');ok('a full screen queue can poll controls without consuming wishes',full.data.wishes.length===0&&full.data.cursor===5);
 const hidden=submitted[500];await request('events/'+event.id+'/manage','PATCH',{id:hidden.id,status:'hidden'},owner);
 const updates=await request('events/'+event.id+'/feed?after=5&limit=0');ok('moderation removals still arrive while queue is full',updates.data.hidden.some(x=>x.id===hidden.id));
 const retried=await request('wishes','POST',submitted[0],{'cf-connecting-ip':'198.51.100.8'});ok('retry after a busy burst reuses saved wish without duplicate',retried.status===200&&retried.data.wish.id===submitted[0].id);
 const stats=await request('events/'+event.id+'/manage?limit=25','GET',undefined,owner);ok('organizer page is bounded to 25 wishes with accurate total',stats.data.wishes.length===25&&stats.data.counts.reduce((n,x)=>n+x.n,0)===1000);
 const ceremony=await request('events/'+event.id+'/ceremony','POST',{id:crypto.randomUUID(),action:'start',seconds:10,count:12},owner);assert.equal(ceremony.status,201);
 const fleet=await request('events/'+event.id+'/feed?limit=0');ok('ceremony preserves feed sequence for future deduplication',fleet.data.ceremonyWishes.length===12&&fleet.data.ceremonyWishes.every(w=>Number.isSafeInteger(w.seq)&&w.seq>0));
 for(const q of ['after=NaN','after=Infinity','hiddenAfter=-1','limit=1.5'])assert.equal((await request('events/'+event.id+'/feed?'+q)).status,400);ok('invalid cursors and fractional limits rejected',true);
 const plan=await db.prepare("EXPLAIN QUERY PLAN SELECT seq FROM feed WHERE event_id=? AND action='hide' AND seq>? ORDER BY seq LIMIT 100").bind(event.id,0).all();ok('removal cursor uses the event/action/sequence index',JSON.stringify(plan.results).includes('feed_event_action_cursor'));
 latencies.sort((a,b)=>a-b);times.sort((a,b)=>a-b);
 console.log(JSON.stringify({checks,scope:'isolated compiled Worker and disposable D1; not production capacity or browser FPS',submissions:1000,concurrency:200,designBytes:Buffer.byteLength(JSON.stringify(design)),submissionSeconds:+(elapsed/1000).toFixed(2),submissionP95Ms:+latencies[Math.floor(latencies.length*.95)].toFixed(1),feedPages:pages,maxFeedBytes:maxBytes,feedP95Ms:+times[Math.floor(times.length*.95)].toFixed(1)}));
}finally{await mf.dispose()}
