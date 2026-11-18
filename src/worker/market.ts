import type { Candle, Market, Range } from '../shared/types';
import type { Env } from './env';

const CACHE_SECONDS = 300;

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number; shortName?: string; longName?: string; regularMarketVolume?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
    }>;
    error?: unknown;
  };
}

/** Yahoo Finance チャートAPIの応答を共通形式に変換する */
export function parseYahoo(code: string, json: YahooChart): Market | null {
  const r = json.chart?.result?.[0];
  if (!r || !r.timestamp || !r.indicators?.quote?.[0]) return null;
  const q = r.indicators.quote[0];
  const candles: Candle[] = [];
  r.timestamp.forEach((t, i) => {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) return;
    candles.push({ t, o, h, l, c, v: q.volume?.[i] ?? 0 });
  });
  if (!candles.length) return null;
  return summarize(code, r.meta?.longName || r.meta?.shortName || '', candles, 'yahoo');
}

export function summarize(code: string, name: string, candles: Candle[], source: string): Market {
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const change = prev ? round(last.c - prev.c) : null;
  const changePct = prev && prev.c ? round(((last.c - prev.c) / prev.c) * 100) : null;
  return { code, name, price: last.c, change, changePct, volume: last.v, candles, source, asOf: last.t };
}

const round = (n: number) => Math.round(n * 100) / 100;

const MOCK_NAMES: Record<string, string> = {
  '5333': '日本ガイシ',
  '6098': 'リクルートHD',
  '7974': '任天堂',
  '285A': 'キオクシアHD',
  '8035': '東京エレクトロン',
  '6501': '日立製作所',
};

/** テスト用: コードから決定的に作る疑似ローソク足 */
export function mockMarket(code: string, range: Range, now = Date.now()): Market {
  const n = range === '1mo' ? 22 : range === '3mo' ? 64 : 126;
  let seed = [...code].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let price = 1000 + (seed % 9000);
  const days: number[] = [];
  const d = new Date(now);
  d.setUTCHours(6, 0, 0, 0);
  while (days.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.unshift(Math.floor(d.getTime() / 1000));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const candles = days.map((t) => {
    const o = price;
    const c = Math.max(50, Math.round(o * (1 + (rand() - 0.48) * 0.05)));
    const h = Math.round(Math.max(o, c) * (1 + rand() * 0.015));
    const l = Math.round(Math.min(o, c) * (1 - rand() * 0.015));
    price = c;
    return { t, o, h, l, c, v: Math.round(200_000 + rand() * 2_000_000) };
  });
  return summarize(code, MOCK_NAMES[code] ?? `銘柄${code}`, candles, 'mock');
}

// workers.dev では Cache API が効かないため、同じ実行環境内のメモリにも短時間保持する
const memo = new Map<string, { at: number; market: Market }>();

export async function getMarket(env: Env, code: string, range: Range, ctx: ExecutionContext): Promise<Market | null> {
  if (env.MARKET_MODE === 'mock') return mockMarket(code, range);
  const mkey = `${code}:${range}`;
  const hot = memo.get(mkey);
  if (hot && Date.now() - hot.at < CACHE_SECONDS * 1000) return hot.market;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.T?range=${range}&interval=1d`;
  const cache = caches.default;
  const key = new Request(url);
  const hit = await cache.match(key);
  if (hit) return parseYahoo(code, await hit.json());
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (kabu-memo)', accept: 'application/json' } });
  if (!res.ok) return null;
  const json = (await res.json()) as YahooChart;
  const market = parseYahoo(code, json);
  if (market) {
    if (memo.size > 300) memo.delete(memo.keys().next().value!);
    memo.set(mkey, { at: Date.now(), market });
    ctx.waitUntil(
      cache.put(key, new Response(JSON.stringify(json), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_SECONDS}` } })),
    );
  }
  return market;
}
