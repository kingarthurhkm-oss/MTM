import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,TYPES} from '../app/src/main/assets/game/engine.js';
import {ARMY_DATA,ARMY_SCENARIO,armyFormation,armyTile} from '../app/src/main/assets/game/army.js';

test('public catalog loads every playable formation on a land municipality anchor without headquarters or duplicate subunits',()=>{
  const g=new Game(2026,ARMY_SCENARIO),formations=g.state.units.filter(u=>u.formationId);
  assert.equal(ARMY_DATA.units.length,67);assert.equal(formations.length,55);
  assert.equal(ARMY_DATA.units.filter(f=>f.unit_level==='사단').length,33);
  assert.equal(new Set(formations.map(u=>u.formationId)).size,55);
  for(const u of formations){
    const f=armyFormation(u.formationId);
    assert.ok(f.deployable);assert.equal(u.name,f.unit_name);assert.equal(u.tile,armyTile(g.board,f));
    assert.equal(g.board.tiles[u.tile].home,1);assert.equal(u.ap,g.spec(u).mp);
  }
  assert.equal(armyFormation('div-28'),null);
  assert.ok(!ARMY_DATA.units.some(f=>/201|203/.test(f.unit_name)));
  assert.equal(armyFormation('div-55').parent_unit,'goc');
  assert.equal(armyFormation('bde-armor-102').region_basis,'parent_region_game_fallback');
  assert.equal(g.state.units.filter(u=>u.side==='blue'&&!u.formationId).length,9);
  assert.throws(()=>{armyFormation('div-1').mobility=100;},TypeError);
});

test('Army formations are the default while the legacy scenario remains compatible',()=>{
  const legacy=new Game(2026,'legacy'),army=new Game();
  assert.equal(army.state.scenario,ARMY_SCENARIO);
  assert.equal(legacy.state.units.length,34);assert.equal(legacy.state.scenario,undefined);
  assert.deepEqual(army.state.sites,legacy.state.sites);assert.deepEqual(army.state.objectives,legacy.state.objectives);
  assert.deepEqual(army.state.units.filter(u=>u.side==='red'),legacy.state.units.filter(u=>u.side==='red'));
  for(const u of legacy.state.units)assert.deepEqual(legacy.spec(u),TYPES[u.type]);
});

test('relative profiles affect game movement, combat, reconnaissance and supply, without replacing HP or current supply',()=>{
  const g=new Game(7,ARMY_SCENARIO),unit=id=>g.state.units.find(u=>u.formationId===id);
  const infantry=unit('div-1'),rapid=unit('div-2'),armor=unit('bde-armor-1');
  assert.ok(g.spec(rapid).mp>g.spec(infantry).mp);
  assert.ok(g.spec(armor).defense>g.spec(rapid).defense);
  assert.ok(g.reconRadius(rapid)>g.reconRadius(infantry));
  const target=[...g.reachable(rapid).keys()].find(t=>t!==rapid.tile),oldTile=rapid.tile;
  assert.ok(g.move(rapid.id,target).ok);assert.notEqual(rapid.tile,oldTile);
  const enemy=g.alive('red').find(u=>u.type==='army');
  const ratio=g.combatPreview(infantry,enemy).ratio;
  infantry.supply=20;assert.ok(g.combatPreview(infantry,enemy).ratio<ratio);
  assert.equal(g.formation(infantry).logistics,60);assert.equal(infantry.hp,100);
  // Equal service conditions isolate the authored logistics modifier from the AI.
  g.aiTurn=()=>{};g.pressureEvent=()=>{};g.supplyQuality=()=>1;
  const regional=unit('div-51');infantry.supply=50;regional.supply=50;
  g.endTurn();assert.ok(regional.supply>infantry.supply);assert.equal(infantry.ap,g.spec(infantry).mp);
});

test('artillery supports ranged land combat without infantry capture or anti-air conversion',()=>{
  const g=new Game(9,ARMY_SCENARIO),art=g.state.units.find(u=>u.formationId==='bde-art-1'),enemy=g.alive('red').find(u=>u.type==='army');
  enemy.tile=g.board.within(art.tile,3).find(t=>g.board.tiles[t].home===1&&g.board.distance(art.tile,t)===2&&!g.at(t).length);
  assert.ok(g.canAttack(art,enemy));assert.ok(g.attack(art.id,enemy.id).ok);assert.equal(art.hp,97);
  const tile=g.board.tiles.find(t=>t.home===2).id,control=g.state.control[tile];
  g.capture(art,tile);assert.equal(g.state.control[tile],control);
  const aa=g.state.units.find(u=>u.formationId==='bde-aa-1');assert.equal(g.spec(aa).attack,0);
});

test('new and old saves can load across scenario types and preserve deterministic future turns',()=>{
  const a=new Game(31,ARMY_SCENARIO);a.endTurn();
  const loaded=new Game();assert.ok(loaded.import(a.export()));
  assert.deepEqual(loaded.state.units,a.state.units);
  a.endTurn();loaded.endTurn();assert.equal(a.export(),loaded.export());
  const old=new Game(32,'legacy');old.endTurn();assert.ok(loaded.import(old.export()));
  const expected=JSON.parse(old.export());expected.lastReport=null;
  assert.deepEqual(loaded.state,expected);
  assert.equal(loaded.state.scenario,undefined);
});

test('forged references, statistics, duplicate units and unsupported catalog versions are rejected atomically',()=>{
  const g=new Game(2026,'legacy'),saved=new Game(33,ARMY_SCENARIO).export(),before=g.export();
  for(const mutate of [
    s=>s.datasetVersion='future',s=>s.scenario='unknown',s=>s.units.push(s.units[0]),
    s=>{s.units.find(u=>u.formationId).formationId='div-28';},
    s=>{s.units.find(u=>u.formationId).firepower=100;},
    s=>{s.units.find(u=>u.formationId).name='forged';},
    s=>{s.units[1]=s.units[0];},s=>{s.sites[0].tile+=1;}
  ]){const s=JSON.parse(saved);mutate(s);assert.throws(()=>g.import(JSON.stringify(s)));assert.equal(g.export(),before);}
  assert.throws(()=>g.import('null'));assert.equal(g.export(),before);
  assert.throws(()=>g.newGame(3,'unknown'));assert.equal(g.export(),before);
});

test('municipal stacking survives movement and save restore while current positions stay separate from starting regions',()=>{
  const g=new Game(10,ARMY_SCENARIO),first=g.state.units.find(u=>u.formationId==='div-7'),second=g.state.units.find(u=>u.formationId==='div-15');
  assert.equal(first.tile,second.tile);assert.ok(g.at(first.tile).length>=2);
  const origin=first.tile,to=[...g.reachable(first).keys()].find(t=>t!==origin);
  assert.ok(g.move(first.id,to).ok);assert.equal(second.tile,origin);
  assert.equal(armyTile(g.board,g.formation(first)),origin);
  const loaded=new Game();loaded.import(g.export());assert.equal(loaded.unit(first.id).tile,to);assert.equal(loaded.unit(second.id).tile,origin);
});
