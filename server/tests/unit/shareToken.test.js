process.env.JWT_SECRET = 'test_secret_for_unit_0123456789';
import { describe, it, expect } from 'vitest';
import { signShareToken, verifyShareToken } from '../../src/utils/shareToken.js';

describe('shareToken', () => {
  it('签发的 token 可验回 code 与 qids', () => {
    const t = signShareToken({ code: 'ABC123', qids: [1, 2, 3] });
    const p = verifyShareToken(t);
    expect(p.code).toBe('ABC123');
    expect(p.qids).toEqual([1, 2, 3]);
  });
  it('篡改 token 验签抛错', () => {
    const t = signShareToken({ code: 'ABC', qids: [1] });
    expect(() => verifyShareToken(t + 'x')).toThrow();
  });
  it('过期 token 被拒', () => {
    const t = signShareToken({ code: 'ABC', qids: [1] }, { expiresIn: '-1s' });
    expect(() => verifyShareToken(t)).toThrow();
  });
});
