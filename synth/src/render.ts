import type {Board} from './board.ts';
import {pinLabels} from './routing.ts';
const NS='http://www.w3.org/2000/svg';
export function renderBoard(svg:SVGSVGElement,board:Board):void {
  svg.replaceChildren();svg.setAttribute('viewBox','-42 -12 744 456');
  const add=(tag:string,attrs:Record<string,string|number>)=>{const el=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));svg.append(el);return el;};
  add('rect',{x:0,y:0,width:660,height:405,fill:'#8e8e8c'});
  for(let x=0;x<=44;x++)add('path',{d:`M${x*15} 0V405`,stroke:'#7c7c7a','stroke-width':.5});
  for(let y=0;y<=27;y++)add('path',{d:`M0 ${y*15}H660`,stroke:'#7c7c7a','stroke-width':.5});
  for(const layer of ['silicon','metal'] as const)for(let x=0;x<44;x++)for(let y=0;y<27;y++){
    if(!board[layer][x][y])continue;const color=layer==='metal'?'#9bc5ee':board.silicon[x][y]===1?'#d45146':'#edcd38',width=layer==='metal'?4:10;
    add('rect',{x:x*15+7.5-width/2,y:y*15+7.5-width/2,width,height:width,fill:color});
    if(board[`${layer}ConnectedRight`][x][y])add('path',{d:`M${x*15+7.5} ${y*15+7.5}h15`,stroke:color,'stroke-width':width});
    if(board[`${layer}ConnectedDown`][x][y])add('path',{d:`M${x*15+7.5} ${y*15+7.5}v15`,stroke:color,'stroke-width':width});
  }
  for(let x=0;x<44;x++)for(let y=0;y<27;y++){
    if(board.link[x][y])add('circle',{cx:x*15+7.5,cy:y*15+7.5,r:3,fill:'#1e1a15',stroke:'#f3ebd8','stroke-width':1});
    if(board.gateHorizontal[x][y]||board.gateVertical[x][y])add('rect',{x:x*15+1,y:y*15+1,width:13,height:13,fill:'none',stroke:'#1e1a15','stroke-width':2});
  }
  for(const label of [...pinLabels,...[2,41].flatMap(x=>[3,23].map(y=>({name:'VCC',point:[x,y]})))]){
    const[x,y]=label.point;const el=add('text',{x:x<20?-5:665,y:y*15+11,'text-anchor':x<20?'end':'start',fill:'#cdbe9e','font-size':11,'font-family':"'IBM Plex Mono', monospace"});el.textContent=label.name;
  }
}
