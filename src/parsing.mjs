// 数字解析与 CSV 解析 —— 从 core.mjs 提取，纯函数，不操作 DOM。
import { MAX_IMPORT_ROWS } from './core.mjs';

export function parseNumeric(rawValue, options = {}) {
  const {
    decimalSeparator = 'auto',
    percentMode = 'number',
  } = options;

  if (rawValue === null || rawValue === undefined) return { kind: 'missing', value: null, raw: '' };
  const raw = String(rawValue);
  let text = raw.trim();
  if (!text) return { kind: 'missing', value: null, raw };

  text = text
    .replace(/[−–—]/g, '-')
    .replace(/[  \s]/g, '');

  let isPercent = false;
  if (/[%％]$/.test(text)) {
    isPercent = true;
    text = text.slice(0, -1);
  }
  if (!text) return { kind: 'invalid', value: null, raw, reason: '百分号前缺少数字' };

  const signPattern = '[+-]?';
  const integerPattern = '\\d+';
  const dotGrouped = new RegExp(`^${signPattern}\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?$`);
  const commaGrouped = new RegExp(`^${signPattern}\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?$`);
  const plainDot = new RegExp(`^${signPattern}(?:${integerPattern}(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$`);
  const plainComma = new RegExp(`^${signPattern}(?:${integerPattern}(?:,\\d*)?|,\\d+)(?:[eE][+-]?\\d+)?$`);

  let normalized = text;
  const commaCount = (text.match(/,/g) || []).length;
  const dotCount = (text.match(/\./g) || []).length;

  if (decimalSeparator === 'dot') {
    if (commaCount) {
      if (!commaGrouped.test(text)) {
        return { kind: 'invalid', value: null, raw, reason: '逗号格式无法按千分位解析' };
      }
      normalized = text.replaceAll(',', '');
    }
    if (!plainDot.test(normalized)) return { kind: 'invalid', value: null, raw, reason: '不是有效数字' };
  } else if (decimalSeparator === 'comma') {
    if (commaCount) {
      if (dotCount && !dotGrouped.test(text)) {
        return { kind: 'invalid', value: null, raw, reason: '小数逗号与千分位格式不一致' };
      }
      normalized = text.replaceAll('.', '').replace(',', '.');
    } else {
      normalized = text;
    }
    if (!plainDot.test(normalized)) return { kind: 'invalid', value: null, raw, reason: '不是有效数字' };
  } else {
    if (commaCount && dotCount) {
      const lastComma = text.lastIndexOf(',');
      const lastDot = text.lastIndexOf('.');
      if (lastComma > lastDot) {
        if (!dotGrouped.test(text)) return { kind: 'invalid', value: null, raw, reason: '混合分隔符格式不一致' };
        normalized = text.replaceAll('.', '').replace(',', '.');
      } else {
        if (!commaGrouped.test(text)) return { kind: 'invalid', value: null, raw, reason: '混合分隔符格式不一致' };
        normalized = text.replaceAll(',', '');
      }
    } else if (commaCount) {
      if (commaGrouped.test(text)) {
        normalized = text.replaceAll(',', '');
      } else if (commaCount === 1 && plainComma.test(text)) {
        normalized = text.replace(',', '.');
      } else {
        return { kind: 'invalid', value: null, raw, reason: '逗号数字格式不明确' };
      }
    }
    if (!plainDot.test(normalized)) return { kind: 'invalid', value: null, raw, reason: '不是有效数字' };
  }

  let value = Number(normalized);
  if (!Number.isFinite(value)) return { kind: 'invalid', value: null, raw, reason: '数值超出范围' };
  if (isPercent && percentMode === 'fraction') value /= 100;
  return { kind: 'number', value, raw, isPercent };
}

function logicalRecords(text, maximum = 30) {
  const records = [];
  let record = '';
  let quoted = false;
  for (let index = 0; index < text.length && records.length < maximum; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      record += char;
      if (quoted && next === '"') {
        record += next;
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      if (record.trim()) records.push(record);
      record = '';
    } else {
      record += char;
    }
  }
  if (record.trim() && records.length < maximum) records.push(record);
  return records;
}

function countOutsideQuotes(record, delimiter) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < record.length; index += 1) {
    const char = record[index];
    const next = record[index + 1];
    if (char === '"') {
      if (quoted && next === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectDelimiter(text) {
  const records = logicalRecords(String(text).replace(/^﻿/, ''), 30);
  if (!records.length) return ',';
  const candidates = ['\t', ';', ','];
  const scored = candidates.map((delimiter) => {
    const counts = records.map((record) => countOutsideQuotes(record, delimiter));
    const positive = counts.filter((count) => count > 0);
    if (!positive.length) return { delimiter, score: 0, mode: 0 };
    const frequencies = new Map();
    positive.forEach((count) => frequencies.set(count, (frequencies.get(count) || 0) + 1));
    let mode = positive[0];
    let modeFrequency = 0;
    frequencies.forEach((frequency, count) => {
      if (frequency > modeFrequency || (frequency === modeFrequency && count > mode)) {
        mode = count;
        modeFrequency = frequency;
      }
    });
    const coverage = positive.length / records.length;
    const consistency = modeFrequency / positive.length;
    return { delimiter, mode, score: mode * 100 + coverage * 20 + consistency * 10 };
  });
  scored.sort((a, b) => b.score - a.score || candidates.indexOf(a.delimiter) - candidates.indexOf(b.delimiter));
  return scored[0].score > 0 ? scored[0].delimiter : ',';
}

export function parseDelimited(text, options = {}) {
  const source = String(text ?? '').replace(/^﻿/, '');
  const delimiter = options.delimiter || detectDelimiter(source);
  const parsedRows = [];
  const errors = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let quotedCell = false;
  let justClosedQuote = false;

  const pushCell = () => {
    row.push(quotedCell ? cell : cell.trim());
    cell = '';
    quotedCell = false;
    justClosedQuote = false;
  };
  const pushRow = () => {
    if (row.some((value) => value !== '')) parsedRows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
        justClosedQuote = true;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"' && cell.trim() === '' && !quotedCell) {
      cell = '';
      quotedCell = true;
      inQuotes = true;
    } else if (char === delimiter) {
      pushCell();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') index += 1;
      pushCell();
      pushRow();
    } else if (justClosedQuote && /\s/.test(char)) {
      // 容忍结束引号与分隔符之间的空白。
    } else {
      if (justClosedQuote) {
        errors.push({ code: 'CHAR_AFTER_QUOTE', index, message: '结束引号后出现非分隔字符' });
        justClosedQuote = false;
      }
      cell += char;
    }
  }

  if (inQuotes) {
    errors.push({ code: 'UNCLOSED_QUOTE', index: source.length, fatal: true, message: '文件中存在未闭合的引号' });
  }
  pushCell();
  pushRow();

  if (!parsedRows.length) return { headers: [], rows: [], delimiter, errors };
  if (parsedRows.length > MAX_IMPORT_ROWS + 1) {
    errors.push({ code: 'TOO_MANY_ROWS', fatal: true, message: `最多支持 ${MAX_IMPORT_ROWS.toLocaleString()} 行数据` });
  }

  if (options.header === false) {
    const width = Math.max(...parsedRows.map((item) => item.length));
    const rows = parsedRows.slice(0, MAX_IMPORT_ROWS).map((item) => Array.from({ length: width }, (_, index) => item[index] ?? ''));
    return { headers: [], rows, delimiter, errors };
  }

  const width = Math.max(...parsedRows.map((item) => item.length));
  const rawHeaders = parsedRows[0];
  const headers = [];
  for (let index = 0; index < width; index += 1) {
    const base = String(rawHeaders[index] ?? '').trim() || `字段 ${index + 1}`;
    let name = base;
    let suffix = 2;
    while (headers.includes(name)) {
      name = `${base} (${suffix})`;
      suffix += 1;
    }
    headers.push(name);
  }
  const rows = parsedRows.slice(1, MAX_IMPORT_ROWS + 1).map((item) => headers.map((_, index) => item[index] ?? ''));
  return { headers, rows, delimiter, errors };
}

export function columnProfile(values, numberOptions = {}) {
  let missing = 0;
  let invalid = 0;
  const numbers = [];
  const nonEmptyValues = [];
  values.forEach((raw) => {
    const parsed = parseNumeric(raw, numberOptions);
    if (parsed.kind === 'missing') missing += 1;
    else {
      nonEmptyValues.push(String(raw));
      if (parsed.kind === 'number') numbers.push(parsed.value);
      else invalid += 1;
    }
  });
  const nonEmpty = values.length - missing;
  const numericRatio = nonEmpty ? numbers.length / nonEmpty : 0;
  const eligibleForNumericAnalysis = numbers.length >= 3 && numericRatio >= 0.8;
  return {
    total: values.length,
    missing,
    nonEmpty,
    validNumeric: numbers.length,
    invalid,
    numbers,
    unique: new Set(nonEmptyValues).size,
    numericRatio,
    isNumeric: nonEmpty > 0 && numericRatio >= 0.8,
    eligibleForNumericAnalysis,
  };
}

export function extractNumeric(values, options = {}) {
  const { missingMode = 'ignore', numberOptions = {} } = options;
  const numbers = [];
  const invalidRows = [];
  const missingRows = [];
  values.forEach((raw, index) => {
    const parsed = parseNumeric(raw, numberOptions);
    if (parsed.kind === 'number') numbers.push(parsed.value);
    else if (parsed.kind === 'missing') {
      missingRows.push(index);
      if (missingMode === 'zero') numbers.push(0);
    } else {
      invalidRows.push(index);
    }
  });
  return { numbers, invalidRows, missingRows };
}
