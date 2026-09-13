import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Game,TYPES,SITE_TYPES,clamp} from '../app/src/main/assets/game/engine.js';
import {GEOGRAPHY} from '../app/src/main/assets/game/geography.js';
import {worldToScreen,screenToWorld} from '../app/src/main/assets/game/hex.js';
import {ARMY_DATA,ARMY_SCENARIO,armyFormation,armyChildren,armyTile} from '../app/src/main/assets/game/army.js';

// Exercise the real UI event handlers against the real engine. Only the DOM and
// paint surfaces are stubbed; no alternate movement/combat/selection model.
function ui(){
 const nodes=new Map(),events=new Map(),paint=[];
 const context=new Proxy({},{get:(_,key)=>(...args)=>paint.push([key,...args]),set:()=>true});
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},innerHTML:'',textContent:'',hidden:false,open:false,
   getContext:()=>context,getBoundingClientRect:()=>({width:1280,height:720}),addEventListener:(type,fn)=>events.set(id+':'+type,fn),setPointerCapture(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 const saved=new Map(),sandbox=vm.createContext({Game,TYPES,SITE_TYPES,clamp,GEOGRAPHY,worldToScreen,screenToWorld,ARMY_DATA,ARMY_SCENARIO,armyFormation,armyChildren,armyTile,
  document:{getElementById:node,createElement:()=>node('offscreen'),querySelectorAll:()=>[],addEventListener:(type,fn)=>events.set('document:'+type,fn),fonts:{ready:Promise.resolve()}},
  window:{addEventListener(){}},Image:class{},ResizeObserver:class{observe(){}},devicePixelRatio:1,
  localStorage:{setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)},setTimeout:()=>1,clearTimeout(){},requestAnimationFrame(){},console});
 const source=readFileSync(new URL('../app/src/main/assets/game/ui.js',import.meta.url),'utf8').replace(/^import .+;\r?\n/gm,'');
 vm.runInContext(source,sandbox);node('modal').open=false;
 const run=code=>vm.runInContext(code,sandbox),game=run('game');
 const unit=game.alive('blue').find(u=>game.isDivision(u));
 const click=data=>events.get('document:click')({target:{closest:()=>({dataset:data})}});
 const tile=id=>run(`{const t=game.board.tiles[${id}],p=screen(t.x,t.y);mapClick(p.x,p.y);}`);
 const hit=id=>run(`{const u=game.unit(${JSON.stringify(id)}),t=game.board.tiles[u.tile],p=screen(t.x,t.y);hitUnits=[{id:u.id,x:p.x,y:p.y,r:22}];mapClick(p.x,p.y);}`);
 return {run,game,unit,node,events,click,tile,hit,paint,saved};
}

test('map selection highlights engine reachability; movement and friendly switching require no command button',()=>{
 const q=ui();q.hit(q.unit.id);
 assert.equal(q.run('mode'),'move');assert.equal(q.run('selected'),q.unit.id);
 assert.deepEqual([...q.run('reachable')],[...q.game.reachable(q.unit)]);
 assert.equal(q.node('sidebar').hidden,true);q.run('draw()');assert.ok(q.paint.some(p=>p[0]==='arc'));
 const destination=[...q.game.reachable(q.unit).keys()].find(id=>id!==q.unit.tile&&!q.game.at(id).length);
 const ap=q.unit.ap;q.run('hitUnits=[]');q.tile(destination);assert.equal(q.unit.tile,destination);assert.ok(q.unit.ap<ap);
 const other=q.game.alive('blue').find(u=>u.id!==q.unit.id);q.hit(other.id);
 assert.equal(q.run('selected'),other.id);assert.deepEqual([...q.run('reachable')],[...q.game.reachable(other)]);
});

test('attack preview blocks movement, cancels without mutation and executes through actual combat',()=>{
 const q=ui(),v=q.game.alive('red').find(u=>u.type==='army');v.tile=q.game.board.links[q.unit.tile].find(id=>!q.game.board.tiles[id].sea);
 q.hit(q.unit.id);q.hit(v.id);assert.equal(q.run('mode'),'attack-preview');assert.match(q.node('interaction-card').innerHTML,/적 예상 피해/);
 const before=q.game.export();q.run('hitUnits=[]');q.tile(q.game.board.links[q.unit.tile][0]);assert.equal(q.game.export(),before);
 q.click({action:'cancel'});assert.equal(q.run('mode'),'move');assert.equal(q.game.export(),before);
 q.hit(v.id);q.click({action:'attack'});assert.equal(q.unit.acted,true);assert.ok(v.hp<100);assert.equal(q.run('mode'),'move');
});

test('unavailable enemy gives an engine reason and cannot execute',()=>{
 const q=ui(),v=q.game.alive('red').find(u=>u.type==='army');q.game.state.recon=1;q.hit(q.unit.id);q.hit(v.id);
 assert.equal(q.run('mode'),'attack-preview');assert.match(q.node('interaction-card').innerHTML,/사거리 밖/);
 const before=q.game.export();q.click({action:'attack'});assert.equal(q.game.export(),before);
});

test('sector draft commits once, cancellation preserves shares, no-op confirm preserves allocation',()=>{
 const q=ui();q.hit(q.unit.id);const tiles=q.game.board.links[q.unit.tile].filter(id=>q.game.sectorTileAvailable(q.unit,id)).slice(0,2);
 assert.equal(q.game.setSector(q.unit.id,tiles.map((tile,i)=>({tile,share:[.2,.5][i]})),.3).ok,true);
 const before=JSON.stringify(q.unit.sector),position=q.unit.tile;
 q.click({mode:'sector'});assert.equal(q.run('mode'),'sector');q.run('hitUnits=[]');q.tile(tiles[0]);assert.equal(q.unit.tile,position);assert.equal(JSON.stringify(q.unit.sector),before);
 q.click({action:'cancel'});assert.equal(JSON.stringify(q.unit.sector),before);assert.equal(q.run('mode'),'move');
 q.click({mode:'sector'});q.click({action:'sector-confirm'});assert.equal(JSON.stringify(q.unit.sector),before);
 q.click({mode:'sector'});q.tile(tiles[0]);q.click({action:'sector-confirm'});assert.equal(q.unit.sector.allocations.length,1);assert.equal(q.unit.sector.allocations[0].tile,tiles[1]);
 assert.equal(q.unit.sector.reserveShare,.2);assert.equal(q.run('mode'),'move');
 q.click({mode:'sector'});q.tile(tiles[0]);q.click({action:'sector-confirm'});assert.equal(q.unit.sector.allocations.length,2);
 const restored=new Game();restored.import(q.saved.get('peninsula-autosave-v1'));assert.equal(JSON.stringify(restored.unit(q.unit.id).sector),JSON.stringify(q.unit.sector));
});

test('sector candidate display shares validation with the command, and editor blocks navigation/turn',()=>{
 const q=ui();q.hit(q.unit.id);q.click({mode:'sector'});
 const foreign=q.game.board.tiles.find(t=>t.foreign).id;assert.equal(q.run(`sectorCandidates.has(${foreign})`),false);
 const before=q.game.export();q.tile(foreign);assert.equal(q.game.export(),before);q.click({tab:'forces'});assert.equal(q.run('mode'),'sector');assert.equal(q.node('end-turn').disabled,true);
});

test('detail close, wait and empty map preserve a predictable selection state',()=>{
 const q=ui();q.hit(q.unit.id);q.hit(q.unit.id);assert.equal(q.run('mode'),'detail');assert.equal(q.node('sidebar').hidden,false);
 const before=q.game.export();q.run('hitUnits=[]');q.tile(q.game.board.links[q.unit.tile][0]);assert.equal(q.game.export(),before);
 q.click({action:'close-panel'});assert.equal(q.run('mode'),'move');q.click({action:'wait'});assert.equal(q.run('selected'),null);assert.equal(q.game.export(),before);
 q.hit(q.unit.id);q.run('hitUnits=[]');q.tile(q.game.board.tiles.find(t=>t.foreign).id);assert.equal(q.run('selected'),null);
});

test('drag, pinch and canceled pointers never issue a tile command',()=>{
 const q=ui();q.hit(q.unit.id);const before=q.game.export();
 const event=(kind,id,x,y)=>q.events.get('map:pointer'+kind)({pointerId:id,offsetX:x,offsetY:y});
 event('down',1,300,300);event('move',1,360,320);event('up',1,360,320);assert.equal(q.game.export(),before);
 event('down',1,300,300);event('down',2,400,300);event('move',2,460,320);event('up',2,460,320);event('up',1,300,300);assert.equal(q.game.export(),before);
 event('down',1,300,300);event('cancel',1,300,300);event('up',1,300,300);assert.equal(q.game.export(),before);assert.equal(q.run('selected'),q.unit.id);
});

test('preview damage bounds enclose every actual die roll without consuming RNG',()=>{
 const game=new Game(),u=game.alive('blue').find(u=>game.isDivision(u)),v=game.alive('red').find(u=>u.type==='army');v.tile=game.board.links[u.tile].find(id=>!game.board.tiles[id].sea);
 const saved=game.export(),preview=game.combatPreview(u,v);assert.equal(game.export(),saved);
 for(let die=1;die<=6;die++){game.import(saved);const a=game.unit(u.id),d=game.unit(v.id);game.random=()=>(die-.5)/6;assert.equal(game.attack(a.id,d.id).ok,true);
  const losses=game.state.losses;assert.ok(losses.red>=preview.outgoing[0]&&losses.red<=preview.outgoing[1]);assert.ok(losses.blue>=preview.incoming[0]&&losses.blue<=preview.incoming[1]);}
});
