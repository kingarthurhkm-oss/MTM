// Flat-top regular hexagons. Axial directions also define edge indices:
// 0 north, 1 south, 2 northwest, 3 southwest, 4 northeast, 5 southeast.
// Preserve this order: legacy scenario placement uses ordered neighbors.
export const HEX_DIRECTIONS = [[0,-1],[0,1],[-1,0],[-1,1],[1,-1],[1,0]];
const HEX_EDGE_CORNERS = [[1,2],[4,5],[0,1],[5,0],[2,3],[3,4]];
const HEX_CORNERS = [[-1,0],[-.5,-Math.sqrt(3)/2],[.5,-Math.sqrt(3)/2],[1,0],[.5,Math.sqrt(3)/2],[-.5,Math.sqrt(3)/2]];

export const offsetToAxial = (col,row) => ({q:col,r:row-Math.floor(col/2)});
export const axialToOffset = ({q,r}) => ({q,r:r+Math.floor(q/2)});
export const hexDistance = (a,b) => Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r),Math.abs(a.q+a.r-b.q-b.r));
export function roundAxial(q,r){
  let x=Math.round(q),z=Math.round(r),y=Math.round(-q-r);
  const dx=Math.abs(x-q),dz=Math.abs(z-r),dy=Math.abs(y+q+r);
  if(dx>dy&&dx>dz)x=-y-z;else if(dz>dy)z=-x-y;
  return {q:x===0?0:x,r:z===0?0:z};
}

export class HexLayout {
  constructor(radius){this.radius=radius;this.dx=1.5*radius;this.dy=Math.sqrt(3)*radius;}
  toWorld({q,r}){return {x:this.radius+this.dx*q,y:this.dy/2+this.dy*(r+q/2)};}
  fromWorld(x,y){x-=this.radius;y-=this.dy/2;return roundAxial(2*x/(3*this.radius),(-x/3+y/Math.sqrt(3))/this.radius);}
  bounds(cols,rows){return {width:(cols-1)*this.dx+2*this.radius,height:(rows+.5)*this.dy};}
  corners(center,scale=1){return HEX_CORNERS.map(([x,y])=>({x:center.x+x*this.radius*scale,y:center.y+y*this.radius*scale}));}
  edge(center,direction){const c=this.corners(center);return HEX_EDGE_CORNERS[direction].map(i=>c[i]);}
  path(context,center,scale=1){context.beginPath();this.corners(center,scale).forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y));context.closePath();}
}

export const worldToScreen = (p,camera,width,height) => ({x:(p.x-camera.x)*camera.zoom+width/2,y:(p.y-camera.y)*camera.zoom+height/2});
export const screenToWorld = (p,camera,width,height) => ({x:(p.x-width/2)/camera.zoom+camera.x,y:(p.y-height/2)/camera.zoom+camera.y});

/**
 * Defaults only; no real terrain dataset or new gameplay modifiers.
 * @typedef {Object} TileGeography
 * @property {'land'|'sea'} domain
 * @property {'plains'|'hills'|'mountain'} terrain
 * @property {boolean} forest
 * @property {'none'|'low'|'medium'|'high'} urban
 * @property {number[]} riverEdges Edge indices in HEX_DIRECTIONS, 0..5.
 * @property {number[]} roadEdges
 * @property {number[]} railEdges
 */
/** @param {'land'|'sea'} domain @returns {TileGeography} */
export function tileGeography(domain){return {domain,terrain:'plains',forest:false,urban:'none',riverEdges:[],roadEdges:[],railEdges:[]};}
