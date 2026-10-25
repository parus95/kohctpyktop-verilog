export interface LibraryEntry {id:string;name:string;source:string;enabled:boolean}
export interface LibraryState {version:1;users:LibraryEntry[];enabledSystem:string[]}
const key='kohctpyktop-library-v1';
export function validateLibrary(value:unknown):LibraryState {
 const s=value as LibraryState;
 if(!s||s.version!==1||!Array.isArray(s.users)||!Array.isArray(s.enabledSystem)||!s.enabledSystem.every(x=>typeof x==='string'))throw Error('Неверный формат библиотеки');
 const ids=new Set<string>();
 for(const e of s.users){if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.name!=='string'||typeof e.source!=='string'||e.source.length>200000||typeof e.enabled!=='boolean')throw Error('Неверный модуль библиотеки');ids.add(e.id);}
 return s;
}
export function libraryManager(host:HTMLElement,system:Record<string,string>,changed:()=>void){
 let state:LibraryState={version:1,users:[],enabledSystem:[]};
 const node=<K extends keyof HTMLElementTagNameMap>(tag:K,cls='')=>{const el=document.createElement(tag);el.className=cls;return el;};
 const list=node('div','library-list'),form=node('div','library-editor'),message=node('p','library-message');message.setAttribute('role','status');
 const title=node('input'),source=node('textarea'),kind=node('span','library-kind');
 title.placeholder='Имя файла';title.setAttribute('aria-label','Имя файла');source.rows=12;source.setAttribute('aria-label','Код библиотечного модуля');source.spellcheck=false;
 let selected:string|undefined,systemSelected=false;
 const drafts=new Map<string,{name:string;source:string}>();
 const draftKey=()=>selected??'new';
 try{const raw=localStorage.getItem(key);if(raw)state=validateLibrary(JSON.parse(raw));}catch{message.textContent='Сохранённая библиотека не прочитана; экспортируйте данные перед очисткой браузера.';}
 const button=(label:string,fn:()=>void,cls='')=>{const b=node('button',cls);b.textContent=label;b.onclick=fn;return b;};
 const persist=()=>{try{localStorage.setItem(key,JSON.stringify(state));message.textContent='Библиотека сохранена.';}catch{message.textContent='Не удалось сохранить библиотеку. Экспортируйте её в файл.';}changed();render();};
 const keepDraft=()=>{if(!systemSelected)drafts.set(draftKey(),{name:title.value,source:source.value});};
 function select(id?:string,isSystem=false){
  keepDraft();selected=id;systemSelected=isSystem;
  const entry=state.users.find(e=>e.id===id),draft=!isSystem?drafts.get(draftKey()):undefined;
  title.value=isSystem?id!.split('/').pop()!:draft?.name??entry?.name??'module.v';
  source.value=isSystem?system[id!]:draft?.source??entry?.source??'module custom(input a, output z);\n\nendmodule\n';
  title.readOnly=source.readOnly=isSystem;save.hidden=isSystem;duplicate.hidden=!isSystem;remove.hidden=isSystem||!entry;
  kind.textContent=isSystem?'Системный · только чтение':'Пользовательский';kind.className='library-kind'+(isSystem?' readonly':'');render();
 }
 function render(){
  list.replaceChildren();
  const add=button('+',()=>select(), 'library-add');add.setAttribute('aria-label','Новый модуль');add.title='Новый модуль';list.append(add);
  const row=(id:string,name:string,isSystem:boolean,enabled:boolean)=>{
   const item=node('div','library-row'+(selected===id&&systemSelected===isSystem?' selected':'')+(enabled?'':' inactive'));
   const choose=button('',()=>select(id,isSystem),'library-select');choose.setAttribute('aria-pressed',String(selected===id&&systemSelected===isSystem));
   const nameEl=node('strong'),meta=node('small');nameEl.textContent=name;meta.textContent=isSystem?'Системный':'Пользовательский';choose.append(nameEl,meta);
   const toggle=node('input');toggle.type='checkbox';toggle.className='switch';toggle.checked=enabled;toggle.setAttribute('aria-label','Включить '+name);
   toggle.onchange=()=>{if(isSystem){state.enabledSystem=state.enabledSystem.filter(n=>n!==id);if(toggle.checked)state.enabledSystem.push(id);}else state.users.find(e=>e.id===id)!.enabled=toggle.checked;persist();};
   item.append(choose,toggle);list.append(item);
  };
  for(const name of Object.keys(system))row(name,name.split('/').pop()!,true,state.enabledSystem.includes(name));
  for(const e of state.users)row(e.id,e.name,false,e.enabled);
 }
 const save=button('Сохранить модуль',()=>{
  const name=title.value.trim();if(!name||!source.value.trim()){message.textContent='Укажите имя и код модуля.';return;}
  const old=state.users.find(e=>e.id===selected);
  if(old){old.name=name;old.source=source.value;}else{const e={id:crypto.randomUUID(),name,source:source.value,enabled:true};state.users.push(e);drafts.delete('new');selected=e.id;}
  drafts.delete(draftKey());remove.hidden=false;persist();
 },'library-save');
 const duplicate=button('Скопировать',()=>{
  const name=title.value,code=source.value;
  // A disabled copy cannot conflict with an enabled original until explicitly enabled.
  const entry={id:crypto.randomUUID(),name,source:code,enabled:false};state.users.push(entry);select(entry.id);persist();
 });
 const remove=button('Удалить модуль',()=>{const id=selected;state.users=state.users.filter(e=>e.id!==id);drafts.delete(id!);select();drafts.delete(id!);persist();});
 const head=node('div','library-file-head'),field=node('label');field.textContent='Имя файла';field.append(title);head.append(field,duplicate);
 const actions=node('div','library-actions');actions.append(save,remove);form.append(kind,head,source,actions);
 const file=node('input');file.type='file';file.accept='.json';file.hidden=true;
 file.onchange=async()=>{try{const picked=file.files?.[0];if(!picked)return;if(picked.size>2000000)throw Error('Файл слишком большой');state=validateLibrary(JSON.parse(await picked.text()));drafts.clear();selected=undefined;systemSelected=true;select();persist();}catch(e){message.textContent=String(e);}file.value='';};
 const transfers=node('div','library-actions library-transfers');
 transfers.append(button('Экспорт библиотеки',()=>{const a=node('a'),url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.href=url;a.download='kohctpyktop-library.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}),button('Импорт библиотеки',()=>file.click()));
 host.append(list,form,transfers,file,message);
 // No draft exists before the initial selection.
 systemSelected=true;
 const first=Object.keys(system)[0];select(first,!!first);
 return {sources:()=>Object.fromEntries([...Object.entries(system).filter(([name])=>state.enabledSystem.includes(name)),...state.users.filter(e=>e.enabled).map(e=>['user/'+e.id+'/'+e.name,e.source])]),enable:(names:string[])=>{for(const name of Object.keys(system))if(names.some(n=>name.endsWith('/'+n+'.v'))&&!state.enabledSystem.includes(name))state.enabledSystem.push(name);persist();}};
}
