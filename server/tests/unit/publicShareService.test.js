process.env.JWT_SECRET = 'test_secret_for_unit_0123456789';
import { describe, it, expect } from 'vitest';
import { buildPreview, buildGrade } from '../../src/services/publicShareService.js';

// 按 SQL 关键字分派返回行的极简 mock db
function dbWith(handlers) {
  return {
    async query(sql) {
      for (const [re, rows] of handlers) if (re.test(sql)) return [rows];
      return [[]];
    },
  };
}

describe('buildPreview', () => {
  it('有效 all 科目 → 200，响应不泄 answer/explanation', async () => {
    const db = dbWith([
      [/FROM invite_codes/, [{ subject_id: 'S1', expires_at: null }]],
      [/FROM subjects/, [{ id: 'S1', name: '数学', icon: '📐', welcome_title: '欢迎', welcome_desc: '介绍', share_scope: 'all', created_by: 9 }]],
      [/FROM users/, [{ username: 'teacher_a' }]],
      [/GROUP BY/, [{ type: 'single', c: 10 }]],
      [/ORDER BY RAND/, [{ id: 1, type: 'single', title: '1+1=?', options: ['1', '2', '3'], answer: 'B' }]],
    ]);
    const r = await buildPreview(db, 'CODE1');
    expect(r.status).toBe(200);
    expect(r.body.subject.name).toBe('数学');
    expect(r.body.experience.questions[0]).toEqual({ id: 1, type: 'single', title: '1+1=?', options: ['1', '2', '3'] });
    const json = JSON.stringify(r.body);
    expect(json).not.toMatch(/"answer"/);
    expect(json).not.toMatch(/"explanation"/);
    expect(r.body.experience.quizToken).toBeTruthy();
  });

  it('私有科目 → 404 统一话术', async () => {
    const db = dbWith([
      [/FROM invite_codes/, [{ subject_id: 'S1', expires_at: null }]],
      [/FROM subjects/, [{ id: 'S1', name: 'x', share_scope: 'students', created_by: 9 }]],
    ]);
    const r = await buildPreview(db, 'CODE1');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('链接不存在或已失效');
  });

  it('未知码 → 404 同一话术（防枚举）', async () => {
    const db = dbWith([[/FROM invite_codes/, []]]);
    const r = await buildPreview(db, 'BAD');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('链接不存在或已失效');
  });
});

describe('buildGrade', () => {
  it('全对 → 100，响应不含 answer', async () => {
    const db = { async query() { return [[{ id: 1, type: 'single', answer: 'B', options: ['1', '2', '3'] }]]; } };
    const { signShareToken } = await import('../../src/utils/shareToken.js');
    const token = signShareToken({ code: 'C', qids: [1] });
    const r = await buildGrade(db, token, { 1: 'B' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ total: 1, correct: 1, scorePercent: 100 });
    expect(JSON.stringify(r.body)).not.toMatch(/"answer"/);
  });

  it('令牌被篡改 → 400', async () => {
    const r = await buildGrade({}, 'garbage.token.value', { 1: 'A' });
    expect(r.status).toBe(400);
  });

  it('忽略令牌外的 qid（防探测任意题）', async () => {
    const db = { async query() { return [[{ id: 1, type: 'single', answer: 'B', options: ['1', '2', '3'] }]]; } };
    const { signShareToken } = await import('../../src/utils/shareToken.js');
    const token = signShareToken({ code: 'C', qids: [1] });
    const r = await buildGrade(db, token, { 1: 'B', 999: 'A' });
    expect(r.body.total).toBe(1);
    expect(r.body.results.map((x) => x.qid)).toEqual([1]);
  });
});
