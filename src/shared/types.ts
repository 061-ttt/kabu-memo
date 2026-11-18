export type TaskStatus = 'todo' | 'doing' | 'done';
export type Mark = 'strong' | 'weak' | null;

export const TASK_FLOW: TaskStatus[] = ['todo', 'doing', 'done'];
export const TASK_LABEL: Record<TaskStatus, string> = { todo: '未着手', doing: '進行中', done: '完了' };

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

export interface AnalysisItem {
  code: string;
  name: string;
  theme: string;
  headline: string;
  reaction: string;
  caveat: string;
  mark: Mark;
}

export interface Analysis {
  items: AnalysisItem[];
  tasks: string[];
  model: string;
  at: number;
}

export interface Memo {
  id: string;
  day: string;
  body: string;
  codes: string[];
  analysis: Analysis | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  code: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Metrics {
  per?: number | null;
  perForecast?: number | null;
  pbr?: number | null;
  roe?: number | null;
  marketCap?: number | null; // 円
}

export interface Pick {
  id: string;
  day: string;
  code: string;
  name: string;
  theme: string;
  headline: string;
  reaction: string;
  caveat: string;
  mark: Mark;
  metrics: Metrics;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Candle {
  t: number; // UNIX秒
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Market {
  code: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  candles: Candle[];
  source: string;
  asOf: number;
}

export type Range = '1mo' | '3mo' | '6mo';
export const RANGES: Range[] = ['1mo', '3mo', '6mo'];

export function nextStatus(s: TaskStatus): TaskStatus | null {
  const i = TASK_FLOW.indexOf(s);
  return i < TASK_FLOW.length - 1 ? TASK_FLOW[i + 1] : null;
}

export function prevStatus(s: TaskStatus): TaskStatus | null {
  const i = TASK_FLOW.indexOf(s);
  return i > 0 ? TASK_FLOW[i - 1] : null;
}
