import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Board,Game,TYPES} from '../app/src/main/assets/game/engine.js';
import {GEOGRAPHY} from '../app/src/main/assets/game/geography.js';
import {ARMY_DATA,armyTile} from '../app/src/main/assets/game/army.js';
const root=new URL('../app/src/main/assets/game/data/korea-map/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const csv=name=>{const [header,...lines]=read(name).trim().split(/\r?\n/);return lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[header.split(',')[i],v])));};

test('the only default board has 9072 tiles matching every source mask cell and hash',()=>{
 const b=new Board(),mask=read('korea_72x126_mask.txt').trim().split(/\r?\n/);
 assert.equal(b.cols,72);assert.equal(b.rows,126);assert.equal(b.tiles.length,9072);
 for(const t of b.tiles){assert.equal(t.sea,mask[t.r][t.q]==='.');assert.equal(t.home===0,t.sea);assert.ok(t.sea||[1,2].includes(t.home));}
 for(const [name,hash] of Object.entries(GEOGRAPHY.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(new URL(name,root))).digest('hex'),hash);
 assert.equal(GEOGRAPHY.legacyMap,undefined);
 for(const scenario of ['legacy','rok-army-v1']){const g=new Game(2026,scenario);assert.equal(g.board.geography.id,'korea-72x126-v1');assert.deepEqual(g.state.control,b.tiles.map(t=>t.home));}
});

test('all cities, coastal ports and stations retain authoritative coordinates as working sites',()=>{
 const g=new Game(),b=g.board,north=new Set(['Pyongyang','Wonsan','Hamhung','Chongjin','Sinuiju','Nampo','Kaesong']);
 for(const p of csv('korea_72x126_cities_ports_adjacent_sea.csv')){
  const port=p.type==='port',id=b.id(+(port?p.port_col:p.col),+(port?p.port_row:p.row));
  const site=g.state.sites.find(s=>s.id==='place-'+p.name_en.toLowerCase());
  assert.equal(site.tile,id);assert.equal(site.name,p.name_ko);assert.equal(site.kind,p.type);assert.equal(site.health,100);
  assert.equal(b.tiles[id].sea,false);assert.equal(b.tiles[id].home,north.has(p.name_en)?2:1);
  if(port)assert.ok(b.links[id].some(n=>b.tiles[n].sea),p.name_ko);
 }
 assert.equal(g.state.sites.filter(s=>s.kind==='port').length,15);
 for(const p of csv('korea_72x126_ktx_stations.csv')){
  const id=b.id(+p.col,+p.row),site=g.state.sites.find(s=>s.kind==='rail'&&s.name===p.station+'역');
  assert.equal(site.tile,id);assert.ok(b.tiles[id].railEdges.length);assert.ok(g.owned(id,'blue'));
 }
});

test('CSV sequence anchors survive and every rail segment is symmetric and traversable',()=>{
 const b=new Board(),source=csv('korea_72x126_ktx_hex_paths.csv');
 let repairs=0;
 for(const r of b.railRoutes){
  const rows=source.filter(p=>p.route_id===r.route_id);
  assert.deepEqual(r.points.map(p=>[p.sequence,p.tile]),rows.map(p=>[+p.sequence,b.id(+p.col,+p.row)]));
  for(const s of r.segments){assert.equal(s.path[0],r.points[s.fromSequence].tile);assert.equal(s.path.at(-1),r.points[s.toSequence].tile);if(s.path.length>2)repairs++;}
  for(let i=1;i<r.path.length;i++){
   const a=r.path[i-1],c=r.path[i];assert.equal(b.distance(a,c),1);assert.ok(b.railLinked(a,c));assert.ok(b.railLinked(c,a));
  }
 }
 assert.equal(repairs,3);
 const mokpo=b.id(25,100);assert.equal(b.tiles[mokpo].sea,true);assert.equal(b.tiles[mokpo].railBridge,true);
 const g=new Game(),u=g.alive('blue').find(u=>u.type==='army'),r=b.railRoutes[0];
 const a=r.path[0],c=r.path[1];assert.ok(g.moveCost(u,c,a)<g.moveCost(u,c));
 const before=g.supplyCache.blue.dist[c];
 for(const t of g.board.tiles)t.railEdges=[];g.refreshSupply();assert.ok(g.supplyCache.blue.dist[c]>=before);
});

test('land and sea pathfinding, distances, reachable costs and bridge restrictions agree',()=>{
 const g=new Game(),b=g.board,army=g.alive('blue').find(u=>u.type==='armor'),navy=g.alive('blue').find(u=>u.type==='navy');
 for(const [from,to,sea] of [[b.id(31,68),b.id(49,96),false],[b.id(0,0),b.id(71,125),true]]){
  const route=b.route(from,to,n=>b.tiles[n].sea===sea);assert.ok(route);
  assert.ok(route.path.every(n=>b.tiles[n].sea===sea));assert.ok(route.cost>=b.distance(from,to));
  for(let i=1;i<route.path.length;i++)assert.equal(b.distance(route.path[i-1],route.path[i]),1);
 }
 for(const u of [army,navy])for(const [id,cost] of g.reachable(u)){
  assert.ok(cost<=u.ap+.0001);const path=g.route(u,id);assert.ok(path);assert.ok(Math.abs(path.cost-cost)<1e-8);
 }
 const mokpo=b.id(25,100),shore=b.id(26,100),sea=b.links[mokpo].find(n=>b.tiles[n].sea&&!b.tiles[n].railBridge);
 army.tile=shore;army.ap=20;assert.equal(g.move(army.id,mokpo).ok,true);assert.equal(army.tile,mokpo);assert.equal(g.state.control[mokpo],0);
 assert.equal(g.canEnter(army,sea),false);assert.equal(g.move(army.id,shore).ok,true);
 assert.equal(g.canEnter(navy,shore),false);
});

test('municipality deployment is deterministic, near its named region, entirely valid and unstacked',()=>{
 const g=new Game(),b=g.board;assert.equal(new Set(g.state.units.map(u=>u.tile)).size,g.state.units.length);
 for(const u of g.state.units){const t=b.tiles[u.tile];assert.equal(t.sea,TYPES[u.type].domain==='sea');if(!t.sea)assert.equal(t.home,u.side==='blue'?1:2);}
 for(const u of g.state.units.filter(u=>u.formationId)){
  const f=ARMY_DATA.units.find(f=>f.id===u.formationId),anchor=armyTile(b,f);
  assert.ok(b.distance(anchor,u.tile)<=4,f.unit_name);
 }
 const initial=g.export();g.endTurn();g.newGame();assert.equal(g.export(),initial);
 for(const region of Object.values(ARMY_DATA.regions)){assert.equal(region.legacyHex,undefined);assert.equal(b.tiles[b.id(region.hex.q,region.hex.r)].home,1);}
});

test('range rings and sectors use graph distance on even and odd rows',()=>{
 const g=new Game(),b=g.board;
 for(const row of [60,61])for(const radius of [1,4,9]){
  const id=b.id(35,row),ring=new Set(b.within(id,radius));
  assert.equal(ring.size,1+3*radius*(radius+1));
  for(const t of b.tiles)assert.equal(ring.has(t.id),b.distance(id,t.id)<=radius);
 }
 const u=g.alive('blue').find(u=>g.isDivision(u)),ids=b.within(u.tile,1).filter(id=>g.sectorTileAvailable(u,id));
 assert.ok(g.setSector(u.id,ids.map(tile=>({tile,share:.8/ids.length})),.2).ok);
 for(const id of ids)assert.equal(g.responsible(id,'blue'),u);
 const saved=g.export();g.import(saved);assert.equal(g.export(),saved);
});
