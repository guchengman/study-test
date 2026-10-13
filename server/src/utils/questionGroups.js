/**
 * FR-104 材料题（一拖 N）——材料组创建入参校验（纯函数，零 DB 依赖，便于单测）。
 *
 * 与判分口径保持一致：子题本身仍是普通题型（复用 VALID_QUESTION_TYPES），
 * 材料组只是给这 N 道子题挂一段共享材料，判分逻辑不变（见 examSweep.gradeAttempt）。
 */

/** 子题允许的题型（与 server/src/routes/questions.js、SSOT 保持一致） */
export const VALID_QUESTION_TYPES = ['single', 'multiple', 'programming', 'judge', 'fill_in', 'short_answer'];

/**
 * 校验建组入参。
 * @param {object} payload - { subject_id, material, questions:[{type,title,answer,...}] }
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateGroupPayload(payload) {
  const errors = [];
  const p = payload || {};

  if (!p.subject_id || String(p.subject_id).trim() === '') errors.push('subject_id 不能为空');
  if (!p.material || String(p.material).trim() === '') errors.push('material（共享材料）不能为空');

  if (!Array.isArray(p.questions) || p.questions.length === 0) {
    errors.push('questions 至少包含一道子题');
    return { ok: false, errors };
  }

  p.questions.forEach((q, i) => {
    const n = i + 1;
    const type = (q && q.type) || 'single';
    if (!VALID_QUESTION_TYPES.includes(type)) errors.push(`第 ${n} 道子题题型无效: ${type}`);
    if (!q || !q.title || String(q.title).trim() === '') errors.push(`第 ${n} 道子题缺少标题`);
    if (!q || q.answer === undefined || q.answer === null || q.answer === '') errors.push(`第 ${n} 道子题缺少答案`);
  });

  return { ok: errors.length === 0, errors };
}

export default { validateGroupPayload, VALID_QUESTION_TYPES };
