import test from 'node:test';
import assert from 'node:assert/strict';
import {Game, Board, TYPES} from '../app/src/main/assets/game/engine.js';

test('9,072 cells have symmetric six-way adjacency and cover the peninsula',()=>{
 const b=new Board();assert.equal(b.cols,72);assert.equal(b.rows,126);assert.equal(b.tiles.length,9072);
 for(const t of b.tiles){assert.ok(b.links[t.id].length<=6);for(const n of b.links[t.id]){assert.ok(b.links[n].includes(t.id));assert.equal(b.distance(t.id,n),1);}}
 for(const [lon,lat] of [[126.53,33.5],[129.78,41.8]]){const p=b.project(lon,lat);assert.ok(p.x>0&&p.x<b.width&&p.y>0&&p.y<b.height);}
 assert.equal(b.nearest(128,35.5).home,1);assert.equal(b.nearest(126,39).home,2);assert.ok(b.tiles.every(t=>!t.foreign));
});
test('foreign territory, water and domain restrictions are enforced by engine',()=>{
 const g=new Game(),army=g.alive('blue').find(u=>u.type==='army'),ship=g.alive('blue').find(u=>u.type==='navy');
 const foreign={id:-1},sea=g.board.tiles.find(t=>t.sea),land=g.board.tiles.find(t=>t.home===1);
 assert.equal(g.move(army.id,foreign.id).ok,false);assert.equal(g.move(ship.id,foreign.id).ok,false);
 assert.equal(g.move(army.id,sea.id).ok,false);assert.equal(g.move(ship.id,land.id).ok,false);
 for(const [id] of g.reachable(army)){assert.equal(g.board.tiles[id].sea,false);assert.equal(g.board.tiles[id].foreign,false);}
});
test('movement follows a path and respects remaining movement points',()=>{
 const g=new Game(),u=g.alive('blue').find(u=>u.type==='armor');const reach=g.reachable(u);
 const target=[...reach.entries()].sort((a,b)=>b[1]-a[1])[0][0],ap=u.ap;
 assert.equal(g.move(u.id,target).ok,true);assert.equal(u.tile,target);assert.ok(u.ap>=0&&u.ap<ap);
 u.ap=0;const other=g.board.links[u.tile].find(id=>g.canEnter(u,id));const before=u.tile;
 assert.equal(g.move(u.id,other).ok,false);assert.equal(u.tile,before);
});
test('damaged roads, energy and supply create movement and combat penalties',()=>{
 const g=new Game(),u=g.alive('blue').find(u=>u.type==='army'),v=g.alive('red').find(u=>u.type==='army');
 const road=g.board.tiles.find(t=>t.home===1&&t.roadEdges.some(d=>!g.board.railLinked(g.board.neighbor(t.id,d),t.id)));const from=g.board.neighbor(road.id,road.roadEdges.find(d=>!g.board.railLinked(g.board.neighbor(road.id,d),road.id)));const normal=g.moveCost(u,road.id,from),ratio=g.combatPreview(u,v).ratio;
 g.state.sites.find(s=>s.id===road.roadSite).health=0;assert.ok(g.moveCost(u,road.id,from)>normal);
 u.supply=10;assert.ok(g.combatPreview(u,v).ratio<ratio);assert.ok(g.moveCost(u,road.id,from)>normal*1.4);
});
test('destroyed logistics cut the supply field and repairs consume finite resources',()=>{
 const g=new Game(),u=g.alive('blue').find(u=>u.type==='army');assert.ok(g.supplyQuality(u)>0);
 for(const s of g.state.sites.filter(s=>s.home==='blue'&&['city','port','rail'].includes(s.kind)))s.health=0;
 for(const s of g.alive('blue').filter(u=>u.type==='supply'))s.cargo=0;
 g.refreshSupply();assert.equal(g.supplyQuality(u),0);
 const site=g.state.sites.find(s=>s.home==='blue'&&s.kind==='rail'),cp=g.state.cp,materials=g.state.materials;
 assert.equal(g.repair(site.id).ok,true);assert.equal(site.health,28);assert.equal(g.state.cp,cp-2);assert.equal(g.state.materials,materials-12);
});
test('combat uses terrain, entrenchment, supply and seeded random outcomes',()=>{
 const g=new Game(),u=g.alive('blue').find(u=>u.type==='armor'),v=g.alive('red').find(u=>u.type==='army');
 const tile=g.board.links[u.tile].find(k=>!g.board.tiles[k].sea&&!g.board.tiles[k].foreign);v.tile=tile;
 assert.ok(g.canAttack(u,v));const ratio=g.combatPreview(u,v).ratio;v.entrenched=true;assert.ok(g.combatPreview(u,v).ratio<ratio);
 const result=g.attack(u.id,v.id);assert.equal(result.ok,true);assert.ok(v.hp<100);assert.equal(g.attack(u.id,v.id).ok,false);
});
test('airport damage grounds aircraft and one sortie exhausts its action',()=>{
 const g=new Game(),u=g.alive('blue').find(u=>u.type==='air');const site=g.state.sites.find(s=>s.tile===u.tile&&s.kind==='airport');
 site.health=0;assert.equal(g.airMission(u.id,'patrol').ok,false);site.health=100;
 assert.equal(g.airMission(u.id,'recon').ok,true);assert.equal(g.state.recon,1);assert.equal(g.airMission(u.id,'support').ok,false);
});
test('transport embarks only at an operational friendly port and unloads on friendly coast',()=>{
 const g=new Game(),ship=g.alive('blue').find(u=>u.type==='transport'),u=g.alive('blue').find(u=>u.type==='army');
 const port=g.state.sites.find(s=>s.kind==='port'&&s.home==='blue'&&g.board.distance(ship.tile,s.tile)===1);u.tile=port.tile;
 port.health=0;assert.equal(g.load(ship.id).ok,false);port.health=100;
 assert.equal(g.load(ship.id).ok,true);assert.equal(u.embarked,ship.id);assert.equal(ship.passenger,u.id);
 const sea=g.board.links[ship.tile].find(k=>g.canEnter(ship,k));g.move(ship.id,sea);assert.equal(u.tile,ship.tile);
 ship.tile=g.board.links[port.tile].find(k=>g.board.tiles[k].sea);u.tile=ship.tile;ship.ap=5;
 assert.equal(g.unload(ship.id,port.tile).ok,true);assert.equal(u.embarked,null);assert.equal(u.tile,port.tile);
});
test('supply delivery has finite cargo and cannot manufacture goods',()=>{
 const g=new Game(),truck=g.alive('blue').find(u=>u.type==='supply'),u=g.alive('blue').find(u=>u.type==='army');
 u.tile=truck.tile;u.supply=20;truck.cargo=15;
 assert.equal(g.deliver(truck.id).ok,true);assert.equal(truck.cargo,0);assert.equal(u.supply,35);
 assert.equal(g.deliver(truck.id).ok,false);
});
test('a lost transport with an embarked formation can still be saved and restored',()=>{
 const g=new Game(),ship=g.alive('blue').find(u=>u.type==='transport'),u=g.alive('blue').find(u=>u.type==='army');
 u.tile=ship.tile;u.embarked=ship.id;ship.passenger=u.id;ship.hp=0;g.destroyTransport(ship);
 assert.equal(u.hp,0);assert.doesNotThrow(()=>g.import(g.export()));
});
test('national policies cost points and each can be used once per turn',()=>{
 const g=new Game(),cp=g.state.cp;assert.equal(g.policy('diplomacy').ok,true);assert.equal(g.state.cp,cp-3);assert.equal(g.state.escalation,0);
 assert.equal(g.policy('diplomacy').ok,false);assert.equal(g.state.cp,cp-3);
});
test('saved seed reproduces future turns and malformed imports are atomic',()=>{
 const a=new Game(77),b=new Game(99);a.policy('shelter');b.import(a.export());
 a.endTurn();b.endTurn();assert.equal(a.export(),b.export());
 const before=b.export(),bad=JSON.parse(before);bad.control[b.board.tiles.find(t=>t.sea).id]=1;
 assert.throws(()=>b.import(JSON.stringify(bad)));assert.equal(b.export(),before);
 const duplicate=JSON.parse(before);duplicate.units[0]=duplicate.units[1];assert.throws(()=>b.import(JSON.stringify(duplicate)));assert.equal(b.export(),before);
 const nan=JSON.parse(before);nan.units[0].hp=null;assert.throws(()=>b.import(JSON.stringify(nan)));
});
test('victory requires a two-turn hold, and losses cannot be overridden by victory',()=>{
 const g=new Game();for(const o of g.state.objectives){g.state.control[o.tile]=1;o.held=1;}assert.equal(g.checkResult(),null);
 for(const o of g.state.objectives)o.held=2;assert.equal(g.checkResult().won,true);
 const losing=new Game();for(const o of losing.state.objectives)o.held=2;losing.state.civilians=39;assert.equal(losing.checkResult().won,false);
 assert.equal(losing.endTurn().ok,false);assert.equal(losing.move(losing.alive('blue')[0].id,0).ok,false);
});
test('AI and crises keep all state bounded through the end of a campaign',()=>{
 const g=new Game(481);for(let turn=0;turn<45&&!g.state.result;turn++){
  for(const u of g.alive('blue'))if(TYPES[u.type].domain==='land')g.fortify(u.id);
  g.policy('shelter');g.policy('diplomacy');g.endTurn();
  for(const u of g.state.units){assert.ok(u.hp>=0&&u.hp<=100);assert.ok(u.supply>=0&&u.supply<=100);assert.equal(g.board.tiles[u.tile].foreign,false);}
  for(const s of g.state.sites)assert.ok(s.health>=0&&s.health<=100);
  g.import(g.export());
 }
 assert.ok(g.state.result);assert.ok(g.state.turn<=46);
});
