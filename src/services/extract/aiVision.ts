// 多模态 AI 视觉识别（方案C：纯 AI 识别整页内容）
import { loadPdfjs, extractPageImage, canvasToBase64 } from './types';
import { loadApiConfig } from '../../config/apiConfig';
import type { AISettings } from '../../types';

const AI_VISION_PROMPT = `你是一个专业的试卷识别与转录专家。请将这张PDF页面的所有内容完整转录为结构化文本，**不得遗漏任何元素**：

**必须识别并输出的内容：**

1. **文字内容**：逐字转录，保持标题层级、段落结构、题号标记
2. **图片与插图**：用 \`【图片描述：...】\` 格式详细描述图片内容（如实验装置图、流程图、结构图等）
3. **数学公式**：严格使用标准 LaTeX 语法。行内公式用 \$...\$，块级公式用 \$\$...\$\$。
   常见符号：分数 \\frac{}{}、根号 \\sqrt{}、上下标 _{} ^{}、积分 \\int、求和 \\sum、极限 \\lim
   希腊字母：\\alpha \\beta \\gamma \\theta \\pi \\Delta \\Omega
4. **化学式与化学反应**：全部用 LaTeX 表示。化学式用下标写法如 H\$_2\$O、CO\$_2\$，离子用上标 Na\$^+\$、OH\$^-\$，反应方程式用 \$\$...\$\$ 块，箭头用 \\rightarrow、\\leftarrow、\\rightleftharpoons
5. **表格**：用Markdown表格格式完整输出，包含所有行列和数据
6. **图表与坐标图**：描述图表类型、坐标轴含义、数据趋势等关键信息
7. **特殊符号**：单位符号（℃、°、′、″）、上下标、箭头等必须准确转录

**关键要求：**
- 不要省略任何页面元素，即使看起来不重要的内容也要包含
- 严格遵循原页面的逻辑顺序（从上到下、从左到右）
- 对于混合排版的页面，先转录文字再描述图片
- **所有公式必须严格使用LaTeX语法，确保可被渲染**
- **化学方程式中的反应条件（点燃、加热、催化剂等）要在箭头上下方标注**
- **绝对禁止**：将公式写成普通文本（如把 H₂O 写成 H2O，把 x² 写成 x2）`;

async function callGeminiVision(
  base64: string,
  prompt: string,
  apiKey: string,
  model?: string,
  maxOutputTokens?: number
): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: model || 'gemini-3-flash-preview',
    config: {
      maxOutputTokens: maxOutputTokens || 8192,
    },
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: base64 } },
      ],
    },
  });

  return response.text?.trim() || '';
}

async function callOpenAIVision(
  base64: string,
  prompt: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  maxTokens: number = 2000
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
          ],
        },
      ],
      max_tokens: maxTokens,
      stream: false,
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

/** 通过服务端 Gemini 代理发送图片识别请求（无需用户自有 Key） */
async function callServerGeminiVision(
  base64: string,
  prompt: string,
  model?: string
): Promise<string> {
  const { getToken, getApiBaseUrl } = await import('../api');
  const token = getToken();
  if (!token) throw new Error('未登录，无法使用服务端 AI');

  const res = await fetch(`${getApiBaseUrl()}/ai/gemini/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: model || 'gemini-3-flash-preview',
      contents: {
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: base64 } },
        ],
      },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `服务端 Gemini 请求失败 (${res.status})`);
  }
  const data = await res.json();
  return data.text?.trim() || '';
}

/** 模型到视觉提供商的映射 */
function getModelVisionConfig(modelName: string, settingsOverride?: AISettings) {
  const settings = settingsOverride || loadApiConfig();

  if (modelName.startsWith('gemini') && settings.geminiKey) {
    return { type: 'gemini' as const, key: settings.geminiKey, model: modelName };
  }
  if (modelName.startsWith('deepseek') && settings.deepseekKey) {
    return { type: 'openai' as const, baseUrl: 'https://api.deepseek.com/v1', key: settings.deepseekKey, model: 'deepseek-chat' };
  }
  if (modelName.startsWith('qwen') && settings.qwenKey) {
    return { type: 'openai' as const, baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: settings.qwenKey, model: 'qwen-vl-max' };
  }
  if (modelName === 'openrouter' && settings.openrouterKey) {
    return { type: 'openai' as const, baseUrl: 'https://openrouter.ai/api/v1', key: settings.openrouterKey, model: settings.openrouterModel || 'google/gemini-2.0-flash-001' };
  }
  if (modelName === 'custom' && settings.customKey && settings.customEndpoint) {
    return { type: 'openai' as const, baseUrl: settings.customEndpoint, key: settings.customKey, model: 'custom-model' };
  }
  return null;
}

function isRateLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || '')).toLowerCase();
  return /(429|quota|rate.?limit|exceeded|too many requests|resource.*exhaust)/i.test(msg);
}

/** 将页面图片发送到多模态 AI 获取识别结果，优先使用指定模型，失败时回退 */
async function recognizePageWithAI(
  canvas: HTMLCanvasElement,
  prompt: string,
  modelName: string,
  maxTokens?: number,
  settingsOverride?: AISettings
): Promise<string> {
  const base64 = canvasToBase64(canvas);
  let lastError = '';

  // 1. 使用指定模型
  const config = getModelVisionConfig(modelName, settingsOverride);
  if (config) {
    try {
      if (config.type === 'gemini') {
        return await callGeminiVision(base64, prompt, config.key, config.model, maxTokens);
      } else {
        return await callOpenAIVision(base64, prompt, config.baseUrl, config.key, config.model, maxTokens);
      }
    } catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn(`Model ${modelName} vision failed, trying fallbacks:`, e);
    }
  }

  // 2. 如果指定模型未配置或失败，尝试服务端 Gemini 代理（仅限 gemini 模型）
  if (modelName.startsWith('gemini')) {
    try { return await callServerGeminiVision(base64, prompt, modelName); }
    catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('Server Gemini vision failed:', e);
    }
  }

  // 3. 回退：尝试所有已配置的提供商
  const settings = settingsOverride || loadApiConfig();
  if (settings.geminiKey && !modelName.startsWith('gemini')) {
    try { return await callGeminiVision(base64, prompt, settings.geminiKey, 'gemini-3-flash-preview', maxTokens); }
    catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('Gemini fallback failed:', e);
    }
  }
  if (settings.deepseekKey && !modelName.startsWith('deepseek')) {
    try {
      return await callOpenAIVision(base64, prompt, 'https://api.deepseek.com/v1', settings.deepseekKey, 'deepseek-chat', maxTokens);
    } catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('DeepSeek fallback failed:', e);
    }
  }
  if (settings.qwenKey && !modelName.startsWith('qwen')) {
    try {
      return await callOpenAIVision(base64, prompt, 'https://dashscope.aliyuncs.com/compatible-mode/v1', settings.qwenKey, 'qwen-vl-max', maxTokens);
    } catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('Qwen fallback failed:', e);
    }
  }
  if (settings.openrouterKey && modelName !== 'openrouter') {
    try {
      const m = settings.openrouterModel || 'google/gemini-2.0-flash-001';
      return await callOpenAIVision(base64, prompt, 'https://openrouter.ai/api/v1', settings.openrouterKey, m, maxTokens);
    } catch (e) {
      lastError = (e as Error).message || String(e);
      console.warn('OpenRouter fallback failed:', e);
    }
  }
  // 最后尝试服务端代理
  try { return await callServerGeminiVision(base64, prompt); }
  catch (e) {
    lastError = (e as Error).message || String(e);
    console.warn('Server fallback failed:', e);
  }

  throw new Error(lastError || '所有 AI 提供商均识别失败');
}

/** 在线AI识别 PDF：将每页渲染为图片，发送到多模态 AI 直接识别全部内容（文字+图表+公式）
 *  @param modelName 模型名称，如 gemini-3-flash-preview、deepseek-v4-flash、qwen-max 等
 *  @param settingsOverride 用户服务端保存的 AI 设置（优先于 sessionStorage） */
export async function parsePdfWithAIVision(
  file: File,
  modelName: string,
  onProgress?: (progress: { current: number; total: number; status: string }) => void,
  settingsOverride?: AISettings
): Promise<{ content: string }> {
  const settings = settingsOverride || loadApiConfig();
  const { getToken } = await import('../api');
  const config = getModelVisionConfig(modelName, settingsOverride);
  const hasKey = !!(config || settings.geminiKey || settings.deepseekKey || settings.openrouterKey || settings.qwenKey);
  const isLoggedIn = !!getToken();
  if (!hasKey && !isLoggedIn) {
    throw new Error('未配置多模态 AI API Key 且未登录。请在设置中配置 AI API Key 或先登录以使用服务端 AI。');
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  console.log(`AI 视觉识别 PDF，模型: ${modelName}，页数: ${pdf.numPages}`);

  const pageTexts: string[] = [];
  let rateLimitCount = 0;
  let authErrorCount = 0;
  let lastErrorMsg = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({ current: i, total: pdf.numPages, status: `AI 正在识别第 ${i}/${pdf.numPages} 页...` });

    const page = await pdf.getPage(i);
    const canvas = await extractPageImage(page, 3.0);
    try {
      const result = await recognizePageWithAI(canvas, AI_VISION_PROMPT, modelName, 8192, settingsOverride);
      pageTexts.push(`【第 ${i} 页】\n${result}`);
      console.log(`第 ${i}/${pdf.numPages} 页 AI 识别完成`);
    } catch (e) {
      const errMsg = (e as Error).message || String(e);
      lastErrorMsg = errMsg;
      if (isRateLimitError(e)) {
        rateLimitCount++;
      } else if (/401|403|unauthorized|forbidden/i.test(errMsg)) {
        authErrorCount++;
      }
      pageTexts.push(`【第 ${i} 页】\n[AI 识别失败，此页无内容]`);
      console.warn(`第 ${i}/${pdf.numPages} 页 AI 识别失败:`, errMsg);
    }

    // 避免触发 API 频率限制，页间等待 1.5 秒
    if (i < pdf.numPages) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const fullText = pageTexts.join('\n\n');
  console.log(`AI 视觉识别完成，总计 ${fullText.length} 字符`);

  // 检查是否所有页面都失败了
  const successCount = pageTexts.filter((t) => !t.includes('[AI 识别失败')).length;
  if (successCount === 0) {
    const hasKey = settings.geminiKey || settings.deepseekKey || settings.openrouterKey || settings.qwenKey;
    if (rateLimitCount > 0) {
      throw new Error(
        `API 调用频率限制或免费配额已用尽（${rateLimitCount}/${pdf.numPages} 页触发限制）。` +
          '建议：1) 等待 1-2 分钟再试；2) 切换到 gemini-3-flash-preview 模型（免费配额更宽松）；3) 更换其他已配置 API Key 的模型。'
      );
    }
    if (authErrorCount > 0) {
      throw new Error(
        `API Key 认证失败（${authErrorCount}/${pdf.numPages} 页返回 401/403）。请检查 API Key 是否正确且未过期。`
      );
    }
    throw new Error(
      hasKey
        ? `所有页面 AI 识别均失败。错误: ${lastErrorMsg || '未知错误'}`
        : '服务端未配置 GEMINI_API_KEY 且未设置个人 AI API Key。请在设置中配置 API Key，或联系管理员在 server/.env 中填入 GEMINI_API_KEY'
    );
  }

  return { content: fullText.trim() };
}
