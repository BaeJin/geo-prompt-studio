import {generate, toCSV, validateConfig, valuesOf} from './engine.mjs';
import {sample} from './sample.mjs';
const $ = id => document.getElementById(id);
const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => crypto.randomUUID();
const STORAGE = 'datacast-prompt-studio-v1';
let config = sample(), rows = [], selected = new Set(), dirty = false, page = 0, tab = 'parameters';
let timer, confirmAction;
try { const saved = localStorage.getItem(STORAGE); if (saved) config = validateConfig(JSON.parse(saved)); }
catch { setTimeout(() => toast('저장된 설정을 읽지 못해 샘플을 열었습니다. 원본 저장값은 변경 전까지 유지됩니다.'), 100); }
$('dedupe').checked = config.dedupe !== false;

function toast(text) { $('toast').textContent = text; $('toast').hidden = false; clearTimeout(timer); timer = setTimeout(() => $('toast').hidden = true, 4500); }
function persist() {
  try { localStorage.setItem(STORAGE, JSON.stringify(config)); $('save-state').textContent = '이 브라우저에 저장됨'; }
  catch { $('save-state').textContent = '자동 저장 불가 · 설정 파일로 저장하세요'; }
}
function confirm(title, description, action) {
  $('confirm-title').textContent = title; $('confirm-description').textContent = description;
  confirmAction = action; $('confirm-dialog').showModal();
}
$('cancel-confirm').onclick = () => $('confirm-dialog').close();
$('accept-confirm').onclick = () => { $('confirm-dialog').close(); confirmAction?.(); };
function counts() {
  $('parameter-count').textContent = $('parameter-badge').textContent = config.parameterSets.length;
  $('template-count').textContent = config.templateSets.filter(s => s.enabled).reduce((n,s) => n+s.templates.filter(t => t.enabled).length,0);
  $('template-badge').textContent = config.templateSets.length;
}
function markDirty() {
  dirty = true; config.dedupe = $('dedupe').checked; persist(); counts(); $('result-state').textContent = '변경사항 있음'; $('result-state').classList.add('dirty');
  $('result-summary').textContent = '입력이 변경됐습니다. 프롬프트 생성 버튼을 눌러 결과를 갱신하세요.';
  $('export').disabled = true; $('result-count').textContent = '—';
}
function openIds() { return new Set([...document.querySelectorAll('details[open]')].map(el => el.dataset.id)); }
function renderEditors(open = openIds()) {
  $('parameter-list').innerHTML = config.parameterSets.map((s,i) => `<details class="set-card" data-id="${esc(s.id)}" ${open.has(s.id)?'open':''}>
    <summary><strong>${esc(s.name || '이름 없는 세트')}</strong><span class="set-meta">${s.params.length}개 변수 · ${s.mode==='zip'?'행별 매칭':'전체 조합'}</span></summary>
    <div class="set-body"><label class="field-label" for="pn-${i}">세트 이름</label><div class="set-name-row"><input id="pn-${i}" class="text-input" data-kind="p-name" data-set="${i}" value="${esc(s.name)}" maxlength="200"><button class="icon-delete" data-action="delete-p" data-set="${i}" aria-label="파라미터 세트 삭제">삭제</button></div>
    <div class="mode-row"><select data-kind="mode" data-set="${i}" aria-label="${esc(s.name)} 조합 방식"><option value="product" ${s.mode==='product'?'selected':''}>전체 조합</option><option value="zip" ${s.mode==='zip'?'selected':''}>행별 매칭</option></select><p class="hint">${s.mode==='zip'?'같은 줄의 값끼리 연결합니다. 값이 1개면 모든 행에 공통 적용합니다.':'템플릿에 쓰인 값의 모든 조합을 만듭니다. 쓰이지 않은 변수는 제외됩니다.'}</p></div>
    ${s.params.map((p,j) => `<div class="param-row"><div><label class="field-label" for="pk-${i}-${j}">파라미터 이름</label><input class="text-input" id="pk-${i}-${j}" data-kind="key" data-set="${i}" data-index="${j}" value="${esc(p.key)}" placeholder="Country" maxlength="100"></div><div><label class="field-label" for="pv-${i}-${j}">값 · 한 줄에 하나</label><textarea id="pv-${i}-${j}" data-kind="values" data-set="${i}" data-index="${j}" maxlength="50000" spellcheck="false">${esc(p.values)}</textarea><span class="param-count">${valuesOf(p.values).length}개 고유 값</span></div><button class="icon-delete" data-action="delete-param" data-set="${i}" data-index="${j}" aria-label="${esc(p.key)} 파라미터 삭제">×</button></div>`).join('')}
    <button class="add-inline" data-action="add-param" data-set="${i}">＋ 파라미터 추가</button></div></details>`).join('') || '<p class="empty-hint">첫 번째 파라미터 세트를 추가하세요.</p>';
  $('template-list').innerHTML = config.templateSets.map((s,i) => `<details class="set-card" data-id="${esc(s.id)}" ${open.has(s.id)?'open':''}>
    <summary><strong>${esc(s.name || '이름 없는 세트')}</strong><span class="set-meta">${s.templates.filter(t=>t.enabled).length}개 템플릿${s.enabled?'':' · 제외됨'}</span></summary><div class="set-body">
    <label class="field-label" for="tn-${i}">세트 이름</label><div class="set-name-row"><input id="tn-${i}" class="text-input" data-kind="t-name" data-set="${i}" value="${esc(s.name)}" maxlength="200"><button class="icon-delete" data-action="delete-t" data-set="${i}" aria-label="템플릿 세트 삭제">삭제</button></div>
    <label class="check"><input type="checkbox" data-kind="set-enabled" data-set="${i}" ${s.enabled?'checked':''}> 이 템플릿 세트 사용</label>
    <div class="link-box"><span class="field-label">연결할 파라미터 세트 · 여러 개 선택 가능</span>${config.parameterSets.map(p => `<label class="check"><input type="checkbox" data-kind="link" data-set="${i}" value="${esc(p.id)}" ${s.parameterSetIds.includes(p.id)?'checked':''}>${esc(p.name || '이름 없는 세트')}</label>`).join('') || '<p class="hint">먼저 파라미터 세트를 추가하세요.</p>'}</div>
    ${s.templates.map((t,j) => `<div class="template-card"><div class="template-name-row"><input type="checkbox" data-kind="template-enabled" data-set="${i}" data-index="${j}" aria-label="${esc(t.name)} 사용" ${t.enabled?'checked':''}><input type="text" class="text-input" data-kind="template-name" data-set="${i}" data-index="${j}" aria-label="템플릿 이름" maxlength="200" value="${esc(t.name)}"><button class="icon-delete" data-action="delete-template" data-set="${i}" data-index="${j}" aria-label="${esc(t.name)} 템플릿 삭제">×</button></div><textarea data-kind="text" data-set="${i}" data-index="${j}" aria-label="${esc(t.name)} 질문 문장" maxlength="16000" spellcheck="false" placeholder="What is the best {Category} in {Country}?">${esc(t.text)}</textarea><div class="tokens">${[...new Set(config.parameterSets.filter(p => s.parameterSetIds.includes(p.id)).flatMap(p=>p.params.map(v=>v.key)).filter(Boolean))].map(key=>`<button class="token" data-action="insert-token" data-set="${i}" data-index="${j}" data-key="${esc(key)}" title="커서 위치에 삽입">{${esc(key)}}</button>`).join('')}</div></div>`).join('')}
    <button class="add-inline" data-action="add-template" data-set="${i}">＋ 템플릿 추가</button></div></details>`).join('') || '<p class="empty-hint">첫 번째 템플릿 세트를 추가하세요.</p>';
  counts();
}

function setTab(value) {
  tab = value;
  for (const name of ['parameters','templates']) {
    const active = name === tab;
    $(name+'-panel').hidden = !active; $(name+'-tab').classList.toggle('active',active);
    $(name+'-tab').setAttribute('aria-selected',String(active)); $(name+'-tab').tabIndex=active?0:-1;
  }
}
for (const name of ['parameters','templates']) $(name+'-tab').onclick = () => setTab(name);
document.querySelector('.editor-tabs').onkeydown = e => {
  if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
    e.preventDefault(); setTab(e.key==='Home'?'parameters':e.key==='End'?'templates':tab==='parameters'?'templates':'parameters'); $(tab+'-tab').focus();
  }
};
document.querySelector('.editor').addEventListener('input', e => {
  const el=e.target, {kind,set,index}=el.dataset;
  if (!kind) return;
  const ps=config.parameterSets[set], ts=config.templateSets[set];
  if(kind==='p-name') ps.name=el.value;
  if(kind==='t-name') ts.name=el.value;
  if(kind==='key' || kind==='values') ps.params[index][kind]=el.value;
  if(kind==='mode') ps.mode=el.value;
  if(kind==='set-enabled') ts.enabled=el.checked;
  if(kind==='template-enabled') ts.templates[index].enabled=el.checked;
  if(kind==='template-name') ts.templates[index].name=el.value;
  if(kind==='text') ts.templates[index].text=el.value;
  if(kind==='link') ts.parameterSetIds=el.checked?[...new Set([...ts.parameterSetIds,el.value])]:ts.parameterSetIds.filter(id=>id!==el.value);
  markDirty();
  if(kind==='values') el.nextElementSibling.textContent=valuesOf(el.value).length+'개 고유 값';
  if(kind==='p-name'||kind==='t-name') el.closest('details').querySelector('summary strong').textContent=el.value||'이름 없는 세트';
  if(['mode','link','set-enabled','template-enabled'].includes(kind)) renderEditors();
});
document.querySelector('.editor').addEventListener('click', e => {
  const el=e.target.closest('[data-action]'); if(!el)return;
  const {action,set,index}=el.dataset, ps=config.parameterSets[set],ts=config.templateSets[set];
  const commit=fn=>{fn();markDirty();renderEditors();};
  if(action==='delete-p') confirm('파라미터 세트를 삭제할까요?', '이 세트를 사용하는 템플릿의 연결도 해제됩니다.',()=>commit(()=>{config.parameterSets.splice(set,1);config.templateSets.forEach(t=>t.parameterSetIds=t.parameterSetIds.filter(id=>id!==ps.id));}));
  if(action==='delete-t') confirm('템플릿 세트를 삭제할까요?', '이 세트의 질문 템플릿을 함께 삭제합니다.',()=>commit(()=>config.templateSets.splice(set,1)));
  if(action==='delete-param') commit(()=>ps.params.splice(index,1));
  if(action==='delete-template') commit(()=>ts.templates.splice(index,1));
  if(action==='add-param') {if(ps.params.length>=30)return toast('세트당 파라미터는 30개까지 가능합니다.');commit(()=>ps.params.push({key:'',values:''}));}
  if(action==='add-template') {if(ts.templates.length>=100)return toast('세트당 템플릿은 100개까지 가능합니다.');commit(()=>ts.templates.push({id:uid(),name:'새 질문',text:'',enabled:true}));}
  if(action==='insert-token') {
    const area=el.closest('.template-card').querySelector('textarea'),start=area.selectionStart,end=area.selectionEnd,token='{'+el.dataset.key+'}';
    area.setRangeText(token,start,end,'end');ts.templates[index].text=area.value;area.focus();markDirty();
  }
});
$('add-parameter-set').onclick=()=>{
  if(config.parameterSets.length>=50)return toast('파라미터 세트는 50개까지 가능합니다.');
  const id=uid();config.parameterSets.push({id,name:'새 파라미터 세트',mode:'product',params:[{key:'Country',values:'Australia'}]});
  const open=openIds();open.add(id);markDirty();renderEditors(open);$('parameter-list').lastElementChild.scrollIntoView({block:'nearest'});
};
$('add-template-set').onclick=()=>{
  if(config.templateSets.length>=50)return toast('템플릿 세트는 50개까지 가능합니다.');
  const id=uid();config.templateSets.push({id,name:'새 템플릿 세트',enabled:true,parameterSetIds:config.parameterSets.slice(0,1).map(s=>s.id),templates:[{id:uid(),name:'새 질문',text:'',enabled:true}]});
  const open=openIds();open.add(id);markDirty();renderEditors(open);$('template-list').lastElementChild.scrollIntoView({block:'nearest'});
};
$('dedupe').onchange=markDirty;
function run() {
  let result;
  try{result=generate(config,$('dedupe').checked);}catch(e){result={rows:[],errors:[e.message],total:0,duplicates:0};}
  rows=result.rows;selected=new Set(rows.map(r=>r.number));page=0;dirty=false;
  $('errors').hidden=!result.errors.length;$('errors').innerHTML='<ul>'+result.errors.map(e=>'<li>'+esc(e)+'</li>').join('')+'</ul>';
  $('result-state').classList.toggle('dirty',!!result.errors.length);$('result-state').textContent=result.errors.length?'입력 확인 필요':'생성 완료';
  $('result-count').textContent=$('preview-count').textContent=rows.length.toLocaleString('ko-KR');
  $('result-summary').textContent=result.errors.length?'표시된 입력값을 수정한 뒤 다시 생성하세요.':`${result.total.toLocaleString('ko-KR')}개 조합 → ${rows.length.toLocaleString('ko-KR')}개 질문${result.duplicates?' · 동일 문장 '+result.duplicates+'개 '+($('dedupe').checked?'제외':'포함'):''}`;
  renderResults();
}
function renderResults() {
  const q=$('search').value.toLocaleLowerCase(),filtered=rows.filter(r=>[r.prompt_text,r.template_set,r.parameter_set].some(v=>v.toLocaleLowerCase().includes(q)));
  page=Math.min(page,Math.max(0,Math.ceil(filtered.length/30)-1));
  const visible=filtered.slice(page*30,page*30+30);
  $('results').innerHTML=visible.map(r=>`<div class="result-row"><label class="result-index"><input type="checkbox" data-result="${r.number}" aria-label="질문 ${r.number} 선택" ${selected.has(r.number)?'checked':''}><span>${String(r.number).padStart(2,'0')}</span></label><div><p class="prompt-text">${esc(r.prompt_text)}</p><p class="provenance"><span>${esc(r.template_name)}</span><span>${esc(r.parameter_set)}</span></p></div></div>`).join('')||`<div class="empty-hint">${rows.length?'검색 결과가 없습니다.':'조건을 입력하고 프롬프트를 생성하세요.'}</div>`;
  $('page-info').textContent=filtered.length?`${page*30+1}–${Math.min((page+1)*30,filtered.length)} / ${filtered.length}개${q?' 검색 결과':''}`:'0개';
  $('previous').disabled=page===0;$('next').disabled=(page+1)*30>=filtered.length;updateSelection();
}
function updateSelection(){ $('selection-count').textContent=selected.size+'개 선택';$('export').disabled=dirty||!selected.size;$('select-all').textContent=rows.length&&selected.size===rows.length?'전체 해제':'전체 선택'; }
$('results').onchange=e=>{if(e.target.dataset.result){const n=Number(e.target.dataset.result);e.target.checked?selected.add(n):selected.delete(n);updateSelection();}};
$('select-all').onclick=()=>{selected=selected.size===rows.length?new Set():new Set(rows.map(r=>r.number));renderResults();};
$('search').oninput=()=>{page=0;renderResults();};
$('previous').onclick=()=>{page--;renderResults();$('results').scrollTop=0;};$('next').onclick=()=>{page++;renderResults();$('results').scrollTop=0;};
$('generate').onclick=()=>{run();renderEditors();toast(rows.length?rows.length+'개 프롬프트를 생성했습니다.':'입력 내용을 확인하세요.');};
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const date=()=>new Date().toLocaleDateString('sv-SE');
$('export').onclick=()=>{if(dirty)return;const out=rows.filter(r=>selected.has(r.number));if(!out.length)return;download(toCSV(out),'geo-prompts-'+date()+'.csv','text/csv;charset=utf-8');toast(out.length+'개 질문을 CSV로 내려받았습니다.');};
$('save-config').onclick=()=>{download(JSON.stringify(config,null,2),'geo-prompt-settings-'+date()+'.json','application/json;charset=utf-8');};
$('load-config').onclick=()=>$('config-file').click();
$('config-file').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    if(file.size>1000000)throw Error('설정 파일은 1MB 이하로 선택하세요.');
    const imported=validateConfig(JSON.parse(await file.text()));
    confirm('설정 파일을 불러올까요?', '현재 입력을 선택한 파일의 내용으로 교체합니다. 필요한 경우 먼저 설정을 저장하세요.',()=>{config=imported;$('dedupe').checked=config.dedupe!==false;persist();renderEditors(new Set(config.parameterSets.slice(0,1).map(s=>s.id)));run();toast('설정을 불러왔습니다.');});
  }catch(error){toast('불러오기 실패: '+error.message);}finally{e.target.value='';}
};
$('reset-sample').onclick=()=>confirm('고객사 샘플로 바꿀까요?','현재 입력을 호주·영어 질문 29개 샘플로 교체합니다. 필요한 경우 먼저 설정을 저장하세요.',()=>{config=sample();$('dedupe').checked=true;$('search').value='';persist();renderEditors(new Set(['p-recommend','s-recommend']));run();toast('고객사 샘플을 불러왔습니다.');});
renderEditors(new Set([config.parameterSets[0]?.id,config.templateSets[0]?.id]));run();
