// One object is an indivisible choice. Strings are supported only for old settings.
export function objectValues(values) {
  if (!Array.isArray(values) || !values.length || values.length > 10000) throw Error('값은 비어 있지 않은 객체 배열이어야 합니다.');
  let signature;
  for (const row of values) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('각 선택지는 객체여야 합니다.');
    const keys = Object.keys(row);
    const normalized = keys.map(k => k.trim().replace(/\s+/g, ' ').toLowerCase());
    if (!keys.length || new Set(normalized).size !== keys.length || keys.some(k => !k.trim() || /[{}]/.test(k) || ['__proto__','constructor','prototype'].includes(k) || k.length > 200)) throw Error('필드 이름이 비어 있거나 중복됩니다.');
    if (Object.values(row).some(v => typeof v !== 'string' || !v.trim() || v.length > 50000)) throw Error('필드 값은 비어 있지 않은 문자열이어야 합니다.');
    const next = JSON.stringify(keys.sort());
    if (signature !== undefined && signature !== next) throw Error('한 파라미터의 모든 선택지는 같은 필드를 가져야 합니다.');
    signature = next;
  }
  return values;
}

export function choicesFor(values) {
  return typeof values === 'string' ? values.trim().split(/\r?\n/).map(value => ({value})) : objectValues(values);
}

export function valueLabels(values) {
  return choicesFor(values).map(row => Object.entries(row).map(([k,v]) => Object.keys(row).length === 1 ? v : `${k}: ${v}`).join(' / '));
}

export function generateObjects(state, keyOf, slots, limit) {
  const plans=[], errors=[]; let total=0;
  for (const c of state.combinations.filter(c => c.enabled)) {
    for (const t of c.templateSet.templates.filter(t => t.enabled !== false)) {
      try {
        if (!t.text.trim()) throw Error('질문 문장을 입력하세요.');
        const names=slots(t.text), groups=new Map();
        for (const name of names) {
          const b=c.bindings.find(b => keyOf(b.slot) === name);
          if (!b) throw Error(`{${name}} 값이 필요합니다.`);
          const choices=choicesFor(b.parameter.values);
          if (choices.some(row => Object.values(row).some(v => !v.trim()))) throw Error('빈 값은 사용할 수 없습니다.');
          const fields=Object.keys(choices[0]);
          const field=b.field || (fields.length === 1 ? fields[0] : fields.find(k => keyOf(k) === name));
          if (!field || !fields.includes(field)) throw Error(`{${name}}에 연결할 객체 필드를 확인하세요.`);
          // Only compound parameters bind multiple slots as one choice.
          const id=fields.length > 1 ? b.parameter.id : name;
          if (!groups.has(id)) groups.set(id,{choices,bindings:[],source:JSON.stringify(b.parameter.values)});
          const group=groups.get(id);
          if (group.source !== JSON.stringify(b.parameter.values)) throw Error('동일 조합 파라미터의 사본이 서로 다릅니다. 다시 연결하세요.');
          group.bindings.push({name,field});
        }
        const list=[...groups.values()];
        const count=c.mode === 'zip' ? Math.max(1,...list.map(g => g.choices.length)) : list.reduce((n,g) => n*g.choices.length,1);
        if (c.mode === 'zip' && list.some(g => g.choices.length !== 1 && g.choices.length !== count)) throw Error('행별 매칭의 값 개수가 다릅니다.');
        total+=count;
        if (total>limit) throw Error('전체 조합을 10,000개 이하로 줄여주세요.');
        plans.push({c,t,list,count,names});
      } catch(e) {errors.push(`${t.name}: ${e.message}`);}
    }
  }
  if (errors.length) return {rows:[],errors,total,duplicates:0};
  const rows=[],seen=new Set();let duplicates=0;
  for (const {c,t,list,count,names} of plans) for (let i=0;i<count;i++) {
    let cursor=i; const parameters=Object.create(null);
    for (const group of [...list].reverse()) {
      const n=group.choices.length, row=group.choices[c.mode==='zip' ? (n===1?0:i) : cursor%n];
      if(c.mode!=='zip')cursor=Math.floor(cursor/n);
      for(const b of group.bindings)parameters[b.name]=row[b.field];
    }
    const prompt_text=t.text.replace(/\{([^{}]+)\}/g,(_,k)=>parameters[keyOf(k)]);
    if(seen.has(prompt_text)){duplicates++;if(state.dedupe)continue;}seen.add(prompt_text);
    rows.push({number:rows.length+1,prompt_text,template_set:c.templateSet.name,template_name:t.name,
      parameter_set:[...new Set(c.bindings.filter(b=>names.includes(keyOf(b.slot))).map(b=>b.parameter.name))].join(' / '),parameters});
  }
  return {rows,errors:[],total,duplicates};
}
