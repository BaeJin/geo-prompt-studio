import {toCSV,valuesOf,migrateParameters as migrateStudio,loadIndependentTemplate as loadTemplate,bindParameter,requiredSlots,generateIndependent,appendPromptList,restoreWorkspace} from './engine.mjs?v=b1b3a27936bd';
import {sample} from './sample.mjs';
const $=id=>document.getElementById(id), uid=()=>crypto.randomUUID();
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='datacast-prompt-studio-v4', LEGACY='datacast-prompt-studio-v1';
let state=migrateStudio(sample()), rows=[],selected=new Set(),page=0,pendingRows=[],previewLimit=3,composer=null,draft=null,draftKind=null,timer,confirmAction;
state.combinations=[];
try{const saved=localStorage.getItem(STORAGE)||localStorage.getItem('datacast-prompt-studio-v3')||localStorage.getItem('datacast-prompt-studio-v2')||localStorage.getItem(LEGACY);if(saved)state=migrateStudio(JSON.parse(saved));const workspace=restoreWorkspace(state);composer=workspace.composer;rows=workspace.rows;selected=new Set(rows.map(r=>r.number));}
catch{setTimeout(()=>toast('저장된 설정을 읽지 못했습니다. 원본은 그대로 두고 샘플 라이브러리를 열었습니다.'),100);}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,4500);}
function persist(){state.workspace={version:1,composer,rows};try{localStorage.setItem(STORAGE,JSON.stringify(state));$('save-state').textContent='브라우저에 저장됨';}catch{$('save-state').textContent='자동 저장 불가 · 설정을 내보내세요';}}
function confirm(title,description,fn){$('confirm-title').textContent=title;$('confirm-description').textContent=description;confirmAction=fn;$('confirm-dialog').showModal();}
$('cancel-confirm').onclick=()=>$('confirm-dialog').close();$('accept-confirm').onclick=()=>{$('confirm-dialog').close();confirmAction?.();};
function navigate(view){
  if(!['templates','parameters','compose'].includes(view))view='templates';
  $('library-view').hidden=view==='compose';
  for(const name of ['templates','parameters','compose']){const active=name===view;$(name+'-view').hidden=!active;$(name+'-nav').classList.toggle('active',active);active?$(name+'-nav').setAttribute('aria-current','page'):$(name+'-nav').removeAttribute('aria-current');}
  if(location.hash!=='#'+view)location.hash=view;
}
document.querySelector('.skip-link').onclick=e=>{e.preventDefault();$('main-content').focus();};
for(const name of ['templates','parameters','compose'])$(name+'-nav').onclick=()=>navigate(name);
window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
function renderLibrary(){
  const {templateSets,parameters}=state.library;
  $('template-badge').textContent=templateSets.length;$('parameter-badge').textContent=parameters.length;
  const actions=(kind,id)=>`<button class="quiet small" data-library="${kind}" data-id="${esc(id)}" data-action="edit">수정</button><button class="quiet small" data-library="${kind}" data-id="${esc(id)}" data-action="delete">삭제</button>`;
  const name=(kind,item)=>`<button class="name-button" data-library="${kind}" data-id="${esc(item.id)}" data-action="edit">${esc(item.name)}</button>`;
  const tq=$('template-search').value.trim().toLocaleLowerCase(),pq=$('parameter-search').value.trim().toLocaleLowerCase();
  $('template-library').innerHTML=templateSets.filter(t=>[t.name,...t.templates.map(v=>v.text)].join(' ').toLocaleLowerCase().includes(tq)).map(t=>`<tr><td>${name('templates',t)}</td><td><span class="library-excerpt">${esc(t.templates[0]?.text)}</span></td><td>${t.templates.length}</td><td>${actions('templates',t.id)}</td></tr>`).join('')||`<tr><td colspan="4"><div class="empty-hint">${tq?'검색 결과가 없습니다.':'등록된 템플릿이 없습니다.'}</div></td></tr>`;
  $('parameter-library').innerHTML=parameters.filter(p=>[p.name,p.values].join(' ').toLocaleLowerCase().includes(pq)).map(p=>`<tr><td>${name('parameters',p)}</td><td><span class="library-excerpt">${esc(valuesOf(p.values).join(', '))}</span></td><td>${valuesOf(p.values).length}</td><td>${actions('parameters',p.id)}</td></tr>`).join('')||`<tr><td colspan="4"><div class="empty-hint">${pq?'검색 결과가 없습니다.':'등록된 파라미터가 없습니다.'}</div></td></tr>`;
  renderTemplatePicker();
}
$('template-search').oninput=$('parameter-search').oninput=renderLibrary;
function renderTemplatePicker(){
  const options=state.library.templateSets.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`);
  if(composer&&!state.library.templateSets.some(t=>t.id===composer.templateSet.id))options.push(`<option value="${esc(composer.templateSet.id)}">${esc(composer.templateSet.name)} (사본)</option>`);
  $('template-picker').innerHTML='<option value="">템플릿 선택</option>'+options.join('');
  $('template-picker').value=composer?.templateSet.id||'';
}
$('template-picker').onchange=e=>{
  if(e.target.value){const next={...state,combinations:[]};loadTemplate(next,e.target.value,uid());composer=next.combinations[0];}else composer=null;
  invalidatePreview();persist();renderComposer();
};
function libraryArray(kind){return state.library[kind==='templates'?'templateSets':'parameters'];}
function openEditor(kind,id){
  draftKind=kind;const existing=libraryArray(kind).find(v=>v.id===id);
  draft=existing?structuredClone(existing):kind==='templates'?{id:uid(),name:'',templates:[{id:uid(),name:'질문 1',text:''}]}:{id:uid(),name:'',values:''};
  $('editor-title').textContent=(kind==='templates'?'템플릿':'파라미터')+(existing?' 수정':' 추가');$('draft-name').value=draft.name;
  $('draft-help').textContent=kind==='templates'?'변수는 {Country}, {Model} 형식으로 입력하세요.':'';
  $('add-draft-item').hidden=kind!=='templates';$('add-draft-item').textContent='문장 추가';$('draft-name').previousElementSibling.textContent=kind==='templates'?'템플릿 이름':'파라미터 이름';$('draft-error').hidden=true;renderDraft();$('library-editor').showModal();$('draft-name').focus();
}
function renderDraft(){
  $('draft-items').innerHTML=draftKind==='templates'?draft.templates.map((t,i)=>`<div class="draft-block"><div class="draft-title"><label class="field-label" for="draft-label-${i}">질문 ${i+1} 이름</label><button type="button" class="quiet small" data-remove="${i}">삭제</button></div><input id="draft-label-${i}" class="text-input" data-field="name" data-index="${i}" value="${esc(t.name)}" maxlength="200"><label class="field-label" for="draft-text-${i}">질문 문장</label><textarea id="draft-text-${i}" data-field="text" data-index="${i}" maxlength="16000" placeholder="What is the best {Category} in {Country}?">${esc(t.text)}</textarea></div>`).join(''):`<div class="draft-block"><label class="field-label" for="draft-values">값 목록 · 한 줄에 하나</label><textarea id="draft-values" data-field="values" maxlength="50000" placeholder="Australia
Korea">${esc(draft.values)}</textarea></div>`;

}
$('draft-name').oninput=e=>draft.name=e.target.value;
$('draft-items').oninput=e=>{if(e.target.dataset.field){if(draftKind==='templates')draft.templates[e.target.dataset.index][e.target.dataset.field]=e.target.value;else draft.values=e.target.value;}};
$('draft-items').onclick=e=>{const button=e.target.closest('[data-remove]');if(button){draft.templates.splice(Number(button.dataset.remove),1);renderDraft();}};
$('add-draft-item').onclick=()=>{if(draft.templates.length>=100)return toast('질문은 100개까지 가능합니다.');draft.templates.push({id:uid(),name:'질문 '+(draft.templates.length+1),text:''});renderDraft();};
$('close-editor').onclick=$('cancel-editor').onclick=()=>$('library-editor').close();
$('library-form').onsubmit=e=>{
  e.preventDefault();
  try{
    if(!draft.name.trim())throw Error('이름을 입력하세요.');
    if(draftKind==='templates'){
      if(!draft.templates.length||draft.templates.some(t=>!t.name.trim()||!t.text.trim()))throw Error('질문 이름과 문장을 하나 이상 입력하세요.');
      if(draft.templates.some(t=>/[{}]/.test(t.text.replace(/\{[^{}]+\}/g,''))||/\{\s*\}/.test(t.text)))throw Error('빈칸 표기는 {이름} 형식으로 입력하세요.');
    }else{
      if(!valuesOf(draft.values).length)throw Error('값을 한 개 이상 입력하세요.');
    }
    const list=libraryArray(draftKind),index=list.findIndex(v=>v.id===draft.id);
    if(index<0&&list.length>=(draftKind==='templates'?50:1500))throw Error('라이브러리의 최대 항목 수에 도달했습니다.');
    index<0?list.push(structuredClone(draft)):list.splice(index,1,structuredClone(draft));
    persist();renderLibrary();renderComposer();$('library-editor').close();toast('저장했습니다.');
  }catch(error){$('draft-error').hidden=false;$('draft-error').textContent=error.message;}
};
$('add-template-set').onclick=()=>openEditor('templates');$('add-parameter-set').onclick=()=>openEditor('parameters');
$('library-view').onclick=e=>{
  const el=e.target.closest('[data-library]');if(!el)return;const {library,id,action}=el.dataset;
  if(action==='edit')openEditor(library,id);
  if(action==='delete')confirm('라이브러리에서 삭제할까요?','이미 불러온 조합은 보존됩니다.',()=>{const list=libraryArray(library),i=list.findIndex(v=>v.id===id);if(i>=0)list.splice(i,1);persist();renderLibrary();renderComposer();});
};
function invalidatePreview(){pendingRows=[];$('generated-preview').hidden=true;$('errors').hidden=true;}
function renderComposer(){
  const c=composer;
  renderTemplatePicker();
  $('template-text').innerHTML=c?c.templateSet.templates.filter(t=>t.enabled).map(t=>`<p>${esc(t.text)}</p>`).join(''):'';
  $('parameter-choices').innerHTML=c?requiredSlots(c.templateSet).map((slot,i)=>{
    const p=c.bindings.find(b=>b.slot===slot)?.parameter,original=state.library.parameters.find(v=>v.id===p?.id),changed=p&&original&&(p.name!==original.name||p.values!==original.values);
    return `<div class="parameter-choice" data-slot="${esc(slot)}"><label class="field-label" for="parameter-${i}">{${esc(slot)}}</label><select id="parameter-${i}" data-slot="${esc(slot)}" aria-label="${esc(slot)} 파라미터"><option value="">파라미터 선택</option>${p&&!original?`<option value="${esc(p.id)}" selected>${esc(p.name)} (사본)</option>`:''}${state.library.parameters.map(v=>`<option value="${esc(v.id)}" ${p?.id===v.id?'selected':''}>${esc(v.name)}</option>`).join('')}</select>${p?`<div class="parameter-detail"><span>${esc(p.values.trim().split(/\r?\n/).slice(0,3).join(', '))}${p.values.trim().split(/\r?\n/).length>3?' …':''}</span>${changed?'<button class="quiet small" data-refresh>업데이트</button>':''}</div>`:''}</div>`;
  }).join(''):'';
  $('parameter-choices').hidden=!c||!requiredSlots(c.templateSet).length;
  $('compose-options').hidden=!c||requiredSlots(c.templateSet).length<2;
  $('compose-mode').value=c?.mode||'product';
  $('generate').disabled=!c;
}
$('parameter-choices').onchange=e=>{
  const slot=e.target.dataset.slot;if(!slot||!composer)return;
  try{if(e.target.value)bindParameter({...state,combinations:[composer]},composer.id,slot,e.target.value);else composer.bindings=composer.bindings.filter(b=>b.slot!==slot);
    invalidatePreview();persist();renderComposer();
    for(const el of $('parameter-choices').querySelectorAll('select'))if(el.dataset.slot===slot)el.focus({preventScroll:true});
  }catch(error){toast(error.message);}
};
$('parameter-choices').onclick=e=>{
  if(!e.target.closest('[data-refresh]'))return;
  const slot=e.target.closest('[data-slot]').dataset.slot;
  bindParameter({...state,combinations:[composer]},composer.id,slot,composer.bindings.find(b=>b.slot===slot).parameter.id);
  invalidatePreview();persist();renderComposer();
};
$('compose-mode').onchange=e=>{if(composer){composer.mode=e.target.value;invalidatePreview();persist();}};
function renderPending(){
  $('generated-preview').hidden=!pendingRows.length;
  if(!pendingRows.length)return;
  const existing=new Set(rows.map(r=>r.prompt_text)),duplicateCount=pendingRows.filter(r=>existing.has(r.prompt_text)).length;
  const newCount=pendingRows.length-duplicateCount;
  $('generated-count').textContent=pendingRows.length+'개';
  $('generated-summary').textContent=duplicateCount?`신규 ${newCount}개 · 중복 ${duplicateCount}개 제외`:`신규 ${newCount}개`;
  $('generated-rows').innerHTML=pendingRows.slice(0,previewLimit).map(r=>`<li>${esc(r.prompt_text)}</li>`).join('');
  $('preview-more').hidden=previewLimit>=pendingRows.length;
  $('preview-more').textContent=`더 보기 (${Math.min(previewLimit,pendingRows.length)}/${pendingRows.length})`;
  $('add-to-list').disabled=!newCount;
  $('add-to-list').textContent=newCount?`목록에 추가 (${newCount})`:'모두 목록에 있음';
}
$('preview-more').onclick=()=>{previewLimit+=30;renderPending();};
$('generate').onclick=()=>{
  let result;try{
    const missing=composer?requiredSlots(composer.templateSet).filter(slot=>!composer.bindings.some(b=>b.slot===slot)):[];
    if(missing.length)throw Error(missing.map(slot=>`{${slot}}`).join(', ')+' 파라미터를 선택하세요.');
    result=generateIndependent({...state,combinations:composer?[composer]:[],dedupe:true});
  }catch(error){result={rows:[],errors:[error.message]};}
  pendingRows=result.rows;previewLimit=3;
  $('errors').hidden=!result.errors.length;
  $('errors').innerHTML='<ul>'+result.errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>';
  renderPending();
};
$('add-to-list').onclick=()=>{
  try{
    const result=appendPromptList(rows,pendingRows);
    rows=result.rows;selected=new Set(rows.map(r=>r.number));page=0;$('search').value='';
    pendingRows=[];persist();renderResults();renderPending();
    toast(`${result.added}개 추가${result.duplicates?' · 중복 '+result.duplicates+'개 제외':''}`);
  }catch(error){toast(error.message);}
};
$('remove-selected').onclick=()=>{
  if(!selected.size)return;
  const removing=new Set(selected);
  confirm(`${removing.size}개 프롬프트를 삭제할까요?`,'목록에서 선택한 프롬프트를 삭제합니다.',()=>{
    rows=rows.filter(r=>!removing.has(r.number)).map((r,i)=>({...r,number:i+1}));selected.clear();persist();renderResults();renderPending();
  });
};
function renderResults(){$('preview-count').textContent=rows.length.toLocaleString('ko-KR');const q=$('search').value.toLocaleLowerCase(),filtered=rows.filter(r=>[r.prompt_text,r.template_set,r.parameter_set].some(v=>v.toLocaleLowerCase().includes(q)));page=Math.min(page,Math.max(0,Math.ceil(filtered.length/30)-1));$('results').innerHTML=filtered.slice(page*30,page*30+30).map(r=>`<div class="result-row"><label class="result-index"><input type="checkbox" data-result="${r.number}" aria-label="질문 ${r.number} 선택" ${selected.has(r.number)?'checked':''}><span>${String(r.number).padStart(2,'0')}</span></label><div><p class="prompt-text">${esc(r.prompt_text)}</p><p class="provenance"><span>${esc(r.template_name)}</span><span>${esc(r.parameter_set)}</span></p></div></div>`).join('')||`<div class="empty-hint">${rows.length?'검색 결과가 없습니다.':'목록에 추가된 프롬프트가 없습니다.'}</div>`;$('page-info').textContent=filtered.length?`${page*30+1}–${Math.min((page+1)*30,filtered.length)} / ${filtered.length}개`:'0개';$('previous').disabled=page===0;$('next').disabled=(page+1)*30>=filtered.length;updateSelection();}
function updateSelection(){$('selection-count').textContent=selected.size+'개 선택';$('export').disabled=!rows.length;$('remove-selected').disabled=!selected.size;$('export').textContent=selected.size&&selected.size<rows.length?`선택 CSV (${selected.size})`:'CSV 다운로드';$('select-all').textContent=rows.length&&selected.size===rows.length?'전체 해제':'전체 선택';}
$('results').onchange=e=>{if(e.target.dataset.result){const n=Number(e.target.dataset.result);e.target.checked?selected.add(n):selected.delete(n);updateSelection();}};$('select-all').onclick=()=>{selected=selected.size===rows.length?new Set():new Set(rows.map(r=>r.number));renderResults();};$('search').oninput=()=>{page=0;renderResults();};$('previous').onclick=()=>{page--;renderResults();$('results').scrollTop=0;};$('next').onclick=()=>{page++;renderResults();$('results').scrollTop=0;};
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const date=()=>new Date().toLocaleDateString('sv-SE');
$('export').onclick=()=>{const out=selected.size?rows.filter(r=>selected.has(r.number)):rows;if(out.length){download(toCSV(out),'geo-prompts-'+date()+'.csv','text/csv;charset=utf-8');toast(out.length+'개 질문을 CSV로 내려받았습니다.');}};
$('save-config').onclick=()=>{state.workspace={version:1,composer,rows};download(JSON.stringify(state,null,2),'geo-prompt-settings-'+date()+'.json','application/json;charset=utf-8');};$('load-config').onclick=()=>$('config-file').click();
$('config-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>20000000)throw Error('설정 파일은 20MB 이하로 선택하세요.');const imported=migrateStudio(JSON.parse(await file.text())),workspace=restoreWorkspace(imported);confirm('설정을 가져올까요?','라이브러리, 현재 선택과 프롬프트 목록을 파일의 내용으로 교체합니다.',()=>{state=imported;composer=workspace.composer;rows=workspace.rows;selected=new Set(rows.map(r=>r.number));invalidatePreview();persist();renderLibrary();renderComposer();renderResults();toast('설정을 가져왔습니다.');});}catch(error){toast('가져오기 실패: '+error.message);}finally{e.target.value='';}};
renderLibrary();renderComposer();renderResults();navigate(location.hash.slice(1));
