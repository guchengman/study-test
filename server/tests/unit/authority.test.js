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
