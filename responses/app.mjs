import {validateData,availableAnalyses,selectAnalysis,entitiesOf,groupPrompts,coverage,csv,escapeHTML as esc,highlighted,isReferenceVersion,analysisLabel,recommendationEvidence,priorityText,sortEntities,latestSchemaData,brandKey,targetKey,aggregateResponses,deploymentLabel,selectionState,updateSelection,analysisStatusText,sentimentScore} from './model.mjs?v=5671ab6f6463';
const $=id=>document.getElementById(id), providerName={OPENAI:'OpenAI',GOOGLE:'Google',ANTHROPIC:'Anthropic'},sentiments={POSITIVE:'긍정',NEUTRAL:'중립',NEGATIVE:'부정'};
let data,groups=[],promptId='',responseId='',analysisId='',entityKey='',currentResponse,currentAnalysis,currentEntities=[],evidence='',timer;
let drill='',population=[],selectedResponses=new Set(),selectionCandidates=[];
const metricNames={exposure:'노출',positive:'긍정 노출',recommended:'추천',top:'최우선 추천'};
const percent=(count,total)=>total?(count/total*100).toFixed(1)+'%':'—';
const date=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,3500);}
function categoryName(id){if(!id)return '미분류';const c=data.categories.find(c=>c.category_set_id===currentAnalysis?.category_set_id&&c.rfp_id===id);return c?.rfp_name||id;}
function version(){return $('version').value;}
function setData(value){
  if(value.source_kind!=='customer_export'||value.source!=='hyundai-global-search.global_geo')throw Error('고객사 DB에서 갱신한 데이터 파일을 사용하세요.');
  data=validateData(latestSchemaData(value));drill='';selectedResponses=new Set(data.responses.map(r=>r.task_id));$('loading').hidden=true;$('empty').hidden=true;$('dashboard').hidden=false;$('export').disabled=false;
  $('snapshot').textContent=`스냅샷 ${date(data.exported_at)} KST`;
  $('provider').innerHTML='<option value="all">전체</option>'+[...new Set(data.responses.map(r=>r.provider))].sort().map(p=>`<option value="${esc(p)}">${esc(providerName[p]||p)}</option>`).join('');
  const rubrics=new Map();
  for(const r of data.responses)for(const ref of r.references)if(ref.rubric_id){if(!rubrics.has(ref.rubric_id))rubrics.set(ref.rubric_id,{name:ref.rubric_name||ref.rubric_id,ids:new Set()});rubrics.get(ref.rubric_id).ids.add(r.task_id);}
  $('version').innerHTML=data.versions.map(v=>`<option value="${esc(v.id)}">${esc(v.name)} · ${v.responses}응답</option>`).join('');
  $('version').value=data.versions[0]?.id||'latest';
  $('production-note').textContent='분석 모델의 운영 채택 정보는 고객사 DB에 제공되지 않습니다.';
  const brands=new Map();for(const r of data.responses)for(const a of [...r.analyses,...r.references.map(x=>({entities:x.expected_output?.entities||[]}))])for(const e of a.entities)if(e.brand)brands.set(brandKey(e.brand),e.brand);
  if(!brands.has('hyundai'))brands.set('hyundai','Hyundai');
  $('target-brand').innerHTML=[...brands].sort((a,b)=>a[1].localeCompare(b[1])).map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join('');$('target-brand').value='hyundai';updateTargetModels();
  const hash=new URLSearchParams(location.hash.slice(1));promptId=hash.get('prompt')||'';responseId=hash.get('response')||'';analysisId='';entityKey='';render();
}
function render(){
  const filtered=groupPrompts(data.responses,$('prompt-search').value,$('provider').value).flatMap(g=>g.responses);
  selectionCandidates=filtered;renderSelection();
  const included=filtered.filter(r=>selectedResponses.has(r.task_id));
  const aggregate=aggregateResponses(included,version(),$('target-brand').value,$('target-model').value);
  population=aggregate.rows.map(row=>row.response);renderOverview(aggregate,included.length);
  groups=groupPrompts(drill?aggregate.rows.filter(row=>row.signals[drill]===true).map(row=>row.response):included);
  if(!groups.some(g=>g.id===promptId)){promptId=groups[0]?.id||'';responseId='';analysisId='';}
  const visible=groups.flatMap(g=>g.responses),analysed=coverage(visible,version());
  $('counts').innerHTML=`<span>등록 프롬프트<strong>${data.counts.prompts}</strong></span><span>전체 응답<strong>${data.responses.length}</strong></span><span>집계 모집단<strong>${population.length}</strong></span>`;
  $('scope-note').textContent=`고객사 DB · ${data.export_info.export_version} · 데이터 기준 ${date(data.export_info.snapshot_at)} KST · 응답이 있는 프롬프트 ${data.counts.prompts_with_responses}개`;
  $('drill-note').textContent=drill?`${metricNames[drill]} 해당 ${visible.length}건`:`전체 ${visible.length}건`;$('clear-drill').hidden=!drill;
  $('prompt-count').textContent=groups.length+'개 프롬프트';
  $('prompt-list').innerHTML=groups.map(g=>`<button class="prompt-item ${g.id===promptId?'active':''}" data-prompt="${esc(g.id)}" ${g.id===promptId?'aria-current="true"':''}><code>${esc(g.id)}</code><span>${esc(g.text)}</span><small>응답 ${g.responses.length} · ${isReferenceVersion(version())?'초안':'분석'} ${coverage(g.responses,version())}</small></button>`).join('')||'<div class="blank">검색 결과 없음</div>';
  $('detail').hidden=!groups.length;$('no-prompt').hidden=!!groups.length;$('export').disabled=!visible.length;
  if(groups.length)renderPrompt();
}
function renderSelection(){
  const list=$('selection-list'),opened=new Set([...list.querySelectorAll('details[open]')].map(e=>e.dataset.promptGroup));
  const active=document.activeElement,focusResponse=active?.dataset?.responseSelect,focusPrompt=active?.dataset?.promptSelect;
  const promptGroups=groupPrompts(selectionCandidates),visible=selectionState(selectionCandidates,selectedResponses);
  $('selection-count').textContent=`전체 ${selectedResponses.size}/${data.responses.length}응답 선택 · 현재 목록 ${visible.count}/${selectionCandidates.length}`;
  $('select-visible').disabled=!selectionCandidates.length||visible.checked;$('deselect-visible').disabled=!visible.count;
  list.innerHTML=promptGroups.map(g=>{
    const state=selectionState(g.responses,selectedResponses);
    return `<div class="selection-group"><label class="prompt-check"><input type="checkbox" data-prompt-select="${esc(g.id)}" ${state.checked?'checked':''} aria-label="${esc(g.id)} 전체 응답 선택"></label><details data-prompt-group="${esc(g.id)}" ${opened.has(g.id)?'open':''}><summary><code>${esc(g.id)}</code><span>${esc(g.text)}</span><small>${state.count}/${g.responses.length}</small></summary><div class="response-choices">${g.responses.map(r=>{
      const a=selectAnalysis(r,version()),status=analysisStatusText(a);
      return `<label class="response-choice"><input type="checkbox" data-response-select="${esc(r.task_id)}" ${selectedResponses.has(r.task_id)?'checked':''}><span><strong>${esc(providerName[r.provider]||r.provider)}</strong> · ${esc(r.model_name)} <small>${esc(date(r.collected_at))} · ${esc(r.task_id.slice(0,8))}${status?' · '+status:''}</small></span></label>`;
    }).join('')}</div></details></div>`;
  }).join('')||'<div class="blank">현재 필터에 해당하는 응답이 없습니다.</div>';
  for(const box of list.querySelectorAll('[data-prompt-select]'))box.indeterminate=selectionState(promptGroups.find(g=>g.id===box.dataset.promptSelect).responses,selectedResponses).indeterminate;
  if(focusResponse||focusPrompt){const box=[...list.querySelectorAll('input')].find(e=>focusResponse?e.dataset.responseSelect===focusResponse:e.dataset.promptSelect===focusPrompt);box?.focus({preventScroll:true});}
}
function updateTargetModels(){
  const models=new Map();for(const r of data.responses)for(const a of [selectAnalysis(r,version())].filter(Boolean))for(const e of a.entities)if(brandKey(e.brand)===$('target-brand').value&&e.model&&targetKey(e.model)!=='null')models.set(targetKey(e.model),e.model);
  $('target-model').innerHTML='<option value="all">브랜드 전체</option>'+[...models].sort((a,b)=>a[1].localeCompare(b[1],'ko',{numeric:true})).map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join('');
}
function renderOverview(result,filteredCount){
  $('population-note').textContent=`모집단 ${result.total}건 · 미완료·부분 결과 ${filteredCount-result.total}건 집계 제외 (상세 조회 가능) · 막대를 누르면 해당 응답 보기`;
  $('funnel').innerHTML=result.metrics.map(m=>`<button class="funnel-row ${drill===m.key?'selected':''}" data-metric="${m.key}" aria-pressed="${drill===m.key}"><span>${metricNames[m.key]}</span><meter min="0" max="${result.total||1}" value="${m.count}" aria-label="${metricNames[m.key]} 비율">${percent(m.count,result.total)}</meter><strong>${percent(m.count,result.total)}</strong><small>${m.count} / ${result.total}${m.unknown?' · 미판정 '+m.unknown:''}</small></button>`).join('');
  $('mixed-note').textContent=`긍정 노출: 긍정 수 > 부정 수 · 긍정·부정 혼재 ${result.mixed}건 · 동일 모집단 기준`;
  $('provider-summary').innerHTML=[...new Set(population.map(r=>r.provider))].sort().map(p=>{
    const a=aggregateResponses(population.filter(r=>r.provider===p),version(),$('target-brand').value,$('target-model').value);
    return `<tr><th scope="row">${esc(providerName[p]||p)}</th><td>${a.total}</td>${a.metrics.map(m=>`<td title="${m.count}/${a.total}${m.unknown?' · 미판정 '+m.unknown:''}">${percent(m.count,a.total)}</td>`).join('')}</tr>`;
  }).join('')||'<tr><td colspan="6" class="blank">집계할 응답이 없습니다.</td></tr>';
}
function renderPrompt(){
  const g=groups.find(g=>g.id===promptId);
  if(!g.responses.some(r=>r.task_id===responseId)){responseId=g.responses[0].task_id;analysisId='';}
  currentResponse=g.responses.find(r=>r.task_id===responseId);
  $('prompt-id').textContent=g.id;$('prompt-text').textContent=currentResponse.prompt_text;
  $('response-tabs').innerHTML=g.responses.map(r=>`<button data-response="${esc(r.task_id)}" class="${r.task_id===responseId?'active':''}" aria-pressed="${r.task_id===responseId}"><strong>${esc(providerName[r.provider]||r.provider)}</strong><small>${esc(r.model_name)}${g.responses.filter(x=>x.provider===r.provider).length>1?' · '+esc(r.response_id.slice(0,8)):''}</small></button>`).join('');
  $('response-meta').innerHTML=`수집 ${esc(date(currentResponse.collected_at))} KST · 웹 검색 ${currentResponse.web_search_enabled===true?'사용':currentResponse.web_search_enabled===false?'미사용':'미제공'}<details><summary>응답 식별 정보</summary>응답 ID: ${esc(responseId)}</details>`;
  history.replaceState(null,'','#'+new URLSearchParams({prompt:promptId,response:responseId}));
  evidence='';$('source-text').scrollTop=0;renderSource();
  $('reasoning-wrap').hidden=!currentResponse.reasoning_summary;$('reasoning-text').textContent=currentResponse.reasoning_summary||'';$('reasoning-wrap').open=false;
  const candidates=availableAnalyses(currentResponse,version());
  currentAnalysis=selectAnalysis(currentResponse,version(),analysisId);analysisId=currentAnalysis?.analysis_id||'';
  $('analysis-picker').innerHTML=candidates.length?candidates.map(a=>`<option value="${esc(a.analysis_id)}" ${a.analysis_id===analysisId?'selected':''}>${esc(date(a.analyzed_at))} · ${deploymentLabel(data,a.judge_version_id)?'['+deploymentLabel(data,a.judge_version_id)+'] ':''}${esc(a.judge_name)}</option>`).join(''):'<option>저장 결과 없음</option>';
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
  $('analysis-meta').innerHTML=!a?'':`<span class="tag ${a.analysis_status==='SUCCEEDED'?'':'draft'}">${esc(analysisStatusText(a))}</span> · ${esc(analysisLabel(a))}<details><summary>데이터 식별 정보</summary>공개 버전: ${esc(a.export_version)}<br>응답 ID: ${esc(a.response_id)}<br>분석 시각: ${esc(date(a.analyzed_at))}</details>`;
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
  $('entity-summary').textContent=`${legacy?'언급':'개체'} ${entities.length}개 / 전체 ${currentEntities.length}개${top?' · 최우선은 최종 선택 여부':' · 이전 분석에는 최우선 여부가 없습니다'}`;
  $('entities').innerHTML=entities.map(e=>`<tr class="${e.key===entityKey?'active':''}"><td><button class="entity-name" data-entity="${esc(e.key)}" aria-pressed="${e.key===entityKey}"><span>${esc(e.brand||'브랜드 미지정')}</span><strong>${esc(entityName(e))}</strong></button></td><td>${e.is_recommended===null?'미판정':e.is_recommended?'추천':'—'}</td><td>${esc(priorityText(e,currentAnalysis))}</td><td class="score-cell" title="${esc(scoreBasis(e))}">${scoreText(e)}</td><td>${e.kbf_assessments.length}</td></tr>`).join('')||`<tr><td colspan="5" class="blank">${currentEntities.length?'검색 결과 없음':analysisStatusText(currentAnalysis)+' · 저장된 항목 없음'}</td></tr>`;
  $('entity-detail').hidden=!entities.length;
  if(entities.length)renderEntity();
}
function scoreText(e){const score=sentimentScore(e);return score.percent===null?'평가 없음':score.percent.toFixed(1)+'%';}
function scoreBasis(e){const score=sentimentScore(e);return `긍정 ${score.positive} · 부정 ${score.negative} · 중립 제외`;}
function entityName(e){return e.model||e.family_name||(e.scope==='OUT_OF_MASTER_SCOPE'?'범위 미확정':'브랜드 전체');}
function renderEntity(){
  const e=currentEntities.find(e=>e.key===entityKey);if(!e)return;
  $('entity-title').textContent=[e.brand,entityName(e)].filter(Boolean).join(' · ');
  $('recommendation').innerHTML=(e.is_recommended===null?'추천 미판정':e.is_recommended?e.legacy?'해당 언급에서 추천':'추천':'추천 대상 아님')+` · 최우선 추천: ${priorityText(e,currentAnalysis)}`+recommendationEvidence(e).map((r,i)=>`<br><button class="small" data-recommendation="${i}">${esc(r.raw_model?r.raw_model+' · 근거':'추천 근거 보기')}</button>`).join('');
  $('sentiment-score').textContent=`긍부정 점수 ${scoreText(e)} · ${scoreBasis(e)}${currentAnalysis.analysis_status==='PARTIAL'?' · 부분 결과 기준':''}`;
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
$('prompt-list').onclick=e=>{const b=e.target.closest('[data-prompt]');if(b){promptId=b.dataset.prompt;responseId='';analysisId='';render();}};
$('response-tabs').onclick=e=>{const b=e.target.closest('[data-response]');if(b){responseId=b.dataset.response;analysisId='';renderPrompt();}};
$('provider').onchange=()=>{analysisId='';drill='';render();};$('version').onchange=()=>{analysisId='';drill='';updateTargetModels();render();};$('prompt-search').oninput=()=>{drill='';render();};
$('target-brand').onchange=()=>{updateTargetModels();drill='';render();};$('target-model').onchange=()=>{drill='';render();};
$('funnel').onclick=e=>{const b=e.target.closest('[data-metric]');if(b){drill=drill===b.dataset.metric?'':b.dataset.metric;render();document.querySelector('.detail-heading').scrollIntoView({block:'start'});}};
$('clear-drill').onclick=()=>{drill='';render();};
$('selection-list').onchange=e=>{
  const box=e.target;if(box.dataset.responseSelect)selectedResponses=updateSelection(selectedResponses,selectionCandidates.filter(r=>r.task_id===box.dataset.responseSelect),box.checked);
  else if(box.dataset.promptSelect)selectedResponses=updateSelection(selectedResponses,selectionCandidates.filter(r=>r.prompt_id===box.dataset.promptSelect),box.checked);
  else return;drill='';analysisId='';render();
};
$('select-visible').onclick=()=>{selectedResponses=updateSelection(selectedResponses,selectionCandidates,true);drill='';render();};
$('deselect-visible').onclick=()=>{selectedResponses=updateSelection(selectedResponses,selectionCandidates,false);drill='';render();};
$('reset-selection').onclick=()=>{selectedResponses=new Set(data.responses.map(r=>r.task_id));drill='';render();};
$('analysis-picker').onchange=e=>{analysisId=e.target.value;currentAnalysis=selectAnalysis(currentResponse,version(),analysisId);evidence='';renderSource();renderAnalysis();};
$('entity-search').oninput=$('recommended').onchange=$('top-only').onchange=$('entity-sort').onchange=renderEntities;
$('entities').onclick=e=>{const b=e.target.closest('[data-entity]');if(b){entityKey=b.dataset.entity;$('category').value='all';$('sentiment').value='all';renderEntities();}};
$('category').onchange=$('sentiment').onchange=renderAssessments;
function showEvidence(value){evidence=value;renderSource();if(evidence&&currentResponse.response_text.includes(evidence)){$('source-text').focus({preventScroll:true});if(innerWidth<=1100)$('source-text').scrollIntoView({block:'center'});}}
$('assessments').onclick=e=>{const b=e.target.closest('[data-evidence]');if(b)showEvidence(currentEntities.find(x=>x.key===entityKey).kbf_assessments[Number(b.dataset.evidence)].evidence);};
$('recommendation').onclick=e=>{const b=e.target.closest('[data-recommendation]');if(b)showEvidence(recommendationEvidence(currentEntities.find(x=>x.key===entityKey))[Number(b.dataset.recommendation)]?.evidence||'');};
$('clear-evidence').onclick=()=>{evidence='';renderSource();};
function download(value,name,type){const url=URL.createObjectURL(new Blob([value],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('export').onclick=()=>{const rows=groups.flatMap(g=>g.responses);download(csv([['prompt_id','prompt_text','response_id','provider','model_name','collected_at','analysis_status','response_text'],...rows.map(r=>[r.prompt_id,r.prompt_text,r.task_id,r.provider,r.model_name,r.collected_at,selectAnalysis(r,version())?.analysis_status,r.response_text])]),'geo-responses.csv','text/csv;charset=utf-8');toast(rows.length+'개 응답을 내려받았습니다.');};
$('analysis-export').onclick=()=>download(JSON.stringify({prompt_id:promptId,response_id:responseId,analysis:currentAnalysis},null,2),'geo-analysis-'+promptId+'.json','application/json');
$('import').onclick=$('open-data').onclick=()=>$('data-file').click();
$('data-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100*1024**2)throw Error('100MB 이하의 데이터 파일을 선택하세요.');setData(JSON.parse(await file.text()));toast('데이터를 불러왔습니다.');}catch(error){toast(error.message);}finally{e.target.value='';}};
try{const response=await fetch('./data.json',{cache:'no-store'});if(!response.ok)throw Error('데이터 파일을 열어 시작하세요.');setData(await response.json());}
catch(error){$('loading').hidden=true;$('empty').hidden=false;$('load-message').textContent=error.message==='데이터 파일을 열어 시작하세요.'?'BigQuery에서 내보낸 대시보드 데이터 파일을 여세요. 파일은 서버로 전송되지 않습니다.':'데이터를 읽지 못했습니다. 올바른 대시보드 JSON 파일을 선택하세요.';}
