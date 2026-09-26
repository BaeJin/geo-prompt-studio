import {validateData,availableAnalyses,selectAnalysis,entitiesOf,groupPrompts,coverage,csv,escapeHTML as esc,highlighted,isReferenceVersion,analysisLabel,recommendationEvidence,priorityText} from './model.mjs';
const $=id=>document.getElementById(id), providerName={OPENAI:'OpenAI',GOOGLE:'Google',ANTHROPIC:'Anthropic'},sentiments={POSITIVE:'긍정',NEUTRAL:'중립',NEGATIVE:'부정'};
let data,groups=[],promptId='',responseId='',analysisId='',entityKey='',currentResponse,currentAnalysis,currentEntities=[],evidence='',timer;
const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,3500);}
function categoryName(id){if(!id)return '미분류';const c=data.categories.find(c=>c.category_set_id===currentAnalysis?.category_set_id&&c.rfp_id===id);return c?.rfp_name||id;}
function version(){return $('version').value;}
function setData(value){
  data=validateData(value);$('loading').hidden=true;$('empty').hidden=true;$('dashboard').hidden=false;$('export').disabled=false;
  $('snapshot').textContent=`스냅샷 ${date(data.exported_at)} KST`;
  $('provider').innerHTML='<option value="all">전체</option>'+[...new Set(data.responses.map(r=>r.provider))].sort().map(p=>`<option value="${esc(p)}">${esc(providerName[p]||p)}</option>`).join('');
  const rubrics=new Map();
  for(const r of data.responses)for(const ref of r.references)if(ref.rubric_id){if(!rubrics.has(ref.rubric_id))rubrics.set(ref.rubric_id,{name:ref.rubric_name||ref.rubric_id,ids:new Set()});rubrics.get(ref.rubric_id).ids.add(r.task_id);}
  $('version').innerHTML='<option value="latest">응답별 최신 저장 결과</option><optgroup label="Judge 분석">'+data.versions.slice().sort((a,b)=>b.responses-a.responses).map(v=>`<option value="${esc(v.id)}">${esc(v.name)} · ${v.responses}응답</option>`).join('')+'</optgroup><optgroup label="AI 참조 초안"><option value="reference">응답별 최신 참조 초안</option>'+[...rubrics].map(([id,r])=>`<option value="reference:${esc(id)}">${esc(r.name)} · ${r.ids.size}응답</option>`).join('')+'</optgroup>';
  const hash=new URLSearchParams(location.hash.slice(1));promptId=hash.get('prompt')||'';responseId=hash.get('response')||'';analysisId='';entityKey='';render();
}
function render(){
  groups=groupPrompts(data.responses,$('prompt-search').value,$('provider').value);
  if(!groups.some(g=>g.id===promptId)){promptId=groups[0]?.id||'';responseId='';analysisId='';}
  const visible=groups.flatMap(g=>g.responses),analysed=coverage(visible,version());
  $('counts').innerHTML=`<span>프롬프트<strong>${groups.length}</strong></span><span>응답<strong>${visible.length}</strong></span><span>${isReferenceVersion(version())?'참조 초안':'분석'}<strong>${analysed}/${visible.length}</strong></span>`;
  $('scope-note').textContent=version()==='latest'?'응답마다 가장 최근에 저장된 분석을 표시합니다. 서로 다른 Judge 버전과 실험 결과가 포함됩니다.':isReferenceVersion(version())?'AI 참조 초안입니다. 마스터 단위 파생 초안은 오프라인 검토 자료이며, 운영 Judge 분석과 구분됩니다.':'선택한 Judge 버전의 최신 저장 결과를 표시합니다. 결과 없음은 미언급을 의미하지 않습니다.';
  $('prompt-count').textContent=groups.length+'개 프롬프트';
  $('prompt-list').innerHTML=groups.map(g=>`<button class="prompt-item ${g.id===promptId?'active':''}" data-prompt="${esc(g.id)}" ${g.id===promptId?'aria-current="true"':''}><code>${esc(g.id)}</code><span>${esc(g.text)}</span><small>응답 ${g.responses.length} · ${isReferenceVersion(version())?'초안':'분석'} ${coverage(g.responses,version())}</small></button>`).join('')||'<div class="blank">검색 결과 없음</div>';
  $('detail').hidden=!groups.length;$('no-prompt').hidden=!!groups.length;$('export').disabled=!visible.length;
  if(groups.length)renderPrompt();
}
function renderPrompt(){
  const g=groups.find(g=>g.id===promptId);
  if(!g.responses.some(r=>r.task_id===responseId)){responseId=g.responses[0].task_id;analysisId='';}
  currentResponse=g.responses.find(r=>r.task_id===responseId);
  $('prompt-id').textContent=g.id;$('prompt-text').textContent=currentResponse.prompt_text;
  $('response-tabs').innerHTML=g.responses.map(r=>`<button data-response="${esc(r.task_id)}" class="${r.task_id===responseId?'active':''}" aria-pressed="${r.task_id===responseId}"><strong>${esc(providerName[r.provider]||r.provider)}</strong><small>${esc(r.model_name)}${g.responses.filter(x=>x.provider===r.provider).length>1?' · '+esc(r.run_id)+' / '+r.run_no:''}</small></button>`).join('');
  $('response-meta').innerHTML=`수집 ${esc(date(currentResponse.collected_at))} KST · 반복 ${currentResponse.run_no}<details><summary>응답 식별 정보</summary>응답 ID: ${esc(responseId)}<br>수집 실행: ${esc(currentResponse.run_id)}</details>`;
  history.replaceState(null,'','#'+new URLSearchParams({prompt:promptId,response:responseId}));
  evidence='';$('source-text').scrollTop=0;renderSource();
  $('reasoning-wrap').hidden=!currentResponse.reasoning_summary;$('reasoning-text').textContent=currentResponse.reasoning_summary||'';$('reasoning-wrap').open=false;
  const candidates=availableAnalyses(currentResponse,version());
  currentAnalysis=selectAnalysis(currentResponse,version(),analysisId);analysisId=currentAnalysis?.analysis_id||'';
  $('analysis-picker').innerHTML=candidates.length?candidates.map(a=>`<option value="${esc(a.analysis_id)}" ${a.analysis_id===analysisId?'selected':''}>${esc(date(a.analyzed_at))} · ${esc(a.judge_name)}</option>`).join(''):'<option>저장 결과 없음</option>';
  $('analysis-picker').disabled=!candidates.length;
  renderAnalysis();
}
function renderSource(){
  $('source-text').innerHTML=highlighted(currentResponse.response_text,evidence);$('clear-evidence').hidden=!evidence;
  if(evidence){const mark=$('evidence-match');if(mark){$('source-text').scrollTop=mark.offsetTop-$('source-text').offsetTop-35;}else toast('현재 원문에서 동일한 근거를 찾지 못했습니다.');}
}
function renderAnalysis(){
  const a=currentAnalysis;
  $('analysis-export').disabled=!a;$('no-analysis').hidden=!!a;$('analysis-content').hidden=!a;
  $('analysis-meta').innerHTML=!a?'':a.is_reference?`<span class="tag draft">${esc(a.author_kind)} · ${esc(a.review_status)}</span> · ${esc(analysisLabel(a))} · revision ${a.revision}${a.unresolved_ambiguities?' · 미해결 '+a.unresolved_ambiguities+'건':''}<details><summary>초안 식별 정보</summary>${esc(a.record_id)}<br>기준: ${esc(a.rubric_name||a.rubric_id)}${a.expected_output?.catalog_id?'<br>마스터 카탈로그: '+esc(a.expected_output.catalog_id):''}</details>`:`${esc(a.judge_model_name||a.judge_model_id)} · <span class="tag">${esc(analysisLabel(a))}</span><details><summary>분석 식별 정보</summary>분석 ID: ${esc(a.analysis_id)}<br>실행: ${esc(a.analysis_run_id)}<br>Judge: ${esc(a.judge_version_id)}</details>`;
  currentEntities=entitiesOf(a);entityKey='';$('entity-search').value='';$('recommended').checked=false;$('top-only').checked=false;$('top-only-wrap').hidden=a?.schema_version!==3;$('category').value='all';$('sentiment').value='all';
  if(a)renderEntities();
}
function renderEntities(){
  const q=$('entity-search').value.trim().toLocaleLowerCase(),only=$('recommended').checked,topOnly=$('top-only').checked;
  const entities=currentEntities.filter(e=>(!only||e.is_recommended)&&(!topOnly||e.is_top_recommended)&&`${e.brand||''} ${e.model||''} ${e.family_name||''} ${(e.members||[]).map(m=>m.entity?.model||'').join(' ')}`.toLocaleLowerCase().includes(q));
  if(!entities.some(e=>e.key===entityKey))entityKey=entities[0]?.key||'';
  const legacy=![2,3].includes(currentAnalysis?.schema_version),top=currentAnalysis?.schema_version===3;
  $('priority-heading').textContent='최우선 여부';
  $('entity-summary').textContent=`${legacy?'언급':'개체'} ${entities.length}개 / 전체 ${currentEntities.length}개${top?' · 최우선은 최종 선택 여부':' · 이전 분석에는 최우선 여부가 없습니다'}`;
  $('entities').innerHTML=entities.map(e=>`<tr class="${e.key===entityKey?'active':''}"><td><button class="entity-name" data-entity="${esc(e.key)}" aria-pressed="${e.key===entityKey}"><span>${esc(e.brand||'브랜드 미지정')}</span><strong>${esc(entityName(e))}</strong></button></td><td>${e.is_recommended?'추천':'—'}</td><td>${esc(priorityText(e,currentAnalysis))}</td><td>${e.kbf_assessments.length}</td></tr>`).join('')||`<tr><td colspan="4" class="blank">${currentEntities.length?'검색 결과 없음':'분석 성공 · 추출된 항목 없음'}</td></tr>`;
  $('entity-detail').hidden=!entities.length;
  if(entities.length)renderEntity();
}
function entityName(e){return e.model||e.family_name||(e.scope==='OUT_OF_MASTER_SCOPE'?'범위 미확정':'브랜드 전체');}
function renderEntity(){
  const e=currentEntities.find(e=>e.key===entityKey);if(!e)return;
  $('entity-title').textContent=[e.brand,entityName(e)].filter(Boolean).join(' · ');
  $('recommendation').innerHTML=(e.is_recommended?e.legacy?'해당 언급에서 추천':'추천':'추천 대상 아님')+` · 최우선 추천: ${priorityText(e,currentAnalysis)}`+recommendationEvidence(e).map((r,i)=>`<br><button class="small" data-recommendation="${i}">${esc(r.raw_model?r.raw_model+' · 근거':'추천 근거 보기')}</button>`).join('');
  $('entity-identity').innerHTML=(e.brand_id||e.vehicle_model_id?`<details><summary>마스터 식별 정보</summary>브랜드 ID: ${esc(e.brand_id||'미연결')}<br>모델 ID: ${esc(e.vehicle_model_id||'미연결')}</details>`:'')+(e.members?.length?`<details><summary>원래 표기 ${e.members.length}개</summary>${e.members.map(m=>`<div>${esc([m.entity.brand,m.entity.model].filter(Boolean).join(' · '))}</div>`).join('')}</details>`:'');
  const selected=$('category').value,ids=[...new Set(e.kbf_assessments.map(k=>k.category_id||''))];
  $('category').innerHTML='<option value="all">모든 KBF</option>'+ids.map(id=>`<option value="${esc(id||'unclassified')}">${esc(categoryName(id))}</option>`).join('');
  if(ids.some(id=>(id||'unclassified')===selected))$('category').value=selected;
  renderAssessments();
}
function renderAssessments(){
  const e=currentEntities.find(e=>e.key===entityKey);if(!e)return;
  $('assessments').innerHTML=e.kbf_assessments.map((k,i)=>({...k,index:i})).filter(k=>($('category').value==='all'||(k.category_id||'unclassified')===$('category').value)&&($('sentiment').value==='all'||k.sentiment===$('sentiment').value)).map(k=>`<article class="assessment"><div class="assessment-head"><span class="sentiment ${k.sentiment==='POSITIVE'?'positive':k.sentiment==='NEGATIVE'?'negative':''}">${esc(sentiments[k.sentiment]||k.sentiment)}</span><strong>${esc(categoryName(k.category_id))}</strong></div><p>${esc(k.content)}</p><details><summary>근거</summary><blockquote>${esc(k.evidence)}</blockquote><button class="small" data-evidence="${k.index}">원문에서 보기</button></details></article>`).join('')||'<div class="blank">해당 KBF 평가가 없습니다.</div>';
}
$('prompt-list').onclick=e=>{const b=e.target.closest('[data-prompt]');if(b){promptId=b.dataset.prompt;responseId='';analysisId='';render();}};
$('response-tabs').onclick=e=>{const b=e.target.closest('[data-response]');if(b){responseId=b.dataset.response;analysisId='';renderPrompt();}};
$('provider').onchange=$('version').onchange=()=>{analysisId='';render();};$('prompt-search').oninput=render;
$('analysis-picker').onchange=e=>{analysisId=e.target.value;currentAnalysis=selectAnalysis(currentResponse,version(),analysisId);evidence='';renderSource();renderAnalysis();};
$('entity-search').oninput=$('recommended').onchange=$('top-only').onchange=renderEntities;
$('entities').onclick=e=>{const b=e.target.closest('[data-entity]');if(b){entityKey=b.dataset.entity;$('category').value='all';$('sentiment').value='all';renderEntities();}};
$('category').onchange=$('sentiment').onchange=renderAssessments;
function showEvidence(value){evidence=value;renderSource();if(evidence&&currentResponse.response_text.includes(evidence)){$('source-text').focus({preventScroll:true});if(innerWidth<=1100)$('source-text').scrollIntoView({block:'center'});}}
$('assessments').onclick=e=>{const b=e.target.closest('[data-evidence]');if(b)showEvidence(currentEntities.find(x=>x.key===entityKey).kbf_assessments[Number(b.dataset.evidence)].evidence);};
$('recommendation').onclick=e=>{const b=e.target.closest('[data-recommendation]');if(b)showEvidence(recommendationEvidence(currentEntities.find(x=>x.key===entityKey))[Number(b.dataset.recommendation)]?.evidence||'');};
$('clear-evidence').onclick=()=>{evidence='';renderSource();};
function download(value,name,type){const url=URL.createObjectURL(new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('export').onclick=()=>{const rows=groups.flatMap(g=>g.responses);download(csv([['prompt_id','prompt_text','response_id','provider','model_name','collected_at','response_text'],...rows.map(r=>[r.prompt_id,r.prompt_text,r.task_id,r.provider,r.model_name,r.collected_at,r.response_text])]),'geo-responses.csv','text/csv;charset=utf-8');toast(rows.length+'개 응답을 내려받았습니다.');};
$('analysis-export').onclick=()=>download(JSON.stringify({prompt_id:promptId,response_id:responseId,analysis:currentAnalysis},null,2),'geo-analysis-'+promptId+'.json','application/json');
$('import').onclick=$('open-data').onclick=()=>$('data-file').click();
$('data-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100*1024**2)throw Error('100MB 이하의 데이터 파일을 선택하세요.');setData(JSON.parse(await file.text()));toast('데이터를 불러왔습니다.');}catch(error){toast(error.message);}finally{e.target.value='';}};
try{const response=await fetch('./data.json',{cache:'no-store'});if(!response.ok)throw Error('데이터 파일을 열어 시작하세요.');setData(await response.json());}
catch(error){$('loading').hidden=true;$('empty').hidden=false;$('load-message').textContent=error.message==='데이터 파일을 열어 시작하세요.'?'BigQuery에서 내보낸 대시보드 데이터 파일을 여세요. 파일은 서버로 전송되지 않습니다.':'데이터를 읽지 못했습니다. 올바른 대시보드 JSON 파일을 선택하세요.';}
