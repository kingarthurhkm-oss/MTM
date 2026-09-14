import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Board,Game} from '../app/src/main/assets/game/engine.js';
import {GEOGRAPHY} from '../app/src/main/assets/game/geography.js';
import {TERRAIN_DATA} from '../app/src/main/assets/game/terrain-data.js';
import {applyTerrain,drawTerrain} from '../app/src/main/assets/game/terrain.js';

const samples=JSON.parse(readFileSync(new URL('../tools/data/terrain-samples.json',import.meta.url)));
test('DEM covers all land exactly once and preserves every other tile field and deployment',()=>{
 const real=new Board(),plain=new Board({...GEOGRAPHY,id:'terrain-control'});
 const withoutTerrain=t=>{const {terrain,...rest}=t;return rest;};
 assert.deepEqual(real.tiles.map(withoutTerrain),plain.tiles.map(withoutTerrain));
 assert.deepEqual(samples.rows.map(r=>r[0]),real.tiles.filter(t=>!t.sea).map(t=>t.id));
 assert.ok(samples.rows.every(r=>r[3]>0&&r[3]<=67));
 const counts={plains:0,hills:0,mountain:0};
 real.tiles.forEach(t=>{if(t.sea)assert.equal(t.terrain,'plains');else counts[t.terrain]++;});
 assert.deepEqual(counts,TERRAIN_DATA.counts);
 plain.geography=GEOGRAPHY; // Restore scenario identity after creating the plains-only control.
 const g=new Game(2026,undefined,real),control=new Game(2026,undefined,plain);
 assert.deepEqual(g.state.units.map(u=>[u.id,u.tile,u.sector]),control.state.units.map(u=>[u.id,u.tile,u.sector]));
 assert.deepEqual(g.state.sites,control.state.sites);
 assert.deepEqual(real.tiles.map(withoutTerrain),plain.tiles.map(withoutTerrain));
});

test('mismatched or truncated terrain fails before mutating tiles',()=>{
 const b=new Board({...GEOGRAPHY,id:'terrain-control'}),before=structuredClone(b.tiles);
 for(const change of [{landCodes:'1'},{landCodes:'x'.repeat(2411)},{maskSha256:'bad'},{georeference:{}},{columns:73}]){
  assert.throws(()=>applyTerrain(b.tiles,GEOGRAPHY,{...TERRAIN_DATA,...change}));
  assert.deepEqual(b.tiles,before);
 }
});

test('geographic DEM checkpoints distinguish mountain ranges, plateau and floodplains',()=>{
 const b=new Board();
 const checks=[['Taebaek',128.9,37.15,'mountain'],['Sobaek',128.48,36.95,'mountain'],
  ['Hamgyong',129.2,41.1,'mountain'],['Kaema',127.5,40.9,'mountain'],
  ['West coast',126.85,36.88,'plains'],['Honam',126.85,35.82,'plains'],
  ['Nakdong delta',128.9,35.15,'plains'],['Pyongyang plain',125.65,38.98,'plains']];
 for(const [name,lon,lat,expected] of checks){
  const t=b.nearest(lon,lat,t=>!t.sea),row=samples.rows.find(r=>r[0]===t.id);
  assert.equal(t.terrain,expected,name);assert.equal(row[5],1,`${name} must use its own footprint`);
 }
});

test('terrain overlay is absent for plains/sea and restores canvas state for hills/mountains',()=>{
 const layout=new Board().layout,ops=[];
 const context=new Proxy({},{get:(_,key)=>(...args)=>ops.push([key,...args]),set:(_,key,value)=>{ops.push([key,value]);return true;}});
 for(const tile of [{terrain:'plains',sea:false},{terrain:'mountain',sea:true}])drawTerrain(context,{x:20,y:20,...tile},layout);
 assert.equal(ops.length,0);
 for(const terrain of ['hills','mountain']){
  ops.length=0;drawTerrain(context,{x:20,y:20,sea:false,terrain},layout);
  assert.equal(ops[0][0],'save');assert.equal(ops.at(-1)[0],'restore');
  assert.ok(ops.some(o=>o[0]==='fill'));assert.ok(ops.some(o=>o[0]==='stroke'));
  assert.equal(ops.some(o=>o[0]==='quadraticCurveTo'),terrain==='hills');
 }
});

test('offline converter thresholds, footprint geometry and stale-data guards',()=>{
 execFileSync(process.env.PYTHON||'python3',['tests/terrain_test.py'],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
});
