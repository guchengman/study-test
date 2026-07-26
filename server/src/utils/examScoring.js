/**
 * 判分纯函数（Node 端评分权威，移植自 src/utils/examScoring.ts）
 *
 * 与前端 examScoring.ts 保持完全一致的判定逻辑：
 *   - single：去空格 + 可选 A-Z 标签映射（answer 为 "B" 时映射到 options[1] 文本比对）
 *   - multiple：排序后比对，A-Z 标签先映射到选项文本再排序
 *   - programming：去空白、引号归一为双引号、转小写后比对
 *
 * 额外导出 gradeQuestion(question, userAnswer, points)，统一返回
 * { is_correct, earned, needs_manual }：
 *   - single/multiple：is_correct = isAnswerCorrect(...)，earned = 命中 ? points : 0，needs_manual = false
 *   - programming：is_correct = null，earned = 0，needs_manual = true（不自动判分）
 */

/**
 * 判断用户答案是否正确（客观题返回 boolean，编程题返回 boolean）。
 * @param {Object} q 题目对象 { type, answer, options }
 * @param {unknown} userAns 用户作答
 * @returns {boolean}
 */
export function isAnswerCorrect(q, userAns) {
  if (!userAns) return false;

  if (q.type === 'single') {
    const uAns = typeof userAns === 'string' ? userAns.trim() : String(userAns);
    const qAns = typeof q.answer === 'string' ? q.answer.trim() : String(q.answer);

    if (uAns === qAns) return true;

    // 答案可能是 A-Z 标签，映射到选项文本再比对
    if (q.options && /^[A-Z]$/.test(qAns.toUpperCase())) {
      const labelIndex = qAns.toUpperCase().charCodeAt(0) - 65; // 'A' -> 0
      if (q.options[labelIndex]?.trim() === uAns) return true;
    }

    return false;
  }

  if (q.type === 'multiple') {
    const sortedUser = Array.isArray(userAns)
      ? [...userAns].map((s) => String(s).trim()).sort()
      : [];
    const qAns = q.answer;

    let targetAns = Array.isArray(qAns)
      ? [...qAns].map((s) => String(s).trim()).sort()
      : [];

    // 答案可能是 A-Z 标签数组，映射到选项文本后再排序
    if (q.options && targetAns.every((a) => /^[A-Z]$/.test(a.toUpperCase()))) {
      targetAns = targetAns
        .map((label) => {
          const idx = label.toUpperCase().charCodeAt(0) - 65;
          return q.options[idx]?.trim() || label;
        })
        .sort();
    }

    return sortedUser.length > 0 && JSON.stringify(sortedUser) === JSON.stringify(targetAns);
  }

  if (q.type === 'programming') {
    const normalize = (s) =>
      (s ? String(s) : '')
        .replace(/\s+/g, '')
        .replace(/['"]/g, '"')
        .toLowerCase() || '';
    return normalize(userAns) === normalize(q.answer);
  }

  return false;
}

/**
 * 对单题评分，返回统一结构。
 * @param {Object} question 题目对象 { type, answer, options }
 * @param {unknown} userAnswer 用户作答
 * @param {number} points 该题分值
 * @returns {{ is_correct: boolean|null, earned: number, needs_manual: boolean }}
 */
export function gradeQuestion(question, userAnswer, points) {
  const pts = Number(points) || 0;

  // 编程题不自动判分：is_correct=null、earned=0、needs_manual=true
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

export default { isAnswerCorrect, gradeQuestion };
