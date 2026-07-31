// 共享常量与基础工具 —— 供 core / parsing / distributions 单向导入，避免模块间循环依赖。
// 原位于 core.mjs，抽取后 core.mjs 保留重导出，对外接口不变。

export const ALPHA = 0.05;
export const MAX_IMPORT_ROWS = 100000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function clampProbability(value) {
  return Math.max(0, Math.min(1, value));
}
