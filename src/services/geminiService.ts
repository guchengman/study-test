import { GoogleGenAI, Type } from "@google/genai";
import { Question, AISettings } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `
你是一个专业的题目解析专家。请将以下文本解析为规范的题目 JSON 数组。

题目类型包括：
- 'single': 单选题
- 'multiple': 多选题
- 'true/false': 判断题
- 'programming': 编程题

JSON 结构必须符合以下 TypeScript 接口：
interface Question {
  id: number; // 请从 1000 开始递增
  type: 'single' | 'multiple' | 'true/false' | 'programming';
  title: string;
  options?: string[]; // 仅限单选和多选
  answer: string | string[]; // 单选/判断/编程为 string，多选为 string[]
  points: number; // 默认 5 分
  explanation: string;
}
`;

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, text: string): Promise<Question[]> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + "\n请直接返回 JSON 数组。如果题目较多，请确保输出完整。如果输出被截断，请尽量保证最后一个对象是完整的。" },
        { role: 'user', content: `待解析文本：\n${text}` }
      ],
      temperature: 0.3,
      max_tokens: 8000,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API 请求失败');
  }

  const data = await response.json();
  let content = data.choices[0].message.content;
  
  // Clean up potential markdown blocks
  content = content.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
  
  try {
    // Attempt to parse
    try {
      const parsed = JSON.parse(content);
      return (Array.isArray(parsed) ? parsed : parsed.questions || []) as Question[];
    } catch (parseError) {
      // If parsing fails, it might be truncated. Try to repair it.
      console.warn("JSON parse failed, attempting repair...", parseError);
      
      // Find the last complete object in the array
      const lastObjectEnd = content.lastIndexOf('}');
      if (lastObjectEnd !== -1) {
        let repaired = content.substring(0, lastObjectEnd + 1);
        // Check if it's an array and needs a closing bracket
        if (repaired.trim().startsWith('[') && !repaired.trim().endsWith(']')) {
          repaired += ']';
        } else if (!repaired.trim().startsWith('[')) {
          // If it's not an array, maybe it's a list of objects that needs to be wrapped
          repaired = '[' + repaired + ']';
        }
        
        const parsed = JSON.parse(repaired);
        return (Array.isArray(parsed) ? parsed : parsed.questions || []) as Question[];
      }
      throw parseError;
    }
  } catch (e) {
    console.error("Failed to parse AI response:", content);
    throw new Error("AI 返回格式错误或被截断，请尝试减少单次导入的题目数量。");
  }
}

export async function parseQuestionsWithAI(text: string, modelName: string = "gemini-3-flash-preview"): Promise<Question[]> {
  const settingsStr = localStorage.getItem('ai_settings');
  const settings: AISettings = settingsStr ? JSON.parse(settingsStr) : {};

  // Handle Chinese Models
  if (modelName.startsWith('deepseek')) {
    if (!settings.deepseekKey) throw new Error("请先在设置中配置 DeepSeek API Key");
    return callOpenAICompatible("https://api.deepseek.com/v1", settings.deepseekKey, modelName, text);
  }
  
  if (modelName.startsWith('qwen')) {
    if (!settings.qwenKey) throw new Error("请先在设置中配置通义千问 API Key");
    return callOpenAICompatible("https://dashscope.aliyuncs.com/compatible-mode/v1", settings.qwenKey, modelName, text);
  }

  if (modelName.startsWith('zhipu')) {
    if (!settings.zhipuKey) throw new Error("请先在设置中配置智谱清言 API Key");
    return callOpenAICompatible("https://open.bigmodel.cn/api/paas/v4", settings.zhipuKey, modelName, text);
  }

  if (modelName === 'custom') {
    if (!settings.customEndpoint || !settings.customKey) throw new Error("请先在设置中配置自定义接口信息");
    return callOpenAICompatible(settings.customEndpoint, settings.customKey, "custom-model", text);
  }

  // Default to Gemini
  const prompt = `
    ${SYSTEM_PROMPT}

    待解析文本：
    ${text}
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.NUMBER },
              type: { type: Type.STRING },
              title: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
              },
              answer: {
                oneOf: [
                  { type: Type.STRING },
                  { type: Type.ARRAY, items: { type: Type.STRING } }
                ]
              },
              points: { type: Type.NUMBER },
              explanation: { type: Type.STRING }
            },
            required: ["id", "type", "title", "answer", "points", "explanation"]
          }
        }
      }
    });

    const result = JSON.parse(response.text);
    return result as Question[];
  } catch (error) {
    console.error("AI Parsing Error:", error);
    throw new Error("解析题目失败，请检查输入格式或稍后重试。");
  }
}
