// XLSX / XLS 解析器 —— 将 Excel 工作簿（默认第一个 sheet）转换为题目数组
//
// 设计说明：
//  1) 列映射、题型识别、答案与选项拆分规则与 csvExtract.ts 完全对齐（含中文列名兼容），
//     使 Excel 与 CSV 导入产出结构一致的 ParsedQuestion，后续统一走 convertParsedQuestions。
//  2) ⚠️ 红线：SheetJS(xlsx) 与 mammoth / pdfjs-dist 同属重型依赖，
//     必须在函数内 `await import('xlsx')` 动态加载，严禁顶层静态引入。
import type { ParsedQuestion } from './types';

/** 默认分值（与 csvExtract 保持一致） */
const DEFAULT_POINTS = 5;

/**
 * 选项 / 多选答案的分隔符。
 * 在 csvExtract 的 [,，;；|] 基础上追加换行：Excel 单元格内换行（Alt+Enter）是常见的
 * 选项书写方式，而 CSV 的行式解析器不存在这种形态，属 Excel 专有的兼容增强。
 */
const VALUE_SEPARATOR = /[,，;；|\r\n]+/;

/** 列名别名表（与 csvExtract.ts 一一对应） */
const COLUMN_ALIASES: Record<string, string[]> = {
  type: ['type', '题型', '题目类型'],
  title: ['title', '题目', '题干', 'question'],
  options: ['options', '选项', 'choices'],
  answer: ['answer', '答案', 'correct'],
  explanation: ['explanation', '解析', '分析'],
  points: ['points', '分值', 'score', '分数'],
  code: ['code', '代码', '编程代码'],
  input: ['input', '输入', '输入样例'],
};

/** 缺一不可的三列（与 csvExtract 相同的校验口径） */
const REQUIRED_FIELDS: readonly string[] = ['type', 'title', 'answer'];

/** 缺列时抛出的引导文案 */
const FORMAT_HINT =
  'Excel 文件缺少必要的列。\n' +
  '必要的列包括：题型(type)、题目(title)、答案(answer)。\n' +
  '可选列包括：选项(options)、解析(explanation)、分值(points)。\n' +
  '示例表头（首行，一列一个字段）：\n' +
  'type | title | options | answer | explanation | points\n' +
  'single | 以下哪个是Python的关键字？ | import,def,print,return | def | def 用于定义函数 | 5';

/** 单元格 → 去空白字符串（number / boolean / Date / null 全部安全兜底） */
function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** 表头行 → 字段到列索引的映射（与 csvExtract 相同的「等值优先、包含兜底」策略） */
function buildColumnMap(headers: string[]): Record<string, number> {
  const columnMap: Record<string, number> = {};
  for (const [field, names] of Object.entries(COLUMN_ALIASES)) {
    for (const name of names) {
      const idx = headers.findIndex((h) => h === name || h.includes(name));
      if (idx !== -1) {
        columnMap[field] = idx;
        break;
      }
    }
  }
  return columnMap;
}

/** 题型文案 → 内部题型标识（判定顺序与 csvExtract 完全一致） */
function resolveQuestionType(raw: string): string {
  const typeValue = raw.toLowerCase();
  if (typeValue.includes('单')) return 'single';
  if (typeValue.includes('多')) return 'multiple';
  if (typeValue.includes('编程') || typeValue.includes('代码') || typeValue.includes('program')) {
    return 'programming';
  }
  if (typeValue.includes('single') || typeValue === '1' || typeValue === 'a') return 'single';
  if (typeValue.includes('multiple')) return 'multiple';
  return 'single';
}

/** 按分隔符切分为非空片段 */
function splitValues(raw: string): string[] {
  return raw
    .split(VALUE_SEPARATOR)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** 单行数据 → ParsedQuestion；题干为空时返回 null 由调用方跳过 */
function rowToQuestion(row: unknown[], columnMap: Record<string, number>): ParsedQuestion | null {
  const cell = (field: string): string => {
    const idx = columnMap[field];
    return idx === undefined ? '' : normalizeCell(row[idx]);
  };

  const title = cell('title');
  if (!title) return null;

  const type = resolveQuestionType(cell('type'));

  // 多选题答案按分隔符拆成数组，其余题型保持原始字符串
  const rawAnswer = cell('answer');
  const answer: string | string[] = type === 'multiple' ? splitValues(rawAnswer) : rawAnswer;

  // 编程题不需要选项
  let options: string[] | undefined;
  if (type !== 'programming') {
    const rawOptions = cell('options');
    if (rawOptions) options = splitValues(rawOptions);
  }

  let points = DEFAULT_POINTS;
  const rawPoints = cell('points');
  if (rawPoints) {
    const parsed = parseInt(rawPoints, 10);
    if (!Number.isNaN(parsed) && parsed > 0) points = parsed;
  }

  return {
    type,
    title,
    options,
    answer,
    explanation: cell('explanation') || undefined,
    points,
    code: cell('code') || undefined,
    input: cell('input') || undefined,
  };
}

/**
 * 解析 Excel 题库文件（.xlsx / .xls），只读取第一个工作表。
 * @param file 用户选择的 Excel 文件
 * @returns 统一的题目中间结构，交由 convertParsedQuestions 映射为领域 Question
 */
export async function parseXLSX(file: File): Promise<ParsedQuestion[]> {
  // 动态加载 SheetJS，避免进入首屏 bundle
  const XLSX = await import('xlsx');

  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel 文件中没有可读取的工作表。');
  }

  // header:1 → 逐行转成数组；raw:false 统一按显示值取字符串，规避数值/日期格式差异
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  });

  if (rows.length < 2) {
    throw new Error(`Excel 工作表「${sheetName}」内容不足，至少需要包含标题行和一行数据。`);
  }

  const headers = (rows[0] ?? []).map((header) => normalizeCell(header).toLowerCase());
  const columnMap = buildColumnMap(headers);

  const missingFields = REQUIRED_FIELDS.filter((field) => columnMap[field] === undefined);
  if (missingFields.length > 0) {
    throw new Error(FORMAT_HINT);
  }

  const questions: ParsedQuestion[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // 跳过空行
    if (!Array.isArray(row) || row.every((value) => normalizeCell(value) === '')) continue;

    try {
      const question = rowToQuestion(row, columnMap);
      if (!question) {
        console.warn(`跳过第 ${i + 1} 行：题目为空`);
        continue;
      }
      questions.push(question);
    } catch (err) {
      console.warn(`解析第 ${i + 1} 行时出错:`, err);
    }
  }

  if (questions.length === 0) {
    throw new Error('Excel 文件中没有找到有效的题目数据。');
  }

  return questions;
}
