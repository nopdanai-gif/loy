// Model, rendering and upload regression checks; no browser or microphone.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=process.cwd(),local=createRequire(root+'/package.json'),ts=local('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);
const {validatePhoto,validMediaId}=require(root+'/app/media.ts'),{uploadAttachment,preparePhoto}=require(root+'/app/media-client.ts');
const {defaultDesign,validateDesign,readDesign}=require(root+'/app/design.ts'),{DEFAULT_REALISM}=require(root+'/app/realism.ts');
const {FRAMES,NAMEPLATES,BADGES,ENTRANCES,AURAS,FLAIR_PRESETS,WISH_IDEAS,validateFlair,randomFlair}=require(root+'/app/flair.ts');
const React=local('react'),{renderToStaticMarkup}=local('react-dom/server'),render=(C,p)=>renderToStaticMarkup(React.createElement(C,p));
const Composer=require(root+'/app/components/AttachmentComposer.tsx').default,Attachments=require(root+'/app/components/WishAttachments.tsx').default,Art=require(root+'/app/components/KrathongArt.tsx').default;
const Options=require(root+'/app/components/FlairOptions.tsx').default,Editor=require(root+'/app/components/KrathongEditor.tsx').default,{FlairBurst,AuraLayers}=require(root+'/app/components/FlairArt.tsx');
let checks=0;function ok(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
(async()=>{
 const base=defaultDesign(),flair=FLAIR_PRESETS[1].value;
 assert.deepEqual(validateDesign(base),base);ok('old designs validate unchanged without any new fields',!('flair' in readDesign(JSON.stringify(base))));
 const original={...base,realism:{...DEFAULT_REALISM,shape:true,light:true},strokes:[{color:'#ffffff',width:3,points:[[10,10],[40,40]]}],decorations:[{kind:'rose',x:100,y:160,scale:1,rotation:30,color:'#ffbbbb'}]};
 for(const p of FLAIR_PRESETS){const d={...original,flair:p.value};assert.deepEqual(validateDesign(JSON.parse(JSON.stringify(d))),d);ok('favorite '+p.id+' retains flair, realistic art, drawings and decorations',true);}
 for(const [key,values] of Object.entries({frame:FRAMES,nameplate:NAMEPLATES,badge:BADGES,entrance:ENTRANCES,aura:AURAS})){
  for(const [value] of values)assert.ok(validateFlair({...flair,[key]:value}));
  for(const value of [null,0,{},'unknown','<img src=x>'])assert.equal(validateDesign({...base,flair:{...flair,[key]:value}}),null);
 }
 for(const color of ['red','#123','#123456;position:fixed','url(https://bad.test/a)','#ffffff00',null])assert.equal(validateFlair({...flair,color}),null);
 for(const value of [null,[],{},'gold'])assert.equal(validateDesign({...base,flair:value}),null);
 ok('all choices accepted but unknown fields and CSS injection rejected',validateFlair({...flair,extra:'drop'}).extra===undefined);
 for(let i=0;i<1000;i++)assert.ok(validateFlair(randomFlair()));
 ok('1000 randomized combinations are valid',!!validateFlair(randomFlair(()=>1))&&!!validateFlair(randomFlair(()=>0)));
 const wishes=WISH_IDEAS.flatMap(c=>c.items);ok('24 different quick wishes fit the existing submission limit',wishes.length===24&&new Set(wishes).size===24&&wishes.every(w=>Array.from(w).length<=140));
 const options=render(Options,{value:flair,onChange(){},onSave(){},onRestore(){},hasSaved:false});
 ok('flair panel renders every frame, nameplate, badge, effect and aura', [...FRAMES,...NAMEPLATES,...BADGES,...ENTRANCES,...AURAS].every(v=>options.includes(v[1]))&&options.includes('เก็บแบบนี้ไว้')&&options.includes('ลองเอฟเฟกต์'));
 ok('editor retains realistic modes and drawing while adding a fifth tab',render(Editor,{value:base,onChange(){}}).includes('05')&&render(Editor,{value:base,onChange(){}}).includes('แบบสมจริง'));
 for(const [entrance] of ENTRANCES){const f={...flair,entrance};assert.equal((render(FlairBurst,{flair:f}).match(/class="flair-particle"/g)||[]).length,entrance==='none'?0:22);assert.equal((render(FlairBurst,{flair:f,small:true}).match(/class="flair-particle"/g)||[]).length,entrance==='none'?0:8);}
 ok('all entrance effects use bounded particles and none disables them',render(FlairBurst,{})==='');
 for(const [aura] of AURAS){const d={...original,flair:{...flair,aura}},svg=render(Art,{design:d}),surface=render(Art,{design:d,surfaceOnly:true});assert.equal(svg.includes('flair-aura-layers'),aura!=='none');assert.ok(!surface.includes('flair-aura-layers'));assert.equal((surface.match(/data-deco=/g)||[]).length,1);assert.equal((surface.match(/<polyline/g)||[]).length,1);}
 ok('aura survives full export and remains a live layer over unchanged surface detail',true);
 for(const [frame] of FRAMES){const f={...flair,frame},markup=render(Composer,{photo:{id:'p',url:'blob:p'},onPhoto(){},onWorking(){},flair:f,disabled:false});assert.ok(markup.includes('photo-frame-'+frame)&&markup.includes('เปลี่ยนรูป')&&markup.includes('ลบรูปแนบ'));assert.ok(!/<audio|อัดเสียง|ไมโครโฟน/.test(markup));}
 ok('all six photo frames render with replace/remove controls and no recorder',true);
 const collapsed=render(Attachments,{photo:{id:'x',url:'/api/media/x'},flair,collapsible:true});ok('collapsed archive avoids downloading photo previews',collapsed.includes('ดูรูปแนบ')&&!collapsed.includes('<img'));
 ok('media IDs are strictly UUID-shaped',validMediaId(crypto.randomUUID())&&!validMediaId('-'.repeat(36))&&!validMediaId('../photo.jpg'));
 for(const bytes of [new Uint8Array(0),new Uint8Array(100),new TextEncoder().encode('<svg onload="alert(1)"></svg>'),Uint8Array.from([255,216,...new Array(20).fill(255),255,217])])assert.throws(()=>validatePhoto(bytes));
 ok('malformed JPEG and disguised SVG rejected',true);
 const sharp=createRequire(createRequire(local.resolve('wrangler/package.json')).resolve('miniflare'))('sharp');
 const photo=await sharp({create:{width:80,height:60,channels:3,background:'#d8bd82'}}).jpeg().toBuffer();assert.equal(validatePhoto(photo).width,80);
 const huge=await sharp({create:{width:1601,height:1,channels:3,background:'#d8bd82'}}).jpeg().toBuffer();assert.throws(()=>validatePhoto(huge));ok('JPEG accepted with existing dimension limits',true);
 await assert.rejects(()=>preparePhoto({size:13*1024*1024,type:'image/jpeg'}),/12 MB/);await assert.rejects(()=>preparePhoto({size:1,type:'image/svg+xml'}),/JPG/);ok('original image checked before expensive decoding',true);
 const oldFetch=global.fetch;let fetches=[],retry=0;
 global.fetch=async(url,options)=>{fetches.push({url,options});if(fetches.length===1)throw new Error('Network drop');return Response.json({media:{id:'upload',url:'/api/media/upload'}});};
 const attachment={id:crypto.randomUUID(),blob:new Blob([photo],{type:'image/jpeg'}),url:'blob:x'};
 const uploaded=await uploadAttachment('event','wish','device','photo',attachment,new AbortController().signal,n=>retry=n);
 ok('photo retry reuses ID and bytes after network loss',uploaded.id==='upload'&&fetches.length===2&&retry===1&&fetches[0].options.body===fetches[1].options.body&&fetches[0].options.headers['X-Upload-ID']===fetches[1].options.headers['X-Upload-ID']);
 fetches=[];global.fetch=async()=>{fetches.push(1);return Response.json({error:'invalid'},{status:400});};await assert.rejects(()=>uploadAttachment('event','wish','device','photo',attachment,new AbortController().signal,()=>{}),/invalid/);ok('invalid uploads are not retried',fetches.length===1);
 const controller=new AbortController();let aborted=false;global.fetch=async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'));}));const request=uploadAttachment('event','wish','device','photo',attachment,controller.signal,()=>{});controller.abort();await assert.rejects(request,e=>e.name==='AbortError');ok('leaving composer cancels upload',aborted);global.fetch=oldFetch;
 const clientFiles=fs.readdirSync(root+'/app',{recursive:true}).filter(p=>/\.(?:tsx?|css)$/.test(p)&&!p.includes('media-server')&&!p.startsWith('api/')).map(p=>fs.readFileSync(root+'/app/'+p,'utf8')).join('\n');
 ok('client cannot request microphone or start audio playback',!/(?:getUserMedia|AudioContext|MediaRecorder|<audio|useWishVoice|voice-player)/.test(clientFiles)&&!fs.existsSync(root+'/public/voice-capture.js'));
 console.log(JSON.stringify({checks,scope:'photo/flair validation, SSR and network simulation; no browser'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
