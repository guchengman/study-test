/**
 * FR-103 人工判分领域逻辑（纯函数，零 I/O）。
 *
 * applyManualScore：对一份 details 应用某题人工分，并按 SSOT 口径重算总分。
 * recomputeTotals：以 details 重算 score/correctCount/totalCount（与 gradeAttempt 一致）。
 *
 * 约定：
 *   - earned 夹到 [0, points]（四舍五入取整）。
 *   - is_correct = (points > 0 && earned === points)。
 *   - changedToComplete：判完此题后，该 attempt 无剩余 needs_manual。
 *   - 不修改入参 details（返回新数组 / 浅拷贝被改项）。
 */

/** 四舍五入并夹到 [0, points] 的整数分。 */
function clampEarned(raw, points) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), Math.max(0, points));
}

/**
 * 以 details 重算总分口径（与 gradeAttempt 一致：score=Σ earned，correct=|{is_correct===true}|）。
 * @param {Array} details
 * @returns {{score:number, correctCount:number, totalCount:number}}
 */
export function recomputeTotals(details) {
  let score = 0;
  let correctCount = 0;
  for (const d of details) {
    score += Number(d.earned) || 0;
    if (d.is_correct === true) correctCount += 1;
  }
  return { score, correctCount, totalCount: details.length };
}

/**
 * 对指定题目应用人工分，返回新 details + 重算结果。
 * @param {Array} details 原 details 数组（不修改入参，返回浅拷贝项）
 * @param {number} questionId
 * @param {{earned:number, gradedBy?:number}} opts
 * @returns {{details:Array, score:number, correctCount:number, totalCount:number, changedToComplete:boolean}}
 */
export function applyManualScore(details, questionId, { earned, gradedBy = null }) {
  const idx = details.findIndex((d) => Number(d.question_id) === Number(questionId));
  if (idx === -1) throw new Error(`题目 ${questionId} 不在答卷明细中`);
  const points = Number(details[idx].points) || 0;
  const e = clampEarned(earned, points);
  const updated = details.map((d, i) =>
    i === idx
      ? {
          ...d,
          earned: e,
          is_correct: points > 0 && e === points,
          needs_manual: false,
          graded_by: gradedBy,
          graded_at: new Date().toISOString(),
        }
      : d,
  );
  const totals = recomputeTotals(updated);
  const changedToComplete = !updated.some((d) => d.needs_manual === true);
  return { details: updated, ...totals, changedToComplete };
}

/**
 * FR-106 判题回写：同 applyManualScore 口径，额外记录 judge_status/passed/total，graded_by 置 null(=judge)。
 * earned 由调用方按 passed/total 比例算好后传入。
 * @param {Array} details 原 details 数组（不修改入参）
 * @param {number} questionId
 * @param {{earned:number, verdict:string, passed:number, total:number}} opts
 * @returns {{details:Array, score:number, correctCount:number, totalCount:number, changedToComplete:boolean}}
 */
export function applyJudgeScore(details, questionId, { earned, verdict, passed, total }) {
  const idx = details.findIndex((d) => Number(d.question_id) === Number(questionId));
  if (idx === -1) throw new Error(`题目 ${questionId} 不在答卷明细中`);
  const points = Number(details[idx].points) || 0;
  const e = clampEarned(earned, points);
  const updated = details.map((d, i) =>
    i === idx
      ? {
          ...d,
          earned: e,
          is_correct: points > 0 && e === points,
          needs_manual: false,
          graded_by: null,
          graded_at: new Date().toISOString(),
          judge_status: verdict,
          judge_passed: passed,
          judge_total: total,
        }
      : d,
  );
  const totals = recomputeTotals(updated);
  const changedToComplete = !updated.some((d) => d.needs_manual === true);
  return { details: updated, ...totals, changedToComplete };
}

export default { applyManualScore, recomputeTotals, applyJudgeScore };
