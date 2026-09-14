import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Game} from '../app/src/main/assets/game/engine.js';

test('roads are exactly consecutive routed pairs, symmetric and adjacent; rebuild preserves rails',()=>{
 const g=new Game(),b=g.board,expected=new Set(),rail=JSON.stringify(b.tiles.map(t=>t.railEdges));
 const route=b.route.bind(b);
 b.route=(...args)=>{const result=route(...args);for(let i=1;i<(result?.path.length??0);i++){
  const a=result.path[i-1],c=result.path[i];expected.add(a+':'+c);expected.add(c+':'+a);
 }return result;};
 g.rebuildRoads();b.route=route;
 const actual=new Set();
 for(const t of b.tiles){
  assert.equal(new Set(t.roadEdges).size,t.roadEdges.length);
  for(const d of t.roadEdges){const n=b.neighbor(t.id,d);assert.equal(b.distance(t.id,n),1);assert.ok(b.roadLinked(n,t.id));actual.add(t.id+':'+n);}
 }
 assert.ok(actual.size>0);assert.deepEqual(actual,expected);
 assert.equal(JSON.stringify(b.tiles.map(t=>t.railEdges)),rail);
 const before=JSON.stringify(b.tiles.map(t=>t.roadEdges));g.rebuildRoads();
 assert.equal(JSON.stringify(b.tiles.map(t=>t.roadEdges)),before);
 let falseNeighbors=0;
 for(const t of b.tiles.filter(t=>t.road))for(const n of b.links[t.id])if(b.tiles[n].road&&!expected.has(t.id+':'+n)){assert.equal(b.roadLinked(t.id,n),false);falseNeighbors++;}
 assert.ok(falseNeighbors>0);
});

test('movement and supply grant a road bonus only across recorded edges',()=>{
 const g=new Game(),b=g.board,u=g.alive('blue').find(u=>u.type==='army');
 const a=b.tiles.find(t=>t.home===1&&!t.sea&&t.roadEdges.some(d=>!b.railLinked(t.id,b.neighbor(t.id,d))&&!b.tiles[b.neighbor(t.id,d)].sea));
 const n=b.neighbor(a.id,a.roadEdges.find(d=>!b.railLinked(a.id,b.neighbor(a.id,d))&&!b.tiles[b.neighbor(a.id,d)].sea));
 const bonus=g.moveCost(u,n,a.id);
 const edges=a.roadEdges;a.roadEdges=[];
 assert.ok(g.moveCost(u,n,a.id)>bonus);assert.equal(g.moveCost(u,n),g.moveCost(u,n,a.id));
 a.roadEdges=edges;
 // Isolate one source and one destination so another road cannot mask the cost.
 g.state.sites=[{id:'source',tile:a.id,kind:'city',home:'blue',health:100}];g.state.units=[];
 g.service=()=>1;b.links[a.id]=[n];b.links[n]=[];g.state.control[n]=1;
 const supplied=g.supplyField('blue').dist[n];a.roadEdges=[];
 assert.ok(g.supplyField('blue').dist[n]>supplied);
});

test('actual map renderer draws road edges without filling adjacent road triangles',()=>{
 const g=new Game(),b=g.board;
 const source=readFileSync(new URL('../app/src/main/assets/game/ui.js',import.meta.url),'utf8');
 const draw=source.slice(source.indexOf('function drawTileMap('),source.indexOf('\nfunction hex('));
 const lines=[];let start;
 const ctx={beginPath(){},fill(){},stroke(){},moveTo(x,y){start=[x,y];},lineTo(x,y){if(this.strokeStyle==='#80968d65'||this.strokeStyle==='#ad938765')lines.push([...start,x,y]);}};
 vm.runInNewContext(draw+';drawTileMap(context,game.board.tiles);',{game:g,context:ctx,oc:ctx,camera:{zoom:1},hex(){}});
 const expected=b.tiles.flatMap(t=>t.roadEdges.map(d=>{const n=b.tiles[b.neighbor(t.id,d)];return [t.x,t.y,n.x,n.y];}));
 assert.deepEqual(lines,expected);
});
