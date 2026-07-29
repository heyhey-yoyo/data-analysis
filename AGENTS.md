# AGENTS.md

面向 AI 编程代理的项目说明。阅读本文件即可了解项目全貌，无需额外背景知识。

## 项目概览

**基础统计分析工具 v7（修复版）**——纯前端、浏览器本地计算的网页版统计分析工具。无后端、无构建步骤、无任何第三方依赖。v7 从 v6 的单文件结构重构为 ES Modules：统计核心（`src/core.mjs`）与 UI（`src/app.mjs`）分离，精确枚举计算放到 Web Worker（`src/worker.mjs`）。相对 v6 的修复清单见 `FIXES.md`（含 Mann–Whitney 连续性校正、CSV 解析、公式注入防护、文件大小限制等 18 项）。

页面流程：选择分析 → 录入数据（CSV 上传 / 粘贴 / 内置示例）→ 查看结果。视觉风格延续 YDchenTools / WB-balancer：米白背景、青绿色主色（`#0d9488`）、白色圆角卡片。

**语言约定**：UI 文案、README、代码内注释与用户可见字符串均为简体中文（`lang="zh-CN"`）。修改代码时请继续使用中文撰写注释和用户可见文本。

## 仓库结构

无配置文件（没有 `package.json`、`.gitignore` 等）：

- `index.html`（230 行）：全部页面结构，通过 `<script type="module" src="./src/app.mjs">` 加载入口。
- `styles.css`（147 行）：全部样式。
- `src/core.mjs`（1176 行）：**纯函数统计核心**——解析（`parseNumeric`、`detectDelimiter`、`parseDelimited`）、描述统计、分布函数（手写数值实现）、正态性/方差齐性/参数/非参数检验、事后比较与 `adjustPValues` 多重校正、精确枚举（`exactTwoSamplePermutation`、`fixedMarginExact`）、CSV 导出（`safeCsvCell` 防公式注入）。**不操作 DOM**，可直接被 Node.js 导入做回归测试。
- `src/app.mjs`（1170 行）：UI、状态管理、导入导出、结果渲染。localStorage 键 `'basic-stat-tool-v7'`，并读取旧键 `'basic-stat-demo-v6'` 做迁移（迁移旧分析模式、`games/lsd/mann`、`postHocCorrection` 等枚举值）。
- `src/worker.mjs`（18 行）：Web Worker，承接 `two-sample-permutation` 与 `fixed-margin-exact` 两种后台精确枚举任务。
- `_headers`：Cloudflare Pages 安全响应头（CSP 为 `default-src 'self'`、`connect-src 'none'` 等，注意不要引入与之冲突的远程资源或 inline 脚本）。
- `FIXES.md`：v6→v7 修复矩阵与回归场景清单。
- `README.md`：面向用户的部署与使用说明，改动功能时同步更新。
- `data-analysis-v7-deploy.zip`：部署打包产物，一般不需要修改。

## 运行与构建

没有构建流程。注意 **ES Modules 不能用 `file://` 直接打开**，必须起本地静态服务器：

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000
```

## 测试与验证

项目仓库内**没有随附测试文件**（`FIXES.md` 提到的 `core.test.mjs` 未包含在部署包中）。验证修改的方式：

- 语法检查：`node --check src/core.mjs && node --check src/app.mjs && node --check src/worker.mjs`。
- 统计逻辑回归：`core.mjs` 全部为纯函数导出，可写 Node 脚本直接 `import` 后断言结果。
- 浏览器手动验证：载入内置示例数据，确认结果表与诊断渲染正常；重点核对 `FIXES.md` 列出的 14 个回归场景。

## 代码组织与风格约定

- `core.mjs` 纯函数优先，**统计函数不直接操作 DOM**；`app.mjs` 才读写 DOM。
- 2 空格缩进，单引号字符串，`const` 优先。
- 渲染一律使用 `textContent` / `createElement`，**不用 `innerHTML` 拼接用户数据**（v7 中已无 innerHTML 用法，保持这一约定）。
- 导入限制：`MAX_FILE_BYTES = 10 MiB`、`MAX_IMPORT_ROWS = 100000`，大表格分页显示；超限要给出明确错误而不是静默截断。
- 解析语义：区分 `number / missing / invalid` 三类；支持小数逗号；CSV 解析 quote-aware，未闭合引号返回 fatal error。
- 数值无法计算时返回 `null` 并显示 `—`，不要抛异常；精确枚举超限要明确报告（`too-many-combinations / timeout / numerical-failure`），不伪装为精确结果。
- 中文全角/半角标点沿用现有习惯。

## 安全与隐私考虑

- **所有计算在浏览器本地完成，数据不上传**——这是产品的核心承诺（CSP 中 `connect-src 'none'` 强制保证），不要引入任何网络请求、分析 SDK 或远程资源。
- CSV 导出走 `safeCsvCell()`：危险前缀（`=`、`+`、`-`、`@` 等）单元格前置单引号，防公式注入。
- localStorage 仅保存用户自己的数据，有大小阈值与异常捕获，失败时在界面告警。
- 上传文件用 `TextDecoder` 解码，支持 UTF-8、GB18030、Big5，避免中文乱码。

## 部署

静态托管，目标平台 Cloudflare Pages：Framework preset 选 `None`、Build command 留空、输出目录 `/`（仓库根目录）。部署根目录必须包含 `index.html`、`styles.css`、`src/`、`_headers`（后两个对 Pages 分别必需和推荐）。所有资源相对路径，支持子路径部署，也可直接发布到 GitHub Pages 等任意静态服务器。
