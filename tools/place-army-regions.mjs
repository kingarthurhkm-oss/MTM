// Regenerate municipality anchors from names and public city representatives.
// Never reads old hex positions or scales old tile IDs.
import {readFileSync,writeFileSync} from 'node:fs';
import {Board} from '../app/src/main/assets/game/engine.js';
const root=new URL('../app/src/main/assets/game/data/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('rok-army.json',root),'utf8'));
const {centers}=JSON.parse(readFileSync(new URL('korea-map/municipalities.json',root),'utf8'));
const b=new Board();
for(const [id,region] of Object.entries(data.regions)){
  const site=b.geography.sites.find(s=>s.id==='place-'+id);
  const station=b.geography.sites.find(s=>s.name===region.name.replace(/시$|군$/,'')+'역');
  const center=centers[id];if(!center)throw Error('Missing municipality: '+id);
  const anchor=site??station;
  const tile=anchor?b.nearestWorld(b.tiles[anchor.tile],t=>t.home===1):b.nearest(...center,t=>t.home===1);
  region.hex={q:tile.q,r:tile.r};delete region.legacyHex;
  region.placement='municipality_representative';
  region.notes='새 한반도 맵의 시·군 대표 육지 헥스. 실제 군사 위치가 아니며 부대 중첩은 주변 빈 육지로 분산.';
  region.mapAnchor=anchor?anchor.id:'municipality:'+id;
}
data.map={id:b.geography.id,columns:b.cols,rows:b.rows,layout:b.geography.layout,precision:'city_county_game_region',basis:'region_id + CSV city/station or approximate municipality representative; nearest South Korean land. No old-grid scaling.'};
const output=JSON.stringify(data,null,2)+'\n',target=new URL('rok-army.json',root);
if(process.argv.includes('--check')){if(readFileSync(target,'utf8')!==output)throw Error('Army region anchors are stale');}
else writeFileSync(target,output);
console.log(`Korea municipality anchors validated: ${Object.keys(data.regions).length}`);
