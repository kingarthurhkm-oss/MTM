// Test-only deterministic encounter. Build standalone first, then serve the repo.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {Game} from '../app/src/main/assets/game/engine.js';
const game=new Game(2026,'legacy'),unit=game.alive('blue').find(u=>u.type==='army');
const origin=game.board.nearest(127.6,35.6,t=>t.home===1&&!t.sea).id;
unit.tile=origin;
const enemy=game.alive('red').find(u=>u.type==='army'),other=game.alive('blue').find(u=>u.type==='army'&&u.id!==unit.id);
enemy.tile=game.board.links[origin].find(id=>!game.board.tiles[id].sea);other.tile=game.board.within(origin,3).find(id=>game.board.distance(origin,id)===3&&game.sectorTileAvailable(unit,id));
game.refreshSupply();
const release=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).htmlRelease;
let html=readFileSync(new URL(`../downloads/peninsula-2026-${release}.html`,import.meta.url),'utf8');
const startup='baseMap();render();resize();requestAnimationFrame(draw);';
html=html.replace(startup,`game.import(${JSON.stringify(game.export())});resumed=true;${startup}centerTile(${origin});camera.zoom=6;dirty=true;`);
mkdirSync(new URL('../test-results/',import.meta.url),{recursive:true});
writeFileSync(new URL('../test-results/unit-controls-preview.html',import.meta.url),html);
console.log(JSON.stringify({unit:unit.id,origin,enemy:enemy.tile,other:other.tile}));
