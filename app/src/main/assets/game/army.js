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
export function armyTile(board,formation){
  const region=ARMY_DATA.regions[formation.region_id];
  const hex=board.cols===120?region.legacyHex:region.hex;
  const id=board.id(hex.q,hex.r);
  if(!((board.cols===ARMY_DATA.map.columns&&board.rows===ARMY_DATA.map.rows)||(board.cols===120&&board.rows===240))||board.tiles[id]?.home!==1)throw Error('육군 권역과 지도 버전이 맞지 않습니다.');
  return id;
}
export function armyUnitSpec(base,formation){
  if(!formation)return base;
  const scale=formation.unit_level==='여단'?.8:1;
  return {...base,
    mp:Math.round(base.mp*(.75+formation.mobility/200)),
    attack:Math.round(base.attack*(.5+formation.firepower/100)*scale),
    defense:Math.round(base.defense*(.7+formation.armor/200)*scale)};
}
