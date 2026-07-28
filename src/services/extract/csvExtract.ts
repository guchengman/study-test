// CSV 解析器 - 将 CSV 文件转换为题目数组
import type { ParsedQuestion } from './types';
import { extractTextFromTxt } from './mdExtract';

export async function parseCSV(file: File): Promise<ParsedQuestion[]> {
  const text = await extractTextFromTxt(file);
  const lines = text.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length < 2) {
    throw new Error('CSV 文件内容不足，至少需要包含标题行和数据行。');
  }

  // 解析 CSV 行（处理带引号的值）
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // 解析标题行
  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());

  // 映射列名到索引
  const columnMap: Record<string, number> = {};
  const possibleNames: Record<string, string[]> = {
    type: ['type', '题型', '题目类型'],
    title: ['title', '题目', '题干', 'question'],
    options: ['options', '选项', 'choices'],
    answer: ['answer', '答案', 'correct'],
    explanation: ['explanation', '解析', 'explanation', '分析'],
    points: ['points', '分值', 'score', '分数'],
    code: ['code', '代码', '编程代码'],
    input: ['input', '输入', '输入样例'],
  };

  for (const [field, names] of Object.entries(possibleNames)) {
    for (const name of names) {
      const idx = headers.findIndex((h) => h === name || h.includes(name));
      if (idx !== -1) {
        columnMap[field] = idx;
        break;
      }
    }
  }

  // 验证必要字段
  if (
    columnMap.type === undefined ||
    columnMap.title === undefined ||
    columnMap.answer === undefined
  ) {
    throw new Error(
      'CSV 文件缺少必要的列。\n' +
        '必要的列包括：题型(type)、题目(title)、答案(answer)。\n' +
        '可选列包括：选项(options)、解析(explanation)、分值(points)。\n' +
        '示例 CSV 格式：\n' +
        'type,title,options,answer,explanation,points\n' +
        'single,"以下哪个是Python的关键字？","import,def,print,return","print","print是Python的输出函数",5'
    );
  }

  const questions: ParsedQuestion[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    if (values.length === 0 || !values.some((v) => v.trim())) {
      continue; // 跳过空行
    }

    try {
      const typeValue = values[columnMap.type]?.trim().toLowerCase();
      let type: string = 'single';

      // 解析题型
      if (typeValue?.includes('单')) {
        type = 'single';
      } else if (typeValue?.includes('多')) {
        type = 'multiple';
      } else if (typeValue?.includes('编程') || typeValue?.includes('代码') || typeValue?.includes('program')) {
        type = 'programming';
      } else if (typeValue?.includes('single') || typeValue === '1' || typeValue === 'a') {
        type = 'single';
      } else if (typeValue?.includes('multiple') || typeValue?.includes('多选')) {
        type = 'multiple';
      }

      const title = values[columnMap.title]?.trim();
      if (!title) {
        console.warn(`跳过第 ${i + 1} 行：题目为空`);
        continue;
      }

      // 解析答案
      let answer: string | string[] = '';
      const answerValue = values[columnMap.answer]?.trim() || '';

      if (type === 'multiple') {
        // 多选题：答案可能是逗号分隔的多个选项
        answer = answerValue.split(/[,，;；|]/).map((a) => a.trim()).filter((a) => a);
      } else {
        answer = answerValue;
      }

      // 解析选项
      let options: string[] | undefined;
      if (type !== 'programming' && columnMap.options !== undefined) {
        const optionsValue = values[columnMap.options]?.trim();
        if (optionsValue) {
          options = optionsValue.split(/[,，;；|]/).map((o) => o.trim()).filter((o) => o);
        }
      }

      // 解析分值
      let points = 5; // 默认分值
      if (columnMap.points !== undefined) {
        const pointsValue = values[columnMap.points]?.trim();
        if (pointsValue) {
          const parsedPoints = parseInt(pointsValue, 10);
          if (!isNaN(parsedPoints) && parsedPoints > 0) {
            points = parsedPoints;
          }
        }
      }

      // 解析代码
      let code: string | undefined;
      if (columnMap.code !== undefined) {
        code = values[columnMap.code]?.trim();
      }

      // 解析输入
      let input: string | undefined;
      if (columnMap.input !== undefined) {
        input = values[columnMap.input]?.trim();
      }

      questions.push({
        type,
        title,
        options,
        answer,
        explanation:
          columnMap.explanation !== undefined ? values[columnMap.explanation]?.trim() : undefined,
        points,
        code,
        input,
      });
    } catch (err) {
      console.warn(`解析第 ${i + 1} 行时出错:`, err);
    }
  }

  if (questions.length === 0) {
    throw new Error('CSV 文件中没有找到有效的题目数据。');
  }

  return questions;
}
