// Deterministic trajectory, pause/resize lifecycle, and full-detail layer regressions.
const fs=require('node:fs'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const repo=process.cwd(),local=createRequire(repo+'/package.json'),ts=local('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,f);
const React=local('react'),{renderToStaticMarkup}=local('react-dom/server');
const {riverFrames,motionSeed,animateRiverBoat}=require(repo+'/app/river-motion.ts'),{lightSources,candleHeight}=require(repo+'/app/art-motion.ts');
const {defaultDesign,validateDesign,LIMITS}=require(repo+'/app/design.ts'),{DEFAULT_REALISM,REAL_BASES}=require(repo+'/app/realism.ts');
const Art=require(repo+'/app/components/KrathongArt.tsx').default,{DisplayWater,DisplayFlames}=require(repo+'/app/components/DisplayEffects.tsx'),Display=require(repo+'/app/components/Display.tsx').default,Ambience=require(repo+'/app/components/Ambience.tsx').default;
const render=(C,props)=>renderToStaticMarkup(React.createElement(C,props));
let checks=0;function ok(name,value){assert.ok(value,name);checks++;console.log('PASS '+name);}
const coordinate=f=>f.transform.match(/translate3d\((-?[\d.]+)px,(-?[\d.]+)px,0\)/).slice(1).map(Number);
for(const width of [320,393,768,1920,3840]){
 for(let lane=0;lane<5;lane++){
  const frames=riverFrames(width,245,lane,motionSeed('wish-'+lane));
  const points=frames.map(coordinate);
  assert.equal(points[0][0],0);assert.ok(points.at(-1)[0]<-width-245);
  assert.ok(points.slice(1).every((p,i)=>p[0]<points[i][0]));
  assert.ok(new Set(points.map(p=>p[1])).size>25);
  assert.ok(points.every(p=>Math.abs(p[1])<35));assert.equal(frames.at(-1).opacity,0);
 }
 ok('all five lanes travel smoothly across '+width+'px viewport',true);
}
ok('stable seeds vary the movement of different wishes',motionSeed('same')===motionSeed('same')&&motionSeed('same')!==motionSeed('another'));
let resize,disconnected=false;global.ResizeObserver=class{constructor(cb){resize=cb}observe(){}disconnect(){disconnected=true}};
const animations=[],classes=new Set(),parent={clientWidth:1920},element={parentElement:parent,offsetWidth:245,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},animate(frames,options){const animation={frames,options,currentTime:0,playState:'running',pause(){this.playState='paused'},play(){this.playState='running'},cancel(){this.playState='cancelled'}};animations.push(animation);return animation;}};
const driver=animateRiverBoat(element,{duration:24000,lane:2,seed:42,paused:false});
ok('compositor starts the entire journey with correct duration',animations.length===1&&animations[0].options.duration===24000&&classes.has('motion-driven'));
animations[0].currentTime=8000;driver.setPaused(true);ok('pause holds the current position',animations[0].playState==='paused'&&animations[0].currentTime===8000);
parent.clientWidth=393;resize();ok('resize preserves time and paused state instead of restarting',animations.length===2&&animations[1].currentTime===8000&&animations[1].playState==='paused'&&animations[0].playState==='cancelled');
resize();ok('unchanged geometry never restarts the animation',animations.length===2);
driver.setPaused(false);ok('resume continues from the same position',animations[1].playState==='running'&&animations[1].currentTime===8000);
element.offsetWidth=370;resize();ok('larger LED labels still carry the boat fully outside the viewport',coordinate(animations.at(-1).frames.at(-1))[0]===-823&&animations.at(-1).currentTime===8000);
driver.destroy();ok('unmount releases animations and geometry observation',disconnected&&animations.at(-1).playState==='cancelled'&&!classes.has('motion-driven'));
const fallback=animateRiverBoat({...element,animate:undefined},{duration:20000,lane:1,seed:1,paused:false});ok('older-browser fallback leaves CSS travel enabled',!classes.has('motion-driven'));fallback.destroy();
const d={...defaultDesign(),candles:3,decorations:Array.from({length:24},(_,i)=>({kind:i<3?'candle':i===3?'incense':'rose',x:45+(i%6)*43,y:125+Math.floor(i/6)*24,rotation:i*7-60,scale:.6,color:'#ffb5cc'})),strokes:Array.from({length:40},(_,i)=>({color:'#ffffff',width:2,points:Array.from({length:60},(_,j)=>[30+j*4,120+i])}))};
ok('maximum-detail regression design is valid',validateDesign(d)!==null&&d.strokes.reduce((n,s)=>n+s.points.length,0)===LIMITS.totalPoints);
for(let bits=0;bits<16;bits++){
 const design={...d,realism:{...DEFAULT_REALISM,...Object.fromEntries(['shape','color','decor','light'].map((key,i)=>[key,!!(bits&(1<<i))]))}};
 const surface=render(Art,{design,surfaceOnly:true}),flames=render(DisplayFlames,{design});
 assert.equal((surface.match(/data-deco=/g)||[]).length,24);assert.equal((surface.match(/<polyline/g)||[]).length,40);
 assert.ok(!/class="(?:real-flame|art-flame|real-smoke|real-ripples|real-motion)/.test(surface),'no frozen flame or water baked into surface');
 assert.equal((flames.match(/data-live-flame=/g)||[]).length,6);
 assert.ok(render(Art,{design}).includes('flame'),'editor/souvenir retain their complete original rendering');
}
ok('all 16 normal/real mode combinations retain 24 decorations and 2400 stroke points with live candles',true);
for(const base of REAL_BASES){const design={...defaultDesign(),realism:{...DEFAULT_REALISM,shape:true,light:true,base:base.id,flameSize:1.3}};const light=lightSources(design)[0];assert.equal(light.y,candleHeight(design)-23);assert.equal(light.scale,1.3);}
ok('live flames align to the wick of all six realistic bases',true);
const candle={kind:'candle',x:100,y:170,rotation:90,scale:2,color:'#ffffff'};
let design={...defaultDesign(),candles:0,decorations:[candle]};let source=lightSources(design)[0];ok('rotated and enlarged normal decorative candles align to their wick',source.x===124&&Math.abs(source.y-170)<.001);
design={...design,realism:{...DEFAULT_REALISM,decor:true}};source=lightSources(design)[0];ok('real decorative candles preserve independent placement and rotation',source.x===130&&Math.abs(source.y-170)<.001);
ok('a design without candles does not invent a flame',!render(DisplayFlames,{design:{...defaultDesign(),candles:0}}).includes('data-live-flame'));
const full={...defaultDesign(),realism:{...DEFAULT_REALISM,light:true,ripples:true,reflection:65,sparks:true}};
const water=render(DisplayWater,{design:full,url:'data:image/png;base64,AA=='});
ok('water keeps reflection, travelling rings, wake, and candle highlights',water.includes('live-reflection')&&water.includes('live-ripple')&&water.includes('live-wake')&&water.includes('live-fire-reflection'));
const noWater=render(DisplayWater,{design:{...full,realism:{...full.realism,ripples:false,reflection:0}},url:'data:image/png;base64,AA=='});
ok('explicit participant water choices remain respected',!noWater.includes('class="live-reflection"')&&!noWater.includes('class="live-ripple"')&&!noWater.includes('live-fire-reflection'));
const scene=render(Ambience,{});ok('full scene includes all 36 fireflies, 8 lanterns, 3 fireworks, and moving current',scene.includes('river-current')&&(scene.match(/class="firework"/g)||[]).length===3&&(scene.match(/<i/g)||[]).length===98);
const display=render(Display,{id:'demo'});ok('display starts in full motion with an explicit pause control',display.includes('full-motion')&&display.includes('พักการเคลื่อนไหว')&&!display.includes('perf-lite'));
const css=fs.readFileSync(repo+'/app/river-motion.css','utf8');ok('motion stylesheet includes a travelling CSS fallback and overflow-safe effects',css.includes('@keyframes river-passage')&&css.includes('translate3d(calc(-100vw')&&css.includes('.display-water{height:124%'));
console.log(JSON.stringify({checks,scope:'trajectory/lifecycle simulations and complete-art SSR; not browser FPS'}));
