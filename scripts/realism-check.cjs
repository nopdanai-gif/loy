// Local model/SSR/export checks. Does not navigate a browser or write live data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=process.cwd(),local=createRequire(root+'/package.json'),ts=local('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);
const React=local('react'),{renderToStaticMarkup}=local('react-dom/server');
const {defaultDesign,sampleDesign,validateDesign}=require(root+'/app/design.ts');
const {DEFAULT_REALISM,REAL_BASES,REAL_DECORATIONS,REAL_TONES,FINISHES,baseAsset,decorationAsset}=require(root+'/app/realism.ts');
const Art=require(root+'/app/components/KrathongArt.tsx').default,Options=require(root+'/app/components/RealisticOptions.tsx').default,Editor=require(root+'/app/components/KrathongEditor.tsx').default;
const {inlineRealisticImages,isRealisticAsset}=require(root+'/app/inline-svg.ts');
let checks=0;const ok=(name,v)=>{assert.ok(v,name);checks++;console.log('PASS '+name);};
const design={...defaultDesign(),realism:{...DEFAULT_REALISM,shape:true,color:true,decor:true,light:true},decorations:REAL_DECORATIONS.map((d,i)=>({kind:d.kind,realAsset:d.id,x:65+i%6*38,y:155+Math.floor(i/6)*28,scale:.5,rotation:0,color:'#d7cfae'})),strokes:[{color:'#ffe7b7',width:3,points:[[120,170],[150,185],[180,170]]}]};
const render=d=>renderToStaticMarkup(React.createElement(Art,{design:d}));
(async()=>{
 for(let i=0;i<8;i++){const d=sampleDesign(i);assert.deepEqual(validateDesign(d),d);ok('legacy shape '+i+' retains vector art',!render(d).includes('<image'));}
 for(let i=0;i<16;i++){
  const r={...DEFAULT_REALISM,...Object.fromEntries(['shape','color','decor','light'].map((key,n)=>[key,!!(i&(1<<n))]))};
  const d={...design,realism:r};assert.deepEqual(validateDesign(d),d);
  const svg=render(d);ok('mode combination '+i+' independently chooses photographic assets',svg.includes('base-banana.webp')===r.shape&&svg.includes('decor-rose.webp')===r.decor&&svg.includes('real-ripples')===r.light);
 }
 for(const b of REAL_BASES)ok('base '+b.id+' is packaged',fs.statSync(root+'/public'+baseAsset(b.id)).size<300000);
 for(const d of REAL_DECORATIONS.filter(d=>d.photo))ok('decoration '+d.id+' is packaged',fs.statSync(root+'/public'+decorationAsset(d.id)).size<100000);
 const ids=[...render(design).matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);ok('SVG definitions have unique IDs',new Set(ids).size===ids.length);
 const refs=[...render(design).matchAll(/(?:url\(#|href="#)([^)" ]+)/g)].map(x=>x[1]);ok('every SVG gradient, mask and reflection resolves',refs.every(id=>ids.includes(id)));
 const names={shape:'1.1',color:'2.1',decor:'3.1',light:'4.1'};
 for(const tab of Object.keys(names)){const html=renderToStaticMarkup(React.createElement(Options,{tab,value:design,onChange:()=>{},onAdd:()=>{},preview:false,onPreview:()=>{}}));ok('realistic '+tab+' panel renders',html.includes(names[tab])&&html.includes('<button'));}
 const editor=renderToStaticMarkup(React.createElement(Editor,{value:design,onChange:()=>{}}));ok('editor exposes normal and realistic choices while preserving drawing tools',editor.includes('แบบปกติ')&&editor.includes('แบบสมจริง')&&editor.includes('ยางลบเส้น'));
 const imgNode=href=>({href,getAttribute(){return this.href},setAttribute(k,v){if(k==='href')this.href=v},removeAttribute(){}});
 const imageNodes=[imgNode(baseAsset('banana')),imgNode(baseAsset('banana')),...REAL_DECORATIONS.filter(d=>d.photo).map(d=>imgNode(decorationAsset(d.id)))];
 const requests=[];
 global.FileReader=class {readAsDataURL(b){b.arrayBuffer().then(a=>{this.result='data:'+b.type+';base64,'+Buffer.from(a).toString('base64');this.onload()}).catch(e=>this.onerror(e))}};
 const originalFetch=global.fetch;
 global.fetch=async p=>{requests.push(p);return new Response(fs.readFileSync(root+'/public'+p),{headers:{'Content-Type':'image/webp'}})};
 await inlineRealisticImages({querySelectorAll:()=>imageNodes});
 ok('souvenir embeds all photographs as data URLs',imageNodes.every(n=>n.href.startsWith('data:image/webp;base64,')));
 ok('souvenir fetches repeated base only once',requests.filter(p=>p===baseAsset('banana')).length===1);
 ok('only packaged assets are allowed',!isRealisticAsset('https://evil.test/a.webp')&&!isRealisticAsset('/assets/realistic/../private'));
 await assert.rejects(()=>inlineRealisticImages({querySelectorAll:()=>[imgNode('https://evil.test/a.webp')]}));ok('export rejects external asset URLs',true);
 global.fetch=async()=>new Response('',{status:404});await assert.rejects(()=>inlineRealisticImages({querySelectorAll:()=>[imgNode(baseAsset('swan'))]}));ok('export reports missing image instead of silently omitting it',true);global.fetch=originalFetch;
 if(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES){
  const sharp=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/sharp'),cache=new Map();
  for(const p of [ ...REAL_BASES.map(b=>baseAsset(b.id)),...REAL_DECORATIONS.filter(d=>d.photo).map(d=>decorationAsset(d.id))]){
   const meta=await sharp(root+'/public'+p).metadata();assert.equal(meta.hasAlpha,true);const stats=await sharp(root+'/public'+p).stats();assert.equal(stats.channels[3].min,0);assert.ok(stats.channels[3].max>200);cache.set(p,(await sharp(root+'/public'+p).png().toBuffer()).toString('base64'));
  }
  ok('all 12 photographic assets have real transparency and visible content',true);
  // librsvg has no WebP loader. Decode the same bytes to PNG solely for native visual QA.
  async function raster(d){let svg=render(d).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="640" height="500" ');for(const [p,b64] of cache)svg=svg.replaceAll('href="'+p+'"','href="data:image/png;base64,'+b64+'"');return sharp(Buffer.from(svg)).png().toBuffer();}
  const hashes=[];for(const b of REAL_BASES){const png=await raster({...design,realism:{...design.realism,base:b.id}});hashes.push(require('node:crypto').createHash('sha256').update(png).digest('hex'));}
  ok('six full designs render distinct nonempty images',new Set(hashes).size===6);
  const tones=[];for(const [tone] of REAL_TONES){const p=await raster({...design,realism:{...design.realism,tone}});tones.push(require('node:crypto').createHash('sha256').update(p).digest('hex'));}ok('eight color tones change rendered pixels',new Set(tones).size===8);
  const finishes=[];for(const [finish] of FINISHES){const p=await raster({...design,realism:{...design.realism,finish}});finishes.push(require('node:crypto').createHash('sha256').update(p).digest('hex'));}ok('four surface finishes change rendered pixels',new Set(finishes).size===4);
 }
 console.log(JSON.stringify({checks,scope:'design validation, SSR, assets, export embedding, native SVG (not browser UI)'}));
})().catch(e=>{console.error(e);process.exitCode=1});
