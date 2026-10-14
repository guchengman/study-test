import type { PublicShareQuestion } from '../services/api';

// 仅客观题可在落地页即时判分
export function isAnswerableType(type: string): boolean {
  return type === 'single' || type === 'multiple';
}

// 视图状态机
export type SharePhase = 'loading' | 'invalid' | 'preview' | 'quiz' | 'result';

// 每题所选（single: 字母标签；multiple: 字母标签数组）
export type AnswerMap = Record<number, string | string[]>;

// 转成后端 wire 形态：键统一为字符串，值原样（不含任何答案/解析）
export function buildAnswersPayload(answers: AnswerMap): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(answers)) out[k] = v;
  return out;
}

// 记录一次选择：单选替换，多选切换并按字母排序
export function singleSelect(prev: AnswerMap, q: PublicShareQuestion, choice: string): AnswerMap {
  if (q.type === 'multiple') {
    const cur = Array.isArray(prev[q.id]) ? (prev[q.id] as string[]) : [];
    const next = cur.includes(choice) ? cur.filter((c) => c !== choice) : [...cur, choice].sort();
    return { ...prev, [q.id]: next };
  }
  return { ...prev, [q.id]: choice };
}
