// 概率分布函数与数值积分 —— 从 core.mjs 提取，纯数学，不操作 DOM。
import { clampProbability } from './core.mjs';

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

function simpsonIntegral(fn, start, end, intervals) {
  const n = intervals % 2 === 0 ? intervals : intervals + 1;
  const step = (end - start) / n;
  let total = fn(start) + fn(end);
  for (let index = 1; index < n; index += 1) total += (index % 2 ? 4 : 2) * fn(start + index * step);
  return total * step / 3;
}

const studentizedRangeCache = new Map();
const MAX_SR_CACHE_SIZE = 10000;
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
  if (studentizedRangeCache.size >= MAX_SR_CACHE_SIZE) {
    // 超过容量上限时清空缓存（简单策略，避免内存无限增长）
    studentizedRangeCache.clear();
  }
  studentizedRangeCache.set(cacheKey, result);
  return result;
}
