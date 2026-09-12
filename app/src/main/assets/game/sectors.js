// Responsibility belongs to a command, never to a newly spawned map counter.
// Shares are fractions of the command's current hp. Combat removes local power
// first, then committed reserve, and updates shares without harming other tiles.
export function sectorStrength(unit, tile, reserveLimit=10) {
  const sector=unit.sector;
  const total=unit.hp;
  if(!sector)return {total,local:total,reserve:0,committed:total,engaged:0};
  const local=total*(sector.allocations.find(a=>a.tile===tile)?.share??0);
  const reserve=total*sector.reserveShare;
  return {total,local,reserve,committed:local+Math.min(reserve,reserveLimit,Math.max(0,30-local)),engaged:sector.engaged??0};
}
export function sectorOwner(units, tile, side) {
  return units.find(u=>u.side===side&&u.hp>0&&!u.embarked&&u.sector?.allocations.some(a=>a.tile===tile))??null;
}
export function applySectorLoss(unit,tile,loss) {
  if(!unit.sector){unit.hp=Math.max(0,unit.hp-loss);return;}
  const sector=unit.sector,before=unit.hp;
  const commitment=sectorStrength(unit,tile).committed;
  const rows=sector.allocations.map(a=>({tile:a.tile,power:a.share*before}));
  const local=rows.find(a=>a.tile===tile);
  const localLoss=Math.min(local?.power??0,loss);
  if(local)local.power-=localLoss;
  const reserve=Math.max(0,sector.reserveShare*before-(loss-localLoss));
  unit.hp=Math.max(0,before-loss);
  sector.reserveShare=unit.hp?reserve/unit.hp:1;
  // An exhausted defense releases responsibility so the front can be breached.
  sector.allocations=rows.filter(a=>!(a.tile===tile&&loss>=commitment)).map(a=>({tile:a.tile,share:unit.hp?a.power/unit.hp:0}));
  if(!unit.hp)sector.allocations=[];
}
export function validateSector(sector, board) {
  if(!sector||sector.version!==1||typeof sector.commandId!=='string'||!['division','corps'].includes(sector.commandLevel)||!Array.isArray(sector.allocations)||sector.allocations.length>64)throw Error('전투지경선 데이터가 올바르지 않습니다.');
  const valid=x=>Number.isFinite(x)&&x>=0&&x<=1;
  const ids=new Set();let sum=sector.reserveShare;
  if(!valid(sum)||sector.engaged!==0)throw Error('전투지경선 예비 전력이 올바르지 않습니다.');
  for(const a of sector.allocations){
    if(!a||typeof a!=='object')throw Error('전투지경선 배분 항목이 누락되었습니다.');
    const t=board.tiles[a.tile];
    if(!Number.isInteger(a.tile)||!t||t.sea||t.foreign||ids.has(a.tile)||!valid(a.share))throw Error('전투지경선 타일 또는 배분이 올바르지 않습니다.');
    ids.add(a.tile);sum+=a.share;
  }
  if(Math.abs(sum-1)>1e-8)throw Error('전투지경선 배분과 예비 전력의 합은 100%여야 합니다.');
}
