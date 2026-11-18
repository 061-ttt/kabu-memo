import { describe, expect, it } from 'vitest';
import { addDays, formatDay, isDay, todayJst } from '../../src/shared/day';

describe('day', () => {
  it('JSTで日付が切り替わる', () => {
    expect(todayJst(Date.UTC(2026, 10, 17, 14, 59))).toBe('2026-11-17');
    expect(todayJst(Date.UTC(2026, 10, 17, 15, 0))).toBe('2026-11-18');
  });
  it('日付の加減算と表示', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(formatDay('2026-11-18')).toBe('2026年11月18日(水)');
  });
  it('不正な日付を拒否する', () => {
    expect(isDay('2026-11-18')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-1-1')).toBe(false);
    expect(isDay("2026-11-18' OR 1=1")).toBe(false);
  });
});
