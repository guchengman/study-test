/**
 * build-scoring.mjs 产物一致性回归（R4 单一事实源）
 *
 * scripts/build-scoring.mjs 由 src/shared/scoring/index.ts 生成两份副本：
 *   - server/src/utils/examScoring.generated.js  (ESM)
 *   - chrome-extension/scoring.js               (IIFE，挂载 window.StudyScoring)
 * 本测试把两份产物「按实际运行形态」加载进来，与源码导出逐函数比对关键输出，
 * 确保生成的副本与单一事实源逻辑一致（任何改动源码后忘记重新 sync:scoring 都会翻红）。
 *
 * 产物为已编译 JS：ESM 版去掉 export 语句后用 new Function 取导出对象；
 * IIFE 版直接 return StudyScoring 全局。均不依赖真实模块解析，稳定可靠。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isAnswerCorrect,
  correctOptionIndices,
  scoreByIndices,
  gradeQuestion,
  formatTime,
} from '../shared/scoring';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 测试文件位于 src/__tests__，向上两级回到仓库根目录
const root = path.resolve(__dirname, '..', '..');
const serverOut = path.join(root, 'server/src/utils/examScoring.generated.js');
const chromeOut = path.join(root, 'chrome-extension/scoring.js');

// ESM 产物：去掉末尾 export {...}，用 new Function 取出导出对象
function loadServerGenerated(): Record<string, (...a: unknown[]) => unknown> {
  let code = readFileSync(serverOut, 'utf-8');
  code = code.replace(/export\s*\{[^}]*\}\s*;?\s*$/s, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(
    `${code}\nreturn { correctOptionIndices, formatTime, gradeQuestion, isAnswerCorrect, scoreByIndices };`,
  )() as Record<string, (...a: unknown[]) => unknown>;
}

// IIFE 产物：var StudyScoring = (()=>{...})(); 直接 return StudyScoring
function loadChromeGenerated(): Record<string, (...a: unknown[]) => unknown> {
  const code = readFileSync(chromeOut, 'utf-8');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(
    `${code}\nreturn typeof StudyScoring !== 'undefined' ? StudyScoring : undefined;`,
  )() as Record<string, (...a: unknown[]) => unknown>;
}

const singleQ = { type: 'single', options: ['Apple', 'Banana', 'Cat', 'Dog'], answer: 'B' };
const multiQ = { type: 'multiple', options: ['1', '2', '3', '4'], answer: ['B', 'D'] };
const progQ = { type: 'programming', answer: 'print(1)' };

// 收集某实现（source / server / chrome）的一組关键输出快照
function collect(impl: Record<string, (...a: unknown[]) => unknown>) {
  return {
    singleCorrect: impl.isAnswerCorrect(singleQ, 'Banana'),
    singleWrong: impl.isAnswerCorrect(singleQ, 'Apple'),
    multiCorrect: impl.isAnswerCorrect(multiQ, ['D', 'B']),
    multiPartial: impl.isAnswerCorrect(multiQ, ['B']),
    progCorrect: impl.isAnswerCorrect(progQ, 'print( 1 )'),
    progWrong: impl.isAnswerCorrect(progQ, 'print(2)'),
    correctSingleIdx: impl.correctOptionIndices(singleQ),
    correctMultiIdx: impl.correctOptionIndices(multiQ),
    correctProgIdx: impl.correctOptionIndices(progQ),
    scoreSingleHit: impl.scoreByIndices(singleQ, [1]),
    scoreSingleMiss: impl.scoreByIndices(singleQ, [0]),
    scoreMultiHit: impl.scoreByIndices(multiQ, [1, 3]),
    scoreMultiOrder: impl.scoreByIndices(multiQ, [3, 1]),
    scoreMultiMiss: impl.scoreByIndices(multiQ, [1]),
    gradeSingle: impl.gradeQuestion(singleQ, 'Banana', 10),
    gradeProg: impl.gradeQuestion(progQ, 'print(1)', 20),
    t0: impl.formatTime(0),
    t5: impl.formatTime(5),
    t65: impl.formatTime(65),
    t600: impl.formatTime(600),
  };
}

describe('build-scoring 产物一致性（R4）', () => {
  const source = { isAnswerCorrect, correctOptionIndices, scoreByIndices, gradeQuestion, formatTime };
  const server = loadServerGenerated();
  const chrome = loadChromeGenerated();

  it('两份产物均导出全部 5 个判分函数', () => {
    for (const fn of [
      'isAnswerCorrect',
      'correctOptionIndices',
      'scoreByIndices',
      'gradeQuestion',
      'formatTime',
    ]) {
      expect(typeof server[fn]).toBe('function');
      expect(typeof chrome[fn]).toBe('function');
    }
  });

  it('server 生成副本与源码输出完全一致', () => {
    expect(collect(server as never)).toEqual(collect(source as never));
  });

  it('chrome 生成副本与源码输出完全一致', () => {
    expect(collect(chrome as never)).toEqual(collect(source as never));
  });

  it('server 副本与 chrome 副本彼此一致（双轨同源）', () => {
    expect(collect(server as never)).toEqual(collect(chrome as never));
  });
});
