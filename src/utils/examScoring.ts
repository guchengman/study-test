/**
 * 判分与展示用的纯函数（无 React 依赖）
 *
 * ⚠️ 本文件为兼容壳：真实实现已收敛到 `@/shared/scoring`（单一事实源，R4）。
 * 任何判分口径调整请改 `src/shared/scoring/index.ts` 并重新生成：
 *   npm run sync:scoring
 * 不要在本文件内复制判分逻辑。
 */

export {
  isAnswerCorrect,
  formatTime,
  gradeQuestion,
  scoreByIndices,
  correctOptionIndices,
} from '../shared/scoring';
