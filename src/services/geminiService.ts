import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function parseQuestionsWithAI(text: string): Promise<Question[]> {
  const prompt = `
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

    待解析文本：
    ${text}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
