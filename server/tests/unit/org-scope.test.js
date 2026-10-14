// server/tests/unit/org-scope.test.js
import { describe, it, expect, afterEach } from 'vitest';
import { orgIsolationMode, buildOrgFilter } from '../../src/utils/orgScope.js';

const ORIG = process.env.ORG_ISOLATION_MODE;
afterEach(() => {
  if (ORIG === undefined) delete process.env.ORG_ISOLATION_MODE;
  else process.env.ORG_ISOLATION_MODE = ORIG;
});

describe('orgIsolationMode', () => {
  it('默认 off', () => { delete process.env.ORG_ISOLATION_MODE; expect(orgIsolationMode()).toBe('off'); });
  it('shadow 生效', () => { process.env.ORG_ISOLATION_MODE = 'shadow'; expect(orgIsolationMode()).toBe('shadow'); });
  it('enforce 生效（大小写/空格容错）', () => { process.env.ORG_ISOLATION_MODE = ' ENFORCE '; expect(orgIsolationMode()).toBe('enforce'); });
  it('非法值回落 off', () => { process.env.ORG_ISOLATION_MODE = 'yes'; expect(orgIsolationMode()).toBe('off'); });
});

describe('buildOrgFilter', () => {
  it('orgIds=[3,5] → IN(?,?)', () => {
    expect(buildOrgFilter('s', [3, 5])).toEqual({ clause: ' AND s.org_id IN (?,?)', params: [3, 5] });
  });
  it('orgIds=[] → 恒不命中', () => {
    expect(buildOrgFilter('s', [])).toEqual({ clause: ' AND 1=0', params: [] });
  });
  it('去重且升序', () => {
    expect(buildOrgFilter('t', [5, 5, 1]).clause).toBe(' AND t.org_id IN (?,?)');
    expect(buildOrgFilter('t', [5, 5, 1]).params).toEqual([1, 5]);
  });
});
