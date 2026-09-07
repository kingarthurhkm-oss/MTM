/* Optional browser QA: install Playwright or set PENINSULA_PLAYWRIGHT_MODULE.
 * Set PENINSULA_CHROMIUM to use an already installed Chromium executable. */
const {chromium}=require(process.env.PENINSULA_PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../app/src/main/assets/game'),out=path.resolve(__dirname,'../test-results');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 try{const data=fs.readFileSync(file),ext=path.extname(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[ext]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PENINSULA_CHROMIUM?{executablePath:process.env.PENINSULA_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote']});
  const errors=[];const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-modal="start"]').click();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(out,'desktop.png')});
  await page.locator('[data-action="first-unit"]').click();
  await page.locator('[data-mode="move"]').click();
  await page.screenshot({path:path.join(out,'selected.png')});
  assert.match(await page.locator('#panel-content').innerText(),/이동/);
  await page.locator('[data-mode="select"]').click();
  await page.locator('[data-policy="shelter"]').click();
  assert.equal(await page.locator('#cp-value').innerText(),'6');
  await page.locator('[data-layer="supply"]').click();
  await page.locator('#end-turn').click();
  await page.waitForFunction(()=>document.getElementById('turn-value').textContent==='02');
  await page.locator('#save-button').click();
  await page.reload();
  assert.equal(await page.locator('#turn-value').innerText(),'02');
  await page.locator('#menu-button').click();
  await page.locator('[data-modal="help"]').click();
  await page.locator('[data-modal="close"]').click();
  await page.locator('[data-tab="forces"]').click();
  await page.locator('[data-filter="air"]').click();
  await page.locator('[data-unit="blue-air-1"]').click();
  await page.locator('[data-mission="recon"]').click();
  assert.match(await page.locator('#toast').innerText(),/정찰/);
  await page.locator('[data-tab="infra"]').click();
  await page.locator('[data-site]').first().click();
  assert.match(await page.locator('#panel-content').innerText(),/가동률/);
  await page.locator('#theater-button').click();
  await page.screenshot({path:path.join(out,'theater.png')});
  await page.setViewportSize({width:412,height:915});
  await page.locator('#center-button').click();
  await page.locator('[data-tab="forces"]').click();
  await page.locator('[data-filter="all"]').click();
  await page.screenshot({path:path.join(out,'android-portrait.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const mapBox=await page.locator('#map').boundingBox();assert.ok(mapBox.height>=200);
  await page.setViewportSize({width:915,height:412});
  await page.locator('#center-button').click();
  await page.screenshot({path:path.join(out,'android-landscape.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  await context.close();
  const standalone=await browser.newPage({viewport:{width:412,height:915}});standalone.on('pageerror',e=>errors.push(e.message));
  await standalone.goto('file://'+path.resolve(__dirname,'../dist/peninsula-2026.html'));
  await standalone.locator('[data-modal="start"]').click();
  await standalone.locator('[data-action="first-unit"]').click();
  await standalone.locator('#end-turn').click();
  await standalone.waitForFunction(()=>document.getElementById('turn-value').textContent==='02');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'ui-result.json'),JSON.stringify({passed:true,viewports:['1440x1000','412x915','915x412'],checks:['load','unit selection','movement mode','policy cost','turn resolution','autosave reload','help','air recon','infrastructure panel','theater zoom','portrait layout','landscape layout','standalone offline HTML'],runtimeErrors:errors},null,2));
  console.log('Browser checks passed: desktop, Android portrait/landscape, saves, commands, and offline HTML.');
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
