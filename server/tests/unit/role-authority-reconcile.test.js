/**
 * M2 对账口径单测（不连库）。
 * 保证 reconcile 脚本的期望映射与运行时 mapUserRoleToOrg 完全一致，
 * 防止两处口径漂移导致对账假绿/假红。
 */
import { describe, it, expect } from 'vitest';
import { mapUserRoleToOrg } from '../../src/utils/personalOrg.js';

// 与 scripts/reconcile-role-authority.cjs 内 EXPECT 保持一致
const EXPECT = { admin: 'platform_admin', teacher: 'content_author' };
const expectedOrgRole = (legacy) => EXPECT[legacy] || 'examinee';

describe('reconcile 期望映射 == mapUserRoleToOrg', () => {
  it('四种 users.role 口径一致', () => {
    for (const r of ['admin', 'teacher', 'student', 'independent']) {
      expect(expectedOrgRole(r)).toBe(mapUserRoleToOrg(r));
    }
  });
  it('未知角色兜底 examinee（与 mapUserRoleToOrg else 分支一致）', () => {
    expect(expectedOrgRole('weird')).toBe(mapUserRoleToOrg('weird'));
    expect(expectedOrgRole(null)).toBe('examinee');
  });
});
