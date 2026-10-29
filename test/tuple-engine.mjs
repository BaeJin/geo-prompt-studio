import {migrateParameters,appendPromptList,toCSV} from './engine.mjs';
export {appendPromptList,toCSV};
export const idPattern=/^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
export function tupleValues(values){
  if(!Array.isArray(values)||!values.length||values.length>10000)throw Error('값은 비어 있지 않은 2차원 배열이어야 합니다.');
  const width=values[0]?.length;
  for(const row of values)if(!Array.isArray(row)||!row.length||row.length!==width||row.some(v=>typeof v!=='string'||!v.trim()||v.length>50000))throw Error('각 행은 같은 개수의 비어 있지 않은 문자열이어야 합니다.');
  return values;
}
export function fieldsOf(values){
  if(typeof values==='string'||Array.isArray(values[0]))return null;
  const keys=Object.keys(values[0]);
  return keys.includes('hyundai')&&keys.includes('competitor')?['hyundai','competitor',...keys.filter(k=>!['hyundai','competitor'].includes(k)).sort()]:keys.sort();
}
export function asTuples(values){
  if(typeof values==='string')return tupleValues(values.trim().split(/\r?\n/).map(v=>[v]));
  if(Array.isArray(values[0]))return tupleValues(values);
  const keys=fieldsOf(values);return tupleValues(values.map(row=>keys.map(k=>row[k])));
}
export const valueLabels=values=>tupleValues(values).map(row=>row.join(' / '));
export function references(text){
  const matches=[...text.matchAll(/\{([^{}]+)\}/g)];
  if(/[{}]/.test(text.replace(/\{([^{}]+)\}/g,'')))throw Error('중괄호를 확인하세요.');
  return matches.map(m=>{
    const found=/^([A-Za-z0-9_][A-Za-z0-9_-]*)(?:\[(0|[1-9]\d*)\])?$/.exec(m[1]);
    if(!found)throw Error(`잘못된 참조: {${m[1]}}. {param_id} 또는 {param_id[0]}를 사용하세요.`);
    return {token:m[1],id:found[1],index:found[2]===undefined?null:Number(found[2])};
  });
}
export function validateState(s){
  if(s?.version!==4||!s.library||!Array.isArray(s.library.parameters)||!Array.isArray(s.library.templateSets)||!Array.isArray(s.combinations)||typeof s.dedupe!=='boolean')throw Error('설정 파일 형식을 확인하세요.');
  if(s.library.parameters.length>1500||s.library.templateSets.length>50||s.combinations.length>2500)throw Error('라이브러리 한도를 초과했습니다.');
  const ids=new Set();for(const p of s.library.parameters){if(typeof p.id!=='string'||!idPattern.test(p.id)||p.id.length>200||ids.has(p.id)||typeof p.name!=='string'||p.name.length>200)throw Error('파라미터 ID·이름을 확인하세요.');ids.add(p.id);tupleValues(p.values);}
  for(const set of [...s.library.templateSets,...s.combinations.map(c=>c.templateSet),...(s.workspace?.composer?[s.workspace.composer.templateSet]:[])]){
    if(!set||typeof set.id!=='string'||typeof set.name!=='string'||!Array.isArray(set.templates)||set.templates.length>100)throw Error('템플릿 형식을 확인하세요.');
    for(const t of set.templates)if(typeof t.id!=='string'||typeof t.name!=='string'||typeof t.text!=='string'||t.text.length>16000)throw Error('템플릿 형식을 확인하세요.');
  }
  return s;
}
const norm=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
export function migrateTuples(input, baseline){
  if(input?.version===4)return structuredClone(validateState(input));
  const old=migrateParameters(input),fallback=baseline?migrateParameters(baseline):null;
  const all=[...old.combinations,...(old.workspace?.composer?[old.workspace.composer]:[]),...(fallback?.combinations||[])];
  function convert(t,context){
    const contexts=context?[context]:all.filter(c=>c.templateSet.templates.some(v=>v.id===t.id&&v.text===t.text));
    return {...t,text:t.text.replace(/\{([^{}]+)\}/g,(_,slot)=>{
      const candidates=contexts.flatMap(c=>c.bindings.filter(b=>norm(b.slot)===norm(slot)));
      const targets=candidates.map(b=>{
        const keys=fieldsOf(b.parameter.values);
        const field=b.field||(keys?.length===1?keys[0]:keys?.find(k=>norm(k)===norm(slot)));
        const index=keys?keys.indexOf(field):0;
        if(index<0)throw Error(`이전 변수 {${slot}}의 필드를 확인하세요.`);
        return b.parameter.id+(asTuples(b.parameter.values)[0].length===1?'':`[${index}]`);
      });
      const unique=[...new Set(targets)];
      if(unique.length===1)return '{'+unique[0]+'}';
      if(!unique.length&&old.library.parameters.some(p=>p.id===slot))return '{'+slot+'}';
      throw Error(`이전 템플릿 '${t.name}'의 {${slot}} 연결을 확정할 수 없습니다. 원본 설정은 보존됩니다.`);
    })};
  }
  function combination(c){
    const parameters=[];
    for(const b of c.bindings){
      const p={...b.parameter,values:asTuples(b.parameter.values)},existing=parameters.find(v=>v.id===p.id);
      if(existing&&JSON.stringify(existing.values)!==JSON.stringify(p.values))throw Error('이전 조합에 서로 다른 파라미터 사본이 있습니다.');
      if(!existing)parameters.push(p);
    }
    return {id:c.id,enabled:c.enabled,mode:c.mode,templateSet:{...c.templateSet,templates:c.templateSet.templates.map(t=>convert(t,c))},parameters};
  }
  const result={...old,version:4,library:{parameters:old.library.parameters.map(p=>({...p,values:asTuples(p.values)})),templateSets:old.library.templateSets.map(s=>({...s,templates:s.templates.map(t=>convert(t))}))},combinations:old.combinations.map(combination)};
  if(old.workspace)result.workspace={...old.workspace,composer:old.workspace.composer?combination(old.workspace.composer):null,rows:appendPromptList([],old.workspace.rows).rows};
  return validateState(result);
}
export function loadTemplate(s,id,cid){
  const set=s.library.templateSets.find(t=>t.id===id);if(!set)throw Error('템플릿을 선택하세요.');
  s.combinations.push({id:cid,enabled:true,mode:'product',templateSet:{...structuredClone(set),templates:set.templates.map(t=>({...t,enabled:true}))}});
}
export function restoreWorkspace(s){return {version:1,composer:structuredClone(s.workspace?s.workspace.composer:s.combinations.find(c=>c.enabled)||null),rows:appendPromptList([],s.workspace?.rows||[]).rows};}
export function generateIndependent(s){
  validateState(s);const plans=[],errors=[];let total=0;
  const active=s.combinations.filter(c=>c.enabled);if(!active.length)errors.push('템플릿을 선택하세요.');
  for(const c of active)for(const t of c.templateSet.templates.filter(t=>t.enabled!==false))try{
    if(!t.text.trim())throw Error('질문 문장을 입력하세요.');
    const refs=references(t.text),groups=new Map();
    for(const ref of refs){
      const p=c.parameters?.find(p=>p.id===ref.id)||s.library.parameters.find(p=>p.id===ref.id);
      if(!p)throw Error(`파라미터가 없습니다: ${ref.id}`);
      const values=tupleValues(p.values),width=values[0].length;
      if(ref.index===null&&width!==1)throw Error(`{${ref.id}}는 값이 ${width}개입니다. 인덱스를 지정하세요.`);
      if(ref.index!==null&&(!Number.isSafeInteger(ref.index)||ref.index>=width))throw Error(`{${ref.token}} 인덱스 범위는 0–${width-1}입니다.`);
      groups.set(p.id,p);
    }
    const list=[...groups.values()];const count=c.mode==='zip'?Math.max(1,...list.map(p=>p.values.length)):list.reduce((n,p)=>n*p.values.length,1);
    if(c.mode==='zip'&&list.some(p=>p.values.length!==1&&p.values.length!==count))throw Error('이전 행별 조합 길이가 다릅니다.');
    total+=count;if(total>10000)throw Error('전체 조합을 10,000개 이하로 줄여주세요.');
    plans.push({t,c,refs,list,count});
  }catch(e){errors.push(`${t.name}: ${e.message}`);}
  if(errors.length)return {rows:[],errors,total,duplicates:0};
  const rows=[],seen=new Set();let duplicates=0;
  for(const {t,c,refs,list,count} of plans)for(let i=0;i<count;i++){
    let cursor=i;const chosen=new Map(),parameters=Object.create(null);
    for(const p of [...list].reverse()){chosen.set(p.id,p.values[c.mode==='zip'?(p.values.length===1?0:i):cursor%p.values.length]);if(c.mode!=='zip')cursor=Math.floor(cursor/p.values.length);}
    for(const r of refs)parameters[r.token]=chosen.get(r.id)[r.index??0];
    const text=t.text.replace(/\{([^{}]+)\}/g,(_,token)=>parameters[token]);
    if(seen.has(text)){duplicates++;if(s.dedupe)continue;}seen.add(text);
    rows.push({number:rows.length+1,prompt_text:text,template_set:c.templateSet.name,template_name:t.name,parameter_set:list.map(p=>p.name).join(' / '),parameters});
  }
  return {rows,errors:[],total,duplicates};
}
