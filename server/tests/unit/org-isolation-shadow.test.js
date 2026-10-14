// server/tests/unit/org-isolation-shadow.test.js
import { describe, it, expect, vi } from 'vitest';
import { shadowCompare, isShadowActive } from '../../src/utils/orgIsolationShadow.js';

describe('shadowCompare', () => {
  it('orgIds=[1]：org_id=1 保留、org_id=2 隐藏、NULL 记 missingOrg', () => {
    const rows = [{ id: 1, org_id: 1 }, { id: 2, org_id: 2 }, { id: 3, org_id: null }];
    const r = shadowCompare(rows, [1], 'subjects');
    expect(r.kept).toEqual([1]);
    expect(r.wouldHide).toEqual([{ id: 2, org_id: 2 }]);
    expect(r.missingOrg).toEqual([{ id: 3 }]);
    expect(r.drift).toBe(2); // wouldHide + missingOrg
  });
  it('全部同组织 → drift=0', () => {
    const r = shadowCompare([{ id: 1, org_id: 7 }], [7], 'x');
    expect(r.drift).toBe(0);
    expect(r.kept).toEqual([1]);
  });
  it('空 rows → 全 0', () => {
    expect(shadowCompare([], [1], 'x')).toEqual({ kept: [], wouldHide: [], missingOrg: [], drift: 0 });
  });
});

describe('isShadowActive', () => {
  it('由环境变量决定', () => {
    vi.stubEnv('ORG_ISOLATION_MODE', 'shadow');
    expect(isShadowActive()).toBe(true);
    vi.stubEnv('ORG_ISOLATION_MODE', 'off');
    expect(isShadowActive()).toBe(false);
    vi.unstubAllEnvs();
  });
});
