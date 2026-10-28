// Isolated Worker/D1/R2 test data only; never the live event.
import {createRequire} from 'node:module';
import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json')),{Miniflare}=wranglerRequire('miniflare');
const sharp=createRequire(wranglerRequire.resolve('miniflare'))('sharp'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {defaultDesign}=require('../app/design.ts'),{FLAIR_PRESETS}=require('../app/flair.ts');
const root=path.resolve('dist/server'),files=readdirSync(root,{recursive:true}).filter(f=>/\.m?js$/.test(f)),modules=['index.js',...files.filter(f=>f!=='index.js')].map(f=>({type:'ESModule',path:path.join(root,f)}));
const mf=new Miniflare({modulesRoot:root,modules,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'flair-test-db'},r2Buckets:{BUCKET:'flair-test-files'},cf:false,port:0});
const origin='https://test.local',owner={'oai-authenticated-user-id':'media-owner','oai-authenticated-user-email':'owner@example.test'},other={'oai-authenticated-user-id':'another-owner'};
let checks=0;function ok(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
async function json(url,method='GET',body,identity){const res=await mf.dispatchFetch(origin+'/api/'+url,{method,headers:{...(body?{'Content-Type':'application/json',origin}:{}),...identity},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};}
let eventId;const fresh=(i=0)=>({id:crypto.randomUUID(),device:crypto.randomUUID(),event_id:eventId,name:'ผู้ร่วมงานจำลอง',message:'ขอให้ทุกคนมีความสุข',style:0,consent:true,design:{...defaultDesign(),flair:FLAIR_PRESETS[i%6].value}});
async function upload(w,kind,bytes,id=crypto.randomUUID(),extra={}){const res=await mf.dispatchFetch(origin+'/api/events/'+w.event_id+'/media/'+kind,{method:'POST',headers:{origin,'Content-Type':kind==='photo'?'image/jpeg':'audio/wav','X-Media-Consent':'yes','X-Wish-ID':w.id,'X-Device-ID':w.device,'X-Upload-ID':id,...extra},body:bytes});return {status:res.status,data:await res.json()};}
async function get(url,identity,extra={}){const res=await mf.dispatchFetch(origin+url,{headers:{...identity,...extra}});return {status:res.status,headers:res.headers,bytes:new Uint8Array(await res.arrayBuffer())};}
try{
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
 for(const entry of JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')).entries)for(const sql of readFileSync('drizzle/'+entry.tag+'.sql','utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
 const event=await json('events','POST',{title:'ทดสอบรูปและลูกเล่น',place:'ข้อมูลจำลอง'},owner);assert.equal(event.status,201);eventId=event.data.event.id;
 const config={title:'ทดสอบรูปและลูกเล่น',place:'ข้อมูลจำลอง',interval_ms:2200,float_ms:24000,accepting:true,moderation:true,paused:false};assert.equal((await json('events/'+eventId,'PATCH',config,owner)).status,200);
 const photo=await sharp({create:{width:80,height:60,channels:3,background:'#d8bd82'}}).jpeg().toBuffer(),wish=fresh(3),p=await upload(wish,'photo',photo);
 ok('photo uploads to durable object storage',p.status===201&&p.data.media.url.includes('?key='));
 const photoId=p.data.media.id,publicPhoto='/api/media/'+photoId;
 ok('unsubmitted file remains private',(await get(publicPhoto)).status===404);
 let r=await get(p.data.media.url);ok('uploader can preview their own unsubmitted photo',r.status===200&&Buffer.from(r.bytes).equals(photo));
 const retry=await upload(wish,'photo',photo,photoId);ok('identical upload retry does not duplicate storage',retry.status===201&&retry.data.media.url===p.data.media.url&&(await bucket.list()).objects.length===1);
 const different=await sharp({create:{width:40,height:40,channels:3,background:'#223344'}}).jpeg().toBuffer();ok('same ID cannot overwrite a file',(await upload(wish,'photo',different,photoId)).status===409);
 ok('another device cannot reuse the file ID',(await upload({...wish,device:crypto.randomUUID()},'photo',photo,photoId)).status===409);
 const saved=await json('wishes','POST',{...wish,photoId});ok('photo and flair persist together in a pending wish',saved.status===201&&saved.data.wish.photo.id===photoId&&saved.data.wish.status==='pending');assert.deepEqual(saved.data.wish.design,wish.design);
 ok('pending photo stays off public display',(await get(publicPhoto)).status===404);
 ok('receipt photo works while pending',(await get(saved.data.wish.photo.url)).status===200);
 ok('only this event organizer can review pending media',(await get(publicPhoto,owner)).status===200&&(await get(publicPhoto,other)).status===404);
 const managed=await json('events/'+eventId+'/manage','GET',undefined,owner);ok('moderation receives selected flair without private photo tokens',managed.data.wishes[0].photo.url===publicPhoto&&managed.data.wishes[0].design.flair.frame==='aurora'&&!JSON.stringify(managed.data).includes('read_token'));
 const feedBefore=await json('events/'+eventId+'/feed');ok('unapproved wish is absent from feed',feedBefore.data.wishes.length===0);
 const duplicate=await json('wishes','POST',{...wish,photoId});ok('lost receipt retry preserves one wish and its preview',duplicate.status===200&&duplicate.data.wish.photo.url===saved.data.wish.photo.url&&(await db.prepare('SELECT COUNT(*) AS n FROM wishes').first()).n===1);
 await json('events/'+eventId+'/manage','PATCH',{id:wish.id,status:'approved'},owner);
 r=await get(publicPhoto);const etag=r.headers.get('etag');ok('approved photo has safe content headers',r.status===200&&r.headers.get('content-type')==='image/jpeg'&&r.headers.get('x-content-type-options')==='nosniff'&&r.headers.get('cache-control').includes('must-revalidate')&&Buffer.from(r.bytes).equals(photo));
 ok('unchanged photo can reuse cached bytes after authorization',(await get(publicPhoto,undefined,{'If-None-Match':etag})).status===304);
 const feed=await json('events/'+eventId+'/feed');assert.deepEqual(feed.data.wishes[0].design.flair,wish.design.flair);ok('display receives exact flair and small photo URLs without private data',feed.data.wishes[0].photo.url===publicPhoto&&!JSON.stringify(feed.data).includes('?key=')&&!JSON.stringify(feed.data).includes(wish.device)&&!('voice' in feed.data.wishes[0])&&JSON.stringify(feed.data).length<10000);
 const ceremonyId=crypto.randomUUID();assert.equal((await json('events/'+eventId+'/ceremony','POST',{id:ceremonyId,action:'start',seconds:10,count:1},owner)).status,201);
 const ceremonyFeed=await json('events/'+eventId+'/feed');assert.deepEqual(ceremonyFeed.data.ceremonyWishes[0].design.flair,wish.design.flair);ok('simultaneous-release fleet receives the same flair and photo',ceremonyFeed.data.ceremonyWishes[0].photo.id===photoId);
 await json('events/'+eventId+'/ceremony','POST',{id:ceremonyId,action:'cancel'},owner);
 const archive=await json('events/'+eventId+'/archive','GET',undefined,owner);ok('archive retains photo link with no audio UI payload',archive.data.rows[0].photo.url===publicPhoto&&!('voice' in archive.data.rows[0]));
 await json('events/'+eventId+'/manage','PATCH',{id:wish.id,status:'hidden'},owner);
 ok('hiding revokes public cache and uploader links',(await get(publicPhoto,undefined,{'If-None-Match':etag})).status===404&&(await get(saved.data.wish.photo.url)).status===404);
 ok('organizer can still review hidden memory',(await get(publicPhoto,owner)).status===200);
 const hiddenFeed=await json('events/'+eventId+'/feed');ok('feed removes hidden photo wish',hiddenFeed.data.hidden.some(w=>w.id===wish.id)&&hiddenFeed.data.wishes.length===0);
 const unattached=fresh();ok('cross-origin uploads denied',(await upload(unattached,'photo',photo,crypto.randomUUID(),{origin:'https://other.test'})).status===403);
 ok('media consent required',(await upload(unattached,'photo',photo,crypto.randomUUID(),{'X-Media-Consent':'no'})).status===403);
 ok('wrong MIME denied',(await upload(unattached,'photo',photo,crypto.randomUUID(),{'Content-Type':'image/svg+xml'})).status===415);
 ok('disguised SVG denied',(await upload(unattached,'photo',new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).status===400);
 ok('old microphone upload endpoint is retired',(await upload(unattached,'voice',new Uint8Array(44))).status===410);
 ok('new wishes cannot attach voice IDs',(await json('wishes','POST',{...fresh(),voiceId:crypto.randomUUID()})).status===410);
 const invalid=fresh();invalid.design.flair={...invalid.design.flair,color:'url(javascript:alert(1))'};ok('invalid flair is rejected before storing wish',(await json('wishes','POST',invalid)).status===400&&!(await db.prepare('SELECT id FROM wishes WHERE id=?').bind(invalid.id).first()));
 ok('oversized image body rejected',(await upload(unattached,'photo',new Uint8Array(800*1024+1))).status===413);
 const wide=await sharp({create:{width:1601,height:8,channels:3,background:'#335577'}}).jpeg().toBuffer();ok('oversized image dimensions rejected',(await upload(unattached,'photo',wide)).status===400);
 ok('cannot attach another wish’s files',(await json('wishes','POST',{...fresh(),photoId})).status===400);
 const unsent=fresh(),orphan=await upload(unsent,'photo',photo),event2=await json('events','POST',{title:'อีกห้อง',place:'จำลอง'},owner);ok('media cannot move between events',(await json('wishes','POST',{...unsent,event_id:event2.data.event.id,photoId:orphan.data.media.id})).status===400);
 await db.prepare('UPDATE media SET created_at=? WHERE id=?').bind(Date.now()-86400001,orphan.data.media.id).run();ok('unsubmitted photo expires for uploader',(await get(orphan.data.media.url)).status===404);
 const cleanup=await upload(fresh(),'photo',photo);assert.equal(cleanup.status,201);
 ok('cleanup removes abandoned files but preserves submitted memories',!(await db.prepare('SELECT id FROM media WHERE id=?').bind(orphan.data.media.id).first())&&!(await bucket.head('wishes/'+eventId+'/'+orphan.data.media.id))&&!!(await bucket.head('wishes/'+eventId+'/'+photoId)));
 await json('events/'+eventId,'PATCH',{...config,moderation:false},owner);
 // Preserve historical recordings without offering public playback or destroying data.
 const legacy=fresh(),legacyVoiceId=crypto.randomUUID(),legacyKey='historical-private-token',legacyBytes=new Uint8Array(44);
 assert.equal((await json('wishes','POST',legacy)).status,201);
 await db.prepare('INSERT INTO media (id,event_id,submission_id,device,kind,mime,byte_size,duration_ms,digest,read_token,ready,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?)').bind(legacyVoiceId,eventId,legacy.id,legacy.device,'voice','audio/wav',44,3000,'historical',legacyKey,Date.now()).run();
 await bucket.put('wishes/'+eventId+'/'+legacyVoiceId,legacyBytes,{httpMetadata:{contentType:'audio/wav'}});await db.prepare('UPDATE wishes SET voice_id=?,voice_duration_ms=3000 WHERE id=?').bind(legacyVoiceId,legacy.id).run();
 const oldUrl='/api/media/'+legacyVoiceId;ok('historical recording retained but public playback and old preview token disabled',!!await bucket.head('wishes/'+eventId+'/'+legacyVoiceId)&&(await get(oldUrl)).status===404&&(await get(oldUrl+'?key='+legacyKey)).status===404&&(await get(oldUrl,owner)).status===200);
 const oldFeed=await json('events/'+eventId+'/feed');ok('legacy audio is absent from public payloads',!JSON.stringify(oldFeed.data).includes(legacyVoiceId)&&oldFeed.data.wishes.some(w=>w.id===legacy.id));
 const many=await Promise.all(Array.from({length:30},async(_,i)=>{const w={...fresh(i),name:'ชุดทดสอบ '+i},media=await upload(w,'photo',photo);if(media.status!==201)return media;const result=await json('wishes','POST',{...w,photoId:media.data.media.id});if(result.status===201)assert.deepEqual(result.data.wish.design.flair,w.design.flair);return result;}));
 ok('30 concurrent photo-and-flair submissions persist without mixing',many.every(r=>r.status===201)&&new Set(many.map(r=>r.data.wish.id)).size===30&&many.every(r=>!!r.data.wish.photo&&!r.data.wish.voice));
 const flooded=await json('events/'+eventId+'/feed?limit=12');ok('busy display feed remains bounded with metadata only',flooded.data.wishes.length<=12&&JSON.stringify(flooded.data).length<20000);
 await json('events/'+eventId,'PATCH',{...config,accepting:false},owner);ok('closed event rejects new uploads',(await upload(fresh(),'photo',photo)).status===409);
 const remaining=(await db.prepare("SELECT photo_id FROM wishes WHERE status='approved' AND photo_id IS NOT NULL LIMIT 1").first()).photo_id;ok('approved photo survives event closing',(await get('/api/media/'+remaining)).status===200);
 const page=await mf.dispatchFetch(origin+'/studio'),html=await page.text();ok('studio serves photo UI and fifth tab without a recorder',page.status===200&&html.includes('เพิ่มรูปความทรงจำ')&&html.includes('ลูกเล่น')&&!html.includes('อัดเสียง')&&!html.includes('<audio'));
 const assets=readdirSync('dist/client/assets').filter(f=>f.endsWith('.js')).map(f=>readFileSync('dist/client/assets/'+f,'utf8')).join('\n');ok('published client bundle contains no microphone/capture code',!/getUserMedia|MediaRecorder|voice-capture\.js|wish-voice-capture/.test(assets));
 console.log(JSON.stringify({checks,concurrentSubmissions:30,liveWrites:false}));
}finally{await mf.dispose();}
