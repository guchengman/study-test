/**
 * 判分与展示用的纯函数（无 React 依赖）
 */
import type { Question } from '../types';

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
    const sortedUser = Array.isArray(userAns) ? [...userAns].map(s => s.trim()).sort() : [];
    const qAns = q.answer;

    let targetAns = Array.isArray(qAns) ? [...qAns].map(s => s.trim()).sort() : [];
    if (q.options && targetAns.every(a => /^[A-Z]$/.test(a.toUpperCase()))) {
      targetAns = targetAns
        .map(label => {
          const idx = label.toUpperCase().charCodeAt(0) - 65;
          return q.options![idx]?.trim() || label;
        })
        .sort();
    }

    return sortedUser.length > 0 && JSON.stringify(sortedUser) === JSON.stringify(targetAns);
  }

  if (q.type === 'programming') {
    const normalize = (s: string) => s?.replace(/\s+/g, '').replace(/['"]/g, '"').toLowerCase() || '';
    return normalize(userAns as string) === normalize(q.answer as string);
  }

  return false;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
