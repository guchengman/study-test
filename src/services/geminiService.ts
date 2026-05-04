import { GoogleGenAI, Type } from "@google/genai";
import { Question, AISettings } from "../types";
import { loadApiConfig } from "../config/apiConfig";


// 延迟初始化 AI 实例，仅在需要时创建
let aiInstance: GoogleGenAI | null = null;
let currentGeminiKey: string = '';

function getGeminiKey(override?: AISettings): string {
  // 优先使用传入的设置
  if (override?.geminiKey) return override.geminiKey;
  // 其次使用 sessionStorage
  const localSettings = loadApiConfig();
  if (localSettings.geminiKey) return localSettings.geminiKey;
  // 最后使用环境变量
  return process.env.GEMINI_API_KEY || '';
}

function getAIInstance(settingsOverride?: AISettings): GoogleGenAI {
  const geminiKey = getGeminiKey(settingsOverride);
  if (!geminiKey) {
    throw new Error('Gemini API Key 未配置，请在设置中配置 API Key');
  }
  if (!aiInstance || geminiKey !== currentGeminiKey) {
    currentGeminiKey = geminiKey;
    aiInstance = new GoogleGenAI({ apiKey: geminiKey });
  }
  return aiInstance;
}

// 根据题目内容推断科目
function inferSubject(title: string, explanation?: string): string {
  const content = (title + ' ' + (explanation || '')).toLowerCase();
  
  if (content.includes('python') || content.includes('代码') || content.includes('编程') || 
      content.includes('function') || content.includes('def ') || content.includes('print')) {
    return 'python';
  }
  if (content.includes('英语') || content.includes('grammar') || content.includes('sentence') || 
      content.includes('word') || content.includes('vocabulary') || content.includes('reading') ||
      /\b(a|an|the|is|are|was|were|have|has)\b/.test(content)) {
    return 'english';
  }
  if (content.includes('语文') || content.includes('古诗') || content.includes('文言文') || 
      content.includes('阅读理解') || content.includes('作文') || content.includes('汉字')) {
    return 'chinese';
  }
  if (content.includes('数学') || content.includes('计算') || content.includes('方程') || 
      content.includes('几何') || content.includes('=') || /[0-9]+[+\-*/][0-9]+/.test(content)) {
    return 'math';
  }
  return 'python'; // 默认科目
}

const SYSTEM_PROMPT = `
你是一个专业的题目解析专家。请将以下文本解析为规范的题目 JSON 数组。

**核心职责：解析格式 + 审核答案正确性**

题目类型包括：
- 'single': 单选题（包含 A/B/C/D 选项）
- 'multiple': 多选题（包含多个正确答案）
- 'single': 单选题（含判断题：options 填写 ['正确', '错误']，answer 填写 'A' 表示正确，'B' 表示错误）
- 'programming': 编程题或问答题

**答案审核要求（必须执行）：**
1. 对于每道题目，验证原题提供的答案是否正确
2. 如果原题答案错误，必须修正为正确答案（不要保留错误答案）
3. 如果无法确定答案，在 explanation 中标注"答案待验证"
4. 确保 answer 与选项内容一致（答案必须是选项中的内容）
5. 多选题确保所有正确答案都被包含

JSON 结构必须符合以下 TypeScript 接口：
interface Question {
  id: number; // 请从 1000 开始递增
  subject: 'python' | 'english' | 'chinese' | 'math'; // 题目所属科目
  type: 'single' | 'multiple' | 'programming';
  title: string;
  options?: string[]; // 单选和多选必填，判断题也使用 single 类型并填写 ['正确', '错误']
  answer: string | string[]; // 单选/判断为 string（判断题A=正确，B=错误），多选为 string[]
  points: number; // 默认 5 分
  explanation: string;
}
`;

// 题目生成的系统提示
const GENERATE_PROMPT = `
你是一个专业的教育内容生成专家。你需要智能分析用户输入的内容，并生成相应的高质量题目。

**智能判断输入内容类型：**
1. 如果是明确的生成指令（如"生成10道Python选择题"）→ 直接按要求生成题目
2. 如果是待优化的题目文本 → 优化题目表述，修正错误，补充缺失信息
3. 如果是大纲、教程、学习资料 → **必须生成100道题目**，分析内容结构，生成覆盖知识点的练习题
4. 如果是混合内容 → 提取其中的题目进行优化，同时为教程内容生成练习题

**题目数量强制要求：**
- 用户未指定数量时，默认生成100道题目
- 用户指定数量时，严格按指定数量生成，不得擅自减少
- 生成过程中不得中断或分批输出，必须一次性完成全部题目
- 禁止出现"先生成X道"、"由于篇幅限制"等任何减少题目数量的说明或借口

**答案正确性审核（必须执行）：**
- 生成每道题时，确保答案100%正确
- 如果原题提供答案，必须验证其正确性，错误答案必须修正
- 如果无法100%确定答案，将该题改为问答题（不提供选项和答案）
- 不要为了凑题目数量而生成答案不确定的题目

**默认生成题目类型：**
- 单选题：提供 4 个选项（A、B、C、D），其中只有 1 个正确
- 多选题：提供 4 个选项，正确答案可以是 2 个或更多，需标注"（多选）"
- 判断题：如果题目适合用"正确/错误"判断，使用 single 类型，options 填写 ['正确', '错误']

**输出格式（直接返回纯文本）：**

单选题：
题目标题
A. 选项A
B. 选项B
C. 选项C
D. 选项D
答案：正确选项字母
解析：详细的解析说明（说明为什么选这个选项）

多选题（标注"多选"）：
题目标题（多选）
A. 选项A
B. 选项B
C. 选项C
D. 选项D
答案：正确选项字母组合
解析：详细的解析说明（说明每个正确答案的原因）

判断题（标注"判断"）：
题目标题（判断）
答案：正确 / 错误
解析：详细的解析说明（说明判断依据）

=====================================
【⚠️强制格式规范：数学+化学+物理 全科目 100%严格执行，无任何例外】
=====================================

【数学符号强制规范】
1. 平方、立方、指数、单位必须使用Unicode上标：
 正确：2²、2³、m²、cm²、m³、dm³、xⁿ
 绝对禁止：2^2、2^3、m2、m3、cm2、cm3、x^n
2. 下标必须规范：a₁、a₂、x₃，绝对禁止：a1、a2、x3
3. 标准符号：± × ÷ √ ∞ ∠ ∥ ⊥ ≈ ≠ ≤ ≥ π ½ ⅓ ⅔
4. 温度/角度：℃、°，禁止写成 C、度

【化学符号强制规范】
1. 化学式数字必须用Unicode下标：
 正确：H₂O、CO₂、O₂、Ca(OH)₂、Na₂CO₃、CuSO₄·5H₂O
 绝对禁止：H2O、CO2、O2、Ca(OH)2、Na2CO3
2. 离子电荷必须用上标：
 正确：H⁺、OH⁻、Na⁺、Ca²⁺、Al³⁺、SO₄²⁻
 绝对禁止：H+、OH-、Na+、Ca2+、SO42-
3. 化学方程式：→、=、↑、↓、△、点燃、通电、催化剂
4. 绝对禁止使用 ^ 符号

【物理符号强制规范】
1. 单位上标：m²、cm²、m³、dm³、s²
2. 物理专用字符：ρ、η、Ω、℃、△、°、g、kW、h、mL、L
3. 下标必须规范：F₁、F₂、R₁、R₂、U₁、U₂、I₁、I₂
 绝对禁止：F1、R1、U1、I1
4. 变化量：△t、△s，禁止写成 delta t

【全局铁律（违反即输出无效）】
1. 所有题目、选项、解析必须统一格式
2. 纯文本输出，禁止markdown、禁止代码块、禁止HTML标签
3. 数字与单位之间不加空格：1m³、5cm²、20℃
4. 绝不允许出现：H2O、m3、cm2、F1、R1、^、-、+
5. 所有符号可直接复制到Word/PPT/教学平台正常显示
6. 物理单位书写规范：Ω（电阻）、ρ（密度）、η（效率）、λ（波长）等希腊字母必须使用标准Unicode字符，禁止用相近字母替代

【标准示例（必须严格模仿）】
题目：下列说法正确的是（）
A. 水的化学式是H₂O
B. 1m³=1000dm³
C. 氢氧化钠可电离出Na⁺与OH⁻
D. 2cm²=200mm²

**重要说明：**
- 默认生成选择题，不生成问答题或编程题
- 多选题用逗号分隔所有正确答案字母（如"A,B"表示AB正确）
- 确保生成的题目可直接导入系统使用
- 可以一次性处理多条输入，每条用空行分隔
- 答案正确性是第一优先级，宁可不给答案，也不要给错误答案
- **数量铁律：必须严格按用户要求或默认100道的数量完成，不得中途停止、分批或缩减**
`;

// 更强大的JSON修复函数，专门处理大量题目被截断的情况
function repairTruncatedJSON(content: string, originalLength?: number): { questions: any[]; wasTruncated: boolean; recovered: number } {
  let wasTruncated = false;
  
  try {
    // 首先尝试直接解析
    const parsed = JSON.parse(content);
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions || []);
    return { questions, wasTruncated: false, recovered: questions.length };
  } catch (e) {
    console.warn("Direct JSON parse failed, attempting advanced repair...");
    wasTruncated = true;
    
    // 清理可能的markdown包装
    let cleaned = content.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
    
    // 尝试多种修复策略
    
    // 策略1: 找到最后一个完整的JSON对象（增强版：处理数组格式）
    const lastCompleteObjectEnd = cleaned.lastIndexOf('}');
    if (lastCompleteObjectEnd !== -1) {
      let repaired = cleaned.substring(0, lastCompleteObjectEnd + 1);
      
      // 检查是否是数组格式
      if (repaired.trim().startsWith('[')) {
        // 如果以[开头但没有]结尾，添加]
        if (!repaired.trim().endsWith(']')) {
          repaired += ']';
        }
      } else if (!repaired.trim().startsWith('[')) {
        // 如果不是数组格式，尝试包装成数组
        repaired = '[' + repaired + ']';
      }
      
      try {
        const parsed = JSON.parse(repaired);
        const questions = Array.isArray(parsed) ? parsed : [];
        console.log(`Strategy 1 recovered ${questions.length} questions`);
        return { questions, wasTruncated: true, recovered: questions.length };
      } catch (repairError) {
        console.warn("Strategy 1 failed:", repairError);
      }
    }
    
    // 策略1b: 处理 ] 缺失的情况
    if (cleaned.trim().startsWith('[') && !cleaned.trim().endsWith(']')) {
      const repaired = cleaned.trim() + ']';
      try {
        const parsed = JSON.parse(repaired);
        const questions = Array.isArray(parsed) ? parsed : [];
        console.log(`Strategy 1b recovered ${questions.length} questions`);
        return { questions, wasTruncated: true, recovered: questions.length };
      } catch (e1b) {
        console.warn("Strategy 1b failed:", e1b);
      }
    }
    
    // 策略2: 使用递归括号匹配提取JSON对象（支持嵌套大括号）
    const extractObjects = (str: string): { objects: string[]; lastPartial: string } => {
      const objects: string[] = [];
      let currentObject = '';
      let inObject = false;
      let depth = 0;
      
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        
        if (char === '{') {
          if (!inObject) {
            inObject = true;
            currentObject = '';
          }
          depth++;
          currentObject += char;
        } else if (char === '}') {
          depth--;
          currentObject += char;
          if (depth === 0 && inObject) {
            objects.push(currentObject);
            currentObject = '';
            inObject = false;
          }
        } else if (inObject) {
          currentObject += char;
        }
      }
      
      return { objects, lastPartial: currentObject };
    };
    
    const { objects: matches, lastPartial } = extractObjects(cleaned);
    if (matches && matches.length > 0) {
      try {
        const questions: any[] = [];
        for (const match of matches) {
          try {
            const obj = JSON.parse(match);
            questions.push(obj);
          } catch (e) {
            console.warn("Failed to parse individual object:", e);
          }
        }
        if (questions.length > 0) {
          console.log(`Strategy 2 recovered ${questions.length} questions`);
          return { questions, wasTruncated: true, recovered: questions.length };
        }
      } catch (regexError) {
        console.warn("Strategy 2 failed:", regexError);
      }
    }
    
    // 策略3: 尝试正则提取常见的 JSON 数组模式
    const arrayMatch = cleaned.match(/\[[\s\S]*$/);
    if (arrayMatch) {
      try {
        // 尝试补全数组
        const repaired = arrayMatch[0];
        const completed = repaired.endsWith(']') ? repaired : repaired + ']';
        const parsed = JSON.parse(completed);
        const questions = Array.isArray(parsed) ? parsed : [];
        if (questions.length > 0) {
          console.log(`Strategy 3 recovered ${questions.length} questions`);
          return { questions, wasTruncated: true, recovered: questions.length };
        }
      } catch (e3) {
        console.warn("Strategy 3 failed:", e3);
      }
    }
    
    // 策略4: 尝试提取被反引号包裹的 JSON
    const codeBlockMatch = cleaned.match(/`{1,3}\s*(\[[\s\S]*)/);
    if (codeBlockMatch) {
      try {
        const jsonPart = codeBlockMatch[1].replace(/`{1,3}$/, '');
        const repaired = jsonPart.endsWith(']') ? jsonPart : jsonPart + ']';
        const parsed = JSON.parse(repaired);
        const questions = Array.isArray(parsed) ? parsed : [];
        if (questions.length > 0) {
          console.log(`Strategy 4 recovered ${questions.length} questions`);
          return { questions, wasTruncated: true, recovered: questions.length };
        }
      } catch (e4) {
        console.warn("Strategy 4 failed:", e4);
      }
    }
    
    // 策略5: 逐行解析，寻找有效的JSON片段（增强版）
    const lines = cleaned.split('\n');
    let currentJson = '';
    const validObjects: any[] = [];
    
    for (let line of lines) {
      line = line.trim();
      if (line === '' || line.startsWith('//') || line.startsWith('#')) continue;
      
      currentJson += (currentJson && !currentJson.endsWith('\n') ? '\n' : '') + line;
      
      try {
        // 尝试解析当前累积的JSON
        if (currentJson.startsWith('{') && currentJson.endsWith('}')) {
          const obj = JSON.parse(currentJson);
          validObjects.push(obj);
          currentJson = '';
        } else if (currentJson.startsWith('[') && currentJson.endsWith(']')) {
          const arr = JSON.parse(currentJson);
          if (Array.isArray(arr)) {
            validObjects.push(...arr);
          }
          currentJson = '';
        }
      } catch (lineError) {
        // 继续累积更多行
        if (!currentJson.endsWith('\n')) {
          currentJson += '\n';
        }
      }
    }
    
    if (validObjects.length > 0) {
      console.log(`Strategy 5 recovered ${validObjects.length} questions`);
      return { questions: validObjects, wasTruncated: true, recovered: validObjects.length };
    }
    
    // 如果所有策略都失败，抛出原始错误
    throw new Error("无法修复被截断的JSON响应，请尝试减少单次导入的题目数量或使用更强的AI模型。");
  }
}

// 构建 API 请求体（不同 API 可能有不同的参数要求）
function buildRequestBody(model: string, messages: any[], temperature: number, maxTokens: number, isGeneration: boolean) {
  const baseBody: any = {
    model: model,
    messages: messages,
    temperature: temperature,
    max_tokens: maxTokens
  };
  
  // 所有模型都明确设置 stream 参数
  // DeepSeek 实际上支持 stream 参数，但我们需要明确关闭流式响应
  baseBody.stream = false;
  
  return baseBody;
}

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, text: string, isGeneration: boolean = false): Promise<any> {
  // 中文文本的 token 消耗比英文高（约 2 倍），需要更精确的估算
  const charCount = text.length;
  const estimatedTokens = charCount > 50000 
    ? Math.max(60000, charCount * 3)
    : charCount > 30000
    ? Math.max(48000, charCount * 2.5)
    : charCount > 15000
    ? Math.max(32000, charCount * 2)
    : Math.max(16000, charCount * 1.8);
  
  // 确保 maxOutputTokens 是整数，DeepSeek 等 API 要求 u32 类型
  const maxOutputTokens = Math.floor(Math.min(estimatedTokens, 131072));
  
  const systemPrompt = isGeneration ? GENERATE_PROMPT : SYSTEM_PROMPT;
  
  const messages = [
    { role: 'system', content: systemPrompt + (isGeneration ? "\n**重要提醒：生成题目时，必须确保每个答案100%正确。如果对某道题的答案不确定，不要提供选项和答案，直接改为问答题格式。宁可少生成一道题，也不要给出一道错误答案的题目。**" : "\n请直接返回 JSON 数组。如果题目较多（最多100道），请确保输出完整。如果输出被截断，请尽量保证最后一个对象是完整的，并在数组末尾添加注释说明。") },
    { role: 'user', content: isGeneration ? text : `待解析文本（可能包含多达100道题目）：\n${text}` }
  ];
  
  const requestBody = buildRequestBody(model, messages, isGeneration ? 0.7 : 0.3, maxOutputTokens, isGeneration);
  
  console.log(`API Request: ${baseUrl}/chat/completions, model: ${model}, max_tokens: ${maxOutputTokens}`);
  
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const error = await response.json();
      errorDetail = error.error?.message || error.error?.code || JSON.stringify(error);
    } catch {
      errorDetail = await response.text();
    }
    console.error(`API Error (${response.status}):`, errorDetail);
    throw new Error(`API 请求失败 (${response.status}): ${errorDetail}`);
  }

  const data = await response.json();

  let content = data.choices?.[0]?.message?.content;
  const finishReason = data.choices?.[0]?.finish_reason;
  const nativeFinishReason = data.choices?.[0]?.native_finish_reason;
  
  // 检查响应是否有效
  if (!content) {
    let reason = '模型未返回内容';
    if (finishReason === 'length') {
      reason = '输出被截断，请尝试减少题目数量';
    } else if (finishReason === 'content_filter') {
      reason = '内容被安全过滤器拦截，请尝试其他模型';
    } else if (nativeFinishReason === 'novita_content_filter') {
      reason = 'Novita 提供商内容过滤器拦截，请尝试其他模型';
    } else if (finishReason === null && nativeFinishReason === null) {
      reason = `模型 "${model}" 拒绝生成内容，请尝试其他模型`;
    }
    throw new Error(`AI 模型未返回有效内容\n原因: ${reason}\n建议: 尝试更换为 openai/gpt-4o-mini 或 google/gemini-3-flash-preview 等可靠模型`);
  }
  
  // Clean up potential markdown blocks
  content = content.replace(/```json\n?/, '').replace(/\n?```/, '').trim();
  
  if (isGeneration) {
    return content;
  }

  try {
    // 使用增强的JSON修复逻辑
    const result = repairTruncatedJSON(content);
    let questions = result.questions as Question[];
    
    // 如果输出被截断，添加警告
    if (result.wasTruncated && questions.length > 0) {
      console.warn(`AI 输出被截断，已恢复 ${result.recovered} 道题目`);
    }
    
    // 自动修复缺失或错误的subject字段，并优化题目类型
    questions = questions.map(q => {
      // 如果subject字段缺失或无效，尝试根据题目内容推断
      if (!q.subject || !['python', 'english', 'chinese', 'math'].includes(q.subject)) {
        q.subject = inferSubject(q.title, q.explanation);
      }
      
      // 智能优化题目格式
      if ((q.type === 'single' || q.type === 'multiple') && (!q.options || q.options.length === 0)) {
        const correctAnswer = Array.isArray(q.answer) ? q.answer[0] : String(q.answer);
        let distractors: string[] = [];
        
        if (q.subject === 'math') {
          const numAnswer = parseFloat(correctAnswer);
          if (!isNaN(numAnswer)) {
            distractors = [
              String(Math.round(numAnswer * 0.9)),
              String(Math.round(numAnswer * 1.1)),
              String(Math.round(numAnswer + 10)),
              String(Math.round(numAnswer - 10)),
              String(Math.round(numAnswer * 2))
            ].filter(val => parseFloat(val) !== numAnswer);
          } else {
            distractors = ['计算错误', '概念混淆', '单位错误', '步骤遗漏'];
          }
        } else if (q.subject === 'english') {
          distractors = ['语法错误', '词汇误用', '时态错误', '语序错误'];
        } else if (q.subject === 'chinese') {
          distractors = ['字词错误', '标点错误', '语义不清', '逻辑混乱'];
        } else {
          distractors = ['理解偏差', '概念错误', '方法不当', '细节疏忽'];
        }
        
        distractors = [...new Set(distractors)].filter(d => d !== correctAnswer);
        const allOptions = [correctAnswer, ...distractors.slice(0, Math.min(4, Math.max(2, 4 - distractors.length)))];
        
        // 随机打乱选项顺序
        for (let i = allOptions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
        }
        
        q.options = allOptions;
        const correctIndex = allOptions.indexOf(correctAnswer);
        q.answer = String.fromCharCode(65 + correctIndex);
      }
      
      // 确保单选题的answer是字符串
      if (q.type === 'single' && Array.isArray(q.answer)) {
        q.answer = q.answer[0] || 'A';
      }
      
      // 确保多选题的answer是数组
      if (q.type === 'multiple' && !Array.isArray(q.answer)) {
        q.answer = [String(q.answer)];
      }
      
      // 处理判断题：转换为单选题格式（A. 正确 B. 错误）
      if (q.type === 'true/false') {
        const answerStr = String(q.answer).toLowerCase().trim();
        const trueValues = ['正确', 'true', 't', '对', 'yes', 'y', '1', 'a', '√', '是'];
        const falseValues = ['错误', 'false', 'f', '错', 'no', 'n', '0', 'b', '×', '否'];
        const isCorrect = trueValues.includes(answerStr);
        
        q.type = 'single';
        q.options = ['正确', '错误'];
        q.answer = isCorrect ? 'A' : (falseValues.includes(answerStr) ? 'B' : 'A');
      }
      
      // 处理AI错误返回的single类型判断题
      if (q.type === 'single' && q.options && q.options.length === 2) {
        const optStr = q.options.map(o => String(o).trim()).join(',');
        if (optStr === '正确,错误' || optStr === '错误,正确') {
          const ansStr = String(q.answer).trim();
          if (!['A', 'B'].includes(ansStr.toUpperCase())) {
            const trueValues = ['正确', 'true', '对', 'a', '√', '是'];
            const isCorrect = trueValues.includes(ansStr.toLowerCase());
            q.answer = isCorrect ? 'A' : 'B';
          }
        }
      }
      
      return q;
    });
    
    return questions;
  } catch (e) {
    console.error("Failed to parse AI response:", content);
    throw new Error("AI 返回格式错误或被截断，请尝试减少单次导入的题目数量，或在设置中配置更强的AI模型。当前系统已优化支持最多100道题的同时导入。");
  }
}

function getSettings(override?: AISettings): AISettings {
  if (override) return override;
  const settingsStr = sessionStorage.getItem('AI_SETTINGS');
  return settingsStr ? JSON.parse(settingsStr) : {};
}

export async function parseQuestionsWithAI(text: string, modelName: string = "gemini-3-flash-preview", settingsOverride?: AISettings): Promise<Question[]> {
  const settings = getSettings(settingsOverride);

  // Handle Chinese Models
  if (modelName.startsWith('deepseek')) {
    if (!settings.deepseekKey) throw new Error("请先在设置中配置 DeepSeek API Key");
    return callOpenAICompatible("https://api.deepseek.com/v1", settings.deepseekKey, modelName, text);
  }
  
  if (modelName.startsWith('qwen')) {
    if (!settings.qwenKey) throw new Error("请先在设置中配置通义千问 API Key");
    return callOpenAICompatible("https://dashscope.aliyuncs.com/compatible-mode/v1", settings.qwenKey, modelName, text);
  }

  if (modelName.startsWith('zhipu') || modelName.startsWith('glm')) {
    if (!settings.zhipuKey) throw new Error("请先在设置中配置智谱清言 API Key");
    return callOpenAICompatible("https://open.bigmodel.cn/api/paas/v4", settings.zhipuKey, modelName, text);
  }

  if (modelName.startsWith('moonshot')) {
    if (!settings.moonshotKey) throw new Error("请先在设置中配置月之暗面 API Key");
    return callOpenAICompatible("https://api.moonshot.cn/v1", settings.moonshotKey, modelName, text);
  }

  if (modelName.startsWith('baichuan')) {
    if (!settings.baichuanKey) throw new Error("请先在设置中配置百川智能 API Key");
    return callOpenAICompatible("https://api.baichuan-ai.com/v1", settings.baichuanKey, modelName, text);
  }

  if (modelName.startsWith('hunyuan')) {
    if (!settings.hunyuanKey) throw new Error("请先在设置中配置腾讯混元 API Key");
    throw new Error("腾讯混元暂未实现，请通过OpenRouter使用或选择其他模型");
  }

  if (modelName.startsWith('ernie')) {
    if (!settings.ernieKey) throw new Error("请先在设置中配置百度文心一言 API Key");
    throw new Error("文心一言暂未实现，请通过OpenRouter使用或选择其他模型");
  }

  // OpenRouter Support with dynamic model selection
  if (modelName === 'openrouter') {
    if (!settings.openrouterKey) throw new Error("请先在设置中配置 OpenRouter API Key");
    const actualModel = settings.openrouterModel || 'openai/gpt-4o';
    return callOpenAICompatible("https://openrouter.ai/api/v1", settings.openrouterKey, actualModel, text);
  }

  if (modelName === 'custom') {
    if (!settings.customEndpoint || !settings.customKey) throw new Error("请先在设置中配置自定义接口信息");
    return callOpenAICompatible(settings.customEndpoint, settings.customKey, "custom-model", text);
  }

  // Default to Gemini
  const prompt = `${SYSTEM_PROMPT}\n\n待解析文本（可能包含多达100道题目）：\n${text}`;

  try {
    const response = await getAIInstance(settingsOverride).models.generateContent({
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
              subject: { type: Type.STRING, enum: ["python", "english", "chinese", "math"] },
              type: { type: Type.STRING, enum: ["single", "multiple", "programming"] },
              title: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              answer: { oneOf: [{ type: Type.STRING }, { type: Type.ARRAY, items: { type: Type.STRING } }] },
              points: { type: Type.NUMBER },
              explanation: { type: Type.STRING }
            },
            required: ["id", "subject", "type", "title", "answer", "points", "explanation"]
          }
        },
        maxOutputTokens: text.length > 50000 ? 65536 : 32768
      }
    });

    const result = JSON.parse(response.text);
    let questions = result as Question[];
    
    // 自动修复缺失或错误的subject字段，并优化题目类型
    questions = questions.map(q => {
      if (!q.subject || !['python', 'english', 'chinese', 'math'].includes(q.subject)) {
        q.subject = inferSubject(q.title, q.explanation);
      }
      
      if ((q.type === 'single' || q.type === 'multiple') && (!q.options || q.options.length === 0)) {
        const correctAnswer = Array.isArray(q.answer) ? q.answer[0] : String(q.answer);
        let distractors: string[] = [];
        
        if (q.subject === 'math') {
          const numAnswer = parseFloat(correctAnswer);
          if (!isNaN(numAnswer)) {
            distractors = [
              String(Math.round(numAnswer * 0.9)),
              String(Math.round(numAnswer * 1.1)),
              String(Math.round(numAnswer + 10)),
              String(Math.round(numAnswer - 10)),
              String(Math.round(numAnswer * 2))
            ].filter(val => parseFloat(val) !== numAnswer);
          } else {
            distractors = ['计算错误', '概念混淆', '单位错误', '步骤遗漏'];
          }
        } else if (q.subject === 'english') {
          distractors = ['语法错误', '词汇误用', '时态错误', '语序错误'];
        } else if (q.subject === 'chinese') {
          distractors = ['字词错误', '标点错误', '语义不清', '逻辑混乱'];
        } else {
          distractors = ['理解偏差', '概念错误', '方法不当', '细节疏忽'];
        }
        
        distractors = [...new Set(distractors)].filter(d => d !== correctAnswer);
        const allOptions = [correctAnswer, ...distractors.slice(0, Math.min(4, Math.max(2, 4 - distractors.length)))];
        
        for (let i = allOptions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
        }
        
        q.options = allOptions;
        const correctIndex = allOptions.indexOf(correctAnswer);
        q.answer = String.fromCharCode(65 + correctIndex);
      }
      
      if (q.type === 'single' && Array.isArray(q.answer)) {
        q.answer = q.answer[0] || 'A';
      }
      
      if (q.type === 'multiple' && !Array.isArray(q.answer)) {
        q.answer = [String(q.answer)];
      }
      
      if (q.type === 'true/false') {
        const answerStr = String(q.answer).toLowerCase().trim();
        const trueValues = ['正确', 'true', 't', '对', 'yes', 'y', '1', 'a', '√', '是'];
        const falseValues = ['错误', 'false', 'f', '错', 'no', 'n', '0', 'b', '×', '否'];
        const isCorrect = trueValues.includes(answerStr);
        
        q.type = 'single';
        q.options = ['正确', '错误'];
        q.answer = isCorrect ? 'A' : (falseValues.includes(answerStr) ? 'B' : 'A');
      }
      
      if (q.type === 'single' && q.options && q.options.length === 2) {
        const optStr = q.options.map(o => String(o).trim()).join(',');
        if (optStr === '正确,错误' || optStr === '错误,正确') {
          const ansStr = String(q.answer).trim();
          if (!['A', 'B'].includes(ansStr.toUpperCase())) {
            const trueValues = ['正确', 'true', '对', 'a', '√', '是'];
            const isCorrect = trueValues.includes(ansStr.toLowerCase());
            q.answer = isCorrect ? 'A' : 'B';
          }
        }
      }
      
      return q;
    });
    
    return questions;
  } catch (error: any) {
    console.error("AI Parsing Error:", error);
    
    if (error.message && error.message.includes('429')) {
      throw new Error("API调用频率超限，请稍后再试，或在设置中配置自己的API Key使用其他模型。");
    }
    
    if (error.message && (error.message.includes('401') || error.message.includes('invalid'))) {
      throw new Error("API Key无效或已过期，请在设置中配置有效的API Key。");
    }
    
    if (error.message && error.message.includes('network') || error.message.includes('fetch')) {
      throw new Error("网络连接失败，请检查网络或稍后重试。");
    }
    
    throw new Error("解析题目失败，请检查输入格式或稍后重试。系统已优化支持最多100道题的同时导入。详细错误：" + (error.message || '未知错误'));
  }
}

// 新增：根据提示词生成题目文本
export async function generateQuestionsFromPrompt(prompt: string, modelName: string = "gemini-3-flash-preview", settingsOverride?: AISettings): Promise<string> {
  const settings = getSettings(settingsOverride);

  // Handle Chinese Models for generation
  if (modelName.startsWith('deepseek')) {
    if (!settings.deepseekKey) throw new Error("请先在设置中配置 DeepSeek API Key");
    return callOpenAICompatible("https://api.deepseek.com/v1", settings.deepseekKey, modelName, prompt, true);
  }
  
  if (modelName.startsWith('qwen')) {
    if (!settings.qwenKey) throw new Error("请先在设置中配置通义千问 API Key");
    return callOpenAICompatible("https://dashscope.aliyuncs.com/compatible-mode/v1", settings.qwenKey, modelName, prompt, true);
  }

  if (modelName.startsWith('zhipu') || modelName.startsWith('glm')) {
    if (!settings.zhipuKey) throw new Error("请先在设置中配置智谱清言 API Key");
    return callOpenAICompatible("https://open.bigmodel.cn/api/paas/v4", settings.zhipuKey, modelName, prompt, true);
  }

  if (modelName.startsWith('moonshot')) {
    if (!settings.moonshotKey) throw new Error("请先在设置中配置月之暗面 API Key");
    return callOpenAICompatible("https://api.moonshot.cn/v1", settings.moonshotKey, modelName, prompt, true);
  }

  if (modelName.startsWith('baichuan')) {
    if (!settings.baichuanKey) throw new Error("请先在设置中配置百川智能 API Key");
    return callOpenAICompatible("https://api.baichuan-ai.com/v1", settings.baichuanKey, modelName, prompt, true);
  }

  if (modelName.startsWith('hunyuan')) {
    if (!settings.hunyuanKey) throw new Error("请先在设置中配置腾讯混元 API Key");
    throw new Error("腾讯混元暂未实现，请通过OpenRouter使用或选择其他模型");
  }

  if (modelName.startsWith('ernie')) {
    if (!settings.ernieKey) throw new Error("请先在设置中配置百度文心一言 API Key");
    throw new Error("文心一言暂未实现，请通过OpenRouter使用或选择其他模型");
  }

  // OpenRouter Support
  if (modelName === 'openrouter') {
    if (!settings.openrouterKey) throw new Error("请先在设置中配置 OpenRouter API Key");
    const actualModel = settings.openrouterModel || 'openai/gpt-4o';
    return callOpenAICompatible("https://openrouter.ai/api/v1", settings.openrouterKey, actualModel, prompt, true);
  }

  if (modelName === 'custom') {
    if (!settings.customEndpoint || !settings.customKey) throw new Error("请先在设置中配置自定义接口信息");
    return callOpenAICompatible(settings.customEndpoint, settings.customKey, "custom-model", prompt, true);
  }

  // Default to Gemini for generation
  const generationPrompt = `${GENERATE_PROMPT}\n\n用户提示词：\n${prompt}`;

  try {
    const response = await getAIInstance(settingsOverride).models.generateContent({
      model: modelName,
      contents: generationPrompt,
      config: {
        maxOutputTokens: 16384,
        temperature: 0.7
      }
    });

    let content = response.text;
    content = content.replace(/```text\n?/, '').replace(/\n?```/, '').trim();
    return content;
  } catch (error: any) {
    console.error("AI Generation Error:", error);
    
    if (error.message && error.message.includes('429')) {
      throw new Error("API调用频率超限，请稍后再试，或在设置中配置自己的API Key使用其他模型。");
    }
    
    if (error.message && (error.message.includes('401') || error.message.includes('invalid'))) {
      throw new Error("API Key无效或已过期，请在设置中配置有效的API Key。");
    }
    
    if (error.message && (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('timeout'))) {
      throw new Error("网络连接失败或请求超时，请检查网络或稍后重试。");
    }
    
    if (error.message && error.message.includes('quota')) {
      throw new Error("免费配额已用完，请配置自己的API Key或稍后重试。");
    }
    
    throw new Error("生成题目失败，请检查提示词或稍后重试。详细错误：" + (error.message || '未知错误'));
  }
};

// 获取文件的 MIME 类型
function getMimeType(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'html': 'text/html',
    'htm': 'text/html',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

// 等待文件处理完成
async function waitForFileProcessing(ai: GoogleGenAI, fileName: string, maxWaitTime: number = 60000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitTime) {
    const fileInfo = await ai.files.get({ name: fileName });
    if (fileInfo.state === 'ACTIVE') {
      return;
    }
    if (fileInfo.state === 'FAILED') {
      throw new Error('文件处理失败，请重试或使用其他文件。');
    }
    // 等待 2 秒
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('文件处理超时，请重试。');
}

// 直接以附件方式上传文件给 Gemini 解析
export async function parseQuestionsWithFile(
  file: File,
  modelName: string = "gemini-3-flash-preview",
  settingsOverride?: AISettings
): Promise<Question[]> {
  const ai = getAIInstance(settingsOverride);
  
  // 仅 Gemini 支持原生文件上传
  if (!modelName.startsWith('gemini') && !modelName.includes('gemini')) {
    throw new Error('当前模型不支持直接文件上传，仅 Gemini 模型支持此功能。请选择 Gemini 模型或使用手动解析模式。');
  }

  try {
    console.log(`开始上传文件: ${file.name}, 大小: ${(file.size / 1024).toFixed(1)} KB`);
    
    // 1. 上传文件
    const mimeType = getMimeType(file.name);
    const uploadedFile = await ai.files.upload({
      file: file,
      config: { 
        mimeType: mimeType,
        displayName: file.name
      }
    });
    
    console.log(`文件上传成功: ${uploadedFile.name}`);
    
    // 2. 等待文件处理完成
    await waitForFileProcessing(ai, uploadedFile.name);
    console.log('文件处理完成');
    
    // 3. 构建请求，使用文件 + 提示词
    const prompt = `${SYSTEM_PROMPT}\n\n请直接返回 JSON 数组。`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'user', parts: [{ fileData: { mimeType: mimeType, fileUri: uploadedFile.uri! } }] }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.NUMBER },
              subject: { type: Type.STRING, enum: ["python", "english", "chinese", "math"] },
              type: { type: Type.STRING, enum: ["single", "multiple", "programming"] },
              title: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              answer: { oneOf: [{ type: Type.STRING }, { type: Type.ARRAY, items: { type: Type.STRING } }] },
              points: { type: Type.NUMBER },
              explanation: { type: Type.STRING }
            },
            required: ["id", "subject", "type", "title", "answer", "points", "explanation"]
          }
        },
        maxOutputTokens: 65536
      }
    });

    const result = JSON.parse(response.text);
    let questions = result as Question[];
    
    // 自动修复缺失或错误的subject字段
    questions = questions.map(q => {
      if (!q.subject || !['python', 'english', 'chinese', 'math'].includes(q.subject)) {
        q.subject = inferSubject(q.title, q.explanation);
      }
      return q;
    });
    
    return questions;
  } catch (error: any) {
    console.error('文件解析失败:', error);
    
    if (error.message && error.message.includes('429')) {
      throw new Error('API调用频率超限，请稍后再试。');
    }
    
    if (error.message && (error.message.includes('401') || error.message.includes('invalid'))) {
      throw new Error('API Key无效或已过期，请在设置中配置有效的API Key。');
    }
    
    if (error.message && error.message.includes('network') || error.message.includes('fetch')) {
      throw new Error('网络连接失败，请检查网络或稍后重试。');
    }
    
    throw new Error('文件解析失败: ' + (error.message || '未知错误'));
  }
}