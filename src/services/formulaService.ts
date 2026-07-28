/**
 * 公式识别服务 — 将图片公式转为 LaTeX
 *
 * 流程:
 *   图片 base64 → AI vision（服务端 Gemini 优先 → 用户自配 Key 备用）
 *              → 判断是否为公式 → 返回 LaTeX 代码
 *
 * 并发控制: 最多 3 个请求同时进行，避免 rate limit
 * 超时:     每张图片 15 秒
 * 降级:     所有失败均返回 { isFormula: false, latex: '' }，不阻塞调用方
 */
import { getApiBaseUrl, getToken } from './api';
import type { AISettings } from '../types';
import { loadApiConfig } from '../config/apiConfig';

// ===== 常量 =====

/** 并发上限 */
const MAX_CONCURRENCY = 3;
/** 单张图片 AI 识别超时（毫秒） */
const TIMEOUT_MS = 15000;
/** 跳过极小图片的 base64 长度下限（小于此值的不送 AI，直接视为非公式） */
const MIN_BASE64_LENGTH = 100;

// ===== 类型 =====

export interface FormulaResult {
  /** 是否被识别为公式 */
  isFormula: boolean;
  /** 对应的 LaTeX 代码（非公式时为空字符串） */
  latex: string;
  /** 是否因为图片太小等原因被跳过 */
  skipped?: boolean;
}

// ===== Prompt =====

const FORMULA_PROMPT = `你是一个专业的公式识别专家。请识别这张图片中的内容。

规则：
1. 如果是数学/物理/化学公式，输出纯 LaTeX 代码，不要加任何解释文字
2. 行内公式用 $...$，独立公式用 $$...$$
3. 化学式用标准的 LaTeX 表示，如 \\ce{H2O}、\\ce{CO2}
4. 如果不是公式而是普通图片（插图、照片、图标、表格等），输出空字符串
5. 如果图片中同时包含公式和普通文字，保留文字内容，公式部分转为 LaTeX

只输出最终结果，不要输出任何其他文字。`;

// ===== 工具函数 =====

/**
 * 判断图片是否值得送 AI 识别。
 * 过小的图片（如装饰性图标）直接跳过以节省 token 和耗时。
 */
export function shouldProcessImage(base64Length: number): boolean {
  return base64Length >= MIN_BASE64_LENGTH;
}

// ===== AI 调用 =====

/**
 * 通过服务端 Gemini 代理识别图片（需登录且服务器配了 GEMINI_API_KEY）
 */
async function callServerVision(base64: string, prompt: string): Promise<string> {
  const token = getToken();
  if (!token) throw new Error('未登录');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${getApiBaseUrl()}/ai/gemini/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/png', data: base64 } },
          ],
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `服务端 AI 返回 ${res.status}`);
    }

    const data = await res.json();
    return (data.text || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 通过用户自配的 Gemini API Key 直连 Google 识别图片
 */
async function callDirectGemini(base64: string, prompt: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/png', data: base64 } },
            ],
          },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      throw new Error(`Gemini 直连返回 ${res.status}`);
    }

    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  } finally {
    clearTimeout(timer);
  }
}

// ===== 核心函数 =====

/**
 * 识别单张图片是否为公式，若是则返回 LaTeX 代码。
 *
 * @param imageBase64  图片 base64（不含 data:image/...;base64, 前缀）
 * @param context      图片周围的文字上下文（可选），辅助 AI 判断
 * @param settingsOverride 用户 AI 设置（可选），优先于 sessionStorage
 */
export async function imageToLatex(
  imageBase64: string,
  context?: string,
  settingsOverride?: AISettings
): Promise<FormulaResult> {
  const prompt = context
    ? `${FORMULA_PROMPT}\n\n上下文（图片周围文字）："${context.slice(0, 200)}"`
    : FORMULA_PROMPT;

  let result = '';

  // 路径 1：服务端 Gemini（最简单，用户只需登录）
  try {
    result = await callServerVision(imageBase64, prompt);
  } catch (e) {
    console.warn('formulaService: 服务端 Gemini 不可用，尝试直连', (e as Error).message);
  }

  // 路径 2：用户自配的 Gemini Key
  if (!result) {
    try {
      const settings = settingsOverride || loadApiConfig();
      const key = settings.geminiKey || process.env.GEMINI_API_KEY || '';
      if (key) {
        result = await callDirectGemini(imageBase64, prompt, key);
      }
    } catch (e) {
      console.warn('formulaService: 直连 Gemini 失败', (e as Error).message);
    }
  }

  // 没有拿到任何结果 → 非公式
  if (!result) {
    return { isFormula: false, latex: '' };
  }

  // 判断结果是否看起来像公式
  const hasLatexDelimiter = result.includes('$') || result.includes('\\(');
  const hasCommand = /\\[a-zA-Z]+/.test(result);
  const hasMathSymbol = /[=+\-*/^_{}√∫∑∏πθβαλμΔΩ∞≈≠≤≥±×÷]/.test(result);

  const isFormula = hasLatexDelimiter || hasCommand || hasMathSymbol;

  if (!isFormula) {
    // 有内容但不像公式（可能是普通文字识别结果 → 当作非公式，让调用方按原图处理）
    return { isFormula: false, latex: '' };
  }

  // 清理：确保 LaTeX 代码格式正确
  let latex = result
    .replace(/```latex\n?/gi, '')
    .replace(/```\n?/g, '')
    .trim();

  // 如果结果没有包裹在 $/$$ 中，且是多行，用 $$包裹
  if (!latex.startsWith('$')) {
    latex = latex.includes('\n') ? `$$\n${latex}\n$$` : `$${latex}$`;
  }

  return { isFormula: true, latex };
}

/**
 * 批量识别多张图片，控制并发数。
 *
 * @param images        图片列表（base64 data + 可选上下文）
 * @param onProgress    进度回调：(已处理数, 总数, 成功数, 失败数)
 * @param settingsOverride 用户 AI 设置
 */
export async function batchImageToLatex(
  images: Array<{ data: string; context?: string }>,
  onProgress?: (current: number, total: number, success: number, failed: number) => void,
  settingsOverride?: AISettings
): Promise<FormulaResult[]> {
  const results: FormulaResult[] = [];
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < images.length; i += MAX_CONCURRENCY) {
    const chunk = images.slice(i, i + MAX_CONCURRENCY);

    const chunkResults = await Promise.allSettled(
      chunk.map((img) => {
        if (!shouldProcessImage(img.data.length)) {
          return Promise.resolve<FormulaResult>({
            isFormula: false,
            latex: '',
            skipped: true,
          });
        }
        return imageToLatex(img.data, img.context, settingsOverride);
      })
    );

    for (const r of chunkResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
        if (r.value.isFormula) successCount++;
        else if (!r.value.skipped) failedCount++;
      } else {
        results.push({ isFormula: false, latex: '' });
        failedCount++;
      }
    }

    onProgress?.(Math.min(i + MAX_CONCURRENCY, images.length), images.length, successCount, failedCount);
  }

  return results;
}
