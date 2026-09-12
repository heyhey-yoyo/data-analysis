# 基础统计分析工具 v2 — 项目说明（供 AI 编程代理阅读）

面向 AI 编程代理的项目说明。阅读本文件即可了解项目全貌，无需额外背景知识。

## 项目概览

**基础统计分析工具 v2**——纯前端、浏览器本地计算的网页版统计分析工具。无后端、无构建步骤、无任何第三方依赖。v2 从 v1 的单文件结构重构为 ES Modules：统计核心（`src/core.mjs`）与 UI（`src/app.mjs`）分离，精确枚举计算放到 Web Worker（`src/worker.mjs`）。相对 v1 的修复清单见 `FIXES.md`（含 Mann–Whitney 连续性校正、CSV 解析、公式注入防护、文件大小限制等 18 项）。

页面流程：选择分析 → 录入数据（CSV 上传 / 粘贴 / 内置示例）→ 查看结果。工具主体采用 `ydchen-portfolio` 的米白 / 浅灰 / 赤陶色（`#a94f31`）视觉系统；`YDchen Tools` 页眉遵循本文件的工具类基准。

**语言约定**：UI 文案、README、代码内注释与用户可见字符串均为简体中文（`lang="zh-CN"`）。修改代码时请继续使用中文撰写注释和用户可见文本。

## 技术栈与运行架构

- 无 `package.json`，无构建步骤；有 `.gitignore`（忽略 `.claude/settings.local.json`）。
- `index.html`：全部页面结构，通过 `<script type="module" src="./src/app.mjs">` 加载入口。
- `styles.css`：全部样式。
- `src/core.mjs`：**纯函数统计核心**——描述统计、秩与相关、正态性/方差齐性/参数/非参数检验、事后比较与 `adjustPValues` 多重校正、精确枚举（`exactTwoSamplePermutation`、`fixedMarginExact`）、CSV 导出（`safeCsvCell` 防公式注入）。**不操作 DOM**，可直接被 Node.js 导入做回归测试。数字解析、概率分布与常量位于 `src/parsing.mjs`、`src/distributions.mjs`、`src/constants.mjs`，本文件重导出以保持对外接口不变。
- `src/constants.mjs`：共享常量与基础工具——`ALPHA`、`MAX_IMPORT_ROWS`、`MAX_FILE_BYTES`、`clampProbability`。parsing / distributions 单向依赖它，避免模块间循环依赖；core.mjs 重导出保持对外接口不变。
- `src/parsing.mjs`：数字解析（`parseNumeric`）、分隔符检测（`detectDelimiter`）、CSV/TSV 解析（`parseDelimited`）、字段画像（`columnProfile`、`extractNumeric`）。自包含模块，通过 `core.mjs` 重导出。
- `src/distributions.mjs`：概率分布与数值积分——`logGamma`、`regularizedGammaQ`/`Beta`、`chiSquareSurvival`、`fSurvival`、`tTwoSidedP`、`erf`、`normalCdf`、`inverseNormalCdf`、`normalTwoSidedP`、学生化极差分布（`studentizedRangeCdf`）。纯数学，通过 `core.mjs` 重导出。
- `src/app.mjs`：UI、状态管理、导入导出、结果渲染。localStorage 键 `'basic-stat-tool-v7'`，并读取旧键 `'basic-stat-demo-v6'` 做迁移（迁移旧分析模式、`games/lsd/mann`、`postHocCorrection` 等枚举值）。
- `src/worker.mjs`：Web Worker，承接 `two-sample-permutation` 与 `fixed-margin-exact` 两种后台精确枚举任务。
- `src/data/grouped-parser.mjs`：分组文本解析 `tokenizeGroupBody`，处理 `组名: 1, 2, 3` 格式的数值拆分与歧义检测。
- `_headers`：Cloudflare Pages 安全响应头（CSP 为 `default-src 'self'`、`connect-src 'none'` 等，注意不要引入与之冲突的远程资源或 inline 脚本）。
- `FIXES.md`：修复矩阵与回归场景清单。
- `test/core.test.mjs`：统计核心回归测试，`node test/core.test.mjs` 运行（无需部署）。
- `test/grouped-parser.test.mjs`：分组文本解析回归测试，`node test/grouped-parser.test.mjs` 运行（无需部署）。

## 项目结构

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面结构，加载 `src/app.mjs` |
| `styles.css` | 全部样式 |
| `src/core.mjs` | 纯函数统计核心，不操作 DOM |
| `src/constants.mjs` | 共享常量与基础工具 |
| `src/parsing.mjs` | 数字解析与 CSV/TSV 解析 |
| `src/distributions.mjs` | 概率分布与数值积分 |
| `src/app.mjs` | UI、状态管理与导入导出 |
| `src/worker.mjs` | Web Worker 精确枚举 |
| `src/data/grouped-parser.mjs` | 分组文本解析 |
| `assets/project-mark.svg` | 项目专属标志（用于 favicon） |
| `_headers` | Cloudflare Pages 安全响应头 |
| `FIXES.md` | v1→v2 修复矩阵与回归场景清单 |
| `test/core.test.mjs` | 统计核心回归测试 |
| `test/grouped-parser.test.mjs` | 分组文本解析回归测试 |
| `LICENSE` | MIT 许可证 |
| `.gitignore` | Git 忽略规则 |

## 运行与构建

没有构建流程。注意 **ES Modules 不能用 `file://` 直接打开**，必须起本地静态服务器：

```bash
python -m http.server 8080
# 然后访问 http://localhost:8080
```

## 测试

- 回归测试：`node test/core.test.mjs` + `node test/grouped-parser.test.mjs`——覆盖 studentized range 连续性（df=200/201、审计回归点、k=2 对照 t 分布、k=30 对照蒙特卡洛）、Mann–Whitney 中心点校正、protected Fisher LSD 前置条件、分组文本解析歧义检测。修改统计计算后必须运行。
- 语法检查：`node --check src/core.mjs && node --check src/parsing.mjs && node --check src/distributions.mjs && node --check src/constants.mjs && node --check src/app.mjs && node --check src/worker.mjs && node --check src/data/grouped-parser.mjs`。
- 统计逻辑回归：`core.mjs` 全部为纯函数导出，可写 Node 脚本直接 `import` 后断言结果。
- 浏览器手动验证：载入内置示例数据，确认结果表与诊断渲染正常；重点核对 `FIXES.md` 列出的 14 个回归场景。

发布检查：

```bash
node test/core.test.mjs
node test/grouped-parser.test.mjs
node --check src/app.mjs
```

## 代码组织与风格约定

- `core.mjs` 纯函数优先，**统计函数不直接操作 DOM**；`app.mjs` 才读写 DOM。
- 2 空格缩进，单引号字符串，`const` 优先。
- 渲染一律使用 `textContent` / `createElement`，**不用 `innerHTML` 拼接用户数据**（v2 中已无 innerHTML 用法，保持这一约定）。
- 导入限制：`MAX_FILE_BYTES = 10 MiB`、`MAX_IMPORT_ROWS = 100000`，大表格分页显示；超限要给出明确错误而不是静默截断。
- 解析语义：区分 `number / missing / invalid` 三类；支持小数逗号；CSV 解析 quote-aware，未闭合引号返回 fatal error。
- 数值无法计算时返回 `null` 并显示 `—`，不要抛异常；精确枚举超限要明确报告（`too-many-combinations / timeout / numerical-failure`），不伪装为精确结果。
- 中文全角/半角标点沿用现有习惯。

### 品牌与排版

本项目为 Tools 工具类。页眉桌面 72px、手机（≤640px）64px；YDchen 为衬线 20px/600，Tools 为无衬线 20px/300，手机字标 18px；标题 18px/600、手机 16px；分隔线 36px/32px，品牌、分隔线与标题间距 16px/12px。

页眉背景和底部分隔线横跨页面可用宽度，内容区最大宽度 1280px（含两侧各 16px 内边距），整体居中；品牌和标题靠左，操作区靠右，窄屏换行后仍保持该对齐。品牌页眉在文档顶部正常排布，随页面滚走，不固定或吸顶；表格内部表头、侧边工具和手机底部导航可按功能保留。

正文采用统一系统无衬线字体，默认 16px / 1.6；标题采用 Georgia、Times New Roman、Songti SC、STSong 衬线族。数字与代码可使用 SFMono-Regular、Consolas、Liberation Mono、Microsoft YaHei 等宽族。按钮和输入通常 15px，辅助文字 12–14px，密集科学数据允许有理由的局部调整。页面底色 #f3eee5、正文 #24221f、赤陶强调 #a94f31，柔和底色上的强调文字 #823a25；科学分类色、热图、作品主题与状态色保留必要区分度。

主样式保留一个顶层 `:root`，条件规则和深色画布局部令牌独立维护，避免叠加重复主题或末尾覆盖层。修改视觉后核对实际渲染字体、字号、间距、对比度和操作可达性；至少检查 1440、820、390px，涉及断点时补查两侧宽度，涉及画布或存储时补查交互。构建、单测、本地浏览器和线上部署分别记录；发布后禁用缓存/硬刷新，并核对实际资源版本。

### 交互与数据约束

runHeavyTask 统一管理 aria-busy 和三个提交按钮；完成、异常、通信失败、取消均释放忙碌态，旧 Worker 消息不能释放新任务。CSV 字段保持公式防护，下载 URL 延迟回收。

## 部署

静态托管，目标平台 Cloudflare Pages：Framework preset 选 `None`、Build command 留空、输出目录 `/`（仓库根目录）。部署根目录必须包含 `index.html`、`styles.css`、`src/`、`_headers`（后两个对 Pages 分别必需和推荐）。所有资源相对路径，支持子路径部署，也可直接发布到 GitHub Pages 等任意静态服务器。

## 安全与数据注意事项

- **所有计算在浏览器本地完成，数据不上传**——这是产品的核心承诺（CSP 中 `connect-src 'none'` 强制保证），不要引入任何网络请求、分析 SDK 或远程资源。
- CSV 导出走 `safeCsvCell()`：危险前缀（`=`、`+`、`-`、`@` 等）单元格前置单引号，防公式注入。
- localStorage 仅保存用户自己的数据，有大小阈值与异常捕获，失败时在界面告警。
- 上传文件用 `TextDecoder` 解码，支持 UTF-8、GB18030、Big5，避免中文乱码。

## 标志维护约定

`YDchen Tools` 文字页眉是受保护的品牌区域，必须保持原结构、尺寸与样式；项目专属统一标志 `assets/project-mark.svg` 仅用于 favicon 或现有非页眉标志，不得改变页面布局。

## AI 维护提醒

> **⚠️ 任何修改此项目的 AI 代理（包括未来的你自己）都必须遵守：**
>
> - **修改代码后必须同步更新本 AGENTS.md 与 README.md** — 新增文件、架构变更、功能增删、部署方式变更都需要在两份文档中体现
> - README.md 面向**人类用户**（功能介绍、运行方法、部署步骤），AGENTS.md 面向 **AI 代理**（架构、代码组织、测试策略、开发约定）
> - 两份文件**不可互相替代**，各有所长
> - 项目的实际文件结构必须与 AGENTS.md 中列出的文件清单保持一致
