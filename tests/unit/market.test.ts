import { describe, expect, it } from 'vitest';
import { parseBars, parseIssue, parseValuation } from '../../src/worker/jquants';
import { mockQuote, parseYahoo, summarize } from '../../src/worker/market';
import { publishedAt, shouldFetch } from '../../src/worker/quote';

describe('parseBars（J-Quants 株価四本値）', () => {
  it('調整済みの値を使い、売買のない日は除き、日付順に並べる', () => {
    const bars = parseBars([
      { Date: '2026-11-18', Code: '51380', O: 673, H: 673, L: 673, C: 673, Vo: 11200, AdjO: 673, AdjH: 673, AdjL: 673, AdjC: 673, AdjVo: 11200 },
      { Date: '2026-11-14', Code: '51380', O: null, H: null, L: null, C: null, Vo: null },
      { Date: '2026-11-17', Code: '51380', O: 573, H: 573, L: 573, C: 573, Vo: 4200, AdjO: 286.5, AdjH: 286.5, AdjL: 286.5, AdjC: 286.5, AdjVo: 8400 },
    ]);
    expect(bars.map((b) => b.day)).toEqual(['2026-11-17', '2026-11-18']);
    expect(bars[0]).toMatchObject({ c: 286.5, v: 8400, rc: 573 });
  });
});

describe('parseValuation / parseIssue', () => {
  it('ROE は%、時価総額は円に直す', () => {
    expect(parseValuation({ PER: 11.23, FwdPER: 11.3, PBR: 2.92, ROE: 0.2931, MktCap: 1330000 })).toEqual({ per: 11.23, perF: 11.3, pbr: 2.92, roe: 29.3, mcap: 1.33e12 });
    expect(parseValuation(undefined).per).toBeNull();
  });
  it('会社名がなければ null', () => {
    expect(parseIssue({ CoName: '古河電気工業', MktNm: 'プライム', S33Nm: '非鉄金属' })).toEqual({ name: '古河電気工業', market: 'プライム', sector: '非鉄金属' });
    expect(parseIssue({})).toBeNull();
  });
});

describe('summarize', () => {
  it('調整済み終値で前日比%を出し、画面の終値は調整前を使う', () => {
    const s = summarize([['2026-11-17', 1, 1, 1, 1870, 1], ['2026-11-18', 1, 1, 1, 1889.5, 9]], 1889.5);
    expect(s).toMatchObject({ day: '2026-11-18', close: 1889.5, changePct: 1.04, change: 19.4, volume: 9 });
  });
});

describe('取得の判断', () => {
  const day = '2026-11-18';
  const ready = publishedAt(day);
  it('配信時刻は JST 16:30', () => {
    expect(new Date(ready).toISOString()).toBe('2026-11-18T07:30:00.000Z');
  });
  it('未取得なら取る。配信待ちは10分おきに取り直し、配信から6時間後以降に無ければやめる', () => {
    expect(shouldFetch(null, ready, ready)).toBe(true);
    expect(shouldFetch({ fetched_at: ready, status: 200 }, ready + 5 * 60e3, ready)).toBe(false);
    expect(shouldFetch({ fetched_at: ready, status: 200 }, ready + 11 * 60e3, ready)).toBe(true);
    expect(shouldFetch({ fetched_at: ready + 7 * 3600e3, status: 200 }, ready + 9 * 3600e3, ready)).toBe(false);
  });
  it('一時的な失敗は10分後、認証・プランの失敗は6時間後に取り直す', () => {
    expect(shouldFetch({ fetched_at: ready + 8 * 3600e3, status: 429 }, ready + 8 * 3600e3 + 11 * 60e3, ready)).toBe(true);
    expect(shouldFetch({ fetched_at: ready, status: 403 }, ready + 3600e3, ready)).toBe(false);
    expect(shouldFetch({ fetched_at: ready, status: 403 }, ready + 7 * 3600e3, ready)).toBe(true);
  });
});

describe('Yahoo（予備）と模擬', () => {
  it('欠損値を飛ばして日足にする', () => {
    const m = parseYahoo({
      chart: { result: [{ meta: { shortName: 'NGK' }, timestamp: [1763424000, 1763510400], indicators: { quote: [{ open: [100, null], high: [105, null], low: [95, null], close: [100, null], volume: [10, null] }] } }] },
    })!;
    expect(m.bars).toHaveLength(1);
    expect(m.name).toBe('NGK');
    expect(parseYahoo({ chart: { result: [] } })).toBeNull();
  });
  it('模擬データは決定的で、指定日で終わる', () => {
    const a = mockQuote('5333', '2026-11-18');
    expect(a).toEqual(mockQuote('5333', '2026-11-18'));
    expect(a.bars.at(-1)![0]).toBe('2026-11-18');
    for (const b of a.bars) {
      expect(b[2]).toBeGreaterThanOrEqual(Math.max(b[1], b[4]));
      expect(b[3]).toBeLessThanOrEqual(Math.min(b[1], b[4]));
    }
  });
});
