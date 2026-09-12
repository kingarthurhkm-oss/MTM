// Run after the standalone build; serve the repository and open
// /test-results/sector-preview.html for a reproducible visual QA scenario.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Game} from '../app/src/main/assets/game/engine.js';
const game=new Game(),unit=game.state.units.find(u=>u.formationId==='div-1');
const tiles=[45914,45675,45916];
assert.equal(unit.tile,46633);
assert.equal(game.setSector(unit.id,tiles.map((tile,i)=>({tile,share:[.2,.5,.2][i]})),.1).ok,true);
const release=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).htmlRelease;
let html=readFileSync(new URL(`../downloads/peninsula-2026-${release}.html`,import.meta.url),'utf8');
const startup='baseMap();render();resize();requestAnimationFrame(draw);';
assert.ok(html.includes(startup));
html=html.replace(startup,`game.import(${JSON.stringify(game.export())});resumed=true;${startup}choose(${JSON.stringify(unit.id)});fitSector(game.unit(${JSON.stringify(unit.id)}));`);
mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});
writeFileSync(new URL('../test-results/sector-preview.html',import.meta.url),html);
console.log('UI fixture: HQ 46633; sectors 45914 / 45675 / 45916; 20 / 50 / 20%; reserve 10%');
