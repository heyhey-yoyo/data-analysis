# 基础统计分析工具

一个无需后端、无需构建步骤的纯静态网页统计分析工具。所有数据在浏览器本地计算，**不上传服务器**。

## 主要功能

**描述统计**
均值、标准差、中位数、四分位数、峰度、偏度、标准误差。

**正态性检验**
- Shapiro–Francia W′
- Anderson–Darling
- D'Agostino–Pearson
- Jarque–Bera

**方差齐性检验**
- Bartlett（正态数据）
- Levene（均值中心）
- Brown–Forsythe（中位数中心，稳健）

自动推荐在各组正态性诊断均未提示偏离、每组 n ≥ 5 且重复值不多时选择 Bartlett；其他情况选择 Brown–Forsythe。

**参数检验**
- 独立样本 t 检验（含 Welch 校正）
- 单因素方差分析（ANOVA）

**非参数检验**
- Mann–Whitney U 检验
- Kruskal–Wallis 检验

**事后多重比较**
- Tukey–Kramer（等方差）
- Games–Howell（异方差）
- Fisher LSD（受保护）
- Dunn 检验（非参数）
- 两两 Mann–Whitney
- 多重校正：Bonferroni、Holm、Šidák、Benjamini–Hochberg（FDR）

**其他分析方法**
- 相关分析（Pearson / Spearman），逐对报告有效样本量 N
- 精确置换检验（精确枚举）
- Fisher 精确检验与卡方检验
- CSV/TSV 导入（自动检测分隔符，支持 UTF-8、GB18030/GBK、Big5 编码）；分号或 Tab 分列时可保留小数逗号，再按数字解析设置解释。自动识别优先选择跨记录一致的结构；文本含多个同样合理的分隔符时建议从表格软件复制为 TSV，文本内分隔符/换行应按 CSV 规则加引号

## 界面风格

采用暖米白、浅灰与赤陶色，衬线标题与系统无衬线正文保持统一层级，图表与状态提示保留必要的颜色区别。

页眉内容区居中，品牌与标题靠左，操作靠右；页眉位于文档顶部，随页面正常滚走，窄屏允许换行。页眉背景与分隔线铺满页面宽度。

耗时计算显示运行状态，完成、失败或取消后恢复操作；当前主结果表可导出 CSV；输入数据表及附加诊断、事后比较等次级表不包含在该导出中。

## 数据与隐私

所有计算在浏览器本地完成，数据不会上传到任何服务器。录入的数据与分析状态仅保存在你自己浏览器的 `localStorage` 中；清理浏览器网站数据或更换设备可能导致数据丢失，重要结果请及时导出 CSV，并另行保留输入原始文件；结果 CSV 不能恢复整次分析。CSV/TSV 最多支持 100000 行数据（不含表头），有表头与无表头导入均在超限时明确报错。

## 本地运行

对外版本以 GitHub Release 为准；项目没有独立的应用版本常量，发布不更改本地存储格式。

**请勿直接双击 `index.html`** — 直接双击打开无法加载，请用下面的方式启动本地静态服务器：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080/`。

## 部署

页面按内容标识引用样式和完整脚本依赖，缓存复用前会向服务器确认更新，避免升级时混用旧模块。

部署根目录必须包含以下文件：

```text
index.html
styles.css
src/
_headers        # Cloudflare Pages 推荐
```

**Cloudflare Pages**

1. 将仓库内容上传或提交到 Git。
2. Framework preset 选择 `None`。
3. Build command 留空。
4. Build output directory 使用 `/`（仓库根目录）。

**GitHub Pages / 任意静态服务器**

直接发布目录根部即可。所有资源使用相对路径，支持子路径部署。

## 责任边界

本工具用于探索、教学和快速核对，**不替代**针对复杂研究设计的专业统计建模。对于临床、监管、科研发表或高风险决策，必须使用成熟统计软件（SPSS、SAS、R、GraphPad Prism 等）独立复核。

## License

MIT

---

> AI 编程代理请阅读 [AGENTS.md](./AGENTS.md) 了解代码架构、测试与开发约定。

---

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（Claude Code、Cursor、Copilot 等）都必须同步更新本文件与 AGENTS.md。**
>
> - 新增分析方法 → 在 README 的分析方法列表中补充说明
> - 修改统计算法 → 同时更新 AGENTS.md 中的算法描述与 FIXES.md
> - 新增/删除文件 → 更新两份文档中的文件清单
> - 修改部署方式 → 同步更新本文部署章节
> - 保持 **README 面向人类用户**，**AGENTS.md 面向 AI 代理**，两份文件不可互相替代
