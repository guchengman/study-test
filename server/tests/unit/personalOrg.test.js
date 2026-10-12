/**
 * S0 shadow schema 写入侧工具单测（personalOrg.js）。
 *
 * 覆盖：
 *   - mapUserRoleToOrg 的 §5.2 角色映射（admin/teacher/其余）
 *   - ensurePersonalOrg 发两条幂等 INSERT(organizations + org_members)，异常不抛
 *   - resolvePersonalOrgId 命中返回 org_id / 未命中返回 null / 查询异常返回 null
 * 假 db 通过 execute 桩注入，无需真实连接。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  mapUserRoleToOrg,
  ensurePersonalOrg,
  resolvePersonalOrgId,
} from '../../src/utils/personalOrg.js';

describe('S0 personalOrg 写入侧工具', () => {
  it('mapUserRoleToOrg 按 §5.2 映射角色', () => {
    expect(mapUserRoleToOrg('admin')).toBe('platform_admin');
    expect(mapUserRoleToOrg('teacher')).toBe('content_author');
    expect(mapUserRoleToOrg('student')).toBe('examinee');
    expect(mapUserRoleToOrg('independent')).toBe('examinee');
  });

  it('ensurePersonalOrg 发两条幂等 INSERT（组织 + 成员）', async () => {
    const executed = [];
    const db = { execute: async (sql, params) => { executed.push({ sql, params }); return [{ affectedRows: 1 }]; } };
    await ensurePersonalOrg(db, 42, 'teacher_a', 'teacher');
    expect(executed).toHaveLength(2);
    expect(executed[0].sql).toMatch(/INSERT IGNORE INTO organizations/);
    expect(executed[0].params).toEqual(['teacher_a']);
    expect(executed[1].sql).toMatch(/INSERT IGNORE INTO org_members/);
    // 成员关系带映射后的 role + username 定位租户
    expect(executed[1].params).toEqual([42, 'content_author', 'teacher_a']);
  });

  it('ensurePersonalOrg 异常吞掉不外抛（不阻断注册主流程）', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = { execute: async () => { throw new Error('db down'); } };
    await expect(ensurePersonalOrg(db, 1, 'u', 'student')).resolves.toBeUndefined();
    warnSpy.mockRestore();
  });

  it('resolvePersonalOrgId 命中返回 org_id', async () => {
    const db = { execute: async () => [[{ org_id: 7 }]] };
    await expect(resolvePersonalOrgId(db, 3)).resolves.toBe(7);
  });

  it('resolvePersonalOrgId 未命中返回 null', async () => {
    const db = { execute: async () => [[]] };
    await expect(resolvePersonalOrgId(db, 3)).resolves.toBeNull();
  });

  it('resolvePersonalOrgId 查询异常返回 null（shadow 列容错）', async () => {
    const db = { execute: async () => { throw new Error('boom'); } };
    await expect(resolvePersonalOrgId(db, 3)).resolves.toBeNull();
  });
});
