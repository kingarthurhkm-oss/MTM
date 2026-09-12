import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Board,Game,TYPES} from '../app/src/main/assets/game/engine.js';
import {GEOGRAPHY} from '../app/src/main/assets/game/geography.js';
import {ARMY_DATA} from '../app/src/main/assets/game/army.js';

test('the Korean land span near the ceasefire-line latitude is at least twenty contiguous tiles',()=>{
 const b=new Board();
 const row=Math.round(b.project(127.5,38).y/b.dy);
 const cols=b.tiles.filter(t=>t.r===row&&[1,2].includes(t.home)).map(t=>t.q).sort((a,b)=>a-b);
 let longest=0,run=0,last=-2;
 for(const q of cols){run=q===last+1?run+1:1;longest=Math.max(longest,run);last=q;}
 assert.ok(longest>=20);
 assert.equal(b.tiles.length,240*480);
});
test('municipality anchors stay on South Korean land near their original coarse game position',()=>{
 const old=new Board(GEOGRAPHY.legacyMap),current=new Board();
 for(const region of Object.values(ARMY_DATA.regions)){
  const before=old.tiles[old.id(region.legacyHex.q,region.legacyHex.r)];
  const after=current.tiles[current.id(region.hex.q,region.hex.r)];
  assert.equal(after.home,1);
  assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<old.dx*.5);
 }
});
for(const scenario of ['legacy','army'])test(`v1 ${scenario} saves retain progress and valid geographic placement`,()=>{
 const text=readFileSync(new URL(`./fixtures/map-v1-${scenario}.json`,import.meta.url),'utf8'),prior=JSON.parse(text);
 const old=new Board(GEOGRAPHY.legacyMap),g=new Game();g.import(text);
 assert.equal(g.state.version,2);assert.equal(g.state.turn,prior.turn);assert.equal(g.state.rng,prior.rng);
 assert.equal(g.state.units.length,prior.units.length);assert.equal(g.state.control.length,g.board.tiles.length);
 for(const u of g.state.units){
  const orig=prior.units.find(v=>v.id===u.id),a=old.tiles[orig.tile],b=g.board.tiles[u.tile];
  assert.equal(u.hp,orig.hp);assert.equal(u.supply,orig.supply);assert.equal(u.ap,orig.ap);
  assert.equal(a.home,b.home);
  const site=prior.sites.find(v=>v.tile===orig.tile);
  if(site)assert.equal(u.tile,g.state.sites.find(v=>v.id===site.id).tile);
  else if(!a.sea)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<old.dx*2);
  if(u.hp>0&&!u.embarked&&TYPES[u.type].domain!=='air')assert.equal(b.sea,TYPES[u.type].domain==='sea');
 }
 const loaded=new Game();loaded.import(g.export());assert.equal(loaded.export(),g.export());
 const before=g.export();prior.sites[0].tile++;assert.throws(()=>g.import(JSON.stringify(prior)));assert.equal(g.export(),before);
});
