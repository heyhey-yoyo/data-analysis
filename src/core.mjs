// 统计核心 —— 解析、分布函数、检验、事后比较、精确枚举、导出。
// 解析与分布函数已分别提取到 parsing.mjs / distributions.mjs，此处重导出以保持对外接口不变。

// ---- 重导出子模块（保持对 app.mjs / worker.mjs / 测试的接口不变） ----
export { parseNumeric, detectDelimiter, parseDelimited, columnProfile, extractNumeric } from './parsing.mjs';
import {
  logGamma, chiSquareSurvival, fSurvival, tTwoSidedP,
  normalCdf, inverseNormalCdf, normalTwoSidedP,
  studentizedRangeCdf, regularizedGammaQ, regularizedBeta, erf,
} from './distributions.mjs';
export {
  logGamma, regularizedGammaQ, regularizedBeta,
  chiSquareSurvival, fSurvival, tTwoSidedP,
  erf, normalCdf, inverseNormalCdf, normalTwoSidedP,
  studentizedRangeCdf,
} from './distributions.mjs';

// ---- 常量与基础工具 ----
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

// ---- 描述统计 ----
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

// ---- 秩与相关 ----
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

// ---- 正态性检验 ----
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

// ---- 方差检验 ----
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

// ---- 参数与非参数检验 ----
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

// ---- 事后多重比较 ----
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
      let estimateType = 'mean-difference';
      let pValueType = 'asymptotic';
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
        difference = result.effect;
        estimateType = 'rank-biserial-correlation';
        pValueType = result.pValueType || 'asymptotic';
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
        estimateType = 'mean-rank-difference';
      } else {
        const result = welchTTest(groups[i], groups[j]);
        if (!result) continue;
        statistic = result.statistic;
        df = result.df;
        pValue = result.pValue;
      }
      rows.push({ comparison: `${labels[i]} vs ${labels[j]}`, difference, estimateType, pValueType, statistic, df, pValue, adjustedP: pValue, correction: builtin ? 'builtin' : appliedCorrection });
    }
  }
  if (!rows.length || rows.every((row) => row.correction === 'builtin')) return rows;
  const adjusted = adjustPValues(rows.map((row) => row.pValue), appliedCorrection);
  return rows.map((row, index) => ({ ...row, adjustedP: adjusted[index] }));
}

// ---- 精确枚举 ----
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

// ---- CSV 导出 ----
export function safeCsvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let text = String(value);
  // 合法数字字符串不加引号前缀（负数如 "-2.35" 不应变为文本）
  const isNumericString = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text);
  if (!isNumericString && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(safeCsvCell).join(',')).join('\r\n');
}
