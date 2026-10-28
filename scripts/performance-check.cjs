const fs=require('node:fs'),assert=require('node:assert/strict'),{createRequire}=require('node:module');const repo=process.cwd(),local=createRequire(repo+'/package.json'),ts=local('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);
const {RenderPool}=require(repo+'/app/render-pool.ts');const {QUEUE_LIMIT,FEED_BATCH,makeCheckpoint,readCheckpoint,appendFeed,rememberShown,MAX_VISIBLE_BOATS}=require(repo+'/app/display-queue.ts');const {WorkGate}=require(repo+'/app/work-gate.ts');const {requestJSON}=require(repo+'/app/request.ts');
let checks=0;function ok(name,condition){assert.ok(condition,name);checks++;console.log('PASS '+name)}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const data=Array.from({length:5000},(_,i)=>({seq:i+1,id:'wish-'+(i+1),name:'name',message:'wish',style:0})),special=new Map(data.slice(4500,4512).map(w=>[w.id,w.seq])),shown=new Set();
 let queue=[],active=[],cursor=0,received=new Set(),maximumQueue=0,largestCheckpoint=0,reloads=0;
 for(let step=0;step<20000&&(cursor<5000||queue.length||active.length);step++){
  const limit=Math.min(FEED_BATCH,QUEUE_LIMIT-queue.length),incoming=data.slice(cursor,cursor+limit);
  queue=appendFeed(queue,incoming,active,new Set([...shown,...special.keys()]),new Set());cursor+=incoming.length;
  for(const [id,seq] of special)if(seq<=cursor)special.delete(id);
  maximumQueue=Math.max(maximumQueue,queue.length);
  if(queue.length&&active.length<18)active.push(queue.shift());
  // Different durations finish out of order, as on the real river.
  if(active.length>3||!queue.length){const index=step%2===0?active.length-1:0,done=active.splice(index,1)[0];if(done){assert.ok(!received.has(done.id),'no replay after restart');received.add(done.id);rememberShown(shown,[done.id]);}}
  const snapshot=makeCheckpoint(cursor,[...active,...queue],shown,special);largestCheckpoint=Math.max(largestCheckpoint,JSON.stringify(snapshot).length);
  if(step>0&&step%317===0){const resume=readCheckpoint(JSON.stringify(snapshot));cursor=resume.cursor;queue=[];active=[];shown.clear();resume.shown.forEach(x=>shown.add(x));special.clear();resume.special.forEach(([id,seq])=>special.set(id,seq));reloads++;}
 }
 ok('5000 arrivals drain completely with future ceremony wishes skipped',received.size===4988&&![...received].some(id=>data.slice(4500,4512).some(w=>w.id===id)));
 ok('queue stays bounded during repeated reloads',maximumQueue<=QUEUE_LIMIT&&reloads>10);
 ok('checkpoint stays small without artwork payloads',largestCheckpoint<30000);
 ok('completed-ID memory stays bounded',shown.size<=500);
 const legacy=readCheckpoint(JSON.stringify({cursor:200,queue:[{seq:150,id:'old'}],shown:['done']}));ok('old full-queue checkpoint migrates without skipping unfinished art',legacy.cursor===149);
 ok('legacy queue missing sequence safely rewinds',readCheckpoint(JSON.stringify({cursor:200,queue:[{id:'old'}]})).cursor===0);
 ok('invalid checkpoint is discarded',readCheckpoint('{bad')===null&&readCheckpoint('{"cursor":-1}')===null);
 ok('hidden wishes are removed from buffered and incoming items',appendFeed([data[0]],[data[0],data[1]],[],new Set(),new Set([data[0].id])).length===1);
 ok('all devices keep full detail with a bounded visible fleet',MAX_VISIBLE_BOATS===18);
 let running=0,peak=0,builds=0,disposed=[];const pool=new RenderPool(8,x=>disposed.push(x));
 const make=n=>async()=>{running++;peak=Math.max(peak,running);builds++;await sleep(2);running--;return n;};
 const a=pool.acquire('same',make(1)),b=pool.acquire('same',make(2));await Promise.all([a.promise,b.promise]);ok('highlight and river share one rendered image',builds===1);a.release();b.release();
 const many=Array.from({length:6},(_,i)=>pool.acquire('x'+i,make(i+2)));await Promise.all(many.map(x=>x.promise));ok('conversion never runs concurrently',peak===1);many.forEach(x=>x.release());
 const held=pool.acquire('held',make(77));await held.promise;
 for(let i=0;i<100;i++){const entry=pool.acquire('new'+i,make(100+i));await entry.promise;entry.release();assert.ok(pool.size<=8);}
 ok('old image URLs are revoked while live images stay valid',disposed.length>=90&&!disposed.includes(77));held.release();
 const blocker=pool.acquire('blocker',async()=>{await sleep(20);return 999}),cancelled=pool.acquire('cancelled',async()=>{throw new Error('must not execute')});const rejection=assert.rejects(cancelled.promise);cancelled.release();await rejection;await blocker.promise;blocker.release();ok('unmounted queued work is cancelled',true);
 let activeWrites=0,peakWrites=0;const gate=new WorkGate(3,50,1000);
 await Promise.all(Array.from({length:40},()=>gate.run(async()=>{activeWrites++;peakWrites=Math.max(peakWrites,activeWrites);await sleep(2);activeWrites--;})));
 ok('submission processing stays bounded and drains all requests',peakWrites===3&&gate.size.active===0&&gate.size.waiting===0);
 const smallGate=new WorkGate(1,1,1000);let unlock;const heldWrite=smallGate.run(()=>new Promise(resolve=>{unlock=resolve}));const abortWaiting=new AbortController();const waiting=smallGate.run(async()=>true,abortWaiting.signal);const waitingRejected=assert.rejects(waiting);await assert.rejects(()=>smallGate.run(async()=>true));abortWaiting.abort();await waitingRejected;unlock();await heldWrite;ok('overflow and cancelled requests release admission capacity',smallGate.size.active===0&&smallGate.size.waiting===0);
 const originalFetch=global.fetch;let calls=[];
 global.fetch=async(url,init)=>{calls.push({url,body:init.body});if(calls.length===1)throw new TypeError('offline');return Response.json({saved:true})};
 let retryNotice=0;const result=await requestJSON('/api/wishes','POST',{id:'same-id',message:'wish'},{timeoutMs:100,onRetry:n=>{retryNotice=n}});ok('network retry reuses exactly the same submission body',result.saved&&calls.length===2&&calls[0].body===calls[1].body&&retryNotice===1);
 calls=[];global.fetch=async(url,init)=>{calls.push(url);return Response.json({error:'bad name'},{status:400})};await assert.rejects(()=>requestJSON('/api/wishes','POST',{id:'x'}),/bad name/);ok('validation failures do not retry',calls.length===1);
 calls=[];global.fetch=async()=>{calls.push(1);throw new Error('offline')};await assert.rejects(()=>requestJSON('/api/events','POST',{title:'x'}));ok('non-idempotent creation is never retried',calls.length===1);
 let aborted=false;global.fetch=(_,init)=>new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'))})});await assert.rejects(()=>requestJSON('/api/events/x','GET',undefined,{timeoutMs:15,retries:0}));ok('a hung request times out',aborted);
 const controller=new AbortController();const request=requestJSON('/api/events/x','GET',undefined,{signal:controller.signal});controller.abort();await assert.rejects(request,e=>e.name==='AbortError');ok('leaving a page cancels its pending request',true);global.fetch=originalFetch;
 console.log(JSON.stringify({checks,arrivals:5000,reloads,maximumQueue,largestCheckpoint,peakConversions:peak,cacheLimit:8}));
})().catch(e=>{console.error(e);process.exitCode=1});
