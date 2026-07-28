/**
 * 标准化 MD 解析服务 — 将标准格式的 Markdown 题库直接解析为题目对象
 *
 * 支持两种格式：
 *
 * 1. 严格格式（带 ### 头）：
 *   ### 单选题 | 分值:5 | 难度:基础 | 知识点:二次函数
 *   题干：已知 $$f(x)=ax^2+bx+c$$
 *   A. 选项A
 *   B. 选项B
 *   C. 选项C
 *   D. 选项D
 *   **答案：B**
 *   解析：解析内容
 *
 * 2. 宽松格式（纯文本，无 ### 头，兼容 AI 生成输出）：
 *   单选题：
 *   题目标题
 *   A. 选项A
 *   B. 选项B
 *   C. 选项C
 *   D. 选项D
 *   答案：A
 *   解析：解析内容
 */
import type { ParsedQuestion } from './fileService';

// ===== 正则 =====

/** 匹配严格格式的头部：### 题型 | 分值:5 | 难度:基础 | 知识点:xxx */
const HEADER_STRICT = /^###\s+(?<type>[^|]+?)\s*[\|：]\s*分值[:：]\s*(?<score>\d+)\s*[\|；]\s*难度[:：]\s*(?<difficulty>[^|]+?)\s*[\|；]\s*知识点[:：]\s*(?<knowledge>.*)$/im;

/** 匹配宽松格式的题型行：单选题： / 多选题： / 判断题： / 填空题： */
const HEADER_RELAXED = /^(?<type>(?:单选|多选|判断|填空|简答|解答|编程|问答)题?)\s*[:：]/;

/** 匹配选项行：A. 内容 / A、内容 */
const OPTION_LINE = /^([A-Da-d])[\.、]\s*(.*)$/;

/** 匹配答案行：**答案：X** 或 答案：X 或 **答案: X** */
const ANSWER_LINE = /(?:\*\*)?答案\s*[:：]\s*(.+?)(?:\*\*)?\s*$/;

/** 匹配解析行：解析：xxx */
const ANALYSIS_LINE = /^解析\s*[:：]\s*(.*)$/;

/** 匹配题干标记：题干：xxx */
const STEM_LINE = /^题干\s*[:：]\s*(.*)$/;

// ===== 题型映射 =====

function normalizeType(raw: string): string {
  const t = raw.trim();
  if (/单选/.test(t)) return 'single';
  if (/多选/.test(t)) return 'multiple';
  if (/判断/.test(t)) return 'single';    // 判断题也用 single 类型，options 为 ['正确', '错误']
  if (/编程|代码/.test(t)) return 'programming';
  if (/填空/.test(t)) return 'programming'; // 填空题按编程题处理（自由输入）
  if (/简答|解答|问答/.test(t)) return 'programming';
  return 'single';
}

function isJudgement(options: string[] | undefined, _type: string): boolean {
  if (!options || options.length !== 2) return false;
  const norm = options.map(o => o.trim());
  return (
    (norm[0] === '正确' && norm[1] === '错误') ||
    (norm[0] === '对' && norm[1] === '错') ||
    (norm[0] === '√' && norm[1] === '×') ||
    (norm[0] === 'T' && norm[1] === 'F') ||
    (norm[0] === 'true' && norm[1] === 'false')
  );
}

// ===== 格式化 =====

/** 清理诊断字符串中的 Markdown 标记 */
function cleanAnswer(ans: string): string {
  return ans.replace(/\*\*/g, '').replace(/[（）()]/g, '').trim();
}

// ===== 单块解析 =====

function parseBlock(block: string): ParsedQuestion | null {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return null;

  const q: ParsedQuestion = { type: 'single', title: '', answer: '' };
  const options: string[] = [];
  let foundAnswer = false;
  let foundAnalysis = false;
  let foundStem = false;
  let titleLines: string[] = [];
  let parsingOptions = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. 尝试匹配头部（严格模式）
    if (i === 0) {
      const h = line.match(HEADER_STRICT);
      if (h?.groups) {
        q.type = normalizeType(h.groups.type);
        q.points = parseInt(h.groups.score, 10) || 5;
        // 知识点和难度作为 metadata 存在 explanation 开头
        continue;
      }
      // 尝试匹配宽松头部
      const r = line.match(HEADER_RELAXED);
      if (r?.groups) {
        q.type = normalizeType(r.groups.type);
        continue;
      }
    }

    // 2. 题干标记
    const stemMatch = line.match(STEM_LINE);
    if (stemMatch) {
      foundStem = true;
      titleLines.push(stemMatch[1]);
      continue;
    }
    if (foundStem && !parsingOptions && !ANSWER_LINE.test(line) && !ANALYSIS_LINE.test(line) && !OPTION_LINE.test(line)) {
      titleLines.push(line);
      continue;
    }

    // 3. 选项行
    const optMatch = line.match(OPTION_LINE);
    if (optMatch) {
      parsingOptions = true;
      foundStem = true;
      options.push(optMatch[2]);
      continue;
    }

    // 4. 答案行
    const ansMatch = line.match(ANSWER_LINE);
    if (ansMatch) {
      foundAnswer = true;
      q.answer = cleanAnswer(ansMatch[1]);
      continue;
    }

    // 5. 解析行
    const anaMatch = line.match(ANALYSIS_LINE);
    if (anaMatch) {
      foundAnalysis = true;
      q.explanation = anaMatch[1];
      continue;
    }
    if (foundAnalysis && q.explanation) {
      q.explanation += '\n' + line;
      continue;
    }

    // 6. 如果还没到选项/答案/解析，都是题干的一部分
    if (!foundAnswer && !foundAnalysis && !parsingOptions) {
      // 跳过首行的 "题干：" 标记（如果已经被 STEM_LINE 捕获，这里不会走到）
      if (!foundStem) {
        // 没有显式的 "题干：" 标记，整段都是题干
        titleLines.push(line);
      }
    }
  }

  // 组装题干
  q.title = titleLines
    .filter(l => l)
    .join('\n')
    .replace(/^题干\s*[:：]\s*/, '')
    .trim();

  if (!q.title) return null;

  // 组装选项
  if (options.length > 0) {
    q.options = options;
    // 如果是判断题，修正 type
    if (isJudgement(q.options, q.type)) {
      q.type = 'single';
      q.options = ['正确', '错误']; // 标准化判断题选项
    }
  } else if (q.type === 'single' || q.type === 'multiple') {
    // 选择题但没有选项 → 降级为编程题
    q.type = 'programming';
  }

  // 答案清理
  if (q.answer && typeof q.answer === 'string') {
    // 多选题答案可能是 A,B 或 AB 格式
    if (q.type === 'multiple') {
      q.answer = q.answer.split(/[,，、\s]/).map((s: string) => s.trim()).filter(Boolean);
    }
    // 单选题答案如果是字母且选项存在，保持字母形式
    if (q.type === 'single' && /^[A-D]$/i.test(q.answer as string) && q.options && q.options.length > 0) {
      // 保持字母答案，不转换
    }
  }

  if (!foundAnswer) {
    // 没有答案不阻塞，留空让 AI 后续补
    q.answer = '';
  }

  return q;
}

// ===== 块分割 =====

/**
 * 将 MD 内容分割为题目块。
 * 严格格式以 ### 开头，宽松格式以空行分隔。
 */
function splitBlocks(content: string): string[] {
  // 先尝试按 ### 分割（严格格式）
  const strictBlocks = content.split(/(?=^###\s)/m).filter(b => b.trim());
  if (strictBlocks.length > 1 || (strictBlocks.length === 1 && /^###\s/.test(strictBlocks[0].trim()))) {
    return strictBlocks;
  }

  // 降级到按空行分割（宽松格式）
  const relaxedBlocks = content.split(/\n\s*\n/).filter(b => b.trim());
  if (relaxedBlocks.length > 0) return relaxedBlocks;

  return [content];
}

// ===== 公开 API =====

/**
 * 解析严格格式（带 ### 头）的 MD 内容。
 * 格式示例：
 *   ### 单选题 | 分值:5 | 难度:基础 | 知识点:二次函数
 *   题干：...
 *   A. ...
 *   B. ...
 *   C. ...
 *   D. ...
 *   **答案：B**
 *   解析：...
 */
export function parseStandardizedMd(content: string): ParsedQuestion[] {
  const blocks = content.split(/(?=^###\s)/m).filter(b => /^###\s/.test(b.trim()));
  const results: ParsedQuestion[] = [];

  for (const block of blocks) {
    const q = parseBlock(block);
    if (q) results.push(q);
  }

  return results;
}

/**
 * 解析宽松格式（纯文本，无 ### 头）的 MD 内容。
 * 兼容 AI 生成输出的格式。
 * 格式示例：
 *   单选题：
 *   题目标题
 *   A. 选项A
 *   B. 选项B
 *   C. 选项C
 *   D. 选项D
 *   答案：A
 *   解析：解析内容
 */
export function parseRelaxedMd(content: string): ParsedQuestion[] {
  const blocks = splitBlocks(content);
  const results: ParsedQuestion[] = [];

  for (const block of blocks) {
    // 跳过没有题型标记的块
    if (!HEADER_RELAXED.test(block.trim())) continue;
    const q = parseBlock(block);
    if (q) results.push(q);
  }

  return results;
}

/**
 * 自动检测格式并解析 MD 内容。
 * 优先尝试严格格式，失败后降级到宽松格式。
 */
export function parseQuestionsFromMd(content: string): ParsedQuestion[] {
  if (!content.trim()) return [];

  // 尝试严格格式
  const strict = parseStandardizedMd(content);
  if (strict.length > 0) return strict;

  // 宽松格式
  const relaxed = parseRelaxedMd(content);
  if (relaxed.length > 0) return relaxed;

  return [];
}
