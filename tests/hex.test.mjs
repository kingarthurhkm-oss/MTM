import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Board,Game} from '../app/src/main/assets/game/engine.js';
import {GEOGRAPHY} from '../app/src/main/assets/game/geography.js';
import {offsetToAxial,axialToOffset,worldToScreen,screenToWorld} from '../app/src/main/assets/game/hex.js';

const board=new Board(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('all 9072 regular hexes round trip, share edges and preserve ordered adjacency',()=>{
 for(const t of board.tiles){
  assert.deepEqual(axialToOffset(t.axial),{q:t.q,r:t.r});
  assert.deepEqual(offsetToAxial(t.q,t.r),t.axial);
  assert.equal(board.closest(t.x,t.y),t.id);
  const c=board.layout.corners(t);
  for(let i=0;i<6;i++){
   near(Math.hypot(c[i].x-t.x,c[i].y-t.y),board.layout.radius);
   near(Math.hypot(c[i].x-c[(i+1)%6].x,c[i].y-c[(i+1)%6].y),board.layout.radius);
   assert.ok(c[i].x>=-1e-8&&c[i].x<=board.width+1e-8&&c[i].y>=-1e-8&&c[i].y<=board.height+1e-8);
   const n=board.neighbor(t.id,i);if(n<0)continue;
   const other=board.tiles[n];
   assert.equal(board.distance(t.id,n),1);
   near(Math.hypot(t.x-other.x,t.y-other.y),board.dx);
   const edge=board.layout.edge(t,i),opposite=board.layout.edge(other,[1,0,5,4,3,2][i]);
   near(edge[0].x,opposite[1].x);near(edge[0].y,opposite[1].y);
   near(edge[1].x,opposite[0].x);near(edge[1].y,opposite[0].y);
  }
  const delta=t.r%2?[[0,-1],[1,1],[-1,0],[0,1],[1,-1],[1,0]]:[[-1,-1],[0,1],[-1,0],[-1,1],[0,-1],[1,0]];
  assert.deepEqual(board.links[t.id],delta.map(([q,r])=>board.id(t.q+q,t.r+r)).filter(id=>id>=0));
 }
});
test('picking across each edge and through pan/zoom uses polygon containment',()=>{
 for(const q of [20,21]){
  const t=board.tiles[board.id(q,60)];
  for(let direction=0;direction<6;direction++){
   const [a,b]=board.layout.edge(t,direction),m={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
   for(const k of [.999,1.001]){
    const p={x:t.x+(m.x-t.x)*k,y:t.y+(m.y-t.y)*k};
    for(const zoom of [.12,.8,3,6]){
     const camera={x:711,y:839,zoom},s=worldToScreen(p,camera,1280,720),w=screenToWorld(s,camera,1280,720);
     assert.equal(board.closest(w.x,w.y),k<1?t.id:board.neighbor(t.id,direction));
    }
   }
  }
 }
 assert.equal(board.closest(-100,-100),-1);
 assert.equal(board.closest(board.width+100,board.height+100),-1);
 assert.equal(board.closest(NaN,0),-1);
});
test('tile domains exactly retain RLE geography and coastlines contain every land/sea edge once',()=>{
 const owners=[];for(let i=0;i<GEOGRAPHY.ownersRLE.length;i+=2)for(let j=0;j<GEOGRAPHY.ownersRLE[i+1];j++)owners.push(GEOGRAPHY.ownersRLE[i]);
 assert.deepEqual(board.tiles.map(t=>t.home),owners);
 const expected=new Set();
 for(const t of board.tiles){
  assert.equal(t.domain,t.sea?'sea':'land');assert.ok(['plains','hills','mountain'].includes(t.terrain));if(t.sea)assert.equal(t.terrain,'plains');assert.equal(t.forest,false);assert.ok(['none','high'].includes(t.urban));
  for(const key of ['riverEdges','roadEdges'])assert.deepEqual(t[key],[]);
  if(t.domain==='land')for(const n of board.links[t.id])if(board.tiles[n].sea)expected.add(`${t.id}:${n}`);
 }
 assert.deepEqual(new Set(board.coastlines.map(c=>`${c.tile}:${c.neighbor}`)),expected);
 assert.equal(board.coastlines.length,expected.size);
 assert.notEqual(board.tiles[0].riverEdges,board.tiles[1].riverEdges);
 const front=board.tiles.filter(t=>t.home===1&&board.links[t.id].some(id=>board.tiles[id].home===2));
 const span=Math.max(...front.flatMap(a=>front.map(b=>board.distance(a.id,b.id))));
 assert.ok(span>=15&&span<40); // Approximately twenty hex steps across the ceasefire front.
});
test('current saves round trip and old-grid saves are rejected atomically',()=>{
 for(const scenario of ['legacy','rok-army-v1']){
  const g=new Game(2026,scenario),saved=g.export();g.import(saved);assert.equal(g.export(),saved);
  for(const version of [1,2]){const old=JSON.parse(saved);old.version=version;assert.throws(()=>g.import(JSON.stringify(old)));assert.equal(g.export(),saved);}
 }
});
