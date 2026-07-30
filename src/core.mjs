export const ALPHA = 0.05;
export const MAX_IMPORT_ROWS = 100000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function clampProbability(value) {
  return Math.max(0, Math.min(1, value));
}

// Neumaier 补偿求和：比 Kahan 对大值更稳定
function neumaierSum(values) {
  let sum = 0;
  let compensation = 0;
  for (let i = 0; i < values.length; i++) {
    const t = sum + values[i];
    if (Math.abs(sum) >= Math.abs(values[i])) {
      compensation += (sum - t) + values[i];
    } else {
      compensation += (values[i] - t) + sum;
    }
    sum = t;
  }
  return sum + compensation;
}

// log-sum-exp：log(exp(a) + exp(b))，用于对数空间概率累加
function logAddExp(logA, logB) {
  if (logA === -Infinity || logA - logB <= -40) return logB;
  if (logB === -Infinity || logB - logA <= -40) return logA;
  const max = logA > logB ? logA : logB;
  return max + Math.log1p(Math.exp(-Math.abs(logA - logB)));
}

export function parseNumeric(rawValue, options = {}) {
  const {
    decimalSeparator = 'auto',
    percentMode = 'number',
  } = options;

  if (rawValue === null || rawValue === undefined) return { kind: 'missing', value: null, raw: '' };
  const raw = String(rawValue);
  let text = raw.trim();
  if (!text) return { kind: 'missing', value: null, raw };

  text = text
    .replace(/[−–—]/g, '-')
    .replace(/[\u00a0\u202f\s]/g, '');

  let isPercent = false;
  if (/[%％]$/.test(text)) {
    isPercent = true;
    text = text.slice(0, -1);
  }
  if (!text) return { kind: 'invalid', value: null, raw, reason: '百分号前缺少数字' };

  const signPattern = '[+-]?';
  const integerPattern = '\\d+';
  const dotGrouped = new RegExp(`^${signPattern}\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?$`);
  const commaGrouped = new RegExp(`^${signPattern}\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?$`);
  const plainDot = new RegExp(`^${signPattern}(?:${integerPattern}(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$`);
  const plainComma = new RegExp(`^${signPattern}(?:${integerPattern}(?:,\\d*)?|,\\d+)(?:[eE][+-]?\\d+)?$`);

  let normalized = text;
  const commaCount = (text.match(/,/g) || []).length;
  const dotCount = (text.match(/\./g) || []).length;

  if (decimalSeparator === 'dot') {
    if (commaCount) {
      if (!commaGrouped.test(text)) {
        return { kind: 'invalid', value: null, raw, reason: '逗号格式无法按千分位解析' };
      }
      normalized = text.replaceAll(',', '');
    }
    if (!plainDot.test(normalized)) return { kind: 'invalid', value: null, raw, reason: '不是有效数字' };
  } else if (decimalSeparator === 'comma') {
    if (commaCount) {
      if (dotCount && !dotGrouped.test(text)) {
        return { kind: 'invalid', value: null, raw, reason: '小数逗号与千分位格式不一致' };
      }
      normalized = text.replaceAll('.', '').replace(',', '.');
    } else {
      normalized = text;
    }
    if (!plainDot.test(normalized)) return { kind: 'invalid', value: null, raw, reason: '不是有效数字' };
  } else {
    if (commaCount && dotCount) {
      const lastComma = text.lastIndexOf(',');
      const lastDot = text.lastIndexOf('.');
      if (lastComma > lastDot) {
        if (!dotGrouped.test(text)) return { kind: 'invalid', value: null, raw, reason: '混合分隔符格式不一致' };
        normalized = text.replaceAll('.', '').replace(',', '.');
      } else {
        if (!commaGrouped.test(text)) return { kind: 'invalid', value: null, raw, reason: '混合分隔符格式不一致' };
        normalized = text.replaceAll(',', '');
      }
    } else if (commaCount) {
      if (commaGrouped.test(text)) {
        normalized = text.replaceAll(',', '');
      } else if (commaCount === 1 && plainComma.test(text)) {
        normalized = text.replace(',', '.');
      } else {
        return { kind: 'invalid', value: null, raw, reason: '逗号数字格式不明确' };
      }
    }
    if (!plainDot.test(normalized)) return { kind: 'invalid', value: null, raw, reason: '不是有效数字' };
  }

  let value = Number(normalized);
  if (!Number.isFinite(value)) return { kind: 'invalid', value: null, raw, reason: '数值超出范围' };
  if (isPercent && percentMode === 'fraction') value /= 100;
  return { kind: 'number', value, raw, isPercent };
}

function logicalRecords(text, maximum = 30) {
  const records = [];
  let record = '';
  let quoted = false;
  for (let index = 0; index < text.length && records.length < maximum; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      record += char;
      if (quoted && next === '"') {
        record += next;
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      if (record.trim()) records.push(record);
      record = '';
    } else {
      record += char;
    }
  }
  if (record.trim() && records.length < maximum) records.push(record);
  return records;
}

function countOutsideQuotes(record, delimiter) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < record.length; index += 1) {
    const char = record[index];
    const next = record[index + 1];
    if (char === '"') {
      if (quoted && next === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectDelimiter(text) {
  const records = logicalRecords(String(text).replace(/^\uFEFF/, ''), 30);
  if (!records.length) return ',';
  const candidates = ['\t', ';', ','];
  const scored = candidates.map((delimiter) => {
    const counts = records.map((record) => countOutsideQuotes(record, delimiter));
    const positive = counts.filter((count) => count > 0);
    if (!positive.length) return { delimiter, score: 0, mode: 0 };
    const frequencies = new Map();
    positive.forEach((count) => frequencies.set(count, (frequencies.get(count) || 0) + 1));
    let mode = positive[0];
    let modeFrequency = 0;
    frequencies.forEach((frequency, count) => {
      if (frequency > modeFrequency || (frequency === modeFrequency && count > mode)) {
        mode = count;
        modeFrequency = frequency;
      }
    });
    const coverage = positive.length / records.length;
    const consistency = modeFrequency / positive.length;
    return { delimiter, mode, score: mode * 100 + coverage * 20 + consistency * 10 };
  });
  scored.sort((a, b) => b.score - a.score || candidates.indexOf(a.delimiter) - candidates.indexOf(b.delimiter));
  return scored[0].score > 0 ? scored[0].delimiter : ',';
}

export function parseDelimited(text, options = {}) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  const delimiter = options.delimiter || detectDelimiter(source);
  const parsedRows = [];
  const errors = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let quotedCell = false;
  let justClosedQuote = false;

  const pushCell = () => {
    row.push(quotedCell ? cell : cell.trim());
    cell = '';
    quotedCell = false;
    justClosedQuote = false;
  };
  const pushRow = () => {
    if (row.some((value) => value !== '')) parsedRows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
        justClosedQuote = true;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.trim() === '' && !quotedCell) {
      cell = '';
      quotedCell = true;
      inQuotes = true;
    } else if (char === delimiter) {
      pushCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') index += 1;
      pushCell();
      pushRow();
    } else if (justClosedQuote && /\s/.test(char)) {
      // 容忍结束引号与分隔符之间的空白。
    } else {
      if (justClosedQuote) {
        errors.push({ code: 'CHAR_AFTER_QUOTE', index, message: '结束引号后出现非分隔字符' });
        justClosedQuote = false;
      }
      cell += char;
    }
  }

  if (inQuotes) {
    errors.push({ code: 'UNCLOSED_QUOTE', index: source.length, fatal: true, message: '文件中存在未闭合的引号' });
  }
  pushCell();
  pushRow();

  if (!parsedRows.length) return { headers: [], rows: [], delimiter, errors };
  if (parsedRows.length > MAX_IMPORT_ROWS + 1) {
    errors.push({ code: 'TOO_MANY_ROWS', fatal: true, message: `最多支持 ${MAX_IMPORT_ROWS.toLocaleString()} 行数据` });
  }

  if (options.header === false) {
    const width = Math.max(...parsedRows.map((item) => item.length));
    const rows = parsedRows.slice(0, MAX_IMPORT_ROWS).map((item) => Array.from({ length: width }, (_, index) => item[index] ?? ''));
    return { headers: [], rows, delimiter, errors };
  }

  const width = Math.max(...parsedRows.map((item) => item.length));
  const rawHeaders = parsedRows[0];
  const headers = [];
  for (let index = 0; index < width; index += 1) {
    const base = String(rawHeaders[index] ?? '').trim() || `字段 ${index + 1}`;
    let name = base;
    let suffix = 2;
    while (headers.includes(name)) {
      name = `${base} (${suffix})`;
      suffix += 1;
    }
    headers.push(name);
  }
  const rows = parsedRows.slice(1, MAX_IMPORT_ROWS + 1).map((item) => headers.map((_, index) => item[index] ?? ''));
  return { headers, rows, delimiter, errors };
}

export function columnProfile(values, numberOptions = {}) {
  let missing = 0;
  let invalid = 0;
  const numbers = [];
  const nonEmptyValues = [];
  values.forEach((raw) => {
    const parsed = parseNumeric(raw, numberOptions);
    if (parsed.kind === 'missing') missing += 1;
    else {
      nonEmptyValues.push(String(raw));
      if (parsed.kind === 'number') numbers.push(parsed.value);
      else invalid += 1;
    }
  });
  const nonEmpty = values.length - missing;
  const numericRatio = nonEmpty ? numbers.length / nonEmpty : 0;
  const eligibleForNumericAnalysis = numbers.length >= 3;
  return {
    total: values.length,
    missing,
    nonEmpty,
    validNumeric: numbers.length,
    invalid,
    numbers,
    unique: new Set(nonEmptyValues).size,
    numericRatio,
    isNumeric: nonEmpty > 0 && numericRatio >= 0.8,
    eligibleForNumericAnalysis,
  };
}

export function extractNumeric(values, options = {}) {
  const { missingMode = 'ignore', numberOptions = {} } = options;
  const numbers = [];
  const invalidRows = [];
  const missingRows = [];
  values.forEach((raw, index) => {
    const parsed = parseNumeric(raw, numberOptions);
    if (parsed.kind === 'number') numbers.push(parsed.value);
    else if (parsed.kind === 'missing') {
      missingRows.push(index);
      if (missingMode === 'zero') numbers.push(0);
    } else {
      invalidRows.push(index);
    }
  });
  return { numbers, invalidRows, missingRows };
}

export function quantile(sortedValues, probability) {
  const sorted = sortedValues.slice().sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const base = Math.floor(position);
  const fraction = position - base;
  return sorted[base + 1] === undefined
    ? sorted[base]
    : sorted[base] + fraction * (sorted[base + 1] - sorted[base]);
}

export function stats(values) {
  const clean = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!clean.length) return null;
  const count = clean.length;
  // Neumaier 补偿求和算均值，两趟法算方差（均值精确后偏差更准确）
  const sum = neumaierSum(clean);
  const mean = sum / count;
  let m2 = 0;
  for (let i = 0; i < count; i++) {
    const dev = clean[i] - mean;
    m2 += dev * dev;
  }
  const variance = count > 1 ? m2 / (count - 1) : 0;
  return {
    count,
    sum,
    mean,
    variance,
    sd: Math.sqrt(variance),
    sem: count > 0 ? Math.sqrt(variance / count) : null,
    median: quantile(clean, 0.5),
    q1: quantile(clean, 0.25),
    q3: quantile(clean, 0.75),
    min: clean[0],
    max: clean[clean.length - 1],
  };
}

export function logGamma(value) {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (value < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * value)) - logGamma(1 - value);
  const adjusted = value - 1;
  let series = 0.99999999999980993;
  coefficients.forEach((coefficient, index) => { series += coefficient / (adjusted + index + 1); });
  const base = adjusted + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (adjusted + 0.5) * Math.log(base) - base + Math.log(series);
}

export function regularizedGammaQ(shape, value) {
  if (!(shape > 0) || value < 0 || !Number.isFinite(value)) return null;
  if (value === 0) return 1;
  const epsilon = 1e-14;
  const tiny = 1e-300;
  const logScale = -value + shape * Math.log(value) - logGamma(shape);
  if (value < shape + 1) {
    let term = 1 / shape;
    let sum = term;
    let denominator = shape;
    for (let index = 1; index <= 10000; index += 1) {
      denominator += 1;
      term *= value / denominator;
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * epsilon) break;
    }
    return clampProbability(1 - sum * Math.exp(logScale));
  }
  let b = value + 1 - shape;
  let c = 1 / tiny;
  let d = 1 / Math.max(Math.abs(b), tiny) * Math.sign(b || 1);
  let fraction = d;
  for (let index = 1; index <= 10000; index += 1) {
    const coefficient = -index * (index - shape);
    b += 2;
    d = coefficient * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + coefficient / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    fraction *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return clampProbability(Math.exp(logScale) * fraction);
}

function betaContinuedFraction(a, b, x) {
  const maxIterations = 300;
  const epsilon = 3e-14;
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m += 1) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

export function regularizedBeta(x, a, b) {
  if (!(a > 0) || !(b > 0) || x < 0 || x > 1) return null;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  if (x < (a + 1) / (a + b + 2)) return bt * betaContinuedFraction(a, b, x) / a;
  return 1 - bt * betaContinuedFraction(b, a, 1 - x) / b;
}

export function chiSquareSurvival(statistic, degreesOfFreedom) {
  if (!Number.isFinite(statistic) || !(degreesOfFreedom > 0)) return null;
  return regularizedGammaQ(degreesOfFreedom / 2, statistic / 2);
}

export function fSurvival(statistic, df1, df2) {
  if (!Number.isFinite(statistic) || statistic < 0 || !(df1 > 0) || !(df2 > 0)) return null;
  const x = df2 / (df2 + df1 * statistic);
  return regularizedBeta(x, df2 / 2, df1 / 2);
}

export function tTwoSidedP(statistic, degreesOfFreedom) {
  if (!Number.isFinite(statistic) || !(degreesOfFreedom > 0)) return null;
  const x = degreesOfFreedom / (degreesOfFreedom + statistic * statistic);
  return regularizedBeta(x, degreesOfFreedom / 2, 0.5);
}

export function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-x * x));
}

export function normalCdf(value) {
  return clampProbability(0.5 * (1 + erf(value / Math.SQRT2)));
}

export function inverseNormalCdf(probability) {
  const p = Math.max(1e-12, Math.min(1 - 1e-12, probability));
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const lower = 0.02425;
  const upper = 1 - lower;
  if (p < lower) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > upper) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
      / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
    / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function normalTwoSidedP(z) {
  if (!Number.isFinite(z)) return null;
  return clampProbability(2 * (1 - normalCdf(Math.abs(z))));
}

export function rankValues(values) {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  const tieCounts = [];
  let cursor = 0;
  while (cursor < indexed.length) {
    let end = cursor + 1;
    while (end < indexed.length && indexed[end].value === indexed[cursor].value) end += 1;
    const averageRank = (cursor + 1 + end) / 2;
    for (let index = cursor; index < end; index += 1) ranks[indexed[index].index] = averageRank;
    if (end - cursor > 1) tieCounts.push(end - cursor);
    cursor = end;
  }
  return { ranks, tieCounts };
}

export function pearsonCorrelation(valuesA, valuesB) {
  const pairs = [];
  const length = Math.min(valuesA.length, valuesB.length);
  for (let index = 0; index < length; index += 1) {
    if (Number.isFinite(valuesA[index]) && Number.isFinite(valuesB[index])) pairs.push([valuesA[index], valuesB[index]]);
  }
  const n = pairs.length;
  if (n < 3) return null;
  // 使用补偿求和计算均值，避免灾难性消减
  const meanA = neumaierSum(pairs.map((p) => p[0])) / n;
  const meanB = neumaierSum(pairs.map((p) => p[1])) / n;
  let cross = 0;
  let ssA = 0;
  let ssB = 0;
  pairs.forEach(([a, b]) => {
    cross += (a - meanA) * (b - meanB);
    ssA += (a - meanA) ** 2;
    ssB += (b - meanB) ** 2;
  });
  if (!(ssA > 0) || !(ssB > 0)) return { coefficient: null, pValue: null, n, status: 'constant-input' };
  const coefficient = clampProbability((cross / Math.sqrt(ssA * ssB) + 1) / 2) * 2 - 1;
  const statistic = Math.abs(coefficient) >= 1 ? Infinity : coefficient * Math.sqrt((n - 2) / (1 - coefficient ** 2));
  return { coefficient, pValue: statistic === Infinity ? 0 : tTwoSidedP(statistic, n - 2), n };
}

export function spearmanCorrelation(valuesA, valuesB) {
  const cleanA = [];
  const cleanB = [];
  const length = Math.min(valuesA.length, valuesB.length);
  for (let index = 0; index < length; index += 1) {
    if (Number.isFinite(valuesA[index]) && Number.isFinite(valuesB[index])) {
      cleanA.push(valuesA[index]);
      cleanB.push(valuesB[index]);
    }
  }
  if (cleanA.length < 3) return null;
  const aRanks = rankValues(cleanA);
  const bRanks = rankValues(cleanB);
  const result = pearsonCorrelation(aRanks.ranks, bRanks.ranks);
  if (!result) return null;
  // 小样本无 ties → 精确排列 P
  const noTies = aRanks.tieCounts.length === 0 && bRanks.tieCounts.length === 0;
  const n = cleanA.length;
  if (noTies && n <= 8) {
    const exact = spearmanExactP(aRanks.ranks, bRanks.ranks);
    if (exact && exact.status === 'exact') {
      return { ...result, exactPValue: exact.pValue, pValue: exact.pValue, pValueType: 'exact' };
    }
  }
  return { ...result, pValueType: 'asymptotic' };
}

// 小样本 Spearman 精确双侧 P（无 ties，n ≤ 8 排列枚举）
function spearmanExactP(ranksA, ranksB) {
  const n = ranksA.length;
  const meanRank = (n + 1) / 2;
  let cross = 0, ss = 0;
  for (let i = 0; i < n; i++) {
    const dA = ranksA[i] - meanRank, dB = ranksB[i] - meanRank;
    cross += dA * dB; ss += dA * dA;
  }
  const obsAbs = Math.abs(cross / ss);
  const used = new Array(n).fill(false);
  const perm = new Array(n);
  let total = 0, extreme = 0;
  function enumPerm(i) {
    if (i === n) {
      let pc = 0;
      for (let j = 0; j < n; j++) pc += (ranksB[j] - meanRank) * (perm[j] - meanRank);
      total++;
      if (Math.abs(pc / ss) + 1e-12 >= obsAbs) extreme++;
      return;
    }
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      used[j] = true; perm[i] = j + 1; enumPerm(i + 1); used[j] = false;
    }
  }
  enumPerm(0);
  return { pValue: extreme / total, status: 'exact' };
}

// 小样本 Mann-Whitney 精确双侧 P（无 ties，组合计数 ≤ 200k）
function mannWhitneyExactP(n1, n2, uObserved) {
  const totalN = n1 + n2;
  const totalComb = combinationCountCapped(totalN, Math.min(n1, n2), 200001);
  if (totalComb.tooLarge) return null;
  // 递归组合枚举
  const ranks = Array.from({ length: totalN }, (_, i) => i + 1);
  const correction = n1 * (n1 + 1) / 2;
  const meanU = n1 * n2 / 2;
  const obsDiff = Math.abs(uObserved - meanU);
  let total = 0, extreme = 0;
  const started = Date.now();
  function enumerate(idx, selected, sum) {
    if (selected === n1) {
      const u = sum - correction;
      total++;
      if (Math.abs(u - meanU) + 1e-12 >= obsDiff) extreme++;
      return;
    }
    const needed = n1 - selected;
    const last = totalN - needed;
    for (let j = idx; j <= last; j++) {
      enumerate(j + 1, selected + 1, sum + ranks[j]);
    }
  }
  enumerate(0, 0, 0);
  if (!total) return null;
  return { pValue: extreme / total, status: 'exact' };
}

export function distributionMoments(values) {
  const clean = values.filter(Number.isFinite);
  const n = clean.length;
  if (!n) return { n: 0, skewness: null, kurtosis: null, excessKurtosis: null, variance: null };
  // 使用补偿求和计算均值，避免灾难性消减
  const mean = neumaierSum(clean) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  clean.forEach((value) => {
    const deviation = value - mean;
    m2 += deviation ** 2;
    m3 += deviation ** 3;
    m4 += deviation ** 4;
  });
  m2 /= n;
  m3 /= n;
  m4 /= n;
  if (m2 <= 0) return { n, skewness: 0, kurtosis: 0, excessKurtosis: -3, variance: 0 };
  const skewness = m3 / (m2 ** 1.5);
  const kurtosis = m4 / (m2 * m2);
  return { n, skewness, kurtosis, excessKurtosis: kurtosis - 3, variance: m2 };
}

function normalityResultBase(values, key, name, minimumN) {
  const clean = values.filter(Number.isFinite);
  const moments = distributionMoments(clean);
  if (clean.length < minimumN) {
    return { key, name, status: 'insufficient', statistic: null, pValue: null, n: clean.length, ...moments, warning: `该方法至少需要 n = ${minimumN}。` };
  }
  if (!(moments.variance > 0)) {
    return { key, name, status: 'fail', statistic: Infinity, pValue: 0, n: clean.length, ...moments, warning: '所有观测相同，无法视为连续正态分布。' };
  }
  return { clean, key, name, n: clean.length, ...moments };
}

export function shapiroFamily(values) {
  const base = normalityResultBase(values, 'shapiro', 'Shapiro–Francia W′', 3);
  if (!base.clean) return base;
  const clean = base.clean.slice().sort((a, b) => a - b);
  const n = clean.length;
  const mean = clean.reduce((sum, value) => sum + value, 0) / n;
  const denominator = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  if (n === 3) {
    const statistic = clampProbability(((clean[2] - clean[0]) ** 2) / (2 * denominator));
    const pValue = clampProbability((6 / Math.PI) * (Math.asin(Math.sqrt(statistic)) - Math.PI / 3));
    return { ...base, clean: undefined, name: 'Shapiro–Wilk（n=3 精确式）', statistic, pValue, status: pValue >= ALPHA ? 'pass' : 'fail' };
  }
  const expected = clean.map((_, index) => inverseNormalCdf((index + 1 - 0.375) / (n + 0.25)));
  const expectedSq = expected.reduce((sum, value) => sum + value * value, 0);
  const numerator = clean.reduce((sum, value, index) => sum + expected[index] * value, 0) ** 2;
  const statistic = clampProbability(numerator / (expectedSq * denominator));
  const logN = Math.log(n);
  const mu = -1.2725 + 1.0521 * (Math.log(logN) - logN);
  const sigma = 1.0308 - 0.26758 * (Math.log(logN) + 2 / logN);
  const z = (Math.log(Math.max(1e-16, 1 - statistic)) - mu) / sigma;
  const pValue = clampProbability(1 - normalCdf(z));
  return {
    ...base,
    clean: undefined,
    name: 'Shapiro–Francia W′',
    statistic,
    pValue,
    status: pValue >= ALPHA ? 'pass' : 'fail',
    warning: n === 4 ? 'n = 4 时 P 值近似较粗，请结合图形与实验设计判断。' : '',
  };
}

export function andersonDarling(values) {
  const base = normalityResultBase(values, 'anderson', 'Anderson–Darling', 4);
  if (!base.clean) return base;
  const clean = base.clean.slice().sort((a, b) => a - b);
  const n = clean.length;
  const mean = clean.reduce((sum, value) => sum + value, 0) / n;
  const sd = Math.sqrt(clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, n - 1));
  let sum = 0;
  for (let index = 0; index < n; index += 1) {
    const low = Math.max(1e-15, normalCdf((clean[index] - mean) / sd));
    const high = Math.max(1e-15, 1 - normalCdf((clean[n - 1 - index] - mean) / sd));
    sum += (2 * (index + 1) - 1) * (Math.log(low) + Math.log(high));
  }
  const raw = -n - sum / n;
  const statistic = raw * (1 + 0.75 / n + 2.25 / (n * n));
  let pValue;
  if (statistic < 0.2) pValue = 1 - Math.exp(-13.436 + 101.14 * statistic - 223.73 * statistic ** 2);
  else if (statistic < 0.34) pValue = 1 - Math.exp(-8.318 + 42.796 * statistic - 59.938 * statistic ** 2);
  else if (statistic < 0.6) pValue = Math.exp(0.9177 - 4.279 * statistic - 1.38 * statistic ** 2);
  else pValue = Math.exp(1.2937 - 5.709 * statistic + 0.0186 * statistic ** 2);
  pValue = clampProbability(pValue);
  return { ...base, clean: undefined, statistic, pValue, status: pValue >= ALPHA ? 'pass' : 'fail' };
}

export function dagostinoPearson(values) {
  const base = normalityResultBase(values, 'dagostino', 'D’Agostino–Pearson K²', 20);
  if (!base.clean) return base;
  const n = base.n;
  const g1 = base.skewness;
  const y = g1 * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
  const beta2 = 3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const w2 = -1 + Math.sqrt(2 * (beta2 - 1));
  const delta = 1 / Math.sqrt(0.5 * Math.log(w2));
  const alpha = Math.sqrt(2 / (w2 - 1));
  const zSkew = delta * Math.asinh(y / alpha);
  const b2 = base.kurtosis;
  const expected = 3 * (n - 1) / (n + 1);
  const variance = 24 * n * (n - 2) * (n - 3) / (((n + 1) ** 2) * (n + 3) * (n + 5));
  const x = (b2 - expected) / Math.sqrt(variance);
  const sqrtBeta1 = 6 * (n * n - 5 * n + 2) / ((n + 7) * (n + 9)) * Math.sqrt(6 * (n + 3) * (n + 5) / (n * (n - 2) * (n - 3)));
  const a = 6 + 8 / sqrtBeta1 * (2 / sqrtBeta1 + Math.sqrt(1 + 4 / (sqrtBeta1 ** 2)));
  const term1 = 1 - 2 / (9 * a);
  const denominator = 1 + x * Math.sqrt(2 / (a - 4));
  const term2 = Math.sign(denominator || 1) * ((1 - 2 / a) / Math.abs(denominator || 1e-12)) ** (1 / 3);
  const zKurtosis = (term1 - term2) / Math.sqrt(2 / (9 * a));
  const statistic = zSkew ** 2 + zKurtosis ** 2;
  const pValue = chiSquareSurvival(statistic, 2);
  return { ...base, clean: undefined, statistic, pValue, zSkew, zKurtosis, status: pValue >= ALPHA ? 'pass' : 'fail' };
}

export function jarqueBera(values) {
  const base = normalityResultBase(values, 'jarque', 'Jarque–Bera', 8);
  if (!base.clean) return base;
  const statistic = base.n / 6 * (base.skewness ** 2 + (base.excessKurtosis ** 2) / 4);
  const pValue = chiSquareSurvival(statistic, 2);
  return { ...base, clean: undefined, statistic, pValue, status: pValue >= ALPHA ? 'pass' : 'fail' };
}

export function chooseAutomaticNormalityMethod(values) {
  const clean = values.filter(Number.isFinite);
  const n = clean.length;
  const uniqueCount = new Set(clean).size;
  const tieRate = n ? 1 - uniqueCount / n : 1;
  if (n < 3) return { key: 'shapiro', reason: '有效样本量不足 3，无法可靠执行正态性检验。' };
  if (n === 3) return { key: 'shapiro', reason: 'n = 3，采用正态性检验的精确小样本形式。' };
  if (n === 4) return { key: 'anderson', reason: 'n = 4，采用 Anderson–Darling，并保守解释 P 值。' };
  if (tieRate >= 0.2) {
    return n >= 20
      ? { key: 'dagostino', reason: '重复值或取整值较多，改用基于偏度与峰度的 D’Agostino–Pearson K²。' }
      : { key: 'anderson', reason: '重复值或取整值较多且样本较小，采用 Anderson–Darling，并提示谨慎解释。' };
  }
  if (n <= 49) return { key: 'shapiro', reason: '小样本采用 Shapiro–Francia W′，通常对整体偏离较敏感。' };
  if (n <= 299) return { key: 'anderson', reason: '中等样本采用 Anderson–Darling，兼顾中心与尾部偏离。' };
  if (n <= 1999) return { key: 'dagostino', reason: '较大样本采用 D’Agostino–Pearson K²，综合检查偏度与峰度。' };
  return { key: 'jarque', reason: '超大样本采用计算较快的 Jarque–Bera；此时任何检验都可能对微小偏离非常敏感。' };
}

export function runNormalityTest(values, requestedMethod = 'auto') {
  const automatic = chooseAutomaticNormalityMethod(values);
  const key = requestedMethod === 'auto' ? automatic.key : requestedMethod;
  const result = key === 'shapiro' ? shapiroFamily(values)
    : key === 'anderson' ? andersonDarling(values)
      : key === 'dagostino' ? dagostinoPearson(values)
        : jarqueBera(values);
  return {
    ...result,
    selectedByAuto: requestedMethod === 'auto',
    recommendationReason: automatic.reason,
    automaticKey: automatic.key,
  };
}

export function oneWayAnova(groups) {
  const cleanGroups = groups.map((group) => group.filter(Number.isFinite)).filter((group) => group.length);
  const k = cleanGroups.length;
  const n = cleanGroups.reduce((sum, group) => sum + group.length, 0);
  if (k < 2 || n <= k) return null;
  const means = cleanGroups.map((group) => stats(group).mean);
  const grandMean = neumaierSum(cleanGroups.flat()) / n;
  let ssBetween = 0;
  let ssWithin = 0;
  cleanGroups.forEach((group, index) => {
    ssBetween += group.length * (means[index] - grandMean) ** 2;
    group.forEach((value) => { ssWithin += (value - means[index]) ** 2; });
  });
  const df1 = k - 1;
  const df2 = n - k;
  const msBetween = ssBetween / df1;
  const msWithin = ssWithin / df2;
  const statistic = msWithin === 0 ? (msBetween > 0 ? Infinity : 0) : msBetween / msWithin;
  return {
    statistic,
    df1,
    df2,
    pValue: statistic === Infinity ? 0 : fSurvival(statistic, df1, df2),
    etaSquared: ssBetween + ssWithin > 0 ? ssBetween / (ssBetween + ssWithin) : 0,
    ssBetween,
    ssWithin,
  };
}

export function leveneVarianceTest(groups, center = 'median') {
  if (groups.length < 2 || groups.some((group) => group.length < 2)) return null;
  const deviations = groups.map((group) => {
    const summary = stats(group);
    const location = center === 'mean' ? summary.mean : summary.median;
    return group.map((value) => Math.abs(value - location));
  });
  const result = oneWayAnova(deviations);
  if (!result) return null;
  return {
    key: center === 'mean' ? 'levene' : 'brown',
    name: center === 'mean' ? 'Levene（均值中心）' : 'Brown–Forsythe（中位数中心）',
    statistic: result.statistic,
    df1: result.df1,
    df2: result.df2,
    pValue: result.pValue,
  };
}

export function bartlettVarianceTest(groups) {
  if (groups.length < 2 || groups.some((group) => group.length < 2)) return null;
  const summaries = groups.map(stats);
  if (summaries.some((item) => !item || !(item.variance > 0))) return null;
  const k = summaries.length;
  const totalDf = summaries.reduce((sum, item) => sum + item.count - 1, 0);
  const pooledVariance = summaries.reduce((sum, item) => sum + (item.count - 1) * item.variance, 0) / totalDf;
  const numerator = totalDf * Math.log(pooledVariance)
    - summaries.reduce((sum, item) => sum + (item.count - 1) * Math.log(item.variance), 0);
  const correction = 1 + (summaries.reduce((sum, item) => sum + 1 / (item.count - 1), 0) - 1 / totalDf) / (3 * (k - 1));
  const statistic = numerator / correction;
  return { key: 'bartlett', name: 'Bartlett', statistic, df1: k - 1, df2: null, df: k - 1, pValue: chiSquareSurvival(statistic, k - 1) };
}

export function chooseAutomaticVarianceMethod(groups, normalityResults = []) {
  const allNormal = normalityResults.length === groups.length && normalityResults.every((item) => item?.status === 'pass');
  const enough = groups.every((group) => group.length >= 5);
  const heavyTies = groups.some((group) => group.length && 1 - new Set(group).size / group.length >= 0.2);
  return allNormal && enough && !heavyTies
    ? { key: 'bartlett', reason: '各组正态性诊断均未提示明显偏离、n ≥ 5 且重复值不多，自动选择 Bartlett。' }
    : { key: 'brown', reason: '存在非正态、样本量偏小、重复值较多或无法判断的组，自动选择更稳健的 Brown–Forsythe。' };
}

export function runVarianceTest(groups, normalityResults = [], requestedMethod = 'auto') {
  const automatic = chooseAutomaticVarianceMethod(groups, normalityResults);
  const key = requestedMethod === 'auto' ? automatic.key : requestedMethod;
  const result = key === 'bartlett' ? bartlettVarianceTest(groups)
    : key === 'levene' ? leveneVarianceTest(groups, 'mean')
      : leveneVarianceTest(groups, 'median');
  if (!result) return null;
  return { ...result, selectedByAuto: requestedMethod === 'auto', recommendationReason: automatic.reason, automaticKey: automatic.key };
}

export function pooledTTest(valuesA, valuesB) {
  const a = stats(valuesA);
  const b = stats(valuesB);
  if (!a || !b || a.count < 2 || b.count < 2) return null;
  const df = a.count + b.count - 2;
  const pooledVariance = ((a.count - 1) * a.variance + (b.count - 1) * b.variance) / df;
  const se = Math.sqrt(pooledVariance * (1 / a.count + 1 / b.count));
  const statistic = se === 0 ? (a.mean === b.mean ? 0 : Infinity) : (a.mean - b.mean) / se;
  const pooledSd = Math.sqrt(pooledVariance);
  return { statistic, df, pValue: statistic === Infinity ? 0 : tTwoSidedP(statistic, df), effect: pooledSd > 0 ? (a.mean - b.mean) / pooledSd : null };
}

export function welchTTest(valuesA, valuesB) {
  const a = stats(valuesA);
  const b = stats(valuesB);
  if (!a || !b || a.count < 2 || b.count < 2) return null;
  const termA = a.variance / a.count;
  const termB = b.variance / b.count;
  const se = Math.sqrt(termA + termB);
  const statistic = se === 0 ? (a.mean === b.mean ? 0 : Infinity) : (a.mean - b.mean) / se;
  const denominator = (termA ** 2) / (a.count - 1) + (termB ** 2) / (b.count - 1);
  const df = denominator > 0 ? ((termA + termB) ** 2) / denominator : a.count + b.count - 2;
  return { statistic, df, pValue: statistic === Infinity ? 0 : tTwoSidedP(statistic, df) };
}

export function mannWhitney(valuesA, valuesB) {
  const n1 = valuesA.length;
  const n2 = valuesB.length;
  if (!n1 || !n2) return null;
  const combined = valuesA.concat(valuesB);
  const rankInfo = rankValues(combined);
  const rankSumA = rankInfo.ranks.slice(0, n1).reduce((sum, rank) => sum + rank, 0);
  const u1 = rankSumA - n1 * (n1 + 1) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const n = n1 + n2;
  const tieTerm = rankInfo.tieCounts.reduce((sum, count) => sum + count ** 3 - count, 0);
  const varianceU = n > 1 ? n1 * n2 / 12 * ((n + 1) - tieTerm / (n * (n - 1))) : 0;
  const meanU = n1 * n2 / 2;
  const delta = u - meanU;
  const continuity = delta < 0 ? 0.5 : delta > 0 ? -0.5 : 0;
  const z = varianceU > 0 ? (delta + continuity) / Math.sqrt(varianceU) : 0;
  const rankBiserial = 2 * u1 / (n1 * n2) - 1;
  const asymptoticP = normalTwoSidedP(z);
  // 小样本无 ties → 精确组合枚举 P
  const noTies = rankInfo.tieCounts.length === 0;
  if (noTies && n1 >= 2 && n2 >= 2 && n1 + n2 <= 20) {
    const exact = mannWhitneyExactP(n1, n2, u);
    if (exact && exact.status === 'exact') {
      return { statistic: u, u1, u2, z, pValue: exact.pValue, pValueType: 'exact', effect: rankBiserial };
    }
  }
  return { statistic: u, u1, u2, z, pValue: asymptoticP, pValueType: 'asymptotic', effect: rankBiserial };
}

export function welchAnova(groups) {
  const groupStats = groups.map(stats);
  if (groupStats.some((item) => !item || item.count < 2 || item.variance <= 0)) return null;
  const k = groupStats.length;
  if (k < 2) return null;
  const weights = groupStats.map((item) => item.count / item.variance);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  const weightedMean = groupStats.reduce((sum, item, index) => sum + weights[index] * item.mean, 0) / weightSum;
  const numeratorBase = groupStats.reduce((sum, item, index) => sum + weights[index] * (item.mean - weightedMean) ** 2, 0) / (k - 1);
  const correctionSum = groupStats.reduce((sum, item, index) => sum + ((1 - weights[index] / weightSum) ** 2) / (item.count - 1), 0);
  const correction = 1 + (2 * (k - 2) / (k * k - 1)) * correctionSum;
  const statistic = numeratorBase / correction;
  const df1 = k - 1;
  const df2 = (k * k - 1) / (3 * correctionSum);
  return { statistic, df1, df2, pValue: fSurvival(statistic, df1, df2) };
}

export function kruskalWallis(groups) {
  const cleanGroups = groups.map((group) => group.filter(Number.isFinite)).filter((group) => group.length);
  const k = cleanGroups.length;
  const totalN = cleanGroups.reduce((sum, group) => sum + group.length, 0);
  if (k < 2 || totalN <= k) return null;
  const combined = [];
  const memberships = [];
  cleanGroups.forEach((group, groupIndex) => {
    group.forEach((value) => { combined.push(value); memberships.push(groupIndex); });
  });
  const rankInfo = rankValues(combined);
  const rankSums = Array.from({ length: k }, () => 0);
  rankInfo.ranks.forEach((rank, index) => { rankSums[memberships[index]] += rank; });
  let statistic = 12 / (totalN * (totalN + 1)) * rankSums.reduce((sum, rankSum, index) => sum + (rankSum ** 2) / cleanGroups[index].length, 0) - 3 * (totalN + 1);
  const tieTerm = rankInfo.tieCounts.reduce((sum, count) => sum + count ** 3 - count, 0);
  const correction = 1 - tieTerm / (totalN ** 3 - totalN);
  if (correction > 0) statistic /= correction;
  const df = k - 1;
  return { statistic, df, pValue: chiSquareSurvival(statistic, df), epsilonSquared: Math.max(0, (statistic - k + 1) / (totalN - k)) };
}

export function adjustPValues(pValues, method = 'holm') {
  const clean = pValues.map((value) => Number.isFinite(value) ? clampProbability(value) : 1);
  const count = clean.length;
  if (!count || method === 'none') return clean.slice();
  if (method === 'bonferroni') return clean.map((value) => Math.min(1, value * count));
  if (method === 'sidak') return clean.map((value) => Math.min(1, 1 - (1 - value) ** count));
  const indexed = clean.map((pValue, index) => ({ pValue, index })).sort((a, b) => a.pValue - b.pValue);
  const adjusted = new Array(count).fill(1);
  if (method === 'bh') {
    let runningMinimum = 1;
    for (let rank = count - 1; rank >= 0; rank -= 1) {
      runningMinimum = Math.min(runningMinimum, indexed[rank].pValue * count / (rank + 1));
      adjusted[indexed[rank].index] = Math.min(1, runningMinimum);
    }
    return adjusted;
  }
  let runningMaximum = 0;
  indexed.forEach((item, rank) => {
    runningMaximum = Math.max(runningMaximum, Math.min(1, (count - rank) * item.pValue));
    adjusted[item.index] = runningMaximum;
  });
  return adjusted;
}

function simpsonIntegral(fn, start, end, intervals) {
  const n = intervals % 2 === 0 ? intervals : intervals + 1;
  const step = (end - start) / n;
  let total = fn(start) + fn(end);
  for (let index = 1; index < n; index += 1) total += (index % 2 ? 4 : 2) * fn(start + index * step);
  return total * step / 3;
}

const studentizedRangeCache = new Map();
export function studentizedRangeInfiniteCdf(q, groupCount) {
  if (!(q > 0)) return 0;
  if (q >= 14) return 1;
  return clampProbability(simpsonIntegral((x) => {
    const intervalProbability = Math.max(0, normalCdf(x + q) - normalCdf(x));
    const density = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    return groupCount * density * intervalProbability ** (groupCount - 1);
  }, -8, 8, 160));
}

export function studentizedRangeCdf(q, groupCount, degreesOfFreedom) {
  if (!(q > 0) || groupCount < 2 || !(degreesOfFreedom > 0)) return 0;
  const roundedQ = Math.round(q * 100000) / 100000;
  const roundedDf = Math.round(degreesOfFreedom * 1000) / 1000;
  const cacheKey = `${roundedQ}|${groupCount}|${roundedDf}`;
  if (studentizedRangeCache.has(cacheKey)) return studentizedRangeCache.get(cacheKey);
  let result;
  if (degreesOfFreedom > 100000) {
    result = studentizedRangeInfiniteCdf(q, groupCount);
  } else {
    const upper = Math.sqrt((degreesOfFreedom + 12 * Math.sqrt(2 * degreesOfFreedom) + 50) / degreesOfFreedom);
    const logConstant = Math.log(2) + degreesOfFreedom / 2 * Math.log(degreesOfFreedom / 2) - logGamma(degreesOfFreedom / 2);
    const intervals = degreesOfFreedom > 1000 ? 160 : 120;
    result = simpsonIntegral((scale) => {
      if (scale === 0) return 0;
      const logDensity = logConstant + (degreesOfFreedom - 1) * Math.log(scale) - degreesOfFreedom * scale * scale / 2;
      return studentizedRangeInfiniteCdf(q * scale, groupCount) * Math.exp(logDensity);
    }, 0, upper, intervals);
  }
  result = clampProbability(result);
  studentizedRangeCache.set(cacheKey, result);
  return result;
}

export function postHocComparisons(labels, groups, method = 'welch', correction = 'holm') {
  const rows = [];
  const appliedCorrection = method === 'fisher-lsd' ? 'none' : correction;
  const omnibus = oneWayAnova(groups);
  // protected Fisher LSD：总体 ANOVA 未显著时不执行两两比较
  if (method === 'fisher-lsd' && !(omnibus && Number.isFinite(omnibus.pValue) && omnibus.pValue < ALPHA)) return rows;
  const mse = omnibus && omnibus.df2 > 0 ? omnibus.ssWithin / omnibus.df2 : null;
  const allValues = groups.flat();
  const rankInfo = rankValues(allValues);
  const tieTerm = rankInfo.tieCounts.reduce((sum, count) => sum + count ** 3 - count, 0);
  const totalN = allValues.length;
  const dunnVariance = totalN > 1
    ? totalN * (totalN + 1) / 12 - tieTerm / (12 * (totalN - 1))
    : 0;
  const rankOffsets = [];
  let offset = 0;
  groups.forEach((group) => { rankOffsets.push(offset); offset += group.length; });

  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = stats(groups[i]);
      const b = stats(groups[j]);
      if (!a || !b) continue;
      let statistic = null;
      let df = null;
      let pValue = null;
      let difference = a.mean - b.mean;
      let builtin = false;
      if (method === 'tukey' && mse !== null) {
        const se = Math.sqrt(mse / 2 * (1 / a.count + 1 / b.count));
        statistic = se === 0 ? (difference === 0 ? 0 : Infinity) : Math.abs(difference) / se;
        df = omnibus.df2;
        pValue = statistic === Infinity ? 0 : 1 - studentizedRangeCdf(statistic, groups.length, df);
        builtin = true;
      } else if (method === 'games-howell') {
        const termA = a.variance / a.count;
        const termB = b.variance / b.count;
        const se = Math.sqrt(0.5 * (termA + termB));
        statistic = se === 0 ? (difference === 0 ? 0 : Infinity) : Math.abs(difference) / se;
        const denominator = (termA ** 2) / (a.count - 1) + (termB ** 2) / (b.count - 1);
        df = denominator > 0 ? (termA + termB) ** 2 / denominator : a.count + b.count - 2;
        pValue = statistic === Infinity ? 0 : 1 - studentizedRangeCdf(statistic, groups.length, df);
        builtin = true;
      } else if (method === 'fisher-lsd') {
        if (mse === null) continue;
        const se = Math.sqrt(mse * (1 / a.count + 1 / b.count));
        statistic = se === 0 ? (difference === 0 ? 0 : Infinity) : difference / se;
        df = omnibus.df2;
        pValue = statistic === Infinity ? 0 : tTwoSidedP(statistic, df);
      } else if (method === 'pooled') {
        const result = pooledTTest(groups[i], groups[j]);
        if (!result) continue;
        statistic = result.statistic;
        df = result.df;
        pValue = result.pValue;
      } else if (method === 'mann-whitney') {
        const result = mannWhitney(groups[i], groups[j]);
        difference = a.median - b.median;
        statistic = result.statistic;
        pValue = result.pValue;
      } else if (method === 'dunn') {
        const ranksA = rankInfo.ranks.slice(rankOffsets[i], rankOffsets[i] + groups[i].length);
        const ranksB = rankInfo.ranks.slice(rankOffsets[j], rankOffsets[j] + groups[j].length);
        const meanRankA = ranksA.reduce((sum, value) => sum + value, 0) / ranksA.length;
        const meanRankB = ranksB.reduce((sum, value) => sum + value, 0) / ranksB.length;
        difference = meanRankA - meanRankB;
        const se = Math.sqrt(dunnVariance * (1 / ranksA.length + 1 / ranksB.length));
        statistic = se > 0 ? difference / se : 0;
        pValue = normalTwoSidedP(statistic);
      } else {
        const result = welchTTest(groups[i], groups[j]);
        if (!result) continue;
        statistic = result.statistic;
        df = result.df;
        pValue = result.pValue;
      }
      rows.push({ comparison: `${labels[i]} vs ${labels[j]}`, difference, statistic, df, pValue, adjustedP: pValue, correction: builtin ? 'builtin' : appliedCorrection });
    }
  }
  if (!rows.length || rows.every((row) => row.correction === 'builtin')) return rows;
  const adjusted = adjustPValues(rows.map((row) => row.pValue), appliedCorrection);
  return rows.map((row, index) => ({ ...row, adjustedP: adjusted[index] }));
}

export function combinationCountCapped(total, selected, cap) {
  if (!Number.isInteger(total) || !Number.isInteger(selected) || selected < 0 || selected > total) return { count: 0, tooLarge: false };
  const choose = Math.min(selected, total - selected);
  let count = 1;
  for (let index = 1; index <= choose; index += 1) {
    count = count * (total - choose + index) / index;
    if (count > cap) return { count, tooLarge: true };
  }
  return { count: Math.round(count), tooLarge: false };
}

export function exactTwoSamplePermutation(valuesA, valuesB, options = {}) {
  const maximumPermutations = options.maximumPermutations ?? 100000;
  const timeLimitMilliseconds = options.timeLimitMilliseconds ?? 1800;
  const nA = valuesA.length;
  const nB = valuesB.length;
  if (!nA || !nB) return { status: 'invalid', pValue: null };
  const totalN = nA + nB;
  const countInfo = combinationCountCapped(totalN, nA, maximumPermutations);
  const values = valuesA.concat(valuesB);
  const totalSum = neumaierSum(values);
  const observedSumA = neumaierSum(valuesA);
  const observedDifference = observedSumA / nA - (totalSum - observedSumA) / nB;
  if (countInfo.tooLarge) return { status: 'too-many-combinations', pValue: null, totalCount: 0, extremeCount: 0, observedDifference, estimatedCount: countInfo.count };
  const observedMagnitude = Math.abs(observedDifference);
  const tolerance = Math.max(1, observedMagnitude) * 1e-12;
  const startedAt = Date.now();
  let totalCount = 0;
  let extremeCount = 0;
  let timedOut = false;
  function enumerate(startIndex, selectedCount, selectedSum) {
    if (timedOut) return;
    if (selectedCount === nA) {
      const difference = selectedSum / nA - (totalSum - selectedSum) / nB;
      totalCount += 1;
      if (Math.abs(difference) + tolerance >= observedMagnitude) extremeCount += 1;
      if ((totalCount & 2047) === 0 && Date.now() - startedAt > timeLimitMilliseconds) timedOut = true;
      return;
    }
    const needed = nA - selectedCount;
    const lastStart = totalN - needed;
    for (let index = startIndex; index <= lastStart; index += 1) {
      enumerate(index + 1, selectedCount + 1, selectedSum + values[index]);
      if (timedOut) return;
    }
  }
  enumerate(0, 0, 0);
  if (timedOut) return { status: 'timeout', pValue: null, totalCount, extremeCount, observedDifference, estimatedCount: countInfo.count };
  if (totalCount !== countInfo.count) return { status: 'enumeration-failed', pValue: null, totalCount, extremeCount, observedDifference, estimatedCount: countInfo.count };
  return { status: 'exact', pValue: extremeCount / totalCount, totalCount, extremeCount, observedDifference };
}

export function contingencyStatistics(counts) {
  const rowCount = counts.length;
  const columnCount = rowCount ? counts[0].length : 0;
  if (rowCount < 2 || columnCount < 2) return null;
  const rowTotals = counts.map((row) => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = Array.from({ length: columnCount }, (_, columnIndex) => counts.reduce((sum, row) => sum + row[columnIndex], 0));
  const total = rowTotals.reduce((sum, value) => sum + value, 0);
  if (!total || rowTotals.some((value) => value === 0) || columnTotals.some((value) => value === 0)) return null;
  const expected = counts.map((row, rowIndex) => row.map((_, columnIndex) => rowTotals[rowIndex] * columnTotals[columnIndex] / total));
  let statistic = 0;
  let lowExpected = 0;
  counts.forEach((row, rowIndex) => row.forEach((observed, columnIndex) => {
    const expectation = expected[rowIndex][columnIndex];
    statistic += (observed - expectation) ** 2 / expectation;
    if (expectation < 5) lowExpected += 1;
  }));
  const df = (rowCount - 1) * (columnCount - 1);
  const minDimension = Math.min(rowCount - 1, columnCount - 1);
  return {
    statistic,
    df,
    pValue: chiSquareSurvival(statistic, df),
    expected,
    lowExpected,
    totalCells: rowCount * columnCount,
    cramerV: minDimension > 0 ? Math.sqrt(statistic / (total * minDimension)) : null,
    rowTotals,
    columnTotals,
    total,
  };
}

export function fixedMarginExact(counts, options = {}) {
  const summary = contingencyStatistics(counts);
  if (!summary) return { status: 'invalid', pValue: null };
  const maximumTables = options.maximumTables ?? 100000;
  const timeLimitMilliseconds = options.timeLimitMilliseconds ?? 1800;
  const rowTotals = summary.rowTotals;
  const columnTotals = summary.columnTotals;
  const rowCount = rowTotals.length;
  const columnCount = columnTotals.length;
  const isTwoByTwo = rowCount === 2 && columnCount === 2;
  const table = Array.from({ length: rowCount }, () => Array(columnCount).fill(0));
  const remainingColumns = columnTotals.slice();
  const logConstant = rowTotals.reduce((sum, value) => sum + logGamma(value + 1), 0)
    + columnTotals.reduce((sum, value) => sum + logGamma(value + 1), 0)
    - logGamma(summary.total + 1);
  const observed = summary.statistic;
  // 预计算 logGamma 缓存
  const maxCellValue = Math.max(...rowTotals, ...columnTotals);
  const logGammaCache = new Array(maxCellValue + 1);
  for (let v = 0; v <= maxCellValue; v++) logGammaCache[v] = logGamma(v + 1);
  // 预计算期望频数与倒数 + 后缀列容量（r×c 优化）
  const expectedCache = [];
  const expectedRecipCache = [];
  for (let r = 0; r < rowCount; r++) {
    expectedCache[r] = [];
    expectedRecipCache[r] = [];
    for (let c = 0; c < columnCount; c++) {
      const exp = rowTotals[r] * columnTotals[c] / summary.total;
      expectedCache[r][c] = exp;
      expectedRecipCache[r][c] = exp > 0 ? 1 / exp : 0;
    }
  }
  // 后缀容量：suffixCapacity[c] = remainingColumns[c+1..end] 之和
  const suffixCapacity = new Array(columnCount + 1).fill(0);
  const refreshSuffixCapacity = () => {
    suffixCapacity[columnCount] = 0;
    for (let c = columnCount - 1; c >= 0; c--) suffixCapacity[c] = suffixCapacity[c + 1] + remainingColumns[c];
  };
  refreshSuffixCapacity();
  const startedAt = Date.now();
  let tableCount = 0;
  let totalProbability = 0;
  let extremeProbability = 0;
  // 对数空间累加（仅 2×2）
  let logTotalProb = -Infinity;
  let logExtremeProb = -Infinity;
  let stopped = null;

  // 2×2 标准双侧 Fisher：按表概率排序
  let logObservedProb = -Infinity;
  if (isTwoByTwo) {
    let logDenom = 0;
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < columnCount; c++) logDenom += logGammaCache[counts[r][c]];
    }
    logObservedProb = logConstant - logDenom;
  }

  const evaluate = () => {
    tableCount += 1;
    if (tableCount > maximumTables) { stopped = 'too-many-tables'; return; }
    if ((tableCount & 1023) === 0 && Date.now() - startedAt > timeLimitMilliseconds) { stopped = 'timeout'; return; }
    // 计算对数概率
    let logDenominator = 0;
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < columnCount; c++) logDenominator += logGammaCache[table[r][c]];
    }
    const logProb = logConstant - logDenominator;
    if (isTwoByTwo) {
      // 对数空间比较：使用相对容差避免浮点排除等概率表
      const logTolerance = Math.log1p(1e-12);
      logTotalProb = logAddExp(logTotalProb, logProb);
      if (logProb <= logObservedProb + logTolerance) {
        logExtremeProb = logAddExp(logExtremeProb, logProb);
      }
    } else {
      totalProbability += Math.exp(logProb);
      // r×c：基于 Pearson χ² 极端性，增量计算统计量
      let statistic = 0;
      for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < columnCount; c++) {
          const diff = table[r][c] - expectedCache[r][c];
          statistic += diff * diff * expectedRecipCache[r][c];
        }
      }
      const tolerance = Math.max(1, observed) * 1e-12;
      if (statistic + tolerance >= observed) extremeProbability += Math.exp(logProb);
    }
  };

  function fillRow(rowIndex) {
    if (stopped) return;
    // 刷新后缀容量：remainingColumns 已被前面行消耗
    refreshSuffixCapacity();
    if (rowIndex === rowCount - 1) {
      let lastRowSum = 0;
      for (let c = 0; c < columnCount; c++) lastRowSum += remainingColumns[c];
      if (lastRowSum !== rowTotals[rowIndex]) return;
      for (let c = 0; c < columnCount; c += 1) table[rowIndex][c] = remainingColumns[c];
      evaluate();
      return;
    }

    function fillColumn(columnIndex, remainingInRow) {
      if (stopped) return;
      if (columnIndex === columnCount - 1) {
        const value = remainingInRow;
        if (value < 0 || value > remainingColumns[columnIndex]) return;
        table[rowIndex][columnIndex] = value;
        remainingColumns[columnIndex] -= value;
        fillRow(rowIndex + 1);
        remainingColumns[columnIndex] += value;
        return;
      }
      // 使用预计算后缀容量（columns[c+1..end] 不变，无需刷新）
      const remainingCapacity = suffixCapacity[columnIndex + 1];
      const minimum = Math.max(0, remainingInRow - remainingCapacity);
      const maximum = Math.min(remainingInRow, remainingColumns[columnIndex]);
      for (let value = minimum; value <= maximum; value += 1) {
        table[rowIndex][columnIndex] = value;
        remainingColumns[columnIndex] -= value;
        fillColumn(columnIndex + 1, remainingInRow - value);
        remainingColumns[columnIndex] += value;
        if (stopped) return;
      }
    }
    fillColumn(0, rowTotals[rowIndex]);
  }

  fillRow(0);
  if (stopped) return { status: stopped, pValue: null, tableCount, observedStatistic: observed };
  // 2×2 使用对数空间累加避免下溢，r×c 使用线性累加
  if (isTwoByTwo) {
    if (logTotalProb === -Infinity) return { status: 'enumeration-failed', pValue: null, tableCount, observedStatistic: observed };
    const pValue = clampProbability(Math.exp(logExtremeProb - logTotalProb));
    return { status: 'exact', pValue, tableCount, observedStatistic: observed, method: 'fisher' };
  }
  if (!(totalProbability > 0)) return { status: 'enumeration-failed', pValue: null, tableCount, observedStatistic: observed };
  const pValue = clampProbability(extremeProbability / totalProbability);
  return { status: 'exact', pValue, tableCount, observedStatistic: observed, method: 'pearson-chi-squared-exact' };
}

export function safeCsvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(safeCsvCell).join(',')).join('\r\n');
}
