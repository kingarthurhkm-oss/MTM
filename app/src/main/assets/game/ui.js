import { GEOGRAPHY } from './geography.js';
import { Game, TYPES, SITE_TYPES, clamp } from './engine.js';

const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const game=new Game(),canvas=$('map'),ctx=canvas.getContext('2d'),mini=$('minimap'),mc=mini.getContext('2d');
let selected=null,selectedSite=null,selectedTile=null,target=null,mode='select',tab='command',layer='operations',filter='all';
let reachable=new Map(),dirty=true,camera={x:0,y:0,zoom:1},width=0,height=0,toastTimer,first=true,processing=false;
const images={};
const symbolPath=(side,type)=>`symbols/${side}-${type}.svg`;
for(const side of ['blue','red'])for(const type of Object.keys(TYPES)){const img=new Image();img.src=symbolPath(side,type);img.onload=()=>dirty=true;images[`${side}-${type}`]=img;}
const off=document.createElement('canvas');off.width=game.board.width+30;off.height=game.board.height+30;const oc=off.getContext('2d');
const state=()=>game.state;
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500);}
function autosave(){try{localStorage.setItem('peninsula-autosave-v1',game.export());return true;}catch{return false;}}
function save(){toast(autosave()?'현재 진행을 저장했습니다.':'저장 공간을 사용할 수 없습니다. 메뉴에서 파일로 내보내세요.');}
function execute(result){if(result.ok){reachable=selected?game.reachable(game.unit(selected)):new Map();autosave();render();}toast(result.message);dirty=true;}
function countryPath(context,poly){context.beginPath();for(const ring of poly){ring.forEach(([lon,lat],i)=>{const p=game.board.project(lon,lat);i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y);});context.closePath();}}
function baseMap(){
 oc.fillStyle='#0e2633';oc.fillRect(0,0,off.width,off.height);
 oc.lineWidth=.7;oc.strokeStyle='#28404c';
 for(let lon=118;lon<148;lon+=2){const a=game.board.project(lon,24),b=game.board.project(lon,46);oc.beginPath();oc.moveTo(a.x,a.y);oc.lineTo(b.x,b.y);oc.stroke();}
 for(let lat=24;lat<47;lat+=2){const a=game.board.project(118,lat),b=game.board.project(147,lat);oc.beginPath();oc.moveTo(a.x,a.y);oc.lineTo(b.x,b.y);oc.stroke();}
 for(const c of GEOGRAPHY.countries){oc.fillStyle=c.id==='410'?'#284c51':c.id==='408'?'#4e3e42':'#283139';oc.strokeStyle=c.id==='410'?'#64868b':c.id==='408'?'#8b6a6d':'#46515a';oc.lineWidth=1.2;for(const p of c.polygons){countryPath(oc,p);oc.fill('evenodd');oc.stroke();}}
 for(const t of game.board.tiles.filter(t=>[1,2].includes(t.home)&&t.terrain==='mountain')){oc.fillStyle=t.home===1?'#35585870':'#66505370';hex(oc,t,.8);oc.fill();}
 for(const t of game.board.tiles.filter(t=>t.road)){oc.strokeStyle=t.home===1?'#80968d65':'#ad938765';oc.lineWidth=t.rail?1.9:1;for(const n of game.board.links[t.id])if(game.board.tiles[n].road){oc.beginPath();oc.moveTo(t.x,t.y);oc.lineTo(game.board.tiles[n].x,game.board.tiles[n].y);oc.stroke();}}
 for(const [name,lon,lat] of GEOGRAPHY.islands){const p=game.board.project(lon,lat);oc.fillStyle='#527c79';oc.beginPath();oc.ellipse(p.x,p.y,2.6,2,0,0,Math.PI*2);oc.fill();}
}
function hex(c,t,k=1){const rx=game.board.dx/1.5*k,ry=game.board.dy*.5*k;c.beginPath();[[-1,0],[-.5,-1],[.5,-1],[1,0],[.5,1],[-.5,1]].forEach(([x,y],i)=>i?c.lineTo(t.x+x*rx,t.y+y*ry):c.moveTo(t.x+x*rx,t.y+y*ry));c.closePath();}
function world(x,y){return {x:(x-width/2)/camera.zoom+camera.x,y:(y-height/2)/camera.zoom+camera.y};}
function screen(x,y){return {x:(x-camera.x)*camera.zoom+width/2,y:(y-camera.y)*camera.zoom+height/2};}
function fit(full=false){
 const a=game.board.project(full?118:123.5,full?46:43.3),b=game.board.project(full?147:132,full?24:32.2);
 camera.x=(a.x+b.x)/2;camera.y=(a.y+b.y)/2;camera.zoom=Math.min(width/(b.x-a.x),height/(b.y-a.y))*(full?.9:.9);dirty=true;
}
function centerTile(id){const t=game.board.tiles[id];camera.x=t.x;camera.y=t.y;camera.zoom=Math.max(camera.zoom,3);dirty=true;}
function zoom(f,px=width/2,py=height/2){const p=world(px,py);camera.zoom=clamp(camera.zoom*f,.12,6);camera.x=p.x-(px-width/2)/camera.zoom;camera.y=p.y-(py-height/2)/camera.zoom;dirty=true;}
function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*d);canvas.height=Math.round(height*d);ctx.setTransform(d,0,0,d,0,0);if(first&&width&&height){fit();first=false;}dirty=true;}
new ResizeObserver(resize).observe($('map-section'));
function textAt(label,x,y,color,size=11){ctx.font=`${size}px "Noto KR",system-ui,sans-serif`;ctx.textAlign='center';ctx.fillStyle='#07141ad9';ctx.lineWidth=3;ctx.strokeStyle='#0b202a';ctx.strokeText(label,x,y);ctx.fillStyle=color;ctx.fillText(label,x,y);}
let hitUnits=[];
function draw(){
 if(dirty&&width&&height){
  dirty=false;ctx.clearRect(0,0,width,height);ctx.fillStyle='#0b1e29';ctx.fillRect(0,0,width,height);
  ctx.save();ctx.translate(width/2,height/2);ctx.scale(camera.zoom,camera.zoom);ctx.translate(-camera.x,-camera.y);ctx.drawImage(off,0,0);
  const tl=world(0,0),br=world(width,height),on=t=>t.x>=tl.x-30&&t.x<=br.x+30&&t.y>=tl.y-30&&t.y<=br.y+30;
  const tiles=game.board.tiles.filter(on);
  for(const t of tiles){
   if(t.foreign||t.sea)continue;
   if(state().control[t.id]!==t.home){ctx.fillStyle=state().control[t.id]===1?'#4d99b990':'#ac5d6080';hex(ctx,t);ctx.fill();}
   if(layer==='supply'&&state().control[t.id]===1){const q=1-(game.supplyCache.blue?.dist[t.id]??Infinity)/40;ctx.fillStyle=q>.6?'#56b7aa70':q>.2?'#d6ad5655':'#d3646977';hex(ctx,t);ctx.fill();}
  }
  if(camera.zoom>.8){ctx.strokeStyle='#7796a325';ctx.lineWidth=.5/camera.zoom;for(const t of tiles){hex(ctx,t);ctx.stroke();}}
  if(mode==='move'){for(const [id] of reachable){const t=game.board.tiles[id];ctx.fillStyle='#76c9e936';hex(ctx,t);ctx.fill();ctx.strokeStyle='#8bceda77';ctx.lineWidth=.6/camera.zoom;ctx.stroke();}}
  if(selected&&layer==='supply'){const path=game.supplyPath(game.unit(selected));ctx.strokeStyle='#97d8bd';ctx.lineWidth=2/camera.zoom;ctx.setLineDash([6/camera.zoom,4/camera.zoom]);ctx.beginPath();path.forEach((id,i)=>{const t=game.board.tiles[id];i?ctx.lineTo(t.x,t.y):ctx.moveTo(t.x,t.y);});ctx.stroke();ctx.setLineDash([]);}
  if(selectedTile!==null){const t=game.board.tiles[selectedTile];ctx.strokeStyle='#edbb70';ctx.lineWidth=2/camera.zoom;hex(ctx,t,1.05);ctx.stroke();}
  ctx.restore();
  const labels=[['대한민국',127.8,35.6,'#a9ccd0'],['북한',127.7,40.5,'#c6a1a3'],['중국 · 진입 불가',122,42,'#78868e'],['일본 · 진입 불가',137.7,36.7,'#78868e'],['홋카이도',143.1,43.35,'#a1adb3'],['오키나와',128.15,26.2,'#a1adb3'],['동 해',132.8,39.1,'#698b9e'],['서 해',123,35.5,'#698b9e']];
  for(const [label,lon,lat,color]of labels){const p=game.board.project(lon,lat),s=screen(p.x,p.y);if(s.x>0&&s.x<width&&s.y>70&&s.y<height&&!(s.x<250&&s.y<115))textAt(label,s.x,s.y,color,label.length<5?12:10);}
  for(const [name,lon,lat]of GEOGRAPHY.islands){const p=game.board.project(lon,lat),s=screen(p.x,p.y);if(camera.zoom>.55&&s.x>0&&s.x<width&&s.y>0&&s.y<height)textAt(name,s.x,s.y+13,'#90b0bc',8);}
  for(const obj of state().objectives){const t=game.board.tiles[obj.tile],p=screen(t.x,t.y);ctx.strokeStyle=obj.held?'#9bd5bc':'#efb664';ctx.fillStyle='#16282f';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,12,0,Math.PI*2);ctx.fill();ctx.stroke();textAt(obj.id.slice(-1),p.x,p.y+4,obj.held?'#9bd5bc':'#efb664',11);if(camera.zoom>1)textAt(obj.name,p.x,p.y+28,'#d5ba8d',9);}
  if(layer==='infrastructure'||camera.zoom>1.1){for(const site of state().sites){if(!on(game.board.tiles[site.tile]))continue;const t=game.board.tiles[site.tile],p=screen(t.x,t.y);ctx.fillStyle='#132831';ctx.strokeStyle=site.health<60?'#d7867c':'#718e92';ctx.lineWidth=1;ctx.fillRect(p.x-7,p.y-7,14,14);ctx.strokeRect(p.x-7,p.y-7,14,14);textAt(SITE_TYPES[site.kind].mark,p.x,p.y+3,site.health<60?'#dda595':'#b1c4c3',8);}}
  hitUnits=[];const stacks={};
  for(const u of game.alive().filter(u=>!u.embarked&&game.visible(u))){
   const t=game.board.tiles[u.tile];if(!on(t))continue;const p=screen(t.x,t.y),idx=stacks[u.tile]??0;stacks[u.tile]=idx+1;
   const size=clamp(23+camera.zoom*3,23,38);p.x+=idx*14;p.y-=idx*9;const img=images[`${u.side}-${u.type}`];
   if(u.id===selected){ctx.fillStyle='#e9bd7044';ctx.strokeStyle='#efc375';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,size*.7,0,Math.PI*2);ctx.fill();ctx.stroke();}
   if(mode==='attack'&&selected&&game.canAttack(game.unit(selected),u)){ctx.strokeStyle='#efae8b';ctx.lineWidth=2;ctx.strokeRect(p.x-size*.65,p.y-size*.65,size*1.3,size*1.3);}
   if(img.complete&&img.naturalWidth){const ih=size,iw=ih*img.naturalWidth/img.naturalHeight;ctx.drawImage(img,p.x-iw/2,p.y-ih/2,iw,ih);}
   ctx.fillStyle='#071720';ctx.fillRect(p.x-12,p.y+size/2+3,24,3);ctx.fillStyle=u.supply<30?'#f0b55e':u.side==='blue'?'#81c4d6':'#d29195';ctx.fillRect(p.x-12,p.y+size/2+3,24*u.hp/100,3);
   if(camera.zoom>1.3||u.id===selected)textAt(u.name.split(' ')[0],p.x,p.y+size/2+16,u.side==='blue'?'#aed3df':'#d0a5aa',8);
   hitUnits.push({id:u.id,x:p.x,y:p.y,r:Math.max(size*.7,18)});
  }
  const mw=mini.width,mh=mini.height;mc.fillStyle='#10232e';mc.fillRect(0,0,mw,mh);mc.drawImage(off,0,0,mw,mh);mc.strokeStyle='#dfb578';mc.lineWidth=1;mc.strokeRect(tl.x/game.board.width*mw,tl.y/game.board.height*mh,(br.x-tl.x)/game.board.width*mw,(br.y-tl.y)/game.board.height*mh);
 }
 requestAnimationFrame(draw);
}
function choose(id,center=false){selected=id;selectedSite=null;target=null;mode='select';tab='command';const u=game.unit(id);selectedTile=u.tile;reachable=game.reachable(u);if(center)centerTile(u.tile);render();dirty=true;}
function mapClick(x,y){
 const p=world(x,y),tile=game.board.closest(p.x,p.y);if(tile<0)return;
 const u=selected?game.unit(selected):null;
 const hits=hitUnits.filter(h=>Math.hypot(h.x-x,h.y-y)<=h.r).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
 if(mode==='unload'&&u){execute(game.unload(u.id,tile));mode='select';return;}
 if(mode==='attack'&&u){const enemy=hits.map(h=>game.unit(h.id)).find(v=>v.side!=='blue');if(enemy){target=enemy.id;render();dirty=true;}else toast('표시된 적 부대를 선택하세요.');return;}
 if(mode==='move'&&u){execute(game.move(u.id,tile));selectedTile=u.tile;render();return;}
 if(hits.length){const own=hits.find(h=>game.unit(h.id).side==='blue');if(own){choose(own.id);return;}target=hits[0].id;selected=null;selectedSite=null;selectedTile=game.unit(target).tile;tab='command';render();dirty=true;return;}
 selectedTile=tile;selected=null;target=null;selectedSite=null;
 if(game.board.tiles[tile].foreign){toast('외국 영토는 표시 전용입니다.');render();dirty=true;return;}
 const site=state().sites.find(s=>s.tile===tile)||state().sites.filter(s=>game.board.distance(s.tile,tile)<=1).sort((a,b)=>game.board.distance(a.tile,tile)-game.board.distance(b.tile,tile))[0];
 if(site){selectedSite=site.id;selectedTile=site.tile;tab='command';}render();dirty=true;
}
let pointers=new Map(),dragStart=null,lastPinch=0,moved=false;
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});dragStart={x:e.offsetX,y:e.offsetY,cx:camera.x,cy:camera.y};moved=false;if(pointers.size===2){const p=[...pointers.values()];lastPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);moved=true;}});
canvas.addEventListener('pointermove',e=>{
 const p=world(e.offsetX,e.offsetY),t=game.board.closest(p.x,p.y);if(t>=0)$('coordinate-label').textContent=`HEX ${game.board.tiles[t].q.toString().padStart(3,'0')} · ${game.board.tiles[t].r.toString().padStart(3,'0')}`;
 if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
 if(pointers.size===2){const a=[...pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(lastPinch>0)zoom(d/lastPinch,(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2);lastPinch=d;moved=true;}
 else if(dragStart){const dx=e.offsetX-dragStart.x,dy=e.offsetY-dragStart.y;if(Math.hypot(dx,dy)>7)moved=true;if(moved){camera.x=dragStart.cx-dx/camera.zoom;camera.y=dragStart.cy-dy/camera.zoom;dirty=true;}}
});
canvas.addEventListener('pointerup',e=>{if(!moved&&pointers.size===1)mapClick(e.offsetX,e.offsetY);pointers.delete(e.pointerId);if(pointers.size){const p=[...pointers.values()][0];dragStart={x:p.x,y:p.y,cx:camera.x,cy:camera.y};moved=true;}else dragStart=null;lastPinch=0;});
canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);dragStart=null;moved=true;lastPinch=0;});
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.15:1/1.15,e.offsetX,e.offsetY);},{passive:false});
canvas.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();camera.x+=e.key==='ArrowLeft'?-50/camera.zoom:e.key==='ArrowRight'?50/camera.zoom:0;camera.y+=e.key==='ArrowUp'?-50/camera.zoom:e.key==='ArrowDown'?50/camera.zoom:0;dirty=true;}if(e.key==='+')zoom(1.25);if(e.key==='-')zoom(.8);});
mini.addEventListener('click',e=>{const r=mini.getBoundingClientRect();camera.x=(e.clientX-r.left)/r.width*game.board.width;camera.y=(e.clientY-r.top)/r.height*game.board.height;dirty=true;});
function actionButtons(u){
 if(u.embarked)return '<p class="context">수송선단에 승선 중입니다. 수송선단을 선택해 하선하세요.</p>';
 const disabled=state().result?' disabled':'';
 if(u.type==='air')return `<div class="actions-grid"><button data-mission="patrol"${disabled}>공중 방어</button><button data-mission="recon"${disabled}>광역 정찰</button><button data-mission="support"${disabled}>지상 지원</button><button data-mode="attack"${disabled}>전투 출격</button></div>`;
 return `<div class="actions-grid"><button data-mode="move" class="${mode==='move'?'active':''}"${disabled}>이동 명령</button><button data-action="fortify"${disabled}>방어 태세</button>${TYPES[u.type].attack?`<button class="wide ${mode==='attack'?'active':''}" data-mode="attack"${disabled}>공격 대상 선택</button>`:''}${u.type==='transport'?`<button data-action="load"${disabled}>승선</button><button data-mode="unload"${disabled}>하선</button>`:''}${['transport','supply'].includes(u.type)?`<button class="wide" data-action="deliver"${disabled}>보급 전달 · 적재 ${Math.round(u.cargo)}</button>`:''}<button data-action="center" class="wide subtle-btn">선택 부대 위치로 이동</button></div>`;
}
function policies(){return `<div class="section-label">NATIONAL COMMAND · 지휘점 ${state().cp}</div><div class="policies">${[['shelter','민간 보호',3],['diplomacy','위기 완화',3],['cyber','통신 방어',2],['supply','예비 보급',2]].map(([id,label,cost])=>`<button data-policy="${id}" ${state().cp<cost||state().policyUsed.includes(id)||state().result?'disabled':''}>${label}<span class="cost">${state().policyUsed.includes(id)?'이번 턴 실행 완료':`지휘점 ${cost}${id==='supply'?' · 물자 25':''}`}</span></button>`).join('')}</div><p class="policy-note">민간 보호는 다음 피해를 줄이고, 위기 완화는 핵 위협을 포함한 전략 위기 지수를 낮춥니다.</p>`;}
function unitPanel(u){return `<div class="section-label">SELECTED FORMATION · ${u.side==='blue'?'FRIENDLY':'HOSTILE'}</div><div class="card"><div class="unit-header"><img src="${symbolPath(u.side,u.type)}" alt="${esc(TYPES[u.type].name)} 기호"><div><h3>${esc(u.name)}</h3><small>${{land:'지상',air:'공중',sea:'해상'}[TYPES[u.type].domain]} 전력 · ${u.entrenched?'방어 태세':'기동 태세'}</small></div></div><div class="stats-grid"><div><label>전력</label><strong>${Math.round(u.hp)}<span>%</span></strong></div><div><label>보급</label><strong class="${u.supply<40?'damage':''}">${Math.round(u.supply)}<span>%</span></strong></div><div><label>이동력</label><strong>${u.ap.toFixed(1)}</strong></div></div><p class="context">${u.side==='blue'?`보급 연결 ${Math.round(game.supplyQuality(u)*100)}% · ${u.acted?'공격·출격 완료':'공격·출격 가능'}`:'정찰로 식별된 가상 부대'}${u.supply<40?' · 보급 부족 페널티 적용':''}</p>${u.side==='blue'?actionButtons(u):''}</div>`;}
function renderCommand(){
 let html='';const u=selected?game.unit(selected):null,v=target?game.unit(target):null;
 if(u&&u.hp>0){html+=unitPanel(u);if(mode!=='select')html+=`<p class="action-hint">${{move:'빛나는 헥스를 누르면 이동합니다. 먼 목적지는 이번 턴 이동력만큼 진행합니다.',attack:'테두리가 표시된 적 부대를 눌러 전투 조건을 확인하세요.',unload:'수송선단에 인접한 아군 해안을 누르세요.'}[mode]} <button data-mode="select" class="subtle-btn">명령 취소</button></p>`;
  if(v){const can=game.canAttack(u,v),p=game.combatPreview(u,v);html+=`<div class="attack-preview"><p>${esc(v.name)}<br>예상 전투비 <strong>${p.ratio.toFixed(2)} : 1 · ${p.band}</strong><br><small>실제 결과에는 주사위·지형·보급·지원이 반영됩니다.</small></p><button data-action="attack" class="danger" ${!can?'disabled':''}>전투 실행</button></div>`;}
 }else if(v&&v.hp>0){html+=unitPanel(v);}
 else if(selectedSite){const s=state().sites.find(s=>s.id===selectedSite);html+=`<div class="section-label">INFRASTRUCTURE</div><div class="card"><div class="unit-header"><span class="site-mark">${SITE_TYPES[s.kind].mark}</span><h3>${esc(s.name)}</h3></div><div class="stats-grid"><div><label>가동률</label><strong>${Math.round(s.health)}<span>%</span></strong></div><div><label>통제</label><strong style="font-size:15px">${game.owned(s.tile,'blue')?'대한민국':'북한'}</strong></div></div><p class="context">${SITE_TYPES[s.kind].effect}<br>${s.health>=75?'정상 가동':s.health>=40?'부분 가동':s.health>=20?'제한 가동':'기능 상실'} · 피해율에 비례해 효율 감소</p><div class="actions-grid"><button class="wide" data-action="repair" ${!game.owned(s.tile,'blue')||s.health>=100?'disabled':''}>시설 복구 +28%p<span class="cost">지휘점 2 · 자재 12</span></button></div></div>`;}
 else {html+=`<div class="section-label">MISSION BRIEF · 2026 / FICTIONAL</div><div class="empty-art"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 1v7m0 8v7M1 12h7m8 0h7"/></svg></div><h2 class="intro-title">진격과 보존 사이,<br>지휘관의 선택.</h2><p class="intro-copy">세 통제 구역을 확보하고 2턴 동안 유지하세요. 빠른 종료, 민간 보호, 기반시설 보존이 함께 점수에 반영됩니다.</p><div class="objective-list">${state().objectives.map(o=>`<div class="objective-row"><span>${esc(o.name)}</span><b>${Math.min(2,o.held)} / 2턴</b></div>`).join('')}</div><button class="wide primary" data-action="first-unit" style="width:100%">첫 지상부대 선택 →</button><div class="divider"></div>`;}
 html+=`<div class="section-label">전투 태세</div><div class="posture">${[['careful','피해 보존'],['balanced','균형'],['push','돌파']].map(([id,n])=>`<button data-posture="${id}" class="${state().posture===id?'active':''}">${n}</button>`).join('')}</div><p class="policy-note">${{careful:'공격력 ×0.82 · 전투에 따른 보호 지수 감소 최소화',balanced:'공격력 ×1.00 · 균형적인 전투 결과',push:'공격력 ×1.20 · 보호·시설 피해와 위기 상승 증가'}[state().posture]}</p><div class="divider"></div>${policies()}`;
 return html;
}
function render(){
 const s=state();for(const [id,val]of [['civilian',s.civilians],['infra',game.integrity()],['supply',game.alive('blue').reduce((x,u)=>x+u.supply,0)/Math.max(1,game.alive('blue').length)],['crisis',s.escalation]]){
  $(`${id}-value`).innerHTML=`${Math.round(val)}<span>${id==='crisis'?'/100':'%'}</span>`;$(`${id}-meter`).style.width=`${val}%`;
 }
 $('cp-value').textContent=s.cp;$('materials-value').textContent=Math.round(s.materials);$('reserve-value').textContent=Math.round(s.reserve);
 $('turn-value').textContent=String(s.turn).padStart(2,'0');$('weather-value').textContent=s.weather;$('unit-count').textContent=game.alive('blue').length;
 $('objective-value').textContent=`통제 구역 ${s.objectives.filter(o=>o.held>=2).length} / 3`;
 $('phase-label').textContent=s.result?'시나리오 종료':'대한민국 · 명령 단계';$('end-turn').disabled=!!s.result||processing;
 $('map-objectives').innerHTML=s.objectives.map(o=>`<button class="objective-chip" data-objective="${o.id}"><span>${esc(o.name)}</span><b>${Math.min(2,o.held)}/2</b></button>`).join('');
 document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 document.querySelectorAll('[data-layer]').forEach(b=>b.classList.toggle('active',b.dataset.layer===layer));
 let html='';
 if(tab==='command')html=renderCommand();
 if(tab==='forces'){
  html=`<div class="section-label">FRIENDLY FORCES · ${game.alive('blue').length}개 부대</div><div class="roster-filter">${[['all','전체'],['land','지상'],['air','공중'],['sea','해상']].map(([id,n])=>`<button data-filter="${id}" class="${filter===id?'active':''}">${n}</button>`).join('')}</div>`;
  html+=game.alive('blue').filter(u=>filter==='all'||TYPES[u.type].domain===filter).map(u=>`<button class="unit-row" data-unit="${u.id}"><img src="${symbolPath(u.side,u.type)}" alt=""><div><b>${esc(u.name)}</b><small>보급 ${Math.round(u.supply)}% · 이동 ${u.ap.toFixed(1)}${u.embarked?' · 승선 중':''}</small></div><span class="health">${Math.round(u.hp)}</span></button>`).join('');
 }
 if(tab==='infra'){
  html='<div class="section-label">시설 가동 · 아군 통제 구역</div><p class="policy-note" style="margin:0 0 14px">시설을 선택해 가동 상태와 복구 명령을 확인하세요. 모든 시설은 가상 배치입니다.</p>';
  html+=state().sites.filter(s=>game.owned(s.tile,'blue')).sort((a,b)=>a.health-b.health).map(s=>`<button class="site-row" data-site="${s.id}"><span class="site-mark">${SITE_TYPES[s.kind].mark}</span><div><b>${esc(s.name)}</b><small>${SITE_TYPES[s.kind].effect}</small></div><strong class="${s.health<60?'damage':''}">${Math.round(s.health)}<small>%</small></strong></button>`).join('');
 }
 if(tab==='log'){
  const r=s.lastReport;if(r)html+=`<div class="report"><p><b>${r.turn}턴 결과</b><br>민간 보호 ${r.civilians.toFixed(1)}%p · 기반시설 ${r.integrity.toFixed(1)}%p<br>위기 ${r.escalation>=0?'+':''}${r.escalation.toFixed(1)} · 보급 부족 ${r.lowSupply}개 부대</p></div>`;
  html+='<div class="section-label">OPERATION LOG</div>'+s.log.map(l=>`<div class="log-row ${esc(l.kind)}"><small>TURN ${String(l.turn).padStart(2,'0')}</small>${esc(l.text)}</div>`).join('');
 }
 $('panel-content').innerHTML=html;
 $('map-hint').textContent=mode==='move'?'이동 모드 · 목적지 헥스를 터치하세요':mode==='attack'?'공격 모드 · 적 부대를 선택하세요':layer==='supply'?'청록: 원활 · 황색: 감소 · 적색: 단절':layer==='infrastructure'?'시설을 누르면 복구 명령을 확인할 수 있습니다':'부대 선택 → 이동 또는 공격 → 턴 종료';
 dirty=true;
}
function modal(html){$('modal-content').innerHTML=html;if(!$('modal').open)$('modal').showModal();}
function closeModal(){$('modal').close();}
function briefing(){modal(`<p class="modal-eyebrow">PENINSULA / SCENARIO 01</p><h2>한반도, 2026.</h2><div class="briefing-stats"><div><strong>28,800</strong><span>헥스 타일</span></div><div><strong>3</strong><span>작전 영역</span></div><div><strong>45</strong><span>최대 턴</span></div></div><div class="modal-copy"><p>대한민국 진영에서 육·해·공 전력을 지휘하세요. 세 구역을 2턴 동안 확보하면서 민간 보호와 기반시설을 보존하는 것이 목표입니다.</p><p><b>부대 선택 → 이동·공격 → 국가 지휘 명령 → 턴 종료.</b> 지도는 한 손가락으로 이동하고 두 손가락으로 확대할 수 있습니다.</p><p>2026년을 배경으로 한 가상 전략 게임입니다. 부대 편제·시설 배치·성능·지형 효과·피해 수치는 게임용이며, 실제 전쟁 예측값이 아닙니다. 턴은 실제 시간과 대응하지 않습니다.</p></div><div class="modal-grid"><button data-modal="help">조작법과 규칙</button><button class="primary" data-modal="start">작전 시작 →</button></div>`);}
function menu(){modal(`<p class="modal-eyebrow">COMMAND MENU</p><h2>작전 관리</h2><div class="modal-grid"><button data-modal="save">진행 저장</button><button data-modal="restore">자동 저장 불러오기</button><button data-modal="export">저장 파일 내보내기</button><button data-modal="import">저장 파일 가져오기</button><button data-modal="help">조작법 · 규칙 · 범례</button><button data-modal="new" class="danger">새 시나리오</button><button class="primary wide" data-modal="close">계속하기</button></div><p class="policy-note">명령 실행 후 자동 저장됩니다. 기기 사이에 옮길 때는 JSON 저장 파일을 사용하세요.</p>`);}
function help(){modal(`<p class="modal-eyebrow">FIELD MANUAL</p><h2>지휘관 안내</h2><div class="modal-copy"><ol><li>지도 또는 <b>부대</b> 탭에서 아군을 선택합니다.</li><li><b>이동 명령</b> 후 헥스를 터치합니다. 먼 목적지는 이동력이 허용하는 구간까지 이동합니다.</li><li><b>공격 대상 선택</b> 후 적 부대를 터치하고, 전투비를 확인한 뒤 <b>전투 실행</b>을 누릅니다.</li><li>비행단은 방어·정찰·지원 또는 전투 출격 중 하나를 수행합니다. 방공여단은 주변 시설과 전력을 자동 방어합니다.</li><li>지상부대를 가동률 25% 이상인 아군 항만에 두고 인접 수송선단으로 승선시킵니다. 하선은 인접한 아군 해안에서 가능합니다.</li><li>보급 탭의 청록색은 원활, 황색은 감소, 적색은 단절입니다. 보급대·수송선단은 3헥스 이내 부대에 물자를 전달합니다.</li><li>시설 복구에는 지휘점 2와 자재 12가 필요합니다. 통신은 지휘점, 전력·철도·연료는 보급, 도로는 이동, 공항은 출격 효율에 영향을 줍니다.</li><li>세 목표를 2턴 유지하면 종료됩니다. 민간 보호 70%와 시설 60% 이상이면 보존 목표도 달성합니다. 보호 40% 미만, 시설 30% 미만, 지상전력 상실 또는 45턴 초과 시 실패합니다.</li></ol><p>점수는 보호·시설·전력 보존과 짧은 소요 턴을 합산합니다. 핵 위협은 위기 85 이상에서 발생하는 추상적 재난 이벤트이며, 실제 무기 효과를 계산하지 않습니다.</p><p>적 부대는 정찰 범위에 들어와야 표시됩니다. 외국 영토와 영공은 플레이할 수 없습니다. 모든 시설 위치와 전력 수치는 가상입니다.</p></div><div class="legend-symbols">${['army','armor','air','navy','airdefense','transport'].map(t=>`<div><img src="${symbolPath('blue',t)}" alt="${TYPES[t].name}"><span>${TYPES[t].name}</span></div>`).join('')}</div><p class="policy-note">APP-6 기호: 사단 XX · 여단 X. 비행단·전단은 공중·수상 기호와 부대명으로 집계 단위를 표시합니다. 전체 APP-6 표준을 구현한 군용 체계는 아닙니다.<br>해안선: Natural Earth / world-atlas 2.0.2 · 기호: milsymbol 3.0.3 (MIT). 작은 섬은 타일 해상도에 맞춰 확대 표시됩니다.</p><button data-modal="close" class="primary" style="width:100%;margin-top:18px">확인</button>`);}
function resultModal(){const r=state().result;if(r)modal(`<p class="modal-eyebrow">SCENARIO COMPLETE</p><h2>${esc(r.title)}</h2><p class="modal-copy">${esc(r.detail)}</p><div class="briefing-stats"><div><strong>${r.score.toLocaleString()}</strong><span>종합 점수</span></div><div><strong>${state().turn}</strong><span>소요 턴</span></div><div><strong>${Math.round(state().civilians)}%</strong><span>민간 보호</span></div></div><div class="modal-grid"><button data-modal="close">최종 지도 보기</button><button data-modal="new" class="primary">새 시나리오</button></div>`);}
async function endTurn(){if(processing||state().result)return;processing=true;render();$('end-turn').textContent='턴 처리 중…';await new Promise(r=>setTimeout(r,35));try{const r=game.endTurn();target=null;selected=selected&&game.unit(selected).hp>0?selected:null;mode='select';tab='log';autosave();toast(r.message);}catch(e){toast('턴 처리 중 오류가 발생했습니다. 저장 파일을 보존하세요.');console.error(e);}finally{processing=false;$('end-turn').innerHTML='턴 종료 <span>→</span>';render();resultModal();}}
function importSave(text){try{game.import(text);selected=null;selectedSite=null;target=null;mode='select';baseMap();render();fit();autosave();closeModal();toast('저장한 시나리오를 불러왔습니다.');resultModal();}catch(e){toast(e.message);}}
function exportSave(){const data=game.export();if(window.AndroidFiles){window.AndroidFiles.exportSave(data);return;}const blob=new Blob([data],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`peninsula-turn-${state().turn}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('저장 파일을 내보냈습니다.');}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;const d=b.dataset;
 if(d.tab){tab=d.tab;render();$('panel-content').scrollTop=0;}
 if(d.layer){layer=d.layer;render();}
 if(d.unit){choose(d.unit,true);$('panel-content').scrollTop=0;}
 if(d.filter){filter=d.filter;render();}
 if(d.site){selectedSite=d.site;selected=null;target=null;tab='command';selectedTile=state().sites.find(s=>s.id===d.site).tile;centerTile(selectedTile);render();}
 if(d.objective){const obj=state().objectives.find(o=>o.id===d.objective);centerTile(obj.tile);}
 if(d.mode){mode=d.mode;target=null;if(selected)reachable=game.reachable(game.unit(selected));render();}
 if(d.posture&&!state().result){state().posture=d.posture;autosave();render();}
 if(d.policy)execute(game.policy(d.policy));
 if(d.mission&&selected)execute(game.airMission(selected,d.mission));
 if(d.action){
  if(d.action==='first-unit'){const u=game.alive('blue').find(u=>['army','armor'].includes(u.type));if(u)choose(u.id,true);}
  if(d.action==='center'&&selected)centerTile(game.unit(selected).tile);
  if(d.action==='fortify'&&selected)execute(game.fortify(selected));
  if(d.action==='repair'&&selectedSite)execute(game.repair(selectedSite));
  if(d.action==='load'&&selected)execute(game.load(selected));
  if(d.action==='deliver'&&selected)execute(game.deliver(selected));
  if(d.action==='attack'&&selected&&target){execute(game.attack(selected,target));target=null;mode='select';render();resultModal();}
 }
 if(d.modal){
  if(['close','start'].includes(d.modal)){closeModal();if(d.modal==='start')autosave();}
  if(d.modal==='help')help();
  if(d.modal==='save'){save();closeModal();}
  if(d.modal==='restore'){try{const text=localStorage.getItem('peninsula-autosave-v1');if(text)importSave(text);else toast('저장된 진행이 없습니다.');}catch{toast('저장 공간에 접근하지 못했습니다.');}}
  if(d.modal==='export')exportSave();
  if(d.modal==='import'){if(window.AndroidFiles)window.AndroidFiles.importSave();else $('import-input').click();}
  if(d.modal==='new')modal('<p class="modal-eyebrow">NEW SCENARIO</p><h2>새로 시작할까요?</h2><p class="modal-copy">현재 자동 저장은 새 시나리오로 교체됩니다. 보관하려면 먼저 파일로 내보내세요.</p><div class="modal-grid"><button data-modal="close">취소</button><button data-modal="reset" class="danger">새로 시작</button></div>');
  if(d.modal==='reset'){game.newGame();selected=null;selectedSite=null;selectedTile=null;target=null;mode='select';tab='command';baseMap();autosave();render();fit();closeModal();}
 }
});
$('zoom-in').onclick=()=>zoom(1.3);$('zoom-out').onclick=()=>zoom(1/1.3);$('center-button').onclick=()=>fit();$('theater-button').onclick=()=>fit(true);$('save-button').onclick=save;$('end-turn').onclick=endTurn;$('menu-button').onclick=menu;
$('import-input').onchange=async e=>{const file=e.target.files[0];if(file){if(file.size>2_000_000)toast('저장 파일은 2MB 이하만 지원합니다.');else importSave(await file.text());}e.target.value='';};
window.receiveNativeSave=importSave;window.saveBeforePause=autosave;window.handleAndroidBack=()=>{$('modal').open?closeModal():menu();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)autosave();});
window.addEventListener('beforeunload',autosave);
let resumed=false;try{const saved=localStorage.getItem('peninsula-autosave-v1');if(saved){game.import(saved);resumed=true;}}catch{toast('이전 저장을 읽지 못했습니다. 새 시나리오로 시작합니다.');}
baseMap();render();resize();requestAnimationFrame(draw);if(!resumed)briefing();else toast(`${state().turn}턴 자동 저장을 이어갑니다.`);

document.fonts.ready.then(()=>{dirty=true;});
