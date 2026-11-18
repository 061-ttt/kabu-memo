export type Mark = 'strong' | 'weak' | '';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

/** 話題株1件。画面で編集する項目はすべて data に入れる */
export interface EntryData {
  code: string;
  name: string;
  mark: Mark;
  theme: string;
  headline: string;
  takeaway: string;
  material: string;
  caveat: string;
  srcLabel: string;
  srcUrl: string;
  /** 手入力の株価・指標（自動取得できないときの予備） */
  close: number | '';
  change: number | '';
  changePct: number | '';
  perA: string;
  perF: string;
  pbr: string;
  roe: string;
  mcap: string;
  volume: string;
  /** 手で貼った日足 "YYYY-MM-DD,o,h,l,c,v;..." */
  ohlc: string;
  order: number;
  sample: boolean;
}

export interface Entry {
  id: string;
  day: string;
  data: EntryData;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface NoteIndex {
  name: string;
  value: string;
  chg: string;
}

export interface NoteData {
  general: string;
  us: string;
  jp: string;
  indices: NoteIndex[];
  sample: boolean;
}

export interface Note {
  day: string;
  data: NoteData;
  updatedAt: number;
}

/** [日付, 始値, 高値, 安値, 終値, 出来高]（分割調整済み） */
export type Bar = [string, number, number, number, number, number];

export interface QuoteMetrics {
  per: number | null;
  perF: number | null;
  pbr: number | null;
  /** % */
  roe: number | null;
  /** 円 */
  mcap: number | null;
}

export interface Quote {
  code: string;
  name: string;
  market: string;
  sector: string;
  /** 実際に値がある最後の営業日 */
  day: string | null;
  close: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  bars: Bar[];
  metrics: QuoteMetrics;
  source: 'jquants' | 'yahoo' | 'mock' | 'none';
  /** 指定日の値がまだ配信されていない（大引け後の更新待ち） */
  pending: boolean;
  /** 取得できなかった理由（あれば） */
  note: string;
}

export interface Draft {
  theme: string;
  takeaway: string;
  caveat: string;
  mark: Mark;
  material: string;
}

export interface ScreenRead {
  code: string;
  name: string;
  headline: string;
  material: string;
}
