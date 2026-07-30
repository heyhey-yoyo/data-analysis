import { parseNumeric } from '../core.mjs';

export function tokenizeGroupBody(body, decSep, numOpts) {
  const spaceTokens = body.split(/[;；\s]+/).filter(Boolean);
  const commaTokens = decSep === 'comma' ? spaceTokens
    : body.split(/[;；，\s]+|,(?=\s*[-+]?\d)/).filter(Boolean);
  if (decSep === 'comma') return { tokens: spaceTokens, warning: null, fatal: false };

  function evalTokens(tokens) {
    const parsed = tokens.map((t) => parseNumeric(t, numOpts));
    const valid = parsed.filter((p) => p.kind === 'number');
    const invalid = parsed.filter((p) => p.kind !== 'number');
    return { parsed, allValid: invalid.length === 0, validCount: valid.length, invalidCount: invalid.length };
  }

  const sRes = evalTokens(spaceTokens);
  const cRes = evalTokens(commaTokens);
  const bothValid = sRes.allValid && cRes.allValid;
  // 比较解析后的数值（而非原始 token 字符串）
  const sVals = sRes.parsed.filter((p) => p.kind === 'number').map((p) => p.value);
  const cVals = cRes.parsed.filter((p) => p.kind === 'number').map((p) => p.value);
  const resultsDiffer = sVals.length !== cVals.length ||
    !sVals.every((v, i) => Math.abs(v - cVals[i]) < 1e-12);

  if (decSep === 'dot') {
    // dot: 逗号定义为千分位，优先空格候选
    if (bothValid && resultsDiffer) {
      return { tokens: spaceTokens, warning: '逗号含义存在歧义，已按千分位解析。若为列表分隔符请使用空格分隔。', fatal: false };
    }
    if (sRes.invalidCount <= cRes.invalidCount) return { tokens: spaceTokens, warning: null, fatal: false };
    return { tokens: commaTokens, warning: null, fatal: false };
  }

  // auto: 双候选比较
  if (bothValid && resultsDiffer) {
    return { tokens: spaceTokens, warning: '逗号含义存在歧义（小数点或分隔符），请在小数格式中选择"小数点"或"小数逗号"后重试。', fatal: true };
  }
  if (!sRes.allValid && !cRes.allValid) return { tokens: spaceTokens, warning: null, fatal: false };
  return { tokens: sRes.allValid ? spaceTokens : commaTokens, warning: null, fatal: false };
}
