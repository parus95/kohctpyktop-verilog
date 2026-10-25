import muxExample from '../examples/mux.v?raw';
import {libraryManager} from './library-manager.ts';
import {parseWithLibrary} from './user-library.ts';
import {librarySources} from './browser-library.ts';
import {EditorView,basicSetup} from 'codemirror';
import {StreamLanguage,syntaxHighlighting,HighlightStyle} from '@codemirror/language';
import {tags} from '@lezer/highlight';
import {verilog} from '@codemirror/legacy-modes/mode/verilog';
import {Diagnostic} from './parser.ts';
import {synthesize} from './synthesis.ts';
import {route} from './routing.ts';
import type {Layout} from './routing.ts';
import {encode,exportLegacy} from './board.ts';
import {renderBoard} from './render.ts';
import './style.css';
const example=`module root (
    input pin1, pin2, pin3, pin4,
    output pin8, pin7, pin6, pin5
);
    assign {pin8, pin7, pin6, pin5}
         = ~{pin1, pin2, pin3, pin4};
endmodule
`;
const andExample=`module root (
    input pin1, pin2, pin7, pin6,
    output pin3, pin5
);
    assign pin3 = pin1 & pin2;
    assign pin5 = pin7 & pin6;
endmodule
`;
const busExample=`module root (
    input pin1, pin2, pin3, pin4,
    output pin6, pin7
);
    wire [3:0] values = {pin1, pin2, pin3, pin4};
    assign pin6 = |values, pin7 = &values;
endmodule
`;
const porExample=`module root(output pin6, output pin7);
    wire early;
    por #(.DEPTH(10)) startup (
        .out(pin6),
        .pre_out(early)
    );
    assign pin7 = ~early;
endmodule
`;
const delayExample=`module root(input pin1, output pin8);
    delay_line #(.DEPTH(3)) delay (
        .in(pin1),
        .out(pin8)
    );
endmodule
`;
const modulesExample=`module root(input pin1, input pin8, output pin4, output pin5);
    osc osc1(.en(pin1), .out(pin4));
    osc osc2(.en(pin8), .out(pin5));
endmodule

module osc(input en, output out);
    wire dl1_in = en & ~dl2_out;
    wire mid, dl2_out;
    delay_line #(.DEPTH(9)) dl1(.in(dl1_in), .out(mid));
    delay_line #(.DEPTH(9)) dl2(.in(mid), .out(dl2_out));
    assign out = en & ~mid;
endmodule
`;
const decoderExample=`module root(input pin2, input pin3,
            output pin5, output pin6, output pin7, output pin8);
    wire [1:0] sel = {pin2, pin3};
    assign {pin8, pin7, pin6, pin5} = 4'b1 << sel;
endmodule
`;
const adderExample=`module root(input pin1, input pin2, input pin3, input pin4,
            output pin5, output pin7, output pin8);
    wire carry;
    sum s1(.a(pin1), .b(pin3), .s(pin8), .carry_in(1'b0), .carry_out(carry));
    sum s2(.a(pin2), .b(pin4), .s(pin7), .carry_in(carry), .carry_out(pin5));
endmodule

module sum(input a, input b, output s, input carry_in, output carry_out);
    assign s = a ^ b ^ carry_in;
    assign carry_out = (a & (b | carry_in)) | (b & carry_in);
endmodule
`;
const rsExample=`module root(input pin1, input pin2, output pin8);
    rs_trigger memory(.r(pin2), .s(pin1), .out(pin8));
endmodule
`;
const edgeExample=`module root(input pin1, output pin8);
    positive_edge_detector edge1(.in(pin1), .out(pin8));
endmodule
`;
// Warm phosphor colours on the dark code screen, matching the shared theme.
const lampHighlight=HighlightStyle.define([
  {tag:tags.keyword,color:'#f0a43a'},
  {tag:tags.comment,color:'#9c8c70',fontStyle:'italic'},
  {tag:[tags.number,tags.bool,tags.atom],color:'#9fd3a8'},
  {tag:[tags.string,tags.meta,tags.typeName,tags.definition(tags.variableName),tags.standard(tags.variableName)],color:'#e8c27a'},
  {tag:tags.operator,color:'#ee8a73'},
  {tag:[tags.bracket,tags.punctuation],color:'#a39478'},
]);
const lampTheme=EditorView.theme({
  '&':{height:'300px',fontSize:'14px',color:'#eadbc0',backgroundColor:'#1a1611'},
  '.cm-scroller':{fontFamily:"'IBM Plex Mono', Consolas, monospace",lineHeight:'1.7'},
  '.cm-content':{padding:'14px 0',caretColor:'#f0a43a'},
  '.cm-cursor, .cm-dropCursor':{borderLeftColor:'#f0a43a'},
  '.cm-gutters':{backgroundColor:'#1a1611',color:'#7c6f5a',border:'none'},
  '.cm-activeLine':{backgroundColor:'#f0a43a12'},
  '.cm-activeLineGutter':{backgroundColor:'#f0a43a12',color:'#cdbe9e'},
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':{backgroundColor:'#f0a43a40'},
  '.cm-selectionMatch':{backgroundColor:'#9fd3a826'},
  '&.cm-focused .cm-matchingBracket':{backgroundColor:'#f0a43a33',outline:'none'},
},{dark:true});
const element=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=element('status'),copy=element<HTMLButtonElement>('copy'),download=element<HTMLButtonElement>('download');
const board=document.getElementById('board') as unknown as SVGSVGElement;
let levelId:string|undefined;
let revision=0,layout:Layout|undefined,legacy='';
function invalidate(){revision++;layout=undefined;legacy='';copy.disabled=download.disabled=true;element<HTMLButtonElement>('apply').disabled=true;board.classList.add('stale');element('metrics').textContent='Нужно пересинтезировать';element('ast').textContent='';element('ir').textContent='';element('netlist').textContent='Исходный код изменён.';element('bindings').textContent='';element('manual').hidden=true;status.className='';status.textContent='Код изменён. Выполните синтез.';}
let stored:string|null=null;try{stored=localStorage.getItem('kohctpyktop-verilog-source');}catch{}
let needsTemplate=!stored;
const view=new EditorView({parent:element('editor'),doc:stored??'module root ();\n\nendmodule\n',extensions:[basicSetup,StreamLanguage.define(verilog),syntaxHighlighting(lampHighlight),EditorView.contentAttributes.of({'aria-label':'Исходный код Verilog'}),lampTheme,EditorView.updateListener.of(update=>{if(update.docChanged){invalidate();try{localStorage.setItem('kohctpyktop-verilog-source',update.state.doc.toString());}catch{}}})]});
const library=libraryManager(element('library-manager'),librarySources,invalidate);
async function compile(){
  invalidate();const current=revision;status.textContent='Синтез и разводка…';
  try{
    const ast=parseWithLibrary(view.state.doc.toString(),library.sources()),netlist=synthesize(ast,{optimize:true}),result=route(netlist);
    const code=await exportLegacy(result.board);if(current!==revision)return;
    layout=result;legacy=code;element('board-empty').hidden=true;renderBoard(board,result.board);board.classList.remove('stale');
    const nCount=netlist.transistors.filter(t=>t.type==='N').length;
    const pCount=netlist.transistors.length-nCount;
    element('metrics').textContent=`${result.area} клеток · N: ${nCount} · P: ${pCount}`;
    element('ast').textContent=JSON.stringify(ast,null,2);
    element('ir').textContent=JSON.stringify(netlist,null,2);
    element('netlist').textContent=netlist.transistors.map(t=>`${t.id} · ${t.type}-транзистор\n${t.source} ──[ ${t.id} ]── ${t.drain}\nЗатвор: ${t.gate}`).join('\n\n')
      + netlist.seriesGroups.map(group=>`\n\n${group.id}: ${group.transistors.join(' ↔ ')}\nПерестановка допустима при разводке.`).join('');
    element('netlist').textContent+=netlist.parallelGroups.map(group=>`\n\n${group.id}: ${group.transistors.join(' ∥ ')}\nПараллельные ветви: ${group.source} → ${group.drain}`).join('');
    element('netlist').textContent+=netlist.porChains.map(chain=>`\n\n${chain.instance}: POR, DEPTH=${chain.depth}\nVCC → ${chain.transistors.join(' → ')} → ${chain.output}\nЗатвор каждой ступени соединён с её входом. Перестановка запрещена.`).join('');
    element('netlist').textContent+=netlist.porChains.filter(c=>c.preOutput).map(c=>`\n${c.instance}.pre_out → ${c.preOutput}: на один такт раньше out.`).join('');
    element('netlist').textContent+=netlist.delayLines.map(c=>`\n\n${c.instance}: delay_line, DEPTH=${c.depth}\n${c.input} → ${c.transistors.join(' → ')} → ${c.output}\nЗадержка фронта: ${c.depth} тактов; спад без задержки.`).join('');
    element('netlist').textContent+=netlist.rsTriggers.map(c=>`\n\n${c.instance}: rs_trigger\nR: ${c.r}, S: ${c.s}, Q: ${c.output}\n${c.transistors.join(' / ')}`).join('');
    element('bindings').textContent=netlist.bindings.map(b=>`${b.name} · ${b.direction} · (${b.point.join(', ')})`).join('   /   ');
    copy.disabled=download.disabled=false;element<HTMLButtonElement>('apply').disabled=!levelId;status.className='success';status.textContent='Готово. Схему можно перенести в игру.';
    document.documentElement.dataset.ready='true';
  }catch(error){if(current!==revision)return;status.className='error';if(error instanceof Diagnostic){status.textContent=`${error.span.source?error.span.source.split('/').pop()+': ':''}Строка ${error.span.line}, столбец ${error.span.column}: ${error.message}`;if(!error.span.source)view.dispatch({selection:{anchor:Math.min(error.span.start,view.state.doc.length)}});}else status.textContent=error instanceof Error?error.message:String(error);}
}
element('compile').addEventListener('click',()=>void compile());
view.dom.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();void compile();}});
element('example').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:example}});void compile();});
element('example-and').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:andExample}});void compile();});
element('example-bus').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:busExample}});void compile();});
element('example-por').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:porExample} });void compile();});
element('example-modules').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:modulesExample} });void compile();});
element('example-mux').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:muxExample}});void compile();});
element('example-decoder').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:decoderExample}});void compile();});
element('example-adder').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:adderExample}});void compile();});
element('example-rs').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:rsExample} });void compile();});
element('example-edge').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:edgeExample} });void compile();});
element('example-delay').addEventListener('click',()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:delayExample} });void compile();});
copy.addEventListener('click',async()=>{if(!layout)return;const code=legacy;try{await navigator.clipboard.writeText(code);status.className='success';status.textContent='Код скопирован. В игре откройте «Сохранение» → «Вставить код».';}catch{element('manual').hidden=false;(element('manual') as HTMLDetailsElement).open=true;const area=element<HTMLTextAreaElement>('export-code');area.value=code;area.focus();area.select();status.textContent='Выделенный код можно скопировать вручную: Ctrl+C.';}});
download.addEventListener('click',()=>{if(!layout)return;const url=URL.createObjectURL(new Blob([encode(layout.board)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='root.kohctpyktop.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='kohctpyktop:level')return;
 levelId=event.data.levelId;
 if(typeof event.data.template==='string'&&(event.data.replace||needsTemplate)){needsTemplate=false;view.dispatch({changes:{from:0,to:view.state.doc.length,insert:event.data.template}});status.textContent='Контакты готовы. Добавьте свою схему и выполните синтез.';if(!board.hasChildNodes())element('metrics').textContent='Синтез ещё не выполнен';}
 element<HTMLButtonElement>('new-module').disabled=false;
 element<HTMLButtonElement>('apply').disabled=!layout||!levelId;
});
element('apply').addEventListener('click',()=>{if(layout&&levelId)parent.postMessage({type:'kohctpyktop:apply',levelId,board:encode(layout.board)},location.origin);});
element('new-module').addEventListener('click',()=>parent.postMessage({type:'kohctpyktop:template'},location.origin));
for(const button of Array.from(document.querySelectorAll('.examples-options button')))button.addEventListener('click',()=>{(button.closest('details') as HTMLDetailsElement).open=false;});
parent.postMessage({type:'kohctpyktop:ready'},location.origin);
status.textContent='Напишите код и выполните синтез. Шаблон содержит только контакты уровня.';
