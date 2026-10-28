// Native canvas exercises the actual export function, not a screenshot or browser.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=process.cwd(),local=createRequire(root+'/package.json'),ts=local('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw new Error('Native canvas runtime is required for this check');
const native=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas'),{createSouvenir}=require(root+'/app/souvenir.ts'),{FLAIR_PRESETS,NAMEPLATES}=require(root+'/app/flair.ts'),{drawNameplate}=require(root+'/app/flair-canvas.ts'),{defaultDesign}=require(root+'/app/design.ts');
class Image extends native.Image{set src(value){if(value.startsWith('blob:'))fetch(value).then(r=>r.arrayBuffer()).then(b=>{super.src=Buffer.from(b);});else super.src=root+'/public'+value;}get src(){return super.src;}}
global.Image=Image;let canvas;
global.document={fonts:{ready:Promise.resolve()},createElement(type){assert.equal(type,'canvas');canvas=native.createCanvas(1,1);canvas.toBlob=cb=>cb(new Blob([canvas.toBuffer('image/png')],{type:'image/png'}));return canvas;}};
(async()=>{
 let checks=0;const fixture=native.createCanvas(80,60),c=fixture.getContext('2d');c.fillStyle='#ef00e2';c.fillRect(0,0,80,60);c.fillStyle='#00ddd9';c.fillRect(0,0,30,60);
 const url=URL.createObjectURL(new Blob([fixture.toBuffer('image/png')],{type:'image/png'}));
 const art='<svg xmlns="http://www.w3.org/2000/svg" width="960" height="750"><ellipse cx="480" cy="600" rx="330" ry="50" fill="#62ac85"/><path d="M480 570 Q150 400 480 200 Q810 400 480 570" fill="#efb0ca"/><rect x="470" y="260" width="20" height="150" fill="#ffdda1"/></svg>',wish={id:'fixture',name:'ภาพทดสอบ',message:'ขอให้ทุกวันมีความสุข',style:0};
 const event={title:'ลอยกระทงบางทอง',place:'ภาพทดสอบ'},base=await createSouvenir(art,wish,event);assert.equal(canvas.width,1080);assert.equal(canvas.height,1440);const before=canvas.getContext('2d').getImageData(900,750,1,1).data;
 const withPhoto=await createSouvenir(art,{...wish,photo:{id:'p',url}},event),after=canvas.getContext('2d').getImageData(900,750,1,1).data;
 assert.equal(withPhoto.type,'image/png');assert.ok(withPhoto.size>100000);assert.notDeepEqual([...before],[...after]);assert.ok(after[0]>220&&after[2]>200&&after[1]<30);assert.notEqual(base.size,withPhoto.size);checks+=6;
 const hashes=new Set(),board=native.createCanvas(1080,960),bc=board.getContext('2d');bc.fillStyle='#06172b';bc.fillRect(0,0,1080,960);
 for(let i=0;i<FLAIR_PRESETS.length;i++){
  const preset=FLAIR_PRESETS[i],blob=await createSouvenir(art,{...wish,design:{...defaultDesign(),flair:preset.value},photo:{id:'p',url}},event);
  const pixel=canvas.getContext('2d').getImageData(900,750,1,1).data;assert.ok(pixel[0]>220&&pixel[2]>200&&pixel[1]<30,'photo pixels retained in '+preset.id);assert.equal(blob.type,'image/png');checks+=2;
  hashes.add(require('node:crypto').createHash('sha256').update(canvas.getContext('2d').getImageData(760,620,265,320).data).digest('hex'));
  const x=i%3*360,y=Math.floor(i/3)*480;bc.drawImage(canvas,x,y,360,480);
 }
 assert.equal(hashes.size,6);checks++;
 fs.writeFileSync('/tmp/krathong-flair-souvenirs.png',board.toBuffer('image/png'));
 const plates=new Set();for(const [nameplate] of NAMEPLATES){const c=native.createCanvas(400,140),ctx=c.getContext('2d');drawNameplate(ctx,{...FLAIR_PRESETS[0].value,nameplate},10,10,370,100);plates.add(require('node:crypto').createHash('sha256').update(c.toBuffer('image/png')).digest('hex'));}assert.equal(plates.size,5);checks++;
 URL.revokeObjectURL(url);console.log(JSON.stringify({checks,dimensions:'1080×1440',photoFrames:hashes.size,nameplates:plates.size,scope:'native canvas export; not browser UI'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
