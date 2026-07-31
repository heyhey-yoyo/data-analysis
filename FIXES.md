# v2 修复与实现说明

## 修复矩阵

| 问题 | 修复方式 | 回归覆盖 |
|---|---|---|
| Mann–Whitney 在 U 等于均值时仍做 ±0.5 校正 | `delta === 0` 时连续性校正为 0 | `core.test.mjs` |
| 非法文本被“缺失按 0”吞掉 | 解析结果分为 `number / missing / invalid` | `core.test.mjs` |
| `1,5` 被解析成 `15` | 区分小数逗号与严格千分位格式 | `core.test.mjs` |
| 百分号含义静默决定 | UI 可选择保留百分数或转换为比例 | 手工/静态检查 |
| 引号内逗号干扰 CSV 分隔符探测 | quote-aware 多行候选评分 | `core.test.mjs` |
| 未闭合 CSV 引号静默吞行 | 返回 fatal error 并停止导入 | `core.test.mjs` |
| 引号字段合法首尾空格被删 | 仅未加引号字段做 trim | `core.test.mjs` |
| 字段“有效值”与统计 N 不一致 | 分别报告 nonEmpty / numeric / invalid / missing | `core.test.mjs` |
| Studentized range 在 df=200/201 跳变 | 有限 df 算法使用至 100,000 | `core.test.mjs` |
| 相关矩阵不显示 pairwise N | 每个变量对返回并显示 N | `core.test.mjs` |
| CSV Formula Injection | 危险前缀单元格前置单引号 | `core.test.mjs` |
| 精确算法失败原因混淆 | 分离 `too-many-combinations / timeout / numerical-failure` | `core.test.mjs` |
| 主线程精确枚举卡 UI | 置换与固定边际枚举运行在 Web Worker | 静态检查 |
| 重构导致原版诊断/事后方法丢失 | 恢复自动/手动正态性、三种方差诊断和 Fisher LSD | `core.test.mjs` |
| 旧版 localStorage 枚举值不兼容 | 迁移旧分析模式、`games/lsd/mann` 和 `postHocCorrection` | 静态检查 |
| 超大文件/表格导致不可控卡顿 | 10 MiB、100,000 行限制；100 行分页 | 静态检查 |
| localStorage 失败无用户提示 | 大小阈值、异常捕获、界面告警 | 静态检查 |
| 中文旧编码乱码 | TextDecoder 支持 UTF-8、GB18030、Big5 | 静态检查 |

## 架构

```text
index.html                页面结构
styles.css                样式
src/core.mjs              纯函数：统计检验、事后比较、精确枚举、导出
src/parsing.mjs           数字解析与 CSV 解析（← core.mjs 重导出）
src/distributions.mjs     概率分布与数值积分（← core.mjs 重导出）
src/data/grouped-parser.mjs  分组文本解析
src/app.mjs               UI、状态、导入导出、结果展示
src/worker.mjs            精确枚举后台计算
```

统计核心与 DOM 分离，`core.mjs` 可直接由 Node.js 回归测试导入。

## 当前自动测试

覆盖 14 个重点回归场景：

1. Mann–Whitney 中心点连续性校正。
2. 小数逗号。
3. 缺失与非法文本。
4. 引号内分隔符。
5. 分号文件的小数逗号。
6. 引号空格及未闭合引号。
7. 字段数据质量计数。
8. Studentized range df=200/201 连续性。
9. CSV 公式注入。
10. 精确置换状态。
11. 2×2 固定边际精确结果。
12. 相关分析逐对 N。
13. 自动正态性与方差诊断选择。
14. Fisher LSD 不做多重校正。

## 已知边界

- 这是浏览器端轻量工具，不提供复杂缺失数据插补、混合模型、重复测量或多层模型。
- 正态性诊断支持自动选择与手动指定；样本太小时只给出“证据不足”，不会宣称数据正态。
- 精确枚举设置组合数和时间上限；超过限制会明确报告而不是伪装为精确结果。
- 大型结果建议导出后用 R、Python/SciPy、SPSS、Stata、SAS 等成熟工具交叉复核。
