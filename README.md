# 基础统计分析工具 v7

一个无需后端、无需构建步骤的纯静态网页统计分析工具。所有数据在浏览器本地计算，**不上传服务器**。

## 主要分析方法

**描述统计**
均值、标准差、中位数、四分位数、峰度、偏度、标准误差与置信区间。

**正态性检验**
- Shapiro–Wilk
- Anderson–Darling
- D'Agostino–Pearson
- Jarque–Bera

**方差齐性检验**
- Bartlett（正态数据）
- Levene（中位数，稳健）
- Brown–Forsythe

**参数检验**
- 独立样本 t 检验（含 Welch 校正）
- 配对 t 检验
- 单因素方差分析（ANOVA）

**非参数检验**
- Mann–Whitney U 检验
- Wilcoxon 符号秩检验
- Kruskal–Wallis 检验
- Friedman 检验

**事后多重比较**
- Tukey–Kramer（等方差）
- Games–Howell（异方差）
- Fisher LSD（受保护）
- Dunn 检验（非参数）
- 两两 Mann–Whitney
- 多重校正：Bonferroni、Holm、Benjamini–Hochberg（FDR）

**其他分析方法**
- 相关分析（Pearson / Spearman / Kendall），逐对报告有效样本量 N
- 精确置换检验（枚举 / 蒙特卡洛采样）
- Fisher 精确检验与卡方检验
- CSV/TSV 导入（自动检测分隔符，支持 UTF-8、GB18030/GBK、Big5 编码）

## 部署

部署根目录必须包含以下文件：

```
index.html
styles.css
src/
_headers        # Cloudflare Pages 推荐
```

### Cloudflare Pages

1. 将仓库内容上传或提交到 Git。
2. Framework preset 选择 `None`。
3. Build command 留空。
4. Build output directory 使用 `/`（仓库根目录）。

### GitHub Pages / 任意静态服务器

直接发布目录根部即可。所有资源使用相对路径，支持子路径部署。

## 本地运行

**请勿直接双击 `index.html`** — ES Modules 不支持 `file://` 协议。请使用静态服务器：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080/`。

## 测试

```bash
node test/core.test.mjs      # 统计核心回归测试
node --check src/core.mjs    # 语法检查
node --check src/app.mjs
node --check src/worker.mjs
```

## 范围与注意事项

本工具用于探索、教学和快速核对，**不替代**针对复杂研究设计的专业统计建模。对于临床、监管、科研发表或高风险决策，必须使用成熟统计软件（SPSS、SAS、R、GraphPad Prism 等）独立复核。

---

> AI 编程代理请阅读 [AGENTS.md](./AGENTS.md) 了解完整代码架构与开发约定。

---

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（Claude Code、Cursor、Copilot 等）都必须同步更新本文件与 AGENTS.md。**
>
> - 新增分析方法 → 在 README 的分析方法列表中补充说明
> - 修改统计算法 → 同时更新 AGENTS.md 中的算法描述与 FIXES.md
> - 新增/删除文件 → 更新两份文档中的文件清单
> - 修改部署方式 → 同步更新本文部署章节
> - 保持 **README 面向人类用户**，**AGENTS.md 面向 AI 代理**，两份文件不可互相替代
