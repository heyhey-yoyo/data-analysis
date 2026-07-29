# 基础统计分析工具 v6

纯前端、本地计算的网页版统计分析 Demo。页面视觉延续 YDchenTools / WB-balancer 的米白背景、青绿色主色、白色圆角卡片和三步式流程。

## 本版新增

- 可编辑表格上方增加“清空表格”：清空全部单元格，但保留字段名、列结构与至少 10 行空白输入区。
- 正态性检验支持自动推荐与手动切换：
  - Shapiro 系列：n=3 使用 Shapiro–Wilk 精确形式，n≥4 使用 Shapiro–Francia W′；
  - Anderson–Darling；
  - D’Agostino–Pearson K²；
  - Jarque–Bera。
- 自动正态性规则会参考样本量和重复值比例；手动选择的方法仍会保留，即使当前样本量不足，也会明确显示“不适用”。
- 方差齐性检验支持自动推荐与手动切换：Brown–Forsythe、Levene、Bartlett。
- 多独立组事后检验扩展为：
  - Tukey–Kramer HSD；
  - Games–Howell；
  - Fisher LSD；
  - 两两 pooled t；
  - 两两 Welch t；
  - Dunn 秩检验；
  - 两两 Mann–Whitney U。
- 多重比较校正可选：不校正、Holm、Bonferroni、Šidák、Benjamini–Hochberg FDR。Tukey–Kramer 和 Games–Howell 使用学生化极差分布自带家族错误控制；Fisher LSD 按定义不校正。
- 示例数据改为下拉列表，增加分子生物学实验模拟数据：qPCR 两组/多组、Western blot、ELISA、细胞活力、流式凋亡、CRISPR 和 mRNA–蛋白相关。

## 已有功能

- 类电子表格直接编辑、增删行列、Excel/WPS 多区域粘贴；
- 数据概览、分组汇总、描述统计；
- Pearson 与 Spearman 相关；
- Pearson 卡方与固定边际精确 P；
- 两独立样本等方差 t、Welch t、Mann–Whitney U、精确置换 P；
- 经典单因素 ANOVA、Welch ANOVA、Kruskal–Wallis；
- 自动建议参数/非参数方法，但保留所有可计算结果；
- CSV/TSV 上传、整表粘贴、每组一行快捷输入；
- 复制和导出结果；
- localStorage 本地保存。

## 使用

直接打开 `index.html`，或在当前目录启动本地静态服务器：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000`。

## Cloudflare 部署

将 ZIP 直接上传到 Cloudflare Workers Static Assets / Pages。ZIP 根目录应直接包含：

```text
index.html
styles.css
app.js
README.md
```

不需要 Bindings、数据库或后端运行环境。

## 方法提示

本工具用于基础探索和快速核对。自动推荐不能替代研究设计判断。分子生物学技术重复不等于独立生物学重复；qPCR 通常优先在 ΔCt 或模型尺度上推断，而不是直接对折叠变化做常规 t 检验。重复测量、配对数据、批次效应、多因素设计、协变量调整和复杂缺失机制需要专门模型。
