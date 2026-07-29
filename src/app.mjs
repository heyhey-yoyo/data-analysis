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
  exactTwoSamplePermutation,
  fixedMarginExact,
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
let latestResult = { headers: [], rows: [] };

const pendingWorkerTasks = new Map();
let workerTaskId = 0;
let analysisWorker = null;
try {
  analysisWorker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
  analysisWorker.addEventListener('message', (event) => {
    const pending = pendingWorkerTasks.get(event.data?.id);
    if (!pending) return;
    pendingWorkerTasks.delete(event.data.id);
    if (event.data.ok) pending.resolve(event.data.result);
    else pending.reject(new Error(event.data.error || 'Worker 计算失败'));
  });
  analysisWorker.addEventListener('error', () => {
    analysisWorker = null;
    pendingWorkerTasks.forEach(({ reject }) => reject(new Error('Worker 不可用')));
    pendingWorkerTasks.clear();
  });
} catch {
  analysisWorker = null;
}

function runHeavyTask(task, payload) {
  if (!analysisWorker) {
    if (task === 'two-sample-permutation') return Promise.resolve(exactTwoSamplePermutation(payload.valuesA, payload.valuesB, payload.options));
    if (task === 'fixed-margin-exact') return Promise.resolve(fixedMarginExact(payload.counts, payload.options));
    return Promise.reject(new Error('未知计算任务'));
  }
  const id = ++workerTaskId;
  return new Promise((resolve, reject) => {
    pendingWorkerTasks.set(id, { resolve, reject });
    analysisWorker.postMessage({ id, task, payload });
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

function refreshSelectors() {
  const currentProfiles = profiles();
  const numericHeaders = currentProfiles.filter((profile) => profile.isNumeric || profile.validNumeric >= 2).map((profile) => profile.header);
  const valueOptions = numericHeaders.length ? numericHeaders : state.headers;
  if (!valueOptions.includes(state.valueColumn)) state.valueColumn = valueOptions[0] || '';
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
  elements.correctionMethod.title = state.postHocMethod === 'fisher-lsd' ? 'Fisher LSD 按定义不做多重校正。' : correctionBuiltIn ? '该方法使用自身的家族错误控制。' : '';
  elements.missingField.classList.toggle('hidden', !['overview', 'descriptive', 'group-summary'].includes(mode));

  const notes = {
    overview: '概览会分别报告非空值、有效数值、无效格式和缺失值；不会再把“bad”等录入错误算作 0。',
    descriptive: '对所选数值字段做描述统计与正态性诊断；选择分组字段后同时检查方差齐性。',
    'group-summary': '只有真正空白的数值单元格可按 0 处理；非法文本始终排除并报警。',
    correlation: '采用逐对完整观测，每一对变量会显示独立的实际样本量 N。',
    categorical: '同时报告 Pearson χ²；固定边际精确枚举有独立的“组合过多”和“超时”状态。',
    'two-group': '推断检验固定剔除缺失和非法值；精确均值置换在 Worker 中运行，避免阻塞页面。',
    'multi-group': '可自动或手动选择正态性与方差诊断；Tukey / Games–Howell 的有限 df 计算不再在 200 处跳变。',
  };
  elements.modeNote.textContent = notes[mode] || '';
}

function scheduleAnalysis() {
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(() => analyze(), 180);
}

function buildGroups({ allowMissingZero = false } = {}) {
  const groupIndex = state.headers.indexOf(state.groupColumn);
  const valueIndex = state.headers.indexOf(state.valueColumn);
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

async function analyze() {
  const version = ++analysisVersion;
  const currentProfiles = profiles();
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
  const numericHeaders = currentProfiles.filter((profile) => profile.isNumeric && profile.validNumeric >= 3).map((profile) => profile.header);
  const rows = [];
  for (let i = 0; i < numericHeaders.length; i += 1) {
    for (let j = i + 1; j < numericHeaders.length; j += 1) {
      const a = numericSeries(numericHeaders[i]);
      const b = numericSeries(numericHeaders[j]);
      if (state.correlationMethod !== 'spearman') {
        const result = pearsonCorrelation(a, b);
        if (result) rows.push([numericHeaders[i], numericHeaders[j], 'Pearson', formatNumber(result.coefficient), pCell(result.pValue), result.n]);
      }
      if (state.correlationMethod !== 'pearson') {
        const result = spearmanCorrelation(a, b);
        if (result) rows.push([numericHeaders[i], numericHeaders[j], 'Spearman', formatNumber(result.coefficient), pCell(result.pValue), result.n]);
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
  const normalities = numericHeaders.map((header) => runNormalityTest(numericSeries(header).filter(Number.isFinite), state.normalityMethod));
  const allNormal = normalities.length >= 2 && normalities.every((result) => result.status === 'pass');
  setRecommendation(allNormal
    ? '所选正态性诊断均未提示明显偏离，可优先参考 Pearson；仍应检查线性关系和异常值。逐对 N 不一致时应谨慎比较系数。'
    : '至少一个字段偏离正态或无法可靠判断，可优先参考 Spearman；同时检查单调性、异常值和逐对 N。');
}

async function analyzeCategorical(currentProfiles, version) {
  const built = buildContingency();
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
  const exact = await runHeavyTask('fixed-margin-exact', { counts: built.counts, options: { maximumTables: 100000, timeLimitMilliseconds: 1800 } });
  if (version !== analysisVersion) return;
  const statusText = {
    exact: `枚举 ${exact.tableCount.toLocaleString()} 个表`,
    'too-many-tables': `组合超过 100,000（已枚举 ${exact.tableCount.toLocaleString()}）`,
    timeout: `超过 1.8 秒（已枚举 ${exact.tableCount.toLocaleString()}）`,
    'enumeration-failed': '枚举失败',
    invalid: '不适用',
  }[exact.status] || exact.status;
  setMainResult('分类变量关联检验', 'Pearson χ² 为渐近检验；期望频数较小时优先参考成功完成的固定边际精确结果。', ['方法', '统计量', 'df', 'P', '效应 / 状态'], [
    ['Pearson χ²', formatNumber(summary.statistic), summary.df, pCell(summary.pValue), `Cramér V = ${formatNumber(summary.cramerV)}`],
    ['固定边际精确 P', formatNumber(summary.statistic), '固定边际', exact.status === 'exact' ? pCell(exact.pValue) : '—', statusText],
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
    ['等方差 t', formatNumber(pooled.statistic), formatNumber(pooled.df), pCell(pooled.pValue), `Cohen d = ${formatNumber(pooled.effect)}`, '参数法'],
    ['Welch t', formatNumber(welch.statistic), formatNumber(welch.df), pCell(welch.pValue), '—', '不要求方差相等'],
    ['Mann–Whitney U', `${formatNumber(mw.statistic)}（Z=${formatNumber(mw.z)}）`, '—', pCell(mw.pValue), `秩二列相关 = ${formatNumber(mw.effect)}`, 'U=均值时连续性校正为 0'],
    ['精确均值置换', '—', '—', '计算中…', '—', 'Web Worker'],
  ];
  setMainResult('两独立样本检验', '精确置换正在后台计算。推断分析始终剔除缺失和非法格式。', ['方法', '统计量', 'df', 'P', '效应量', '说明'], rows);
  const descriptiveRows = built.labels.map((label, index) => {
    const normal = normality.results[index];
    const summary = summaries[index];
    return [label, summary.count, formatNumber(summary.mean), formatNumber(summary.sd), formatNumber(summary.median), normal?.name || '—', normal?.status === 'insufficient' ? '样本量不足' : formatP(normal?.pValue)];
  });
  descriptiveRows.push(['方差齐性', '—', '—', '—', '—', variance?.name || '无法计算', variance ? formatP(variance.pValue) : '—']);
  setSecondary('组别描述与诊断', '自动模式会按样本量与重复值比例选择正态性检验；方差诊断可自动选择 Bartlett 或 Brown–Forsythe。', ['组别', 'N', '均值', 'SD', '中位数', '诊断方法', '诊断 P'], descriptiveRows);

  const exact = await runHeavyTask('two-sample-permutation', { valuesA: built.groups[0], valuesB: built.groups[1], options: { maximumPermutations: 100000, timeLimitMilliseconds: 1800 } });
  if (version !== analysisVersion) return;
  const statusText = {
    exact: `${exact.extremeCount}/${exact.totalCount} 个排列同样或更极端`,
    'too-many-combinations': `组合数超过 100,000（估计 ${Math.round(exact.estimatedCount).toLocaleString()}）`,
    timeout: `超过 1.8 秒（完成 ${exact.totalCount.toLocaleString()} / ${exact.estimatedCount.toLocaleString()}）`,
    'enumeration-failed': '枚举数量校验失败',
    invalid: '不适用',
  }[exact.status] || exact.status;
  rows[3] = ['精确均值置换', formatNumber(exact.observedDifference), '固定组大小', exact.status === 'exact' ? pCell(exact.pValue) : '—', '均值差', statusText];
  setMainResult('两独立样本检验', '多种结果并列展示；方法选择应结合分布、方差、测量尺度和研究设计。', ['方法', '统计量', 'df', 'P', '效应量', '说明'], rows);

  if (normality.allPass && variance?.pValue >= ALPHA) setRecommendation('自动建议：正态性诊断未提示明显偏离且方差诊断通过，可优先参考等方差 t；同时报告效应量与置信区间会更完整。');
  else if (normality.allPass) setRecommendation('自动建议：正态性诊断未提示明显偏离，但方差可能不齐，优先参考 Welch t。');
  else if (normality.anyFail) setRecommendation('自动建议：至少一组的正态性诊断提示偏离，可优先参考 Mann–Whitney 或成功完成的精确置换，并注意它们检验的假设并不完全相同。');
  else setRecommendation('样本量不足以完成全部正态性诊断；建议结合图形、异常值和研究背景，通常优先参考更稳健的 Welch t，并与秩检验对照。');
}

function analyzeMultiGroup() {
  const built = buildGroups();
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
    ['经典单因素 ANOVA', formatNumber(anova?.statistic), `${formatNumber(anova?.df1)}, ${formatNumber(anova?.df2)}`, pCell(anova?.pValue), `η² = ${formatNumber(anova?.etaSquared)}`],
    ['Welch ANOVA', formatNumber(welch?.statistic), `${formatNumber(welch?.df1)}, ${formatNumber(welch?.df2)}`, pCell(welch?.pValue), '方差不齐稳健'],
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
    if (normality.allPass && variance?.pValue >= ALPHA) method = 'tukey';
    else if (normality.allPass) method = 'games-howell';
    else method = 'dunn';
  }
  const postHoc = postHocComparisons(built.labels, built.groups, method, state.correctionMethod);
  const methodLabels = {
    tukey: 'Tukey–Kramer', 'games-howell': 'Games–Howell', 'fisher-lsd': 'Fisher LSD', pooled: '两两 pooled t', welch: '两两 Welch t', dunn: 'Dunn', 'mann-whitney': '两两 Mann–Whitney U',
  };
  const postRows = postHoc.map((row) => [row.comparison, formatNumber(row.difference), formatNumber(row.statistic), formatNumber(row.df), pCell(row.pValue), pCell(row.adjustedP), row.correction === 'builtin' ? '学生化极差内置控制' : row.correction === 'none' ? '不校正' : row.correction]);
  setSecondary(`${methodLabels[method] || method} 事后比较`, 'Tukey 与 Games–Howell 使用学生化极差分布；Fisher LSD 不做多重校正；其他方法使用所选校正。', ['比较', '差值', '统计量', 'df', '原始 P', '校正 P', '校正'], postRows);

  if (normality.allPass && variance?.pValue >= ALPHA) setRecommendation(`自动建议：优先参考经典 ANOVA，并使用 ${methodLabels[method]}。`);
  else if (normality.allPass) setRecommendation(`自动建议：方差可能不齐，优先参考 Welch ANOVA，并使用 ${methodLabels[method]}。`);
  else if (normality.anyFail) setRecommendation(`自动建议：分布诊断提示偏离，优先参考 Kruskal–Wallis，并使用 ${methodLabels[method]}。`);
  else setRecommendation(`部分组 n < 8，正态性判断有限；建议对照 Welch ANOVA 与 Kruskal–Wallis，当前事后方法为 ${methodLabels[method]}。`);
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
  setEditorStatus(`${message}；识别分隔符：${parsed.delimiter === '\t' ? 'Tab' : parsed.delimiter}${nonFatal.length ? `；另有 ${nonFatal.length} 个格式警告` : ''}`);
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
  let allColon = lines.length > 0;
  lines.forEach((line) => {
    const match = line.match(/^([^:：]+?)\s*[:：]\s*(.+)$/);
    if (!match) { allColon = false; return; }
    const label = match[1].trim();
    const body = match[2].trim();
    const tokens = /[;；]/.test(body)
      ? body.split(/[;；，\s]+/).filter(Boolean)
      : body.split(/[，\s]+|,(?=\s*[-+]?\d)/).filter(Boolean);
    tokens.forEach((token) => {
      const parsed = parseNumeric(token, numberOptions());
      if (parsed.kind === 'number') colonRows.push([label, String(parsed.value)]);
    });
  });
  if (allColon && colonRows.length) return { headers: ['组别', '数值'], rows: colonRows, delimiter: '分组格式', errors: [] };

  const wide = parseDelimited(text);
  if (wide.errors.some((error) => error.fatal)) return wide;
  const rows = [];
  wide.headers.forEach((header, columnIndex) => {
    wide.rows.forEach((sourceRow) => {
      const parsed = parseNumeric(sourceRow[columnIndex], numberOptions());
      if (parsed.kind === 'number') rows.push([header, String(parsed.value)]);
    });
  });
  return rows.length
    ? { headers: ['组别', '数值'], rows, delimiter: wide.delimiter, errors: wide.errors }
    : { headers: [], rows: [], delimiter: wide.delimiter, errors: [{ fatal: true, message: '未识别到分组数值' }] };
}

function loadExample(key) {
  const examples = {
    two: {
      headers: ['组别', '数值'],
      rows: [
        ['对照', '9.8'], ['对照', '10.4'], ['对照', '9.9'], ['对照', '10.2'], ['对照', '10.0'], ['对照', '10.3'],
        ['处理', '11.5'], ['处理', '12.0'], ['处理', '11.8'], ['处理', '12.3'], ['处理', '11.7'], ['处理', '12.1'],
      ],
      mode: 'two-group', value: '数值', group: '组别',
    },
    multi: {
      headers: ['组别', '表达量'],
      rows: [
        ['对照', '1.02'], ['对照', '0.96'], ['对照', '1.08'], ['对照', '1.01'], ['对照', '0.99'],
        ['低剂量', '1.18'], ['低剂量', '1.25'], ['低剂量', '1.21'], ['低剂量', '1.16'], ['低剂量', '1.23'],
        ['高剂量', '1.53'], ['高剂量', '1.62'], ['高剂量', '1.58'], ['高剂量', '1.47'], ['高剂量', '1.66'],
      ],
      mode: 'multi-group', value: '表达量', group: '组别',
    },
    correlation: {
      headers: ['mRNA', '蛋白', '活性'],
      rows: [
        ['1.1', '0.9', '12'], ['1.4', '1.2', '15'], ['1.8', '1.5', '18'], ['2.1', '', '21'],
        ['2.4', '2.0', '24'], ['2.7', '2.2', ''], ['3.0', '2.7', '29'], ['3.4', '3.0', '31'],
      ],
      mode: 'correlation',
    },
    categorical: {
      headers: ['治疗', '结局'],
      rows: [
        ...Array.from({ length: 14 }, () => ['A', '改善']), ...Array.from({ length: 6 }, () => ['A', '未改善']),
        ...Array.from({ length: 7 }, () => ['B', '改善']), ...Array.from({ length: 13 }, () => ['B', '未改善']),
      ],
      mode: 'categorical', a: '治疗', b: '结局',
    },
    quality: {
      headers: ['Value', 'Group', 'Percent'],
      rows: [['1,5', 'A', '12.5%'], ['2,5', 'A', '8%'], ['bad', 'B', ''], ['', 'B', '=1+1']],
      mode: 'overview',
    },
  };
  const example = examples[key] || examples.two;
  state.headers = example.headers.slice();
  state.rows = example.rows.map((row) => row.slice());
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
