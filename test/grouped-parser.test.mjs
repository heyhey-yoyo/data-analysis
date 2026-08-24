// 分组文本解析回归测试：node test/grouped-parser.test.mjs
import assert from 'node:assert/strict';
import { tokenizeGroupBody } from '../src/data/grouped-parser.mjs';

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

const dotOpts = { decimalSeparator: 'dot' };
const commaOpts = { decimalSeparator: 'comma' };
const autoOpts = {};

// ---------- dot: 千分位 ----------

test('dot：单个千分位 1,234 → 1234', () => {
  const r = tokenizeGroupBody('1,234', 'dot', dotOpts);
  assert.equal(r.tokens.length, 1);
  assert.equal(r.fatal, false);
});

test('dot：多个千分位 1,234 2,345 → 2 tokens', () => {
  const r = tokenizeGroupBody('1,234 2,345', 'dot', dotOpts);
  assert.equal(r.tokens.length, 2);
  assert.equal(r.tokens[0], '1,234');
  assert.equal(r.tokens[1], '2,345');
  assert.equal(r.fatal, false);
});

// ---------- dot: 逗号列表 ----------

test('dot：逗号空格列表 1, 2, 3 → 3 tokens', () => {
  const r = tokenizeGroupBody('1, 2, 3', 'dot', dotOpts);
  assert.equal(r.tokens.length, 3);
  assert.equal(r.fatal, false);
});

test('dot：无空格逗号列表 1,2,3 → 3 tokens', () => {
  const r = tokenizeGroupBody('1,2,3', 'dot', dotOpts);
  assert.equal(r.tokens.length, 3);
  assert.equal(r.fatal, false);
});

// ---------- comma: 小数逗号 ----------

test('comma：1,2 3,4 → 小数逗号两值', () => {
  const r = tokenizeGroupBody('1,2 3,4', 'comma', commaOpts);
  assert.equal(r.tokens.length, 2);
  assert.equal(r.tokens[0], '1,2');
  assert.equal(r.tokens[1], '3,4');
  assert.equal(r.fatal, false);
});

// ---------- auto: 歧义 ----------

test('auto：1,2 3,4 存在空格 → fatal 歧义', () => {
  const r = tokenizeGroupBody('1,2 3,4', 'auto', autoOpts);
  assert.equal(r.fatal, true);
});

test('auto：1,2 无空格 → fatal 歧义', () => {
  const r = tokenizeGroupBody('1,2', 'auto', autoOpts);
  assert.equal(r.fatal, true);
});

test('auto：1, 2, 3 无歧义 → 逗号列表', () => {
  const r = tokenizeGroupBody('1, 2, 3', 'auto', autoOpts);
  assert.equal(r.tokens.length, 3);
  assert.equal(r.fatal, false);
});

test('auto：1 2 3 纯空格 → 无歧义', () => {
  const r = tokenizeGroupBody('1 2 3', 'auto', autoOpts);
  assert.equal(r.tokens.length, 3);
  assert.equal(r.fatal, false);
});

// ---------- 摘要 ----------

console.log(`\n${passed} 通过，${failures.length} 失败`);
if (failures.length) process.exit(1);
