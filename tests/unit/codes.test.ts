import { describe, expect, it } from 'vitest';
import { extractCodes, isStockCode, toHalfWidth } from '../../src/shared/codes';

describe('isStockCode', () => {
  it('4桁数字と英字入りの新コードを受け付ける', () => {
    for (const c of ['5333', '6098', '7974', '285A', '130A', '9984']) expect(isStockCode(c)).toBe(true);
  });
  it('形式外を拒否する', () => {
    for (const c of ['0123', '533', '53333', 'ABCD', '28A5X', '', '5a33']) expect(isStockCode(c)).toBe(false);
  });
});

describe('extractCodes', () => {
  it('括弧付き・単独のコードを拾う', () => {
    expect(extractCodes('NGK(5333)が海外転勤に一時金')).toEqual(['5333']);
    expect(extractCodes('285A キオクシア 決算')).toEqual(['285A']);
    expect(extractCodes('6098と7974を比較、6098は重い')).toEqual(['6098', '7974']);
    expect(extractCodes('5333.T を監視')).toEqual(['5333']);
  });
  it('価格・年号・数量・小数を拾わない', () => {
    expect(extractCodes('株価は4497円で+94')).toEqual([]);
    expect(extractCodes('2026年11月18日')).toEqual([]);
    expect(extractCodes('300万円、1155千株、4,497円')).toEqual([]);
    expect(extractCodes('PER 13.3倍 2026/11/18 +2.13%')).toEqual([]);
    expect(extractCodes('出来高1234株')).toEqual([]);
  });
  it('全角数字も扱う', () => {
    expect(extractCodes('（５３３３）')).toEqual(['5333']);
    expect(toHalfWidth('２８５Ａ')).toBe('285A');
  });
  it('括弧で囲まれた 20xx はコードとして扱う', () => {
    expect(extractCodes('(2002) 日清製粉')).toEqual(['2002']);
    expect(extractCodes('2002 日清製粉')).toEqual([]);
  });
});
