import { GEOGRAPHY } from './geography.js';
import { HexLayout, HEX_DIRECTIONS, offsetToAxial, axialToOffset, hexDistance, tileGeography } from './hex.js';
import { ARMY_DATA, ARMY_SCENARIO, armyFormation, armyTile, armyUnitSpec } from './army.js';

import { sectorStrength, sectorOwner, validateSector, applySectorLoss } from './sectors.js';

export const VERSION = 3;
export const TYPES = {
  army: {name:'보병사단', domain:'land', mp:9, attack:17, defense:16, range:1},
  armor: {name:'기갑사단', domain:'land', mp:12, attack:22, defense:18, range:1},
  artillery: {name:'포병여단', domain:'land', mp:8, attack:23, defense:10, range:4},
  air: {name:'전투비행단', domain:'air', mp:1, attack:19, defense:12, range:200},
  navy: {name:'해군전단', domain:'sea', mp:16, attack:21, defense:19, range:4},
  airdefense: {name:'방공여단', domain:'land', mp:7, attack:0, defense:15, range:9},
  transport: {name:'수송선단', domain:'sea', mp:15, attack:0, defense:8, range:0},
  supply: {name:'전선 보급대', domain:'land', mp:10, attack:0, defense:7, range:0}
};
export const SITE_TYPES = {
  city:{name:'도시', mark:'도시', effect:'민간 보호 · 지역 보급 거점'},
  power:{name:'전력', mark:'전', effect:'전력 공급 · 보급 생산'},
  comms:{name:'통신', mark:'통', effect:'지휘점 · 정찰'},
  port:{name:'항만', mark:'항', effect:'해상 수송 · 보급 거점'},
  rail:{name:'철도', mark:'철', effect:'보급 수송량'},
  road:{name:'도로', mark:'도', effect:'이동 비용 · 보급 경로'},
  airport:{name:'공항', mark:'공', effect:'비행단 출격 효율'},
  energy:{name:'에너지', mark:'연', effect:'연료 · 기동 효율'}
};
export const clamp = (x, lo=0, hi=100) => Math.max(lo, Math.min(hi, x));
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const SIDE = {blue:1, red:2};

class Heap {
  constructor(){this.a=[];}
  push(id,cost){const a=this.a;let i=a.length;a.push([id,cost]);while(i){const p=(i-1)>>1;if(a[p][1]<=cost)break;a[i]=a[p];i=p;}a[i]=[id,cost];}
  pop(){const a=this.a, out=a[0], end=a.pop();if(a.length){let i=0;while(true){let j=i*2+1;if(j>=a.length)break;if(j+1<a.length&&a[j+1][1]<a[j][1])j++;if(a[j][1]>=end[1])break;a[i]=a[j];i=j;}a[i]=end;}return out;}
  get length(){return this.a.length;}
}

export class Board {
  constructor(geography=GEOGRAPHY){
    this.geography=geography;
    this.cols=geography.columns;this.rows=geography.rows;
    if(geography.layout!=='odd-r')throw Error('지원하지 않는 지도 좌표계입니다.');
    this.layout=new HexLayout(geography.hexRadius);
    this.dx=this.layout.dx;this.dy=this.layout.dy;
    Object.assign(this,this.layout.bounds(this.cols,this.rows));
    const owners=[];const r=geography.ownersRLE;
    for(let i=0;i<r.length;i+=2)for(let j=0;j<r[i+1];j++)owners.push(r[i]);
    if(owners.length!==this.cols*this.rows||owners.some(v=>![0,1,2].includes(v)))throw Error('지도 마스크가 손상되었습니다.');
    this.tiles=owners.map((home,id)=>{
      const q=id%this.cols,row=Math.floor(id/this.cols),axial=offsetToAxial(q,row);
      return {id,q,r:row,axial,home,sea:home===0,foreign:false,...tileGeography(home===0?'sea':'land'),
        ...this.layout.toWorld(axial),road:false,rail:false,railBridge:false,roadSite:null};
    });
    this.links=this.tiles.map(t=>HEX_DIRECTIONS.map((_,direction)=>this.neighbor(t.id,direction)).filter(i=>i>=0));
    this.coastlines=this.tiles.filter(t=>!t.sea).flatMap(t=>HEX_DIRECTIONS.flatMap((_,direction)=>{
      const n=this.neighbor(t.id,direction);
      return n>=0&&this.tiles[n].sea?[{tile:t.id,neighbor:n,direction}]:[];
    }));
    this.railRoutes=geography.railRoutes.map(route=>{
      const points=route.points.map(p=>({...p})),path=[points[0].tile],segments=[];
      for(let i=1;i<points.length;i++){
        const a=points[i-1].tile,b=points[i].tile;
        // Preserve every CSV sequence anchor. Some source pairs skip an odd-r neighbor.
        // Fill only their shortest land connection and record it explicitly.
        const connection=this.route(a,b,k=>!this.tiles[k].sea||k===b,()=>1,3);
        if(!connection)throw Error(`철도 경로가 끊어졌습니다: ${route.route_id} ${points[i].sequence}`);
        segments.push({fromSequence:points[i-1].sequence,toSequence:points[i].sequence,path:connection.path});
        path.push(...connection.path.slice(1));
        for(let j=1;j<connection.path.length;j++){
          const from=connection.path[j-1],to=connection.path[j];
          for(const [x,y] of [[from,to],[to,from]]){
            const t=this.tiles[x],direction=HEX_DIRECTIONS.findIndex((_,d)=>this.neighbor(x,d)===y);
            if(!t.railEdges.includes(direction))t.railEdges.push(direction);
            t.rail=true;t.railBridge=t.sea;
          }
        }
      }
      return {...route,points,path,segments};
    });
    for(const site of geography.sites){
      const t=this.tiles[site.tile];
      if(!t||site.kind!=='rail'&&t.sea)throw Error(`시설 위치 오류: ${site.name}`);
      if(site.kind==='port'&&!this.links[t.id].some(k=>this.tiles[k].sea))throw Error(`항만 해안 오류: ${site.name}`);
      if(site.kind==='rail'&&!t.rail)throw Error(`철도망에서 분리된 역: ${site.name}`);
      if(site.kind==='city')t.urban='high';
    }
  }
  project(lon,lat){
    const ref=this.geography.georeference,row=ref.lat[0]*lat+ref.lat[1],x=ref.lon[0]*lon+ref.lon[1];
    return {x:this.dx/2+x*this.dx,y:this.layout.radius+row*this.dy};
  }
  id(q,r){return !Number.isInteger(q)||!Number.isInteger(r)||q<0||r<0||q>=this.cols||r>=this.rows?-1:r*this.cols+q;}
  axialId(axial){const p=axialToOffset(axial);return this.id(p.q,p.r);}
  neighbor(id,direction){const a=this.tiles[id].axial,[q,r]=HEX_DIRECTIONS[direction];return this.axialId({q:a.q+q,r:a.r+r});}
  cube(id){const {q,r}=this.tiles[id].axial;return [q,-q-r,r];}
  distance(a,b){return hexDistance(this.tiles[a].axial,this.tiles[b].axial);}
  closest(x,y){if(!Number.isFinite(x)||!Number.isFinite(y))return -1;return this.axialId(this.layout.fromWorld(x,y));}
  nearest(lon,lat,predicate=()=>true){const p=this.project(lon,lat);return this.nearestWorld(p,predicate);}
  nearestWorld(p,predicate=()=>true){let best=null,d=Infinity;for(const t of this.tiles){if(!predicate(t))continue;const dd=(t.x-p.x)**2+(t.y-p.y)**2;if(dd<d){d=dd;best=t;}}return best;}
  within(id,radius){
    const a=this.tiles[id].axial,out=[];
    for(let dq=-radius;dq<=radius;dq++)for(let dr=Math.max(-radius,-dq-radius);dr<=Math.min(radius,-dq+radius);dr++){
      const k=this.axialId({q:a.q+dq,r:a.r+dr});if(k>=0)out.push(k);
    }return out;
  }
  railLinked(from,to){return this.tiles[from].railEdges.some(d=>this.neighbor(from,d)===to);}
  route(start,end,allowed,cost=()=>1,limit=Infinity){
    if(!this.tiles[start]||!this.tiles[end])return null;
    const heap=new Heap(),dist=new Map([[start,0]]),prev=new Map();heap.push(start,0);
    while(heap.length){const [id,d]=heap.pop();if(d!==dist.get(id))continue;if(id===end){const path=[id];while(path[0]!==start)path.unshift(prev.get(path[0]));return {path,cost:d};}
      for(const n of this.links[id]){if(!allowed(n,id))continue;const nd=d+cost(n,id);if(nd>limit||nd>=(dist.get(n)??Infinity))continue;dist.set(n,nd);prev.set(n,id);heap.push(n,nd);}
    }return null;
  }
}

export class Game {
  constructor(seed=2026,scenario=ARMY_SCENARIO,board=new Board()){this.board=board;this.seed=seed>>>0;this.state=null;this.supplyCache={};this.newGame(seed,scenario);}
  random(){let x=this.state.rng;x^=x<<13;x^=x>>>17;x^=x<<5;this.state.rng=x>>>0;return this.state.rng/4294967296;}
  log(text,kind='info'){this.state.log.unshift({turn:this.state.turn,text,kind});this.state.log.length=Math.min(90,this.state.log.length);}
  unit(id){return this.state.units.find(u=>u.id===id);}
  formation(unit){return unit?.formationId?armyFormation(unit.formationId):null;}
  spec(unit){return armyUnitSpec(TYPES[unit.type],this.formation(unit));}
  isDivision(u){return u&&['army','armor'].includes(u.type)&&(!this.formation(u)||this.formation(u).unit_level==='사단');}
  // tile is the HQ position; hp is the total command strength, not HQ strength.
  commandStatus(u){return {hqTile:u.tile,sector:u.sector??null,parentCommandId:this.formation(u)?.parent_unit??null,canReallocate:!!this.active(u),...sectorStrength(u,null,0)};}
  responsible(tile,side){return sectorOwner(this.state.units,tile,side);}
  sectorTileAvailable(u,tile){
    const t=this.board.tiles[tile];
    return !!t&&!t.sea&&!t.foreign&&this.owned(tile,u.side)&&!this.at(tile).some(v=>v.side!==u.side)&&!this.alive(u.side).some(v=>v.id!==u.id&&v.sector?.allocations.some(a=>a.tile===tile));
  }
  setSector(id,allocations,reserveShare){
    const u=this.unit(id);if(!this.active(u)||!this.isDivision(u))return {ok:false,message:'활성 사단을 선택하세요.'};
    const sector={version:1,commandId:u.id,commandLevel:'division',allocations,reserveShare,engaged:0};
    try{validateSector(sector,this.board);}catch(e){return {ok:false,message:e.message};}
    if(allocations.some(a=>!this.sectorTileAvailable(u,a.tile)))return {ok:false,message:'아군 육지에만 지정할 수 있으며 다른 사단과 중복할 수 없습니다.'};
    u.sector={...sector,allocations:allocations.map(a=>({...a}))};return {ok:true,message:'전투지경선과 예비 전력을 배분했습니다.'};
  }
  defenseAt(u,tile){return this.responsible(tile,u.side==='blue'?'red':'blue')??this.at(tile).find(v=>v.side!==u.side)??null;}
  canAttackTile(u,tile){const v=u&&this.defenseAt(u,tile);return !!v&&this.canAttack(u,v,tile);}
  attackTile(id,tile,ai=false){const u=this.unit(id);if(!u)return {ok:false,message:'부대가 없습니다.'};const v=this.defenseAt(u,tile);return v?this.attack(id,v.id,ai,tile):{ok:false,message:'담당 방어 부대가 없습니다.'};}
  reconRadius(unit){const f=this.formation(unit);return f?4+Math.floor(f.reconnaissance/25):unit.type==='air'?12:unit.type==='navy'?7:6;}
  alive(side){return this.state.units.filter(u=>u.hp>0&&(!side||u.side===side));}
  at(id){return this.alive().filter(u=>u.tile===id&&!u.embarked);}
  owned(t,side){return this.state.control[t]===SIDE[side]||(this.board.tiles[t]?.railBridge&&this.board.tiles[t].railEdges.some(d=>{const n=this.board.neighbor(t,d);return this.state.control[n]===SIDE[side];}));}
  pick(side,fx,fy,used=new Set(),predicate=()=>true){
    const candidates=this.board.tiles.filter(t=>t.home===SIDE[side]&&predicate(t));
    const xs=candidates.map(t=>t.x),ys=candidates.map(t=>t.y);
    const x=Math.min(...xs)+(Math.max(...xs)-Math.min(...xs))*fx;
    const y=Math.min(...ys)+(Math.max(...ys)-Math.min(...ys))*fy;
    return candidates.filter(t=>!used.has(t.id)).sort((a,b)=>(a.x-x)**2+(a.y-y)**2-((b.x-x)**2+(b.y-y)**2))[0];
  }
  newGame(seed=2026,scenario=ARMY_SCENARIO){
    if(!['legacy',ARMY_SCENARIO].includes(scenario))throw Error('지원하지 않는 시나리오입니다.');
    this.state={version:VERSION,mapId:this.board.geography.id,seed:seed>>>0,rng:(seed>>>0)||2026,turn:1,phase:'player',control:this.board.tiles.map(t=>t.home),
      units:[],sites:[],objectives:[],log:[],cp:9,materials:80,reserve:150,civilians:100,cohesion:100,escalation:18,
      losses:{blue:0,red:0},weather:'맑음',posture:'balanced',policyUsed:[],airCover:0,recon:0,navalCover:0,cyberShield:0,
      lastReport:null,result:null};
    for(const site of this.board.geography.sites){
      const home=this.board.tiles[site.tile].home;
      this.state.sites.push({...site,home:home===2?'red':'blue',health:100,shelter:0});
    }
    const used=new Set(this.state.sites.map(s=>s.tile));
    for(const side of ['blue','red']){
      for(let cluster=0;cluster<3;cluster++){
        let j=0;for(const kind of Object.keys(SITE_TYPES).filter(k=>!['city','port','rail'].includes(k))){
          const fy=.22+cluster*.29+(j%3)*.055,fx=.25+(j%3)*.24;
          const coast=t=>this.board.links[t.id].some(i=>this.board.tiles[i].sea);
          const t=this.pick(side,fx,fy,used,kind==='port'?coast:()=>true);
          used.add(t.id);
          this.state.sites.push({id:`${side}-${kind}-${cluster+1}`,tile:t.id,kind,home:side,health:100,
            name:`${side==='blue'?'청':'홍'}${cluster+1} ${SITE_TYPES[kind].name} 거점`,shelter:0});j++;
        }
      }
      const front=this.board.tiles.filter(t=>t.home===SIDE[side]&&this.board.links[t.id].some(i=>this.board.tiles[i].home===SIDE[side==='blue'?'red':'blue']));
      front.sort((a,b)=>a.q-b.q);
      const deployed=new Set();
      const count=side==='blue'?7:8;
      for(let i=0;i<count;i++){
        const anchor=front[Math.min(front.length-1,Math.floor(i/count*front.length))];
        const candidates=this.board.within(anchor.id,side==='blue'?3:5).map(k=>this.board.tiles[k])
          .filter(t=>t.home===SIDE[side]&&!deployed.has(t.id)).sort((a,b)=>this.board.distance(a.id,anchor.id)-this.board.distance(b.id,anchor.id));
        const t=candidates[Math.min(i%3,candidates.length-1)];deployed.add(t.id);
        this.addUnit(side,i%3===0?'armor':'army',t.id,i+1);
      }
      const northBack=side==='red'?[.2,.5]:[];
      northBack.forEach((fy,i)=>{const t=this.pick(side,.6,fy,deployed);deployed.add(t.id);this.addUnit(side,'army',t.id,9+i);});
      for(let i=0;i<(side==='blue'?3:2);i++){
        const site=this.state.sites.find(s=>s.home===side&&s.kind==='airport'&&s.id.endsWith(`-${i+1}`));
        this.addUnit(side,'air',site.tile,i+1);
      }
      for(let i=0;i<2;i++){
        const p=this.state.sites.filter(s=>s.home===side&&s.kind==='port')[i];
        const sea=this.board.links[p.tile].filter(t=>this.board.tiles[t].sea);
        this.addUnit(side,'navy',sea[0],i+1);
        if(side==='blue')this.addUnit(side,'transport',sea[sea.length-1],i+1);
        const t=this.pick(side,.3+i*.4,side==='blue'?.4:.65,deployed);deployed.add(t.id);
        this.addUnit(side,'airdefense',t.id,i+1);
        if(side==='blue'){
          const supply=this.pick(side,.3+i*.35,.38,deployed);deployed.add(supply.id);this.addUnit(side,'supply',supply.id,i+1);
        }
      }
    }
    for(const [i,fy] of [.76,.46,.12].entries()){
      const t=this.pick('red',.5,fy);
      this.state.objectives.push({id:`sector-${i+1}`,tile:t.id,name:['남부 통제 구역','중부 통제 구역','북부 통제 구역'][i],held:0});
    }
    if(scenario===ARMY_SCENARIO){
      this.state.scenario=ARMY_SCENARIO;this.state.datasetVersion=ARMY_DATA.dataset_version;
      // Replace only the fictional blue combat formations; all legacy support systems remain.
      this.state.units=this.state.units.filter(u=>u.side!=='blue'||!['army','armor','airdefense'].includes(u.type));
      const occupied=new Set(this.state.units.map(u=>u.tile));
      for(const formation of ARMY_DATA.units.filter(f=>f.deployable)){
        const tile=armyTile(this.board,formation,occupied);occupied.add(tile);
        this.addUnit('blue',formation.game_type,tile,formation.id);
        const unit=this.state.units.at(-1);
        unit.id=`blue-rok-${formation.id}`;unit.name=formation.unit_name;unit.formationId=formation.id;unit.ap=this.spec(unit).mp;
      }
    }
    // Disperse any remaining support/naval overlaps deterministically on the proper domain.
    const occupied=new Set();
    for(const u of this.state.units.slice().sort((a,b)=>Number(b.type==='transport')-Number(a.type==='transport'))){
      if(occupied.has(u.tile)){
        const origin=this.board.tiles[u.tile],sea=TYPES[u.type].domain==='sea';
        const t=this.board.nearestWorld(origin,t=>!occupied.has(t.id)&&(sea?t.sea:t.home===SIDE[u.side]));
        if(!t)throw Error('부대를 배치할 빈 타일이 없습니다.');u.tile=t.id;
      }
      occupied.add(u.tile);
    }
    this.rebuildRoads();this.refreshSupply();
    this.log('가상 시나리오 시작. 구역 3곳을 2턴 유지하고 민간 보호와 기반시설을 보존하세요.');
    if(scenario===ARMY_SCENARIO)this.log('공개 육군 편제 · 시군 대표 권역과 게임 상대 점수 사용. 지원전력·적군·시설·작전은 가상입니다.');
  }
  addUnit(side,type,tile,index){
    const name=`${side==='blue'?'청':'홍'}-${String(index).padStart(2,'0')} ${TYPES[type].name}`;
    this.state.units.push({id:`${side}-${type}-${index}`,side,type,tile,name,hp:100,supply:100,ap:TYPES[type].mp,
      entrenched:false,acted:false,mission:null,cargo:['supply','transport'].includes(type)?60:0,embarked:null,passenger:null});
  }
  rebuildRoads(){
    for(const t of this.board.tiles){t.road=false;t.roadSite=null;t.roadEdges=[];}
    for(const side of ['blue','red']){
      const sites=this.state.sites.filter(s=>s.home===side&&!this.board.tiles[s.tile].sea),roads=sites.filter(s=>s.kind==='road');
      for(const s of sites){
        const near=roads.slice().sort((a,b)=>this.board.distance(s.tile,a.tile)-this.board.distance(s.tile,b.tile))[0];
        const path=this.board.route(s.tile,near.tile,k=>this.board.tiles[k].home===SIDE[side]);
        for(const k of path?.path??[s.tile]){const t=this.board.tiles[k];t.road=true;t.roadSite=near.id;}
      }
      for(let i=1;i<roads.length;i++){
        const route=this.board.route(roads[i-1].tile,roads[i].tile,k=>this.board.tiles[k].home===SIDE[side]);
        for(const k of route?.path??[]){this.board.tiles[k].road=true;this.board.tiles[k].roadSite=roads[i].id;}
      }
    }
  }
  integrity(side='blue',kind=null){return mean(this.state.sites.filter(s=>s.home===side&&(!kind||s.kind===kind)).map(s=>s.health));}
  service(side,kind){return mean(this.state.sites.filter(s=>this.owned(s.tile,side)&&s.kind===kind).map(s=>s.health))/100;}
  roadQuality(id){const t=this.board.tiles[id];return t.road?(this.state.sites.find(s=>s.id===t.roadSite)?.health??100)/100:0;}
  moveCost(unit,id,from=null){
    const t=this.board.tiles[id];if(t.sea&&!t.railBridge||TYPES[unit.type].domain==='sea')return this.state.weather==='폭풍'?1.7:1;
    const terrain=t.terrain==='mountain'?1.9:1;
    const road=t.road?1.8-1.15*this.roadQuality(id):1;
    const fuel=.7+.3*this.service(unit.side,'energy');
    const supply=unit.supply<30?1.5:unit.supply<60?1.15:1;
    const transport=from!==null&&this.board.railLinked(from,id)?Math.min(road,.55):road;
    return terrain*transport*supply/fuel*(this.state.weather==='강우'?1.18:1);
  }
  canEnter(unit,id,from=unit.tile){
    const t=this.board.tiles[id];if(!t||t.foreign)return false;
    const domain=TYPES[unit.type].domain;
    if(domain==='air')return false;
    if((domain==='sea')!==t.sea&&!(domain==='land'&&t.railBridge&&this.board.railLinked(from,id)))return false;
    if(domain==='land'&&this.board.tiles[from]?.railBridge&&!this.board.railLinked(from,id))return false;
    if(this.at(id).some(u=>u.side!==unit.side)||this.responsible(id,unit.side==='blue'?'red':'blue'))return false;
    if(['supply','airdefense'].includes(unit.type)&&!this.owned(id,unit.side))return false;
    return true;
  }
  route(unit,target){return this.board.route(unit.tile,target,(id,from)=>this.canEnter(unit,id,from),(id,from)=>this.moveCost(unit,id,from));}
  reachable(unit){
    const dist=new Map([[unit.tile,0]]),heap=new Heap();heap.push(unit.tile,0);
    if(unit.embarked||unit.type==='air')return dist;
    while(heap.length){const [id,d]=heap.pop();if(d!==dist.get(id))continue;for(const n of this.board.links[id]){
      if(!this.canEnter(unit,n,id))continue;const nd=d+this.moveCost(unit,n,id);if(nd>unit.ap+.0001||nd>=(dist.get(n)??Infinity))continue;
      dist.set(n,nd);heap.push(n,nd);
    }}return dist;
  }
  capture(unit,tile){
    if(!['army','armor'].includes(unit.type)||unit.sector)return;
    for(const id of this.board.within(tile,1)){
      const t=this.board.tiles[id];if(t.sea||t.foreign||this.at(id).some(u=>u.side!==unit.side)||this.responsible(id,unit.side==='blue'?'red':'blue'))continue;
      this.state.control[id]=SIDE[unit.side];
    }
  }
  move(id,target){
    const u=this.unit(id);if(!this.active(u))return {ok:false,message:'현재 이동할 수 없는 부대입니다.'};
    if(target===u.tile)return {ok:false,message:'현재 위치입니다.'};
    if(!this.canEnter(u,target)&&!this.board.tiles[target]?.railBridge)return {ok:false,message:'해당 지형 또는 외국 영토로 이동할 수 없습니다.'};
    const route=this.route(u,target);if(!route)return {ok:false,message:'이동 경로가 없습니다.'};
    let spent=0,count=0;
    for(const k of route.path.slice(1)){const c=this.moveCost(u,k,u.tile);if(spent+c>u.ap+.0001)break;spent+=c;u.tile=k;count++;this.capture(u,k);}
    if(!count)return {ok:false,message:'이번 턴의 이동력이 부족합니다.'};
    u.ap=Math.max(0,u.ap-spent);u.entrenched=false;
    if(u.passenger)this.unit(u.passenger).tile=u.tile;
    this.refreshSupply();this.checkResult();
    return {ok:true,message:`${u.name} · ${count}헥스 이동${u.tile===target?' 완료':' · 남은 경로는 다음 턴에 이동'}`};
  }
  active(u){return u&&u.hp>0&&!u.embarked&&this.state.phase==='player'&&!this.state.result&&u.side==='blue';}
  supplyField(side){
    const dist=new Float32Array(this.board.tiles.length).fill(Infinity),parent=new Int32Array(dist.length).fill(-1),heap=new Heap();
    const logistics=.25+.75*Math.min(this.service(side,'power'),this.service(side,'energy'),.4+.6*this.service(side,'rail'));
    for(const s of this.state.sites){
      if(!['city','port','rail'].includes(s.kind)||s.health<20||!this.owned(s.tile,side))continue;
      const cost=(100-s.health)*.17;dist[s.tile]=cost;heap.push(s.tile,cost);
    }
    for(const u of this.alive(side).filter(u=>u.type==='supply'&&u.cargo>0&&!u.embarked)){
      if(dist[u.tile]>12){dist[u.tile]=12;heap.push(u.tile,12);}
    }
    while(heap.length){const [id,d]=heap.pop();if(d>dist[id]+.001||d>38)continue;
      for(const n of this.board.links[id]){const t=this.board.tiles[n];if((t.sea&&!(t.railBridge&&this.board.railLinked(id,n)))||t.foreign||!this.owned(n,side))continue;
        if(this.at(n).some(u=>u.side!==side))continue;
        const transport=this.board.railLinked(id,n)?.45:t.road?2.2-1.5*this.roadQuality(n):1.35;
        const cost=(t.terrain==='mountain'?1.6:1)*transport/logistics;
        const nd=d+cost;if(nd>38||nd>=dist[n])continue;dist[n]=nd;parent[n]=id;heap.push(n,nd);
      }
    }
    return {dist,parent,logistics};
  }
  refreshSupply(){this.supplyCache={blue:this.supplyField('blue'),red:this.supplyField('red')};}
  supplyQuality(u){
    if(u.embarked)return this.unit(u.embarked)?.supply/100||0;
    if(TYPES[u.type].domain==='sea'){
      const ports=this.state.sites.filter(s=>s.kind==='port'&&s.health>=20&&this.owned(s.tile,u.side));
      const distance=Math.min(...ports.map(s=>this.board.distance(u.tile,s.tile)));
      const hostile=this.alive(u.side==='blue'?'red':'blue').filter(v=>v.type==='navy'&&this.board.distance(v.tile,u.tile)<=5).length;
      return clamp(100-distance*2-hostile*25)/100;
    }
    if(u.type==='air'){
      const site=this.state.sites.find(s=>s.kind==='airport'&&s.tile===u.tile&&this.owned(s.tile,u.side));
      return site?site.health/100:0;
    }
    const d=this.supplyCache[u.side]?.dist[u.tile]??Infinity;
    return Math.max(0,1-d/40);
  }
  supplyPath(u){const parent=this.supplyCache[u.side]?.parent;if(!parent)return[];const out=[u.tile];let i=u.tile;for(let k=0;k<100&&parent[i]>=0;k++){i=parent[i];out.push(i);}return out;}
  visible(u){if(u.side==='blue')return true;return this.state.recon>0||this.alive('blue').some(a=>this.board.distance(a.tile,u.tile)<=this.reconRadius(a)||(!a.embarked&&a.sector?.allocations.some(b=>b.share>0&&b.tile===u.tile)));}
  attackBlockReason(u,v,tile=v?.tile){
    if(!Number.isInteger(tile)||!this.board.tiles[tile])return '공격 대상 없음';
    if(!u||!v||u.hp<=0||v.hp<=0||u.side===v.side||u.embarked||v.embarked)return '공격 불가능 상태';
    if(u.acted)return '이번 턴 공격 완료';
    const spec=this.spec(u);if(!spec.attack)return '공격 불가능 병과';
    if(u.ap<(u.type==='air'?1:3))return '이동력 부족';
    if(u.side==='blue'&&!this.visible({...v,tile}))return '탐지 범위 밖';
    if(u.sector&&!u.sector.allocations.some(a=>a.tile===tile&&a.share>0))return '전투지경선 밖';
    if(u.type==='air'&&this.supplyQuality(u)<.25)return '출격 공항 가동률 부족';
    const ud=spec.domain,vd=TYPES[v.type].domain;
    if(ud==='land'&&vd!=='land')return '해당 영역 공격 불가';
    if(ud==='sea'&&vd==='land'&&!this.board.links[tile].some(k=>this.board.tiles[k].sea))return '해안 지원 사격 불가';
    if(ud==='sea'&&vd==='air')return '공중 목표 공격 불가';
    return !u.sector&&this.board.distance(u.tile,tile)>spec.range?'사거리 밖':'';
  }
  canAttack(u,v,tile=v?.tile){return !this.attackBlockReason(u,v,tile);}
  combatPreview(u,v,tile=v.tile){
    v=this.responsible(tile,v.side)??v;
    const attackPower=sectorStrength(u,tile),defensePower=sectorStrength(v,tile);
    const posture=u.side==='blue'?this.state.posture:'balanced';
    const factors={careful:.82,balanced:1,push:1.2};
    const cover=this.alive(u.side).some(a=>a.type==='air'&&a.mission==='support')?1.2:1;
    const a=this.spec(u).attack*(attackPower.committed/100)*(.35+.65*u.supply/100)*factors[posture]*cover;
    const terrain=this.board.tiles[tile].terrain==='mountain'?1.28:1;
    const d=this.spec(v).defense*(v.sector?defensePower.committed/100:(.3+.7*v.hp/100))*(.45+.55*v.supply/100)*terrain*(v.entrenched?1.3:1);
    const ratio=a/Math.max(1,d);
    const low=this.combatDamage(u,v,tile,ratio,1),high=this.combatDamage(u,v,tile,ratio,6);
    return {ratio,band:ratio<.67?'불리':ratio<1.25?'접전':ratio<2?'우세':'크게 우세',posture,terrain,cover,entrenchment:v.entrenched?1.3:1,
      outgoing:[low.outgoing,high.outgoing],incoming:[high.taken,low.taken]};
  }
  // Shared results table: preview never rolls RNG; execution passes its actual die.
  combatDamage(u,v,tile,ratio,die){
    const column=ratio<.5?0:ratio<.8?1:ratio<1.2?2:ratio<1.8?3:ratio<2.8?4:5;
    const rolledDamage=[10,17,24,32,41,50][column]+die*2;
    const outgoing=v.sector?Math.min(v.hp,sectorStrength(v,tile).committed,rolledDamage):rolledDamage;
    const incoming=[28,22,16,12,9,6][column]+(7-die);
    const remote=(['air','navy'].includes(u.type)||(u.type==='artillery'&&this.board.distance(u.tile,tile)>1))&&TYPES[v.type].domain==='land';
    const aa=this.alive(v.side).filter(a=>a.type==='airdefense'&&this.board.distance(a.tile,tile)<=9).length;
    const counterDamage=u.type==='air'?7+aa*7:remote?3:incoming;
    const taken=u.sector?Math.min(u.hp,sectorStrength(u,tile).committed,counterDamage):counterDamage;
    return {outgoing,taken};
  }
  attack(id,target,ai=false,tile=null){
    const u=this.unit(id);let v=this.unit(target);
    if(!u||!v||u.side===v.side)return {ok:false,message:'공격 대상이 없습니다.'};
    tile=tile??v.tile;v=this.responsible(tile,v.side)??v;
    if(tile!==v.tile&&!v.sector?.allocations.some(a=>a.tile===tile))return {ok:false,message:'담당 지경선이 아닙니다.'};
    if(!ai&&!this.active(u))return {ok:false,message:'공격할 수 없는 부대입니다.'};
    if(!this.canAttack(u,v,tile))return {ok:false,message:'사거리 · 행동력 · 출격 상태를 확인하세요.'};
    const {ratio,posture}=this.combatPreview(u,v,tile);
    const die=1+Math.floor(this.random()*6);
    // Abstract combat results table: damage is cohesion loss, never personnel.
    const {outgoing,taken}=this.combatDamage(u,v,tile,ratio,die);
    for(const command of [u,v])if(command.sector)command.sector.engaged=sectorStrength(command,tile).committed;
    const sectorBattle=!!v.sector;
    applySectorLoss(v,tile,outgoing);applySectorLoss(u,tile,taken);
    u.ap=Math.max(0,u.ap-(u.type==='air'?1:4));u.acted=true;u.entrenched=false;u.supply=clamp(u.supply-15);v.supply=clamp(v.supply-8);
    this.state.losses[u.side]+=taken;this.state.losses[v.side]+=outgoing;
    const harm=posture==='careful'?.15:posture==='push'?1.1:.5;
    this.state.civilians=clamp(this.state.civilians-harm);this.state.escalation=clamp(this.state.escalation+(posture==='push'?3:.6));
    const site=this.state.sites.find(s=>s.tile===tile);
    if(site)site.health=clamp(site.health-(posture==='careful'?2:posture==='push'?12:6));
    if(v.hp<12&&!v.sector){v.hp=0;this.destroyTransport(v);this.log(`${v.name} 전투 이탈.`,v.side==='red'?'good':'danger');}
    if(u.hp<12&&!u.sector){u.hp=0;this.destroyTransport(u);}
    for(const command of [u,v])if(command.sector)command.sector.engaged=0;
    if((v.hp===0||(sectorBattle&&!this.responsible(tile,v.side)&&tile!==v.tile))&&!u.sector&&['army','armor'].includes(u.type)&&u.hp>0&&this.canEnter(u,tile)){u.tile=tile;this.capture(u,u.tile);}
    this.log(`${u.name} → ${v.name} (헥스 ${tile}) · 전력 -${outgoing} / 반격 -${taken} · 주사위 ${die}`,u.side==='blue'?'combat':'danger');
    this.refreshSupply();if(!ai)this.checkResult();
    return {ok:true,message:`전투 결과 · 적 전력 -${outgoing}, 아군 -${taken}`};
  }
  destroyTransport(u){if(u.passenger){const p=this.unit(u.passenger);p.hp=0;p.embarked=null;u.passenger=null;}}
  fortify(id){const u=this.unit(id);if(!this.active(u)||u.ap<1||u.type==='air')return {ok:false,message:'현재 방어 태세를 설정할 수 없습니다.'};u.entrenched=true;u.ap=0;return {ok:true,message:'방어 태세 · 방어력 30% 증가'};}
  airMission(id,mission){
    const u=this.unit(id);if(!this.active(u)||u.type!=='air'||u.ap<1||u.acted)return {ok:false,message:'출격 가능한 비행단을 선택하세요.'};
    if(!['patrol','recon','support'].includes(mission))return {ok:false,message:'알 수 없는 임무입니다.'};
    const q=this.supplyQuality(u);if(q<.25||u.supply<20)return {ok:false,message:'공항 복구와 보급이 필요합니다.'};
    u.ap=0;u.acted=true;u.mission=mission;u.supply=clamp(u.supply-12);
    if(mission==='patrol')this.state.airCover+=.18*q;
    if(mission==='recon')this.state.recon=1;
    const names={patrol:'공중 방어',recon:'광역 정찰',support:'지상 지원'};
    this.log(`${u.name} · ${names[mission]} 임무.`, 'good');return {ok:true,message:`${names[mission]} 임무 실행`};
  }
  repair(siteId){
    const s=this.state.sites.find(s=>s.id===siteId);if(this.state.result)return {ok:false,message:'시나리오가 종료되었습니다.'};
    if(!s||!this.owned(s.tile,'blue'))return {ok:false,message:'통제 중인 시설만 복구할 수 있습니다.'};
    if(s.health>=100)return {ok:false,message:'이미 완전히 가동 중입니다.'};
    if(this.state.cp<2||this.state.materials<12)return {ok:false,message:'지휘점 2 · 복구 자재 12가 필요합니다.'};
    this.state.cp-=2;this.state.materials-=12;s.health=clamp(s.health+28);this.refreshSupply();
    this.log(`${s.name} 복구 · 가동률 ${Math.round(s.health)}%`, 'good');return {ok:true,message:'가동률 +28%p'};
  }
  policy(name){
    const s=this.state;if(s.result||s.phase!=='player')return {ok:false,message:'현재 실행할 수 없습니다.'};
    if(s.policyUsed.includes(name))return {ok:false,message:'이번 턴에 이미 실행했습니다.'};
    const costs={shelter:3,diplomacy:3,cyber:2,supply:2};const cost=costs[name];
    if(!cost||s.cp<cost)return {ok:false,message:'지휘점이 부족합니다.'};
    if(name==='supply'&&s.reserve<25)return {ok:false,message:'예비 보급물자가 부족합니다.'};
    s.cp-=cost;s.policyUsed.push(name);
    if(name==='shelter'){s.civilians=clamp(s.civilians+2);for(const site of s.sites.filter(x=>this.owned(x.tile,'blue')))site.shelter=1;}
    if(name==='diplomacy')s.escalation=clamp(s.escalation-18);
    if(name==='cyber')s.cyberShield=1;
    if(name==='supply'){s.reserve-=25;for(const u of this.alive('blue'))if(this.supplyQuality(u)>.2)u.supply=clamp(u.supply+24);}
    const names={shelter:'민간 보호 체계 가동',diplomacy:'위기 완화 채널 가동',cyber:'통신 방어 강화',supply:'예비 보급물자 배분'};
    this.log(names[name], 'good');return {ok:true,message:names[name]};
  }
  load(id){
    const u=this.unit(id);if(!this.active(u)||u.type!=='transport'||u.ap<2||u.passenger)return {ok:false,message:'빈 수송선단을 선택하세요.'};
    const p=this.alive('blue').find(v=>['army','armor','supply'].includes(v.type)&&!v.embarked&&v.ap>=1&&this.board.distance(u.tile,v.tile)===1&&this.state.sites.some(s=>s.kind==='port'&&s.tile===v.tile&&s.health>=25&&this.owned(s.tile,'blue')));
    if(!p)return {ok:false,message:'가동률 25% 이상인 인접 아군 항만에 지상부대를 배치하세요.'};
    u.passenger=p.id;p.embarked=u.id;p.tile=u.tile;p.ap=0;u.ap-=2;this.refreshSupply();return {ok:true,message:`${p.name} 승선 완료`};
  }
  unload(id,target){
    const u=this.unit(id),t=this.board.tiles[target];if(!this.active(u)||u.type!=='transport'||u.ap<2||!u.passenger)return {ok:false,message:'승선 부대가 없거나 이동력이 부족합니다.'};
    if(!t||t.sea||t.foreign||!this.owned(target,'blue')||this.board.distance(u.tile,target)!==1)return {ok:false,message:'인접한 아군 해안에만 하선할 수 있습니다.'};
    const p=this.unit(u.passenger);p.tile=target;p.embarked=null;p.ap=0;u.passenger=null;u.ap-=2;this.refreshSupply();return {ok:true,message:`${p.name} 하선 완료`};
  }
  deliver(id){
    const u=this.unit(id);if(!this.active(u)||!['transport','supply'].includes(u.type)||u.ap<1||u.cargo<10)return {ok:false,message:'보급물자 10 이상을 실은 수송 부대를 선택하세요.'};
    const targets=this.alive('blue').filter(v=>v.id!==u.id&&this.board.distance(u.tile,v.tile)<=3&&v.supply<100);
    if(!targets.length)return {ok:false,message:'3헥스 이내에 보급이 필요한 부대가 없습니다.'};
    let given=0;for(const v of targets){const n=Math.min(25,100-v.supply,u.cargo);v.supply+=n;u.cargo-=n;given+=n;if(u.cargo<=0)break;}
    u.ap=0;this.refreshSupply();return {ok:true,message:`보급물자 ${Math.round(given)} 전달`};
  }
  aiTurn(){
    const blue=this.alive('blue');
    const red=this.alive('red');
    if(!blue.length||!red.length)return;

    // 1. Air defense units entrench and engage adjacent enemies if threatened
    for(const u of red.filter(x=>x.type==='airdefense')){
      const targets=blue.filter(v=>this.canAttack(u,v)).sort((a,b)=>a.hp-b.hp);
      if(targets.length&&targets[0].hp<30)this.attack(u.id,targets[0].id,true);
      else u.entrenched=true;
    }

    // 2. Air units: strike high-value or vulnerable targets within range
    for(const u of red.filter(x=>x.type==='air')){
      if(u.ap<1||u.acted)continue;
      const targets=blue.filter(v=>this.canAttack(u,v));
      if(targets.length){
        targets.sort((a,b)=>{
          const scoreA=(this.state.objectives.some(o=>o.tile===a.tile)?500:0)+(a.hp<=25?200:0)+(a.type==='artillery'?150:0)-a.hp;
          const scoreB=(this.state.objectives.some(o=>o.tile===b.tile)?500:0)+(b.hp<=25?200:0)+(b.type==='artillery'?150:0)-b.hp;
          return scoreB-scoreA;
        });
        this.attack(u.id,targets[0].id,true);
      }
    }

    // 3. Strategic Objective assignment for ground forces
    const groundRed=red.filter(u=>['army','armor'].includes(u.type));
    const garrisons=new Map();
    const assignedUnits=new Set();

    const sortedObjectives=[...this.state.objectives].sort((a,b)=>{
      const aThreat=(a.held>0?100:0)+blue.filter(v=>this.board.distance(v.tile,a.tile)<=8).length*10;
      const bThreat=(b.held>0?100:0)+blue.filter(v=>this.board.distance(v.tile,b.tile)<=8).length*10;
      return bThreat-aThreat;
    });

    for(const obj of sortedObjectives){
      const candidates=groundRed.filter(u=>!assignedUnits.has(u.id))
        .sort((a,b)=>this.board.distance(a.tile,obj.tile)-this.board.distance(b.tile,obj.tile));
      if(candidates.length){
        const chosen=candidates[0];
        if(this.board.distance(chosen.tile,obj.tile)<=18||obj.held>0||blue.some(v=>this.board.distance(v.tile,obj.tile)<=6)){
          garrisons.set(chosen.id,obj);
          assignedUnits.add(chosen.id);
        }
      }
    }

    const evalTarget=(u,v)=>{
      const preview=this.combatPreview(u,v);
      let s=preview.ratio*40;
      if(this.state.objectives.some(o=>o.tile===v.tile))s+=1000;
      else if(this.state.objectives.some(o=>this.board.distance(o.tile,v.tile)<=2))s+=200;
      if(v.type==='transport'&&v.passenger)s+=400;
      if(v.type==='artillery')s+=150;
      if(v.type==='supply')s+=100;
      if(v.hp<=25)s+=250;
      else s+=(100-v.hp);
      return s;
    };

    // 4. Execute ground & naval units
    for(const u of red.filter(x=>['army','armor','navy'].includes(x.type))){
      if(u.hp<=0)continue;
      // Preserve existing sector AI behavior for units with sectors
      if(u.sector&&!garrisons.has(u.id)){
        const sectorTarget=blue.flatMap(v=>v.sector?.allocations.map(a=>a.tile)??[]).find(tile=>this.canAttackTile(u,tile));
        if(sectorTarget!==undefined){this.attackTile(u.id,sectorTarget,true);continue;}
        const local=u.sector.allocations.find(a=>this.canAttackTile(u,a.tile));
        if(local){this.attackTile(u.id,local.tile,true);continue;}
        continue;
      }
      const domain=TYPES[u.type].domain;
      const isGarrison=garrisons.has(u.id);
      const targetObj=garrisons.get(u.id);

      let goalTile=null;
      if(isGarrison&&targetObj){
        const intruder=blue.find(v=>v.hp>0&&TYPES[v.type].domain==='land'&&this.board.distance(v.tile,targetObj.tile)<=2);
        goalTile=intruder?intruder.tile:targetObj.tile;
      }else{
        const enemies=blue.filter(v=>v.hp>0&&!v.embarked&&TYPES[v.type].domain===domain);
        if(!enemies.length)continue;
        enemies.sort((a,b)=>{
          const distA=this.board.distance(u.tile,a.tile);
          const distB=this.board.distance(u.tile,b.tile);
          const threatA=this.state.objectives.some(o=>this.board.distance(o.tile,a.tile)<=6)?-5:0;
          const threatB=this.state.objectives.some(o=>this.board.distance(o.tile,b.tile)<=6)?-5:0;
          return (distA+threatA)-(distB+threatB);
        });
        goalTile=enemies[0].tile;
      }

      if(goalTile===null)continue;
      const initialDist=this.board.distance(u.tile,goalTile);

      if(isGarrison&&initialDist<=1&&(!blue.some(v=>this.board.distance(v.tile,goalTile)<=2))){
        const localTargets=blue.filter(v=>this.canAttack(u,v));
        if(localTargets.length){
          localTargets.sort((a,b)=>evalTarget(u,b)-evalTarget(u,a));
          this.attack(u.id,localTargets[0].id,true);
        }else{
          u.entrenched=true;
        }
        continue;
      }

      let preTargets=blue.filter(v=>this.canAttack(u,v));
      if(preTargets.length){
        preTargets.sort((a,b)=>evalTarget(u,b)-evalTarget(u,a));
        const best=preTargets[0];
        const preview=this.combatPreview(u,best);
        if(preview.ratio>=0.85||this.state.objectives.some(o=>o.tile===best.tile)||best.hp<=25){
          this.attack(u.id,best.id,true);
          continue;
        }
      }

      if(initialDist>1||isGarrison){
        for(let step=0;step<3;step++){
          const options=this.board.links[u.tile].filter(k=>this.canEnter(u,k)&&this.moveCost(u,k,u.tile)<=u.ap);
          if(!options.length)break;
          options.sort((a,b)=>{
            const da=this.board.distance(a,goalTile);
            const db=this.board.distance(b,goalTile);
            if(da!==db)return da-db;
            const ta=this.board.tiles[a].terrain==='mountain'?-1:0;
            const tb=this.board.tiles[b].terrain==='mountain'?-1:0;
            return ta-tb;
          });
          const nextTile=options[0];
          if(nextTile===undefined||this.board.distance(nextTile,goalTile)>=this.board.distance(u.tile,goalTile))break;
          u.ap-=this.moveCost(u,nextTile,u.tile);
          u.tile=nextTile;
          this.capture(u,nextTile);
        }
      }

      const postTargets=blue.filter(v=>this.canAttack(u,v));
      if(postTargets.length){
        postTargets.sort((a,b)=>evalTarget(u,b)-evalTarget(u,a));
        const target=postTargets[0];
        const preview=this.combatPreview(u,target);
        if(preview.ratio>=0.65||this.state.objectives.some(o=>o.tile===target.tile)||target.hp<=25||u.hp>=50){
          this.attack(u.id,target.id,true);
        }else{
          u.entrenched=true;
        }
      }else{
        if(isGarrison||this.board.distance(u.tile,goalTile)<=3){
          u.entrenched=true;
        }
      }
    }
  }
  pressureEvent(){
    const s=this.state;const sites=s.sites.filter(x=>x.home==='blue'&&this.owned(x.tile,'blue')&&x.health>0);
    if(!sites.length)return;
    const activity=this.alive('red').filter(u=>['army','armor'].includes(u.type)).length/10;
    for(let i=0;i<(activity>.5?2:1);i++){
      const site=sites[Math.floor(this.random()*sites.length)];
      const aa=this.alive('blue').filter(u=>u.type==='airdefense'&&this.board.distance(u.tile,site.tile)<=9);
      const protection=clamp(s.airCover*100+aa.reduce((x,u)=>x+u.hp/100*u.supply/100*24,0),0,85)/100;
      if(this.random()<protection){this.log('방공망이 가상 원거리 공격을 차단했습니다.','good');continue;}
      const damage=Math.round((9+this.random()*11)*(.4+.6*activity));
      site.health=clamp(site.health-damage);s.civilians=clamp(s.civilians-(site.shelter?.35:1.3));
      this.log(`${i===0?'장거리 화력':'미사일'} 위기 이벤트 · ${site.name} 가동률 -${damage}%p`,'danger');
    }
    if(s.turn%3===0){
      if(s.cyberShield)this.log('통신 방어가 서비스 중단 이벤트를 막았습니다.','good');
      else{const comm=sites.find(x=>x.kind==='comms');if(comm){comm.health=clamp(comm.health-16);this.log('통신 장애 · 지휘 효율 감소.','danger');}}
    }
    // Nuclear threat is an abstract scenario crisis, with no weapon model,
    // target location, blast radius, yield or real casualty calculation.
    if(s.escalation>=85){
      s.civilians=clamp(s.civilians-14);s.cohesion=clamp(s.cohesion-12);
      for(const site of sites)site.health=clamp(site.health-10);
      s.escalation=60;this.log('전략 위기 발생 · 핵 위협의 추상적 재난 효과가 보호·기반시설 지수에 적용되었습니다.','danger');
    }
  }
  endTurn(){
    const s=this.state;if(s.phase!=='player'||s.result)return {ok:false,message:'턴을 진행할 수 없습니다.'};
    const before={civilians:s.civilians,integrity:this.integrity(),escalation:s.escalation};
    s.phase='resolution';this.aiTurn();this.pressureEvent();this.refreshSupply();
    for(const u of this.alive()){
      const quality=this.supplyQuality(u),logistics=this.formation(u)?.logistics??60;
      u.supply=clamp(u.supply+quality*(32+(logistics-60)/10)-18);
      if(u.supply<20){u.hp=clamp(u.hp-4);if(u.side==='blue')s.cohesion=clamp(s.cohesion-.3);}
      else if(u.entrenched&&u.supply>60)u.hp=clamp(u.hp+5);
      if(u.type==='supply')u.cargo=Math.max(0,u.cargo-5);
      if(['supply','transport'].includes(u.type)&&quality>.7){
        const n=Math.min(20,80-u.cargo,u.side==='blue'?s.reserve:20);u.cargo+=n;if(u.side==='blue')s.reserve-=n;
      }
      if(u.type==='air'&&!this.owned(u.tile,u.side)){u.hp=0;this.log(`${u.name} 기지 상실로 전투 이탈.`,'danger');}
      u.ap=this.spec(u).mp*(u.supply<30?.65:1);u.acted=false;u.mission=null;
    }
    for(const obj of s.objectives)obj.held=this.owned(obj.tile,'blue')?obj.held+1:0;
    s.turn++;s.weather=['맑음','맑음','강우','안개','폭풍'][Math.floor(this.random()*5)];
    s.cp=Math.floor(5+4*this.service('blue','comms'));
    s.materials=Math.min(140,s.materials+8);s.reserve=Math.min(240,s.reserve+Math.round(18*this.service('blue','power')));
    s.escalation=clamp(s.escalation+3);s.airCover=0;s.recon=0;s.cyberShield=0;s.policyUsed=[];
    for(const site of s.sites)site.shelter=0;
    s.phase='player';this.refreshSupply();this.checkResult();
    s.lastReport={turn:s.turn-1,civilians:s.civilians-before.civilians,integrity:this.integrity()-before.integrity,
      escalation:s.escalation-before.escalation,lowSupply:this.alive('blue').filter(u=>u.supply<40).length};
    this.log(`${s.turn}턴 시작 · ${s.weather} · 지휘점 ${s.cp}`);
    return {ok:true,message:`${s.turn}턴 · 명령을 내리세요.`};
  }
  checkResult(){
    const s=this.state;if(s.result)return s.result;
    const ground=this.alive('blue').filter(u=>['army','armor'].includes(u.type));
    if(s.civilians<40||this.integrity()<30||ground.length===0||s.turn>45){
      s.result={won:false,title:s.turn>45?'시나리오 시간 종료':'작전 지속 불가',detail:s.civilians<40?'민간 보호 지수가 임계치 아래입니다.':this.integrity()<30?'국가 기반시설이 작전 유지 한계에 도달했습니다.':ground.length===0?'지상 전력이 모두 전투에서 이탈했습니다.':'45턴 이내에 목표를 달성하지 못했습니다.',score:this.score()};
    }else if(s.objectives.every(o=>o.held>=2)){
      const good=s.civilians>=70&&this.integrity()>=60;
      s.result={won:true,title:good?'안정화 목표 달성':'구역 통제 완료',detail:good?'세 구역을 확보하고 민간 보호와 기반시설 보존 목표를 달성했습니다.':'세 구역을 확보했지만 피해를 줄이는 목표는 달성하지 못했습니다.',score:this.score()};
    }return s.result;
  }
  score(){const s=this.state;return Math.max(0,Math.round(s.civilians*35+this.integrity()*30+s.cohesion*10+Math.max(0,46-s.turn)*35-s.losses.blue*.2));}
  export(){return JSON.stringify(this.state);}
  import(text){
    if(typeof text!=='string'||text.length>2_000_000)throw Error('저장 파일 크기가 올바르지 않습니다.');
    const s=JSON.parse(text);
    if(!s||typeof s!=='object')throw Error('지원하지 않는 저장 파일입니다.');
    if(s.version!==VERSION||s.mapId!==this.board.geography.id)throw Error('이전 동아시아 지도 저장은 호환되지 않습니다. 한반도 새 게임을 시작하세요.');
    const scenario=s.scenario??'legacy';
    if(!['legacy',ARMY_SCENARIO].includes(scenario)||(scenario===ARMY_SCENARIO&&s.datasetVersion!==ARMY_DATA.dataset_version))throw Error('지원하지 않는 편제 데이터 버전입니다.');
    if(s.version!==VERSION||!Number.isInteger(s.turn)||s.turn<1||s.turn>46||s.phase!=='player'||!Array.isArray(s.control)||s.control.length!==this.board.tiles.length)throw Error('지원하지 않는 저장 파일입니다.');
    for(let i=0;i<s.control.length;i++){
      const home=this.board.tiles[i].home,value=s.control[i];
      if(home===0?value!==0:home===3?value!==3:![1,2].includes(value))throw Error('지도 통제 데이터가 손상되었습니다.');
    }
    const validNum=(x,lo,hi)=>typeof x==='number'&&Number.isFinite(x)&&x>=lo&&x<=hi;
    for(const k of ['civilians','cohesion','escalation'])if(!validNum(s[k],0,100))throw Error('지표 데이터가 손상되었습니다.');
    for(const k of ['cp','materials','reserve'])if(!validNum(s[k],0,1000))throw Error('자원 데이터가 손상되었습니다.');
    if(!Number.isInteger(s.rng)||s.rng<0||s.rng>0xffffffff||!Number.isInteger(s.seed))throw Error('난수 상태가 올바르지 않습니다.');
    if(!['careful','balanced','push'].includes(s.posture)||!Array.isArray(s.policyUsed)||s.policyUsed.some(x=>!['shelter','diplomacy','cyber','supply'].includes(x)))throw Error('명령 상태가 올바르지 않습니다.');
    if(!['맑음','강우','안개','폭풍'].includes(s.weather))throw Error('기상 데이터가 올바르지 않습니다.');
    if(!s.losses||!validNum(s.losses.blue,0,1e7)||!validNum(s.losses.red,0,1e7))throw Error('전력 데이터가 올바르지 않습니다.');
    for(const k of ['airCover','recon','navalCover','cyberShield'])if(!validNum(s[k],0,10))throw Error('지원 상태가 올바르지 않습니다.');
    // Compare with an immutable scenario template, not the currently running scenario.
    const template=new Game(s.seed,scenario,new Board(this.board.geography)).state;
    if(!Array.isArray(s.units)||s.units.length!==template.units.length||!Array.isArray(s.sites)||s.sites.length!==template.sites.length||!Array.isArray(s.objectives)||s.objectives.length!==3)throw Error('시나리오 구성이 올바르지 않습니다.');
    const unitIds=new Set();
    for(const u of s.units){
      const original=template.units.find(v=>v.id===u.id);
      if(!original||unitIds.has(u.id)||u.type!==original.type||u.side!==original.side||typeof u.name!=='string'||u.name.length>80)throw Error('부대 구성이 올바르지 않습니다.');unitIds.add(u.id);
      if(u.formationId!==original.formationId||(u.formationId&&u.name!==original.name)||['mobility','firepower','armor','reconnaissance','logistics','gameSpec','stat_profile'].some(k=>k in u))throw Error('편제 참조 데이터가 올바르지 않습니다.');
      const t=this.board.tiles[u.tile];if(!Number.isInteger(u.tile)||!t||t.foreign||(u.hp>0&&!u.embarked&&TYPES[u.type].domain!=='air'&&(TYPES[u.type].domain==='sea')!==t.sea&&!t.railBridge))throw Error('부대 위치가 올바르지 않습니다.');
      if(!validNum(u.hp,0,100)||!validNum(u.supply,0,100)||!validNum(u.ap,0,20)||!validNum(u.cargo,0,100)||![null,'patrol','recon','support'].includes(u.mission)||typeof u.acted!=='boolean'||typeof u.entrenched!=='boolean')throw Error('부대 상태가 올바르지 않습니다.');
    }
    for(const u of s.units){
      if(u.embarked){const carrier=s.units.find(x=>x.id===u.embarked);if(!carrier||carrier.passenger!==u.id||carrier.type!=='transport'||carrier.tile!==u.tile||carrier.side!==u.side)throw Error('수송 상태가 손상되었습니다.');}
      if(u.passenger){const p=s.units.find(x=>x.id===u.passenger);if(u.type!=='transport'||!p||p.embarked!==u.id)throw Error('승선 상태가 손상되었습니다.');}
    }
    const sectorClaims=new Set();
    for(const u of s.units)if(u.sector!==undefined&&u.sector!==null){
      validateSector(u.sector,this.board);
      if(!this.isDivision(u)||u.sector.commandId!==u.id||u.sector.commandLevel!=='division')throw Error('전투지경선 지휘부가 올바르지 않습니다.');
      for(const a of u.sector.allocations){const key=u.side+':'+a.tile;if(sectorClaims.has(key))throw Error('전투지경선이 중복되었습니다.');sectorClaims.add(key);}
    }
    const siteIds=new Set();
    for(const f of s.sites){const orig=template.sites.find(x=>x.id===f.id);if(!orig||siteIds.has(f.id)||f.tile!==orig.tile||f.home!==orig.home||f.kind!==orig.kind||typeof f.name!=='string'||f.name.length>80||!validNum(f.health,0,100)||!validNum(f.shelter,0,1))throw Error('시설 데이터가 손상되었습니다.');siteIds.add(f.id);}
    const objIds=new Set();for(const o of s.objectives){const orig=template.objectives.find(x=>x.id===o.id);if(!orig||objIds.has(o.id)||o.tile!==orig.tile||typeof o.name!=='string'||o.name.length>80||!Number.isInteger(o.held)||o.held<0||o.held>46)throw Error('목표 데이터가 손상되었습니다.');objIds.add(o.id);}
    if(!Array.isArray(s.log)||s.log.length>90||s.log.some(l=>!Number.isInteger(l.turn)||typeof l.text!=='string'||l.text.length>400||!['info','good','danger','combat'].includes(l.kind)))throw Error('기록 데이터가 손상되었습니다.');
    if(s.result!==null&&(!s.result||typeof s.result.won!=='boolean'||typeof s.result.title!=='string'||s.result.title.length>100||typeof s.result.detail!=='string'||s.result.detail.length>400||!validNum(s.result.score,0,100000)))throw Error('결과 데이터가 손상되었습니다.');
    s.lastReport=null;this.state=s;this.rebuildRoads();this.refreshSupply();return true;
  }
}
