// 銘柄1つ分の株価・指標を返す。J-Quants の結果は D1 に貯め、同じ取得を短時間に繰り返さない
import { addDays, todayJst } from '../shared/day';
import type { Bar, Quote } from '../shared/types';
import { nowOf, type Env } from './env';
import { JqError, jqGet, parseBars, parseIssue, parseValuation, ymd } from './jquants';
import { EMPTY_METRICS, mockQuote, summarize, yahooQuote } from './market';

const MIN = 60_000;
const HOUR = 60 * MIN;
const JST = 9 * HOUR;
/** 日足が配信される目安（大引け後）。JST 16:30 */
const PUBLISH_MIN = 16 * 60 + 30;

/** その日の日足が配信済みとみなせる時刻（UTCミリ秒） */
export function publishedAt(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) - JST + PUBLISH_MIN * MIN;
}

const isWeekday = (day: string) => {
  const w = new Date(`${day}T00:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6;
};

/**
 * 取りに行くべきかの判定。
 * - まだ一度も取っていない → 取る
 * - 前回の取得が「配信時刻＋6時間」より前で、10分以上たっている → 取り直す（配信待ち）
 * - それ以降に取っても無かった → 休場日などとみなし、取りに行かない
 */
export function shouldFetch(last: { fetched_at: number; status: number } | null, now: number, readyAt: number): boolean {
  if (!last) return true;
  if (last.status === 401 || last.status === 403) return now - last.fetched_at > 6 * HOUR;
  if (last.status !== 200) return now - last.fetched_at > 10 * MIN;
  if (last.fetched_at >= readyAt + 6 * HOUR) return false;
  return now - last.fetched_at > 10 * MIN;
}

async function lastFetch(env: Env, key: string) {
  return env.DB.prepare('SELECT fetched_at, status FROM market_fetch WHERE key = ?').bind(key).first<{ fetched_at: number; status: number }>();
}
async function markFetch(env: Env, key: string, now: number, status: number) {
  await env.DB.prepare('INSERT INTO market_fetch (key, fetched_at, status) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at, status = excluded.status')
    .bind(key, now, status)
    .run();
}

const noteFor = (status: number) =>
  status === 401 ? 'J-Quants の APIキーが通りませんでした' : status === 403 ? '契約プランで取得できないデータです' : status === 429 ? 'J-Quants の回数制限に達しました。少し待つと取れます' : 'J-Quants から取得できませんでした';

export async function getQuote(env: Env, code: string, day: string, ctx: ExecutionContext): Promise<Quote> {
  const now = nowOf(env);
  const today = todayJst(now);
  if (day > today) day = today;
  if (env.MARKET_MODE === 'mock') return mockQuote(code, day);
  if (!env.JQUANTS_API_KEY) {
    const y = await yahooQuote(code, day, ctx).catch(() => null);
    return y ?? emptyQuote(code, 'J-Quants の APIキーが未設定です');
  }

  const from = addDays(day, -150);
  const readBars = async () =>
    (await env.DB.prepare('SELECT day, o, h, l, c, v, rc FROM bars WHERE code = ? AND day BETWEEN ? AND ? ORDER BY day')
      .bind(code, from, day)
      .all<{ day: string; o: number; h: number; l: number; c: number; v: number; rc: number }>()).results;

  let rows = await readBars();
  let note = '';
  const hasDay = rows.some((r) => r.day === day);
  const ready = publishedAt(day);
  const wantDay = !hasDay && isWeekday(day) && now >= ready;
  const wantHistory = rows.length < 40;
  if (wantDay || wantHistory) {
    const key = `bars:${code}:${day}`;
    const last = await lastFetch(env, key);
    if (shouldFetch(last, now, wantDay ? ready : 0)) {
      let status = 200;
      try {
        const parsed = parseBars(await jqGet(env, '/equities/bars/daily', { code, from: ymd(from), to: ymd(day) }));
        if (parsed.length) {
          await env.DB.batch(
            parsed.map((b) =>
              env.DB.prepare(
                `INSERT INTO bars (code, day, o, h, l, c, v, rc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(code, day) DO UPDATE SET o = excluded.o, h = excluded.h, l = excluded.l, c = excluded.c, v = excluded.v, rc = excluded.rc`,
              ).bind(code, b.day, b.o, b.h, b.l, b.c, b.v, b.rc),
            ),
          );
          rows = await readBars();
        } else if (!rows.length) note = 'この期間の日足がありません（無料プランは12週間遅れです）';
      } catch (e) {
        status = e instanceof JqError ? e.status : 599;
        note = noteFor(status);
      }
      await markFetch(env, key, now, status);
    }
  }

  // 会社名（7日ごとに更新）
  let issue = await env.DB.prepare('SELECT name, market, sector, fetched_at FROM issues WHERE code = ?').bind(code).first<{ name: string; market: string; sector: string; fetched_at: number }>();
  if (!issue || now - issue.fetched_at > 7 * 24 * HOUR) {
    const key = `issue:${code}`;
    const last = await lastFetch(env, key);
    if (!last || now - last.fetched_at > 6 * HOUR) {
      let status = 200;
      try {
        const info = parseIssue((await jqGet(env, '/equities/master', { code }))[0]);
        if (info) {
          await env.DB.prepare(
            'INSERT INTO issues (code, name, market, sector, fetched_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET name = excluded.name, market = excluded.market, sector = excluded.sector, fetched_at = excluded.fetched_at',
          )
            .bind(code, info.name, info.market, info.sector, now)
            .run();
          issue = { ...info, fetched_at: now };
        }
      } catch (e) {
        status = e instanceof JqError ? e.status : 599;
      }
      await markFetch(env, key, now, status);
    }
  }

  const bars: Bar[] = rows.slice(-100).map((r) => [r.day, r.o, r.h, r.l, r.c, r.v]);
  const lastRow = rows[rows.length - 1];
  const sum = summarize(bars, lastRow?.rc);

  // バリュエーション指標（その営業日の値。無ければ空のまま覚えておく）
  let metrics = { ...EMPTY_METRICS };
  if (lastRow) {
    const v = await env.DB.prepare('SELECT data FROM valuations WHERE code = ? AND day = ?').bind(code, lastRow.day).first<{ data: string }>();
    if (v) metrics = JSON.parse(v.data);
    else {
      const key = `val:${code}:${lastRow.day}`;
      const last = await lastFetch(env, key);
      if (shouldFetch(last, now, publishedAt(lastRow.day))) {
        let status = 200;
        try {
          const rowsV = await jqGet(env, '/equities/valuation', { code, date: ymd(lastRow.day) });
          if (rowsV.length) {
            metrics = parseValuation(rowsV[0]);
            await env.DB.prepare('INSERT OR REPLACE INTO valuations (code, day, data) VALUES (?, ?, ?)').bind(code, lastRow.day, JSON.stringify(metrics)).run();
          }
        } catch (e) {
          status = e instanceof JqError ? e.status : 599;
        }
        await markFetch(env, key, now, status);
      }
    }
  }

  return {
    code,
    name: issue?.name ?? '',
    market: issue?.market ?? '',
    sector: issue?.sector ?? '',
    ...sum,
    bars,
    metrics,
    source: rows.length ? 'jquants' : 'none',
    pending: !rows.some((r) => r.day === day) && isWeekday(day) && day === today && now < ready,
    note,
  };
}

function emptyQuote(code: string, note: string): Quote {
  return { code, name: '', market: '', sector: '', day: null, close: null, change: null, changePct: null, volume: null, bars: [], metrics: { ...EMPTY_METRICS }, source: 'none', pending: false, note };
}
