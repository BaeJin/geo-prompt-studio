import {toCSV,valuesOf,migrateParameters as migrateStudio,loadIndependentTemplate as loadTemplate,bindParameter,requiredSlots,generateIndependent} from './engine.mjs';
import {sample} from './sample.mjs';
const $=id=>document.getElementById(id), uid=()=>crypto.randomUUID();
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORAGE='datacast-prompt-studio-v3', LEGACY='datacast-prompt-studio-v1';
let state=migrateStudio(sample()), rows=[],selected=new Set(),page=0,dirty=true,draft=null,draftKind=null,timer,confirmAction;
state.combinations=[];
try{const saved=localStorage.getItem(STORAGE)||localStorage.getItem('datacast-prompt-studio-v2')||localStorage.getItem(LEGACY);if(saved)state=migrateStudio(JSON.parse(saved));}
catch{setTimeout(()=>toast('저장된 설정을 읽지 못했습니다. 원본은 그대로 두고 샘플 라이브러리를 열었습니다.'),100);}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,4500);}
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(state));$('save-state').textContent='브라우저에 저장됨';}catch{$('save-state').textContent='자동 저장 불가 · 설정을 내보내세요';}}
function confirm(title,description,fn){$('confirm-title').textContent=title;$('confirm-description').textContent=description;confirmAction=fn;$('confirm-dialog').showModal();}
$('cancel-confirm').onclick=()=>$('confirm-dialog').close();$('accept-confirm').onclick=()=>{$('confirm-dialog').close();confirmAction?.();};
function navigate(view){
  if(!['templates','parameters','compose'].includes(view))view='templates';
  $('library-view').hidden=view==='compose';
  for(const name of ['templates','parameters','compose']){const active=name===view;$(name+'-view').hidden=!active;$(name+'-nav').classList.toggle('active',active);active?$(name+'-nav').setAttribute('aria-current','page'):$(name+'-nav').removeAttribute('aria-current');}
  if(location.hash!=='#'+view)location.hash=view;
}
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
  const current=$('template-picker').value;
  $('template-picker').innerHTML='<option value="">템플릿 선택</option>'+templateSets.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  if(templateSets.some(t=>t.id===current))$('template-picker').value=current;
  $('load-template').disabled=!$('template-picker').value;
}
$('template-search').oninput=$('parameter-search').oninput=renderLibrary;
$('template-picker').onchange=()=>{$('load-template').disabled=!$('template-picker').value;};
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
    persist();renderLibrary();renderCombinations();$('library-editor').close();toast('저장했습니다.');
  }catch(error){$('draft-error').hidden=false;$('draft-error').textContent=error.message;}
};
$('add-template-set').onclick=()=>openEditor('templates');$('add-parameter-set').onclick=()=>openEditor('parameters');
$('library-view').onclick=e=>{
  const el=e.target.closest('[data-library]');if(!el)return;const {library,id,action}=el.dataset;
  if(action==='edit')openEditor(library,id);
  if(action==='delete')confirm('라이브러리에서 삭제할까요?','이미 불러온 조합은 보존됩니다.',()=>{const list=libraryArray(library),i=list.findIndex(v=>v.id===id);if(i>=0)list.splice(i,1);persist();renderLibrary();renderCombinations();});
};
function markDirty(){dirty=true;persist();$('result-state').textContent='조합 변경됨';$('result-state').classList.add('dirty');$('result-summary').textContent='변경 사항을 반영하려면 다시 생성하세요.';$('export').disabled=true;}
let expandedCombo=state.combinations[0]?.id;
function renderCombinations(){
  const focused=document.activeElement,focusKey=focused?.dataset.kind?{combo:focused.closest('[data-combo]')?.dataset.combo,slot:focused.closest('[data-slot]')?.dataset.slot,kind:focused.dataset.kind,index:focused.dataset.index}:null;
  $('combination-count').textContent=state.combinations.length;$('dedupe').checked=state.dedupe;
  $('clear-combinations').disabled=!state.combinations.length;
  $('combination-list').innerHTML=state.combinations.map(c=>{
    const slots=requiredSlots(c.templateSet),missing=slots.filter(slot=>!c.bindings.some(b=>b.slot===slot)).length;
    return `<details class="combination-card" data-combo="${esc(c.id)}" ${expandedCombo===c.id?'open':''}><summary class="combo-heading"><strong>${esc(c.templateSet.name)}</strong><span class="combo-status ${missing?'missing':''}">${!c.enabled?'제외됨':missing?missing+'개 미연결':c.templateSet.templates.filter(t=>t.enabled).length+'개 문장'}</span></summary><div class="combo-body"><div class="combo-controls"><label class="check"><input type="checkbox" data-kind="combo-enabled" ${c.enabled?'checked':''}>생성에 포함</label><button class="quiet small" data-action="remove-combo">제거</button></div><div class="loaded-templates">${c.templateSet.templates.map((t,j)=>`<label class="loaded-question"><input type="checkbox" data-kind="template-enabled" data-index="${j}" ${t.enabled?'checked':''}><span>${c.templateSet.templates.length>1?`<b>${esc(t.name)}</b>`:''}<span>${esc(t.text)}</span></span></label>`).join('')}</div>${slots.length?'<div class="binding-heading"><span>변수</span><span>파라미터</span></div>':''}${slots.map(slot=>{
      const binding=c.bindings.find(b=>b.slot===slot),p=binding?.parameter,original=state.library.parameters.find(v=>v.id===p?.id),changed=p&&original&&(p.name!==original.name||p.values!==original.values);
      return `<div class="slot-binding" data-slot="${esc(slot)}"><label class="field-label" for="bind-${esc(c.id)}-${esc(slot)}">{${esc(slot)}}</label><select id="bind-${esc(c.id)}-${esc(slot)}" data-kind="bind" aria-label="${esc(c.templateSet.name)}의 ${esc(slot)} 파라미터"><option value="">선택</option>${p&&!original?`<option value="${esc(p.id)}" selected>${esc(p.name)} (사본)</option>`:''}${state.library.parameters.map(v=>`<option value="${esc(v.id)}" ${p?.id===v.id?'selected':''}>${esc(v.name)}${changed&&v.id===p.id?' (원본 변경됨)':''}</option>`).join('')}</select>${p?`<div class="binding-detail"><span>${valuesOf(p.values).length}개 · ${esc(valuesOf(p.values).slice(0,2).join(', '))}${valuesOf(p.values).length>2?' …':''}</span>${changed?'<button class="quiet" data-action="refresh-binding">업데이트</button>':''}</div>`:''}</div>`;
    }).join('')}<label class="mode-label">조합 방식<select data-kind="mode" aria-label="${esc(c.templateSet.name)} 조합 방식"><option value="product" ${c.mode==='product'?'selected':''}>전체 조합</option><option value="zip" ${c.mode==='zip'?'selected':''}>행별 매칭</option></select></label>${c.mode==='zip'?'<p class="hint">같은 줄끼리 연결 · 값 1개는 공통 적용</p>':''}</div></details>`;
  }).join('')||'<div class="empty-hint">템플릿을 선택해 추가하세요.</div>';
  if(focusKey){for(const control of $('combination-list').querySelectorAll('[data-kind]'))if(control.closest('[data-combo]')?.dataset.combo===focusKey.combo&&control.dataset.kind===focusKey.kind&&control.dataset.index===focusKey.index&&control.closest('[data-slot]')?.dataset.slot===focusKey.slot){control.focus({preventScroll:true});break;}}
  for(const detail of $('combination-list').querySelectorAll('details'))detail.addEventListener('toggle',()=>{if(detail.open){expandedCombo=detail.dataset.combo;for(const other of $('combination-list').querySelectorAll('details'))if(other!==detail)other.open=false;}else if(expandedCombo===detail.dataset.combo)expandedCombo=null;});
}
$('load-template').onclick=()=>{try{const id=uid();loadTemplate(state,$('template-picker').value,id);expandedCombo=id;markDirty();renderCombinations();$('combination-list').scrollTop=$('combination-list').scrollHeight;}catch(e){toast(e.message);}};
$('combination-list').onclick=e=>{const el=e.target.closest('[data-action]');if(!el)return;const id=el.closest('[data-combo]').dataset.combo,c=state.combinations.find(c=>c.id===id);try{if(el.dataset.action==='remove-combo')state.combinations=state.combinations.filter(v=>v.id!==id);if(el.dataset.action==='refresh-binding'){const slot=el.closest('[data-slot]').dataset.slot;bindParameter(state,id,slot,c.bindings.find(b=>b.slot===slot).parameter.id);}markDirty();renderCombinations();}catch(error){toast(error.message);}};
$('combination-list').onchange=e=>{const el=e.target,{kind,index}=el.dataset;if(!kind)return;const c=state.combinations.find(c=>c.id===el.closest('[data-combo]').dataset.combo);try{if(kind==='combo-enabled')c.enabled=el.checked;if(kind==='template-enabled')c.templateSet.templates[index].enabled=el.checked;if(kind==='mode')c.mode=el.value;if(kind==='bind'){const slot=el.closest('[data-slot]').dataset.slot;if(el.value)bindParameter(state,c.id,slot,el.value);else c.bindings=c.bindings.filter(b=>b.slot!==slot);}markDirty();renderCombinations();}catch(error){toast(error.message);}};
$('dedupe').onchange=e=>{state.dedupe=e.target.checked;markDirty();};
$('clear-combinations').onclick=()=>confirm('이번 조합을 비울까요?','라이브러리에 저장한 템플릿과 파라미터는 그대로 남습니다.',()=>{state.combinations=[];markDirty();renderCombinations();rows=[];selected.clear();renderResults();$('preview-count').textContent='0';});
$('sample-combinations').onclick=()=>confirm('샘플 조합을 불러올까요?','이번 조합을 호주·영어 29개 질문 샘플로 바꿉니다. 내 라이브러리는 유지됩니다.',()=>{state.combinations=migrateStudio(sample()).combinations;expandedCombo=state.combinations[0]?.id;state.dedupe=true;markDirty();renderCombinations();run();toast('29개 샘플 질문을 생성했습니다.');});
function run(){let result;try{result=state.combinations.length?generateIndependent(state):{rows:[],errors:['템플릿을 추가하고 파라미터를 선택하세요.'],total:0,duplicates:0};}catch(e){result={rows:[],errors:[e.message],total:0,duplicates:0};}rows=result.rows;selected=new Set(rows.map(r=>r.number));page=0;dirty=false;$('errors').hidden=!result.errors.length;$('errors').innerHTML='<ul>'+result.errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>';$('result-state').classList.toggle('dirty',!!result.errors.length);$('result-state').textContent=result.errors.length?'조합 확인 필요':'생성 완료';$('preview-count').textContent=rows.length.toLocaleString('ko-KR');$('result-summary').textContent=result.errors.length?'연결한 파라미터와 조합 방식을 확인하세요.':`${result.total}개 조합 → ${rows.length}개 질문${result.duplicates?' · 동일 문장 '+result.duplicates+'개 '+(state.dedupe?'제외':'포함'):''}`;renderResults();}
function renderResults(){const q=$('search').value.toLocaleLowerCase(),filtered=rows.filter(r=>[r.prompt_text,r.template_set,r.parameter_set].some(v=>v.toLocaleLowerCase().includes(q)));page=Math.min(page,Math.max(0,Math.ceil(filtered.length/30)-1));$('results').innerHTML=filtered.slice(page*30,page*30+30).map(r=>`<div class="result-row"><label class="result-index"><input type="checkbox" data-result="${r.number}" aria-label="질문 ${r.number} 선택" ${selected.has(r.number)?'checked':''}><span>${String(r.number).padStart(2,'0')}</span></label><div><p class="prompt-text">${esc(r.prompt_text)}</p><p class="provenance"><span>${esc(r.template_name)}</span><span>${esc(r.parameter_set)}</span></p></div></div>`).join('')||`<div class="empty-hint">${rows.length?'검색 결과가 없습니다.':'생성 결과가 없습니다.'}</div>`;$('page-info').textContent=filtered.length?`${page*30+1}–${Math.min((page+1)*30,filtered.length)} / ${filtered.length}개`:'0개';$('previous').disabled=page===0;$('next').disabled=(page+1)*30>=filtered.length;updateSelection();}
function updateSelection(){$('selection-count').textContent=selected.size+'개 선택';$('export').disabled=dirty||!selected.size;$('select-all').textContent=rows.length&&selected.size===rows.length?'전체 해제':'전체 선택';}
$('results').onchange=e=>{if(e.target.dataset.result){const n=Number(e.target.dataset.result);e.target.checked?selected.add(n):selected.delete(n);updateSelection();}};$('select-all').onclick=()=>{selected=selected.size===rows.length?new Set():new Set(rows.map(r=>r.number));renderResults();};$('search').oninput=()=>{page=0;renderResults();};$('previous').onclick=()=>{page--;renderResults();$('results').scrollTop=0;};$('next').onclick=()=>{page++;renderResults();$('results').scrollTop=0;};$('generate').onclick=()=>{run();toast(rows.length?rows.length+'개 프롬프트를 생성했습니다.':'조합 내용을 확인하세요.');};
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const date=()=>new Date().toLocaleDateString('sv-SE');
$('export').onclick=()=>{if(dirty)return;const out=rows.filter(r=>selected.has(r.number));if(out.length){download(toCSV(out),'geo-prompts-'+date()+'.csv','text/csv;charset=utf-8');toast(out.length+'개 질문을 CSV로 내려받았습니다.');}};
$('save-config').onclick=()=>download(JSON.stringify(state,null,2),'geo-prompt-settings-'+date()+'.json','application/json;charset=utf-8');$('load-config').onclick=()=>$('config-file').click();
$('config-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw Error('설정 파일은 1MB 이하로 선택하세요.');const imported=migrateStudio(JSON.parse(await file.text()));confirm('설정을 가져올까요?','라이브러리와 이번 조합을 파일의 내용으로 교체합니다. 기존 형식도 불러올 수 있습니다.',()=>{state=imported;persist();renderLibrary();renderCombinations();rows=[];selected.clear();markDirty();$('preview-count').textContent='0';renderResults();toast('라이브러리와 조합을 가져왔습니다.');});}catch(error){toast('가져오기 실패: '+error.message);}finally{e.target.value='';}};
renderLibrary();renderCombinations();renderResults();navigate(location.hash.slice(1));
