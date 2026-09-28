export function validateData(data) {
  if(data?.schema_version!==1||!Array.isArray(data.responses)||!Array.isArray(data.categories))throw Error('지원하는 대시보드 데이터 파일이 아닙니다.');
  const ids=new Set();
  for(const r of data.responses){
    if(!r.task_id||ids.has(r.task_id)||!r.prompt_id||typeof r.prompt_text!=='string'||typeof r.response_text!=='string'||!Array.isArray(r.analyses)||!Array.isArray(r.references))throw Error('응답 ID 또는 데이터 구조를 확인하세요.');
    ids.add(r.task_id);
    for(const a of r.analyses){
      if(a.task_id!==r.task_id||!a.analysis_id||!Array.isArray(a.entities)||!Array.isArray(a.mentions))throw Error('분석과 응답의 연결이 올바르지 않습니다.');
      if(a.schema_version===3&&a.entities.some(e=>(typeof e.is_top_recommended!=='boolean'&&e.is_top_recommended!==null)||(e.is_top_recommended===true&&e.is_recommended!==true)))throw Error('최우선 추천 데이터가 올바르지 않습니다.');
    }
  }
  return data;
}
export function availableAnalyses(response,version='latest'){
  if(isReferenceVersion(version))return response.references.filter(r=>version==='reference'||r.rubric_id===version.slice(10)).map(referenceAnalysis).sort((a,b)=>(b.analyzed_at||'').localeCompare(a.analyzed_at||'')||b.revision-a.revision||b.analysis_id.localeCompare(a.analysis_id));
  return response.analyses.filter(a=>version==='latest'||a.judge_version_id===version).slice().sort((a,b)=>(b.analyzed_at||'').localeCompare(a.analyzed_at||'')||b.analysis_id.localeCompare(a.analysis_id));
}
export function selectAnalysis(response,version='latest',id=''){
  const candidates=availableAnalyses(response,version);
  return candidates.find(a=>a.analysis_id===id)||candidates[0]||null;
}
export function isReferenceVersion(version){return version==='reference'||version.startsWith('reference:');}
function referenceAnalysis(ref){
  const output=ref.expected_output||{},entities=output.entities||[];
  return {...ref,analysis_id:ref.record_id,judge_name:ref.rubric_name||'AI 참조 초안',category_set_id:ref.category_set_id||'kbf_groups_v1',schema_version:ref.schema_version||(entities.some(e=>'is_top_recommended' in e)?3:2),entity_unit:ref.entity_unit||(output.aggregation?'master':'extracted'),entities,analyzed_at:ref.created_at||'',is_reference:true};
}
export function analysisLabel(a){return !a?'':a.is_customer_export?'고객사 DB 공식 결과':a.entity_unit==='master'?'마스터 단위 · 파생 초안':a.schema_version===3?'개체 분석 v3 · 최우선 추천':a.schema_version===2?'이전 개체 분석 · 최우선 미제공':'이전 언급 분석 · 최우선 미제공';}
export function recommendationEvidence(entity){
  const value=entity.recommendation_evidence;
  return typeof value==='string'?(value?[{evidence:value}]:[]):Array.isArray(value)?value.filter(v=>typeof v.evidence==='string'&&v.evidence):[];
}
export function sentimentScore(entity){
  const assessments=entity?.kbf_assessments||[];
  const positive=assessments.filter(k=>k.sentiment==='POSITIVE').length;
  const negative=assessments.filter(k=>k.sentiment==='NEGATIVE').length;
  return {positive,negative,percent:positive+negative?100*positive/(positive+negative):null};
}
export function priorityText(entity,analysis){return analysis?.schema_version===3&&typeof entity.is_top_recommended==='boolean'?(entity.is_top_recommended?'예':'아니오'):'미제공';}
export function sortEntities(entities,order='default',analysis){
  const rows=entities.slice();
  const compare=(a,b)=>String(a||'').localeCompare(String(b||''),'ko',{numeric:true,sensitivity:'base'});
  const model=e=>e.model||e.family_name||'';
  const byModel=(a,b)=>Number(!model(a))-Number(!model(b))||compare(model(a),model(b))||compare(a.brand,b.brand);
  const byBrand=(a,b)=>Number(!a.brand)-Number(!b.brand)||compare(a.brand,b.brand)||byModel(a,b);
  const top=e=>analysis?.schema_version===3&&typeof e.is_top_recommended==='boolean'?(e.is_top_recommended?0:1):2;
  const recommended=e=>typeof e.is_recommended==='boolean'?(e.is_recommended?0:1):2;
  if(order==='default')rows.sort((a,b)=>top(a)-top(b)||recommended(a)-recommended(b)||byBrand(a,b));
  if(order==='recommended')rows.sort((a,b)=>recommended(a)-recommended(b)||byBrand(a,b));
  if(order==='model-asc')rows.sort(byModel);
  if(order==='model-desc')rows.sort((a,b)=>Number(!model(a))-Number(!model(b))||compare(model(b),model(a))||compare(a.brand,b.brand));
  if(order==='brand')rows.sort(byBrand);
  if(order==='top')rows.sort((a,b)=>top(a)-top(b)||byBrand(a,b));
  return rows;
}
export function entitiesOf(analysis){
  if(!analysis)return [];
  if([2,3].includes(analysis.schema_version))return analysis.entities.map((e,i)=>({...e,key:String(i),kbf_assessments:e.kbf_assessments||[]}));
  // Preserve legacy mention-level decisions; do not infer entity-level rank or recommendation.
  return (analysis.mentions||[]).map((m,i)=>({key:String(i),brand:m.brand,model:(m.vehicle_models||[]).map(v=>v.model_name).join(', '),is_recommended:m.is_recommended,rank:null,recommendation_evidence:m.is_recommended?m.evidence:'',legacy:true,kbf_assessments:[{category_id:m.rfp_id,sentiment:m.sentiment,content:m.content,evidence:m.evidence}]}));
}
export function groupPrompts(responses,query='',provider='all'){
  const q=query.trim().toLocaleLowerCase(),groups=new Map();
  for(const r of responses){
    if(provider!=='all'&&r.provider!==provider)continue;
    if(q&&!`${r.prompt_id} ${r.prompt_text} ${r.prompt_note||''} ${promptPresentation(r.prompt_text).title}`.toLocaleLowerCase().includes(q))continue;
    if(!groups.has(r.prompt_id))groups.set(r.prompt_id,{id:r.prompt_id,text:r.prompt_text,responses:[]});
    groups.get(r.prompt_id).responses.push(r);
  }
  return [...groups.values()].sort((a,b)=>a.id.localeCompare(b.id));
}

// Display labels describe the question, never invent conclusions about its answer.
// Exact-text mappings avoid reusing a title if the text behind an ID changes.
export function promptPresentation(text){
  const source=String(text||'').trim(),normalized=source.toLocaleLowerCase().replace(/\s+/g,' ');
  const known=[
    ['What are the best SUV brands to consider in Australia in 2026?','SUV 브랜드 추천 · 2026','추천'],
    ['Should I buy a hybrid or a fully electric car in Australia?','하이브리드 vs 전기차','비교'],
    ['Are Chinese electric car brands reliable enough to buy in Australia?','중국 전기차 브랜드 신뢰성','신뢰성'],
    ['Hyundai vs Toyota — which brand has better long-term reliability in Australia?','Hyundai vs Toyota · 장기 신뢰성','비교'],
    ['Hyundai vs BYD warranty and service network comparison in Australia','Hyundai vs BYD · 보증·서비스','비교'],
    ['Hyundai Tucson vs Mazda CX-5 — which mid-size SUV is better in Australia?','Tucson vs CX-5 · 중형 SUV','비교'],
    ['Hyundai vs Mazda — which brand has better resale value in Australia?','Hyundai vs Mazda · 중고차 가치','비교'],
    ['Hyundai Ioniq 5 vs Tesla Model Y vs BYD Atto 3 — best EV SUV in Australia?','IONIQ 5 vs Model Y vs Atto 3','비교'],
    ["I'm worried about BYD's battery safety — should I pay more for a Hyundai?",'BYD 배터리 안전성 · Hyundai 대안','안전성'],
    ['What do Hyundai Ioniq 5 owners actually think after 12 months in Australia?','IONIQ 5 · 1년 실사용 평가','사용 경험'],
    ['Is Hyundai considered a premium brand in Australia, or still seen as budget?','Hyundai 브랜드 인식','브랜드 인식'],
  ];
  const exact=known.find(([question])=>question.toLocaleLowerCase()===normalized);
  if(exact)return {title:exact[1],kind:exact[2],market:/Australia/i.test(source)?'호주':''};
  let match;
  if((match=source.match(/^What is the best (.+) to buy in (.+) right now\?$/i))){
    const category={car:'차량',suv:'SUV',ev:'전기차','family car':'패밀리카'}[match[1].toLowerCase()]||match[1];
    return {title:category+' 추천',kind:'추천',market:match[2]==='Australia'?'호주':match[2]};
  }
  if((match=source.match(/^How does (.+) compare to (.+) in (.+)\?$/i)))return {title:match[1]+' vs '+match[2],kind:'비교',market:match[3]==='Australia'?'호주':match[3]};
  if((match=source.match(/^In (.+), I'm looking at (.+) but want to explore other options — what would you recommend for now\?$/i)))return {title:match[2]+' 대안',kind:'대안',market:match[1]==='Australia'?'호주':match[1]};
  if((match=source.match(/^What are the pros and cons of (.+) to buy in (.+) for now\?$/i)))return {title:match[1]+' 장단점',kind:'장단점',market:match[2]==='Australia'?'호주':match[2]};
  const first=source.split(/\r?\n/).find(v=>v.trim())||'제목 없는 질문';
  return {title:first.length>72?first.slice(0,69)+'…':first,kind:'질문',market:''};
}

export function responseScope(responses,selectedIds,query='',provider='all',model='all'){
  const candidates=groupPrompts(responses,query,provider).flatMap(g=>g.responses).filter(r=>model==='all'||r.model_name===model);
  return {candidates,selected:candidates.filter(r=>selectedIds.has(r.task_id))};
}
export function coverage(responses,version){return responses.filter(r=>selectAnalysis(r,version)).length;}
export function csv(rows){
  const cell=v=>'"'+(/^[=+@\-\t\r\n]/.test(String(v??''))?"'":'')+String(v??'').replaceAll('"','""')+'"';
  return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
}
export function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function highlighted(text,evidence){
  const at=evidence?text.indexOf(evidence):-1;
  return at<0?escapeHTML(text):escapeHTML(text.slice(0,at))+'<mark id="evidence-match">'+escapeHTML(evidence)+'</mark>'+escapeHTML(text.slice(at+evidence.length));
}

// Aggregate one selected analysis per response, never analysis history rows.
export function latestSchemaData(input){
  if(input.source_kind==='customer_export')return input;
  const responses=input.responses.map(r=>({...r,analyses:r.analyses.filter(a=>a.schema_version===3),references:r.references.filter(a=>a.schema_version===3)})).filter(r=>r.analyses.length);
  const versions=new Map();
  for(const r of responses)for(const a of r.analyses){
    if(!versions.has(a.judge_version_id))versions.set(a.judge_version_id,{id:a.judge_version_id,name:a.judge_name,ids:new Set(),results:0});
    const v=versions.get(a.judge_version_id);v.ids.add(r.task_id);v.results++;
  }
  return {...input,responses,excluded_legacy_responses:(input.excluded_legacy_responses||0)+input.responses.length-responses.length,
    versions:[...versions.values()].map(({ids,...v})=>({...v,responses:ids.size})).sort((a,b)=>b.responses-a.responses||a.id.localeCompare(b.id))};
}
export function targetKey(value){return String(value||'').normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s_-]+/g,'');}
export function brandKey(value){const key=targetKey(value);return ['현대','현대자동차','hyundaimotor','hyundaimotors'].includes(key)?'hyundai':key;}
export function responseSignals(response,version,brand='hyundai',model='all'){
  const a=selectAnalysis(response,version);
  if(!a||a.schema_version!==3||(a.analysis_status&&a.analysis_status!=='SUCCEEDED'))return null;
  const entities=a.entities.filter(e=>brandKey(e.brand)===brand&&(model==='all'||targetKey(e.model)===model));
  const assessments=entities.flatMap(e=>e.kbf_assessments||[]);
  const positiveCount=assessments.filter(k=>k.sentiment==='POSITIVE').length,negativeCount=assessments.filter(k=>k.sentiment==='NEGATIVE').length;
  const bool=field=>entities.some(e=>e[field]===true)?true:entities.some(e=>typeof e[field]!=='boolean')?null:false;
  return {exposure:entities.length>0,positive:positiveCount>negativeCount,positiveCount,negativeCount,recommended:bool('is_recommended'),top:bool('is_top_recommended'),mixed:positiveCount>0&&negativeCount>0};
}
export function aggregateResponses(responses,version,brand='hyundai',model='all'){
  const unique=[...new Map(responses.map(r=>[r.task_id,r])).values()];
  const rows=unique.map(response=>({response,signals:responseSignals(response,version,brand,model)})).filter(r=>r.signals);
  const metrics=['exposure','positive','recommended','top'].map(key=>({key,count:rows.filter(r=>r.signals[key]===true).length,unknown:rows.filter(r=>r.signals[key]===null).length}));
  return {rows,total:rows.length,excluded:unique.length-rows.length,mixed:rows.filter(r=>r.signals.mixed).length,metrics};
}
export function deploymentLabel(data,id){
  if(!id||!data.production)return '';
  if(data.production.current_judge_id===id)return '현재 운영';
  return data.production.previous_judge_ids?.includes(id)?'이전 운영':'';
}
export function selectionState(responses,selected){
  const count=responses.filter(r=>selected.has(r.task_id)).length;
  return {count,checked:responses.length>0&&count===responses.length,indeterminate:count>0&&count<responses.length};
}
export function updateSelection(selected,responses,include){
  const next=new Set(selected);for(const r of responses)if(include)next.add(r.task_id);else next.delete(r.task_id);return next;
}

export function analysisStatusText(a){return !a?'분석 없음':({SUCCEEDED:'분석 완료',PARTIAL:'부분 결과 · 집계 제외',NOT_ANALYZED:'미분석 · 집계 제외',NOT_INCLUDED:'분석 대상 제외',PROCESSING:'분석 중 · 집계 제외',FAILED:'분석 실패 · 집계 제외',UNKNOWN:'상태 미확인 · 집계 제외'}[a.analysis_status]||'상태 미제공');}
