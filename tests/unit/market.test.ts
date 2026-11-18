import { describe, expect, it } from 'vitest';
import { mockMarket, parseYahoo } from '../../src/worker/market';

describe('parseYahoo', () => {
  it('欠損値を飛ばし、前日比を計算する', () => {
    const m = parseYahoo('5333', {
      chart: {
        result: [
          {
            meta: { shortName: 'NGK INSULATORS' },
            timestamp: [1, 2, 3],
            indicators: { quote: [{ open: [100, null, 110], high: [105, null, 120], low: [95, null, 108], close: [100, null, 110], volume: [10, null, 20] }] },
          },
        ],
      },
    })!;
    expect(m.candles).toHaveLength(2);
    expect(m.price).toBe(110);
    expect(m.change).toBe(10);
    expect(m.changePct).toBe(10);
    expect(m.name).toBe('NGK INSULATORS');
  });
  it('結果がなければ null', () => {
    expect(parseYahoo('5333', { chart: { result: [] } })).toBeNull();
  });
});

describe('mockMarket', () => {
  it('同じ入力なら同じ結果、期間で本数が変わる', () => {
    const now = Date.UTC(2026, 10, 18);
    expect(mockMarket('5333', '1mo', now)).toEqual(mockMarket('5333', '1mo', now));
    expect(mockMarket('5333', '1mo', now).candles).toHaveLength(22);
    expect(mockMarket('5333', '6mo', now).candles).toHaveLength(126);
    for (const c of mockMarket('285A', '3mo', now).candles) {
      expect(c.h).toBeGreaterThanOrEqual(Math.max(c.o, c.c));
      expect(c.l).toBeLessThanOrEqual(Math.min(c.o, c.c));
    }
  });
});
