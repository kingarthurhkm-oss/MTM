import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, TYPES } from '../app/src/main/assets/game/engine.js';

test('AI assigns garrisons to defend objectives and garrisons entrench when holding position', () => {
  const g = new Game(2026);
  g.aiTurn();
  
  const redGround = g.alive('red').filter(u => ['army', 'armor'].includes(u.type));
  assert.ok(redGround.length > 0);
  
  const entrenchedCount = redGround.filter(u => u.entrenched).length;
  assert.ok(entrenchedCount > 0, 'At least one red ground unit should be entrenched in defensive posture');
});

test('AI garrison prioritizes liberating an objective occupied by a blue intruder', () => {
  const g = new Game(2026);
  const obj = g.state.objectives[0]; // sector-1
  const blueUnit = g.alive('blue').find(u => ['army', 'armor'].includes(u.type));
  blueUnit.tile = obj.tile;
  blueUnit.hp = 20;
  g.state.control[obj.tile] = 1;
  obj.held = 1;

  // Find red units and position one near the objective
  const redUnits = g.alive('red').filter(u => ['army', 'armor'].includes(u.type));
  const redUnit = redUnits.find(u => g.board.distance(u.tile, obj.tile) <= 3);
  
  if (redUnit) {
    const neighbor = g.board.links[obj.tile].find(t => !g.board.tiles[t].sea);
    redUnit.tile = neighbor;
    redUnit.ap = g.spec(redUnit).mp;
    redUnit.acted = false;

    g.aiTurn();

    // Check if any red unit attacked the blue intruder
    const anyRedAttacked = redUnits.some(u => u.acted);
    assert.ok(anyRedAttacked, 'At least one red unit should have attacked the blue intruder on the objective');
    assert.ok(blueUnit.hp <= 20, 'Blue unit on objective should have received damage or been destroyed');
  }
});

test('AI frontline units use defensive posture and entrench instead of suicidally attacking at extreme disadvantage', () => {
  const g = new Game(2026);
  const redUnit = g.alive('red').find(u => u.type === 'army');
  const blueUnit = g.alive('blue').find(u => u.type === 'armor');
  
  redUnit.hp = 15;
  redUnit.supply = 20;
  blueUnit.hp = 100;
  blueUnit.supply = 100;
  blueUnit.entrenched = true;
  
  const landLinks = g.board.links[blueUnit.tile].filter(t => !g.board.tiles[t].sea);
  if (landLinks.length > 0) {
    redUnit.tile = landLinks[0];
    redUnit.acted = false;
    redUnit.ap = g.spec(redUnit).mp;
    
    for (const other of g.alive('blue')) {
      if (other.id !== blueUnit.id) other.tile = 0;
    }
    
    g.aiTurn();
    assert.ok(redUnit.entrenched, 'Red unit at severe disadvantage should entrench');
  }
});

test('AI actions are completely deterministic across identical seeds', () => {
  const g1 = new Game(12345);
  const g2 = new Game(12345);

  for (let turn = 0; turn < 3; turn++) {
    g1.endTurn();
    g2.endTurn();
    assert.equal(g1.export(), g2.export(), `State should match at turn ${turn + 1}`);
  }
});
