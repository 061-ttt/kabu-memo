import { describe, expect, it } from 'vitest';
import { safeNext } from '../../src/worker/auth';
import { codeChallenge, safeEqual, signValue, verifyValue } from '../../src/worker/crypto';

describe('PKCE', () => {
  it('RFC 7636 付録Bのテストベクタと一致する', async () => {
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('署名付きクッキー', () => {
  it('改ざんを検出する', async () => {
    const token = await signValue({ state: 'abc' }, 'secret');
    expect(await verifyValue(token, 'secret')).toEqual({ state: 'abc' });
    expect(await verifyValue(token, 'other')).toBeNull();
    const [p, s] = token.split('.');
    const forged = btoa(JSON.stringify({ state: 'evil' })).replace(/=+$/, '');
    expect(await verifyValue(`${forged}.${s}`, 'secret')).toBeNull();
    expect(await verifyValue(`${p}`, 'secret')).toBeNull();
    expect(await verifyValue(undefined, 'secret')).toBeNull();
  });
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('safeNext（オープンリダイレクト対策）', () => {
  it('同一オリジンの相対パスだけ許可する', () => {
    expect(safeNext('/')).toBe('/');
    expect(safeNext('/?tab=task')).toBe('/?tab=task');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext(undefined)).toBe('/');
  });
});
