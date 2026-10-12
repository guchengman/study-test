/**
 * FR-202 确定性乱序工具（种子化 PRNG + Fisher-Yates）。
 *
 * 设计：
 *   - mulberry32：32-bit 状态、单步 O(1)、统计质量满足「防抄袭题序/选项序」场景（非密码学）。
 *   - 同 seed + 同数组长度 → 每次调用产出相同排列（复用 attempt 不重洗的关键保证）。
 *   - 生成 seed 使用 crypto.randomInt（Node 14.10+），每次新建 attempt 一次性持久化。
 */
import crypto from 'crypto';

/**
 * mulberry32 PRNG：返回 () => float in [0, 1)，同 seed 确定性。
 */
export function createRng(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates 洗牌（原地、使用传入 rng），返回新数组（不修改入参）。
 */
export function shuffle(arr, rng) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 生成随机 seed（32-bit 正整数），用于新建 attempt 持久化。
 */
export function generateSeed() {
  return crypto.randomInt(1, 0x7fffffff); // [1, 2^31)
}

/**
 * 基于 seed 对题目数组乱序（整卷题序个性化）。
 * @param {Array} questions - 题目数组（按 question_set 原序）
 * @param {number} seed - shuffle_seed
 * @returns {Array} 乱序后的新数组
 */
export function shuffleQuestions(questions, seed) {
  if (!seed || !Array.isArray(questions)) return questions;
  const rng = createRng(seed);
  return shuffle(questions, rng);
}

/**
 * 基于 seed 为每题生成选项乱序映射。
 * option_order 格式: { "<question_id>": [2, 0, 3, 1], ... }（值=原始下标序列）
 * @param {Array} questions - 含 id, options, type 的题目数组（已乱序后）
 * @param {number} seed - shuffle_seed
 * @returns {Object} option_order mapping
 */
export function buildOptionOrder(questions, seed) {
  if (!seed || !Array.isArray(questions)) return {};
  const rng = createRng(seed ^ 0x5f3a1b2c); // 与题序用不同派生流，避免模式相关
  const order = {};
  for (const q of questions) {
    if (q.options && Array.isArray(q.options) && q.options.length > 1) {
      const indices = q.options.map((_, i) => i);
      order[q.id] = shuffle(indices, rng);
    }
  }
  return order;
}

/**
 * 根据 option_order 对单题选项乱序展示。
 * @param {string[]} options - 原始选项数组
 * @param {number[]} perm - 排列下标（如 [2,0,3,1] 表示显示第0位放原第2个）
 * @returns {string[]} 乱序后的选项数组
 */
export function applyOptionOrder(options, perm) {
  if (!perm || !Array.isArray(perm) || perm.length !== options.length) return options;
  return perm.map((origIdx) => options[origIdx]);
}
