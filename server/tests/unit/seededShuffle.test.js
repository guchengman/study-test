/**
 * FR-202 seededShuffle 单测（确定性、分布合理性、选项乱序）。
 *
 * 核心契约：同 seed + 同数组 → 永远得到同排列（复用 attempt 不复洗的数学基础）。
 */
import { describe, it, expect } from 'vitest';
import {
  createRng,
  shuffle,
  generateSeed,
  shuffleQuestions,
  buildOptionOrder,
  applyOptionOrder,
} from '../../src/utils/seededShuffle.js';

describe('createRng', () => {
  it('同 seed 产出相同序列', () => {
    const rng1 = createRng(12345);
    const rng2 = createRng(12345);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    expect(seq1).toEqual(seq2);
  });

  it('不同 seed 产出不同序列', () => {
    const rng1 = createRng(100);
    const rng2 = createRng(200);
    const v1 = rng1();
    const v2 = rng2();
    expect(v1).not.toBe(v2);
  });

  it('值域 [0, 1)', () => {
    const rng = createRng(77777);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('同 seed 同数组 → 同排列（确定性）', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const r1 = shuffle(arr, createRng(42));
    const r2 = shuffle(arr, createRng(42));
    expect(r1).toEqual(r2);
  });

  it('不修改原数组', () => {
    const arr = [1, 2, 3];
    const result = shuffle(arr, createRng(99));
    expect(arr).toEqual([1, 2, 3]);
    expect(result).not.toBe(arr);
  });

  it('结果包含所有原元素（无丢失/重复）', () => {
    const arr = Array.from({ length: 50 }, (_, i) => i);
    const result = shuffle(arr, createRng(1234));
    expect(result.sort((a, b) => a - b)).toEqual(arr);
  });

  it('空数组和单元素安全', () => {
    expect(shuffle([], createRng(1))).toEqual([]);
    expect(shuffle([42], createRng(1))).toEqual([42]);
  });
});

describe('generateSeed', () => {
  it('返回正整数 < 2^31', () => {
    for (let i = 0; i < 20; i++) {
      const s = generateSeed();
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(0x7fffffff);
      expect(Number.isInteger(s)).toBe(true);
    }
  });

  it('多次调用大概率不同（随机性）', () => {
    const seeds = new Set(Array.from({ length: 50 }, () => generateSeed()));
    expect(seeds.size).toBeGreaterThan(45); // 50 次中至少 46 个不同
  });
});

describe('shuffleQuestions', () => {
  it('同 seed 确定性乱序', () => {
    const qs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
    const r1 = shuffleQuestions(qs, 7777);
    const r2 = shuffleQuestions(qs, 7777);
    expect(r1.map((q) => q.id)).toEqual(r2.map((q) => q.id));
  });

  it('seed 为 null/0 时返回原序', () => {
    const qs = [{ id: 1 }, { id: 2 }];
    expect(shuffleQuestions(qs, null)).toBe(qs);
    expect(shuffleQuestions(qs, 0)).toBe(qs);
  });

  it('乱序后元素数不变', () => {
    const qs = Array.from({ length: 20 }, (_, i) => ({ id: i }));
    const r = shuffleQuestions(qs, 555);
    expect(r.length).toBe(20);
    expect(r.map((q) => q.id).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });
});

describe('buildOptionOrder', () => {
  it('为含多选项的题生成排列', () => {
    const qs = [
      { id: 1, options: ['A', 'B', 'C', 'D'] },
      { id: 2, options: ['对', '错'] },
      { id: 3, options: [] },        // 无选项
      { id: 4, options: ['only'] },  // 单选项，不生成
    ];
    const order = buildOptionOrder(qs, 42);
    expect(order[1]).toHaveLength(4);
    expect(order[2]).toHaveLength(2);
    expect(order[3]).toBeUndefined();
    expect(order[4]).toBeUndefined();
  });

  it('确定性：同 seed 同题 → 同排列', () => {
    const qs = [{ id: 1, options: ['a', 'b', 'c'] }];
    const o1 = buildOptionOrder(qs, 9999);
    const o2 = buildOptionOrder(qs, 9999);
    expect(o1).toEqual(o2);
  });

  it('排列覆盖 0..n-1 无重复', () => {
    const qs = [{ id: 1, options: ['a', 'b', 'c', 'd', 'e'] }];
    const perm = buildOptionOrder(qs, 123)[1];
    expect(perm.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('applyOptionOrder', () => {
  it('按排列重排选项', () => {
    const options = ['Alpha', 'Beta', 'Gamma', 'Delta'];
    const perm = [2, 0, 3, 1];
    expect(applyOptionOrder(options, perm)).toEqual(['Gamma', 'Alpha', 'Delta', 'Beta']);
  });

  it('无 perm 或长度不匹配返回原序', () => {
    const options = ['a', 'b', 'c'];
    expect(applyOptionOrder(options, null)).toEqual(options);
    expect(applyOptionOrder(options, [0, 1])).toEqual(options);
  });
});
