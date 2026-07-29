'use strict';

const STORAGE_KEY = 'basic-stat-demo-v6';
const ALPHA = 0.05;
const elements = {
  analysisSelect: document.querySelector('#analysisSelect'),
  modeDescription: document.querySelector('#modeDescription'),
  valueColumnField: document.querySelector('#valueColumnField'),
  valueColumn: document.querySelector('#valueColumn'),
  groupColumnField: document.querySelector('#groupColumnField'),
  groupColumnLabel: document.querySelector('#groupColumnLabel'),
  groupColumn: document.querySelector('#groupColumn'),
  categoryColumnAField: document.querySelector('#categoryColumnAField'),
  categoryColumnA: document.querySelector('#categoryColumnA'),
  categoryColumnBField: document.querySelector('#categoryColumnBField'),
  categoryColumnB: document.querySelector('#categoryColumnB'),
  normalityMethodField: document.querySelector('#normalityMethodField'),
  normalityMethod: document.querySelector('#normalityMethod'),
  varianceMethodField: document.querySelector('#varianceMethodField'),
  varianceMethod: document.querySelector('#varianceMethod'),
  correlationMethodField: document.querySelector('#correlationMethodField'),
  correlationMethod: document.querySelector('#correlationMethod'),
  postHocMethodField: document.querySelector('#postHocMethodField'),
  postHocMethod: document.querySelector('#postHocMethod'),
  postHocCorrectionField: document.querySelector('#postHocCorrectionField'),
  postHocCorrection: document.querySelector('#postHocCorrection'),
  missingModeField: document.querySelector('#missingModeField'),
  missingMode: document.querySelector('#missingMode'),
  formulaNote: document.querySelector('#formulaNote'),
  fileInput: document.querySelector('#fileInput'),
  pasteArea: document.querySelector('#pasteArea'),
  parseTableBtn: document.querySelector('#parseTableBtn'),
  parseGroupsBtn: document.querySelector('#parseGroupsBtn'),
  readClipboardBtn: document.querySelector('#readClipboardBtn'),
  clearInputBtn: document.querySelector('#clearInputBtn'),
  dropZone: document.querySelector('#dropZone'),
  exampleSelect: document.querySelector('#exampleSelect'),
  loadExampleBtn: document.querySelector('#loadExampleBtn'),
  clearDataBtn: document.querySelector('#clearDataBtn'),
  createTableBtn: document.querySelector('#createTableBtn'),
  addRowBtn: document.querySelector('#addRowBtn'),
  addColumnBtn: document.querySelector('#addColumnBtn'),
  deleteRowBtn: document.querySelector('#deleteRowBtn'),
  deleteColumnBtn: document.querySelector('#deleteColumnBtn'),
  editorStatus: document.querySelector('#editorStatus'),
  resetBtn: document.querySelector('#resetBtn'),
  dataHead: document.querySelector('#dataHead'),
  dataBody: document.querySelector('#dataBody'),
  dataHelp: document.querySelector('#dataHelp'),
  recommendation: document.querySelector('#recommendation'),
  summary: document.querySelector('#summary'),
  alerts: document.querySelector('#alerts'),
  diagnosticsCard: document.querySelector('#diagnosticsCard'),
  diagnosticsHead: document.querySelector('#diagnosticsHead'),
  diagnosticsBody: document.querySelector('#diagnosticsBody'),
  chartCard: document.querySelector('#chartCard'),
  chartTitle: document.querySelector('#chartTitle'),
  chartMeta: document.querySelector('#chartMeta'),
  chartBars: document.querySelector('#chartBars'),
  resultsHead: document.querySelector('#resultsHead'),
  resultsBody: document.querySelector('#resultsBody'),
  postHocCard: document.querySelector('#postHocCard'),
  postHocTitle: document.querySelector('#postHocTitle'),
  postHocMeta: document.querySelector('#postHocMeta'),
  postHocHead: document.querySelector('#postHocHead'),
  postHocBody: document.querySelector('#postHocBody'),
  copyBtn: document.querySelector('#copyBtn'),
  exportBtn: document.querySelector('#exportBtn'),
};

let state = getDefaultState();
let latestResult = { headers: [], rows: [] };
let selectedCell = null;
let calculationTimer = null;

function getDefaultState() {
  return {
    analysisMode: 'overview',
    valueColumn: '',
    groupColumn: '',
    categoryColumnA: '',
    categoryColumnB: '',
    normalityMethod: 'auto',
    varianceMethod: 'auto',
    correlationMethod: 'auto',
    postHocMethod: 'auto',
    postHocCorrection: 'auto',
    missingMode: 'ignore',
    headers: [],
    rows: [],
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value, decimals = 3) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
}

function formatPValue(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 0.0001) return '< 0.0001';
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value).trim().replaceAll(',', '').replace(/[%％]$/, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('无法保存本地数据：', error);
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    state = Object.assign(getDefaultState(), saved);
    if (!Array.isArray(state.headers) || !Array.isArray(state.rows)) state = getDefaultState();
  } catch (error) {
    console.warn('无法读取本地数据：', error);
  }
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) || '';
  const counts = {
    '\t': (firstLine.match(/\t/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length,
  };
  if (counts['\t'] >= counts[','] && counts['\t'] >= counts[';'] && counts['\t'] > 0) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

function parseDelimited(text) {
  const delimiter = detectDelimiter(text);
  const parsedRows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell.trim());
      cell = '';
      if (row.some((value) => value !== '')) parsedRows.push(row);
      row = [];
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value !== '')) parsedRows.push(row);
  if (!parsedRows.length) return { headers: [], rows: [] };

  const width = Math.max(...parsedRows.map((item) => item.length));
  const rawHeaders = parsedRows[0];
  const headers = [];
  for (let index = 0; index < width; index += 1) {
    const proposed = rawHeaders[index] || `字段 ${index + 1}`;
    let name = proposed;
    let suffix = 2;
    while (headers.includes(name)) {
      name = `${proposed} (${suffix})`;
      suffix += 1;
    }
    headers.push(name);
  }
  const rows = parsedRows.slice(1).map((item) => headers.map((_, index) => item[index] ?? ''));
  return { headers, rows };
}

function parseGroupedValues(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };

  const colonRows = [];
  let colonMode = true;
  lines.forEach((line) => {
    const match = line.match(/^\s*([^:：]+?)\s*[:：]\s*(.+)$/);
    if (!match) {
      colonMode = false;
      return;
    }
    const label = match[1].trim();
    const values = match[2].split(/[\s,，;；]+/).map(toNumber).filter(Number.isFinite);
    values.forEach((value) => colonRows.push([label, String(value)]));
  });
  if (colonMode && colonRows.length) return { headers: ['组别', '数值'], rows: colonRows };

  const wide = parseDelimited(text);
  if (wide.headers.length >= 2 && wide.rows.length) {
    const rows = [];
    wide.headers.forEach((header, columnIndex) => {
      wide.rows.forEach((sourceRow) => {
        const value = toNumber(sourceRow[columnIndex]);
        if (Number.isFinite(value)) rows.push([header, String(value)]);
      });
    });
    if (rows.length) return { headers: ['组别', '数值'], rows };
  }
  return { headers: [], rows: [] };
}

function getColumnValues(columnName) {
  const index = state.headers.indexOf(columnName);
  if (index < 0) return [];
  return state.rows.map((row) => row[index] ?? '');
}

function getColumnProfile(columnName) {
  const values = getColumnValues(columnName);
  const nonEmpty = values.filter((value) => String(value).trim() !== '');
  const numbers = nonEmpty.map(toNumber).filter(Number.isFinite);
  const numericRatio = nonEmpty.length ? numbers.length / nonEmpty.length : 0;
  const isNumeric = nonEmpty.length > 0 && numericRatio >= 0.8;
  return {
    name: columnName,
    total: values.length,
    valid: nonEmpty.length,
    missing: values.length - nonEmpty.length,
    unique: new Set(nonEmpty.map(String)).size,
    numbers,
    isNumeric,
    type: isNumeric ? '数值' : '文本',
  };
}

function getNumericColumns() {
  return state.headers.filter((header) => getColumnProfile(header).isNumeric);
}

function getCategoricalCandidates() {
  const maximumLevels = Math.max(5, Math.min(30, Math.ceil(Math.sqrt(Math.max(1, state.rows.length)) * 2.5)));
  const candidates = state.headers.filter((header) => {
    const profile = getColumnProfile(header);
    return profile.unique >= 2 && profile.unique <= maximumLevels;
  });
  return candidates.length ? candidates : state.headers.slice();
}

function numericValues(columnName) {
  const raw = getColumnValues(columnName);
  if (state.missingMode === 'zero') return raw.map((value) => toNumber(value) ?? 0);
  return raw.map(toNumber).filter(Number.isFinite);
}

function quantile(sorted, probability) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const base = Math.floor(position);
  const fraction = position - base;
  return sorted[base + 1] === undefined
    ? sorted[base]
    : sorted[base] + fraction * (sorted[base + 1] - sorted[base]);
}

function stats(values) {
  const clean = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!clean.length) return null;
  const count = clean.length;
  const sum = clean.reduce((total, value) => total + value, 0);
  const mean = sum / count;
  const ss = clean.reduce((total, value) => total + (value - mean) ** 2, 0);
  const variance = count > 1 ? ss / (count - 1) : 0;
  return {
    count,
    sum,
    mean,
    variance,
    sd: Math.sqrt(variance),
    median: quantile(clean, 0.5),
    q1: quantile(clean, 0.25),
    q3: quantile(clean, 0.75),
    min: clean[0],
    max: clean[clean.length - 1],
  };
}

function logGamma(value) {
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

function regularizedGammaQ(shape, value) {
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
    return Math.max(0, Math.min(1, 1 - sum * Math.exp(logScale)));
  }
  let b = value + 1 - shape;
  let c = 1 / tiny;
  let d = 1 / Math.max(b, tiny);
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
  return Math.max(0, Math.min(1, Math.exp(logScale) * fraction));
}

function betaContinuedFraction(a, b, x) {
  const maxIterations = 200;
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

function regularizedBeta(x, a, b) {
  if (!(a > 0) || !(b > 0) || x < 0 || x > 1) return null;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betaContinuedFraction(a, b, x) / a;
  return 1 - bt * betaContinuedFraction(b, a, 1 - x) / b;
}

function chiSquareSurvival(statistic, degreesOfFreedom) {
  if (!Number.isFinite(statistic) || !(degreesOfFreedom > 0)) return null;
  return regularizedGammaQ(degreesOfFreedom / 2, statistic / 2);
}

function fSurvival(statistic, df1, df2) {
  if (!Number.isFinite(statistic) || statistic < 0 || !(df1 > 0) || !(df2 > 0)) return null;
  const x = df2 / (df2 + df1 * statistic);
  return regularizedBeta(x, df2 / 2, df1 / 2);
}

function tTwoSidedP(statistic, degreesOfFreedom) {
  if (!Number.isFinite(statistic) || !(degreesOfFreedom > 0)) return null;
  const x = degreesOfFreedom / (degreesOfFreedom + statistic * statistic);
  return regularizedBeta(x, degreesOfFreedom / 2, 0.5);
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-x * x));
}

function normalTwoSidedP(z) {
  if (!Number.isFinite(z)) return null;
  return Math.max(0, Math.min(1, 1 - erf(Math.abs(z) / Math.SQRT2)));
}

function clampProbability(value) {
  return Math.max(0, Math.min(1, value));
}

function normalCdf(value) {
  return clampProbability(0.5 * (1 + erf(value / Math.SQRT2)));
}

function inverseNormalCdf(probability) {
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

function distributionMoments(values) {
  const clean = values.filter(Number.isFinite);
  const n = clean.length;
  if (!n) return { n: 0, skewness: null, kurtosis: null, excessKurtosis: null, variance: null };
  const mean = clean.reduce((sum, value) => sum + value, 0) / n;
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

function shapiroFamily(values) {
  const base = normalityResultBase(values, 'shapiro', 'Shapiro 系列', 3);
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

function andersonDarling(values) {
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

function dagostinoPearson(values) {
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

function jarqueBera(values) {
  const base = normalityResultBase(values, 'jarque', 'Jarque–Bera', 8);
  if (!base.clean) return base;
  const statistic = base.n / 6 * (base.skewness ** 2 + (base.excessKurtosis ** 2) / 4);
  const pValue = chiSquareSurvival(statistic, 2);
  return { ...base, clean: undefined, statistic, pValue, status: pValue >= ALPHA ? 'pass' : 'fail' };
}

function chooseAutomaticNormalityMethod(values) {
  const clean = values.filter(Number.isFinite);
  const n = clean.length;
  const uniqueCount = new Set(clean).size;
  const tieRate = n ? 1 - uniqueCount / n : 1;
  if (n < 3) return { key: 'shapiro', reason: '有效样本量不足 3，无法可靠执行正态性检验。' };
  if (n === 3) return { key: 'shapiro', reason: 'n = 3，采用 Shapiro–Wilk 的精确小样本形式。' };
  if (n === 4) return { key: 'anderson', reason: 'n = 4，采用 Anderson–Darling，并保守解释 P 值。' };
  if (tieRate >= 0.2) {
    return n >= 20
      ? { key: 'dagostino', reason: '重复值或取整值较多，改用基于偏度与峰度的 D’Agostino–Pearson K²。' }
      : { key: 'anderson', reason: '重复值或取整值较多且样本较小，采用 Anderson–Darling，并提示谨慎解释。' };
  }
  if (n <= 49) return { key: 'shapiro', reason: '小样本采用 Shapiro 系列，通常对整体偏离较敏感。' };
  if (n <= 299) return { key: 'anderson', reason: '中等样本采用 Anderson–Darling，兼顾中心与尾部偏离。' };
  if (n <= 1999) return { key: 'dagostino', reason: '较大样本采用 D’Agostino–Pearson K²，综合检查偏度与峰度。' };
  return { key: 'jarque', reason: '超大样本采用计算较快的 Jarque–Bera；此时任何检验都可能对微小偏离非常敏感。' };
}

function runNormalityTest(values, requestedMethod = state.normalityMethod) {
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

function rankValues(values) {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length);
  const tieCounts = [];
  let cursor = 0;
  while (cursor < indexed.length) {
    let end = cursor + 1;
    while (end < indexed.length && indexed[end].value === indexed[cursor].value) end += 1;
    const averageRank = (cursor + 1 + end) / 2;
    for (let index = cursor; index < end; index += 1) ranks[indexed[index].index] = averageRank;
    tieCounts.push(end - cursor);
    cursor = end;
  }
  return { ranks, tieCounts };
}

function pearsonFromArrays(valuesA, valuesB) {
  if (valuesA.length !== valuesB.length || valuesA.length < 3) return null;
  const meanA = valuesA.reduce((sum, value) => sum + value, 0) / valuesA.length;
  const meanB = valuesB.reduce((sum, value) => sum + value, 0) / valuesB.length;
  let numerator = 0;
  let sumA = 0;
  let sumB = 0;
  valuesA.forEach((value, index) => {
    const da = value - meanA;
    const db = valuesB[index] - meanB;
    numerator += da * db;
    sumA += da * da;
    sumB += db * db;
  });
  const denominator = Math.sqrt(sumA * sumB);
  return denominator === 0 ? null : numerator / denominator;
}

function correlationPair(columnA, columnB, method) {
  const indexA = state.headers.indexOf(columnA);
  const indexB = state.headers.indexOf(columnB);
  const pairs = state.rows.map((row) => [toNumber(row[indexA]), toNumber(row[indexB])])
    .filter((pair) => Number.isFinite(pair[0]) && Number.isFinite(pair[1]));
  if (pairs.length < 3) return { coefficient: null, pValue: null, n: pairs.length };
  const valuesA = pairs.map((pair) => pair[0]);
  const valuesB = pairs.map((pair) => pair[1]);
  let coefficient;
  if (method === 'spearman') {
    coefficient = pearsonFromArrays(rankValues(valuesA).ranks, rankValues(valuesB).ranks);
  } else {
    coefficient = pearsonFromArrays(valuesA, valuesB);
  }
  if (!Number.isFinite(coefficient) || Math.abs(coefficient) >= 1) {
    return { coefficient, pValue: coefficient === null ? null : 0, n: pairs.length };
  }
  const t = coefficient * Math.sqrt((pairs.length - 2) / (1 - coefficient * coefficient));
  return { coefficient, pValue: tTwoSidedP(t, pairs.length - 2), n: pairs.length };
}

function oneWayAnova(groups) {
  const cleanGroups = groups.map((group) => group.filter(Number.isFinite)).filter((group) => group.length);
  const k = cleanGroups.length;
  const n = cleanGroups.reduce((sum, group) => sum + group.length, 0);
  if (k < 2 || n <= k) return null;
  const means = cleanGroups.map((group) => stats(group).mean);
  const grandMean = cleanGroups.reduce((sum, group) => sum + group.reduce((s, v) => s + v, 0), 0) / n;
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

function leveneVarianceTest(groups, center = 'median') {
  if (groups.length < 2 || groups.some((group) => group.length < 2)) return null;
  const deviations = groups.map((group) => {
    const groupStats = stats(group);
    const location = center === 'mean' ? groupStats.mean : groupStats.median;
    return group.map((value) => Math.abs(value - location));
  });
  const result = oneWayAnova(deviations);
  if (!result) return null;
  return {
    key: center === 'mean' ? 'levene' : 'brown',
    name: center === 'mean' ? 'Levene' : 'Brown–Forsythe',
    statistic: result.statistic,
    df1: result.df1,
    df2: result.df2,
    pValue: result.pValue,
  };
}

function brownForsythe(groups) {
  return leveneVarianceTest(groups, 'median');
}

function bartlettVarianceTest(groups) {
  if (groups.length < 2 || groups.some((group) => group.length < 2)) return null;
  const summaries = groups.map(stats);
  if (summaries.some((item) => !item || !(item.variance > 0))) return null;
  const k = summaries.length;
  const totalDf = summaries.reduce((sum, item) => sum + item.count - 1, 0);
  if (totalDf <= 0) return null;
  const pooledVariance = summaries.reduce((sum, item) => sum + (item.count - 1) * item.variance, 0) / totalDf;
  const numerator = totalDf * Math.log(pooledVariance)
    - summaries.reduce((sum, item) => sum + (item.count - 1) * Math.log(item.variance), 0);
  const correction = 1 + (summaries.reduce((sum, item) => sum + 1 / (item.count - 1), 0) - 1 / totalDf) / (3 * (k - 1));
  const statistic = numerator / correction;
  return {
    key: 'bartlett',
    name: 'Bartlett',
    statistic,
    df1: k - 1,
    df2: null,
    pValue: chiSquareSurvival(statistic, k - 1),
  };
}

function chooseAutomaticVarianceMethod(groups, normalityResults = []) {
  const allNormal = normalityResults.length === groups.length && normalityResults.every((item) => item.status === 'pass');
  const enough = groups.every((group) => group.length >= 5);
  const heavyTies = groups.some((group) => group.length && 1 - new Set(group).size / group.length >= 0.2);
  return allNormal && enough && !heavyTies
    ? { key: 'bartlett', reason: '各组正态性诊断均未提示明显偏离、n ≥ 5 且重复值不多，自动推荐 Bartlett。' }
    : { key: 'brown', reason: '存在非正态、样本量偏小、重复/取整值较多或无法判断的组，自动推荐更稳健的 Brown–Forsythe。' };
}

function runVarianceTest(groups, normalityResults = [], requestedMethod = state.varianceMethod) {
  const automatic = chooseAutomaticVarianceMethod(groups, normalityResults);
  const key = requestedMethod === 'auto' ? automatic.key : requestedMethod;
  const result = key === 'bartlett' ? bartlettVarianceTest(groups)
    : key === 'levene' ? leveneVarianceTest(groups, 'mean')
      : brownForsythe(groups);
  if (!result) return null;
  return {
    ...result,
    selectedByAuto: requestedMethod === 'auto',
    recommendationReason: automatic.reason,
    automaticKey: automatic.key,
  };
}

function pooledTTest(valuesA, valuesB) {
  const a = stats(valuesA);
  const b = stats(valuesB);
  if (!a || !b || a.count < 2 || b.count < 2) return null;
  const df = a.count + b.count - 2;
  const pooledVariance = ((a.count - 1) * a.variance + (b.count - 1) * b.variance) / df;
  const se = Math.sqrt(pooledVariance * (1 / a.count + 1 / b.count));
  const statistic = se === 0 ? (a.mean === b.mean ? 0 : Infinity) : (a.mean - b.mean) / se;
  const pooledSd = Math.sqrt(pooledVariance);
  return {
    statistic,
    df,
    pValue: statistic === Infinity ? 0 : tTwoSidedP(statistic, df),
    effect: pooledSd > 0 ? (a.mean - b.mean) / pooledSd : null,
  };
}

function welchTTest(valuesA, valuesB) {
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

function mannWhitney(valuesA, valuesB) {
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
  const varianceU = n1 * n2 / 12 * ((n + 1) - tieTerm / (n * (n - 1)));
  const meanU = n1 * n2 / 2;
  const continuity = u < meanU ? 0.5 : -0.5;
  const z = varianceU > 0 ? (u - meanU + continuity) / Math.sqrt(varianceU) : 0;
  const rankBiserial = 2 * u1 / (n1 * n2) - 1;
  return { statistic: u, u1, u2, z, pValue: normalTwoSidedP(z), effect: rankBiserial };
}

function welchAnova(groups) {
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

function kruskalWallis(groups) {
  const cleanGroups = groups.map((group) => group.filter(Number.isFinite)).filter((group) => group.length);
  const k = cleanGroups.length;
  const totalN = cleanGroups.reduce((sum, group) => sum + group.length, 0);
  if (k < 2 || totalN <= k) return null;
  const combined = [];
  const memberships = [];
  cleanGroups.forEach((group, groupIndex) => {
    group.forEach((value) => {
      combined.push(value);
      memberships.push(groupIndex);
    });
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


function adjustPValues(pValues, method = 'holm') {
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

function applyPostHocCorrection(rows, correction = 'holm') {
  const adjusted = adjustPValues(rows.map((row) => row.pValue), correction);
  return rows.map((row, index) => ({ ...row, adjustedP: adjusted[index], correction }));
}

function pairwisePooledPostHoc(labels, groups, correction = 'holm') {
  const omnibus = oneWayAnova(groups);
  if (!omnibus || !(omnibus.df2 > 0)) return [];
  const mse = omnibus.ssWithin / omnibus.df2;
  const rows = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = stats(groups[i]);
      const b = stats(groups[j]);
      const difference = a.mean - b.mean;
      const se = Math.sqrt(mse * (1 / a.count + 1 / b.count));
      const statistic = se === 0 ? (difference === 0 ? 0 : Infinity) : difference / se;
      const pValue = statistic === Infinity ? 0 : tTwoSidedP(statistic, omnibus.df2);
      rows.push({ comparison: `${labels[i]} vs ${labels[j]}`, difference, statistic, df: omnibus.df2, pValue });
    }
  }
  return applyPostHocCorrection(rows, correction);
}

function pairwiseWelchPostHoc(labels, groups, correction = 'holm') {
  const rows = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const result = welchTTest(groups[i], groups[j]);
      const a = stats(groups[i]);
      const b = stats(groups[j]);
      if (!result || !a || !b) continue;
      rows.push({ comparison: `${labels[i]} vs ${labels[j]}`, difference: a.mean - b.mean, statistic: result.statistic, df: result.df, pValue: result.pValue });
    }
  }
  return applyPostHocCorrection(rows, correction);
}

function dunnPostHoc(labels, groups, correction = 'holm') {
  const combined = [];
  const memberships = [];
  groups.forEach((group, groupIndex) => {
    group.forEach((value) => {
      if (Number.isFinite(value)) { combined.push(value); memberships.push(groupIndex); }
    });
  });
  if (combined.length < 3) return [];
  const rankInfo = rankValues(combined);
  const rankSums = Array.from({ length: groups.length }, () => 0);
  const counts = Array.from({ length: groups.length }, () => 0);
  rankInfo.ranks.forEach((rank, index) => {
    const groupIndex = memberships[index];
    rankSums[groupIndex] += rank;
    counts[groupIndex] += 1;
  });
  const n = combined.length;
  const tieTerm = rankInfo.tieCounts.reduce((sum, count) => sum + count ** 3 - count, 0);
  const tieCorrection = n > 1 ? 1 - tieTerm / (n ** 3 - n) : 1;
  const baseVariance = n * (n + 1) / 12 * tieCorrection;
  const rows = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      if (!counts[i] || !counts[j]) continue;
      const meanRankI = rankSums[i] / counts[i];
      const meanRankJ = rankSums[j] / counts[j];
      const difference = meanRankI - meanRankJ;
      const se = Math.sqrt(baseVariance * (1 / counts[i] + 1 / counts[j]));
      const statistic = se > 0 ? difference / se : 0;
      rows.push({ comparison: `${labels[i]} vs ${labels[j]}`, difference, statistic, df: null, pValue: normalTwoSidedP(statistic) });
    }
  }
  return applyPostHocCorrection(rows, correction);
}

function pairwiseMannWhitneyPostHoc(labels, groups, correction = 'holm') {
  const rows = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const result = mannWhitney(groups[i], groups[j]);
      const a = stats(groups[i]);
      const b = stats(groups[j]);
      if (!result || !a || !b) continue;
      rows.push({ comparison: `${labels[i]} vs ${labels[j]}`, difference: a.median - b.median, statistic: result.statistic, secondaryStatistic: result.z, df: null, pValue: result.pValue });
    }
  }
  return applyPostHocCorrection(rows, correction);
}

const studentizedRangeCache = new Map();

function simpsonIntegral(fn, start, end, intervals) {
  const n = intervals % 2 === 0 ? intervals : intervals + 1;
  const step = (end - start) / n;
  let total = fn(start) + fn(end);
  for (let index = 1; index < n; index += 1) total += (index % 2 ? 4 : 2) * fn(start + index * step);
  return total * step / 3;
}

function studentizedRangeInfiniteCdf(q, groupCount) {
  if (!(q > 0)) return 0;
  if (q >= 14) return 1;
  return clampProbability(simpsonIntegral((x) => {
    const intervalProbability = Math.max(0, normalCdf(x + q) - normalCdf(x));
    const density = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    return groupCount * density * intervalProbability ** (groupCount - 1);
  }, -8, 8, 120));
}

function studentizedRangeCdf(q, groupCount, degreesOfFreedom) {
  if (!(q > 0) || groupCount < 2 || !(degreesOfFreedom > 0)) return 0;
  const roundedQ = Math.round(q * 100000) / 100000;
  const roundedDf = Math.round(degreesOfFreedom * 1000) / 1000;
  const cacheKey = `${roundedQ}|${groupCount}|${roundedDf}`;
  if (studentizedRangeCache.has(cacheKey)) return studentizedRangeCache.get(cacheKey);
  let result;
  if (degreesOfFreedom > 200) {
    result = studentizedRangeInfiniteCdf(q, groupCount);
  } else {
    const upper = Math.sqrt((degreesOfFreedom + 12 * Math.sqrt(2 * degreesOfFreedom) + 50) / degreesOfFreedom);
    const logConstant = Math.log(2) + degreesOfFreedom / 2 * Math.log(degreesOfFreedom / 2) - logGamma(degreesOfFreedom / 2);
    result = simpsonIntegral((scale) => {
      if (scale === 0) return 0;
      const logDensity = logConstant + (degreesOfFreedom - 1) * Math.log(scale) - degreesOfFreedom * scale * scale / 2;
      return studentizedRangeInfiniteCdf(q * scale, groupCount) * Math.exp(logDensity);
    }, 0, upper, 80);
  }
  result = clampProbability(result);
  studentizedRangeCache.set(cacheKey, result);
  return result;
}

function tukeyKramerPostHoc(labels, groups) {
  const omnibus = oneWayAnova(groups);
  if (!omnibus || !(omnibus.df2 > 0)) return [];
  const mse = omnibus.ssWithin / omnibus.df2;
  const rows = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = stats(groups[i]);
      const b = stats(groups[j]);
      const difference = a.mean - b.mean;
      const se = Math.sqrt(mse / 2 * (1 / a.count + 1 / b.count));
      const statistic = se === 0 ? (difference === 0 ? 0 : Infinity) : Math.abs(difference) / se;
      const pValue = statistic === Infinity ? 0 : 1 - studentizedRangeCdf(statistic, groups.length, omnibus.df2);
      rows.push({ comparison: `${labels[i]} vs ${labels[j]}`, difference, statistic, df: omnibus.df2, pValue, adjustedP: pValue, correction: 'builtin' });
    }
  }
  return rows;
}

function gamesHowellPostHoc(labels, groups) {
  const rows = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = stats(groups[i]);
      const b = stats(groups[j]);
      if (!a || !b || a.count < 2 || b.count < 2) continue;
      const termA = a.variance / a.count;
      const termB = b.variance / b.count;
      const difference = a.mean - b.mean;
      const se = Math.sqrt(0.5 * (termA + termB));
      const statistic = se === 0 ? (difference === 0 ? 0 : Infinity) : Math.abs(difference) / se;
      const denominator = (termA ** 2) / (a.count - 1) + (termB ** 2) / (b.count - 1);
      const df = denominator > 0 ? (termA + termB) ** 2 / denominator : a.count + b.count - 2;
      const pValue = statistic === Infinity ? 0 : 1 - studentizedRangeCdf(statistic, groups.length, df);
      rows.push({ comparison: `${labels[i]} vs ${labels[j]}`, difference, statistic, df, pValue, adjustedP: pValue, correction: 'builtin' });
    }
  }
  return rows;
}

function buildIndependentSamples(groupColumn, valueColumn) {
  const groupIndex = state.headers.indexOf(groupColumn);
  const valueIndex = state.headers.indexOf(valueColumn);
  const labels = [];
  const map = new Map();
  let excluded = 0;
  state.rows.forEach((row) => {
    const label = String(row[groupIndex] ?? '').trim();
    const value = toNumber(row[valueIndex]);
    if (!label || !Number.isFinite(value)) {
      excluded += 1;
      return;
    }
    if (!map.has(label)) {
      map.set(label, []);
      labels.push(label);
    }
    map.get(label).push(value);
  });
  return { labels, groups: labels.map((label) => map.get(label)), excluded };
}


function buildGroupSummaryData(groupColumn, valueColumn) {
  const groupIndex = state.headers.indexOf(groupColumn);
  const valueIndex = state.headers.indexOf(valueColumn);
  const labels = [];
  const map = new Map();
  let excluded = 0;
  state.rows.forEach((row) => {
    const rawLabel = String(row[groupIndex] ?? '').trim();
    const label = rawLabel || '（空白）';
    let value = toNumber(row[valueIndex]);
    if (!Number.isFinite(value)) {
      if (state.missingMode === 'zero') value = 0;
      else { excluded += 1; return; }
    }
    if (!map.has(label)) { map.set(label, []); labels.push(label); }
    map.get(label).push(value);
  });
  return { labels, groups: labels.map((label) => map.get(label)), excluded };
}

function combinationCountCapped(total, selected, cap) {
  if (!Number.isInteger(total) || !Number.isInteger(selected) || selected < 0 || selected > total) return { count: 0, tooLarge: false };
  const choose = Math.min(selected, total - selected);
  let count = 1;
  for (let index = 1; index <= choose; index += 1) {
    count = count * (total - choose + index) / index;
    if (count > cap) return { count, tooLarge: true };
  }
  return { count: Math.round(count), tooLarge: false };
}

function exactTwoSamplePermutation(valuesA, valuesB) {
  const maximumPermutations = 100000;
  const timeLimitMilliseconds = 1800;
  const nA = valuesA.length;
  const nB = valuesB.length;
  const totalN = nA + nB;
  const countInfo = combinationCountCapped(totalN, nA, maximumPermutations);
  const values = valuesA.concat(valuesB);
  const totalSum = values.reduce((sum, value) => sum + value, 0);
  const observedSumA = valuesA.reduce((sum, value) => sum + value, 0);
  const observedDifference = observedSumA / nA - (totalSum - observedSumA) / nB;
  if (countInfo.tooLarge) return { status: 'too-large', pValue: null, totalCount: null, extremeCount: null, observedDifference };
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
  if (timedOut || totalCount !== countInfo.count) return { status: 'too-large', pValue: null, totalCount, extremeCount, observedDifference };
  return { status: 'exact', pValue: extremeCount / totalCount, totalCount, extremeCount, observedDifference };
}

function buildContingency(rowColumn, columnColumn) {
  const rowIndex = state.headers.indexOf(rowColumn);
  const columnIndex = state.headers.indexOf(columnColumn);
  const rowLabels = [];
  const columnLabels = [];
  const rowLookup = new Map();
  const columnLookup = new Map();
  const validPairs = [];
  let excluded = 0;
  state.rows.forEach((row) => {
    const rowValue = String(row[rowIndex] ?? '').trim();
    const columnValue = String(row[columnIndex] ?? '').trim();
    if (!rowValue || !columnValue) {
      excluded += 1;
      return;
    }
    if (!rowLookup.has(rowValue)) { rowLookup.set(rowValue, rowLabels.length); rowLabels.push(rowValue); }
    if (!columnLookup.has(columnValue)) { columnLookup.set(columnValue, columnLabels.length); columnLabels.push(columnValue); }
    validPairs.push([rowValue, columnValue]);
  });
  const counts = Array.from({ length: rowLabels.length }, () => Array.from({ length: columnLabels.length }, () => 0));
  validPairs.forEach((pair) => { counts[rowLookup.get(pair[0])][columnLookup.get(pair[1])] += 1; });
  return { rowLabels, columnLabels, counts, excluded, total: validPairs.length };
}

function contingencyStatistics(counts) {
  const rowCount = counts.length;
  const columnCount = rowCount ? counts[0].length : 0;
  if (rowCount < 2 || columnCount < 2) return null;
  const rowTotals = counts.map((row) => row.reduce((sum, value) => sum + value, 0));
  const columnTotals = Array.from({ length: columnCount }, (_, columnIndex) => counts.reduce((sum, row) => sum + row[columnIndex], 0));
  const total = rowTotals.reduce((sum, value) => sum + value, 0);
  if (!total) return null;
  const expected = counts.map((row, rowIndex) => row.map((_, columnIndex) => rowTotals[rowIndex] * columnTotals[columnIndex] / total));
  let statistic = 0;
  let minimumExpected = Infinity;
  let cellsBelowFive = 0;
  expected.forEach((row, rowIndex) => {
    row.forEach((expectedValue, columnIndex) => {
      minimumExpected = Math.min(minimumExpected, expectedValue);
      if (expectedValue < 5) cellsBelowFive += 1;
      if (expectedValue > 0) statistic += (counts[rowIndex][columnIndex] - expectedValue) ** 2 / expectedValue;
    });
  });
  const degreesOfFreedom = (rowCount - 1) * (columnCount - 1);
  return {
    statistic,
    degreesOfFreedom,
    asymptoticP: chiSquareSurvival(statistic, degreesOfFreedom),
    expected,
    rowTotals,
    columnTotals,
    total,
    minimumExpected,
    cellsBelowFive,
  };
}

const logFactorialCache = [0];
function logFactorial(value) {
  for (let index = logFactorialCache.length; index <= value; index += 1) logFactorialCache[index] = logFactorialCache[index - 1] + Math.log(index);
  return logFactorialCache[value];
}
function logAddExp(current, next) {
  if (current === -Infinity) return next;
  if (next === -Infinity) return current;
  const maximum = Math.max(current, next);
  return maximum + Math.log(Math.exp(current - maximum) + Math.exp(next - maximum));
}
function tableChiSquare(counts, expected) {
  let statistic = 0;
  counts.forEach((row, rowIndex) => row.forEach((value, columnIndex) => {
    const expectedValue = expected[rowIndex][columnIndex];
    if (expectedValue > 0) statistic += (value - expectedValue) ** 2 / expectedValue;
  }));
  return statistic;
}

function exactContingencyPValue(observedCounts, contingencyResult) {
  const { rowTotals, columnTotals, total, expected, statistic: observedStatistic } = contingencyResult;
  const rowCount = rowTotals.length;
  const columnCount = columnTotals.length;
  const table = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => 0));
  const remainingColumns = columnTotals.slice();
  const maximumTables = 100000;
  const startedAt = performance.now();
  const maximumMilliseconds = 1800;
  const logConstant = rowTotals.reduce((sum, value) => sum + logFactorial(value), 0)
    + columnTotals.reduce((sum, value) => sum + logFactorial(value), 0) - logFactorial(total);
  let logAll = -Infinity;
  let logTail = -Infinity;
  let tableCount = 0;
  let truncated = false;

  function processTable() {
    if (tableCount >= maximumTables || performance.now() - startedAt > maximumMilliseconds) { truncated = true; return; }
    tableCount += 1;
    let logProbability = logConstant;
    table.forEach((row) => row.forEach((value) => { logProbability -= logFactorial(value); }));
    logAll = logAddExp(logAll, logProbability);
    if (tableChiSquare(table, expected) >= observedStatistic - 1e-12) logTail = logAddExp(logTail, logProbability);
  }

  function fill(rowIndex, columnIndex, rowRemaining) {
    if (truncated) return;
    if (rowIndex === rowCount - 1) {
      if (remainingColumns.reduce((sum, value) => sum + value, 0) !== rowTotals[rowIndex]) return;
      for (let column = 0; column < columnCount; column += 1) table[rowIndex][column] = remainingColumns[column];
      processTable();
      return;
    }
    if (columnIndex === columnCount - 1) {
      const value = rowRemaining;
      if (value < 0 || value > remainingColumns[columnIndex]) return;
      table[rowIndex][columnIndex] = value;
      remainingColumns[columnIndex] -= value;
      fill(rowIndex + 1, 0, rowTotals[rowIndex + 1]);
      remainingColumns[columnIndex] += value;
      return;
    }
    let futureCapacity = 0;
    for (let column = columnIndex + 1; column < columnCount; column += 1) futureCapacity += remainingColumns[column];
    const lower = Math.max(0, rowRemaining - futureCapacity);
    const upper = Math.min(rowRemaining, remainingColumns[columnIndex]);
    for (let value = lower; value <= upper; value += 1) {
      table[rowIndex][columnIndex] = value;
      remainingColumns[columnIndex] -= value;
      fill(rowIndex, columnIndex + 1, rowRemaining - value);
      remainingColumns[columnIndex] += value;
      if (truncated) return;
    }
  }

  fill(0, 0, rowTotals[0]);
  if (truncated || logAll === -Infinity || logTail === -Infinity) return { status: 'too-large', pValue: null, tableCount };
  return { status: 'exact', pValue: Math.max(0, Math.min(1, Math.exp(logTail - logAll))), tableCount };
}

function getModeDescription() {
  const descriptions = {
    overview: '自动识别字段类型，并统计有效值、缺失值、唯一值和基础数值信息。',
    descriptive: '显示描述统计；正态性与方差齐性默认按样本量和数据特征自动选择推荐检验，也可手动切换。',
    group: '按分类字段分组，对数值字段计算样本量、均值、中位数、标准差和四分位数。',
    correlation: '提供 Pearson 参数相关和 Spearman 非参数相关；自动模式会根据数值字段的分布筛查给出建议。',
    chisquare: '生成列联表，同时计算 Pearson χ² 渐近 P 值和可行时的固定边际精确置换 P 值。',
    independent: '对两个独立组同时计算等方差 t、Welch t、Mann–Whitney U 和精确置换，并自动建议优先方法。',
    anova: '对两个及以上独立组同时计算经典 ANOVA、Welch ANOVA、Kruskal–Wallis，并可选择多种参数或非参数事后检验。',
  };
  return descriptions[state.analysisMode] || descriptions.overview;
}

function getFormulaNote() {
  const notes = {
    overview: '<strong>字段识别：</strong>非空值中至少 80% 可解析为数字时识别为数值字段。',
    descriptive: '<strong>分布与方差：</strong>自动模式会按样本量、重复值比例等选择正态性检验；方差齐性在正态条件较合理时可推荐 Bartlett，否则优先 Brown–Forsythe。所有方法都可手动切换。',
    group: '<strong>分组汇总：</strong>缺失数值按上方设置处理；推断检验模式统一采用完整观测。',
    correlation: '<strong>参数/非参：</strong>Pearson 关注线性关系；Spearman 基于秩，对异常值和单调非线性关系更稳健。',
    chisquare: '<strong>分类检验：</strong>期望频数不足时自动优先提示固定边际精确 P；枚举过大时不以模拟值冒充精确值。',
    independent: '<strong>自动建议规则：</strong>依据当前正态性检验和方差齐性检验推荐等方差 t、Welch 或非参数方法。小样本无法可靠判断时保持保守，但全部结果仍显示。',
    anova: '<strong>自动建议规则：</strong>正态且方差齐推荐经典 ANOVA + Tukey–Kramer；方差不齐推荐 Welch ANOVA + Games–Howell；不满足参数条件时推荐 Kruskal–Wallis + Dunn-Holm。事后方法与校正均可手动切换。',
  };
  return notes[state.analysisMode] || notes.overview;
}

function syncControlsFromState() {
  const validModes = ['overview', 'descriptive', 'group', 'correlation', 'chisquare', 'independent', 'anova'];
  if (!validModes.includes(state.analysisMode)) state.analysisMode = 'overview';
  elements.analysisSelect.value = state.analysisMode;
  elements.missingMode.value = state.missingMode;
  elements.normalityMethod.value = state.normalityMethod;
  elements.varianceMethod.value = state.varianceMethod;
  elements.correlationMethod.value = state.correlationMethod;
  elements.postHocMethod.value = state.postHocMethod;
  elements.postHocCorrection.value = state.postHocCorrection;
  const needsValue = ['descriptive', 'group', 'independent', 'anova'].includes(state.analysisMode);
  const needsGroup = ['descriptive', 'group', 'independent', 'anova'].includes(state.analysisMode);
  const isChi = state.analysisMode === 'chisquare';
  const isCorrelation = state.analysisMode === 'correlation';
  const needsNormality = ['descriptive', 'correlation', 'independent', 'anova'].includes(state.analysisMode);
  const needsVariance = ['descriptive', 'independent', 'anova'].includes(state.analysisMode);
  elements.valueColumnField.classList.toggle('hidden', !needsValue);
  elements.groupColumnField.classList.toggle('hidden', !needsGroup);
  elements.categoryColumnAField.classList.toggle('hidden', !isChi);
  elements.categoryColumnBField.classList.toggle('hidden', !isChi);
  elements.normalityMethodField.classList.toggle('hidden', !needsNormality);
  elements.varianceMethodField.classList.toggle('hidden', !needsVariance);
  elements.correlationMethodField.classList.toggle('hidden', !isCorrelation);
  elements.postHocMethodField.classList.toggle('hidden', state.analysisMode !== 'anova');
  elements.postHocCorrectionField.classList.toggle('hidden', state.analysisMode !== 'anova');
  updatePostHocCorrectionControl();
  elements.groupColumnLabel.textContent = state.analysisMode === 'descriptive' ? '方差齐性分组字段（可选）' : '分组字段';
  elements.missingModeField.classList.toggle('hidden', ['overview', 'correlation', 'chisquare', 'independent', 'anova'].includes(state.analysisMode));
  elements.modeDescription.textContent = getModeDescription();
  elements.formulaNote.innerHTML = getFormulaNote();
  populateColumnSelects();
}


function updatePostHocCorrectionControl() {
  const builtIn = ['tukey', 'games', 'lsd'].includes(state.postHocMethod);
  elements.postHocCorrection.disabled = builtIn;
  elements.postHocCorrection.title = builtIn
    ? (state.postHocMethod === 'lsd' ? 'Fisher LSD 按定义不做多重校正。' : '该方法自身使用学生化极差分布控制家族错误率。')
    : '';
}

function populateColumnSelects() {
  const numericColumns = getNumericColumns();
  const previousValue = state.valueColumn;
  elements.valueColumn.innerHTML = numericColumns.length
    ? numericColumns.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`).join('')
    : '<option value="">暂无数值字段</option>';
  state.valueColumn = numericColumns.includes(previousValue) ? previousValue : (numericColumns[0] || '');
  elements.valueColumn.value = state.valueColumn;

  const groupCandidates = getCategoricalCandidates().filter((header) => header !== state.valueColumn);
  const groupOptions = groupCandidates.length ? groupCandidates : state.headers.filter((header) => header !== state.valueColumn);
  const previousGroup = state.groupColumn;
  const optionalBlank = state.analysisMode === 'descriptive' ? '<option value="">不分组（仅整体正态性）</option>' : '';
  elements.groupColumn.innerHTML = optionalBlank + (groupOptions.length
    ? groupOptions.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`).join('')
    : (optionalBlank ? '' : '<option value="">暂无分组字段</option>'));
  if (groupOptions.includes(previousGroup)) state.groupColumn = previousGroup;
  else if (state.analysisMode === 'descriptive' && previousGroup === '') state.groupColumn = '';
  else state.groupColumn = groupOptions[0] || '';
  elements.groupColumn.value = state.groupColumn;

  const categoricalColumns = getCategoricalCandidates();
  const options = categoricalColumns.length
    ? categoricalColumns.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`).join('')
    : '<option value="">暂无字段</option>';
  elements.categoryColumnA.innerHTML = options;
  elements.categoryColumnB.innerHTML = options;
  state.categoryColumnA = categoricalColumns.includes(state.categoryColumnA) ? state.categoryColumnA : (categoricalColumns[0] || '');
  const fallbackB = categoricalColumns.find((header) => header !== state.categoryColumnA) || categoricalColumns[0] || '';
  state.categoryColumnB = categoricalColumns.includes(state.categoryColumnB) && state.categoryColumnB !== state.categoryColumnA ? state.categoryColumnB : fallbackB;
  elements.categoryColumnA.value = state.categoryColumnA;
  elements.categoryColumnB.value = state.categoryColumnB;
}

function scheduleGridAnalysis() {
  window.clearTimeout(calculationTimer);
  calculationTimer = window.setTimeout(() => {
    populateColumnSelects();
    calculate();
    saveState();
  }, 320);
}

function setEditorStatus(message) {
  elements.editorStatus.textContent = message;
}

function normalizeRows() {
  state.rows = state.rows.map((row) => state.headers.map((_, index) => String(row[index] ?? '')));
}

function uniqueHeaderName(proposed, columnIndex) {
  const base = String(proposed || '').trim() || `字段 ${columnIndex + 1}`;
  let candidate = base;
  let suffix = 2;
  while (state.headers.some((header, index) => index !== columnIndex && header === candidate)) {
    candidate = `${base} (${suffix})`;
    suffix += 1;
  }
  return candidate;
}

function updateHeader(columnIndex, proposed) {
  if (columnIndex < 0 || columnIndex >= state.headers.length) return;
  const oldName = state.headers[columnIndex];
  const newName = uniqueHeaderName(proposed, columnIndex);
  state.headers[columnIndex] = newName;
  ['valueColumn', 'groupColumn', 'categoryColumnA', 'categoryColumnB'].forEach((key) => {
    if (state[key] === oldName) state[key] = newName;
  });
  renderDataTable();
  syncControlsFromState();
  calculate();
  saveState();
}

function selectSpreadsheetCell(rowIndex, columnIndex, target) {
  selectedCell = { rowIndex, columnIndex };
  document.querySelectorAll('.spreadsheet-table .is-selected').forEach((cell) => cell.classList.remove('is-selected'));
  if (target) target.classList.add('is-selected');
  setEditorStatus(`已选择第 ${rowIndex + 1} 行 · ${state.headers[columnIndex] || `第 ${columnIndex + 1} 列`}`);
}

function parseClipboardGrid(text) {
  const source = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (!lines.length) return [];
  const delimiter = lines.some((line) => line.includes('\t')) ? '\t' : (lines[0].includes(',') ? ',' : null);
  if (!delimiter) return lines.map((line) => [line]);
  const matrix = [];
  lines.forEach((line) => {
    const row = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"') {
        if (quoted && next === '"') { cell += '"'; index += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(cell);
        cell = '';
      } else cell += char;
    }
    row.push(cell);
    matrix.push(row);
  });
  return matrix;
}

function pasteGridAt(rowIndex, columnIndex, text) {
  const matrix = parseClipboardGrid(text);
  if (!matrix.length) return;
  const width = Math.max(...matrix.map((row) => row.length));
  while (state.headers.length < columnIndex + width) {
    state.headers.push(uniqueHeaderName(`字段 ${state.headers.length + 1}`, state.headers.length));
  }
  while (state.rows.length < rowIndex + matrix.length) {
    state.rows.push(Array.from({ length: state.headers.length }, () => ''));
  }
  normalizeRows();
  matrix.forEach((sourceRow, r) => {
    sourceRow.forEach((value, c) => { state.rows[rowIndex + r][columnIndex + c] = String(value ?? '').trim(); });
  });
  renderDataTable();
  syncControlsFromState();
  calculate();
  saveState();
  setEditorStatus(`已粘贴 ${matrix.length} 行 × ${width} 列，并自动扩展表格。`);
}

function createBlankTable() {
  state.headers = ['组别', '数值', '备注'];
  state.rows = Array.from({ length: 10 }, () => ['', '', '']);
  state.valueColumn = '数值';
  state.groupColumn = '组别';
  selectedCell = null;
  renderDataTable();
  syncControlsFromState();
  calculate();
  saveState();
  setEditorStatus('已创建 10 行 × 3 列空白表格，可直接输入或粘贴。');
}

function clearSpreadsheet() {
  if (!state.headers.length) {
    createBlankTable();
    return;
  }
  const hasContent = state.rows.some((row) => row.some((value) => String(value ?? '').trim() !== ''));
  if (hasContent && !window.confirm('确定清空表格中的所有单元格吗？字段名和表格结构会保留。')) return;
  const rowCount = Math.max(10, state.rows.length || 0);
  state.rows = Array.from({ length: rowCount }, () => Array.from({ length: state.headers.length }, () => ''));
  selectedCell = null;
  renderDataTable();
  syncControlsFromState();
  calculate();
  saveState();
  setEditorStatus(`已清空 ${rowCount} 行单元格，字段名与列结构已保留。`);
}

function addSpreadsheetRow() {
  if (!state.headers.length) { createBlankTable(); return; }
  state.rows.push(Array.from({ length: state.headers.length }, () => ''));
  renderDataTable();
  selectCellAfterRender(state.rows.length - 1, Math.max(0, selectedCell?.columnIndex || 0));
  scheduleGridAnalysis();
}

function addSpreadsheetColumn() {
  if (!state.headers.length) { createBlankTable(); return; }
  const columnIndex = state.headers.length;
  state.headers.push(uniqueHeaderName(`字段 ${columnIndex + 1}`, columnIndex));
  state.rows.forEach((row) => row.push(''));
  renderDataTable();
  selectCellAfterRender(Math.max(0, selectedCell?.rowIndex || 0), columnIndex);
  syncControlsFromState();
  calculate();
  saveState();
}

function deleteSelectedRow() {
  if (!selectedCell || selectedCell.rowIndex < 0 || selectedCell.rowIndex >= state.rows.length) {
    setEditorStatus('请先点击需要删除的行中的任意单元格。');
    return;
  }
  state.rows.splice(selectedCell.rowIndex, 1);
  selectedCell = null;
  renderDataTable();
  syncControlsFromState();
  calculate();
  saveState();
}

function deleteSelectedColumn() {
  if (!selectedCell || selectedCell.columnIndex < 0 || selectedCell.columnIndex >= state.headers.length) {
    setEditorStatus('请先点击需要删除的列中的任意单元格。');
    return;
  }
  if (state.headers.length === 1) {
    setEditorStatus('至少保留一列；如需清空内容，请使用“清空表格”。');
    return;
  }
  const removed = state.headers.splice(selectedCell.columnIndex, 1)[0];
  state.rows.forEach((row) => row.splice(selectedCell.columnIndex, 1));
  ['valueColumn', 'groupColumn', 'categoryColumnA', 'categoryColumnB'].forEach((key) => {
    if (state[key] === removed) state[key] = '';
  });
  selectedCell = null;
  renderDataTable();
  syncControlsFromState();
  calculate();
  saveState();
}

function selectCellAfterRender(rowIndex, columnIndex) {
  window.requestAnimationFrame(() => {
    const cell = elements.dataBody.querySelector(`[data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`);
    if (cell) {
      cell.focus();
      selectSpreadsheetCell(rowIndex, columnIndex, cell);
    }
  });
}

function renderDataTable() {
  elements.dataHead.innerHTML = '';
  elements.dataBody.innerHTML = '';
  if (!state.headers.length) {
    elements.dataHead.innerHTML = '<th class="row-index">#</th><th>可编辑数据表</th>';
    elements.dataBody.innerHTML = '<tr><th class="row-index">1</th><td class="empty-cell">点击“新建空白表格”，或粘贴/上传现有数据。</td></tr>';
    elements.dataHelp.textContent = '可新建空表，也可从 Excel、WPS、CSV 或文本直接导入。';
    setEditorStatus('当前没有数据。');
    return;
  }
  normalizeRows();
  elements.dataHead.innerHTML = '<th class="row-index">#</th>' + state.headers.map((header, columnIndex) => (
    `<th class="header-cell" contenteditable="true" spellcheck="false" data-header-index="${columnIndex}" title="点击修改字段名">${escapeHtml(header)}</th>`
  )).join('');
  const maximumRenderedRows = 500;
  const previewRows = state.rows.slice(0, maximumRenderedRows);
  elements.dataBody.innerHTML = previewRows.map((row, rowIndex) => (
    `<tr><th class="row-index">${rowIndex + 1}</th>${state.headers.map((_, columnIndex) => (
      `<td class="data-cell" contenteditable="true" spellcheck="false" data-row-index="${rowIndex}" data-column-index="${columnIndex}">${escapeHtml(row[columnIndex] ?? '')}</td>`
    )).join('')}</tr>`
  )).join('');
  elements.dataHelp.textContent = `当前 ${state.rows.length} 行、${state.headers.length} 列；${state.rows.length > maximumRenderedRows ? `网页编辑器显示前 ${maximumRenderedRows} 行，` : ''}修改后自动刷新分析。`;
  setEditorStatus('点击单元格直接编辑；在任意单元格按 Ctrl/⌘ + V 可粘贴一个区域。');
}

function makeSummary(items) {
  elements.summary.innerHTML = items.map((item) => `<div class="summary-item"><span class="summary-label">${escapeHtml(item.label)}</span><span class="summary-value">${escapeHtml(item.value)}</span></div>`).join('');
}

function makeAlert(message, type = 'warning') {
  elements.alerts.innerHTML += `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
}

function showRecommendation(title, detail) {
  elements.recommendation.innerHTML = `<div class="recommendation-top"><span class="recommendation-badge">自动推荐</span><strong>${escapeHtml(title)}</strong></div><p>${escapeHtml(detail)}</p>`;
  elements.recommendation.classList.remove('hidden');
}

function hideRecommendation() {
  elements.recommendation.classList.add('hidden');
  elements.recommendation.innerHTML = '';
}

function renderDiagnostics(headers, rows) {
  elements.diagnosticsHead.innerHTML = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  elements.diagnosticsBody.innerHTML = rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  elements.diagnosticsCard.classList.toggle('hidden', !rows.length);
}

function clearDiagnostics() {
  elements.diagnosticsCard.classList.add('hidden');
  elements.diagnosticsHead.innerHTML = '';
  elements.diagnosticsBody.innerHTML = '';
}


function clearPostHoc() {
  elements.postHocCard.classList.add('hidden');
  elements.postHocHead.innerHTML = '';
  elements.postHocBody.innerHTML = '';
}

function postHocMethodName(method) {
  const names = {
    tukey: 'Tukey–Kramer HSD',
    games: 'Games–Howell',
    lsd: 'Fisher LSD',
    pooled: '两两 pooled t',
    welch: '两两 Welch t',
    dunn: 'Dunn 秩检验',
    mann: '两两 Mann–Whitney U',
  };
  return names[method] || method;
}

function correctionName(correction) {
  const names = { none: '不校正', holm: 'Holm', bonferroni: 'Bonferroni', sidak: 'Šidák', bh: 'Benjamini–Hochberg FDR', builtin: '方法内置家族校正' };
  return names[correction] || correction;
}

function renderPostHoc(method, rows, omnibusPValue, correction = 'holm') {
  const builtIn = ['tukey', 'games'].includes(method);
  const fisher = method === 'lsd';
  const appliedCorrection = builtIn ? 'builtin' : (fisher ? 'none' : correction);
  elements.postHocTitle.textContent = `事后两两比较 · ${postHocMethodName(method)}`;
  const significanceNote = Number.isFinite(omnibusPValue) && omnibusPValue >= ALPHA
    ? '总体检验未显著，结果仅作探索性参考'
    : '总体检验显著时用于定位组间差异';
  const correctionText = builtIn
    ? '学生化极差分布已控制家族错误率'
    : fisher ? '未做多重校正，假阳性风险较高'
      : `${correctionName(appliedCorrection)} 校正`;
  elements.postHocMeta.textContent = `${significanceNote} · ${correctionText}`;
  const differenceLabel = method === 'dunn' ? '平均秩差' : method === 'mann' ? '中位数差' : '均值差';
  const statisticLabel = ['tukey', 'games'].includes(method) ? 'q' : method === 'dunn' ? 'Z' : method === 'mann' ? 'U' : 't';
  const adjustedLabel = builtIn ? '家族校正 P' : fisher || appliedCorrection === 'none' ? '报告 P' : `${correctionName(appliedCorrection)} P`;
  elements.postHocHead.innerHTML = ['比较', differenceLabel, statisticLabel, '自由度', '原始 P', adjustedLabel, '判断']
    .map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  elements.postHocBody.innerHTML = rows.length ? rows.map((row) => {
    const reportedP = Number.isFinite(row.adjustedP) ? row.adjustedP : row.pValue;
    return `<tr>
      <td>${escapeHtml(row.comparison)}</td>
      <td>${escapeHtml(formatNumber(row.difference, 4))}</td>
      <td>${escapeHtml(formatNumber(row.statistic, 4))}</td>
      <td>${escapeHtml(formatNumber(row.df, 2))}</td>
      <td>${escapeHtml(formatPValue(row.pValue))}</td>
      <td>${escapeHtml(formatPValue(reportedP))}</td>
      <td><span class="status ${reportedP < ALPHA ? 'status-recommended' : 'status-neutral'}">${reportedP < ALPHA ? '显著' : '未显著'}</span></td>
    </tr>`;
  }).join('') : '<tr><td class="empty-cell" colspan="7">当前数据无法计算事后比较。</td></tr>';
  elements.postHocCard.classList.remove('hidden');
}

function normalityLabel(result) {
  if (!result || result.status === 'insufficient') return '样本量不足，无法可靠判断';
  return result.status === 'pass' ? '未发现明显偏离' : '提示偏离正态';
}

function renderOverview() {
  hideRecommendation();
  clearDiagnostics();
  elements.chartCard.classList.add('hidden');
  latestResult.headers = ['字段', '类型', '有效值', '缺失值', '唯一值', '均值'];
  latestResult.rows = state.headers.map((header) => {
    const profile = getColumnProfile(header);
    const fieldStats = profile.isNumeric ? stats(profile.numbers) : null;
    return [header, profile.type, profile.valid, profile.missing, profile.unique, fieldStats ? formatNumber(fieldStats.mean) : '—'];
  });
  const missingCount = state.rows.reduce((total, row) => total + state.headers.reduce((count, _, index) => count + (String(row[index] ?? '').trim() === '' ? 1 : 0), 0), 0);
  makeSummary([
    { label: '数据行数', value: String(state.rows.length) },
    { label: '字段数量', value: String(state.headers.length) },
    { label: '数值字段', value: String(getNumericColumns().length) },
    { label: '缺失单元格', value: String(missingCount) },
  ]);
  makeAlert(missingCount ? `检测到 ${missingCount} 个缺失单元格，请在正式分析前确认缺失机制。` : '当前数据未检测到空白单元格。', missingCount ? 'warning' : 'success');
}

function renderDescriptive() {
  clearPostHoc();
  const values = numericValues(state.valueColumn);
  const overall = stats(values);
  const overallNormality = runNormalityTest(values);
  const hasGrouping = Boolean(state.groupColumn && state.groupColumn !== state.valueColumn);
  const grouped = hasGrouping ? buildGroupSummaryData(state.groupColumn, state.valueColumn) : null;
  const groupedNormalities = grouped ? grouped.groups.map((group) => runNormalityTest(group)) : [];
  const validGroupedIndexes = grouped ? grouped.groups.map((group, index) => ({ group, index })).filter((item) => item.group.length >= 2) : [];
  const varianceGroups = validGroupedIndexes.map((item) => item.group);
  const varianceNormalities = validGroupedIndexes.map((item) => groupedNormalities[item.index]);
  const varianceTest = varianceGroups.length >= 2 ? runVarianceTest(varianceGroups, varianceNormalities) : null;

  if (overall) {
    const normalityChoice = state.normalityMethod === 'auto'
      ? `${overallNormality.name}：${overallNormality.recommendationReason}`
      : `已手动选择 ${overallNormality.name}；自动建议为 ${runNormalityTest(values, 'auto').name}。`;
    const varianceChoice = varianceTest
      ? `${varianceTest.name}：${varianceTest.recommendationReason}`
      : '选择分组字段后可自动推荐方差齐性检验。';
    showRecommendation('自动诊断方案', `${normalityChoice} ${varianceChoice}`);
  } else hideRecommendation();

  latestResult.headers = ['范围', '样本量', '均值', '中位数', '标准差', 'Q1', 'Q3', '最小值', '最大值', '正态性方法', 'P 值', '筛查结论'];
  latestResult.rows = [];
  if (overall) {
    latestResult.rows.push([
      '整体', overall.count, formatNumber(overall.mean), formatNumber(overall.median), formatNumber(overall.sd),
      formatNumber(overall.q1), formatNumber(overall.q3), formatNumber(overall.min), formatNumber(overall.max),
      overallNormality.name, formatPValue(overallNormality.pValue), normalityLabel(overallNormality),
    ]);
  }
  if (grouped) {
    grouped.labels.forEach((label, index) => {
      const result = stats(grouped.groups[index]);
      if (!result) return;
      const normality = groupedNormalities[index];
      latestResult.rows.push([
        label, result.count, formatNumber(result.mean), formatNumber(result.median), formatNumber(result.sd),
        formatNumber(result.q1), formatNumber(result.q3), formatNumber(result.min), formatNumber(result.max),
        normality.name, formatPValue(normality.pValue), normalityLabel(normality),
      ]);
    });
  }

  makeSummary([
    { label: '分析字段', value: state.valueColumn || '—' },
    { label: '正态性方法', value: overall ? overallNormality.name : '—' },
    { label: '方差检验', value: varianceTest ? varianceTest.name : '未分组' },
    { label: varianceTest ? `${varianceTest.name} P` : '方差齐性 P', value: varianceTest ? formatPValue(varianceTest.pValue) : '—' },
  ]);

  const diagnostics = [];
  if (grouped) {
    grouped.labels.forEach((label, index) => {
      const normality = groupedNormalities[index];
      diagnostics.push([`${label} · ${normality.name}`, grouped.groups[index].length, formatNumber(normality.statistic, 4), formatPValue(normality.pValue), normalityLabel(normality)]);
    });
    diagnostics.push([
      varianceTest ? `${varianceTest.name} 方差齐性` : '方差齐性检验',
      varianceGroups.reduce((sum, group) => sum + group.length, 0),
      formatNumber(varianceTest?.statistic, 4),
      formatPValue(varianceTest?.pValue),
      varianceTest ? (varianceTest.pValue >= ALPHA ? '未提示方差不齐' : '提示方差不齐') : '至少需要 2 个组且每组 n ≥ 2',
    ]);
  } else if (overall) {
    diagnostics.push([`整体 · ${overallNormality.name}`, overall.count, formatNumber(overallNormality.statistic, 4), formatPValue(overallNormality.pValue), normalityLabel(overallNormality)]);
    diagnostics.push(['方差齐性检验', '—', '—', '—', '请选择可选分组字段']);
  }
  renderDiagnostics(['诊断对象', 'n', '统计量', 'P 值', '判断'], diagnostics);

  if (!overall) makeAlert('所选字段没有可用于分析的数值。', 'danger');
  else {
    const normalityMessage = overallNormality.status === 'pass'
      ? `${overallNormality.name} 未发现明显正态性偏离。`
      : overallNormality.status === 'insufficient'
        ? `${overallNormality.name} 无法在当前样本量下可靠计算。`
        : `${overallNormality.name} 提示可能偏离正态，建议检查箱线图/QQ 图并参考稳健或非参数方法。`;
    makeAlert(normalityMessage, overallNormality.status === 'pass' ? 'success' : 'warning');
    if (overallNormality.warning) makeAlert(overallNormality.warning, 'warning');
    if (grouped && varianceTest) makeAlert(varianceTest.pValue >= ALPHA
      ? `${varianceTest.name} 未提示组间方差不齐。`
      : `${varianceTest.name} 提示组间方差可能不齐，参数检验时优先参考 Welch 方法。`, varianceTest.pValue >= ALPHA ? 'success' : 'warning');
    else if (!grouped) makeAlert('选择“方差齐性分组字段”后，可在本页同时检查各组正态性与方差齐性。', 'warning');
  }
  if (grouped?.excluded) makeAlert(`因数值无效，方差与分组描述中已剔除 ${grouped.excluded} 行。`, 'warning');
  renderHistogram(state.valueColumn, values);
}

function renderGroup() {
  hideRecommendation();
  clearDiagnostics();
  elements.chartCard.classList.add('hidden');
  const sampleData = buildGroupSummaryData(state.groupColumn, state.valueColumn);
  latestResult.headers = ['组别', '样本量', '均值', '中位数', '标准差', 'Q1', 'Q3', '最小值', '最大值'];
  latestResult.rows = sampleData.labels.map((label, index) => {
    const result = stats(sampleData.groups[index]);
    return [label, result.count, formatNumber(result.mean), formatNumber(result.median), formatNumber(result.sd), formatNumber(result.q1), formatNumber(result.q3), formatNumber(result.min), formatNumber(result.max)];
  });
  makeSummary([
    { label: '分组字段', value: state.groupColumn || '—' },
    { label: '数值字段', value: state.valueColumn || '—' },
    { label: '有效组数', value: String(sampleData.labels.length) },
    { label: '有效样本量', value: String(sampleData.groups.reduce((sum, group) => sum + group.length, 0)) },
  ]);
  if (!sampleData.labels.length) makeAlert('没有可用于分组汇总的完整观测。', 'danger');
  else makeAlert(`已生成 ${sampleData.labels.length} 个组的描述统计。`, 'success');
  if (sampleData.excluded) makeAlert(`因数值无效，已剔除 ${sampleData.excluded} 行。`, 'warning');
}

function correlationRecommendation(numericColumns) {
  const checks = numericColumns.map((column) => runNormalityTest(getColumnValues(column).map(toNumber).filter(Number.isFinite)));
  const allPass = checks.length && checks.every((check) => check.status === 'pass');
  return { method: allPass ? 'pearson' : 'spearman', checks };
}

function renderCorrelation() {
  clearDiagnostics();
  elements.chartCard.classList.add('hidden');
  const columns = getNumericColumns();
  if (columns.length < 2) {
    hideRecommendation();
    latestResult = { headers: ['相关性分析'], rows: [] };
    makeSummary([
      { label: '数值字段', value: String(columns.length) },
      { label: '显示方法', value: '—' },
      { label: '最大绝对相关', value: '—' },
      { label: '有效矩阵', value: '否' },
    ]);
    makeAlert('至少需要两个数值字段。', 'danger');
    return;
  }
  const recommendation = correlationRecommendation(columns);
  const method = state.correlationMethod === 'auto' ? recommendation.method : state.correlationMethod;
  const autoTitle = recommendation.method === 'pearson' ? 'Pearson 相关' : 'Spearman 秩相关';
  const autoReason = recommendation.method === 'pearson'
    ? '当前数值字段的所选正态性检验均未发现明显偏离。'
    : '至少一个字段提示偏离正态或样本量不足。';
  showRecommendation(autoTitle, state.correlationMethod === 'auto'
    ? `${autoReason} 已按自动建议显示矩阵，仍可手动切换。`
    : `${autoReason} 当前手动显示 ${method === 'pearson' ? 'Pearson' : 'Spearman'} 矩阵。`);
  latestResult.headers = [`${method === 'pearson' ? 'Pearson r' : 'Spearman ρ'}`].concat(columns);
  let maxAbs = 0;
  latestResult.rows = columns.map((rowColumn) => [rowColumn].concat(columns.map((column) => {
    if (rowColumn === column) return '1';
    const result = correlationPair(rowColumn, column, method);
    if (Number.isFinite(result.coefficient)) maxAbs = Math.max(maxAbs, Math.abs(result.coefficient));
    return Number.isFinite(result.coefficient) ? `${formatNumber(result.coefficient, 3)} (P ${formatPValue(result.pValue)})` : '—';
  })));
  makeSummary([
    { label: '数值字段', value: String(columns.length) },
    { label: '显示方法', value: method === 'pearson' ? 'Pearson' : 'Spearman' },
    { label: '最大绝对相关', value: formatNumber(maxAbs) },
    { label: '正态性选择', value: state.normalityMethod === 'auto' ? '自动' : '手动' },
  ]);
  renderDiagnostics(['字段', '样本量', '正态性方法', 'P 值', '筛查'], columns.map((column, index) => {
    const check = recommendation.checks[index];
    return [column, check.n, check.name, formatPValue(check.pValue), normalityLabel(check)];
  }));
  makeAlert('相关系数不代表因果关系；P 值为近似值，且当前矩阵未进行多重比较校正。', 'warning');
}

function assessParametricSuitability(groups, normalities) {
  if (normalities.length && normalities.every((item) => item.status === 'pass')) return { status: 'pass', reason: '各组正态性检验均未提示明显偏离。' };
  const summaries = groups.map((group) => ({ n: group.length, ...distributionMoments(group) }));
  const counts = summaries.map((item) => item.n);
  const balanced = Math.max(...counts) / Math.max(1, Math.min(...counts)) <= 2;
  const moderateShape = summaries.every((item) => item.n >= 20 && Math.abs(item.skewness ?? Infinity) <= 1 && Math.abs(item.excessKurtosis ?? Infinity) <= 2);
  if (balanced && moderateShape) return { status: 'robust', reason: '正态性检验并非全部通过，但各组 n ≥ 20、组间较平衡且偏度/峰度不极端，参数方法通常具有一定稳健性。' };
  return { status: 'fail', reason: '至少一组明显偏离正态、样本量过小或无法可靠判断。' };
}

function chooseIndependentRecommendation(groups, normalities, varianceTest) {
  const suitability = assessParametricSuitability(groups, normalities);
  if (suitability.status !== 'fail' && varianceTest && varianceTest.pValue >= ALPHA) return { key: 'pooled', title: '等方差两独立样本 t 检验', reason: `${suitability.reason} ${varianceTest.name} 未提示方差不齐。` };
  if (suitability.status !== 'fail' && varianceTest && varianceTest.pValue < ALPHA) return { key: 'welch', title: 'Welch 两独立样本 t 检验', reason: `${suitability.reason} ${varianceTest.name} 提示方差不齐。` };
  return { key: 'mann', title: 'Mann–Whitney U / 精确置换', reason: `${suitability.reason} 优先参考非参数结果；精确置换可行时同时报告。` };
}

function renderIndependent() {
  elements.chartCard.classList.add('hidden');
  const sampleData = buildIndependentSamples(state.groupColumn, state.valueColumn);
  if (sampleData.labels.length !== 2) {
    hideRecommendation();
    clearDiagnostics();
    latestResult = { headers: ['两独立样本检验'], rows: [] };
    makeSummary([
      { label: '有效组数', value: String(sampleData.labels.length) },
      { label: '有效样本量', value: String(sampleData.groups.reduce((sum, group) => sum + group.length, 0)) },
      { label: '自动推荐', value: '—' },
      { label: '精确置换', value: '—' },
    ]);
    makeAlert(`分组字段必须恰好包含 2 个有效类别；当前识别到 ${sampleData.labels.length} 个。`, 'danger');
    return;
  }
  const [valuesA, valuesB] = sampleData.groups;
  if (valuesA.length < 2 || valuesB.length < 2) {
    hideRecommendation();
    clearDiagnostics();
    latestResult = { headers: ['两独立样本检验'], rows: [] };
    makeSummary([
      { label: '有效样本量', value: String(valuesA.length + valuesB.length) },
      { label: '自动推荐', value: '—' },
      { label: '组间均值差', value: '—' },
      { label: '精确置换', value: '—' },
    ]);
    makeAlert('每组至少需要 2 个有效观测，才能完整计算参数和非参数检验。', 'danger');
    return;
  }
  const normalities = [runNormalityTest(valuesA), runNormalityTest(valuesB)];
  const varianceTest = runVarianceTest([valuesA, valuesB], normalities);
  const recommendation = chooseIndependentRecommendation([valuesA, valuesB], normalities, varianceTest);
  const pooled = pooledTTest(valuesA, valuesB);
  const welch = welchTTest(valuesA, valuesB);
  const mann = mannWhitney(valuesA, valuesB);
  const exact = exactTwoSamplePermutation(valuesA, valuesB);
  const a = stats(valuesA);
  const b = stats(valuesB);
  showRecommendation(recommendation.title, recommendation.reason);
  latestResult.headers = ['检验', '方法类型', '统计量', '自由度', '双侧 P', '效应量', '状态'];
  latestResult.rows = [
    ['等方差 t 检验', '参数', formatNumber(pooled.statistic, 4), formatNumber(pooled.df, 2), formatPValue(pooled.pValue), `Cohen d = ${formatNumber(pooled.effect, 3)}`, recommendation.key === 'pooled' ? '推荐' : '可参考'],
    ['Welch t 检验', '参数·方差不齐稳健', formatNumber(welch.statistic, 4), formatNumber(welch.df, 2), formatPValue(welch.pValue), '—', recommendation.key === 'welch' ? '推荐' : '可参考'],
    ['Mann–Whitney U', '非参数·秩', formatNumber(mann.statistic, 3), '—', formatPValue(mann.pValue), `秩二列 r = ${formatNumber(mann.effect, 3)}`, recommendation.key === 'mann' ? '推荐' : '可参考'],
    ['均值差精确置换', '非参数·精确', formatNumber(exact.observedDifference, 4), '—', exact.status === 'exact' ? formatPValue(exact.pValue) : '未计算', '均值差', exact.status === 'exact' ? (recommendation.key === 'mann' ? '推荐' : '补充') : '超出枚举上限'],
  ];
  makeSummary([
    { label: '组间均值差', value: formatNumber(a.mean - b.mean, 4) },
    { label: varianceTest ? `${varianceTest.name} P` : '方差齐性 P', value: varianceTest ? formatPValue(varianceTest.pValue) : '—' },
    { label: '推荐方法', value: recommendation.key === 'pooled' ? '等方差 t' : recommendation.key === 'welch' ? 'Welch t' : '非参数' },
    { label: '精确置换 P', value: exact.status === 'exact' ? formatPValue(exact.pValue) : '未计算' },
  ]);
  renderDiagnostics(['诊断对象', 'n', '方法 / 统计量', 'P 值', '判断'], [
    [sampleData.labels[0], valuesA.length, `${normalities[0].name} · ${formatNumber(normalities[0].statistic, 4)}`, formatPValue(normalities[0].pValue), normalityLabel(normalities[0])],
    [sampleData.labels[1], valuesB.length, `${normalities[1].name} · ${formatNumber(normalities[1].statistic, 4)}`, formatPValue(normalities[1].pValue), normalityLabel(normalities[1])],
    [varianceTest ? `${varianceTest.name} 方差齐性` : '方差齐性', valuesA.length + valuesB.length, formatNumber(varianceTest?.statistic, 4), formatPValue(varianceTest?.pValue), varianceTest ? (varianceTest.pValue >= ALPHA ? '未提示方差不齐' : '提示方差不齐') : '无法判断'],
    [`${sampleData.labels[0]} 描述`, valuesA.length, `均值 ${formatNumber(a.mean)} / 中位数 ${formatNumber(a.median)}`, '—', `SD ${formatNumber(a.sd)}`],
    [`${sampleData.labels[1]} 描述`, valuesB.length, `均值 ${formatNumber(b.mean)} / 中位数 ${formatNumber(b.median)}`, '—', `SD ${formatNumber(b.sd)}`],
  ]);
  if (state.normalityMethod === 'auto') makeAlert(`正态性自动选择：${sampleData.labels.map((label, index) => `${label} → ${normalities[index].name}`).join('；')}。`, 'success');
  if (varianceTest && state.varianceMethod === 'auto') makeAlert(`方差齐性自动选择 ${varianceTest.name}。${varianceTest.recommendationReason}`, 'success');
  normalities.filter((item) => item.warning).forEach((item) => makeAlert(item.warning, 'warning'));
  if (sampleData.excluded) makeAlert(`因组别为空或数值无效，已剔除 ${sampleData.excluded} 行。`, 'warning');
  if (exact.status === 'exact') makeAlert(`精确置换已完整枚举 ${exact.totalCount.toLocaleString('zh-CN')} 种标签分配。`, 'success');
  else makeAlert('标签分配超过 100,000 种或运行时间上限，未计算“精确”P 值；其他检验结果仍可使用。', 'warning');
  makeAlert('Mann–Whitney 主要检验两组分布位置差异；只有分布形状相近时，才宜直接解释为中位数差异。', 'warning');
  renderHistogram(state.valueColumn, valuesA.concat(valuesB));
}

function chooseAnovaRecommendation(groups, normalities, varianceTest) {
  const suitability = assessParametricSuitability(groups, normalities);
  if (suitability.status !== 'fail' && varianceTest && varianceTest.pValue >= ALPHA) return { key: 'anova', title: '经典单因素 ANOVA', reason: `${suitability.reason} ${varianceTest.name} 未提示方差不齐。` };
  if (suitability.status !== 'fail' && varianceTest && varianceTest.pValue < ALPHA) return { key: 'welch', title: 'Welch ANOVA', reason: `${suitability.reason} ${varianceTest.name} 提示方差不齐。` };
  return { key: 'kruskal', title: 'Kruskal–Wallis 非参数检验', reason: `${suitability.reason} 优先参考秩检验结果。` };
}

function resolvePostHocSettings(recommendation) {
  const automaticMethod = recommendation.key === 'anova' ? 'tukey' : recommendation.key === 'welch' ? 'games' : 'dunn';
  const method = state.postHocMethod === 'auto' ? automaticMethod : state.postHocMethod;
  let automaticCorrection = ['tukey', 'games'].includes(method) ? 'builtin' : method === 'lsd' ? 'none' : 'holm';
  let correction = state.postHocCorrection === 'auto' ? automaticCorrection : state.postHocCorrection;
  if (['tukey', 'games'].includes(method)) correction = 'builtin';
  if (method === 'lsd') correction = 'none';
  return { method, correction, automaticMethod, automaticCorrection };
}

function postHocRowsFor(method, correction, labels, groups) {
  if (method === 'tukey') return tukeyKramerPostHoc(labels, groups);
  if (method === 'games') return gamesHowellPostHoc(labels, groups);
  if (method === 'lsd') return pairwisePooledPostHoc(labels, groups, 'none');
  if (method === 'pooled') return pairwisePooledPostHoc(labels, groups, correction);
  if (method === 'welch') return pairwiseWelchPostHoc(labels, groups, correction);
  if (method === 'mann') return pairwiseMannWhitneyPostHoc(labels, groups, correction);
  return dunnPostHoc(labels, groups, correction);
}

function omnibusPForPostHoc(method, classic, welch, kruskal) {
  if (['tukey', 'lsd', 'pooled'].includes(method)) return classic?.pValue;
  if (['games', 'welch'].includes(method)) return welch?.pValue;
  return kruskal?.pValue;
}

function renderAnova() {
  elements.chartCard.classList.add('hidden');
  const sampleData = buildIndependentSamples(state.groupColumn, state.valueColumn);
  if (sampleData.labels.length < 2 || sampleData.groups.some((group) => group.length < 2)) {
    hideRecommendation();
    clearDiagnostics();
    clearPostHoc();
    latestResult = { headers: ['多独立组检验'], rows: [] };
    makeSummary([
      { label: '有效组数', value: String(sampleData.labels.length) },
      { label: '有效样本量', value: String(sampleData.groups.reduce((sum, group) => sum + group.length, 0)) },
      { label: '自动推荐', value: '—' },
      { label: '方差齐性', value: '—' },
    ]);
    makeAlert('至少需要 2 个有效组，且每组至少 2 个有效观测。', 'danger');
    return;
  }
  const normalities = sampleData.groups.map((group) => runNormalityTest(group));
  const varianceTest = runVarianceTest(sampleData.groups, normalities);
  const recommendation = chooseAnovaRecommendation(sampleData.groups, normalities, varianceTest);
  const classic = oneWayAnova(sampleData.groups);
  const welch = welchAnova(sampleData.groups);
  const kruskal = kruskalWallis(sampleData.groups);
  const postHocSettings = resolvePostHocSettings(recommendation);
  showRecommendation(recommendation.title, `${recommendation.reason} 事后比较当前显示 ${postHocMethodName(postHocSettings.method)}${postHocSettings.correction === 'builtin' ? '（方法内置家族校正）' : ` + ${correctionName(postHocSettings.correction)}`}。`);
  latestResult.headers = ['检验', '方法类型', '统计量', 'df1', 'df2', 'P 值', '效应量', '状态'];
  latestResult.rows = [
    ['经典单因素 ANOVA', '参数·等方差', formatNumber(classic?.statistic, 4), formatNumber(classic?.df1, 2), formatNumber(classic?.df2, 2), formatPValue(classic?.pValue), `η² = ${formatNumber(classic?.etaSquared, 3)}`, recommendation.key === 'anova' ? '推荐' : '可参考'],
    ['Welch ANOVA', '参数·方差不齐稳健', formatNumber(welch?.statistic, 4), formatNumber(welch?.df1, 2), formatNumber(welch?.df2, 2), formatPValue(welch?.pValue), '—', recommendation.key === 'welch' ? '推荐' : (welch ? '可参考' : '无法计算')],
    ['Kruskal–Wallis', '非参数·秩', formatNumber(kruskal?.statistic, 4), formatNumber(kruskal?.df, 2), '—', formatPValue(kruskal?.pValue), `ε² = ${formatNumber(kruskal?.epsilonSquared, 3)}`, recommendation.key === 'kruskal' ? '推荐' : '可参考'],
  ];
  makeSummary([
    { label: '有效组数', value: String(sampleData.labels.length) },
    { label: '有效样本量', value: String(sampleData.groups.reduce((sum, group) => sum + group.length, 0)) },
    { label: varianceTest ? `${varianceTest.name} P` : '方差齐性 P', value: formatPValue(varianceTest?.pValue) },
    { label: '推荐方法', value: recommendation.key === 'anova' ? '经典 ANOVA' : recommendation.key === 'welch' ? 'Welch ANOVA' : 'Kruskal–Wallis' },
  ]);
  const diagnostics = sampleData.labels.map((label, index) => {
    const descriptive = stats(sampleData.groups[index]);
    const normality = normalities[index];
    return [label, descriptive.count, `${normality.name} · ${formatNumber(normality.statistic, 4)}`, formatPValue(normality.pValue), `${normalityLabel(normality)}；均值 ${formatNumber(descriptive.mean)} / 中位数 ${formatNumber(descriptive.median)}`];
  });
  diagnostics.push([varianceTest ? `${varianceTest.name} 方差齐性` : '方差齐性检验', sampleData.groups.reduce((sum, group) => sum + group.length, 0), formatNumber(varianceTest?.statistic, 4), formatPValue(varianceTest?.pValue), varianceTest ? (varianceTest.pValue >= ALPHA ? '未提示方差不齐' : '提示方差不齐') : '无法判断']);
  renderDiagnostics(['组别 / 诊断', 'n', '方法 / 统计量', 'P 值', '判断 / 描述'], diagnostics);
  if (state.normalityMethod === 'auto') makeAlert(`正态性自动选择：${sampleData.labels.map((label, index) => `${label} → ${normalities[index].name}`).join('；')}。`, 'success');
  if (varianceTest && state.varianceMethod === 'auto') makeAlert(`方差齐性自动选择 ${varianceTest.name}。${varianceTest.recommendationReason}`, 'success');
  normalities.filter((item) => item.warning).forEach((item) => makeAlert(item.warning, 'warning'));
  if (sampleData.excluded) makeAlert(`因组别为空或数值无效，已剔除 ${sampleData.excluded} 行。`, 'warning');
  if (classic?.pValue < ALPHA || welch?.pValue < ALPHA || kruskal?.pValue < ALPHA) makeAlert('至少一个总体检验达到统计学显著；可结合下方事后比较定位差异组。', 'success');
  else makeAlert('当前总体检验未提示显著组间差异；事后比较仍显示，但应仅作探索性参考。', 'warning');

  if (sampleData.labels.length >= 3) {
    if (sampleData.labels.length > 30) {
      clearPostHoc();
      makeAlert('组数超过 30，事后两两比较数量过多，已停止自动展开；可先筛选组别。', 'warning');
    } else {
      const postHocRows = postHocRowsFor(postHocSettings.method, postHocSettings.correction, sampleData.labels, sampleData.groups);
      const omnibusPValue = omnibusPForPostHoc(postHocSettings.method, classic, welch, kruskal);
      renderPostHoc(postHocSettings.method, postHocRows, omnibusPValue, postHocSettings.correction);
      if (state.postHocMethod !== 'auto' && state.postHocMethod !== postHocSettings.automaticMethod) {
        makeAlert(`当前手动选择 ${postHocMethodName(postHocSettings.method)}；自动推荐为 ${postHocMethodName(postHocSettings.automaticMethod)}。请确认该方法的方差与分布假设适合你的设计。`, 'warning');
      }
      if (postHocSettings.method === 'lsd') makeAlert('Fisher LSD 未控制全部两两比较的家族错误率，组数较多时假阳性风险会明显增加。', 'warning');
      if (postHocSettings.method === 'mann') makeAlert('两两 Mann–Whitney 采用各比较自身的秩，和基于总体秩的 Dunn 检验含义不同。', 'warning');
    }
  } else {
    clearPostHoc();
    makeAlert('当前只有 2 个组，不需要额外事后比较；建议直接使用“两独立样本”模式。', 'warning');
  }
  renderHistogram(state.valueColumn, sampleData.groups.flat());
}

function renderChiSquare() {
  clearDiagnostics();
  elements.chartCard.classList.add('hidden');
  if (!state.categoryColumnA || !state.categoryColumnB || state.categoryColumnA === state.categoryColumnB) {
    hideRecommendation();
    latestResult = { headers: ['列联表'], rows: [] };
    makeSummary([
      { label: 'Pearson χ²', value: '—' },
      { label: '自由度', value: '—' },
      { label: '渐近 P', value: '—' },
      { label: '精确 P', value: '—' },
    ]);
    makeAlert('请选择两个不同的分类字段。', 'danger');
    return;
  }
  const contingency = buildContingency(state.categoryColumnA, state.categoryColumnB);
  const result = contingencyStatistics(contingency.counts);
  if (!result) {
    hideRecommendation();
    latestResult = { headers: ['列联表'], rows: [] };
    makeSummary([
      { label: 'Pearson χ²', value: '—' },
      { label: '自由度', value: '—' },
      { label: '渐近 P', value: '—' },
      { label: '精确 P', value: '—' },
    ]);
    makeAlert('两个字段都至少需要 2 个有效类别。', 'danger');
    return;
  }
  const exact = exactContingencyPValue(contingency.counts, result);
  const expectedCellCount = result.rowTotals.length * result.columnTotals.length;
  if (result.cellsBelowFive > 0 && exact.status === 'exact') showRecommendation('固定边际精确置换 P', `${result.cellsBelowFive}/${expectedCellCount} 个单元格的期望频数小于 5，优先参考精确结果。`);
  else showRecommendation('Pearson χ² 渐近检验', result.cellsBelowFive ? '期望频数偏小，但精确枚举超出上限；请谨慎解释渐近结果。' : '所有单元格期望频数均不小于 5，渐近近似条件较好。');
  latestResult.headers = [`${state.categoryColumnA} \\ ${state.categoryColumnB}`].concat(contingency.columnLabels).concat(['合计']);
  latestResult.rows = contingency.rowLabels.map((label, rowIndex) => [label].concat(contingency.counts[rowIndex].map((observed, columnIndex) => `${observed}（期望 ${formatNumber(result.expected[rowIndex][columnIndex], 2)}）`)).concat([result.rowTotals[rowIndex]]));
  latestResult.rows.push(['合计'].concat(result.columnTotals).concat([result.total]));
  makeSummary([
    { label: 'Pearson χ²', value: formatNumber(result.statistic, 4) },
    { label: '自由度', value: String(result.degreesOfFreedom) },
    { label: '渐近 P', value: formatPValue(result.asymptoticP) },
    { label: '精确 P', value: exact.status === 'exact' ? formatPValue(exact.pValue) : '未计算' },
  ]);
  if (contingency.excluded) makeAlert(`因分类变量为空，已剔除 ${contingency.excluded} 行。`, 'warning');
  if (result.cellsBelowFive) makeAlert(`有 ${result.cellsBelowFive}/${expectedCellCount} 个单元格期望频数小于 5，最小期望频数为 ${formatNumber(result.minimumExpected, 3)}。`, 'warning');
  if (exact.status === 'exact') makeAlert(`已枚举 ${exact.tableCount.toLocaleString('zh-CN')} 张固定边际列联表。`, 'success');
  else makeAlert('固定边际列联表超过 100,000 张或运行时间上限，未用模拟值冒充精确 P。', 'warning');
}

function renderHistogram(columnName, values) {
  const clean = values.filter(Number.isFinite);
  if (!columnName || clean.length < 2) {
    elements.chartCard.classList.add('hidden');
    return;
  }
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const binCount = Math.min(12, Math.max(5, Math.ceil(Math.sqrt(clean.length))));
  const counts = Array.from({ length: binCount }, () => 0);
  const width = max === min ? 1 : (max - min) / binCount;
  clean.forEach((value) => {
    const index = max === min ? 0 : Math.min(binCount - 1, Math.floor((value - min) / width));
    counts[index] += 1;
  });
  const maxCount = Math.max(...counts);
  elements.chartTitle.textContent = `${columnName} · 数值分布`;
  elements.chartMeta.textContent = `范围 ${formatNumber(min)} – ${formatNumber(max)} · n = ${clean.length}`;
  elements.chartBars.innerHTML = counts.map((count, index) => {
    const height = maxCount ? Math.max(4, count / maxCount * 100) : 0;
    const start = min + index * width;
    const end = index === binCount - 1 ? max : start + width;
    return `<div class="chart-bin" style="height:${height}%" title="${escapeHtml(`${formatNumber(start)} – ${formatNumber(end)}：${count}`)}"><span>${count}</span></div>`;
  }).join('');
  elements.chartCard.classList.remove('hidden');
}

function renderResultTable() {
  elements.resultsHead.innerHTML = latestResult.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  if (!latestResult.rows.length) {
    elements.resultsBody.innerHTML = `<tr><td class="empty-cell" colspan="${Math.max(1, latestResult.headers.length)}">暂无可显示的分析结果。</td></tr>`;
    return;
  }
  elements.resultsBody.innerHTML = latestResult.rows.map((row) => `<tr>${row.map((value, index) => {
    const numericClass = index > 0 && (typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value))) ? ' class="numeric-cell"' : '';
    return `<td${numericClass}>${escapeHtml(value)}</td>`;
  }).join('')}</tr>`).join('');
}

function calculate() {
  elements.alerts.innerHTML = '';
  hideRecommendation();
  clearDiagnostics();
  clearPostHoc();
  if (!state.headers.length || !state.rows.length) {
    latestResult = { headers: ['分析结果'], rows: [] };
    makeSummary([
      { label: '数据行数', value: '0' },
      { label: '字段数量', value: '0' },
      { label: '数值字段', value: '0' },
      { label: '当前状态', value: '等待数据' },
    ]);
    makeAlert('请先录入数据。', 'warning');
    elements.chartCard.classList.add('hidden');
    renderResultTable();
    return;
  }
  if (state.analysisMode === 'overview') renderOverview();
  else if (state.analysisMode === 'descriptive') renderDescriptive();
  else if (state.analysisMode === 'group') renderGroup();
  else if (state.analysisMode === 'correlation') renderCorrelation();
  else if (state.analysisMode === 'chisquare') renderChiSquare();
  else if (state.analysisMode === 'independent') renderIndependent();
  else renderAnova();
  renderResultTable();
  saveState();
}

function applyDataset(dataset, sourceMessage = '') {
  selectedCell = null;
  state.headers = dataset.headers;
  state.rows = dataset.rows;
  populateColumnSelects();
  renderDataTable();
  syncControlsFromState();
  calculate();
  if (sourceMessage) elements.dataHelp.textContent = `${sourceMessage}；已读取 ${state.rows.length} 行、${state.headers.length} 列。`;
  saveState();
}

function loadText(text, sourceMessage = '表格解析成功') {
  const dataset = parseDelimited(text.replace(/^\uFEFF/, ''));
  if (!dataset.headers.length || !dataset.rows.length) {
    elements.dataHelp.textContent = '未识别到有效表格：请确认首行为字段名称，并至少包含一行数据。';
    return false;
  }
  applyDataset(dataset, sourceMessage);
  return true;
}

function loadGroupedText(text) {
  const dataset = parseGroupedValues(text);
  if (!dataset.headers.length || !dataset.rows.length) {
    elements.dataHelp.textContent = '未识别到分组数值。可输入“组名: 1, 2, 3”，或粘贴首行为组名的 Excel 宽表。';
    return false;
  }
  state.analysisMode = dataset.rows.reduce((set, row) => set.add(row[0]), new Set()).size === 2 ? 'independent' : 'anova';
  applyDataset(dataset, '分组数值解析成功，并已自动切换到对应检验');
  return true;
}

function loadFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadText(String(reader.result || ''), `已载入 ${file.name}`);
  reader.onerror = () => { elements.dataHelp.textContent = '文件读取失败，请重试或改用粘贴输入。'; };
  reader.readAsText(file, 'utf-8');
}

function exampleDatasets() {
  return {
    general: {
      name: '通用统计演示', mode: 'overview', valueColumn: '评分', groupColumn: '三组', categoryColumnA: '两组', categoryColumnB: '是否改善',
      text: [
        '样本	两组	三组	是否改善	年龄	收缩压	评分',
        'S01	对照组	低剂量	否	24	112	68', 'S02	对照组	低剂量	否	27	118	71', 'S03	对照组	低剂量	是	31	121	75',
        'S04	对照组	低剂量	否	35	124	77', 'S05	对照组	低剂量	是	40	126	79', 'S06	对照组	低剂量	否	38	120	74',
        'S07	处理组	中剂量	是	25	128	81', 'S08	处理组	中剂量	是	29	132	85', 'S09	处理组	中剂量	是	33	136	89',
        'S10	处理组	中剂量	否	38	141	92', 'S11	处理组	中剂量	是	42	145	95', 'S12	处理组	中剂量	是	36	139	90',
        'S13	处理组	高剂量	是	26	134	88', 'S14	处理组	高剂量	是	30	138	91', 'S15	处理组	高剂量	是	34	142	94',
        'S16	处理组	高剂量	是	39	148	98', 'S17	处理组	高剂量	否	43	151	101', 'S18	处理组	高剂量	是	41	149	99',
      ].join('\n'),
    },
    qpcr_two: {
      name: 'qPCR：两组相对表达', mode: 'independent', valueColumn: 'DeltaCt', groupColumn: 'Group',
      text: [
        'Sample	Group	Target_Ct	Reference_Ct	DeltaCt	RelativeExpression',
        'C01	Control	27.8	20.1	7.7	1.00', 'C02	Control	28.2	20.3	7.9	0.87', 'C03	Control	27.5	19.9	7.6	1.07', 'C04	Control	28.0	20.2	7.8	0.93',
        'C05	Control	27.9	20.0	7.9	0.87', 'C06	Control	27.6	20.1	7.5	1.15', 'C07	Control	28.1	20.4	7.7	1.00', 'C08	Control	27.7	20.0	7.7	1.00',
        'T01	Treatment	25.9	20.0	5.9	3.48', 'T02	Treatment	26.3	20.2	6.1	3.03', 'T03	Treatment	25.7	19.9	5.8	3.73', 'T04	Treatment	26.1	20.1	6.0	3.25',
        'T05	Treatment	26.4	20.3	6.1	3.03', 'T06	Treatment	25.8	20.0	5.8	3.73', 'T07	Treatment	26.0	20.1	5.9	3.48', 'T08	Treatment	26.2	20.2	6.0	3.25',
      ].join('\n'),
    },
    qpcr_multi: {
      name: 'qPCR：多处理组表达', mode: 'anova', valueColumn: 'DeltaCt', groupColumn: 'Treatment',
      text: [
        'Sample	Treatment	DeltaCt	RelativeExpression',
        'C01	Control	8.2	1.00', 'C02	Control	8.0	1.15', 'C03	Control	8.3	0.93', 'C04	Control	8.1	1.07', 'C05	Control	8.4	0.87', 'C06	Control	7.9	1.23',
        'S01	siRNA	6.8	2.64', 'S02	siRNA	6.6	3.03', 'S03	siRNA	6.9	2.46', 'S04	siRNA	6.7	2.83', 'S05	siRNA	6.5	3.25', 'S06	siRNA	6.8	2.64',
        'D01	Drug	7.4	1.74', 'D02	Drug	7.2	2.00', 'D03	Drug	7.5	1.62', 'D04	Drug	7.3	1.87', 'D05	Drug	7.1	2.14', 'D06	Drug	7.4	1.74',
        'X01	Combo	5.9	4.93', 'X02	Combo	6.1	4.29', 'X03	Combo	5.8	5.28', 'X04	Combo	6.0	4.59', 'X05	Combo	5.7	5.66', 'X06	Combo	6.2	4.00',
      ].join('\n'),
    },
    western: {
      name: 'Western blot：蛋白灰度', mode: 'anova', valueColumn: 'NormalizedProtein', groupColumn: 'Group',
      text: [
        'Sample	Group	TargetBand	LoadingControl	NormalizedProtein',
        'C01	Control	8120	7900	1.028', 'C02	Control	7750	7680	1.009', 'C03	Control	8310	8050	1.032', 'C04	Control	7580	7700	0.984', 'C05	Control	8040	8010	1.004', 'C06	Control	7920	7990	0.991',
        'S01	Stimulated	12100	8050	1.503', 'S02	Stimulated	11840	7900	1.499', 'S03	Stimulated	12620	8200	1.539', 'S04	Stimulated	11450	7800	1.468', 'S05	Stimulated	12300	8100	1.519', 'S06	Stimulated	11920	7950	1.499',
        'I01	Stim+Inhibitor	9160	8000	1.145', 'I02	Stim+Inhibitor	8890	7850	1.132', 'I03	Stim+Inhibitor	9470	8120	1.166', 'I04	Stim+Inhibitor	8720	7780	1.121', 'I05	Stim+Inhibitor	9280	8060	1.151', 'I06	Stim+Inhibitor	9010	7920	1.138',
      ].join('\n'),
    },
    elisa: {
      name: 'ELISA：细胞因子浓度', mode: 'anova', valueColumn: 'IL6_pg_mL', groupColumn: 'Condition',
      text: [
        'Sample	Condition	IL6_pg_mL',
        'C01	Control	18.2', 'C02	Control	21.4', 'C03	Control	17.6', 'C04	Control	24.1', 'C05	Control	19.8', 'C06	Control	22.0', 'C07	Control	20.7', 'C08	Control	18.9',
        'L01	LPS	146.2', 'L02	LPS	178.4', 'L03	LPS	132.7', 'L04	LPS	205.1', 'L05	LPS	159.6', 'L06	LPS	188.8', 'L07	LPS	151.3', 'L08	LPS	221.5',
        'D01	LPS+Drug	74.5', 'D02	LPS+Drug	82.1', 'D03	LPS+Drug	68.9', 'D04	LPS+Drug	96.4', 'D05	LPS+Drug	79.8', 'D06	LPS+Drug	88.2', 'D07	LPS+Drug	71.6', 'D08	LPS+Drug	91.0',
      ].join('\n'),
    },
    viability: {
      name: '细胞活力：剂量处理', mode: 'anova', valueColumn: 'Viability_pct', groupColumn: 'DoseGroup',
      text: [
        'Sample	DoseGroup	Dose_uM	Viability_pct',
        'D0_1	0 uM	0	100.8', 'D0_2	0 uM	0	98.9', 'D0_3	0 uM	0	101.5', 'D0_4	0 uM	0	99.7', 'D0_5	0 uM	0	102.1', 'D0_6	0 uM	0	97.8',
        'D01_1	0.1 uM	0.1	94.2', 'D01_2	0.1 uM	0.1	96.1', 'D01_3	0.1 uM	0.1	92.8', 'D01_4	0.1 uM	0.1	95.4', 'D01_5	0.1 uM	0.1	93.7', 'D01_6	0.1 uM	0.1	97.0',
        'D1_1	1 uM	1	76.4', 'D1_2	1 uM	1	72.8', 'D1_3	1 uM	1	79.1', 'D1_4	1 uM	1	74.5', 'D1_5	1 uM	1	77.2', 'D1_6	1 uM	1	73.6',
        'D10_1	10 uM	10	41.5', 'D10_2	10 uM	10	38.7', 'D10_3	10 uM	10	44.2', 'D10_4	10 uM	10	36.9', 'D10_5	10 uM	10	42.8', 'D10_6	10 uM	10	39.6',
      ].join('\n'),
    },
    apoptosis: {
      name: '流式凋亡：分类结局', mode: 'chisquare', categoryColumnA: 'Treatment', categoryColumnB: 'Apoptosis',
      text: [
        'CellEvent	Treatment	Apoptosis	AnnexinV_pct',
        'C01	Control	Negative	5.2', 'C02	Control	Negative	6.1', 'C03	Control	Negative	4.8', 'C04	Control	Negative	5.7', 'C05	Control	Negative	6.4', 'C06	Control	Negative	5.5', 'C07	Control	Positive	8.1', 'C08	Control	Negative	6.0',
        'T01	Drug	Positive	32.4', 'T02	Drug	Positive	28.7', 'T03	Drug	Positive	35.1', 'T04	Drug	Positive	31.6', 'T05	Drug	Positive	29.9', 'T06	Drug	Positive	37.2', 'T07	Drug	Negative	24.6', 'T08	Drug	Positive	33.0',
        'R01	Drug+Rescue	Negative	14.2', 'R02	Drug+Rescue	Positive	18.6', 'R03	Drug+Rescue	Negative	12.8', 'R04	Drug+Rescue	Negative	15.4', 'R05	Drug+Rescue	Positive	19.1', 'R06	Drug+Rescue	Negative	13.7', 'R07	Drug+Rescue	Negative	16.0', 'R08	Drug+Rescue	Positive	17.8',
      ].join('\n'),
    },
    crispr: {
      name: 'CRISPR：编辑效率与阳性率', mode: 'chisquare', valueColumn: 'Indel_pct', groupColumn: 'sgRNA', categoryColumnA: 'sgRNA', categoryColumnB: 'Edited',
      text: [
        'Sample	sgRNA	Edited	Indel_pct',
        'NT01	NonTargeting	No	1.2', 'NT02	NonTargeting	No	0.8', 'NT03	NonTargeting	No	1.5', 'NT04	NonTargeting	No	0.6', 'NT05	NonTargeting	No	1.1', 'NT06	NonTargeting	No	0.9', 'NT07	NonTargeting	Yes	2.4', 'NT08	NonTargeting	No	1.0',
        'G1_01	sgRNA-1	Yes	48.2', 'G1_02	sgRNA-1	Yes	52.6', 'G1_03	sgRNA-1	Yes	45.9', 'G1_04	sgRNA-1	Yes	55.1', 'G1_05	sgRNA-1	Yes	50.4', 'G1_06	sgRNA-1	Yes	47.8', 'G1_07	sgRNA-1	No	18.5', 'G1_08	sgRNA-1	Yes	53.0',
        'G2_01	sgRNA-2	Yes	31.4', 'G2_02	sgRNA-2	No	12.6', 'G2_03	sgRNA-2	Yes	28.9', 'G2_04	sgRNA-2	Yes	35.7', 'G2_05	sgRNA-2	No	14.2', 'G2_06	sgRNA-2	Yes	33.1', 'G2_07	sgRNA-2	Yes	29.8', 'G2_08	sgRNA-2	No	11.9',
      ].join('\n'),
    },
    correlation: {
      name: 'mRNA–蛋白表达相关', mode: 'correlation',
      text: [
        'Sample	mRNA_FoldChange	Protein_FoldChange	PhenotypeScore',
        'S01	0.62	0.71	18', 'S02	0.78	0.81	22', 'S03	0.91	0.88	25', 'S04	1.05	1.12	31', 'S05	1.18	1.21	34', 'S06	1.32	1.28	38',
        'S07	1.46	1.51	43', 'S08	1.61	1.58	47', 'S09	1.74	1.69	51', 'S10	1.92	1.87	56', 'S11	2.08	2.02	60', 'S12	2.23	2.18	64',
        'S13	2.41	2.36	68', 'S14	2.58	2.49	71', 'S15	2.76	2.69	75', 'S16	2.94	2.87	79', 'S17	3.11	3.02	82', 'S18	3.28	3.19	85',
      ].join('\n'),
    },
  };
}

function loadExampleDataset(key) {
  const example = exampleDatasets()[key] || exampleDatasets().general;
  state.analysisMode = example.mode || 'overview';
  if (!loadText(example.text, `已载入模拟示例：${example.name}`)) return;
  if (example.valueColumn && state.headers.includes(example.valueColumn)) state.valueColumn = example.valueColumn;
  if (example.groupColumn && state.headers.includes(example.groupColumn)) state.groupColumn = example.groupColumn;
  if (example.categoryColumnA && state.headers.includes(example.categoryColumnA)) state.categoryColumnA = example.categoryColumnA;
  if (example.categoryColumnB && state.headers.includes(example.categoryColumnB)) state.categoryColumnB = example.categoryColumnB;
  syncControlsFromState();
  calculate();
  saveState();
  elements.dataHelp.textContent = `已载入模拟示例“${example.name}”；示例仅用于演示统计流程，请勿作为真实实验结论。`;
}

function resultAsTsv() {
  return [latestResult.headers].concat(latestResult.rows).map((row) => row.join('\t')).join('\n');
}

function resultAsCsv() {
  return [latestResult.headers].concat(latestResult.rows).map((row) => row.map((value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',')).join('\n');
}

async function copyResults() {
  if (!latestResult.rows.length) return;
  const text = resultAsTsv();
  try {
    await navigator.clipboard.writeText(text);
    elements.copyBtn.textContent = '已复制';
    window.setTimeout(() => { elements.copyBtn.textContent = '复制结果'; }, 1200);
  } catch (error) {
    window.prompt('请复制以下结果：', text);
  }
}

function exportResults() {
  if (!latestResult.rows.length) return;
  const blob = new Blob([`\uFEFF${resultAsCsv()}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '统计分析结果.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function readClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      elements.dataHelp.textContent = '剪贴板中没有可读取的文本。';
      return;
    }
    elements.pasteArea.value = text;
    elements.pasteArea.focus();
    elements.dataHelp.textContent = '已读取剪贴板，请点击“按表格解析”或“按分组数值解析”。';
  } catch (error) {
    elements.dataHelp.textContent = '浏览器未允许读取剪贴板。可直接点击输入框后按 Ctrl/⌘ + V。';
    elements.pasteArea.focus();
  }
}

function bindEvents() {
  elements.analysisSelect.addEventListener('change', () => {
    state.analysisMode = elements.analysisSelect.value;
    syncControlsFromState();
    calculate();
  });
  elements.valueColumn.addEventListener('change', () => { state.valueColumn = elements.valueColumn.value; calculate(); });
  elements.groupColumn.addEventListener('change', () => { state.groupColumn = elements.groupColumn.value; calculate(); });
  elements.categoryColumnA.addEventListener('change', () => {
    state.categoryColumnA = elements.categoryColumnA.value;
    if (state.categoryColumnB === state.categoryColumnA) {
      const alternative = getCategoricalCandidates().find((header) => header !== state.categoryColumnA);
      if (alternative) { state.categoryColumnB = alternative; elements.categoryColumnB.value = alternative; }
    }
    calculate();
  });
  elements.categoryColumnB.addEventListener('change', () => { state.categoryColumnB = elements.categoryColumnB.value; calculate(); });
  elements.normalityMethod.addEventListener('change', () => { state.normalityMethod = elements.normalityMethod.value; calculate(); });
  elements.varianceMethod.addEventListener('change', () => { state.varianceMethod = elements.varianceMethod.value; calculate(); });
  elements.correlationMethod.addEventListener('change', () => { state.correlationMethod = elements.correlationMethod.value; calculate(); });
  elements.postHocMethod.addEventListener('change', () => {
    state.postHocMethod = elements.postHocMethod.value;
    updatePostHocCorrectionControl();
    calculate();
  });
  elements.postHocCorrection.addEventListener('change', () => { state.postHocCorrection = elements.postHocCorrection.value; calculate(); });
  elements.missingMode.addEventListener('change', () => { state.missingMode = elements.missingMode.value; calculate(); });
  elements.fileInput.addEventListener('change', () => {
    loadFile(elements.fileInput.files && elements.fileInput.files[0]);
    elements.fileInput.value = '';
  });
  elements.parseTableBtn.addEventListener('click', () => {
    if (!elements.pasteArea.value.trim()) { elements.dataHelp.textContent = '请先粘贴表格数据。'; elements.pasteArea.focus(); return; }
    loadText(elements.pasteArea.value);
  });
  elements.parseGroupsBtn.addEventListener('click', () => {
    if (!elements.pasteArea.value.trim()) { elements.dataHelp.textContent = '请先粘贴分组数值。'; elements.pasteArea.focus(); return; }
    loadGroupedText(elements.pasteArea.value);
  });
  elements.readClipboardBtn.addEventListener('click', readClipboard);
  elements.clearInputBtn.addEventListener('click', () => { elements.pasteArea.value = ''; elements.pasteArea.focus(); });
  elements.createTableBtn.addEventListener('click', createBlankTable);
  elements.addRowBtn.addEventListener('click', addSpreadsheetRow);
  elements.addColumnBtn.addEventListener('click', addSpreadsheetColumn);
  elements.deleteRowBtn.addEventListener('click', deleteSelectedRow);
  elements.deleteColumnBtn.addEventListener('click', deleteSelectedColumn);

  elements.dataBody.addEventListener('focusin', (event) => {
    const cell = event.target.closest('.data-cell');
    if (!cell) return;
    selectSpreadsheetCell(Number(cell.dataset.rowIndex), Number(cell.dataset.columnIndex), cell);
  });
  elements.dataBody.addEventListener('input', (event) => {
    const cell = event.target.closest('.data-cell');
    if (!cell) return;
    const rowIndex = Number(cell.dataset.rowIndex);
    const columnIndex = Number(cell.dataset.columnIndex);
    if (!state.rows[rowIndex]) return;
    state.rows[rowIndex][columnIndex] = cell.textContent.replace(/\n/g, ' ').trim();
    scheduleGridAnalysis();
  });
  elements.dataBody.addEventListener('paste', (event) => {
    const cell = event.target.closest('.data-cell');
    if (!cell) return;
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    pasteGridAt(Number(cell.dataset.rowIndex), Number(cell.dataset.columnIndex), text);
  });
  elements.dataBody.addEventListener('keydown', (event) => {
    const cell = event.target.closest('.data-cell');
    if (!cell || event.key !== 'Enter') return;
    event.preventDefault();
    const rowIndex = Number(cell.dataset.rowIndex);
    const columnIndex = Number(cell.dataset.columnIndex);
    if (rowIndex >= state.rows.length - 1) state.rows.push(Array.from({ length: state.headers.length }, () => ''));
    renderDataTable();
    selectCellAfterRender(rowIndex + 1, columnIndex);
    scheduleGridAnalysis();
  });
  elements.dataHead.addEventListener('focusout', (event) => {
    const header = event.target.closest('.header-cell');
    if (!header) return;
    updateHeader(Number(header.dataset.headerIndex), header.textContent);
  });
  elements.dataHead.addEventListener('keydown', (event) => {
    const header = event.target.closest('.header-cell');
    if (!header || event.key !== 'Enter') return;
    event.preventDefault();
    header.blur();
  });
  elements.dataHead.addEventListener('paste', (event) => {
    const header = event.target.closest('.header-cell');
    if (!header) return;
    event.preventDefault();
    header.textContent = (event.clipboardData?.getData('text/plain') || '').split(/\r?\n/)[0].split('\t')[0];
  });
  elements.loadExampleBtn.addEventListener('click', () => loadExampleDataset(elements.exampleSelect.value));
  elements.clearDataBtn.addEventListener('click', clearSpreadsheet);
  elements.resetBtn.addEventListener('click', () => {
    state = getDefaultState();
    selectedCell = null;
    localStorage.removeItem(STORAGE_KEY);
    elements.pasteArea.value = '';
    syncControlsFromState();
    renderDataTable();
    calculate();
  });
  elements.copyBtn.addEventListener('click', copyResults);
  elements.exportBtn.addEventListener('click', exportResults);
  ['dragenter', 'dragover'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove('is-dragging');
  }));
  elements.dropZone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files && event.dataTransfer.files[0]));
  elements.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') elements.fileInput.click();
  });
}

loadState();
syncControlsFromState();
renderDataTable();
bindEvents();
calculate();
