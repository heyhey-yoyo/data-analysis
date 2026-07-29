# 基础统计分析工具 v7（修复版）

一个无需后端、无需构建步骤的纯静态统计分析工具。数据在浏览器本地处理。

## 直接部署

部署根目录必须包含：

```text
index.html
styles.css
src/
_headers        # Cloudflare Pages 可选但推荐
```

### Cloudflare Pages

1. 解压部署包。
2. 将解压后的目录内容上传，或把该目录提交到 Git 仓库。
3. Framework preset 选择 `None`。
4. Build command 留空。
5. Build output directory 使用 `/`（仓库根目录）。

### GitHub Pages / 任意静态服务器

直接发布目录根部即可。所有资源都使用相对路径，支持子路径部署。

本地预览：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080/`。

> 不建议直接双击 `index.html` 通过 `file://` 打开；浏览器可能限制 ES Modules 和 Web Worker。请使用静态服务器。

## 开发与回归测试

只要求 Node.js 20+，没有第三方运行时依赖：

```bash
npm run check
npm test
```

## 已修复的关键问题

- Mann–Whitney U 在 `U == E(U)` 时不再错误施加连续性校正。
- 保留并可切换 Shapiro 系列、Anderson–Darling、D’Agostino–Pearson、Jarque–Bera，以及 Bartlett、Levene、Brown–Forsythe。
- 保留 Tukey–Kramer、Games–Howell、Fisher LSD、两两 t、Dunn 与 Mann–Whitney 事后比较。
- 小数逗号、严格千分位与百分号解析分离，避免静默改写数值。
- 真正缺失值和非法文本分离；“缺失按 0”不会把录入错误改成 0。
- CSV/TSV 分隔符检测理解引号；未闭合引号会阻止导入。
- 学生化极差有限自由度计算不再在 `df=201` 突然切换到无穷自由度。
- 字段概览分别报告非空值、有效数值、非法格式和缺失值。
- 相关分析逐对报告实际使用的样本量 N。
- CSV 导出防止电子表格公式注入。
- 精确枚举区分“组合数过大”“超时”和数值失败。
- 大计算移入 Web Worker；编辑表格使用分页并限制文件大小/行数。
- localStorage 超限或失败时在界面明确提示。
- 支持 UTF-8、GB18030/GBK 与 Big5 文件读取。
- 自动迁移旧版 `basic-stat-demo-v6` 本地状态中的模式名、事后方法和校正设置。

完整说明见 [`FIXES.md`](./FIXES.md)。

## 范围与注意事项

本工具用于探索、教学和快速核对，不替代针对复杂研究设计的专业统计建模。对于临床、监管、科研发表或高风险决策，必须使用成熟统计软件独立复核。
