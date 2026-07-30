import {
  ALPHA,
  MAX_FILE_BYTES,
  parseNumeric,
  parseDelimited,
  columnProfile,
  stats,
  pearsonCorrelation,
  spearmanCorrelation,
  runNormalityTest,
  runVarianceTest,
  pooledTTest,
  welchTTest,
  mannWhitney,
  oneWayAnova,
  welchAnova,
  kruskalWallis,
  postHocComparisons,
  contingencyStatistics,
  toCsv,
} from './core.mjs';

const STORAGE_KEY = 'basic-stat-tool-v7';
const LEGACY_STORAGE_KEY = 'basic-stat-demo-v6';
const PAGE_SIZE = 100;
const MAX_LOCAL_STORAGE_CHARS = 2_500_000;

const elements = Object.fromEntries([
  'analysisMode', 'valueColumn', 'groupColumn', 'categoryColumnA', 'categoryColumnB',
  'correlationMethod', 'normalityMethod', 'varianceMethod', 'postHocMethod', 'correctionMethod', 'missingMode',
  'decimalSeparator', 'percentMode', 'fileEncoding', 'fileInput', 'dropZone',
  'exampleSelect', 'loadExampleBtn', 'pasteArea', 'parseTableBtn', 'parseGroupsBtn',
  'clearInputBtn', 'newTableBtn', 'clearTableBtn', 'addRowBtn', 'addColumnBtn',
  'deleteRowBtn', 'deleteColumnBtn', 'prevPageBtn', 'nextPageBtn', 'pageStatus',
  'editorStatus', 'dataHead', 'dataBody', 'modeNote', 'alerts', 'recommendation',
  'summaryCards', 'qualitySection', 'qualityHead', 'qualityBody', 'mainResultSection',
  'mainResultTitle', 'mainResultMeta', 'resultHead', 'resultBody', 'secondarySection',
  'secondaryTitle', 'secondaryMeta', 'secondaryHead', 'secondaryBody', 'copyBtn',
  'exportBtn', 'resetBtn', 'valueField', 'groupField', 'categoryAField', 'categoryBField',
  'correlationField', 'normalityField', 'varianceField', 'postHocField', 'correctionField', 'missingField',
].map((id) => [id, document.getElementById(id)]));

function emptyRows(count, width) {
  return Array.from({ length: count }, () => Array.from({ length: width }, () => ''));
}

function defaultState() {
  return {
    analysisMode: 'overview',
    valueColumn: '数值',
    groupColumn: '组别',
    categoryColumnA: '组别',
    categoryColumnB: '结局',
    correlationMethod: 'auto',
    normalityMethod: 'auto',
    varianceMethod: 'auto',
    postHocMethod: 'auto',
    correctionMethod: 'holm',
    missingMode: 'ignore',
    decimalSeparator: 'auto',
    percentMode: 'number',
    headers: ['组别', '数值'],
    rows: emptyRows(10, 2),
  };
}

let state = defaultState();
let selectedRow = null;
let selectedColumn = null;
let page = 0;
let analysisTimer = null;
let saveTimer = null;
let analysisVersion = 0;
let storageWarning = '';
let lastSelectorSignature = '';
let latestResult = { headers: [], rows: [] };

let currentWorker = null;
let currentWorkerReject = null;
let currentWorkerTaskId = 0;

function cancelCurrentHeavyTask() {
  if (!currentWorker) return;
  const oldReject = currentWorkerReject;
  currentWorker.terminate();
  currentWorker = null;
  currentWorkerReject = null;
  if (oldReject) {
    oldReject(new DOMException('任务已取消', 'AbortError'));
  }
}

function runHeavyTask(task, payload) {
  // 取消已有的重任务
  cancelCurrentHeavyTask();

  return new Promise((resolve, reject) => {
    let worker = null;
    try {
      worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(new Error('Worker 创建失败'));
      return;
    }

    currentWorker = worker;
    currentWorkerReject = reject;
    const id = ++currentWorkerTaskId;

    worker.addEventListener('message', (event) => {
      if (event.data?.id !== id) return;
      worker.terminate();
      if (currentWorker === worker) { currentWorker = null; currentWorkerReject = null; }
      if (event.data.ok) resolve(event.data.result);
      else reject(new Error(event.data.error || 'Worker 计算失败'));
    });

    worker.addEventListener('error', () => {
      worker.terminate();
      if (currentWorker === worker) { currentWorker = null; currentWorkerReject = null; }
      reject(new Error('Worker 不可用'));
    });

    try {
      worker.postMessage({ id, task, payload });
    } catch (e) {
      worker.terminate();
      if (currentWorker === worker) { currentWorker = null; currentWorkerReject = null; }
      reject(new Error('Worker 通信失败'));
    }
  });
}

function numberOptions() {
  return { decimalSeparator: state.decimalSeparator, percentMode: state.percentMode };
}

function normalizeState(candidate) {
  const base = defaultState();
  const migrated = { ...(candidate || {}) };
  const modeMap = { group: 'group-summary', independent: 'two-group', anova: 'multi-group', chisquare: 'categorical' };
  const postHocMap = { games: 'games-howell', lsd: 'fisher-lsd', mann: 'mann-whitney' };
  if (modeMap[migrated.analysisMode]) migrated.analysisMode = modeMap[migrated.analysisMode];
  if (postHocMap[migrated.postHocMethod]) migrated.postHocMethod = postHocMap[migrated.postHocMethod];
  if (!migrated.correctionMethod && migrated.postHocCorrection) migrated.correctionMethod = migrated.postHocCorrection;
  if (migrated.correctionMethod === 'auto') migrated.correctionMethod = 'holm';
  const merged = { ...base, ...migrated };
  const validModes = new Set(['overview', 'descriptive', 'group-summary', 'correlation', 'categorical', 'two-group', 'multi-group']);
  const validNormality = new Set(['auto', 'shapiro', 'anderson', 'dagostino', 'jarque']);
  const validVariance = new Set(['auto', 'brown', 'levene', 'bartlett']);
  const validPostHoc = new Set(['auto', 'tukey', 'games-howell', 'fisher-lsd', 'pooled', 'welch', 'dunn', 'mann-whitney']);
  const validCorrection = new Set(['holm', 'bonferroni', 'sidak', 'bh', 'none']);
  if (!validModes.has(merged.analysisMode)) merged.analysisMode = base.analysisMode;
  if (!validNormality.has(merged.normalityMethod)) merged.normalityMethod = base.normalityMethod;
  if (!validVariance.has(merged.varianceMethod)) merged.varianceMethod = base.varianceMethod;
  if (!validPostHoc.has(merged.postHocMethod)) merged.postHocMethod = base.postHocMethod;
  if (!validCorrection.has(merged.correctionMethod)) merged.correctionMethod = base.correctionMethod;
  if (!Array.isArray(merged.headers) || !merged.headers.length || !Array.isArray(merged.rows)) return base;
  merged.headers = merged.headers.map((value, index) => String(value || `字段 ${index + 1}`));
  merged.rows = merged.rows.slice(0, 100000).map((row) => merged.headers.map((_, index) => String(row?.[index] ?? '')));
  if (!merged.rows.length) merged.rows = emptyRows(10, merged.headers.length);
  return merged;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) state = normalizeState(JSON.parse(raw));
  } catch (error) {
    storageWarning = `无法读取浏览器本地数据：${error.message}`;
    state = defaultState();
  }
}

function saveState() {
  try {
    const serialized = JSON.stringify(state);
    if (serialized.length > MAX_LOCAL_STORAGE_CHARS) {
      storageWarning = '当前数据较大，已停止自动保存到 localStorage；请导出文件以免丢失。';
      updateEditorStatus();
      return false;
    }
    localStorage.setItem(STORAGE_KEY, serialized);
    storageWarning = '';
    updateEditorStatus();
    return true;
  } catch (error) {
    storageWarning = `本地保存失败：${error.name || error.message}。请导出数据备份。`;
    updateEditorStatus();
    return false;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 350);
}

function formatNumber(value, decimals = 4) {
  if (!Number.isFinite(value)) return '—';
  if (value !== 0 && (Math.abs(value) >= 1e7 || Math.abs(value) < 1e-5)) return value.toExponential(4);
  return value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
}

function formatP(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 0.0001) return '< 0.0001';
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function flattenCell(value) {
  return value && typeof value === 'object' && 'text' in value ? value.text : value;
}

function makeCell(text, className = '') {
  return { text: String(text ?? ''), className };
}

function pCell(value) {
  return makeCell(formatP(value), Number.isFinite(value) && value < ALPHA ? 'significant' : 'not-significant');
}

function renderTable(headElement, bodyElement, headers, rows) {
  headElement.replaceChildren();
  bodyElement.replaceChildren();
  const headRow = document.createElement('tr');
  headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    headRow.appendChild(th);
  });
  headElement.appendChild(headRow);
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((rawCell) => {
      const cell = flattenCell(rawCell);
      const td = document.createElement('td');
      td.textContent = String(cell ?? '');
      if (rawCell && typeof rawCell === 'object' && rawCell.className) td.className = rawCell.className;
      tr.appendChild(td);
    });
    bodyElement.appendChild(tr);
  });
}

function setMainResult(title, meta, headers, rows) {
  elements.mainResultTitle.textContent = title;
  elements.mainResultMeta.textContent = meta || '';
  renderTable(elements.resultHead, elements.resultBody, headers, rows);
  latestResult = { headers, rows: rows.map((row) => row.map(flattenCell)) };
}

function setSecondary(title, meta, headers, rows) {
  if (!rows?.length) {
    elements.secondarySection.classList.add('hidden');
    elements.secondaryHead.replaceChildren();
    elements.secondaryBody.replaceChildren();
    return;
  }
  elements.secondarySection.classList.remove('hidden');
  elements.secondaryTitle.textContent = title;
  elements.secondaryMeta.textContent = meta || '';
  renderTable(elements.secondaryHead, elements.secondaryBody, headers, rows);
}

function setSummaryCards(cards) {
  elements.summaryCards.replaceChildren();
  cards.forEach(({ value, label }) => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    const span = document.createElement('span');
    span.textContent = label;
    card.append(strong, span);
    elements.summaryCards.appendChild(card);
  });
}

function setAlerts(alerts) {
  elements.alerts.replaceChildren();
  alerts.forEach(({ type = 'warning', text }) => {
    const div = document.createElement('div');
    div.className = `alert ${type}`;
    div.textContent = text;
    elements.alerts.appendChild(div);
  });
}

function setRecommendation(text) {
  elements.recommendation.textContent = text || '';
  elements.recommendation.classList.toggle('visible', Boolean(text));
}

function getColumnValues(header) {
  const index = state.headers.indexOf(header);
  return index < 0 ? [] : state.rows.map((row) => row[index] ?? '');
}

function profiles() {
  return state.headers.map((header) => ({ header, ...columnProfile(getColumnValues(header), numberOptions()) }));
}

function renderQuality(currentProfiles) {
  const headers = ['字段', '推断类型', '总行数', '非空', '有效数值', '无效格式', '缺失', '唯一值'];
  const rows = currentProfiles.map((profile) => [
    profile.header,
    profile.isNumeric ? '数值' : '文本',
    profile.total,
    profile.nonEmpty,
    profile.validNumeric,
    profile.isNumeric ? (profile.invalid ? makeCell(profile.invalid, 'significant') : 0) : '—',
    profile.missing,
    profile.unique,
  ]);
  renderTable(elements.qualityHead, elements.qualityBody, headers, rows);
}

function uniqueHeader(proposed, columnIndex) {
  const base = String(proposed).trim() || `字段 ${columnIndex + 1}`;
  let name = base;
  let suffix = 2;
  while (state.headers.some((header, index) => index !== columnIndex && header === name)) {
    name = `${base} (${suffix})`;
    suffix += 1;
  }
  return name;
}

function pageCount() {
  return Math.max(1, Math.ceil(state.rows.length / PAGE_SIZE));
}

function renderEditor() {
  page = Math.max(0, Math.min(page, pageCount() - 1));
  elements.dataHead.replaceChildren();
  elements.dataBody.replaceChildren();
  const headerRow = document.createElement('tr');
  const numberHeader = document.createElement('th');
  numberHeader.textContent = '#';
  headerRow.appendChild(numberHeader);
  state.headers.forEach((header, columnIndex) => {
    const th = document.createElement('th');
    th.dataset.column = String(columnIndex);
    if (selectedColumn === columnIndex) th.classList.add('selected');
    const input = document.createElement('input');
    input.className = 'header-input';
    input.value = header;
    input.setAttribute('aria-label', `字段 ${columnIndex + 1} 名称`);
    input.addEventListener('focus', () => {
      selectedColumn = columnIndex;
      elements.dataHead.querySelectorAll('th[data-column]').forEach((node) => {
        node.classList.toggle('selected', Number(node.dataset.column) === columnIndex);
      });
      updateEditorStatus();
    });
    input.addEventListener('change', () => {
      const oldName = state.headers[columnIndex];
      const newName = uniqueHeader(input.value, columnIndex);
      state.headers[columnIndex] = newName;
      ['valueColumn', 'groupColumn', 'categoryColumnA', 'categoryColumnB'].forEach((key) => {
        if (state[key] === oldName) state[key] = newName;
      });
      refreshSelectors();
      renderEditor();
      scheduleSave();
      scheduleAnalysis();
    });
    th.appendChild(input);
    headerRow.appendChild(th);
  });
  elements.dataHead.appendChild(headerRow);

  const start = page * PAGE_SIZE;
  const end = Math.min(state.rows.length, start + PAGE_SIZE);
  for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
    const tr = document.createElement('tr');
    const rowNumber = document.createElement('td');
    rowNumber.className = 'row-number';
    if (selectedRow === rowIndex) rowNumber.classList.add('selected');
    rowNumber.textContent = String(rowIndex + 1);
    rowNumber.addEventListener('click', () => { selectedRow = rowIndex; renderEditor(); });
    tr.appendChild(rowNumber);
    state.headers.forEach((_, columnIndex) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = state.rows[rowIndex]?.[columnIndex] ?? '';
      input.dataset.row = String(rowIndex);
      input.dataset.column = String(columnIndex);
      input.setAttribute('aria-label', `第 ${rowIndex + 1} 行，第 ${columnIndex + 1} 列`);
      input.addEventListener('focus', () => { selectedRow = rowIndex; selectedColumn = columnIndex; });
      input.addEventListener('input', () => {
        state.rows[rowIndex][columnIndex] = input.value;
        scheduleSave();
        scheduleAnalysis();
      });
      input.addEventListener('paste', (event) => handleCellPaste(event, rowIndex, columnIndex));
      td.appendChild(input);
      tr.appendChild(td);
    });
    elements.dataBody.appendChild(tr);
  }
  elements.pageStatus.textContent = `第 ${page + 1} / ${pageCount()} 页 · ${state.rows.length.toLocaleString()} 行`;
  elements.prevPageBtn.disabled = page <= 0;
  elements.nextPageBtn.disabled = page >= pageCount() - 1;
  updateEditorStatus();
}

function handleCellPaste(event, startRow, startColumn) {
  const text = event.clipboardData?.getData('text/plain');
  if (!text || (!text.includes('\n') && !text.includes('\t'))) return;
  event.preventDefault();
  const parsed = parseDelimited(text, { header: false });
  if (parsed.errors.some((error) => error.fatal)) {
    setEditorStatus(parsed.errors.find((error) => error.fatal).message, 'error');
    return;
  }
  const matrix = parsed.rows;
  const neededColumns = startColumn + Math.max(...matrix.map((row) => row.length));
  while (state.headers.length < neededColumns) {
    state.headers.push(uniqueHeader(`字段 ${state.headers.length + 1}`, state.headers.length));
    state.rows.forEach((row) => row.push(''));
  }
  const neededRows = startRow + matrix.length;
  while (state.rows.length < neededRows) state.rows.push(Array(state.headers.length).fill(''));
  matrix.forEach((row, rowOffset) => row.forEach((value, columnOffset) => {
    state.rows[startRow + rowOffset][startColumn + columnOffset] = value;
  }));
  page = Math.floor(startRow / PAGE_SIZE);
  refreshSelectors();
  renderEditor();
  scheduleSave();
  scheduleAnalysis();
}

function setEditorStatus(message, type = '') {
  elements.editorStatus.textContent = message || '';
  elements.editorStatus.className = `status-line${type ? ` ${type}` : ''}`;
}

function updateEditorStatus() {
  if (storageWarning) {
    setEditorStatus(storageWarning, 'warning');
    return;
  }
  const selected = selectedRow !== null || selectedColumn !== null
    ? `所选：${selectedRow !== null ? `第 ${selectedRow + 1} 行` : ''}${selectedRow !== null && selectedColumn !== null ? '，' : ''}${selectedColumn !== null ? `第 ${selectedColumn + 1} 列` : ''}`
    : '点击行号或字段名后可删除对应行/列。';
  setEditorStatus(selected);
}

function fillSelect(select, options, current) {
  select.replaceChildren();
  options.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
  if (options.includes(current)) select.value = current;
}

function refreshSelectors(cachedProfiles) {
  const currentProfiles = cachedProfiles || profiles();
  const numericHeaders = currentProfiles.filter((profile) => profile.eligibleForNumericAnalysis).map((profile) => profile.header);
  const valueOptions = numericHeaders.length ? numericHeaders : [];
  if (!valueOptions.includes(state.valueColumn)) state.valueColumn = valueOptions[0] || '';
  if (!valueOptions.length) state.valueColumn = '';
  if (!state.headers.includes(state.groupColumn)) state.groupColumn = state.headers.find((header) => header !== state.valueColumn) || state.headers[0] || '';
  if (!state.headers.includes(state.categoryColumnA)) state.categoryColumnA = state.headers[0] || '';
  if (!state.headers.includes(state.categoryColumnB) || state.categoryColumnB === state.categoryColumnA) {
    state.categoryColumnB = state.headers.find((header) => header !== state.categoryColumnA) || state.headers[0] || '';
  }
  fillSelect(elements.valueColumn, valueOptions, state.valueColumn);
  const groupOptions = state.analysisMode === 'descriptive' ? ['', ...state.headers.filter((header) => header !== state.valueColumn)] : state.headers;
  if (state.analysisMode === 'descriptive' && !groupOptions.includes(state.groupColumn)) state.groupColumn = '';
  fillSelect(elements.groupColumn, groupOptions, state.groupColumn);
  if (state.analysisMode === 'descriptive') elements.groupColumn.options[0].textContent = '不分组（仅整体诊断）';
  fillSelect(elements.categoryColumnA, state.headers, state.categoryColumnA);
  fillSelect(elements.categoryColumnB, state.headers, state.categoryColumnB);
}

function updateControls() {
  elements.analysisMode.value = state.analysisMode;
  elements.correlationMethod.value = state.correlationMethod;
  elements.normalityMethod.value = state.normalityMethod;
  elements.varianceMethod.value = state.varianceMethod;
  elements.postHocMethod.value = state.postHocMethod;
  elements.correctionMethod.value = state.correctionMethod;
  elements.missingMode.value = state.missingMode;
  elements.decimalSeparator.value = state.decimalSeparator;
  elements.percentMode.value = state.percentMode;
  const mode = state.analysisMode;
  const showValueGroup = ['descriptive', 'group-summary', 'two-group', 'multi-group'].includes(mode);
  elements.valueField.classList.toggle('hidden', !showValueGroup);
  elements.groupField.classList.toggle('hidden', !showValueGroup);
  elements.categoryAField.classList.toggle('hidden', mode !== 'categorical');
  elements.categoryBField.classList.toggle('hidden', mode !== 'categorical');
  elements.correlationField.classList.toggle('hidden', mode !== 'correlation');
  const showDiagnostics = ['descriptive', 'correlation', 'two-group', 'multi-group'].includes(mode);
  elements.normalityField.classList.toggle('hidden', !showDiagnostics);
  elements.varianceField.classList.toggle('hidden', !['descriptive', 'two-group', 'multi-group'].includes(mode));
  elements.postHocField.classList.toggle('hidden', mode !== 'multi-group');
  elements.correctionField.classList.toggle('hidden', mode !== 'multi-group');
  const correctionBuiltIn = ['tukey', 'games-howell', 'fisher-lsd'].includes(state.postHocMethod);
  elements.correctionMethod.disabled = correctionBuiltIn;
  elements.correctionMethod.title = state.postHocMethod === 'fisher-lsd' ? 'protected Fisher LSD：仅总体 ANOVA 显著后执行两两比较，两两 P 不单独校正。' : correctionBuiltIn ? '该方法使用自身的家族错误控制。' : '';
  elements.missingField.classList.toggle('hidden', !['overview', 'descriptive', 'group-summary'].includes(mode));

  const notes = {
    overview: '概览会分别报告非空值、有效数值、无效格式和缺失值；不会再把“bad”等录入错误算作 0。',
    descriptive: '对所选数值字段做描述统计与正态性诊断；选择分组字段后同时检查方差齐性。',
    'group-summary': '只有真正空白的数值单元格可按 0 处理；非法文本始终排除并报警。',
    correlation: '采用逐对完整观测，每一对变量会显示独立的实际样本量 N。',
    categorical: '同时报告 Pearson χ²；固定边际精确枚举有独立的“组合过多”和“超时”状态。',
    'two-group': '推断检验固定剔除缺失和非法值；均值差标签置换在 Worker 中运行，避免阻塞页面。',
    'multi-group': '可自动或手动选择正态性与方差诊断；Tukey / Games–Howell 的有限 df 计算不再在 200 处跳变。',
  };
  elements.modeNote.textContent = notes[mode] || '';
}

function scheduleAnalysis() {
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(() => {
    // 仅扫描一次全表，后续复用
    const currentProfiles = profiles();
    const selectorSignature = currentProfiles
      .map((p) => `${p.header}:${p.eligibleForNumericAnalysis ? 1 : 0}`)
      .join('|');
    if (selectorSignature !== lastSelectorSignature) {
      lastSelectorSignature = selectorSignature;
      refreshSelectors(currentProfiles);
    }
    analyze(currentProfiles);
  }, 180);
}

function buildGroups({ allowMissingZero = false } = {}) {
  const groupIndex = state.headers.indexOf(state.groupColumn);
  const valueIndex = state.headers.indexOf(state.valueColumn);
  if (groupIndex >= 0 && groupIndex === valueIndex && state.analysisMode !== 'descriptive') {
    return { labels: [], groups: [], excludedMissing: 0, excludedInvalid: 0, excludedGroup: 0, error: '组别字段不能与数值字段相同' };
  }
  const labels = [];
  const map = new Map();
  let excludedMissing = 0;
  let excludedInvalid = 0;
  let excludedGroup = 0;
  state.rows.forEach((row) => {
    const label = String(row[groupIndex] ?? '').trim();
    if (!label) { excludedGroup += 1; return; }
    const parsed = parseNumeric(row[valueIndex], numberOptions());
    let value;
    if (parsed.kind === 'number') value = parsed.value;
    else if (parsed.kind === 'missing' && allowMissingZero && state.missingMode === 'zero') value = 0;
    else {
      if (parsed.kind === 'missing') excludedMissing += 1;
      else excludedInvalid += 1;
      return;
    }
    if (!map.has(label)) { map.set(label, []); labels.push(label); }
    map.get(label).push(value);
  });
  return { labels, groups: labels.map((label) => map.get(label)), excludedMissing, excludedInvalid, excludedGroup };
}

function buildContingency() {
  const aIndex = state.headers.indexOf(state.categoryColumnA);
  const bIndex = state.headers.indexOf(state.categoryColumnB);
  if (aIndex === bIndex) {
    return { rowLabels: [], columnLabels: [], counts: [], excluded: 0, n: 0, error: '两个分类字段不能相同' };
  }
  const rowLabels = [];
  const columnLabels = [];
  const rowMap = new Map();
  const columnMap = new Map();
  const pairs = [];
  let excluded = 0;
  state.rows.forEach((row) => {
    const a = String(row[aIndex] ?? '').trim();
    const b = String(row[bIndex] ?? '').trim();
    if (!a || !b) { excluded += 1; return; }
    if (!rowMap.has(a)) { rowMap.set(a, rowLabels.length); rowLabels.push(a); }
    if (!columnMap.has(b)) { columnMap.set(b, columnLabels.length); columnLabels.push(b); }
    pairs.push([a, b]);
  });
  const counts = Array.from({ length: rowLabels.length }, () => Array(columnLabels.length).fill(0));
  pairs.forEach(([a, b]) => { counts[rowMap.get(a)][columnMap.get(b)] += 1; });
  return { rowLabels, columnLabels, counts, excluded, n: pairs.length };
}

function qualityAlerts(currentProfiles) {
  const alerts = [];
  const invalidProfiles = currentProfiles.filter((profile) => profile.isNumeric && profile.invalid > 0);
  if (invalidProfiles.length) {
    alerts.push({ type: 'warning', text: `发现无效数值格式：${invalidProfiles.map((profile) => `${profile.header} ${profile.invalid} 个`).join('；')}。这些单元格不会被按 0 处理。` });
  }
  if (storageWarning) alerts.push({ type: 'warning', text: storageWarning });
  return alerts;
}

async function analyze(cachedProfiles) {
  const version = ++analysisVersion;
  // 每次分析开始时无条件取消旧重任务（防止悬浮 Worker 继续占 CPU）
  cancelCurrentHeavyTask();
  const currentProfiles = cachedProfiles || profiles();
  renderQuality(currentProfiles);
  setAlerts(qualityAlerts(currentProfiles));
  setRecommendation('');
  setSecondary('', '', [], []);
  const mode = state.analysisMode;
  try {
    if (mode === 'overview') analyzeOverview(currentProfiles);
    else if (mode === 'descriptive') analyzeDescriptive(currentProfiles);
    else if (mode === 'group-summary') analyzeGroupSummary(currentProfiles);
    else if (mode === 'correlation') analyzeCorrelation(currentProfiles);
    else if (mode === 'categorical') await analyzeCategorical(currentProfiles, version);
    else if (mode === 'two-group') await analyzeTwoGroup(currentProfiles, version);
    else if (mode === 'multi-group') analyzeMultiGroup(currentProfiles);
  } catch (error) {
    if (version !== analysisVersion) return;
    setAlerts([...qualityAlerts(currentProfiles), { type: 'error', text: `分析失败：${error.message}` }]);
    setSummaryCards([]);
    setMainResult('无法计算', '', ['状态'], [['请检查字段选择和数据格式。']]);
  }
}

function analyzeOverview(currentProfiles) {
  const invalidTotal = currentProfiles.reduce((sum, profile) => sum + (profile.isNumeric ? profile.invalid : 0), 0);
  const missingTotal = currentProfiles.reduce((sum, profile) => sum + profile.missing, 0);
  setSummaryCards([
    { value: state.rows.length.toLocaleString(), label: '数据行' },
    { value: state.headers.length, label: '字段数' },
    { value: invalidTotal, label: '无效数值格式' },
    { value: missingTotal, label: '缺失单元格' },
  ]);
  const headers = ['字段', '类型', '有效 N', '均值', '标准差', '中位数', 'Q1', 'Q3', '最小', '最大'];
  const rows = currentProfiles.map((profile) => {
    const analysisValues = profile.isNumeric && state.missingMode === 'zero'
      ? profile.numbers.concat(Array(profile.missing).fill(0))
      : profile.numbers;
    const summary = stats(analysisValues);
    return [
      profile.header,
      profile.isNumeric ? '数值' : '文本',
      profile.isNumeric ? analysisValues.length : '—',
      formatNumber(summary?.mean),
      formatNumber(summary?.sd),
      formatNumber(summary?.median),
      formatNumber(summary?.q1),
      formatNumber(summary?.q3),
      formatNumber(summary?.min),
      formatNumber(summary?.max),
    ];
  });
  setMainResult('字段描述统计', '数值统计只使用成功解析的数字；“有效 N”不会再把非法文本计入。', headers, rows);
  if (invalidTotal) setRecommendation('建议先修正无效格式再进行推断分析；数据概览不会静默把这些值转成 0。');
}

function analyzeDescriptive() {
  const rawValues = getColumnValues(state.valueColumn);
  const parsed = rawValues.map((value) => parseNumeric(value, numberOptions()));
  const valid = parsed.filter((item) => item.kind === 'number').map((item) => item.value);
  const missing = parsed.filter((item) => item.kind === 'missing').length;
  const invalid = parsed.filter((item) => item.kind === 'invalid').length;
  const descriptiveValues = state.missingMode === 'zero' ? valid.concat(Array(missing).fill(0)) : valid;
  const summary = stats(descriptiveValues);
  const normality = runNormalityTest(valid, state.normalityMethod);
  let variance = null;
  let grouped = null;
  if (state.groupColumn) {
    grouped = buildGroups();
    if (grouped.labels.length >= 2 && grouped.groups.every((group) => group.length >= 2)) {
      const groupNormalities = grouped.groups.map((group) => runNormalityTest(group, state.normalityMethod));
      variance = runVarianceTest(grouped.groups, groupNormalities, state.varianceMethod);
    }
  }
  setSummaryCards([
    { value: descriptiveValues.length, label: '描述统计 N' },
    { value: valid.length, label: '有效数值' },
    { value: missing, label: '缺失' },
    { value: invalid, label: '非法格式' },
  ]);
  setMainResult('描述统计', `字段：${state.valueColumn}。正态性诊断始终基于有效观测，不把缺失值填 0。`, ['N', '均值', 'SD', '中位数', 'Q1', 'Q3', '最小', '最大'], [[summary?.count ?? 0, formatNumber(summary?.mean), formatNumber(summary?.sd), formatNumber(summary?.median), formatNumber(summary?.q1), formatNumber(summary?.q3), formatNumber(summary?.min), formatNumber(summary?.max)]]);
  const diagnostics = [
    ['整体正态性', normality.name, formatNumber(normality.statistic), normality.status === 'insufficient' ? '样本量不足' : pCell(normality.pValue), normality.recommendationReason],
  ];
  if (state.groupColumn) diagnostics.push(['方差齐性', variance?.name || '无法计算', formatNumber(variance?.statistic), variance ? pCell(variance.pValue) : '—', variance?.recommendationReason || `有效组数 ${grouped?.labels.length || 0}`]);
  setSecondary('分布与方差诊断', 'P ≥ 0.05 只表示当前检验未发现明显证据，不等于证明正态或方差完全相等。', ['诊断', '方法', '统计量', 'P', '说明'], diagnostics);
  if (normality.status === 'fail') setRecommendation('正态性诊断提示偏离；请结合直方图、Q–Q 图、异常值和研究设计，不要只依赖单个 P 值。');
  else if (normality.status === 'pass') setRecommendation('当前正态性诊断未提示明显偏离；仍需结合图形与样本量判断。');
  else setRecommendation('样本量不足以可靠判断正态性；建议优先采用稳健方法并查看原始数据。');
}

function analyzeGroupSummary() {
  const built = buildGroups({ allowMissingZero: true });
  const summaries = built.groups.map(stats);
  setSummaryCards([
    { value: built.labels.length, label: '有效组数' },
    { value: summaries.reduce((sum, item) => sum + (item?.count || 0), 0), label: '参与汇总 N' },
    { value: built.excludedMissing, label: '排除缺失' },
    { value: built.excludedInvalid, label: '排除非法格式' },
  ]);
  const rows = built.labels.map((label, index) => {
    const summary = summaries[index];
    return [label, summary.count, formatNumber(summary.mean), formatNumber(summary.sd), formatNumber(summary.median), formatNumber(summary.q1), formatNumber(summary.q3), formatNumber(summary.min), formatNumber(summary.max)];
  });
  setMainResult('分组描述统计', `字段：${state.groupColumn} × ${state.valueColumn}。空白组名排除 ${built.excludedGroup} 行。`, ['组别', 'N', '均值', 'SD', '中位数', 'Q1', 'Q3', '最小', '最大'], rows);
  if (state.missingMode === 'zero') setRecommendation('当前只把真正空白的数值单元格转换为 0；非法文本仍被排除。');
}

function numericSeries(header) {
  const values = getColumnValues(header);
  return values.map((raw) => {
    const parsed = parseNumeric(raw, numberOptions());
    return parsed.kind === 'number' ? parsed.value : Number.NaN;
  });
}

function analyzeCorrelation(currentProfiles) {
  const numericHeaders = currentProfiles.filter((profile) => profile.eligibleForNumericAnalysis).map((profile) => profile.header);
  const rows = [];
  for (let i = 0; i < numericHeaders.length; i += 1) {
    for (let j = i + 1; j < numericHeaders.length; j += 1) {
      const a = numericSeries(numericHeaders[i]);
      const b = numericSeries(numericHeaders[j]);
      if (state.correlationMethod !== 'spearman') {
        const result = pearsonCorrelation(a, b);
        if (result) {
          if (result.status === 'constant-input') {
            rows.push([numericHeaders[i], numericHeaders[j], 'Pearson', '—（常量输入）', '—', result.n]);
          } else {
            rows.push([numericHeaders[i], numericHeaders[j], 'Pearson', formatNumber(result.coefficient), pCell(result.pValue), result.n]);
          }
        }
      }
      if (state.correlationMethod !== 'pearson') {
        const result = spearmanCorrelation(a, b);
        if (result) {
          if (result.status === 'constant-input') {
            rows.push([numericHeaders[i], numericHeaders[j], 'Spearman', '—（常量输入）', '—', result.n]);
          } else {
            rows.push([numericHeaders[i], numericHeaders[j], 'Spearman' + (result.pValueType === 'exact' ? '（精确 P）' : '（渐近 P）'), formatNumber(result.coefficient), pCell(result.pValue), result.n]);
          }
        }
      }
    }
  }
  const pairCounts = rows.map((row) => Number(row[5])).filter(Number.isFinite);
  setSummaryCards([
    { value: numericHeaders.length, label: '数值字段' },
    { value: rows.length, label: '相关结果' },
    { value: pairCounts.length ? Math.min(...pairCounts) : '—', label: '最小逐对 N' },
    { value: pairCounts.length ? Math.max(...pairCounts) : '—', label: '最大逐对 N' },
  ]);
  setMainResult('相关矩阵（长表）', '每一行使用该变量对的完整观测，并单独显示实际 N。', ['变量 A', '变量 B', '方法', '相关系数', 'P', '逐对 N'], rows.length ? rows : [['—', '—', '—', '—', '—', '不足 2 个可分析数值字段']]);
  setRecommendation('自动展示 Pearson 与 Spearman 两种结果。正态性诊断仅供辅助参考，不据此自动切换方法。选择时请结合散点图检查线性/单调关系、异常值和数据分布。逐对 N 不一致时应谨慎比较系数。');
}

async function analyzeCategorical(currentProfiles, version) {
  const built = buildContingency();
  if (built.error) {
    setSummaryCards([]);
    setMainResult('分类变量关联', '', ['状态'], [[built.error]]);
    return;
  }
  const summary = contingencyStatistics(built.counts);
  if (!summary) {
    setSummaryCards([{ value: built.n, label: '完整观测 N' }]);
    setMainResult('分类变量关联', '', ['状态'], [['两个字段都至少需要 2 个非空类别。']]);
    return;
  }
  setSummaryCards([
    { value: built.n, label: '完整观测 N' },
    { value: built.rowLabels.length, label: '行类别数' },
    { value: built.columnLabels.length, label: '列类别数' },
    { value: summary.lowExpected, label: '期望频数 < 5 单元格' },
  ]);
  setMainResult('分类变量关联检验', '固定边际精确枚举正在后台计算。', ['方法', '统计量', 'df', 'P', '效应 / 状态'], [
    ['Pearson χ²', formatNumber(summary.statistic), summary.df, pCell(summary.pValue), `Cramér V = ${formatNumber(summary.cramerV)}`],
    ['固定边际精确 P', '—', '—', '计算中…', 'Web Worker'],
  ]);
  const contingencyRows = built.rowLabels.map((label, rowIndex) => [label, ...built.counts[rowIndex], summary.rowTotals[rowIndex]]);
  contingencyRows.push(['合计', ...summary.columnTotals, summary.total]);
  setSecondary('列联表', `排除任一字段空白的记录 ${built.excluded} 行。`, [state.categoryColumnA, ...built.columnLabels, '合计'], contingencyRows);
  let exact;
  try {
    exact = await runHeavyTask('fixed-margin-exact', { counts: built.counts, options: { maximumTables: 100000, timeLimitMilliseconds: 1800 } });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // 静默忽略取消
    throw e;
  }
  if (version !== analysisVersion) return;
  const statusText = (() => {
    if (exact.status === 'exact') return `枚举 ${exact.tableCount.toLocaleString()} 个表`;
    if (exact.status === 'too-many-tables') return `组合超过 100,000（已枚举 ${exact.tableCount.toLocaleString()}）`;
    if (exact.status === 'timeout') return `超过 1.8 秒（已枚举 ${exact.tableCount.toLocaleString()}）`;
    if (exact.status === 'enumeration-failed') return '枚举失败';
    if (exact.status === 'invalid') return '不适用';
    return exact.status;
  })();
  const exactMethodLabel = exact.method === 'fisher' ? 'Fisher 精确 P' : '固定边际精确 Pearson χ² 检验';
  setMainResult('分类变量关联检验', 'Pearson χ² 为渐近检验；期望频数较小时优先参考成功完成的固定边际精确结果。', ['方法', '统计量', 'df', 'P', '效应 / 状态'], [
    ['Pearson χ²', formatNumber(summary.statistic), summary.df, pCell(summary.pValue), `Cramér V = ${formatNumber(summary.cramerV)}`],
    [exactMethodLabel, '—', '固定边际', exact.status === 'exact' ? pCell(exact.pValue) : '—', statusText],
  ]);
  if (summary.lowExpected > 0) setRecommendation('存在期望频数低于 5 的单元格；若精确枚举成功，优先参考精确 P，并结合效应量与研究设计。');
}

function normalitySummary(groups) {
  const results = groups.map((group) => runNormalityTest(group, state.normalityMethod));
  const testable = results.filter((result) => result?.status !== 'insufficient');
  const allPass = testable.length === groups.length && testable.every((result) => result.status === 'pass');
  const anyFail = testable.some((result) => result.status === 'fail');
  return { results, allPass, anyFail, incomplete: testable.length !== groups.length };
}

async function analyzeTwoGroup(currentProfiles, version) {
  const built = buildGroups();
  if (built.error) {
    setSummaryCards([]);
    setMainResult('两独立样本', '', ['状态'], [[built.error]]);
    return;
  }
  if (built.labels.length !== 2 || built.groups.some((group) => group.length < 2)) {
    setSummaryCards([{ value: built.labels.length, label: '有效组数' }]);
    setMainResult('两独立样本', '', ['状态'], [['需要恰好 2 个组，且每组至少 2 个有效数值。']]);
    return;
  }
  const summaries = built.groups.map(stats);
  const normality = normalitySummary(built.groups);
  const variance = runVarianceTest(built.groups, normality.results, state.varianceMethod);
  const pooled = pooledTTest(...built.groups);
  const welch = welchTTest(...built.groups);
  const mw = mannWhitney(...built.groups);
  setSummaryCards([
    { value: summaries[0].count, label: `${built.labels[0]} N` },
    { value: summaries[1].count, label: `${built.labels[1]} N` },
    { value: built.excludedMissing, label: '排除缺失' },
    { value: built.excludedInvalid, label: '排除非法格式' },
  ]);
  const rows = [
    ['Welch t（推荐）', formatNumber(welch.statistic), formatNumber(welch.df), pCell(welch.pValue), '—', '不要求方差相等'],
    ['等方差 t', formatNumber(pooled.statistic), formatNumber(pooled.df), pCell(pooled.pValue), `Cohen d = ${formatNumber(pooled.effect)}`, '参数法'],
    ['Mann–Whitney U' + (mw.pValueType === 'exact' ? '（精确 P）' : '（渐近 P）'), `${formatNumber(mw.statistic)}（Z=${formatNumber(mw.z)}）`, '—', pCell(mw.pValue), `秩二列相关 = ${formatNumber(mw.effect)}`, 'U=均值时连续性校正为 0'],
    ['均值差标签置换', '—', '—', '计算中…', '—', '交换性假设下精确'],
  ];
  setMainResult('两独立样本检验', '标签置换检验正在后台计算；它仅在两组分布相同、标签可交换的原假设下精确。推断分析始终剔除缺失和非法格式。', ['方法', '统计量', 'df', 'P', '效应量', '说明'], rows);
  const descriptiveRows = built.labels.map((label, index) => {
    const normal = normality.results[index];
    const summary = summaries[index];
    return [label, summary.count, formatNumber(summary.mean), formatNumber(summary.sd), formatNumber(summary.median), normal?.name || '—', normal?.status === 'insufficient' ? '样本量不足' : formatP(normal?.pValue)];
  });
  descriptiveRows.push(['方差齐性', '—', '—', '—', '—', variance?.name || '无法计算', variance ? formatP(variance.pValue) : '—']);
  setSecondary('组别描述与诊断', '自动模式会按样本量与重复值比例选择正态性检验；方差诊断可自动选择 Bartlett 或 Brown–Forsythe。', ['组别', 'N', '均值', 'SD', '中位数', '诊断方法', '诊断 P'], descriptiveRows);

  let exact;
  try {
    exact = await runHeavyTask('two-sample-permutation', { valuesA: built.groups[0], valuesB: built.groups[1], options: { maximumPermutations: 100000, timeLimitMilliseconds: 1800 } });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return; // 静默忽略取消
    throw e;
  }
  if (version !== analysisVersion) return;
  const statusText = (() => {
    if (exact.status === 'exact') return `${exact.extremeCount}/${exact.totalCount} 个排列同样或更极端`;
    if (exact.status === 'too-many-combinations') return `组合数超过 100,000（估计 ${Math.round(exact.estimatedCount).toLocaleString()}）`;
    if (exact.status === 'timeout') return `超过 1.8 秒（完成 ${exact.totalCount.toLocaleString()} / ${exact.estimatedCount.toLocaleString()}）`;
    if (exact.status === 'enumeration-failed') return '枚举数量校验失败';
    if (exact.status === 'invalid') return '不适用';
    return exact.status;
  })();
  rows[3] = ['均值差标签置换', formatNumber(exact.observedDifference), '固定组大小', exact.status === 'exact' ? pCell(exact.pValue) : '—', '均值差', statusText];
  setMainResult('两独立样本检验', '多种结果并列展示；方法选择应结合分布、方差、测量尺度和研究设计。', ['方法', '统计量', 'df', 'P', '效应量', '说明'], rows);

  setRecommendation('自动建议：Welch t 不要求方差相等，在大多数情况下比等方差 t 更稳健，推荐优先参考。正态性与方差诊断结果仅供参考，不会因此自动切换方法。如需非参数检验请手动选择 Mann–Whitney。');
}

function analyzeMultiGroup() {
  const built = buildGroups();
  if (built.error) {
    setSummaryCards([]);
    setMainResult('多独立组', '', ['状态'], [[built.error]]);
    return;
  }
  if (built.labels.length < 3 || built.groups.some((group) => group.length < 2)) {
    setSummaryCards([{ value: built.labels.length, label: '有效组数' }]);
    setMainResult('多独立组', '', ['状态'], [['需要至少 3 个组，且每组至少 2 个有效数值。']]);
    return;
  }
  const summaries = built.groups.map(stats);
  const normality = normalitySummary(built.groups);
  const variance = runVarianceTest(built.groups, normality.results, state.varianceMethod);
  const anova = oneWayAnova(built.groups);
  const welch = welchAnova(built.groups);
  const kw = kruskalWallis(built.groups);
  setSummaryCards([
    { value: built.labels.length, label: '有效组数' },
    { value: summaries.reduce((sum, item) => sum + item.count, 0), label: '参与检验 N' },
    { value: built.excludedMissing, label: '排除缺失' },
    { value: built.excludedInvalid, label: '排除非法格式' },
  ]);
  const omnibusRows = [
    ['Welch ANOVA（推荐）', formatNumber(welch?.statistic), `${formatNumber(welch?.df1)}, ${formatNumber(welch?.df2)}`, pCell(welch?.pValue), '方差不齐稳健'],
    ['经典单因素 ANOVA', formatNumber(anova?.statistic), `${formatNumber(anova?.df1)}, ${formatNumber(anova?.df2)}`, pCell(anova?.pValue), `η² = ${formatNumber(anova?.etaSquared)}`],
    ['Kruskal–Wallis', formatNumber(kw?.statistic), formatNumber(kw?.df), pCell(kw?.pValue), `ε² = ${formatNumber(kw?.epsilonSquared)}`],
    [`${variance?.name || '方差齐性'} 诊断`, formatNumber(variance?.statistic), variance ? (variance.df2 == null ? formatNumber(variance.df1) : `${formatNumber(variance.df1)}, ${formatNumber(variance.df2)}`) : '—', pCell(variance?.pValue), 'P < 0.05 提示方差不齐'],
    ...built.labels.map((label, index) => {
      const result = normality.results[index];
      return [`正态性：${label}（${result?.name || '—'}）`, formatNumber(result?.statistic), '—', result?.status === 'insufficient' ? '样本量不足' : pCell(result?.pValue), result?.recommendationReason || ''];
    }),
  ];
  setMainResult('多独立组总体检验', '推断分析使用完整观测；自动推荐不隐藏其他可计算方法。', ['方法', '统计量', 'df', 'P', '效应 / 说明'], omnibusRows);

  let method = state.postHocMethod;
  if (method === 'auto') {
    method = 'games-howell';
  }
  const postHoc = postHocComparisons(built.labels, built.groups, method, state.correctionMethod);
  const methodLabels = {
    tukey: 'Tukey–Kramer', 'games-howell': 'Games–Howell', 'fisher-lsd': 'Fisher LSD', pooled: '两两 pooled t', welch: '两两 Welch t', dunn: 'Dunn', 'mann-whitney': '两两 Mann–Whitney U',
  };
  const estimateLabels = {
    'mean-difference': '均值差', 'rank-biserial-correlation': '秩二列相关', 'mean-rank-difference': '秩均差',
  };
  const firstEstimate = postHoc.length ? postHoc[0].estimateType : 'mean-difference';
  const estimateHeader = estimateLabels[firstEstimate] || '效应量';
  // MW 标注精确/渐近 P
  const mwPType = method === 'mann-whitney' && postHoc.length ? postHoc[0].pValueType : null;
  const methodDisplay = (methodLabels[method] || method) + (mwPType === 'exact' ? '（精确 P）' : mwPType === 'asymptotic' ? '（渐近 P）' : '');
  const postRows = postHoc.map((row) => [row.comparison, formatNumber(row.difference), formatNumber(row.statistic), formatNumber(row.df), pCell(row.pValue), pCell(row.adjustedP), row.correction === 'builtin' ? '学生化极差内置控制' : row.correction === 'none' ? '不校正' : row.correction]);
  if (method === 'fisher-lsd' && !postRows.length) {
    setSecondary('Fisher LSD 事后比较', 'protected Fisher LSD 依赖前置的总体 ANOVA 检验。', ['状态'], [['总体 ANOVA 未达到显著水平，因此未执行 protected Fisher LSD。']]);
  } else {
    setSecondary(`${methodDisplay} 事后比较`, 'Tukey 与 Games–Howell 使用学生化极差分布；protected Fisher LSD 仅在总体 ANOVA 显著后执行，两两 P 不单独校正；其他方法使用所选校正。', ['比较', estimateHeader, '统计量', 'df', '原始 P', '校正 P', '校正'], postRows);
  }

  if (!welch) {
    setRecommendation(`注意：Welch ANOVA 在当前数据上无法计算（可能有组方差为零或样本量不足），已改为经典 ANOVA。事后比较默认使用 ${methodLabels[method]}。`);
  } else {
    setRecommendation(`自动建议：Welch ANOVA 不要求方差相等，推荐优先参考。事后比较默认使用 Games–Howell（异方差稳健），当前方法为 ${methodLabels[method]}。如需非参数检验请手动选择。`);
  }
}

async function decodeFile(file, encoding) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`文件超过 10 MiB：${(file.size / 1024 / 1024).toFixed(1)} MiB`);
  const buffer = await file.arrayBuffer();
  if (encoding === 'auto') {
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'UTF-8' };
    } catch {
      return { text: new TextDecoder('gb18030').decode(buffer), encoding: 'GB18030' };
    }
  }
  const labels = { 'utf-8': 'UTF-8', gb18030: 'GB18030', big5: 'Big5' };
  return { text: new TextDecoder(encoding).decode(buffer), encoding: labels[encoding] || encoding };
}

function applyImportedData(parsed, message) {
  const fatal = parsed.errors.find((error) => error.fatal);
  if (fatal) {
    setEditorStatus(`导入失败：${fatal.message}`, 'error');
    return false;
  }
  if (!parsed.headers.length) {
    setEditorStatus('没有识别到表头和数据。', 'error');
    return false;
  }
  state.headers = parsed.headers;
  state.rows = parsed.rows.length ? parsed.rows : emptyRows(10, parsed.headers.length);
  selectedRow = null;
  selectedColumn = null;
  page = 0;
  refreshSelectors();
  renderEditor();
  updateControls();
  saveState();
  analyze();
  const nonFatal = parsed.errors.filter((error) => !error.fatal);
  let statusMsg = `${message}；识别分隔符：${parsed.delimiter === '\t' ? 'Tab' : parsed.delimiter}`;
  if (nonFatal.length) {
    statusMsg += `；${nonFatal.length} 个格式警告`;
    const firstDetail = nonFatal.find((e) => e.message)?.message;
    if (firstDetail) statusMsg += `：${firstDetail}`;
  }
  setEditorStatus(statusMsg);
  return true;
}

async function handleFile(file) {
  try {
    setEditorStatus('正在读取文件…');
    const decoded = await decodeFile(file, elements.fileEncoding.value);
    const parsed = parseDelimited(decoded.text);
    applyImportedData(parsed, `已按 ${decoded.encoding} 导入 ${parsed.rows.length.toLocaleString()} 行`);
  } catch (error) {
    setEditorStatus(`文件导入失败：${error.message}`, 'error');
  } finally {
    elements.fileInput.value = '';
  }
}

function parseGroupedText(text) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const colonRows = [];
  const errors = [];
  let allColon = lines.length > 0;
  lines.forEach((line) => {
    const match = line.match(/^([^:：]+?)\s*[:：]\s*(.+)$/);
    if (!match) { allColon = false; return; }
    const label = match[1].trim();
    const body = match[2].trim();
    const decSep = state.decimalSeparator;
    let tokens;
    if (decSep === 'comma') {
      // 逗号是小数点，数值只用空格或分号分隔
      tokens = body.split(/[;；\s]+/).filter(Boolean);
    } else if (decSep === 'dot') {
      // 逗号是千分位或分隔符，按逗号/中文逗号/空格切分
      tokens = body.split(/[;；，\s]+|,(?=\s*[-+]?\d)/).filter(Boolean);
    } else {
      // auto 模式：优先按空格/分号切分，保留 token 内单个逗号供 parseNumeric 识别
      tokens = body.split(/[;；\s]+/).filter(Boolean);
      const parsedCount = tokens.map((t) => parseNumeric(t, numberOptions())).filter((p) => p.kind === 'number').length;
      // 如果大部分 token 未能解析，尝试按逗号分隔（可能是逗号分隔的整数）
      if (parsedCount === 0 && /,/.test(body)) {
        const altTokens = body.split(/[;；，\s]+|,(?=\s*[-+]?\d)/).filter(Boolean);
        if (altTokens.length > tokens.length) tokens = altTokens;
      }
    }
    let invalidCount = 0;
    const invalidExamples = [];
    tokens.forEach((token) => {
      const parsed = parseNumeric(token, numberOptions());
      if (parsed.kind === 'number') {
        colonRows.push([label, String(parsed.value)]);
      } else if (parsed.kind === 'invalid') {
        invalidCount++;
        if (invalidExamples.length < 3) invalidExamples.push(token);
      }
    });
    if (invalidCount > 0) {
      const preview = invalidExamples.map((s) => `"${s}"`).join('、');
      errors.push({ message: `"${label}" 中 ${invalidCount} 个值无法解析为数字：${preview}${invalidCount > invalidExamples.length ? '…' : ''}，已排除` });
    }
  });
  if (allColon && colonRows.length) return { headers: ['组别', '数值'], rows: colonRows, delimiter: '分组格式', errors };

  const wide = parseDelimited(text);
  if (wide.errors.some((error) => error.fatal)) return { ...wide, errors: [...wide.errors, ...errors] };
  const rows = [];
  let wideInvalid = 0;
  wide.headers.forEach((header, columnIndex) => {
    wide.rows.forEach((sourceRow) => {
      const parsed = parseNumeric(sourceRow[columnIndex], numberOptions());
      if (parsed.kind === 'number') rows.push([header, String(parsed.value)]);
      else if (parsed.kind === 'invalid') wideInvalid++;
    });
  });
  if (wideInvalid > 0) errors.push({ message: `宽表中有 ${wideInvalid} 个值无法解析为数字，已排除` });
  return rows.length
    ? { headers: ['组别', '数值'], rows, delimiter: wide.delimiter, errors: [...wide.errors, ...errors] }
    : { headers: [], rows: [], delimiter: wide.delimiter, errors: [...wide.errors, ...errors, { fatal: true, message: '未识别到分组数值' }] };
}

function loadExample(key) {
  const examples = {
    general: {
      name: '通用统计演示', mode: 'overview', value: '评分', group: '三组', a: '两组', b: '是否改善',
      text: [
        '样本	两组	三组	是否改善	年龄	收缩压	评分',
        'S01	对照组	低剂量	否	24	112	68', 'S02	对照组	低剂量	否	27	118	71', 'S03	对照组	低剂量	是	31	121	75',
        'S04	对照组	低剂量	否	35	124	77', 'S05	对照组	低剂量	是	40	126	79', 'S06	对照组	低剂量	否	38	120	74',
        'S07	处理组	中剂量	是	25	128	81', 'S08	处理组	中剂量	是	29	132	85', 'S09	处理组	中剂量	是	33	136	89',
        'S10	处理组	中剂量	否	38	141	92', 'S11	处理组	中剂量	是	42	145	95', 'S12	处理组	中剂量	是	36	139	90',
        'S13	处理组	高剂量	是	26	134	88', 'S14	处理组	高剂量	是	30	138	91', 'S15	处理组	高剂量	是	34	142	94',
        'S16	处理组	高剂量	是	39	148	98', 'S17	处理组	高剂量	否	43	151	101', 'S18	处理组	高剂量	是	41	149	99',
      ].join('\n'),
    },
    qpcr_two: {
      name: 'qPCR：两组相对表达', mode: 'two-group', value: 'DeltaCt', group: 'Group',
      text: [
        'Sample	Group	Target_Ct	Reference_Ct	DeltaCt	RelativeExpression',
        'C01	Control	27.8	20.1	7.7	1.00', 'C02	Control	28.2	20.3	7.9	0.87', 'C03	Control	27.5	19.9	7.6	1.07', 'C04	Control	28.0	20.2	7.8	0.93',
        'C05	Control	27.9	20.0	7.9	0.87', 'C06	Control	27.6	20.1	7.5	1.15', 'C07	Control	28.1	20.4	7.7	1.00', 'C08	Control	27.7	20.0	7.7	1.00',
        'T01	Treatment	25.9	20.0	5.9	3.48', 'T02	Treatment	26.3	20.2	6.1	3.03', 'T03	Treatment	25.7	19.9	5.8	3.73', 'T04	Treatment	26.1	20.1	6.0	3.25',
        'T05	Treatment	26.4	20.3	6.1	3.03', 'T06	Treatment	25.8	20.0	5.8	3.73', 'T07	Treatment	26.0	20.1	5.9	3.48', 'T08	Treatment	26.2	20.2	6.0	3.25',
      ].join('\n'),
    },
    qpcr_multi: {
      name: 'qPCR：多处理组表达', mode: 'multi-group', value: 'DeltaCt', group: 'Treatment',
      text: [
        'Sample	Treatment	DeltaCt	RelativeExpression',
        'C01	Control	8.2	1.00', 'C02	Control	8.0	1.15', 'C03	Control	8.3	0.93', 'C04	Control	8.1	1.07', 'C05	Control	8.4	0.87', 'C06	Control	7.9	1.23',
        'S01	siRNA	6.8	2.64', 'S02	siRNA	6.6	3.03', 'S03	siRNA	6.9	2.46', 'S04	siRNA	6.7	2.83', 'S05	siRNA	6.5	3.25', 'S06	siRNA	6.8	2.64',
        'D01	Drug	7.4	1.74', 'D02	Drug	7.2	2.00', 'D03	Drug	7.5	1.62', 'D04	Drug	7.3	1.87', 'D05	Drug	7.1	2.14', 'D06	Drug	7.4	1.74',
        'X01	Combo	5.9	4.93', 'X02	Combo	6.1	4.29', 'X03	Combo	5.8	5.28', 'X04	Combo	6.0	4.59', 'X05	Combo	5.7	5.66', 'X06	Combo	6.2	4.00',
      ].join('\n'),
    },
    western: {
      name: 'Western blot：蛋白灰度', mode: 'multi-group', value: 'NormalizedProtein', group: 'Group',
      text: [
        'Sample	Group	TargetBand	LoadingControl	NormalizedProtein',
        'C01	Control	8120	7900	1.028', 'C02	Control	7750	7680	1.009', 'C03	Control	8310	8050	1.032', 'C04	Control	7580	7700	0.984', 'C05	Control	8040	8010	1.004', 'C06	Control	7920	7990	0.991',
        'S01	Stimulated	12100	8050	1.503', 'S02	Stimulated	11840	7900	1.499', 'S03	Stimulated	12620	8200	1.539', 'S04	Stimulated	11450	7800	1.468', 'S05	Stimulated	12300	8100	1.519', 'S06	Stimulated	11920	7950	1.499',
        'I01	Stim+Inhibitor	9160	8000	1.145', 'I02	Stim+Inhibitor	8890	7850	1.132', 'I03	Stim+Inhibitor	9470	8120	1.166', 'I04	Stim+Inhibitor	8720	7780	1.121', 'I05	Stim+Inhibitor	9280	8060	1.151', 'I06	Stim+Inhibitor	9010	7920	1.138',
      ].join('\n'),
    },
    elisa: {
      name: 'ELISA：细胞因子浓度', mode: 'multi-group', value: 'IL6_pg_mL', group: 'Condition',
      text: [
        'Sample	Condition	IL6_pg_mL',
        'C01	Control	18.2', 'C02	Control	21.4', 'C03	Control	17.6', 'C04	Control	24.1', 'C05	Control	19.8', 'C06	Control	22.0', 'C07	Control	20.7', 'C08	Control	18.9',
        'L01	LPS	146.2', 'L02	LPS	178.4', 'L03	LPS	132.7', 'L04	LPS	205.1', 'L05	LPS	159.6', 'L06	LPS	188.8', 'L07	LPS	151.3', 'L08	LPS	221.5',
        'D01	LPS+Drug	74.5', 'D02	LPS+Drug	82.1', 'D03	LPS+Drug	68.9', 'D04	LPS+Drug	96.4', 'D05	LPS+Drug	79.8', 'D06	LPS+Drug	88.2', 'D07	LPS+Drug	71.6', 'D08	LPS+Drug	91.0',
      ].join('\n'),
    },
    viability: {
      name: '细胞活力：剂量处理', mode: 'multi-group', value: 'Viability_pct', group: 'DoseGroup',
      text: [
        'Sample	DoseGroup	Dose_uM	Viability_pct',
        'D0_1	0 uM	0	100.8', 'D0_2	0 uM	0	98.9', 'D0_3	0 uM	0	101.5', 'D0_4	0 uM	0	99.7', 'D0_5	0 uM	0	102.1', 'D0_6	0 uM	0	97.8',
        'D01_1	0.1 uM	0.1	94.2', 'D01_2	0.1 uM	0.1	96.1', 'D01_3	0.1 uM	0.1	92.8', 'D01_4	0.1 uM	0.1	95.4', 'D01_5	0.1 uM	0.1	93.7', 'D01_6	0.1 uM	0.1	97.0',
        'D1_1	1 uM	1	76.4', 'D1_2	1 uM	1	72.8', 'D1_3	1 uM	1	79.1', 'D1_4	1 uM	1	74.5', 'D1_5	1 uM	1	77.2', 'D1_6	1 uM	1	73.6',
        'D10_1	10 uM	10	41.5', 'D10_2	10 uM	10	38.7', 'D10_3	10 uM	10	44.2', 'D10_4	10 uM	10	36.9', 'D10_5	10 uM	10	42.8', 'D10_6	10 uM	10	39.6',
      ].join('\n'),
    },
    apoptosis: {
      name: '流式凋亡：分类结局', mode: 'categorical', a: 'Treatment', b: 'Apoptosis',
      text: [
        'CellEvent	Treatment	Apoptosis	AnnexinV_pct',
        'C01	Control	Negative	5.2', 'C02	Control	Negative	6.1', 'C03	Control	Negative	4.8', 'C04	Control	Negative	5.7', 'C05	Control	Negative	6.4', 'C06	Control	Negative	5.5', 'C07	Control	Positive	8.1', 'C08	Control	Negative	6.0',
        'T01	Drug	Positive	32.4', 'T02	Drug	Positive	28.7', 'T03	Drug	Positive	35.1', 'T04	Drug	Positive	31.6', 'T05	Drug	Positive	29.9', 'T06	Drug	Positive	37.2', 'T07	Drug	Negative	24.6', 'T08	Drug	Positive	33.0',
        'R01	Drug+Rescue	Negative	14.2', 'R02	Drug+Rescue	Positive	18.6', 'R03	Drug+Rescue	Negative	12.8', 'R04	Drug+Rescue	Negative	15.4', 'R05	Drug+Rescue	Positive	19.1', 'R06	Drug+Rescue	Negative	13.7', 'R07	Drug+Rescue	Negative	16.0', 'R08	Drug+Rescue	Positive	17.8',
      ].join('\n'),
    },
    crispr: {
      name: 'CRISPR：编辑效率与阳性率', mode: 'categorical', value: 'Indel_pct', group: 'sgRNA', a: 'sgRNA', b: 'Edited',
      text: [
        'Sample	sgRNA	Edited	Indel_pct',
        'NT01	NonTargeting	No	1.2', 'NT02	NonTargeting	No	0.8', 'NT03	NonTargeting	No	1.5', 'NT04	NonTargeting	No	0.6', 'NT05	NonTargeting	No	1.1', 'NT06	NonTargeting	No	0.9', 'NT07	NonTargeting	Yes	2.4', 'NT08	NonTargeting	No	1.0',
        'G1_01	sgRNA-1	Yes	48.2', 'G1_02	sgRNA-1	Yes	52.6', 'G1_03	sgRNA-1	Yes	45.9', 'G1_04	sgRNA-1	Yes	55.1', 'G1_05	sgRNA-1	Yes	50.4', 'G1_06	sgRNA-1	Yes	47.8', 'G1_07	sgRNA-1	No	18.5', 'G1_08	sgRNA-1	Yes	53.0',
        'G2_01	sgRNA-2	Yes	31.4', 'G2_02	sgRNA-2	No	12.6', 'G2_03	sgRNA-2	Yes	28.9', 'G2_04	sgRNA-2	Yes	35.7', 'G2_05	sgRNA-2	No	14.2', 'G2_06	sgRNA-2	Yes	33.1', 'G2_07	sgRNA-2	Yes	29.8', 'G2_08	sgRNA-2	No	11.9',
      ].join('\n'),
    },
    correlation: {
      name: 'mRNA–蛋白表达相关', mode: 'correlation',
      text: [
        'Sample	mRNA_FoldChange	Protein_FoldChange	PhenotypeScore',
        'S01	0.62	0.71	18', 'S02	0.78	0.81	22', 'S03	0.91	0.88	25', 'S04	1.05	1.12	31', 'S05	1.18	1.21	34', 'S06	1.32	1.28	38',
        'S07	1.46	1.51	43', 'S08	1.61	1.58	47', 'S09	1.74	1.69	51', 'S10	1.92	1.87	56', 'S11	2.08	2.02	60', 'S12	2.23	2.18	64',
        'S13	2.41	2.36	68', 'S14	2.58	2.49	71', 'S15	2.76	2.69	75', 'S16	2.94	2.87	79', 'S17	3.11	3.02	82', 'S18	3.28	3.19	85',
      ].join('\n'),
    },
    quality: {
      name: '数据质量示例',
      headers: ['Value', 'Group', 'Percent'],
      rows: [['1,5', 'A', '12.5%'], ['2,5', 'A', '8%'], ['bad', 'B', ''], ['', 'B', '=1+1']],
      mode: 'overview',
    },
  };
  const example = examples[key] || examples.general;
  if (example.text) {
    const parsed = parseDelimited(example.text);
    state.headers = parsed.headers;
    state.rows = parsed.rows;
  } else {
    state.headers = example.headers.slice();
    state.rows = example.rows.map((row) => row.slice());
  }
  state.analysisMode = example.mode;
  state.valueColumn = example.value || state.headers.find((header) => header !== example.group) || state.headers[0];
  state.groupColumn = example.group || state.headers[0];
  state.categoryColumnA = example.a || state.headers[0];
  state.categoryColumnB = example.b || state.headers[1] || state.headers[0];
  page = 0;
  selectedRow = null;
  selectedColumn = null;
  refreshSelectors();
  renderEditor();
  updateControls();
  saveState();
  analyze();
  setEditorStatus(`已载入示例：${elements.exampleSelect.selectedOptions[0].textContent}`);
}

function exportLatest() {
  if (!latestResult.headers.length) return;
  const csv = `\uFEFF${toCsv(latestResult.headers, latestResult.rows)}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `analysis-result-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyLatest() {
  if (!latestResult.headers.length) return;
  const text = [latestResult.headers, ...latestResult.rows].map((row) => row.join('\t')).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    const original = elements.copyBtn.textContent;
    elements.copyBtn.textContent = '已复制';
    setTimeout(() => { elements.copyBtn.textContent = original; }, 1200);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

function bindStateSelect(element, key, { refresh = false } = {}) {
  element.addEventListener('change', () => {
    state[key] = element.value;
    if (refresh) refreshSelectors();
    updateControls();
    scheduleSave();
    analyze();
  });
}

function bindEvents() {
  bindStateSelect(elements.analysisMode, 'analysisMode', { refresh: true });
  bindStateSelect(elements.valueColumn, 'valueColumn', { refresh: true });
  bindStateSelect(elements.groupColumn, 'groupColumn');
  bindStateSelect(elements.categoryColumnA, 'categoryColumnA');
  bindStateSelect(elements.categoryColumnB, 'categoryColumnB');
  bindStateSelect(elements.correlationMethod, 'correlationMethod');
  bindStateSelect(elements.normalityMethod, 'normalityMethod');
  bindStateSelect(elements.varianceMethod, 'varianceMethod');
  bindStateSelect(elements.postHocMethod, 'postHocMethod');
  bindStateSelect(elements.correctionMethod, 'correctionMethod');
  bindStateSelect(elements.missingMode, 'missingMode');
  bindStateSelect(elements.decimalSeparator, 'decimalSeparator', { refresh: true });
  bindStateSelect(elements.percentMode, 'percentMode', { refresh: true });

  elements.fileInput.addEventListener('change', () => {
    const file = elements.fileInput.files?.[0];
    if (file) handleFile(file);
  });
  ['dragenter', 'dragover'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add('dragging');
  }));
  ['dragleave', 'drop'].forEach((eventName) => elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove('dragging');
  }));
  elements.dropZone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  elements.parseTableBtn.addEventListener('click', () => applyImportedData(parseDelimited(elements.pasteArea.value), '已解析粘贴表格'));
  elements.parseGroupsBtn.addEventListener('click', () => applyImportedData(parseGroupedText(elements.pasteArea.value), '已解析分组数据'));
  elements.clearInputBtn.addEventListener('click', () => { elements.pasteArea.value = ''; });
  elements.loadExampleBtn.addEventListener('click', () => loadExample(elements.exampleSelect.value));

  elements.newTableBtn.addEventListener('click', () => {
    state.headers = ['组别', '数值'];
    state.rows = emptyRows(10, 2);
    state.valueColumn = '数值';
    state.groupColumn = '组别';
    page = 0;
    selectedRow = null;
    selectedColumn = null;
    refreshSelectors();
    renderEditor();
    saveState();
    analyze();
  });
  elements.clearTableBtn.addEventListener('click', () => {
    state.rows = emptyRows(10, state.headers.length);
    page = 0;
    selectedRow = null;
    renderEditor();
    saveState();
    analyze();
  });
  elements.addRowBtn.addEventListener('click', () => {
    state.rows.push(Array(state.headers.length).fill(''));
    selectedRow = state.rows.length - 1;
    page = pageCount() - 1;
    renderEditor();
    scheduleSave();
    scheduleAnalysis();
    requestAnimationFrame(() => elements.dataBody.querySelector('tr:last-child input')?.focus());
  });
  elements.addColumnBtn.addEventListener('click', () => {
    const index = state.headers.length;
    state.headers.push(uniqueHeader(`字段 ${index + 1}`, index));
    state.rows.forEach((row) => row.push(''));
    selectedColumn = index;
    refreshSelectors();
    renderEditor();
    scheduleSave();
    scheduleAnalysis();
  });
  elements.deleteRowBtn.addEventListener('click', () => {
    if (selectedRow === null || selectedRow >= state.rows.length) return;
    state.rows.splice(selectedRow, 1);
    if (!state.rows.length) state.rows = emptyRows(10, state.headers.length);
    selectedRow = null;
    page = Math.min(page, pageCount() - 1);
    renderEditor();
    scheduleSave();
    scheduleAnalysis();
  });
  elements.deleteColumnBtn.addEventListener('click', () => {
    if (selectedColumn === null || state.headers.length <= 1) return;
    const old = state.headers[selectedColumn];
    state.headers.splice(selectedColumn, 1);
    state.rows.forEach((row) => row.splice(selectedColumn, 1));
    ['valueColumn', 'groupColumn', 'categoryColumnA', 'categoryColumnB'].forEach((key) => {
      if (state[key] === old) state[key] = '';
    });
    selectedColumn = null;
    refreshSelectors();
    renderEditor();
    scheduleSave();
    scheduleAnalysis();
  });
  elements.prevPageBtn.addEventListener('click', () => { page -= 1; renderEditor(); });
  elements.nextPageBtn.addEventListener('click', () => { page += 1; renderEditor(); });
  elements.copyBtn.addEventListener('click', copyLatest);
  elements.exportBtn.addEventListener('click', exportLatest);
  elements.resetBtn.addEventListener('click', () => {
    state = defaultState();
    page = 0;
    selectedRow = null;
    selectedColumn = null;
    localStorage.removeItem(STORAGE_KEY);
    refreshSelectors();
    renderEditor();
    updateControls();
    saveState();
    analyze();
  });
}

loadState();
bindEvents();
refreshSelectors();
renderEditor();
updateControls();
analyze();
