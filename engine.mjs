export const LIMIT = 10000;
export const keyOf = value => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export const valuesOf = text => [...new Set(text.split(/\r?\n/).map(v => v.trim()).filter(Boolean))];

export function validateConfig(config) {
  if (!config || config.version !== 1 || !Array.isArray(config.parameterSets) || !Array.isArray(config.templateSets)) throw Error('지원하는 설정 파일이 아닙니다. 이 화면에서 저장한 JSON 파일을 선택하세요.');
  if (config.dedupe !== undefined && typeof config.dedupe !== 'boolean') throw Error('중복 제외 설정은 참/거짓이어야 합니다.');
  const ids = new Set();
  const str = (v, max = 16000) => typeof v === 'string' && v.length <= max;
  const identity = row => {
    if (!row || !str(row.id, 100) || !row.id || ids.has(row.id) || !str(row.name, 200)) throw Error('세트의 이름 또는 ID가 올바르지 않습니다.');
    ids.add(row.id);
  };
  if (config.parameterSets.length > 50 || config.templateSets.length > 50) throw Error('세트는 각각 최대 50개까지 사용할 수 있습니다.');
  for (const set of config.parameterSets) {
    identity(set);
    if (!['product', 'zip'].includes(set.mode) || !Array.isArray(set.params) || set.params.length > 30) throw Error('파라미터 세트 형식을 확인하세요.');
    for (const p of set.params) if (!p || !str(p.key, 100) || !str(p.values, 50000)) throw Error('파라미터 이름 또는 값이 올바르지 않습니다.');
  }
  for (const set of config.templateSets) {
    identity(set);
    if (typeof set.enabled !== 'boolean' || !Array.isArray(set.parameterSetIds) || !set.parameterSetIds.every(id => typeof id === 'string') || !Array.isArray(set.templates) || set.templates.length > 100) throw Error('템플릿 세트 형식을 확인하세요.');
    for (const t of set.templates) {
      identity(t);
      if (!str(t.text) || typeof t.enabled !== 'boolean') throw Error('템플릿 형식을 확인하세요.');
    }
  }
  return config;
}

function slots(text) {
  const names = [...text.matchAll(/\{([^{}]+)\}/g)].map(m => keyOf(m[1]));
  if (/[{}]/.test(text.replace(/\{([^{}]+)\}/g, ''))) throw Error('중괄호를 확인하세요. 파라미터는 {이름} 형식으로 입력합니다.');
  if (names.some(n => !n)) throw Error('빈 파라미터 이름은 사용할 수 없습니다.');
  return [...new Set(names)];
}

export function generate(config, dedupe = true) {
  validateConfig(config);
  const errors = [], plans = [];
  let total = 0;
  const activeSets = config.templateSets.filter(s => s.enabled);
  if (!activeSets.length) errors.push('생성할 템플릿 세트를 하나 이상 선택하세요.');
  for (const ts of activeSets) {
    const activeTemplates = ts.templates.filter(t => t.enabled);
    if (!activeTemplates.length) errors.push(`${ts.name || '템플릿 세트'}: 사용할 템플릿을 선택하세요.`);
    if (!ts.parameterSetIds.length) errors.push(`${ts.name || '템플릿 세트'}: 파라미터 세트를 연결하세요.`);
    for (const t of activeTemplates) {
      for (const pid of new Set(ts.parameterSetIds)) {
        const ps = config.parameterSets.find(p => p.id === pid);
        const label = `${ts.name || '템플릿 세트'} / ${t.name || '템플릿'} / ${ps?.name || '연결된 세트'}`;
        try {
          if (!ps) throw Error('연결된 파라미터 세트가 없습니다.');
          if (!t.text.trim()) throw Error('질문 문장을 입력하세요.');
          const names = slots(t.text), map = new Map();
          for (const p of ps.params) {
            const key = keyOf(p.key);
            if (!key || /[{}]/.test(key)) throw Error('파라미터 이름에 빈 값이나 중괄호를 사용할 수 없습니다.');
            if (map.has(key)) throw Error(`파라미터 이름이 중복됩니다: ${p.key}`);
            // Preserve row positions for zip mode; product mode treats values as a set.
            const vals = ps.mode === 'zip' ? p.values.trim().split(/\r?\n/).map(v => v.trim()) : valuesOf(p.values);
            map.set(key, vals);
          }
          const lists = names.map(name => {
            if (!map.has(name)) throw Error(`{${name}} 값이 필요합니다.`);
            const vals = map.get(name);
            if (!vals.length || vals.some(v => !v)) throw Error(`{${name}}에 빈 값이 있습니다. 행별 매칭에서는 중간 빈 줄도 확인하세요.`);
            return vals;
          });
          const count = ps.mode === 'zip' ? Math.max(1, ...lists.map(v => v.length)) : lists.reduce((n, v) => n * v.length, 1);
          if (ps.mode === 'zip' && lists.some(v => v.length !== 1 && v.length !== count)) throw Error('행별 매칭의 값 개수가 다릅니다. 같은 개수 또는 공통 값 1개를 입력하세요.');
          total += count;
          plans.push({ts, t, ps, names, lists, count});
        } catch (e) { errors.push(`${label}: ${e.message}`); }
      }
    }
  }
  if (total > LIMIT) errors.push(`전체 조합이 ${total.toLocaleString('ko-KR')}개입니다. 한 번에 ${LIMIT.toLocaleString('ko-KR')}개 이하로 줄여주세요.`);
  if (errors.length) return {rows: [], errors, total, duplicates: 0};
  const rows = [], seen = new Set();
  let duplicates = 0;
  for (const {ts, t, ps, names, lists, count} of plans) {
    for (let i = 0; i < count; i++) {
      let cursor = i;
      const bindings = Object.create(null);
      for (let k = names.length - 1; k >= 0; k--) {
        const values = lists[k];
        bindings[names[k]] = values[ps.mode === 'zip' ? (values.length === 1 ? 0 : i) : cursor % values.length];
        if (ps.mode === 'product') cursor = Math.floor(cursor / values.length);
      }
      const text = t.text.replace(/\{([^{}]+)\}/g, (_, key) => bindings[keyOf(key)]);
      if (seen.has(text)) { duplicates++; if (dedupe) continue; }
      seen.add(text);
      rows.push({number: rows.length + 1, prompt_text: text, template_set: ts.name, template_name: t.name, parameter_set: ps.name, parameters: bindings});
    }
  }
  return {rows, errors, total, duplicates};
}

export function csvCell(value) {
  let text = String(value ?? '');
  // Spreadsheet applications must not interpret customer input as formulas.
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function toCSV(rows) {
  const header = ['number', 'prompt_text', 'template_set', 'template_name', 'parameter_set', 'parameters'];
  return '\uFEFF' + [header, ...rows.map(r => header.map(k => k === 'parameters' ? JSON.stringify(r[k]) : r[k]))]
    .map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
