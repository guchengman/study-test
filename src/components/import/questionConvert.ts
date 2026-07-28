// ParsedQuestion → Question 的单一映射（从 ImportModal 抽取，消除审计示例 2 的 3 处重复映射）
import type { Question, SubjectId } from '../../types';
import type { ParsedQuestion } from '../../services/extract/types';

/**
 * 将解析得到的题目数组统一映射为领域 Question（带临时负 id，提交时由后端分配）。
 * @param parsed 来自 CSV / JSON / MD 解析的中间结构
 * @param currentSubjectId 当前科目（缺省回退 'python'）
 */
export function convertParsedQuestions(
  parsed: ParsedQuestion[],
  currentSubjectId?: SubjectId
): Question[] {
  const base: SubjectId = currentSubjectId || 'python';
  return parsed.map((pq, idx) => {
    const tempId = -Date.now() - idx;
    return {
      id: tempId,
      subject: base,
      type: (pq.type || 'single') as Question['type'],
      title: pq.title,
      code: pq.code,
      options: pq.options,
      answer: pq.answer,
      explanation: pq.explanation,
      points: pq.points || 5,
      input: pq.input,
    };
  });
}
