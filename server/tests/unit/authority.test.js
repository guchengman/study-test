/**
 * M2 角色权威层单测（authority.js）。
 *
 * 覆盖：
 *   - 旧/新两张能力矩阵的语义（含 isOwner 两档旁路 exam.manage_super / exam.manage_any）
 *   - 关键不变量：mapUserRoleToOrg 后旧/新能力集合必须等价（保证「只换源」零行为变更）
 * 纯函数，无需连库。
 */
import { describe, it, expect } from 'vitest';
import {
  capsForLegacyRole,
  capsForOrgRole,
  computeCaps,
  hasCapability,
  requireCapability,
} from '../../src/utils/authority.js';

describe('capability matrix', () => {
  it('admin 拥有 platform.super / student.manage，但不含考生能力', () => {
    const a = capsForLegacyRole('admin');
    expect(a).toContain('platform.super');
    expect(a).toContain('student.manage');
    expect(a).not.toContain('actor.examinee');
  });
  it('teacher 有 content.manage/student.manage/exam.manage_any，无 platform.super / exam.manage_super', () => {
    const t = capsForLegacyRole('teacher');
    expect(t).toContain('content.manage');
    expect(t).toContain('student.manage');
    expect(t).toContain('exam.manage_any');
    expect(t).not.toContain('platform.super');
    expect(t).not.toContain('exam.manage_super'); // exams.js 只 admin 旁路
  });
  it('student 只有考生能力', () => {
    const s = capsForLegacyRole('student');
    expect(s).toContain('actor.examinee');
    expect(s).not.toContain('content.manage');
  });
  it('org 词表：platform_admin 有 super，content_author 有 any 无 super，examinee 只有考生', () => {
    expect(capsForOrgRole('platform_admin')).toContain('platform.super');
    expect(capsForOrgRole('content_author')).toContain('exam.manage_any');
    expect(capsForOrgRole('content_author')).not.toContain('platform.super');
    expect(capsForOrgRole('examinee')).toContain('actor.examinee');
  });
  it('等价性：mapUserRoleToOrg 后旧/新能力集合一致（只换源零行为变更的根据）', () => {
    const pairs = [
      ['admin', 'platform_admin'],
      ['teacher', 'content_author'],
      ['student', 'examinee'],
      ['independent', 'examinee'],
    ];
    for (const [legacy, org] of pairs) {
      expect([...capsForLegacyRole(legacy)].sort()).toEqual([...capsForOrgRole(org)].sort());
    }
  });
});

describe('computeCaps 双读决策', () => {
  it('legacy 源：用 users.role 决定 caps', () => {
    process.env.ROLE_AUTHORITY_SOURCE = 'legacy';
    const caps = computeCaps({ legacyRole: 'teacher', orgRole: 'examinee' });
    expect(caps.has('content.manage')).toBe(true);
  });
  it('org 源：用 org_members.role 决定 caps', () => {
    process.env.ROLE_AUTHORITY_SOURCE = 'org';
    const caps = computeCaps({ legacyRole: 'teacher', orgRole: 'examinee' });
    expect(caps.has('content.manage')).toBe(false);
    expect(caps.has('actor.examinee')).toBe(true);
  });
  it('shadow 源：决策用 legacy，但检测到漂移时回调 onDrift', () => {
    process.env.ROLE_AUTHORITY_SOURCE = 'shadow';
    let drifted = null;
    const caps = computeCaps({ legacyRole: 'admin', orgRole: 'examinee', onDrift: (d) => (drifted = d) });
    expect(caps.has('platform.super')).toBe(true); // 仍按 legacy 决策
    expect(drifted).toEqual({ legacyRole: 'admin', orgRole: 'examinee' }); // 漂移被记录
  });
  it('shadow 源：legacy 与 org 等价时不报漂移', () => {
    process.env.ROLE_AUTHORITY_SOURCE = 'shadow';
    let called = false;
    computeCaps({ legacyRole: 'teacher', orgRole: 'content_author', onDrift: () => (called = true) });
    expect(called).toBe(false);
  });
});

describe('hasCapability / requireCapability', () => {
  const mkReq = (caps) => ({ caps: new Set(caps) });
  it('hasCapability 读取 req.caps', () => {
    expect(hasCapability(mkReq(['content.manage']), 'content.manage')).toBe(true);
    expect(hasCapability(mkReq([]), 'content.manage')).toBe(false);
    expect(hasCapability({}, 'content.manage')).toBe(false);
  });
  it('requireCapability 命中放行、未命中 403', () => {
    const mw = requireCapability('content.manage');
    let nextCalled = false, status = null, body = null;
    const res = { status: (s) => { status = s; return res; }, json: (b) => { body = b; return res; } };
    mw(mkReq(['content.manage']), res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    nextCalled = false;
    mw(mkReq([]), res, () => { nextCalled = true; });
    expect(status).toBe(403);
    expect(body).toEqual({ error: '权限不足' });
  });
});
