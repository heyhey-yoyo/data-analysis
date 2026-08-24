// 统计核心回归测试：node test/core.test.mjs
// 覆盖 reviewer 审计的 P0 / P1 项：
//   P0-1 studentized range 分布在 df>200 时的连续性与参考值
//   P0-2 Mann–Whitney 在 U = E(U) 时的连续性校正
//   P1-4 protected Fisher LSD 的总体 ANOVA 前置条件
import assert from 'node:assert/strict';
import {
  studentizedRangeCdf,
  mannWhitney,
  postHocComparisons,
  tTwoSidedP,
  fixedMarginExact,
  pearsonCorrelation,
  spearmanCorrelation,
  shapiroFamily,
  stats,
} from '../src/core.mjs';

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`FAIL - ${name}\n  ${error.message}`);
  }
}
const sf = (q, k, df) => 1 - studentizedRangeCdf(q, k, df);

// ---------- P0-1：studentized range ----------

test('P0-1 审计回归点：SF(q=5.380235231361282, k=30, df=201) ≈ 0.05', () => {
  assert.ok(Math.abs(sf(5.380235231361282, 30, 201) - 0.05) < 0.002, `实际 ${sf(5.380235231361282, 30, 201)}`);
});

test('P0-1 df=200 与 df=201 之间无跳变（k=30）', () => {
  const diff = Math.abs(sf(5.380235231361282, 30, 200) - sf(5.380235231361282, 30, 201));
  assert.ok(diff < 0.005, `两侧 P 相差 ${diff}`);
});

test('P0-1 df=200 附近连续（k=2,3,5,10,30）', () => {
  for (const k of [2, 3, 5, 10, 30]) {
    for (const q of [2, 3, 4, 5]) {
      const diff = Math.abs(sf(q, k, 200) - sf(q, k, 201));
      assert.ok(diff < 0.005, `k=${k} q=${q} 两侧 P 相差 ${diff}`);
    }
  }
});

test('P0-1 k=2 时与 t 分布参考一致（q = √2·t）', () => {
  // k=2 的学生化极差等价于 √2·|T|，SF_q(q) = t 双侧 P(q/√2)
  for (const df of [1, 2, 3, 5, 10, 30, 100, 200, 201, 500]) {
    for (const q of [2, 3, 4]) {
      const actual = sf(q, 2, df);
      const reference = tTwoSidedP(q / Math.sqrt(2), df);
      assert.ok(Math.abs(actual - reference) < 1e-4, `df=${df} q=${q}：${actual} vs ${reference}`);
    }
  }
});

test('P0-1 k=30 与蒙特卡洛参考一致（q=3，小 df 区域）', () => {
  // 参考值来自 400,000 次蒙特卡洛模拟（Q = 30 个标准正态极差 / √(χ²_df/df)），
  // 小 df 时生存概率不随 df 单调，蒙特卡洛作为独立参照
  const references = { 1: 0.8155, 2: 0.8224, 3: 0.8352, 5: 0.8574, 10: 0.8892 };
  for (const [df, expected] of Object.entries(references)) {
    const actual = sf(3, 30, Number(df));
    assert.ok(Math.abs(actual - expected) < 0.005, `df=${df}：${actual} vs MC ${expected}`);
  }
});

// ---------- P0-2：Mann–Whitney 中心点连续性校正 ----------

test('P0-2 U = E(U) 时 z = 0、双侧 P = 1', () => {
  const result = mannWhitney([1, 4], [2, 3]);
  assert.equal(result.statistic, 2);
  assert.equal(result.z, 0);
  assert.ok(Math.abs(result.pValue - 1) < 1e-6, `P = ${result.pValue}`);
});

test('P0-2 方差为 0 时 z = 0（全部并列）', () => {
  const result = mannWhitney([1, 1], [1, 1]);
  assert.equal(result.z, 0);
  assert.ok(Math.abs(result.pValue - 1) < 1e-6, `P = ${result.pValue}`);
});

// ---------- P1-4：protected Fisher LSD ----------

const flatGroups = [[1.0, 1.1, 0.9, 1.05, 0.95], [1.1, 1.0, 1.2, 0.9, 1.05], [0.95, 1.05, 1.0, 1.1, 0.9]];
const separatedGroups = [[1.0, 1.1, 0.9, 1.05, 0.95], [2.5, 2.6, 2.4, 2.55, 2.45], [4.0, 4.1, 3.9, 4.05, 3.95]];
const labels = ['A', 'B', 'C'];

test('P1-4 总体 ANOVA 不显著时不执行 LSD 两两比较', () => {
  const rows = postHocComparisons(labels, flatGroups, 'fisher-lsd');
  assert.equal(rows.length, 0, `应返回空，实际 ${rows.length} 行`);
});

test('P1-4 总体 ANOVA 显著时正常执行 LSD 两两比较', () => {
  const rows = postHocComparisons(labels, separatedGroups, 'fisher-lsd');
  assert.equal(rows.length, 3);
  rows.forEach((row) => {
    assert.equal(row.correction, 'none', 'LSD 两两 P 不单独校正');
    assert.ok(Number.isFinite(row.pValue), 'P 应为有限值');
  });
});

test('P1-4 保护逻辑不影响其他事后方法', () => {
  for (const method of ['tukey', 'games-howell', 'pooled', 'welch', 'dunn', 'mann-whitney']) {
    const rows = postHocComparisons(labels, flatGroups, method);
    assert.equal(rows.length, 3, `${method} 在相同数据上应有 3 组比较`);
  }
});

// ---------- B1-1：Fisher 2×2 精确检验 ----------

test('B1-1 Fisher 2×2 [[8,2],[1,1]] 双侧精确 P ≈ 0.4545', () => {
  const result = fixedMarginExact([[8, 2], [1, 1]]);
  assert.equal(result.status, 'exact');
  assert.ok(Math.abs(result.pValue - 0.4545) < 0.001, `P = ${result.pValue}`);
});

// ---------- B1-2：常量列相关分析 ----------

test('B1-2 Pearson 常量列返回 coefficient:null, pValue:null, status:constant-input', () => {
  const result = pearsonCorrelation([1, 1, 1, 1], [1, 2, 3, 4]);
  assert.equal(result.coefficient, null);
  assert.equal(result.pValue, null);
  assert.equal(result.n, 4);
  assert.equal(result.status, 'constant-input');
});

test('B1-2 Spearman 常量列返回 constant-input 状态', () => {
  const result = spearmanCorrelation([1, 2, 3, 4], [5, 5, 5, 5]);
  assert.equal(result.coefficient, null);
  assert.equal(result.pValue, null);
  assert.equal(result.n, 4);
  assert.equal(result.status, 'constant-input');
});

// ---------- B1-3：Shapiro–Francia 命名 ----------

test('B1-3 shapiroFamily n≥4 返回 "Shapiro–Francia"', () => {
  const result = shapiroFamily([1, 2, 3, 4, 5]);
  assert.ok(result.name.includes('Shapiro–Francia'), `实际名称：${result.name}`);
});

// ---------- B2-2：数值稳定性 ----------

test('B2-2 Neumaier 求和：stats([1e16, 1, -1e16]) 均值接近 1/3', () => {
  // 朴素求和：1e16 + 1 + (-1e16) = 0（灾难性消减），Neumaier 应返回 ~1/3
  const result = stats([1e16, 1, -1e16]);
  assert.ok(Math.abs(result.mean - 1 / 3) < 1e-6, `均值 = ${result.mean}，期望 ≈ ${1 / 3}`);
  assert.ok(Math.abs(result.sum - 1) < 1e-6, `和 = ${result.sum}，期望 ≈ 1`);
});

test('B2-2 方差平移不变性', () => {
  const base = [1e6, 1e6 + 1, 1e6 + 2, 1e6 + 3, 1e6 + 4];
  const result = stats(base);
  assert.ok(Math.abs(result.variance - 2.5) < 0.001, `方差 = ${result.variance}，期望 ≈ 2.5`);
});

test('B2-2 近常量输入不崩溃', () => {
  const nearConst = [1 + 1e-10, 1 + 2e-10, 1 + 3e-10, 1 + 4e-10, 1 + 5e-10];
  const result = stats(nearConst);
  assert.ok(result.variance > 0, `方差应为正，得到 ${result.variance}`);
  assert.ok(Number.isFinite(result.sd), 'SD 应为有限值');
});

test('B2-2 高动态范围均值不溢出', () => {
  const data = [1e-15, 1, 1e15];
  const result = stats(data);
  assert.ok(Number.isFinite(result.mean), `均值应有限，得到 ${result.mean}`);
  assert.ok(result.mean > 0, `均值应为正，得到 ${result.mean}`);
});

// ---------- B1-1：pooled t 与 Fisher LSD 分离 ----------

test('B1-1 pooled t 使用两组合并方差不受第三组影响', () => {
  // A, B 两组恒等，加入差异极大的 C 组
  const a = [1, 2, 3, 4, 5];
  const bSame = [1, 2, 3, 4, 5];
  const cDifferent = [100, 200, 300, 400, 500];
  // 三组 pooled t (A vs B) 应与两组 pooled t 一致
  const pooled3 = postHocComparisons(['A', 'B', 'C'], [a, bSame, cDifferent], 'pooled', 'none');
  const pooled2 = postHocComparisons(['A', 'B'], [a, bSame], 'pooled', 'none');
  assert.equal(pooled3[0].comparison, 'A vs B');
  assert.equal(pooled2[0].comparison, 'A vs B');
  assert.ok(Math.abs(pooled3[0].statistic - pooled2[0].statistic) < 1e-10,
    `三组 pooled t=${pooled3[0].statistic}，两组 pooled t=${pooled2[0].statistic}，应一致`);
  assert.ok(Math.abs(pooled3[0].pValue - pooled2[0].pValue) < 1e-10,
    `三组 P=${pooled3[0].pValue}，两组 P=${pooled2[0].pValue}，应一致`);
});

// ---------- B1-2：Fisher 双侧等概率判断 ----------

test('B1-2 Fisher [[0,2],[2,3]] 双侧 P = 1（等概率表）', () => {
  const result = fixedMarginExact([[0, 2], [2, 3]]);
  assert.equal(result.status, 'exact');
  assert.ok(Math.abs(result.pValue - 1) < 1e-6, `P = ${result.pValue}，期望 ≈ 1`);
});

test('B1-2 Fisher [[8,2],[1,1]] 双侧 P ≈ 0.454545', () => {
  const result = fixedMarginExact([[8, 2], [1, 1]]);
  assert.equal(result.status, 'exact');
  assert.ok(Math.abs(result.pValue - 0.454545) < 0.001, `P = ${result.pValue}`);
});

test('B1-2 Fisher [[50,0],[0,50]] 极小 P 保持精确', () => {
  const result = fixedMarginExact([[50, 0], [0, 50]]);
  assert.equal(result.status, 'exact');
  assert.ok(result.pValue < 1e-10, `P = ${result.pValue}，应极小`);
  assert.ok(result.pValue > 0, `P = ${result.pValue}，应大于 0`);
});

// ---------- B2-1：小样本精确 P ----------

test('B2-1 Spearman n=3 完全单调 → 精确双侧 P = 1/3', () => {
  const result = spearmanCorrelation([1, 2, 3], [10, 20, 30]);
  assert.equal(result.pValueType, 'exact');
  assert.ok(Math.abs(result.pValue - 1 / 3) < 0.001, `P = ${result.pValue}`);
});

test('B2-1 Mann-Whitney n=2 vs n=2 精确 P', () => {
  const result = mannWhitney([1, 2], [3, 4]);
  assert.equal(result.pValueType, 'exact');
  // C(4,2)=6 种组合，两端各 1 种 → P = 2/6 = 1/3
  assert.ok(Math.abs(result.pValue - 1 / 3) < 0.001, `P = ${result.pValue}`);
});

test('B2-1 Mann-Whitney 有 ties 时回退渐近', () => {
  const result = mannWhitney([1, 2], [2, 3]);
  assert.equal(result.pValueType, 'asymptotic');
});

// ---------- 汇总 ----------

console.log(`\n${passed} 通过，${failures.length} 失败`);
if (failures.length) process.exit(1);
