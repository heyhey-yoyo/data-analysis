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

// ---------- 汇总 ----------

console.log(`\n${passed} 通过，${failures.length} 失败`);
if (failures.length) process.exit(1);
