import { ARMY_DATA_RAW } from './army-data.js';

function freezeArmyData(value){
  if(value&&typeof value==='object'){Object.values(value).forEach(freezeArmyData);Object.freeze(value);}
  return value;
}
export const ARMY_DATA=freezeArmyData(ARMY_DATA_RAW);
export const ARMY_SCENARIO=ARMY_DATA.scenario_id;
const formationIndex=new Map(ARMY_DATA.units.map(u=>[u.id,u]));
export const armyFormation=id=>formationIndex.get(id)||null;
export const armyChildren=id=>ARMY_DATA.units.filter(u=>u.parent_unit===id);
export function armyTile(board,formation,occupied=new Set()){
  const region=ARMY_DATA.regions[formation.region_id];
  if(ARMY_DATA.map.id!==board.geography.id||!region)throw Error('육군 권역과 지도 버전이 맞지 않습니다.');
  const id=board.id(region.hex.q,region.hex.r),anchor=board.tiles[id];
  if(anchor?.home!==1)throw Error('육군 권역은 남한 육지여야 합니다.');
  const tile=board.tiles.filter(t=>t.home===1&&!occupied.has(t.id)).sort((a,b)=>board.distance(a.id,id)-board.distance(b.id,id)||((a.x-anchor.x)**2+(a.y-anchor.y)**2)-((b.x-anchor.x)**2+(b.y-anchor.y)**2)||a.id-b.id)[0];
  if(!tile)throw Error('육군을 배치할 빈 육지 타일이 없습니다.');
  return tile.id;
}
export function armyUnitSpec(base,formation){
  if(!formation)return base;
  const scale=formation.unit_level==='여단'?.8:1;
  return {...base,
    mp:Math.round(base.mp*(.75+formation.mobility/200)),
    attack:Math.round(base.attack*(.5+formation.firepower/100)*scale),
    defense:Math.round(base.defense*(.7+formation.armor/200)*scale)};
}
