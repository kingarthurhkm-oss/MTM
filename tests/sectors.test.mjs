import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../app/src/main/assets/game/engine.js';
import {sectorStrength,applySectorLoss,validateSector} from '../app/src/main/assets/game/sectors.js';
function setup(){
 const g=new Game(),u=g.alive('blue').find(u=>u.formationId==='div-1'),count=g.state.units.length;
 const tiles=g.board.tiles.filter(t=>t.home===1&&!g.at(t.id).length&&g.board.distance(u.tile,t.id)>3).slice(0,3).map(t=>t.id);
 assert.equal(g.setSector(u.id,tiles.map((tile,i)=>({tile,share:[.2,.35,.25][i]})),.2).ok,true);
 return {g,u,tiles,count};
}
test('rear HQ and three differently allocated sectors preserve all counters and budget',()=>{
 const {g,u,tiles,count}=setup();assert.ok(tiles.every(t=>t!==u.tile));assert.equal(g.state.units.length,count);
 assert.deepEqual(tiles.map(t=>sectorStrength(u,t).local),[20,35,25]);assert.equal(g.commandStatus(u).reserve,20);
 assert.equal(g.commandStatus(u).hqTile,u.tile);for(const t of tiles)assert.equal(g.responsible(t,'blue'),u);
});
test('tile attack finds rear HQ command, consumes local first and leaves other sectors intact',()=>{
 const {g,u,tiles}=setup(),enemy=g.alive('red').find(v=>v.type==='army'),hq=u.tile;
 enemy.tile=g.board.links[tiles[0]].find(t=>!g.board.tiles[t].sea&&!g.board.tiles[t].foreign&&!g.at(t).length);
 assert.equal(g.canEnter(enemy,tiles[0]),false);assert.equal(g.canAttackTile(enemy,tiles[0]),true);
 const before=u.hp,other=sectorStrength(u,tiles[1]).local;
 assert.equal(g.attackTile(enemy.id,tiles[0],true).ok,true);assert.ok(u.hp<before);assert.equal(u.tile,hq);
 assert.ok(Math.abs(sectorStrength(u,tiles[1]).local-other)<1e-8);assert.equal(u.sector.engaged,0);
 validateSector(u.sector,g.board);assert.ok(g.state.log[0].text.includes(String(tiles[0])));
});
test('reserve cannot be double spent and exhausted sector allows breakthrough without HQ destruction',()=>{
 const {g,u,tiles}=setup();g.setSector(u.id,tiles.map((tile,i)=>({tile,share:[0,.5,.5][i]})),0);
 const enemy=g.alive('red').find(v=>v.type==='army');enemy.tile=g.board.links[tiles[0]].find(t=>!g.board.tiles[t].sea&&!g.at(t).length);
 assert.equal(g.attackTile(enemy.id,tiles[0],true).ok,true);assert.equal(g.responsible(tiles[0],'blue'),null);assert.equal(enemy.tile,tiles[0]);assert.equal(u.hp,100);
 const fake={hp:100,sector:{...u.sector,allocations:[{tile:1,share:.2},{tile:2,share:.7}],reserveShare:.1}};
 applySectorLoss(fake,1,30);assert.equal(fake.hp,70);assert.equal(fake.sector.reserveShare,0);assert.equal(sectorStrength(fake,2).local,70);
});
test('sector save round trip, malformed imports, duplicate claims and legacy defaults',()=>{
 const {g,u,tiles}=setup(),saved=g.export(),copy=new Game();copy.import(saved);assert.deepEqual(copy.unit(u.id).sector,u.sector);
 const bad=JSON.parse(saved);bad.units.find(v=>v.id===u.id).sector.reserveShare=.9;assert.throws(()=>copy.import(JSON.stringify(bad)));assert.equal(copy.export(),saved);
 const other=g.alive('blue').find(v=>v.id!==u.id&&g.isDivision(v));assert.equal(g.setSector(other.id,[{tile:tiles[0],share:1}],0).ok,false);
 for(const v of g.state.units)delete v.sector;copy.import(g.export());assert.equal(copy.commandStatus(copy.unit(u.id)).sector,null);assert.equal(sectorStrength(copy.unit(u.id),u.tile).committed,u.hp);
});
test('HQ movement leaves allocation in place and sector AI never pursues beyond responsibility',()=>{
 const {g,u,tiles}=setup(),before=JSON.stringify(u.sector);const dest=g.board.links[u.tile].find(t=>g.canEnter(u,t));
 assert.equal(g.move(u.id,dest).ok,true);assert.equal(JSON.stringify(u.sector),before);
 const enemy=g.alive('red').find(v=>v.type==='army'),hq=enemy.tile;
 enemy.sector={version:1,commandId:enemy.id,commandLevel:'division',allocations:[],reserveShare:1,engaged:0};g.aiTurn();assert.equal(enemy.tile,hq);
 assert.equal(g.canAttack(u,enemy),false);
});
test('invalid terrain, excessive budget and brigade sectors are rejected without mutation',()=>{
 const {g,u}=setup(),saved=g.export();assert.equal(g.setSector(u.id,[{tile:g.board.tiles.find(t=>t.sea).id,share:1}],0).ok,false);
 assert.equal(g.setSector(u.id,[],2).ok,false);assert.equal(g.export(),saved);
 for(const allocations of [undefined,null,[null],[{}]])assert.equal(g.setSector(u.id,allocations,0).ok,false);
 assert.equal(g.export(),saved);
 const brigade=g.alive('blue').find(v=>g.formation(v)?.unit_level==='여단');assert.equal(g.setSector(brigade.id,[],1).ok,false);
});
test('partial sector saves are rejected atomically; absent optional data stays compatible',()=>{
 const {g,u}=setup(),saved=g.export();
 for(const sector of [{},{...u.sector,allocations:[null]},{...u.sector,engaged:5}]){
   const bad=JSON.parse(saved);bad.units.find(v=>v.id===u.id).sector=sector;
   assert.throws(()=>g.import(JSON.stringify(bad)));assert.equal(g.export(),saved);
 }
});
test('HQ attack uses reserve only, preview does not consume power and repeated battles preserve budgets',()=>{
 const {g,u,tiles}=setup(),enemy=g.alive('red').find(v=>v.type==='army');
 assert.equal(sectorStrength(u,u.tile).local,0);assert.equal(sectorStrength(u,u.tile).committed,10);
 const saved=g.export();g.combatPreview(enemy,u,tiles[0]);assert.equal(g.export(),saved);
 for(let turn=0;turn<3;turn++){
   enemy.hp=100;enemy.ap=9;enemy.acted=false;
   const tile=u.sector.allocations[0]?.tile;if(tile===undefined)break;
   enemy.tile=g.board.links[tile].find(t=>!g.board.tiles[t].sea&&!g.at(t).length);
   assert.equal(g.attackTile(enemy.id,tile,true).ok,true);validateSector(u.sector,g.board);
   const copy=new Game();copy.import(g.export());assert.deepEqual(copy.unit(u.id).sector,u.sector);
 }
});
test('existing unit attacks redirect to sector responsibility and AI attacks the front before HQ',()=>{
 const {g,u,tiles}=setup(),enemy=g.alive('red').find(v=>v.type==='army');
 const local=g.alive('blue').find(v=>v.type==='supply');local.tile=tiles[0];
 enemy.tile=g.board.links[tiles[0]].find(t=>!g.board.tiles[t].sea&&!g.at(t).length);
 assert.equal(g.attack(enemy.id,local.id,true).ok,true);assert.equal(local.hp,100);assert.ok(u.hp<100);
 const next=setup(),attacker=next.g.alive('red').find(v=>v.type==='army');
 attacker.tile=next.g.board.links[next.tiles[0]].find(t=>!next.g.board.tiles[t].sea&&!next.g.at(t).length);
 const hq=next.u.tile;next.g.aiTurn();assert.ok(next.u.hp<100);assert.equal(next.u.tile,hq);
});
