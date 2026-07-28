/**
 * 判分逻辑「单一事实源」（R4）
 *
 * 框架无关纯函数包：零 React / 零 Node 依赖（仅 type-only 引用领域类型）。
 * 三端统一引用：
 *   - 前端 `useExam` / `ResultScreen` 等直接 `import { isAnswerCorrect } from '@/shared/scoring'`
 *   - 服务端通过 `scripts/build-scoring.mjs` 生成 `server/src/utils/examScoring.generated.js`
 *   - Chrome 扩展通过同一脚本生成 `chrome-extension/scoring.js`（IIFE 挂在 window.StudyScoring）
 *
 * 严禁在三端各自维护判分实现，任何口径调整只改本文件 + 重新生成。
 */

import type { Question } from '../../types';

/** 选项字母（A-Z）转 0-based 索引 */
function letterToIndex(label: string): number {
  if (!/^[A-Z]$/.test(label.toUpperCase())) return -1;
  return label.toUpperCase().charCodeAt(0) - 65;
}

/** 把「答案标签或选项文本」解析为选项 0-based 索引；无法解析返回 -1 */
function optionIndexFromLabelOrText(options: string[] | undefined, answer: unknown): number {
  if (!options) return -1;
  const s = String(answer ?? '').trim();
  const letterIdx = letterToIndex(s);
  if (letterIdx >= 0) return letterIdx;
  return options.findIndex((o) => o?.trim() === s);
}

/** 题目所有正确答案对应的选项索引（排序后） */
export function correctOptionIndices(question: Pick<Question, 'type' | 'answer' | 'options'>): number[] {
  const ans = question.answer;
  if (Array.isArray(ans)) {
    return ans
      .map((a) => optionIndexFromLabelOrText(question.options, a))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
  }
  const i = optionIndexFromLabelOrText(question.options, ans);
  return i >= 0 ? [i] : [];
}

/** 单题判分：支持 single / multiple / programming，含 A-Z 标签↔选项文本回退 */
export function isAnswerCorrect(q: Question, userAns: unknown): boolean {
  if (!userAns) return false;

  if (q.type === 'single') {
    const uAns = typeof userAns === 'string' ? userAns.trim() : String(userAns);
    const qAns = typeof q.answer === 'string' ? q.answer.trim() : String(q.answer);

    if (uAns === qAns) return true;

    if (q.options && /^[A-Z]$/.test(qAns.toUpperCase())) {
      const labelIndex = qAns.toUpperCase().charCodeAt(0) - 65;
      if (q.options[labelIndex]?.trim() === uAns) return true;
    }

    return false;
  }

  if (q.type === 'multiple') {
    const sortedUser = Array.isArray(userAns) ? [...userAns].map((s) => String(s).trim()).sort() : [];
    const qAns = q.answer;

    let targetAns = Array.isArray(qAns) ? [...qAns].map((s) => String(s).trim()).sort() : [];

    if (q.options && targetAns.every((a) => /^[A-Z]$/.test(a.toUpperCase()))) {
      targetAns = targetAns
        .map((label) => {
          const idx = label.toUpperCase().charCodeAt(0) - 65;
          return q.options![idx]?.trim() || label;
        })
        .sort();
    }

    return sortedUser.length > 0 && JSON.stringify(sortedUser) === JSON.stringify(targetAns);
  }

  if (q.type === 'programming') {
    const normalize = (s: string) =>
      (s ? String(s) : '').replace(/\s+/g, '').replace(/['"]/g, '"').toLowerCase() || '';
    return normalize(userAns as string) === normalize(q.answer as string);
  }

  return false;
}

/** 秒数 → m:ss */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface GradeResult {
  is_correct: boolean | null;
  earned: number;
  needs_manual: boolean;
}

/**
 * 对单题评分，统一返回 { is_correct, earned, needs_manual }。
 * 编程题不自动判分：is_correct=null、earned=0、needs_manual=true。
 */
export function gradeQuestion(
  question: Question,
  userAnswer: unknown,
  points: number,
): GradeResult {
  const pts = Number(points) || 0;

  if (question && question.type === 'programming') {
    return { is_correct: null, earned: 0, needs_manual: true };
  }

  const isCorrect = isAnswerCorrect(question, userAnswer);
  return {
    is_correct: isCorrect,
    earned: isCorrect ? pts : 0,
    needs_manual: false,
  };
}

/**
 * 扩展端专用：用户选择了若干选项（0-based 索引）时，判断是否与正确答案一致。
 * 取代 chrome-extension/popup.js 原先脆弱的 A-Z 字母→index 逻辑（无选项文本回退）。
 */
export function scoreByIndices(
  question: Pick<Question, 'type' | 'answer' | 'options'>,
  selectedIndices: number[],
): boolean {
  const sorted = [...(selectedIndices || [])].map(Number).sort((a, b) => a - b);

  if (question.type === 'programming') {
    // 索引对编程题无意义，回退到文本判分（扩展端极少触发）
    return isAnswerCorrect(question as Question, sorted);
  }

  const correct = correctOptionIndices(question);
  return sorted.length === correct.length && sorted.every((v, i) => v === correct[i]);
}
