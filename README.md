# 基础统计分析工具 v2

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
- Levene（中位数，稳健）
- Brown–Forsythe

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
- CSV/TSV 导入（自动检测分隔符，支持 UTF-8、GB18030/GBK、Big5 编码）

## 界面风格

工具主体采用 `ydchen-portfolio` 的米白、浅灰与赤陶色视觉系统，使用衬线标题和扁平化分析卡片；页眉仍保持原有 `YDchen Tools` 结构与样式。

本项目为 Tools 工具类。页眉桌面 72px、手机（≤640px）64px；YDchen 为衬线 20px/600，Tools 为无衬线 20px/300，手机字标 18px；标题 18px/600、手机 16px；分隔线 36px/32px，品牌、分隔线与标题间距 16px/12px。

页眉内容区最大宽度 1280px（含两侧各 16px 内边距），整体居中；品牌和标题靠左，操作区靠右，窄屏换行后仍保持该对齐。品牌页眉在文档顶部正常排布，随页面滚走，不固定或吸顶；表格内部表头、侧边工具和手机底部导航可按功能保留。

正文采用统一系统无衬线字体，默认 16px / 1.6；标题采用 Georgia、Times New Roman、Songti SC、STSong 衬线族。数字与代码可使用 SFMono-Regular、Consolas、Liberation Mono、Microsoft YaHei 等宽族。按钮和输入通常 15px，辅助文字 12–14px，密集科学数据允许有理由的局部调整。页面底色 #f3eee5、正文 #24221f、赤陶强调 #a94f31，柔和底色上的强调文字 #823a25；科学分类色、热图、作品主题与状态色保留必要区分度。

## 数据与隐私

所有计算在浏览器本地完成，数据不会上传到任何服务器。录入的数据与分析状态仅保存在你自己浏览器的 `localStorage` 中；清理浏览器网站数据或更换设备可能导致数据丢失，重要结果请及时导出 CSV 备份。

## 本地运行

**请勿直接双击 `index.html`** — ES Modules 不支持 `file://` 协议。请使用静态服务器：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080/`。

## 部署

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

> AI 编程代理请阅读 [AGENTS.md](./AGENTS.md) 了解完整代码架构与开发约定。

---

## 维护与兼容

精确检验运行期间显示计算中状态并暂停重复提交入口；完成、失败或重置取消后恢复操作。

统一工具页眉、正文字体与辅助文字对比度，保留数值列、表头及统计状态语义。浏览器验证示例计算、Worker 成功/取消/错误后的按钮恢复、数据重载及 CSV 下载。

检查命令与技术约束见 [AGENTS.md](./AGENTS.md)。上述浏览器验证描述对应 2026-09-13 的维护验收；后续修改仍须重新验证。

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（Claude Code、Cursor、Copilot 等）都必须同步更新本文件与 AGENTS.md。**
>
> - 新增分析方法 → 在 README 的分析方法列表中补充说明
> - 修改统计算法 → 同时更新 AGENTS.md 中的算法描述与 FIXES.md
> - 新增/删除文件 → 更新两份文档中的文件清单
> - 修改部署方式 → 同步更新本文部署章节
> - 保持 **README 面向人类用户**，**AGENTS.md 面向 AI 代理**，两份文件不可互相替代
