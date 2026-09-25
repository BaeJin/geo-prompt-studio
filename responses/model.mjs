export function validateData(data) {
  if(data?.schema_version!==1||!Array.isArray(data.responses)||!Array.isArray(data.categories))throw Error('지원하는 대시보드 데이터 파일이 아닙니다.');
  const ids=new Set();
  for(const r of data.responses){
    if(!r.task_id||ids.has(r.task_id)||!r.prompt_id||typeof r.prompt_text!=='string'||typeof r.response_text!=='string'||!Array.isArray(r.analyses)||!Array.isArray(r.references))throw Error('응답 ID 또는 데이터 구조를 확인하세요.');
    ids.add(r.task_id);
    for(const a of r.analyses)if(a.task_id!==r.task_id||!a.analysis_id||!Array.isArray(a.entities)||!Array.isArray(a.mentions))throw Error('분석과 응답의 연결이 올바르지 않습니다.');
  }
  return data;
}
export function availableAnalyses(response,version='latest'){
  return response.analyses.filter(a=>version==='latest'||a.judge_version_id===version).slice().sort((a,b)=>b.analyzed_at.localeCompare(a.analyzed_at)||b.analysis_id.localeCompare(a.analysis_id));
}
export function selectAnalysis(response,version='latest',id=''){
  if(version==='reference'){
    const ref=response.references.slice().sort((a,b)=>b.revision-a.revision||b.record_id.localeCompare(a.record_id))[0];
    return ref?{...ref,analysis_id:ref.record_id,judge_name:'AI 참조 초안',category_set_id:'kbf_groups_v1',schema_version:2,entities:ref.expected_output?.entities||[],analyzed_at:ref.created_at,is_reference:true}:null;
  }
  const candidates=availableAnalyses(response,version);
  return candidates.find(a=>a.analysis_id===id)||candidates[0]||null;
}
export function entitiesOf(analysis){
  if(!analysis)return [];
  if(analysis.schema_version===2)return analysis.entities.map((e,i)=>({...e,key:String(i),kbf_assessments:e.kbf_assessments||[]}));
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
