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
  if(isReferenceVersion(version))return response.references.filter(r=>version==='reference'||r.rubric_id===version.slice(10)).map(referenceAnalysis).sort((a,b)=>b.analyzed_at.localeCompare(a.analyzed_at)||b.revision-a.revision||b.analysis_id.localeCompare(a.analysis_id));
  return response.analyses.filter(a=>version==='latest'||a.judge_version_id===version).slice().sort((a,b)=>b.analyzed_at.localeCompare(a.analyzed_at)||b.analysis_id.localeCompare(a.analysis_id));
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
export function analysisLabel(a){return !a?'':a.entity_unit==='master'?'마스터 단위 · 파생 초안':a.schema_version===3?'개체 분석 v3 · 최우선 추천':a.schema_version===2?'이전 개체 분석 · 최우선 미제공':'이전 언급 분석 · 최우선 미제공';}
export function recommendationEvidence(entity){
  const value=entity.recommendation_evidence;
  return typeof value==='string'?(value?[{evidence:value}]:[]):Array.isArray(value)?value.filter(v=>typeof v.evidence==='string'&&v.evidence):[];
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
    if(q&&!`${r.prompt_id} ${r.prompt_text} ${r.prompt_note||''}`.toLocaleLowerCase().includes(q))continue;
    if(!groups.has(r.prompt_id))groups.set(r.prompt_id,{id:r.prompt_id,text:r.prompt_text,responses:[]});
    groups.get(r.prompt_id).responses.push(r);
  }
  return [...groups.values()].sort((a,b)=>a.id.localeCompare(b.id));
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
  if(!a||a.schema_version!==3||a.analysis_status==='PARTIAL')return null;
  const entities=a.entities.filter(e=>brandKey(e.brand)===brand&&(model==='all'||targetKey(e.model)===model));
  const assessments=entities.flatMap(e=>e.kbf_assessments||[]);
  const positive=assessments.some(k=>k.sentiment==='POSITIVE'),negative=assessments.some(k=>k.sentiment==='NEGATIVE');
  const bool=field=>entities.some(e=>e[field]===true)?true:entities.some(e=>typeof e[field]!=='boolean')?null:false;
  return {exposure:entities.length>0,positive,recommended:bool('is_recommended'),top:bool('is_top_recommended'),mixed:positive&&negative};
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
