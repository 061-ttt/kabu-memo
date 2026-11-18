// J-Quants のキーがないときの予備（Yahoo Finance の非公式チャートAPI）と、テスト用の模擬データ
import type { Bar, Quote, QuoteMetrics } from '../shared/types';
import { addDays } from '../shared/day';

const CACHE_SECONDS = 300;
export const EMPTY_METRICS: QuoteMetrics = { per: null, perF: null, pbr: null, roe: null, mcap: null };

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { shortName?: string; longName?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
    }>;
  };
}

const JST = 9 * 3600 * 1000;
const dayOf = (sec: number) => new Date(sec * 1000 + JST).toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Yahoo Finance チャートAPIの応答を日足に変換する（欠損は飛ばす） */
export function parseYahoo(json: YahooChart): { name: string; bars: Bar[] } | null {
  const r = json.chart?.result?.[0];
  if (!r || !r.timestamp || !r.indicators?.quote?.[0]) return null;
  const q = r.indicators.quote[0];
  const bars: Bar[] = [];
  r.timestamp.forEach((t, i) => {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) return;
    bars.push([dayOf(t), o, h, l, c, q.volume?.[i] ?? 0]);
  });
  if (!bars.length) return null;
  return { name: r.meta?.longName || r.meta?.shortName || '', bars };
}

/** 日足から終値・前日比を出す */
export function summarize(bars: Bar[], rawClose?: number): Pick<Quote, 'day' | 'close' | 'change' | 'changePct' | 'volume'> {
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  if (!last) return { day: null, close: null, change: null, changePct: null, volume: null };
  const close = rawClose ?? last[4];
  const changePct = prev && prev[4] ? r2(((last[4] - prev[4]) / prev[4]) * 100) : null;
  const dec = close % 1 ? 1 : 0;
  const change = changePct === null ? null : Math.round((close - close / (1 + changePct / 100)) * 10 ** dec) / 10 ** dec;
  return { day: last[0], close, change, changePct, volume: last[5] };
}

const MOCK_NAMES: Record<string, string> = {
  '5333': '日本ガイシ',
  '5801': '古河電気工業',
  '5138': 'Ｒｅｂａｓｅ',
  '6098': 'リクルートホールディングス',
  '7974': '任天堂',
  '285A': 'キオクシアホールディングス',
};

/** テスト用: コードと日付から決定的に作る日足と指標 */
export function mockQuote(code: string, day: string): Quote {
  let seed = [...code].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let price = 1000 + (seed % 9000);
  const days: string[] = [];
  let d = day;
  while (days.length < 90) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) days.unshift(d);
    d = addDays(d, -1);
  }
  const bars: Bar[] = days.map((t) => {
    const o = price;
    const c = Math.max(50, Math.round(o * (1 + (rand() - 0.48) * 0.05)));
    const h = Math.round(Math.max(o, c) * (1 + rand() * 0.015));
    const l = Math.round(Math.min(o, c) * (1 - rand() * 0.015));
    price = c;
    return [t, o, h, l, c, Math.round(200_000 + rand() * 2_000_000)];
  });
  const s = summarize(bars);
  return {
    code, name: MOCK_NAMES[code] ?? `銘柄${code}`, market: 'プライム', sector: '模擬業種', ...s, bars,
    metrics: { per: 12.3, perF: 11.8, pbr: 1.45, roe: 11.9, mcap: (s.close ?? 0) * 1e8 },
    source: 'mock', pending: false, note: '',
  };
}

const memo = new Map<string, { at: number; quote: Quote }>();

export async function yahooQuote(code: string, day: string, ctx: ExecutionContext): Promise<Quote | null> {
  const key = `${code}:${day}`;
  const hot = memo.get(key);
  if (hot && Date.now() - hot.at < CACHE_SECONDS * 1000) return hot.quote;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.T?range=6mo&interval=1d`;
  const cache = caches.default;
  const req = new Request(url);
  let json: YahooChart | null = null;
  const hit = await cache.match(req);
  if (hit) json = (await hit.json()) as YahooChart;
  else {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (soubacho)', accept: 'application/json' } });
    if (!res.ok) return null;
    json = (await res.json()) as YahooChart;
    ctx.waitUntil(cache.put(req, new Response(JSON.stringify(json), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_SECONDS}` } })));
  }
  const parsed = parseYahoo(json);
  if (!parsed) return null;
  const bars = parsed.bars.filter((b) => b[0] <= day).slice(-100);
  const quote: Quote = {
    code, name: parsed.name, market: '', sector: '', ...summarize(bars), bars, metrics: { ...EMPTY_METRICS },
    source: 'yahoo', pending: false, note: '',
  };
  if (memo.size > 300) memo.delete(memo.keys().next().value!);
  memo.set(key, { at: Date.now(), quote });
  return quote;
}
