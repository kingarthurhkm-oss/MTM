import { TERRAIN_DATA } from './terrain-data.js';

// Apply only the terrain field. Transport, vegetation, cities and units are independent.
export function applyTerrain(tiles, geography, data=TERRAIN_DATA){
  if(geography.id!==data.mapId)return;
  if(geography.columns!==data.columns||geography.rows!==data.rows||
     geography.sourceHashes['korea_72x126_mask.txt']!==data.maskSha256||
     JSON.stringify(geography.georeference)!==JSON.stringify(data.georeference))
    throw Error('지형 데이터와 지도 좌표계가 일치하지 않습니다.');
  const land=tiles.filter(t=>!t.sea),names=['plains','hills','mountain'];
  if(land.length!==data.landCodes.length||!/^[012]+$/.test(data.landCodes))
    throw Error('지형 데이터가 손상되었습니다.');
  land.forEach((t,i)=>{t.terrain=names[Number(data.landCodes[i])];});
}

// Rendered beneath all infrastructure and gameplay overlays, at every zoom level.
export function drawTerrain(context,tile,layout){
  if(tile.sea||tile.terrain==='plains')return;
  const mountain=tile.terrain==='mountain',r=layout.radius;
  context.save();
  layout.path(context,tile);
  context.fillStyle=mountain?'#c4c9b333':'#b6b79715';context.fill();
  context.strokeStyle=mountain?'#c6cbb570':'#bac3ac48';
  context.lineWidth=mountain?.9:.7;
  context.lineJoin='round';context.lineCap='round';
  context.beginPath();
  if(mountain){
    context.moveTo(tile.x-r*.45,tile.y+r*.25);
    context.lineTo(tile.x-r*.1,tile.y-r*.4);
    context.lineTo(tile.x+r*.2,tile.y+r*.2);
    context.moveTo(tile.x+r*.05,tile.y-r*.07);
    context.lineTo(tile.x+r*.25,tile.y-r*.3);
    context.lineTo(tile.x+r*.48,tile.y+r*.25);
  }else{
    context.moveTo(tile.x-r*.4,tile.y+r*.15);
    context.quadraticCurveTo(tile.x-r*.05,tile.y-r*.35,tile.x+r*.3,tile.y+r*.15);
  }
  context.stroke();context.restore();
}
