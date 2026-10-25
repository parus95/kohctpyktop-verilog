import {moduleTemplate} from '../src/level-template.ts';
import {Canvas} from './canvas.js';
import {Editor} from './editor.js';
import {Simulation} from './simulation.js';
import {levels} from './levels.js';
import {assets} from './assets.js';
import {images,Raster} from './runtime.js';
import {encode,decode,importLegacy,exportLegacy} from './storage.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const board=$('#board'),ctx=board.getContext('2d');ctx.imageSmoothingEnabled=false;
let saved={designs:{},completed:[],snippets:[],current:0,free:false};
let storageWarning='';
try{const raw=localStorage.getItem('kohctpyktop-js-v1');if(raw){const v=JSON.parse(raw);if(v&&typeof v.designs==='object'&&Array.isArray(v.completed)&&Array.isArray(v.snippets))saved={...saved,...v};else throw Error();}}catch{storageWarning='Сохранение недоступно или повреждено. Используйте экспорт файла.';}
let index=0,canvas,editor,sim,running=false,selectedTool='n',selection=null,clipboard=null,pasting=false,drag=null,last=null,undo=[],redo=[],helpPage=0,lastFrame=0,accumulator=0;
const status=text=>{$('#status').textContent=text;};
function persist(){try{localStorage.setItem('kohctpyktop-js-v1',JSON.stringify(saved));}catch{status('Автосохранение недоступно. Экспортируйте схему в файл.');}}
function save(){if(canvas)saved.designs[levels[index].id]=encode(canvas);saved.current=index;saved.free=$('#free').checked;persist();}
function fresh(){const c=new Canvas(44,27);c.mainCanvasLock=true;c.AddConnectionPads();return c;}
function available(i){return $('#free').checked||levels.every((l,j)=>l.group>=levels[i].group||saved.completed.includes(j));}
function renderLevels(){
  const nav=$('#levels');nav.replaceChildren();
  levels.forEach((l,i)=>{const b=document.createElement('button');b.className='level'+(i===index?' active':'')+(saved.completed.includes(i)?' done':'')+(i&&l.group!==levels[i-1].group?' group-start':'');b.disabled=!available(i);b.setAttribute('aria-current',String(i===index));b.dataset.level=i;
    b.innerHTML='<span class="number">'+String(i+1).padStart(2,'0')+'</span><span><b>'+l.id+'</b><small>'+l.title+'</small></span><i class="lamp'+(i===index?' amber':saved.completed.includes(i)?' green':'')+'" aria-hidden="true"></i><span class="sr-only">'+(saved.completed.includes(i)?'пройдено':b.disabled?'закрыто':'')+'</span>';
    b.onclick=()=>loadLevel(i);nav.append(b);
  });$('#progress').textContent=saved.completed.filter(i=>levels[i]).length+' / 19';
}
function loadLevel(i){
  if(!levels[i]||!available(i))return;save();index=i;canvas=fresh();
  try{if(saved.designs[levels[i].id])canvas=decode(saved.designs[levels[i].id]);}catch(e){status('Сохранение задания не прочитано: '+e.message);}
  canvas.mainCanvasLock=true;canvas.AddConnectionPads();editor=new Editor(canvas);editor.showMetal=$('#show-metal').checked;
  undo=[];redo=[];selection=null;pasting=false;drag=null;last=null;reset();setTool(selectedTool);renderLevels();
  $('#job-number').textContent='ЗАДАНИЕ '+String(i+1).padStart(2,'0');$('#job-title').textContent=levels[i].id;$('#plate-level').textContent=levels[i].id;$('#job-description').textContent=levels[i].title;
  const sc=$('#spec').getContext('2d');sc.fillStyle='white';sc.fillRect(0,0,640,240);sc.drawImage(images.get('spec_'+levels[i].id.toLowerCase()),0,400,640,240,0,0,640,240);
  draw();save();
}
function snapshot(){undo.push(encode(canvas));if(undo.length>100)undo.shift();redo=[];}
function setCanvas(c){canvas=c;canvas.mainCanvasLock=true;canvas.AddConnectionPads();editor.canvas=canvas;reset();draw();save();}
function history(back){if(drag)return;const from=back?undo:redo,to=back?redo:undo;if(!from.length)return;to.push(encode(canvas));setCanvas(decode(from.pop()));selection=null;draw();}
function result(text,state=''){$('#result').textContent=text;$('#result').className=state;$('#result-lamp').className='lamp'+({running:' amber',pass:' green',fail:' red'}[state]??'');}
function reset(){running=false;accumulator=0;sim=new Simulation(canvas,levels[index]);$('#run').innerHTML='▶ Проверить <kbd>Space</kbd>';result('Готово к проверке');draw();}
function edited(){reset();draw();save();}
const configs={n:[0,false],p:[0,true],metal:[1,false],via:[2,false],select:[3,false],erase:[4,false]};
function setTool(name){selectedTool=name;const [tool,alt]=configs[name];editor.tool=tool;editor.alternate=alt;pasting=false;if(tool!==3)selection=null;if(tool===1){editor.showMetal=true;$('#show-metal').checked=true;}$('[data-tool].active')?.classList.remove('active');$('[data-tool="'+name+'"]').classList.add('active');
  status({n:'N-кремний: рисуйте непрерывную линию. Shift — P-кремний.',p:'P-кремний: пересечение с N создаёт транзистор. Shift — N.',metal:'Металл соединяет выводы платы. Для связи с кремнием поставьте контакт.',via:'Контакт ставится на кремнии, под металлическим проводником.',select:'Выделите прямоугольник. Перетаскивание перемещает его; Shift копирует.',erase:'Стирание кремния. Удерживайте Shift для стирания металла.'}[name]);draw();
}
function rect(){if(!selection)return null;const {a,b}=selection;return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x)+1,h:Math.abs(a.y-b.y)+1};}
function draw(){
  if(!canvas)return;ctx.clearRect(0,0,580,360);Raster.Blit(ctx,'img_background');canvas.Draw(ctx,4,4,editor?.showMetal??true);Raster.Blit(ctx,'img_pads');if(!editor?.showMetal)Raster.Blit(ctx,'img_fakepads');
  ctx.textAlign='center';ctx.textBaseline='top';ctx.font='10px Georgia';ctx.fillStyle='#111';
  for(let p=0;p<6;p++){const y=42+52*p;ctx.fillText(p===0||p===5?'+VCC':levels[index].pins[p-1].name,35,y);ctx.fillText(p===0||p===5?'+VCC':levels[index].pins[p+3].name,542,y);}
  const r=rect();if(r){ctx.fillStyle='#ffffff25';ctx.fillRect(4+r.x*13,4+r.y*13,r.w*13,r.h*13);ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.setLineDash([4,3]);ctx.strokeRect(4+r.x*13,4+r.y*13,r.w*13,r.h*13);ctx.setLineDash([]);}
  if(pasting&&clipboard&&last){ctx.save();ctx.globalAlpha=.65;clipboard.Draw(ctx,4+last.x*13,4+last.y*13,true);ctx.restore();}
  showScore(canvas.ScoreDesign());$('#undo').disabled=!undo.length;$('#redo').disabled=!redo.length;
  $('#copy').disabled=$('#cut').disabled=$('#delete').disabled=!selection;$('#paste').disabled=!clipboard;
  if(sim)drawSignals();
}
function showScore(value){const el=$('#score'),text=String(value);if(el.dataset.value===text)return;el.dataset.value=text;const digits=text.padStart(4,'0');
  el.replaceChildren(...[...digits].map((d,k)=>{const s=document.createElement('span');s.textContent=d;if(k<digits.length-text.length)s.className='off';return s;}));el.setAttribute('aria-label','Площадь схемы: '+text);}
function drawSignals(){const g=$('#signals').getContext('2d'),width=560/levels[index].length;g.fillStyle='#15110c';g.fillRect(0,0,640,248);g.font='11px "IBM Plex Mono", monospace';
  g.strokeStyle='#f0a43a14';for(let x=65;x<=625;x+=56){g.beginPath();g.moveTo(x,4);g.lineTo(x,240);g.stroke();}
  function trace(values,y,color,dash=[]){g.strokeStyle=color;g.lineWidth=dash.length?1:1.5;g.setLineDash(dash);g.shadowColor=color;g.shadowBlur=dash.length?0:4;g.beginPath();let previous=false;values.forEach((v,t)=>{const x=65+t*width;if(!t)g.moveTo(x,y-(v?15:0));else if(v!==previous)g.lineTo(x,y-(v?15:0));g.lineTo(x+width,y-(v?15:0));previous=v;});g.stroke();g.setLineDash([]);g.shadowBlur=0;}
  sim.signals.forEach((s,i)=>{const y=28+i*29;g.strokeStyle='#2e2820';g.beginPath();g.moveTo(65,y);g.lineTo(625,y);g.stroke();g.fillStyle='#cdbe9e';g.fillText(s.name+(s.output?' →':''),5,y-4);trace(s.pattern,y,'#7c6f5a',[4,3]);trace(s.values,y,s.output?'#f0a43a':'#d9c9a6');});
  if(sim.time){g.strokeStyle='#7fc28a';g.beginPath();g.moveTo(65+sim.time*width,2);g.lineTo(65+sim.time*width,239);g.stroke();}$('#tick').textContent=sim.time+' / '+levels[index].length+' тактов';
}
function tab(name){$$('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===name)));$$('[role=tabpanel]').forEach(p=>p.hidden=p.id!=='panel-'+name);drawSignals();}
function finish(){running=false;$('#run').innerHTML='▶ Ещё раз <kbd>Space</kbd>';const passed=sim.rate>=97;result((passed?'ПРОВЕРКА ПРОЙДЕНА':'ТРЕБУЕТСЯ ДОРАБОТКА')+' · '+sim.rate.toFixed(1)+'% совпадения',passed?'pass':'fail');
  if(passed&&!saved.completed.includes(index)){saved.completed.push(index);save();renderLevels();if(saved.completed.length===19)$('#win-dialog').showModal();}draw();
}
function toggleRun(){tab('signals');if(sim.done)reset();running=!running;$('#run').textContent=running?'Ⅱ Пауза':'▶ Продолжить';result(running?'Проверка выполняется…':'Пауза · такт '+sim.time,running?'running':'');}
function frame(now){if(running){accumulator+=Math.min(now-lastFrame,100)*Number($('#speed').value)/1000;let n=Math.floor(accumulator);accumulator-=n;while(n-->0&&!sim.done)sim.step();if(sim.done)finish();draw();}lastFrame=now;requestAnimationFrame(frame);}
function cell(e){const r=board.getBoundingClientRect();return{x:Math.floor(((e.clientX-r.left)*580/r.width-4)/13),y:Math.floor(((e.clientY-r.top)*360/r.height-4)/13)};}
const inside=p=>p.x>=0&&p.x<44&&p.y>=0&&p.y<27;
const editable=p=>p.x>=4&&p.x<40&&p.y>=0&&p.y<27;
const clamp=p=>({x:Math.max(4,Math.min(39,p.x)),y:Math.max(0,Math.min(26,p.y))});
function stroke(a,b,e){editor.alternate=configs[selectedTool][1]!==e.shiftKey;
  // Manhattan-connected interpolation prevents holes when pointer events skip cells.
  const steps=Math.abs(b.x-a.x)+Math.abs(b.y-a.y);let p={...a};
  for(let k=0;k<steps;k++){const dx=b.x-p.x,dy=b.y-p.y;const q={...p};if(Math.abs(dx)>=Math.abs(dy)&&dx)q.x+=Math.sign(dx);else q.y+=Math.sign(dy);editor.paint(q,p);p=q;}
}
board.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;const p=cell(e);if(!inside(p))return;e.preventDefault();board.focus();board.setPointerCapture(e.pointerId);running=false;
  if(pasting){if(!editable(p))return;snapshot();if(canvas.Paste(p.x,p.y,clipboard)){pasting=false;selection={a:p,b:{x:p.x+clipboard.width-1,y:p.y+clipboard.height-1}};edited();status('Фрагмент вставлен.');}else{undo.pop();status('Фрагмент не помещается или пересекает существующие проводники.');}return;}
  reset();last=p;
  if(selectedTool==='select'){
    if(!editable(p))return;const r=rect();
    if(r&&p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h){snapshot();drag={mode:'move',backup:canvas.Copy(),fragment:canvas.CopySelection(r.x,r.y,r.w,r.h),offset:{x:p.x-r.x,y:p.y-r.y},copy:e.shiftKey};if(!e.shiftKey)canvas.DeleteSelection(r.x,r.y,r.w,r.h);}
    else{selection={a:p,b:p};drag={mode:'select'};}
  }else{snapshot();drag={mode:'paint'};editor.alternate=configs[selectedTool][1]!==e.shiftKey;editor.paint(p,p);}
  draw();
});
board.addEventListener('pointermove',e=>{const p=cell(e);if(pasting){last=p;draw();return;}if(!drag||!inside(p))return;
  if(drag.mode==='paint')stroke(last,p,e);
  else if(drag.mode==='select')selection.b=clamp(p);
  else{const a={x:p.x-drag.offset.x,y:p.y-drag.offset.y};selection={a,b:{x:a.x+drag.fragment.width-1,y:a.y+drag.fragment.height-1}};}
  last=p;draw();
});
function endPointer(e,cancel=false){if(!drag)return;
  if(drag.mode==='move'){
    const p=cell(e),a={x:p.x-drag.offset.x,y:p.y-drag.offset.y};
    if(cancel||!canvas.Paste(a.x,a.y,drag.fragment)){canvas=drag.backup;editor.canvas=canvas;undo.pop();selection=null;status('Перемещение отменено: место занято или за пределами платы.');}
  }
  drag=null;last=null;edited();
}
board.addEventListener('pointerup',e=>endPointer(e));board.addEventListener('pointercancel',e=>endPointer(e,true));
board.addEventListener('contextmenu',e=>e.preventDefault());
function copy(cut=false){const r=rect();if(!r)return;clipboard=canvas.CopySelection(r.x,r.y,r.w,r.h);if(cut){snapshot();canvas.DeleteSelection(r.x,r.y,r.w,r.h);selection=null;edited();}status(cut?'Фрагмент вырезан. Нажмите «Вставить».':'Фрагмент скопирован. Нажмите «Вставить».');draw();}
function paste(){if(!clipboard)return;running=false;pasting=true;last=null;status('Нажмите на плату для вставки. Esc — отменить.');board.focus();}
function deleteSelection(){const r=rect();if(!r)return;snapshot();canvas.DeleteSelection(r.x,r.y,r.w,r.h);selection=null;edited();}
function renderSnippets(){const box=$('#snippets');box.replaceChildren();saved.snippets.forEach((s,i)=>{const row=document.createElement('div');row.className='snippet';const use=document.createElement('button');use.textContent=s.name;use.onclick=()=>{try{clipboard=decode(s.data);paste();}catch(e){status(e.message);}};const del=document.createElement('button');del.textContent='Удалить';del.onclick=()=>{saved.snippets.splice(i,1);persist();renderSnippets();};row.append(use,del);box.append(row);});}
function download(text,extension){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.href=url;a.download=levels[index].id+'.'+extension;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function importText(text){try{if(text.length>300000)throw Error('Файл слишком большой');const c=text.trim().startsWith('{')?decode(text):await importLegacy(text);if(c.width!==44||c.height!==27)throw Error('Для задания нужна схема 44 × 27');snapshot();setCanvas(c);selection=null;$('#code-dialog').close();status('Схема импортирована.');}catch(e){status('Импорт не выполнен: '+e.message);}}
function drawHelp(){const h=$('#help-image').getContext('2d');h.fillStyle='white';h.fillRect(0,0,640,240);h.drawImage(images.get('help_page'+(helpPage+1)),0,400,640,240,0,0,640,240);$('#help-page').textContent='Оригинальная справка · '+(helpPage+1)+' / 3';}
async function start(){
  await Promise.all(Object.entries(assets).map(async([name,url])=>{const img=new Image();img.src=url;await img.decode();images.set(name,img);}));
  $('#free').checked=!!saved.free;index=Number.isInteger(saved.current)&&levels[saved.current]?saved.current:0;const initial=index;canvas=null;loadLevel(available(initial)?initial:0);
  $$('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));$$('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
  $('#free').onchange=()=>{renderLevels();save();};$('#show-metal').onchange=()=>{editor.showMetal=$('#show-metal').checked;draw();};
  $('#undo').onclick=()=>history(true);$('#redo').onclick=()=>history(false);$('#copy').onclick=()=>copy();$('#cut').onclick=()=>copy(true);$('#paste').onclick=paste;$('#delete').onclick=deleteSelection;
  $('#clear').onclick=()=>$('#confirm-dialog').showModal();$('#confirm-clear').onclick=()=>{snapshot();setCanvas(fresh());selection=null;$('#confirm-dialog').close();draw();};
  $('#run').onclick=toggleRun;$('#reset').onclick=reset;$('#step').onclick=()=>{tab('signals');running=false;if(sim.done)reset();sim.step();$('#run').textContent='▶ Продолжить';if(sim.done)finish();else result('Пауза · такт '+sim.time);draw();};
  $('#snippet-form').onsubmit=e=>{e.preventDefault();const r=rect();if(!r){status('Сначала выделите часть схемы.');return;}const c=canvas.CopySelection(r.x,r.y,r.w,r.h);saved.snippets.push({name:$('#snippet-name').value.trim()||'Фрагмент',data:encode(c)});$('#snippet-name').value='';persist();renderSnippets();status('Фрагмент сохранён.');};renderSnippets();
  $('#export').onclick=()=>download(encode(canvas),'json');$('#export-flash').onclick=async()=>{try{download(await exportLegacy(canvas),'txt');}catch(e){status('Экспорт не выполнен: '+e.message);}};
  $('#import').onclick=()=>$('#file').click();$('#file').onchange=async()=>{const f=$('#file').files[0];if(f){if(f.size>300000)status('Файл слишком большой');else await importText(await f.text());}$('#file').value='';};
  $('#paste-code').onclick=()=>{$('#code').value='';$('#code-dialog').showModal();};$('#load-code').onclick=()=>importText($('#code').value);
  $('#help').onclick=()=>{$('#help-dialog').showModal();drawHelp();};$('#help-prev').onclick=()=>{helpPage=(helpPage+2)%3;drawHelp();};$('#help-next').onclick=()=>{helpPage=(helpPage+1)%3;drawHelp();};$$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());
  const music=new Audio('assets/music.mp3');music.loop=true;music.volume=.45;$('#music').onclick=async()=>{try{if(music.paused)await music.play();else music.pause();$('#music').setAttribute('aria-pressed',String(!music.paused));$('#music .lamp').classList.toggle('amber',!music.paused);}catch{status('Не удалось воспроизвести музыку.');}};
  document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||$('dialog[open]'))return;
    if(e.key==='Escape'){pasting=false;selection=null;draw();return;}
    if(e.ctrlKey||e.metaKey){const key=e.key.toLowerCase();if(['z','y','c','x','v','s'].includes(key)){e.preventDefault();if(key==='z')history(!e.shiftKey);if(key==='y')history(false);if(key==='c')copy();if(key==='x')copy(true);if(key==='v')paste();if(key==='s'){save();status('Схема сохранена.');}}return;}
    if(e.code==='Space'){e.preventDefault();toggleRun();}else if(e.key==='Delete'){e.preventDefault();deleteSelection();}else if('123456'.includes(e.key)&&e.key.length===1)setTool(Object.keys(configs)[Number(e.key)-1]);else if(e.key==='?')$('#help').click();
  });
  window.addEventListener('beforeunload',save);document.documentElement.dataset.ready='true';status(storageWarning||'Готово. Выберите материал и рисуйте на плате. Справка — в правом верхнем углу.');requestAnimationFrame(frame);
}
start().catch(e=>{status('Ошибка запуска: '+e.message);console.error(e);});

const synthDialog=$('#synth-dialog'),synthFrame=$('#synth-frame');
function synthContext(template=false){synthFrame.contentWindow.postMessage({type:'kohctpyktop:level',levelId:levels[index].id,template:moduleTemplate(levels[index]),replace:template},location.origin);}
$('#open-synth').onclick=()=>{$('#synth-level').textContent=levels[index].id+' · '+levels[index].title;synthDialog.showModal();synthContext();};
$('#close-synth').onclick=()=>synthDialog.close();
window.addEventListener('message',async event=>{
 if(event.origin!==location.origin||event.source!==synthFrame.contentWindow)return;
 if(event.data?.type==='kohctpyktop:ready')synthContext();
 if(event.data?.type==='kohctpyktop:template')synthContext(true);
 if(event.data?.type==='kohctpyktop:apply'){
  if(event.data.levelId!==levels[index].id){status('Уровень изменился. Откройте синтезатор из нужного уровня.');return;}
  await importText(event.data.board);synthDialog.close();
 }
});
