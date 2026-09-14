/* Real Chromium terrain QA. Same optional runtime variables as ui-smoke.cjs. */
const {chromium}=require(process.env.PENINSULA_PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../app/src/main/assets/game'),out=path.resolve(__dirname,'../test-results');
const probe=`\nglobalThis.terrainQA={game,focus(lon,lat,z){const p=game.board.project(lon,lat);camera={...p,zoom:z};dirty=true;draw();},fit(){fit();draw();}};`;
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=pathname==='/standalone.html'?path.resolve(__dirname,'../downloads/peninsula-2026-v4.html'):path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)&&pathname!=='/standalone.html'){res.writeHead(403).end();return;}
 try{let data=fs.readFileSync(file);if(pathname==='/ui.js')data=data.toString()+probe;
  res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PENINSULA_CHROMIUM?{executablePath:process.env.PENINSULA_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('[data-modal="start"]').click();await page.evaluate(()=>document.fonts.ready);
  const counts=await page.evaluate(()=>terrainQA.game.board.tiles.filter(t=>!t.sea).reduce((a,t)=>(a[t.terrain]=(a[t.terrain]||0)+1,a),{}));
  assert.deepEqual(counts,{hills:1112,mountain:772,plains:527});
  await page.evaluate(()=>terrainQA.fit());await page.screenshot({path:path.join(out,'terrain-overview.png')});
  for(const [name,lon,lat] of [['taebaek',128.4,37.4],['honam',127,35.9],['kaema',128,40.8]]){
   await page.evaluate(([lon,lat])=>terrainQA.focus(lon,lat,2.2),[lon,lat]);
   await page.screenshot({path:path.join(out,`terrain-${name}.png`)});
  }
  // Actual movement and supply overlays remain usable over the terrain layer.
  await page.locator('.command-launcher [data-tab="command"]').click();
  await page.locator('[data-action="first-unit"]').click();
  assert.equal(await page.locator('#map-section').getAttribute('data-mode'),'move');
  await page.locator('[data-layer="supply"]').click();
  await page.screenshot({path:path.join(out,'terrain-supply.png')});
  await page.setViewportSize({width:412,height:915});
  await page.evaluate(()=>terrainQA.focus(128.4,37.4,1.4));
  await page.screenshot({path:path.join(out,'terrain-mobile.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // The distributed bundle must render without module requests or JS errors.
  await page.goto(`http://127.0.0.1:${server.address().port}/standalone.html`);
  await page.waitForFunction(()=>document.getElementById('map').width>0);
  await page.screenshot({path:path.join(out,'terrain-standalone.png')});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({counts,consoleErrors:errors,screenshots:out}));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
