// J-Quants API V2（JPX総研の個人向けデータ配信）への接続と応答の変換
// 認証は x-api-key ヘッダー。応答は { data: [...], pagination_key? }。
import type { QuoteMetrics } from '../shared/types';
import type { Env } from './env';

export const JQ_BASE = 'https://api.jquants.com/v2';

export class JqError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Row = Record<string, unknown>;

/** ページングをたどって data を全部集める（念のため最大5ページ） */
export async function jqGet(env: Env, path: string, params: Record<string, string>): Promise<Row[]> {
  const base = (env.JQUANTS_BASE || JQ_BASE).replace(/\/$/, '');
  const out: Row[] = [];
  let key = '';
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams(params);
    if (key) q.set('pagination_key', key);
    const res = await fetch(`${base}${path}?${q}`, { headers: { 'x-api-key': env.JQUANTS_API_KEY ?? '', accept: 'application/json' } });
    if (!res.ok) throw new JqError(res.status, `J-Quants ${path} ${res.status}`);
    const json = (await res.json()) as { data?: Row[]; pagination_key?: string };
    out.push(...(json.data ?? []));
    key = json.pagination_key ?? '';
    if (!key) break;
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export interface BarRow {
  day: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  /** 調整前の終値（画面に出す値） */
  rc: number;
}

/** 株価四本値（/equities/bars/daily）→ 分割調整済みの日足。売買がない日（Null）は除く */
export function parseBars(rows: Row[]): BarRow[] {
  const out: BarRow[] = [];
  for (const r of rows) {
    const day = typeof r.Date === 'string' ? r.Date.slice(0, 10) : '';
    const rc = num(r.C);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || rc === null) continue;
    const pick = (adj: string, raw: string) => num(r[adj]) ?? num(r[raw]);
    const o = pick('AdjO', 'O'), h = pick('AdjH', 'H'), l = pick('AdjL', 'L'), c = pick('AdjC', 'C');
    const v = pick('AdjVo', 'Vo') ?? 0;
    if (o === null || h === null || l === null || c === null) continue;
    out.push({ day, o, h: Math.max(h, o, c), l: Math.min(l, o, c), c, v, rc });
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** バリュエーション指標（/equities/valuation）→ 画面の指標。ROEは%、時価総額は円に直す */
export function parseValuation(row: Row | undefined): QuoteMetrics {
  if (!row) return { per: null, perF: null, pbr: null, roe: null, mcap: null };
  const roe = num(row.ROE);
  const mcap = num(row.MktCap);
  return {
    per: num(row.PER),
    perF: num(row.FwdPER),
    pbr: num(row.PBR),
    roe: roe === null ? null : Math.round(roe * 1000) / 10,
    mcap: mcap === null ? null : mcap * 1_000_000,
  };
}

/** 上場銘柄一覧（/equities/master）→ 会社名・市場・業種 */
export function parseIssue(row: Row | undefined): { name: string; market: string; sector: string } | null {
  if (!row || typeof row.CoName !== 'string' || !row.CoName) return null;
  return { name: row.CoName, market: String(row.MktNm ?? ''), sector: String(row.S33Nm ?? '') };
}

export const ymd = (day: string) => day.replace(/-/g, '');
