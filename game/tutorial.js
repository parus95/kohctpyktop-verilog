// First-level tutorial: Semyon Ilyich walks the player through one inverter, then the other three.
// Steps advance on results (connectivity or a headless simulation), never on exact cells; the ghost is one valid layout.
import {Canvas} from './canvas.js';
import {Simulation,matches} from './simulation.js';

const VCC=[[2,3],[2,23],[41,3],[41,23]],A0=[2,7],Y0=[41,7];
const run=(x,y,w,h,layer)=>{const cells=[];for(let i=0;i<w;i++)for(let j=0;j<h;j++)cells.push([x+i,y+j]);return cells.map(([cx,cy])=>({x:cx,y:cy,layer}));};
const via=(x,y)=>({x,y,layer:'via'});
// Verified layout: P bus at x=9 fed from the top VCC pad, one P channel per output at rows 6/10/14/18,
// an N gate drawn upward from a contact into the middle of each channel, contacts on both channel ends.
const channel=k=>{const o=4*k;return[...run(9,6+o,26,1,'p'),...run(20,6+o,1,2,'n'),via(20,7+o),...run(4,7+o,17,1,'metal'),via(34,6+o),...run(34,6+o,1,2,'metal'),...run(35,7+o,5,1,'metal')];};

function component(c,start,type){
  const seen=new Set(),stack=[start];let minX=99,maxX=-1;
  while(stack.length){const [x,y]=stack.pop(),key=x+','+y;if(seen.has(key)||c.silicon[x]?.[y]!==type)continue;seen.add(key);minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    if(c.siliconConnectedRight[x][y])stack.push([x+1,y]);if(x&&c.siliconConnectedRight[x-1][y])stack.push([x-1,y]);
    if(c.siliconConnectedDown[x][y])stack.push([x,y+1]);if(y&&c.siliconConnectedDown[x][y-1])stack.push([x,y-1]);}
  return{minX,maxX};
}
function hasChannel(c){for(let x=4;x<40;x++)for(let y=0;y<27;y++)if(c.silicon[x][y]===Canvas.SILICON_P){const r=component(c,[x,y],Canvas.SILICON_P);if(r.minX<=12&&r.maxX>=30)return true;}return false;}
function flood(c,sources){const copy=c.Copy();copy.SimClearHot();copy.SimClearGates();copy.SimCacheGates();for(const [x,y] of sources)copy.SimSetHot(x,y,true);return copy;}
const metalLinked=(c,a,b)=>flood(c,[a]).metalHot[b[0]][b[1]];
const powered=c=>flood(c,VCC).metalHot[Y0[0]][Y0[1]];
// A0 already reaches some N-silicon through a contact, yet the output does not follow: the gate wire was drawn from the wrong side.
const a0ReachesN=c=>{const f=flood(c,[A0]);return f.siliconHot.some((col,x)=>col.some((hot,y)=>hot&&f.silicon[x][y]===Canvas.SILICON_N));};
function grade(c,level){const sim=new Simulation(c.Copy(),level);sim.run();return sim.signals.filter(s=>s.output).map(s=>matches(s.values,s.pattern));}

const STEPS=[
  {title:'Это плата',targets:[],manual:true,
    text:'Здравствуйте, товарищ инженер. Я Семён Ильич, покажу, что к чему. Перед вами кристалл 44 на 27 клеток. Слева входы A0–A3, справа выходы Y0–Y3, по углам +VCC — питание, оно включено всегда. Задача: каждый выход должен показывать обратное своему входу.',
    goal:'Нажмите «Дальше».',ghost:[{x:1,y:6,w:3,h:3,layer:'pad'},{x:40,y:6,w:3,h:3,layer:'pad'},{x:1,y:2,w:3,h:3,layer:'pad'}]},
  {title:'Металл — это провод',targets:['[data-tool="metal"]'],
    text:'Начнём с простого. Возьмите металл (клавиша 3) и протяните провод от вывода A0 прямо к Y0. Ведите мышью, не отпуская кнопку.',
    goal:'A0 и Y0 соединены металлом.',cells:run(4,7,36,1,'metal'),done:t=>metalLinked(t.canvas(),A0,Y0)},
  {title:'Проверка',targets:['#run'],
    text:'Теперь нажмите «Проверить» или пробел и смотрите на осциллограф.',
    goal:'Запустите проверку.',cells:run(4,7,36,1,'wrong'),
    after:{targets:['#undo'],text:'Видите? Y0 повторяет A0, а нужно наоборот. Так выглядит ошибка — запомните. Теперь уберите провод: Ctrl+Z или «Отменить».',goal:'Металла между A0 и Y0 больше нет.'},
    done:t=>t.ran&&!metalLinked(t.canvas(),A0,Y0)},
  {title:'Канал из P-кремния',targets:['[data-tool="p"]'],
    text:'Кремний рисуют одной непрерывной линией. Возьмите P-кремний (клавиша 2) и ведите его от пунктира у верхнего +VCC вниз на три клетки, затем вправо почти до Y0. Это канал: по нему пойдёт ток от питания к выходу.',
    goal:'Есть сплошная линия P-кремния от левой части платы до правой.',cells:[...run(9,3,1,4,'p'),...run(10,6,25,1,'p')],done:t=>hasChannel(t.canvas())},
  {title:'Питание и выход',targets:['[data-tool="metal"]','[data-tool="via"]'],
    text:'Металл и кремний лежат в разных слоях и сами не соединяются — только через контакт (клавиша 4). Поставьте контакты на оба конца канала. Слева подведите к контакту металл от +VCC, справа уведите металл от контакта к Y0.',
    goal:'Питание дошло до Y0.',cells:[...run(4,3,6,1,'metal'),via(9,3),via(34,6),...run(34,6,1,2,'metal'),...run(35,7,5,1,'metal')],done:t=>powered(t.canvas())},
  {title:'Затвор',targets:['[data-tool="n"]','[data-tool="via"]','[data-tool="metal"]'],
    text:'Теперь сам транзистор. Возьмите N-кремний (клавиша 1) и проведите его от клетки под каналом вверх, к середине канала. Поставьте контакт на нижний конец и подведите к нему металл от A0. Пока на затворе ноль, канал открыт и на Y0 единица. Подали единицу — канал закрылся, на Y0 ноль.',
    goal:'Y0 стал обратным A0.',cells:[...run(20,6,1,2,'n'),via(20,7),...run(4,7,17,1,'metal')],
    hint:t=>a0ReachesN(t.canvas())?'Затвор не слышит A0. N-кремний соединяется только с той стороной, откуда вы его вели: начните у контакта и ведите к каналу.':'',
    done:t=>t.grades()[0]>=97},
  {title:'Ещё три',targets:['[data-tool="select"]'],
    text:'Остальные три инвертора такие же. Можно нарисовать заново, а можно скопировать: «Выделить» (5), обведите строку с затвором и выходом, Ctrl+C, Ctrl+V и щёлкните на четыре клетки ниже. Скопированное не знает про выводы и шину: дотяните металл от каждого вывода на клетку и продлите P-шину вниз.',
    goal:'Все четыре выхода обратны своим входам.',cells:[...run(9,7,1,12,'p'),...channel(1),...channel(2),...channel(3)],done:t=>t.grades().every(r=>r>=97)},
  {title:'Сдача в ОТК',targets:['#run'],
    text:'Готово? Жмите «Проверить» — пусть ОТК посмотрит.',goal:'Проверка пройдена.'},
  {title:'Принято',speaker:'НИНА СЕРГЕЕВНА',portrait:'НО',targets:[],manual:true,final:true,
    text:'Совпадение — сто процентов. Принято. Семён Ильич просил передать: памятка по клавишам — в «Справке», там же можно пройти обучение заново.',
    goal:'Следующее задание — KT221A.'}
];
const COUNTED=STEPS.length-1;
const COLORS={n:'#d45146',p:'#edcd38',metal:'#9bc5ee',wrong:'#e0533f'};

export function createTutorial(host){
  const $=s=>document.querySelector(s);
  let state=host.state,step=0,ran=false,cache=null;
  const t={canvas:host.canvas,get ran(){return ran;},grades(){return cache??=grade(host.canvas(),host.level());}};
  const active=()=>typeof state==='number'&&host.index()===0;
  function save(value){state=value;host.persist(value);}
  function render(){
    const box=$('#coach');document.querySelectorAll('.coach-target').forEach(e=>e.classList.remove('coach-target'));
    if(!active()){box.hidden=true;return;}
    const s=STEPS[step],view=s.after&&ran?{...s,...s.after}:s;box.hidden=false;
    $('#coach-portrait').textContent=s.portrait??'СБ';$('#coach-speaker').textContent=s.speaker??'СЕМЁН ИЛЬИЧ';
    $('#coach-title').textContent=s.final?s.title:'Шаг '+(step+1)+' из '+COUNTED+' · '+s.title;
    $('#coach-text').textContent=view.text;$('#coach-goal').textContent=view.goal;
    const hint=s.hint&&!s.manual?s.hint(t):'';$('#coach-hint').textContent=hint;$('#coach-hint').hidden=!hint;
    $('#coach-steps').replaceChildren(...Array.from({length:COUNTED},(_,i)=>{const l=document.createElement('i');l.className='lamp'+(i<step||s.final?' green':i===step?' amber':'');return l;}));
    $('#coach-steps').setAttribute('aria-label',s.final?'Обучение пройдено':'Шаг '+(step+1)+' из '+COUNTED);
    $('#coach-back').hidden=step===0||s.final;$('#coach-next').hidden=!s.manual;$('#coach-next').textContent=s.final?'К заданию 02':'Дальше';$('#coach-skip').hidden=!!s.final;
    for(const sel of view.targets??[])document.querySelectorAll(sel).forEach(e=>e.classList.add('coach-target'));
  }
  function go(i){step=Math.max(0,Math.min(STEPS.length-1,i));ran=false;cache=null;save(step);check();}
  function check(){
    if(!active())return render();
    const s=STEPS[step];cache=null;
    if(s.done&&s.done(t)){go(step+1);return;}
    render();host.redraw();
  }
  function finish(){save('done');render();host.redraw();}
  $('#coach-next').onclick=()=>{if(STEPS[step].final){finish();host.loadLevel(1);}else go(step+1);};
  $('#coach-back').onclick=()=>go(step-1);
  $('#coach-skip').onclick=finish;
  return{
    level(){
      if(state==null&&host.index()===0){if(host.completed().includes(0))save('done');else if(host.canvas().ScoreDesign()===0)save(0);}
      if(typeof state==='number')step=Math.min(state,STEPS.length-1);ran=false;check();
    },
    changed(){if(active())check();},
    started(){if(!active())return;ran=true;check();},
    finished(passed){if(active()&&passed&&step>=5&&!STEPS[step].final)go(STEPS.length-1);},
    restart(){host.loadLevel(0);host.clear();save(0);step=0;ran=false;check();},
    // Ghost cells of the current step that are not drawn yet, plus amber frames around the pads in the intro.
    drawGhost(ctx){
      if(!active())return;const s=STEPS[step],c=host.canvas();ctx.save();ctx.setLineDash([3,2]);ctx.lineWidth=1.5;
      for(const g of s.ghost??[]){ctx.strokeStyle='#f0a43a';ctx.strokeRect(4+g.x*13-1.5,4+g.y*13-1.5,g.w*13+3,g.h*13+3);}
      for(const g of s.cells??[]){
        const px=4+g.x*13,py=4+g.y*13;
        if(g.layer==='via'){if(c.link[g.x][g.y])continue;ctx.strokeStyle='#f0a43a';ctx.beginPath();ctx.arc(px+6.5,py+6.5,4,0,Math.PI*2);ctx.stroke();continue;}
        if(g.layer==='wrong'){if(!c.metal[g.x][g.y])continue;ctx.fillStyle='#e0533f55';ctx.fillRect(px,py,13,13);continue;}
        const drawn=g.layer==='metal'?c.metal[g.x][g.y]:g.layer==='p'?c.silicon[g.x][g.y]===Canvas.SILICON_P:c.silicon[g.x][g.y]===Canvas.SILICON_N||c.gateHorizontal[g.x][g.y]||c.gateVertical[g.x][g.y];
        if(drawn)continue;ctx.fillStyle=COLORS[g.layer]+'66';ctx.fillRect(px+1,py+1,11,11);ctx.strokeStyle='#f0a43a';ctx.strokeRect(px+.5,py+.5,12,12);
      }
      ctx.restore();
    }
  };
}
