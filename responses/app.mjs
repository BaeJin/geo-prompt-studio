import {validateData,availableAnalyses,selectAnalysis,entitiesOf,groupPrompts,coverage,csv,escapeHTML as esc,highlighted,isReferenceVersion,analysisLabel,recommendationEvidence,priorityText,sortEntities,latestSchemaData,brandKey,targetKey,aggregateResponses,deploymentLabel,selectionState,updateSelection,analysisStatusText,sentimentScore,promptPresentation,responseScope,promptFilterOptions} from './model.mjs?v=0c7dc2fbd25c';
const $=id=>document.getElementById(id), providerName={OPENAI:'OpenAI',GOOGLE:'Google',ANTHROPIC:'Anthropic'},sentiments={POSITIVE:'긍정',NEUTRAL:'중립',NEGATIVE:'부정'};
let data,groups=[],promptId='',responseId='',analysisId='',entityKey='',currentResponse,currentAnalysis,currentEntities=[],evidence='',timer;
let activeView='responses',browsePage=0,expandedPrompts=new Set(),sourceResponse=null;
const SELECTION_STORAGE='datacast-response-explorer-selection-v1';
let drill='',population=[],selectedResponses=new Set(),selectionCandidates=[];
const metricNames={exposure:'노출',positive:'긍정 노출',recommended:'추천',top:'최우선 추천'};
const percent=(count,total)=>total?(count/total*100).toFixed(1)+'%':'—';
const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,3500);}
function categoryName(id){if(!id)return '미분류';const c=data.categories.find(c=>c.category_set_id===currentAnalysis?.category_set_id&&c.rfp_id===id);return c?.rfp_name||id;}
function version(){return $('version').value;}
function setData(value){
  if(value.source_kind!=='customer_export'||value.source!=='hyundai-global-search.global_geo')throw Error('고객사 DB에서 갱신한 데이터 파일을 사용하세요.');
  data=validateData(latestSchemaData(value));drill='';selectedResponses=new Set();browsePage=0;expandedPrompts=new Set();
  try{const saved=JSON.parse(localStorage.getItem(SELECTION_STORAGE)||'null');if(saved?.source===data.source&&saved?.version===data.export_info?.export_version&&Array.isArray(saved.ids))selectedResponses=new Set(saved.ids.filter(id=>data.responses.some(r=>r.task_id===id)));}catch{}
  $('loading').hidden=true;$('empty').hidden=true;$('dashboard').hidden=false;$('export').disabled=false;
  $('snapshot').textContent=`${date(data.exported_at)} KST`;
  $('provider').innerHTML='<option value="all">전체</option>'+[...new Set(data.responses.map(r=>r.provider))].sort().map(p=>`<option value="${esc(p)}">${esc(providerName[p]||p)}</option>`).join('');
  updateCollectionModels();
  updatePromptFilters(true);
  const rubrics=new Map();
  for(const r of data.responses)for(const ref of r.references)if(ref.rubric_id){if(!rubrics.has(ref.rubric_id))rubrics.set(ref.rubric_id,{name:ref.rubric_name||ref.rubric_id,ids:new Set()});rubrics.get(ref.rubric_id).ids.add(r.task_id);}
  $('version').innerHTML=data.versions.map(v=>`<option value="${esc(v.id)}">${esc(v.name)} · ${v.responses}응답</option>`).join('');
  $('version').value=data.versions[0]?.id||'latest';$('version').closest('label').hidden=data.versions.length<2;
  const brands=new Map();for(const r of data.responses)for(const a of [...r.analyses,...r.references.map(x=>({entities:x.expected_output?.entities||[]}))])for(const e of a.entities)if(e.brand)brands.set(brandKey(e.brand),e.brand);
  if(!brands.has('hyundai'))brands.set('hyundai','Hyundai');
  $('target-brand').innerHTML=[...brands].sort((a,b)=>a[1].localeCompare(b[1])).map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join('');$('target-brand').value='hyundai';updateTargetModels();
  const hash=new URLSearchParams(location.hash.slice(1));promptId=hash.get('prompt')||'';responseId=hash.get('response')||'';analysisId='';entityKey='';activeView=hash.get('view')==='analysis'?'analysis':'responses';if(promptId)expandedPrompts.add(promptId);setView(activeView);
}
function saveSelection(){
  try{localStorage.setItem(SELECTION_STORAGE,JSON.stringify({source:data.source,version:data.export_info?.export_version,ids:[...selectedResponses]}));}catch{toast('선택을 브라우저에 저장하지 못했습니다.');}
}
function updateCollectionModels(){
  const previous=$('collection-model').value;
  const models=[...new Set(data.responses.filter(r=>$('provider').value==='all'||r.provider===$('provider').value).map(r=>r.model_name))].sort();
  $('collection-model').innerHTML='<option value="all">전체</option>'+models.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
  if(models.includes(previous))$('collection-model').value=previous;
}
function updatePromptFilters(reset=false){
  const template=reset?'all':$('prompt-template').value,param=reset?'all':$('prompt-param').value;
  const {templates}=promptFilterOptions(data.responses);
  $('prompt-template').innerHTML='<option value="all">전체</option>'+templates.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  if(templates.includes(template))$('prompt-template').value=template;
  const {params}=promptFilterOptions(data.responses,$('prompt-template').value);
  $('prompt-param').innerHTML='<option value="all">전체</option>'+params.map(p=>`<option value="${esc(p.key)}">${esc(p.name+' · '+p.value)}</option>`).join('');
  if(params.some(p=>p.key===param))$('prompt-param').value=param;
  $('prompt-param').disabled=!params.length;
}
function selectedScope(){return responseScope(data.responses,selectedResponses,$('prompt-search').value,$('provider').value,$('collection-model').value,$('prompt-template').value,$('prompt-param').value);}
function browseCandidates(){return $('selected-only').checked?selectionCandidates.filter(r=>selectedResponses.has(r.task_id)):selectionCandidates;}
function render(){
  const {candidates,selected:included}=selectedScope();
  selectionCandidates=candidates;renderSelection();
  const aggregate=aggregateResponses(included,version(),$('target-brand').value,$('target-model').value);
  population=aggregate.rows.map(row=>row.response);renderOverview(aggregate,included.length);
  groups=groupPrompts(drill?aggregate.rows.filter(row=>row.signals[drill]===true).map(row=>row.response):included);
  if(!groups.some(g=>g.id===promptId)){promptId=groups[0]?.id||'';responseId='';analysisId='';}
  const visible=groups.flatMap(g=>g.responses);
  $('counts').innerHTML=`<span>프롬프트<strong>${groupPrompts(candidates).length}</strong></span><span>응답<strong>${candidates.length}</strong></span><span>선택<strong>${included.length}</strong></span>`;
  $('drill-note').textContent=drill?`${metricNames[drill]} 해당 ${visible.length}건`:`선택 응답 ${visible.length}건`;$('clear-drill').hidden=!drill;
  $('prompt-count').textContent=groups.length+'개';
  $('prompt-list').innerHTML=groups.map(g=>`<button class="prompt-item ${g.id===promptId?'active':''}" data-prompt="${esc(g.id)}" ${g.id===promptId?'aria-current="true"':''}><span>${esc(promptPresentation(g.text).title)}</span><small>응답 ${g.responses.length} · ${esc(g.id)}</small></button>`).join('')||'<div class="blank">해당 응답 없음</div>';
  $('detail').hidden=!groups.length;$('no-prompt').hidden=!!groups.length;$('export').disabled=!included.length;
  if(groups.length)renderPrompt();else{currentResponse=null;currentAnalysis=null;currentEntities=[];responseId='';analysisId='';$('analysis-export').disabled=true;}
  const selectedHidden=selectedResponses.size-included.length;
  $('selected-summary').textContent=`분석 대상 ${included.length}개${selectedHidden?' · 필터 밖 선택 '+selectedHidden+'개':''}`;
  $('show-analysis').textContent=`분석 결과 보기 (${included.length})`;$('show-analysis').disabled=!included.length;
  $('analysis-selection-count').textContent=`선택 응답 ${included.length}개 · 프롬프트 ${groupPrompts(included).length}개${selectedHidden?' · 필터 밖 선택 '+selectedHidden+'개':''}`;
  applyView();syncLocation();
}
function renderSelection(){
  const list=$('selection-list'),active=document.activeElement;
  const focusResponse=active?.dataset?.responseSelect,focusPrompt=active?.dataset?.promptSelect,focusToggle=active?.dataset?.togglePrompt;
  const eligible=browseCandidates();
  const promptGroups=groupPrompts(eligible),visible=selectionState(eligible,selectedResponses);
  browsePage=Math.min(browsePage,Math.max(0,Math.ceil(promptGroups.length/20)-1));
  const pageGroups=promptGroups.slice(browsePage*20,browsePage*20+20);
  $('browse-count').textContent=`${promptGroups.length}개 · 응답 ${eligible.length}개`;
  $('select-visible').disabled=!eligible.length||visible.checked;$('deselect-visible').disabled=!visible.count;
  $('expand-groups').disabled=!pageGroups.length;
  $('expand-groups').textContent=pageGroups.length&&pageGroups.every(g=>expandedPrompts.has(g.id))?'모두 접기':'모두 펼치기';
  list.innerHTML=pageGroups.map(g=>{
    const choice=selectionState(g.responses,selectedResponses),label=promptPresentation(g.text),open=expandedPrompts.has(g.id);
    return `<article class="browse-group"><div class="browse-group-heading"><input type="checkbox" data-prompt-select="${esc(g.id)}" ${choice.checked?'checked':''} aria-label="${esc(label.title)} 전체 응답 선택"><button class="question-toggle" data-toggle-prompt="${esc(g.id)}" aria-expanded="${open}" aria-controls="responses-${esc(g.id)}"><span class="disclosure" aria-hidden="true">${open?'▾':'▸'}</span><span><strong>${esc(label.title)}</strong><small>${esc([label.kind,label.market,g.id].filter(Boolean).join(' · '))}</small></span></button><span class="group-models">${[...new Set(g.responses.map(r=>providerName[r.provider]||r.provider))].map(p=>`<span>${esc(p)}</span>`).join('')}</span><span class="group-count">${choice.count}/${g.responses.length} 선택</span><button class="raw-button" data-raw-prompt="${esc(g.id)}" aria-label="${esc(label.title)} 프롬프트 원문">원문</button></div><div id="responses-${esc(g.id)}" class="response-rows" ${open?'':'hidden'}>${g.responses.map(r=>{
      return `<div class="browse-response"><input type="checkbox" data-response-select="${esc(r.task_id)}" ${selectedResponses.has(r.task_id)?'checked':''} aria-label="${esc(label.title+' · '+r.model_name)} 선택"><div class="response-model"><strong>${esc(r.model_name)}</strong><small>${esc(providerName[r.provider]||r.provider)}</small></div><time>${esc(date(r.collected_at))}</time><button class="raw-button" data-raw-response="${esc(r.task_id)}" aria-label="${esc(label.title+' · '+r.model_name)} 응답 원문">원문 보기</button></div>`;
    }).join('')}</div></article>`;
  }).join('')||'<div class="blank">해당 응답이 없습니다.</div>';
  for(const box of list.querySelectorAll('[data-prompt-select]'))box.indeterminate=selectionState(promptGroups.find(g=>g.id===box.dataset.promptSelect).responses,selectedResponses).indeterminate;
  if(focusResponse||focusPrompt||focusToggle){const el=[...list.querySelectorAll('input,button')].find(e=>focusResponse?e.dataset.responseSelect===focusResponse:focusPrompt?e.dataset.promptSelect===focusPrompt:e.dataset.togglePrompt===focusToggle);el?.focus({preventScroll:true});}
  $('browse-page').textContent=promptGroups.length?`${browsePage*20+1}–${Math.min((browsePage+1)*20,promptGroups.length)} / ${promptGroups.length}개 프롬프트`:'0개';
  $('browse-previous').disabled=!browsePage;$('browse-next').disabled=(browsePage+1)*20>=promptGroups.length;
}
function updateTargetModels(){
  const models=new Map();for(const r of data.responses)for(const a of [selectAnalysis(r,version())].filter(Boolean))for(const e of a.entities)if(brandKey(e.brand)===$('target-brand').value&&e.model&&targetKey(e.model)!=='null')models.set(targetKey(e.model),e.model);
  $('target-model').innerHTML='<option value="all">브랜드 전체</option>'+[...models].sort((a,b)=>a[1].localeCompare(b[1],'ko',{numeric:true})).map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join('');
}
function renderOverview(result,filteredCount){
  $('population-note').textContent=`집계 ${result.total}건 · 미완료·부분 결과 제외 ${filteredCount-result.total}건`;
  $('funnel').innerHTML=result.metrics.map(m=>`<button class="funnel-row ${drill===m.key?'selected':''}" data-metric="${m.key}" aria-pressed="${drill===m.key}"><span>${metricNames[m.key]}</span><meter min="0" max="${result.total||1}" value="${m.count}" aria-label="${metricNames[m.key]} 비율">${percent(m.count,result.total)}</meter><strong>${percent(m.count,result.total)}</strong><small>${m.count} / ${result.total}${m.unknown?' · 미판정 '+m.unknown:''}</small></button>`).join('');
  $('provider-summary').innerHTML=[...new Set(population.map(r=>r.provider))].sort().map(p=>{
    const a=aggregateResponses(population.filter(r=>r.provider===p),version(),$('target-brand').value,$('target-model').value);
    return `<tr><th scope="row">${esc(providerName[p]||p)}</th><td>${a.total}</td>${a.metrics.map(m=>`<td title="${m.count}/${a.total}${m.unknown?' · 미판정 '+m.unknown:''}">${percent(m.count,a.total)}</td>`).join('')}</tr>`;
  }).join('')||'<tr><td colspan="6" class="blank">집계할 응답이 없습니다.</td></tr>';
}
function renderPrompt(){
  const g=groups.find(g=>g.id===promptId);
  if(!g.responses.some(r=>r.task_id===responseId)){responseId=g.responses[0].task_id;analysisId='';}
  currentResponse=g.responses.find(r=>r.task_id===responseId);
  $('prompt-id').textContent=g.id;$('prompt-text').textContent=promptPresentation(currentResponse.prompt_text).title;
  $('response-tabs').innerHTML=g.responses.map(r=>`<button data-response="${esc(r.task_id)}" class="${r.task_id===responseId?'active':''}" aria-pressed="${r.task_id===responseId}"><strong>${esc(providerName[r.provider]||r.provider)}</strong><small>${esc(r.model_name)}${g.responses.filter(x=>x.provider===r.provider).length>1?' · '+esc(r.response_id.slice(0,8)):''}</small></button>`).join('');
  $('response-meta').textContent=`${currentResponse.model_name} · ${date(currentResponse.collected_at)}`;
  syncLocation();
  const candidates=availableAnalyses(currentResponse,version());
  currentAnalysis=selectAnalysis(currentResponse,version(),analysisId);analysisId=currentAnalysis?.analysis_id||'';
  $('analysis-picker').innerHTML=candidates.length?candidates.map(a=>`<option value="${esc(a.analysis_id)}" ${a.analysis_id===analysisId?'selected':''}>${esc(date(a.analyzed_at))} · ${deploymentLabel(data,a.judge_version_id)?'['+deploymentLabel(data,a.judge_version_id)+'] ':''}${esc(a.judge_name)}</option>`).join(''):'<option>저장 결과 없음</option>';
  $('analysis-picker').disabled=!candidates.length;$('analysis-picker').closest('.analysis-picker').hidden=candidates.length<2;
  renderAnalysis();
}
function openSource(response,prompt){
  sourceResponse=response||null;evidence='';
  const text=response?.prompt_text||prompt?.text||'',identity=response?.prompt_id||prompt?.id||'';
  $('source-title').textContent=promptPresentation(text).title;
  $('source-kind').textContent=response?'응답 원문':'프롬프트 원문';
  $('raw-prompt-text').textContent=text;$('raw-prompt-id').textContent=identity;
  $('raw-response').hidden=!response;
  if(response){
    $('raw-response-meta').textContent=`${providerName[response.provider]||response.provider} · ${response.model_name} · ${date(response.collected_at)} KST`;
    $('raw-response-id').textContent=response.task_id;
    $('reasoning-wrap').hidden=!response.reasoning_summary;$('reasoning-text').textContent=response.reasoning_summary||'';$('reasoning-wrap').open=false;
    renderSource();$('source-text').scrollTop=0;
  }
  $('source-dialog').showModal();$('source-dialog').querySelector('.drawer-content').scrollTop=0;
}
function renderSource(){
  if(!sourceResponse)return;
  $('source-text').innerHTML=highlighted(sourceResponse.response_text,evidence);$('clear-evidence').hidden=!evidence;
  if(evidence){const mark=$('evidence-match');if(mark)mark.scrollIntoView({block:'center'});else toast('현재 원문에서 동일한 근거를 찾지 못했습니다.');}
}
$('close-source').onclick=()=>$('source-dialog').close();
$('source-dialog').addEventListener('click',e=>{if(e.target===$('source-dialog')){const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();}});
$('open-current-source').onclick=()=>{if(currentResponse&&selectedResponses.has(currentResponse.task_id))openSource(currentResponse);};
function renderAnalysis(){
  const a=currentAnalysis;
  $('analysis-export').disabled=!a;$('no-analysis').hidden=!!a;$('analysis-content').hidden=!a;
  $('analysis-meta').innerHTML=!a?'':`<span class="tag ${a.analysis_status==='SUCCEEDED'?'':'draft'}">${esc(analysisStatusText(a))}</span> · ${esc(date(a.analyzed_at))}`;
  currentEntities=entitiesOf(a);entityKey='';$('entity-search').value='';$('recommended').checked=false;$('top-only').checked=false;$('top-only-wrap').hidden=a?.schema_version!==3;$('category').value='all';$('sentiment').value='all';
  entityKey=currentEntities.find(e=>brandKey(e.brand)===$('target-brand').value&&($('target-model').value==='all'||targetKey(e.model)===$('target-model').value)&&(!drill||drill==='exposure'||(drill==='positive'?e.kbf_assessments.some(k=>k.sentiment==='POSITIVE'):e[drill==='top'?'is_top_recommended':'is_recommended']===true)))?.key||'';
  if(a)renderEntities();
}
function renderEntities(){
  const q=$('entity-search').value.trim().toLocaleLowerCase(),only=$('recommended').checked,topOnly=$('top-only').checked;
  const entities=sortEntities(currentEntities.filter(e=>(!only||e.is_recommended)&&(!topOnly||e.is_top_recommended)&&`${e.brand||''} ${e.model||''} ${e.family_name||''} ${(e.members||[]).map(m=>m.entity?.model||'').join(' ')}`.toLocaleLowerCase().includes(q)),$('entity-sort').value,currentAnalysis);
  if(!entities.some(e=>e.key===entityKey))entityKey=entities[0]?.key||'';
  const legacy=![2,3].includes(currentAnalysis?.schema_version),top=currentAnalysis?.schema_version===3;
  $('priority-heading').textContent='최우선 여부';
  $('entity-summary').textContent=`${legacy?'언급':'개체'} ${entities.length}개 / 전체 ${currentEntities.length}개`;
  $('entities').innerHTML=entities.map(e=>`<tr class="${e.key===entityKey?'active':''}"><td><button class="entity-name" data-entity="${esc(e.key)}" aria-pressed="${e.key===entityKey}"><span>${esc(e.brand||'브랜드 미지정')}</span><strong>${esc(entityName(e))}</strong></button></td><td>${e.is_recommended===null?'미판정':e.is_recommended?'추천':'—'}</td><td>${esc(priorityText(e,currentAnalysis))}</td><td class="score-cell" title="${esc(scoreBasis(e))}">${scoreText(e)}</td><td>${e.kbf_assessments.length}</td></tr>`).join('')||`<tr><td colspan="5" class="blank">${currentEntities.length?'검색 결과 없음':analysisStatusText(currentAnalysis)+' · 저장된 항목 없음'}</td></tr>`;
  $('entity-detail').hidden=!entities.length;
  if(entities.length)renderEntity();
}
function scoreText(e){const score=sentimentScore(e);return score.percent===null?'평가 없음':score.percent.toFixed(1)+'%';}
function scoreBasis(e){const score=sentimentScore(e);return `긍정 ${score.positive} · 부정 ${score.negative}`;}
function entityName(e){return e.model||e.family_name||(e.scope==='OUT_OF_MASTER_SCOPE'?'범위 미확정':'브랜드 전체');}
function renderEntity(){
  const e=currentEntities.find(e=>e.key===entityKey);if(!e)return;
  $('entity-title').textContent=[e.brand,entityName(e)].filter(Boolean).join(' · ');
  $('recommendation').innerHTML=(e.is_recommended===null?'추천 미판정':e.is_recommended?e.legacy?'해당 언급에서 추천':'추천':'추천 대상 아님')+` · 최우선 추천: ${priorityText(e,currentAnalysis)}`+recommendationEvidence(e).map((r,i)=>`<br><button class="small" data-recommendation="${i}">${esc(r.raw_model?r.raw_model+' · 근거':'추천 근거 보기')}</button>`).join('');
  $('sentiment-score').textContent=`긍부정 ${scoreText(e)} · ${scoreBasis(e)}${currentAnalysis.analysis_status==='PARTIAL'?' · 부분 결과 기준':''}`;
  $('entity-identity').innerHTML=(e.brand_id||e.vehicle_model_id?`<details><summary>마스터 식별 정보</summary>브랜드 ID: ${esc(e.brand_id||'미연결')}<br>모델 ID: ${esc(e.vehicle_model_id||'미연결')}</details>`:'')+(e.members?.length?`<details><summary>원래 표기 ${e.members.length}개</summary>${e.members.map(m=>`<div>${esc([m.entity.brand,m.entity.model].filter(Boolean).join(' · '))}</div>`).join('')}</details>`:'');
  const selected=$('category').value,ids=[...new Set(e.kbf_assessments.map(k=>k.category_id||''))];
  $('category').innerHTML='<option value="all">모든 KBF</option>'+ids.map(id=>`<option value="${esc(id||'unclassified')}">${esc(categoryName(id))}</option>`).join('');
  if(ids.some(id=>(id||'unclassified')===selected))$('category').value=selected;
  renderAssessments();
}
function renderAssessments(){
  const e=currentEntities.find(e=>e.key===entityKey);if(!e)return;
  $('assessments').innerHTML=e.kbf_assessments.map((k,i)=>({...k,index:i})).filter(k=>($('category').value==='all'||(k.category_id||'unclassified')===$('category').value)&&($('sentiment').value==='all'||k.sentiment===$('sentiment').value)).map(k=>`<article class="assessment"><div class="assessment-head"><span class="sentiment ${k.sentiment==='POSITIVE'?'positive':k.sentiment==='NEGATIVE'?'negative':''}">${esc(sentiments[k.sentiment]||k.sentiment)}</span><strong>${esc(categoryName(k.category_id))}</strong></div><blockquote>${esc(k.evidence)}</blockquote><button class="small" data-evidence="${k.index}">원문에서 보기</button></article>`).join('')||'<div class="blank">해당 KBF 평가가 없습니다.</div>';
}
function syncLocation(){history.replaceState(null,'','#'+new URLSearchParams({view:activeView,...(promptId?{prompt:promptId}:{}),...(responseId?{response:responseId}:{})}));}
function applyView(){
  const analysis=activeView==='analysis',included=selectedScope().selected.length;
  $('browse-view').hidden=analysis;$('analysis-selection').hidden=!analysis;
  $('overview-view').hidden=!analysis||!included;$('details-view').hidden=!analysis||!included;
  $('analysis-empty').hidden=!analysis||!!included;
  $('page-title').textContent=analysis?'분석 결과':'프롬프트·응답';
  $('detail-title').textContent='응답별 분석';
  for(const link of document.querySelectorAll('[data-view]')){
    if(link.dataset.view===activeView)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
}
function setView(view,{resetScroll=false}={}){
  activeView=view==='analysis'?'analysis':'responses';
  if(activeView!=='analysis')drill='';
  render();
  if(resetScroll)window.scrollTo({top:0,behavior:'instant'});
}
for(const link of document.querySelectorAll('[data-view]'))link.onclick=e=>{
  if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  e.preventDefault();setView(link.dataset.view,{resetScroll:true});
};
window.addEventListener('hashchange',()=>{
  if(!data)return;
  const hash=new URLSearchParams(location.hash.slice(1));
  promptId=hash.get('prompt')||promptId;responseId=hash.get('response')||responseId;analysisId='';
  setView(hash.get('view'),{resetScroll:true});
});
document.querySelector('.skip-link').onclick=e=>{e.preventDefault();$('main-content').focus();};
$('selection-list').onclick=e=>{
  const toggle=e.target.closest('[data-toggle-prompt]'),rawPrompt=e.target.closest('[data-raw-prompt]'),rawResponse=e.target.closest('[data-raw-response]');
  if(toggle){const id=toggle.dataset.togglePrompt;expandedPrompts.has(id)?expandedPrompts.delete(id):expandedPrompts.add(id);renderSelection();}
  if(rawPrompt)openSource(null,groupPrompts(selectionCandidates).find(g=>g.id===rawPrompt.dataset.rawPrompt));
  if(rawResponse)openSource(selectionCandidates.find(r=>r.task_id===rawResponse.dataset.rawResponse));
};
$('show-analysis').onclick=()=>setView('analysis',{resetScroll:true});
$('change-selection').onclick=$('choose-responses').onclick=()=>setView('responses',{resetScroll:true});
$('selected-only').onchange=()=>{browsePage=0;renderSelection();};
$('browse-previous').onclick=()=>{browsePage--;renderSelection();$('browse-view').scrollIntoView({block:'start'});};
$('browse-next').onclick=()=>{browsePage++;renderSelection();$('browse-view').scrollIntoView({block:'start'});};
$('expand-groups').onclick=()=>{
  const eligible=browseCandidates();
  const pageGroups=groupPrompts(eligible).slice(browsePage*20,browsePage*20+20),collapse=pageGroups.every(g=>expandedPrompts.has(g.id));
  for(const g of pageGroups)collapse?expandedPrompts.delete(g.id):expandedPrompts.add(g.id);
  renderSelection();
};
$('prompt-list').onclick=e=>{const b=e.target.closest('[data-prompt]');if(b){promptId=b.dataset.prompt;responseId='';analysisId='';render();}};
$('response-tabs').onclick=e=>{const b=e.target.closest('[data-response]');if(b){responseId=b.dataset.response;analysisId='';renderPrompt();}};
$('provider').onchange=()=>{updateCollectionModels();browsePage=0;analysisId='';drill='';render();};$('collection-model').onchange=()=>{browsePage=0;analysisId='';drill='';render();};$('version').onchange=()=>{analysisId='';drill='';updateTargetModels();render();};$('prompt-search').oninput=()=>{browsePage=0;drill='';render();};
$('prompt-template').onchange=()=>{updatePromptFilters();browsePage=0;drill='';analysisId='';render();};
$('prompt-param').onchange=()=>{browsePage=0;drill='';analysisId='';render();};
$('target-brand').onchange=()=>{updateTargetModels();drill='';render();};$('target-model').onchange=()=>{drill='';render();};
$('funnel').onclick=e=>{const b=e.target.closest('[data-metric]');if(b){drill=drill===b.dataset.metric?'':b.dataset.metric;render();$('response-details').scrollIntoView({block:'start'});$('response-details').focus({preventScroll:true});}};
$('clear-drill').onclick=()=>{drill='';render();};
$('selection-list').onchange=e=>{
  const box=e.target;if(box.dataset.responseSelect)selectedResponses=updateSelection(selectedResponses,selectionCandidates.filter(r=>r.task_id===box.dataset.responseSelect),box.checked);
  else if(box.dataset.promptSelect)selectedResponses=updateSelection(selectedResponses,selectionCandidates.filter(r=>r.prompt_id===box.dataset.promptSelect),box.checked);
  else return;saveSelection();drill='';analysisId='';render();
};
$('select-visible').onclick=()=>{selectedResponses=updateSelection(selectedResponses,browseCandidates(),true);saveSelection();drill='';render();};
$('deselect-visible').onclick=()=>{selectedResponses=updateSelection(selectedResponses,browseCandidates(),false);saveSelection();drill='';render();};
$('analysis-picker').onchange=e=>{analysisId=e.target.value;currentAnalysis=selectAnalysis(currentResponse,version(),analysisId);evidence='';renderSource();renderAnalysis();};
$('entity-search').oninput=$('recommended').onchange=$('top-only').onchange=$('entity-sort').onchange=renderEntities;
$('entities').onclick=e=>{const b=e.target.closest('[data-entity]');if(b){entityKey=b.dataset.entity;$('category').value='all';$('sentiment').value='all';renderEntities();}};
$('category').onchange=$('sentiment').onchange=renderAssessments;
function showEvidence(value){if(!currentResponse||!selectedResponses.has(currentResponse.task_id))return;openSource(currentResponse);evidence=value;renderSource();$('source-text').focus({preventScroll:true});}
$('assessments').onclick=e=>{const b=e.target.closest('[data-evidence]');if(b)showEvidence(currentEntities.find(x=>x.key===entityKey).kbf_assessments[Number(b.dataset.evidence)].evidence);};
$('recommendation').onclick=e=>{const b=e.target.closest('[data-recommendation]');if(b)showEvidence(recommendationEvidence(currentEntities.find(x=>x.key===entityKey))[Number(b.dataset.recommendation)]?.evidence||'');};
$('clear-evidence').onclick=()=>{evidence='';renderSource();};
function download(value,name,type){const url=URL.createObjectURL(new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('export').onclick=()=>{const rows=activeView==='analysis'?groups.flatMap(g=>g.responses):selectedScope().selected;if(!rows.length)return;download(csv([['prompt_id','prompt_text','response_id','provider','model_name','collected_at','analysis_status','response_text'],...rows.map(r=>[r.prompt_id,r.prompt_text,r.task_id,r.provider,r.model_name,r.collected_at,selectAnalysis(r,version())?.analysis_status,r.response_text])]),'geo-responses.csv','text/csv;charset=utf-8');toast(rows.length+'개 응답을 내려받았습니다.');};
$('analysis-export').onclick=()=>{if(currentAnalysis&&selectedResponses.has(responseId))download(JSON.stringify({prompt_id:promptId,response_id:responseId,analysis:currentAnalysis},null,2),'geo-analysis-'+promptId+'.json','application/json');};
$('import').onclick=$('open-data').onclick=()=>$('data-file').click();
$('data-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100*1024**2)throw Error('100MB 이하의 데이터 파일을 선택하세요.');setData(JSON.parse(await file.text()));toast('데이터를 불러왔습니다.');}catch(error){toast(error.message);}finally{e.target.value='';}};
try{const response=await fetch('./data.json',{cache:'no-store'});if(!response.ok)throw Error('데이터 파일을 열어 시작하세요.');setData(await response.json());}
catch(error){$('loading').hidden=true;$('empty').hidden=false;$('load-message').textContent=error.message==='데이터 파일을 열어 시작하세요.'?'BigQuery에서 내보낸 대시보드 데이터 파일을 여세요. 파일은 서버로 전송되지 않습니다.':'데이터를 읽지 못했습니다. 올바른 대시보드 JSON 파일을 선택하세요.';}
